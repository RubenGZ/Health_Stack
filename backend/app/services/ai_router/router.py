"""
app/services/ai_router/router.py
==================================
AIRouter — selecciona el provider óptimo por use_case, ejecuta con fallback
automático y emite logs estructurados de trazabilidad.

Flujo por llamada:
  1. Resuelve (primary, fallback, model) desde config.routing[use_case]
  2. Inyecta model_override en el request si no viene ya seteado
  3. Intenta primary con timeout
  4. Si falla con error retriable → intenta fallback (si existe)
  5. Loguea metadata de cada intento (provider, latencia, fallback_triggered)
  6. Si todos fallan → re-lanza AIProviderError con cadena de errores

Errores retriables (trigger fallback):
  - AITimeoutError       — el provider no respondió a tiempo
  - AIRateLimitError     — 429, provider saturado
  - AIProviderError base — 5xx, error de red, respuesta vacía

Errores NO retriables (no fallback):
  - AIInvalidRequestError — 4xx ≠ 429 (bug nuestro, el fallback fallaría igual)
"""

from __future__ import annotations

import copy
import hashlib
import logging
import time
from typing import Any

from app.services.ai_router.base import (
    AIInvalidRequestError,
    AIProvider,
    AIProviderError,
    AIRateLimitError,
    AITimeoutError,
)
from app.services.ai_router.config import AIRouterSettings
from app.services.ai_router.schemas import AIRequest, AIResponse, AIUseCase

logger = logging.getLogger(__name__)


def _hash_user_id(user_id: str | None) -> str | None:
    """SHA-256 truncado del user_id para logs — nunca el ID raw (RGPD)."""
    if not user_id:
        return None
    return hashlib.sha256(user_id.encode()).hexdigest()[:12]


def _is_retriable(exc: AIProviderError) -> bool:
    """
    True si el error justifica intentar el proveedor fallback.
    AIInvalidRequestError nunca es retriable — es un bug en el request.
    """
    return not isinstance(exc, AIInvalidRequestError)


class AIRouter:
    """
    Router multi-provider con fallback automático.

    Inicialización (una vez en el lifespan de FastAPI):
        settings = AIRouterSettings()
        providers = {
            "groq": GroqProvider(settings.get_groq_key()),
            "gemini": GeminiProvider(settings.get_gemini_key()),
            "cerebras": CerebrasProvider(settings.get_cerebras_key()),
        }
        router = AIRouter(settings=settings, providers=providers)

    Uso en un endpoint:
        response = await router.call(
            use_case=AIUseCase.REALTIME_COACH,
            request=AIRequest(messages=[...], max_tokens=60, timeout_s=8.0),
        )
        # response.content, response.provider_used, response.fallback_triggered
    """

    def __init__(
        self,
        settings: AIRouterSettings,
        providers: dict[str, AIProvider],
    ) -> None:
        self._settings = settings
        self._providers = providers

        # Ajustar nivel de log según configuración
        log_level = getattr(logging, settings.ai_router_log_level.upper(), logging.INFO)
        logger.setLevel(log_level)

    async def call(
        self,
        use_case: AIUseCase,
        request: AIRequest,
        *,
        user_id: str | None = None,
    ) -> AIResponse:
        """
        Ejecuta la llamada al provider óptimo para el use_case dado.

        Args:
            use_case:  identifica el contexto (coach, chat, insights…)
            request:   payload normalizado con messages, tokens, timeout…
            user_id:   opcional — se hashea antes de loguearse (RGPD)

        Returns:
            AIResponse con content + metadatos de trazabilidad

        Raises:
            AIInvalidRequestError  — request malformado (no se reintentó)
            AIProviderError        — todos los providers fallaron
        """
        rule = self._settings.routing.get(use_case)
        if rule is None:
            raise AIProviderError(
                "router",
                f"No hay RoutingRule para el use_case '{use_case}'",
            )

        primary_name = rule.primary
        fallback_name = rule.fallback
        fallback_enabled = self._settings.ai_router_fallback_enabled

        # ── Intento primario ─────────────────────────────────────────────────
        primary_req = self._inject_model(request, rule.primary_model)
        primary_error: AIProviderError | None = None

        primary_resp = await self._attempt(
            provider_name=primary_name,
            request=primary_req,
            use_case=use_case,
            user_id=user_id,
            is_fallback=False,
        )
        if isinstance(primary_resp, AIResponse):
            return primary_resp

        primary_error = primary_resp  # type: ignore[assignment]

        # ── Decidir si lanzar fallback ────────────────────────────────────────
        if not _is_retriable(primary_error):
            logger.warning(
                "ai_router.no_fallback",
                extra={
                    "event": "ai_router.no_fallback",
                    "use_case": use_case.value,
                    "provider": primary_name,
                    "reason": "AIInvalidRequestError — request malformado, fallback omitido",
                    "error": str(primary_error),
                },
            )
            raise primary_error

        if not fallback_enabled or not fallback_name or not rule.fallback_model:
            logger.error(
                "ai_router.all_failed",
                extra={
                    "event": "ai_router.all_failed",
                    "use_case": use_case.value,
                    "primary": primary_name,
                    "fallback": "disabled_or_not_configured",
                    "error": str(primary_error),
                },
            )
            raise primary_error

        # ── Intento fallback ─────────────────────────────────────────────────
        fallback_req = self._inject_model(request, rule.fallback_model)
        fallback_resp = await self._attempt(
            provider_name=fallback_name,
            request=fallback_req,
            use_case=use_case,
            user_id=user_id,
            is_fallback=True,
        )

        if isinstance(fallback_resp, AIResponse):
            fallback_resp.fallback_triggered = True
            return fallback_resp

        fallback_error = fallback_resp
        logger.error(
            "ai_router.all_failed",
            extra={
                "event": "ai_router.all_failed",
                "use_case": use_case.value,
                "primary": primary_name,
                "primary_error": str(primary_error),
                "fallback": fallback_name,
                "fallback_error": str(fallback_error),
            },
        )
        # Lanzar el error del fallback (el más reciente)
        raise fallback_error  # type: ignore[misc]

    async def _attempt(
        self,
        provider_name: str,
        request: AIRequest,
        use_case: AIUseCase,
        user_id: str | None,
        is_fallback: bool,
    ) -> AIResponse | AIProviderError:
        """
        Intenta una llamada a un provider concreto.
        Devuelve AIResponse en éxito, AIProviderError en fallo.
        Emite log estructurado en ambos casos.
        """
        provider = self._providers.get(provider_name)
        if provider is None:
            err = AIProviderError(
                provider_name,
                f"Provider '{provider_name}' no registrado en el router",
            )
            self._log_attempt(
                use_case=use_case,
                provider=provider_name,
                model=request.model_override or "unknown",
                latency_ms=0,
                success=False,
                fallback_triggered=is_fallback,
                error=str(err),
                user_id=user_id,
            )
            return err

        t0 = time.monotonic()
        try:
            response = await provider.complete(request)
            latency_ms = int((time.monotonic() - t0) * 1000)
            self._log_attempt(
                use_case=use_case,
                provider=provider_name,
                model=response.model_used,
                latency_ms=latency_ms,
                success=True,
                fallback_triggered=is_fallback,
                tokens_used=response.tokens_used,
                user_id=user_id,
            )
            return response

        except AIProviderError as exc:
            latency_ms = int((time.monotonic() - t0) * 1000)
            self._log_attempt(
                use_case=use_case,
                provider=provider_name,
                model=request.model_override or "unknown",
                latency_ms=latency_ms,
                success=False,
                fallback_triggered=is_fallback,
                error=str(exc),
                user_id=user_id,
            )
            return exc

    @staticmethod
    def _inject_model(request: AIRequest, model: str) -> AIRequest:
        """
        Devuelve una copia del request con model_override seteado,
        respetando cualquier override que ya traiga el llamador.
        """
        if request.model_override:
            return request  # el llamador tiene preferencia
        # Copia superficial con model_override inyectado
        data = request.model_dump()
        data["model_override"] = model
        return AIRequest(**data)

    @staticmethod
    def _log_attempt(
        *,
        use_case: AIUseCase,
        provider: str,
        model: str,
        latency_ms: int,
        success: bool,
        fallback_triggered: bool,
        tokens_used: int | None = None,
        error: str | None = None,
        user_id: str | None = None,
    ) -> None:
        """
        Log estructurado (JSON-friendly via python-json-logger o similar).
        NUNCA incluye contenido de messages ni de la respuesta (RGPD).
        """
        extra: dict[str, Any] = {
            "event": "ai_router.call",
            "use_case": use_case.value,
            "provider_used": provider,
            "model_used": model,
            "latency_ms": latency_ms,
            "success": success,
            "fallback_triggered": fallback_triggered,
        }
        if tokens_used is not None:
            extra["tokens_used"] = tokens_used
        if error:
            extra["error"] = error[:200]  # truncar para no saturar logs
        if user_id:
            extra["user_id_hash"] = _hash_user_id(user_id)

        if success:
            logger.info("ai_router.call", extra=extra)
        else:
            logger.warning("ai_router.call.failed", extra=extra)
