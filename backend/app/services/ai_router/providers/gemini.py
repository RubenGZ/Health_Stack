"""
app/services/ai_router/providers/gemini.py
============================================
Provider de Google Gemini vía la API OpenAI-compatible de Google AI Studio.

Base URL: https://generativelanguage.googleapis.com/v1beta/openai/
Modelos disponibles: gemini-2.5-flash (rápido), gemini-2.5-pro (razonamiento)

No requiere el SDK de Google — usa httpx directamente sobre el endpoint
compatible con OpenAI, igual que Groq. Esto nos permite intercambiar
providers sin cambiar el patrón de código.

Soporta visión: sí (preparado para food-vision en PR siguiente).

PRIVACIDAD: El free tier de Google AI Studio puede usar los prompts para
mejorar sus modelos según sus TOS vigentes. Ver PRIVACY.md en este módulo.
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

_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"
_DEFAULT_MODEL   = "gemini-2.5-flash"


class GeminiProvider(AIProvider):
    """
    Wrapper de Google Gemini sobre el endpoint REST compatible con OpenAI.

    El router inyecta el modelo a usar vía request.model_override
    (gemini-2.5-flash para respuestas rápidas, gemini-2.5-pro para
    razonamiento complejo). El provider no decide el modelo — ese es
    trabajo del router y la RoutingRule.

    supports_vision = True: preparado para aceptar imágenes en content
    (multimodal), necesario para food-vision en PR siguiente.
    """

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    @property
    def name(self) -> str:
        return "gemini"

    @property
    def supports_vision(self) -> bool:
        return True

    async def complete(self, request: AIRequest) -> AIResponse:
        if not self._api_key:
            raise AIProviderError(self.name, "API key no configurada")

        model = request.model_override or _DEFAULT_MODEL

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
                    f"{_GEMINI_BASE_URL}/chat/completions",
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
                    f"{_GEMINI_BASE_URL}/models",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                )
                return resp.status_code == 200
        except Exception:
            return False
