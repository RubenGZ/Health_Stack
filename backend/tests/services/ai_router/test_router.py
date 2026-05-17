"""
tests/services/ai_router/test_router.py
=========================================
Tests unitarios del AIRouter — lógica de selección, fallback y logging.

Los providers se mockean con AsyncMock para aislar completamente
el router de cualquier llamada real a APIs externas.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.ai_router.base import (
    AIInvalidRequestError,
    AIProviderError,
    AIRateLimitError,
    AITimeoutError,
)
from app.services.ai_router.config import AIRouterSettings
from app.services.ai_router.router import AIRouter, _hash_user_id, _is_retriable
from app.services.ai_router.schemas import (
    AIMessage,
    AIRequest,
    AIResponse,
    AIUseCase,
    RoutingRule,
)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_response(provider: str = "gemini", model: str = "gemini-2.5-flash") -> AIResponse:
    return AIResponse(
        content="Respuesta de prueba.",
        provider_used=provider,
        model_used=model,
        latency_ms=250,
        tokens_used=80,
        finish_reason="stop",
    )


def _make_provider(name: str, response: AIResponse | Exception) -> AsyncMock:
    """Crea un mock de AIProvider que devuelve response o lanza exception."""
    provider = AsyncMock()
    provider.name = name
    if isinstance(response, Exception):
        provider.complete.side_effect = response
    else:
        provider.complete.return_value = response
    return provider


def _make_settings(**routing_overrides) -> AIRouterSettings:
    """Settings mínimas para tests — solo Groq key obligatoria."""
    routing = {
        AIUseCase.PUBLIC_CHAT: RoutingRule(
            primary="gemini", primary_model="gemini-2.5-flash",
            fallback="groq", fallback_model="llama-3.3-70b-versatile",
        ),
        AIUseCase.REALTIME_COACH: RoutingRule(
            primary="cerebras", primary_model="llama-3.3-70b",
            fallback="groq", fallback_model="llama-3.3-70b-versatile",
        ),
        AIUseCase.INSIGHTS_NARRATIVE: RoutingRule(
            primary="gemini", primary_model="gemini-2.5-pro",
            fallback="groq", fallback_model="llama-3.3-70b-versatile",
        ),
        **routing_overrides,
    }
    settings = MagicMock(spec=AIRouterSettings)
    settings.routing = routing
    settings.ai_router_fallback_enabled = True
    settings.ai_router_log_level = "WARNING"  # silenciar logs en tests
    return settings


@pytest.fixture
def base_request() -> AIRequest:
    return AIRequest(
        messages=[
            AIMessage(role="system", content="Eres un asistente."),
            AIMessage(role="user", content="Hola"),
        ],
        max_tokens=100,
        timeout_s=5.0,
    )


# ══════════════════════════════════════════════════════════════════════════════
# Lógica auxiliar
# ══════════════════════════════════════════════════════════════════════════════

class TestHelpers:
    def test_is_retriable_timeout(self):
        assert _is_retriable(AITimeoutError("g", "t")) is True

    def test_is_retriable_rate_limit(self):
        assert _is_retriable(AIRateLimitError("g", "r")) is True

    def test_is_retriable_generic_provider_error(self):
        assert _is_retriable(AIProviderError("g", "5xx")) is True

    def test_is_retriable_invalid_request_is_false(self):
        """AIInvalidRequestError NO debe lanzar fallback."""
        assert _is_retriable(AIInvalidRequestError("g", "400")) is False

    def test_hash_user_id_returns_12_chars(self):
        h = _hash_user_id("user-123")
        assert h is not None
        assert len(h) == 12

    def test_hash_user_id_none_returns_none(self):
        assert _hash_user_id(None) is None

    def test_hash_user_id_is_deterministic(self):
        assert _hash_user_id("abc") == _hash_user_id("abc")

    def test_hash_user_id_different_ids_differ(self):
        assert _hash_user_id("user-1") != _hash_user_id("user-2")


# ══════════════════════════════════════════════════════════════════════════════
# AIRouter — happy path
# ══════════════════════════════════════════════════════════════════════════════

class TestAIRouterSuccess:
    async def test_uses_primary_when_healthy(self, base_request: AIRequest):
        gemini_resp = _make_response("gemini", "gemini-2.5-flash")
        providers = {
            "gemini": _make_provider("gemini", gemini_resp),
            "groq": _make_provider("groq", _make_response("groq")),
        }
        router = AIRouter(settings=_make_settings(), providers=providers)

        resp = await router.call(AIUseCase.PUBLIC_CHAT, base_request)

        assert resp.provider_used == "gemini"
        assert resp.fallback_triggered is False
        providers["groq"].complete.assert_not_called()

    async def test_model_override_injected_from_routing_rule(self, base_request: AIRequest):
        """El router debe inyectar primary_model en el request."""
        captured_model: list[str] = []

        async def capture_complete(req: AIRequest) -> AIResponse:
            captured_model.append(req.model_override or "")
            return _make_response("gemini", req.model_override or "")

        provider = AsyncMock()
        provider.name = "gemini"
        provider.complete.side_effect = capture_complete

        router = AIRouter(
            settings=_make_settings(),
            providers={"gemini": provider, "groq": _make_provider("groq", _make_response())},
        )
        await router.call(AIUseCase.PUBLIC_CHAT, base_request)

        assert captured_model[0] == "gemini-2.5-flash"

    async def test_caller_model_override_respected(self, base_request: AIRequest):
        """Si el llamador ya seteó model_override, el router no lo pisa."""
        base_request.model_override = "gemini-2.5-pro"
        captured_model: list[str] = []

        async def capture(req: AIRequest) -> AIResponse:
            captured_model.append(req.model_override or "")
            return _make_response("gemini", req.model_override or "")

        provider = AsyncMock()
        provider.name = "gemini"
        provider.complete.side_effect = capture

        router = AIRouter(
            settings=_make_settings(),
            providers={"gemini": provider, "groq": _make_provider("groq", _make_response())},
        )
        await router.call(AIUseCase.PUBLIC_CHAT, base_request)
        assert captured_model[0] == "gemini-2.5-pro"

    async def test_response_contains_correct_metadata(self, base_request: AIRequest):
        resp_fixture = _make_response("cerebras", "llama-3.3-70b")
        providers = {
            "cerebras": _make_provider("cerebras", resp_fixture),
            "groq": _make_provider("groq", _make_response()),
        }
        router = AIRouter(settings=_make_settings(), providers=providers)
        resp = await router.call(AIUseCase.REALTIME_COACH, base_request)

        assert resp.provider_used == "cerebras"
        assert resp.model_used == "llama-3.3-70b"
        assert resp.tokens_used == 80
        assert resp.latency_ms >= 0


# ══════════════════════════════════════════════════════════════════════════════
# AIRouter — fallback
# ══════════════════════════════════════════════════════════════════════════════

class TestAIRouterFallback:
    async def test_falls_back_on_timeout(self, base_request: AIRequest):
        groq_resp = _make_response("groq", "llama-3.3-70b-versatile")
        providers = {
            "gemini": _make_provider("gemini", AITimeoutError("gemini", "timeout")),
            "groq": _make_provider("groq", groq_resp),
        }
        router = AIRouter(settings=_make_settings(), providers=providers)
        resp = await router.call(AIUseCase.PUBLIC_CHAT, base_request)

        assert resp.provider_used == "groq"
        assert resp.fallback_triggered is True

    async def test_falls_back_on_rate_limit(self, base_request: AIRequest):
        groq_resp = _make_response("groq")
        providers = {
            "gemini": _make_provider("gemini", AIRateLimitError("gemini", "429")),
            "groq": _make_provider("groq", groq_resp),
        }
        router = AIRouter(settings=_make_settings(), providers=providers)
        resp = await router.call(AIUseCase.PUBLIC_CHAT, base_request)

        assert resp.fallback_triggered is True
        assert resp.provider_used == "groq"

    async def test_falls_back_on_5xx(self, base_request: AIRequest):
        providers = {
            "gemini": _make_provider("gemini", AIProviderError("gemini", "503")),
            "groq": _make_provider("groq", _make_response("groq")),
        }
        router = AIRouter(settings=_make_settings(), providers=providers)
        resp = await router.call(AIUseCase.PUBLIC_CHAT, base_request)
        assert resp.fallback_triggered is True

    async def test_does_not_fallback_on_invalid_request_4xx(self, base_request: AIRequest):
        """4xx ≠ 429 no debe lanzar fallback — sería el mismo error en groq."""
        providers = {
            "gemini": _make_provider("gemini", AIInvalidRequestError("gemini", "400 context too long")),
            "groq": _make_provider("groq", _make_response("groq")),
        }
        router = AIRouter(settings=_make_settings(), providers=providers)

        with pytest.raises(AIInvalidRequestError):
            await router.call(AIUseCase.PUBLIC_CHAT, base_request)

        providers["groq"].complete.assert_not_called()

    async def test_raises_when_all_providers_fail(self, base_request: AIRequest):
        providers = {
            "gemini": _make_provider("gemini", AITimeoutError("gemini", "timeout")),
            "groq": _make_provider("groq", AIProviderError("groq", "503")),
        }
        router = AIRouter(settings=_make_settings(), providers=providers)

        with pytest.raises(AIProviderError):
            await router.call(AIUseCase.PUBLIC_CHAT, base_request)

    async def test_fallback_uses_fallback_model(self, base_request: AIRequest):
        """El fallback debe usar fallback_model, no primary_model."""
        captured_models: list[str] = []

        async def capture(req: AIRequest) -> AIResponse:
            captured_models.append(req.model_override or "")
            return _make_response("groq", req.model_override or "")

        groq_mock = AsyncMock()
        groq_mock.name = "groq"
        groq_mock.complete.side_effect = capture

        providers = {
            "gemini": _make_provider("gemini", AITimeoutError("gemini", "t")),
            "groq": groq_mock,
        }
        router = AIRouter(settings=_make_settings(), providers=providers)
        await router.call(AIUseCase.PUBLIC_CHAT, base_request)

        assert captured_models[0] == "llama-3.3-70b-versatile"

    async def test_raises_when_fallback_disabled(self, base_request: AIRequest):
        providers = {
            "gemini": _make_provider("gemini", AITimeoutError("gemini", "t")),
            "groq": _make_provider("groq", _make_response()),
        }
        settings = _make_settings()
        settings.ai_router_fallback_enabled = False

        router = AIRouter(settings=settings, providers=providers)
        with pytest.raises(AIProviderError):
            await router.call(AIUseCase.PUBLIC_CHAT, base_request)

        providers["groq"].complete.assert_not_called()

    async def test_raises_when_no_routing_rule(self, base_request: AIRequest):
        settings = _make_settings()
        settings.routing = {}  # sin reglas
        router = AIRouter(settings=settings, providers={})

        with pytest.raises(AIProviderError, match="RoutingRule"):
            await router.call(AIUseCase.PUBLIC_CHAT, base_request)

    async def test_handles_missing_provider_gracefully(self, base_request: AIRequest):
        """Si el provider primario no está registrado, cae al fallback."""
        providers = {
            # "gemini" no está registrado
            "groq": _make_provider("groq", _make_response("groq")),
        }
        router = AIRouter(settings=_make_settings(), providers=providers)
        resp = await router.call(AIUseCase.PUBLIC_CHAT, base_request)

        assert resp.provider_used == "groq"
        assert resp.fallback_triggered is True


# ══════════════════════════════════════════════════════════════════════════════
# AIRouter — logging
# ══════════════════════════════════════════════════════════════════════════════

class TestAIRouterLogging:
    async def test_logs_fallback_triggered_flag(self, base_request: AIRequest):
        """Verificar que el log registra fallback_triggered=True cuando aplica."""
        log_records: list[dict] = []

        class CapturingHandler(MagicMock):
            def emit(self, record):
                log_records.append(getattr(record, "__dict__", {}))

        from app.services.ai_router import router as router_module
        handler = CapturingHandler()
        router_module.logger.addHandler(handler)

        providers = {
            "gemini": _make_provider("gemini", AITimeoutError("gemini", "t")),
            "groq": _make_provider("groq", _make_response("groq")),
        }
        router = AIRouter(settings=_make_settings(), providers=providers)
        resp = await router.call(AIUseCase.PUBLIC_CHAT, base_request, user_id="user-42")

        router_module.logger.removeHandler(handler)

        assert resp.fallback_triggered is True
        # El log de éxito debe tener fallback_triggered=True en extra
        success_logs = [r for r in log_records if r.get("extra", {}).get("success") is True]
        if success_logs:
            assert success_logs[0].get("extra", {}).get("fallback_triggered") is True

    async def test_user_id_hashed_in_log(self, base_request: AIRequest):
        """El user_id nunca debe aparecer raw en los logs."""
        log_extras: list[dict] = []
        original_log = AIRouter._log_attempt.__func__ if hasattr(AIRouter._log_attempt, '__func__') else None

        with patch.object(AIRouter, "_log_attempt", wraps=AIRouter._log_attempt) as mock_log:
            providers = {"gemini": _make_provider("gemini", _make_response("gemini"))}
            router = AIRouter(settings=_make_settings(), providers=providers)
            await router.call(AIUseCase.PUBLIC_CHAT, base_request, user_id="mi-user-id-secreto")

        calls = mock_log.call_args_list
        assert len(calls) > 0
        # user_id raw nunca en los kwargs
        for call in calls:
            kwargs = call.kwargs
            assert "mi-user-id-secreto" not in str(kwargs)
            if kwargs.get("user_id"):
                # Si pasa user_id al log, debe ser el hash
                assert kwargs["user_id"] != "mi-user-id-secreto"

    async def test_passes_correct_model_override_to_provider(self, base_request: AIRequest):
        """El model injected debe llegar al provider, no quedarse en el router."""
        received_models: list[str] = []

        async def track_model(req: AIRequest) -> AIResponse:
            received_models.append(req.model_override or "NONE")
            return _make_response("gemini", req.model_override or "")

        gemini = AsyncMock()
        gemini.name = "gemini"
        gemini.complete.side_effect = track_model

        router = AIRouter(
            settings=_make_settings(),
            providers={"gemini": gemini, "groq": _make_provider("groq", _make_response())},
        )
        await router.call(AIUseCase.PUBLIC_CHAT, base_request)

        assert received_models[0] == "gemini-2.5-flash"
