"""
app/services/ai_router/providers/groq.py
==========================================
Provider de Groq — extrae y normaliza la lógica que antes estaba dispersa
en chat/router.py, ai_coach/service.py y ai_insights/service.py.

API: OpenAI-compatible REST sobre HTTPS.
Modelo por defecto: llama-3.3-70b-versatile
"""

from __future__ import annotations

import logging
import time

import httpx

from app.services.ai_router.base import (
    AIInvalidRequestError,
    AIProvider,
    AIProviderError,
    AIRateLimitError,
    AITimeoutError,
)
from app.services.ai_router.schemas import AIRequest, AIResponse

logger = logging.getLogger(__name__)

_GROQ_BASE_URL = "https://api.groq.com/openai/v1"
_DEFAULT_MODEL  = "llama-3.3-70b-versatile"


class GroqProvider(AIProvider):
    """
    Wrapper de Groq sobre la API REST compatible con OpenAI.

    Distingue correctamente entre:
    - Timeout → AITimeoutError (siempre trigger fallback)
    - 429     → AIRateLimitError (trigger fallback)
    - 4xx ≠429→ AIInvalidRequestError (NO trigger fallback — bug nuestro)
    - 5xx/red → AIProviderError genérico (trigger fallback)
    """

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    @property
    def name(self) -> str:
        return "groq"

    @property
    def supports_vision(self) -> bool:
        return False

    async def complete(self, request: AIRequest) -> AIResponse:
        if not self._api_key:
            raise AIProviderError(self.name, "API key no configurada")

        model = request.model_override or _DEFAULT_MODEL

        # Construir payload compatible con OpenAI
        payload: dict = {
            "model": model,
            "messages": [{"role": m.role, "content": m.content} for m in request.messages],
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
        }
        if request.response_format == "json_object":
            payload["response_format"] = {"type": "json_object"}

        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=request.timeout_s) as client:
                resp = await client.post(
                    f"{_GROQ_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )

                if resp.status_code == 429:
                    raise AIRateLimitError(
                        self.name,
                        f"429 Too Many Requests: {resp.text[:200]}",
                    )
                if 400 <= resp.status_code < 500:
                    raise AIInvalidRequestError(
                        self.name,
                        f"HTTP {resp.status_code}: {resp.text[:200]}",
                    )
                if resp.status_code >= 500:
                    raise AIProviderError(
                        self.name,
                        f"HTTP {resp.status_code}: {resp.text[:200]}",
                    )

                resp.raise_for_status()
                data = resp.json()

        except AIProviderError:
            raise
        except httpx.TimeoutException as exc:
            raise AITimeoutError(
                self.name,
                f"Timeout después de {request.timeout_s}s",
                original=exc,
            ) from exc
        except httpx.RequestError as exc:
            raise AIProviderError(
                self.name,
                f"Error de red ({type(exc).__name__}): {exc}",
                original=exc,
            ) from exc

        latency_ms = int((time.monotonic() - t0) * 1000)

        choices = data.get("choices") or []
        if not choices:
            raise AIProviderError(self.name, "Respuesta sin choices")

        choice = choices[0]
        content = choice.get("message", {}).get("content", "")
        if not content:
            raise AIProviderError(self.name, "Respuesta con content vacío")

        usage = data.get("usage", {})

        return AIResponse(
            content=content,
            provider_used=self.name,
            model_used=model,
            latency_ms=latency_ms,
            tokens_used=usage.get("total_tokens"),
            finish_reason=choice.get("finish_reason", "stop"),
        )

    async def health_check(self) -> bool:
        if not self._api_key:
            return False
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{_GROQ_BASE_URL}/models",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                )
                return resp.status_code == 200
        except Exception:
            return False
