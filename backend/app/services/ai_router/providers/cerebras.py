"""
app/services/ai_router/providers/cerebras.py
==============================================
Provider de Cerebras Cloud vía cerebras-cloud-sdk.

Cerebras usa wafers de silicio completos en lugar de GPUs particionadas,
lo que entrega ~2000 tokens/s — ideal para latencia mínima en el coach
de fuerza (REALTIME_COACH) donde el usuario espera respuesta entre series.

SDK: cerebras-cloud-sdk (PyPI)
Modelo: llama-3.3-70b (versión optimizada para wafer-scale)
Free tier: ~1M tokens/mes sin tarjeta.

No soporta visión — supports_vision = False.

NOTA: El SDK de Cerebras es síncrono. Lo ejecutamos en un thread pool
(asyncio.to_thread) para no bloquear el event loop de FastAPI.

PRIVACIDAD: El free tier de Cerebras puede usar los prompts para mejorar
sus modelos según sus TOS. Ver PRIVACY.md.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING

from app.services.ai_router.base import (
    AIInvalidRequestError,
    AIProvider,
    AIProviderError,
    AIRateLimitError,
    AITimeoutError,
)
from app.services.ai_router.schemas import AIRequest, AIResponse

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

_DEFAULT_MODEL = "llama-3.3-70b"


def _import_cerebras():
    """
    Importación lazy del SDK de Cerebras para evitar crash al arrancar
    si el paquete no está instalado (entorno sin Cerebras key).
    """
    try:
        from cerebras.cloud.sdk import Cerebras, APIStatusError, APITimeoutError  # noqa: F401
        return Cerebras, APIStatusError, APITimeoutError
    except ImportError as exc:
        raise ImportError(
            "cerebras-cloud-sdk no está instalado. "
            "Añadir 'cerebras-cloud-sdk' a requirements.txt y reinstalar."
        ) from exc


class CerebrasProvider(AIProvider):
    """
    Wrapper del SDK de Cerebras Cloud.

    El SDK es síncrono → usamos asyncio.to_thread() para la llamada
    de red, evitando bloquear el event loop de FastAPI.

    Timeout: se pasa como `timeout` al constructor del cliente por llamada.
    Si el SDK lanza APITimeoutError → AITimeoutError (trigger fallback).
    Si el SDK lanza APIStatusError 429 → AIRateLimitError (trigger fallback).
    Si el SDK lanza APIStatusError 4xx ≠ 429 → AIInvalidRequestError (NO fallback).
    Cualquier otro error → AIProviderError (trigger fallback).
    """

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    @property
    def name(self) -> str:
        return "cerebras"

    @property
    def supports_vision(self) -> bool:
        return False

    def _call_sync(self, request: AIRequest, model: str) -> dict:
        """
        Llamada síncrona al SDK de Cerebras.
        Se ejecuta en un thread pool desde complete().
        """
        Cerebras, APIStatusError, APITimeoutError = _import_cerebras()

        client = Cerebras(
            api_key=self._api_key,
            timeout=request.timeout_s,
        )

        messages = [{"role": m.role, "content": m.content} for m in request.messages]

        kwargs: dict = {
            "model": model,
            "messages": messages,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
        }

        try:
            response = client.chat.completions.create(**kwargs)
        except APITimeoutError as exc:
            raise AITimeoutError(
                "cerebras",
                f"Timeout después de {request.timeout_s}s",
                original=exc,
            ) from exc
        except APIStatusError as exc:
            status = getattr(exc, "status_code", None)
            if status == 429:
                raise AIRateLimitError(
                    "cerebras",
                    f"429 Too Many Requests: {exc}",
                    original=exc,
                ) from exc
            if status is not None and 400 <= status < 500:
                raise AIInvalidRequestError(
                    "cerebras",
                    f"HTTP {status}: {exc}",
                    original=exc,
                ) from exc
            raise AIProviderError(
                "cerebras",
                f"API error ({type(exc).__name__}): {exc}",
                original=exc,
            ) from exc
        except Exception as exc:
            raise AIProviderError(
                "cerebras",
                f"Error inesperado ({type(exc).__name__}): {exc}",
                original=exc,
            ) from exc

        # Normalizar a dict para que complete() pueda procesarlo
        choice = response.choices[0]
        usage = getattr(response, "usage", None)

        return {
            "content": choice.message.content or "",
            "finish_reason": choice.finish_reason or "stop",
            "tokens_used": getattr(usage, "total_tokens", None),
        }

    async def complete(self, request: AIRequest) -> AIResponse:
        if not self._api_key:
            raise AIProviderError(self.name, "API key no configurada")

        model = request.model_override or _DEFAULT_MODEL

        t0 = time.monotonic()

        # Ejecutar el SDK síncrono en un thread para no bloquear el event loop
        try:
            result = await asyncio.to_thread(self._call_sync, request, model)
        except AIProviderError:
            raise
        except asyncio.CancelledError:
            raise AITimeoutError(self.name, "Task cancelada por el event loop")
        except Exception as exc:
            raise AIProviderError(
                self.name,
                f"Error en thread pool ({type(exc).__name__}): {exc}",
                original=exc,
            ) from exc

        latency_ms = int((time.monotonic() - t0) * 1000)

        content = result["content"]
        if not content:
            raise AIProviderError(self.name, "Respuesta con content vacío")

        return AIResponse(
            content=content,
            provider_used=self.name,
            model_used=model,
            latency_ms=latency_ms,
            tokens_used=result.get("tokens_used"),
            finish_reason=result.get("finish_reason", "stop"),
        )

    async def health_check(self) -> bool:
        if not self._api_key:
            return False
        try:
            Cerebras, _, _ = _import_cerebras()
            # Llamada mínima: listar modelos (síncrona, en thread)
            def _check():
                client = Cerebras(api_key=self._api_key, timeout=5.0)
                client.models.list()
                return True

            return await asyncio.to_thread(_check)
        except Exception:
            return False
