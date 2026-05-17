"""
tests/services/ai_router/test_schemas.py
==========================================
Tests unitarios para schemas.py y base.py del módulo ai_router.

Sin llamadas reales a APIs — solo valida construcción de objetos Pydantic,
validadores personalizados y jerarquía de excepciones.
"""

from __future__ import annotations

from pydantic import ValidationError
import pytest

from app.services.ai_router.base import (
    AIInvalidRequestError,
    AIProviderError,
    AIRateLimitError,
    AITimeoutError,
)
from app.services.ai_router.schemas import (
    AIMessage,
    AIRequest,
    AIResponse,
    AIUseCase,
    RoutingRule,
)

# ── AIUseCase ─────────────────────────────────────────────────────────────────

class TestAIUseCase:
    def test_all_expected_values_exist(self):
        """El enum debe contener exactamente los 6 use cases documentados."""
        expected = {
            "public_chat",
            "realtime_coach",
            "insights_narrative",
            "injury_risk",
            "weekly_goals",
            "food_vision",
        }
        actual = {uc.value for uc in AIUseCase}
        assert actual == expected

    def test_enum_is_str_subclass(self):
        """AIUseCase debe ser usable como string (para serialización JSON)."""
        assert isinstance(AIUseCase.PUBLIC_CHAT, str)
        assert AIUseCase.PUBLIC_CHAT == "public_chat"

    def test_enum_comparable_with_string(self):
        assert AIUseCase.REALTIME_COACH == "realtime_coach"
        assert AIUseCase("injury_risk") == AIUseCase.INJURY_RISK

    def test_invalid_value_raises(self):
        with pytest.raises(ValueError):
            AIUseCase("unknown_use_case")


# ── AIMessage ─────────────────────────────────────────────────────────────────

class TestAIMessage:
    def test_valid_roles(self):
        for role in ("system", "user", "assistant"):
            msg = AIMessage(role=role, content="hola")
            assert msg.role == role

    def test_invalid_role_raises(self):
        with pytest.raises(ValidationError):
            AIMessage(role="admin", content="hack")

    def test_content_required(self):
        with pytest.raises(ValidationError):
            AIMessage(role="user", content="")  # min_length=1

    def test_content_preserved(self):
        msg = AIMessage(role="assistant", content="Respuesta larga con acentos: á é ñ")
        assert msg.content == "Respuesta larga con acentos: á é ñ"


# ── AIRequest ─────────────────────────────────────────────────────────────────

class TestAIRequest:
    def _user_msg(self, content: str = "¿Cuántas calorías tiene un huevo?") -> AIMessage:
        return AIMessage(role="user", content=content)

    def _system_msg(self, content: str = "Eres un asistente nutricional.") -> AIMessage:
        return AIMessage(role="system", content=content)

    def test_minimal_valid_request(self):
        req = AIRequest(messages=[self._user_msg()])
        assert len(req.messages) == 1
        assert req.max_tokens == 1024       # default
        assert req.temperature == 0.7       # default
        assert req.timeout_s == 10.0        # default
        assert req.response_format == "text"
        assert req.model_override is None

    def test_with_system_and_user(self):
        req = AIRequest(messages=[self._system_msg(), self._user_msg()])
        assert len(req.messages) == 2

    def test_requires_at_least_one_user_message(self):
        """Un request con solo system message debe fallar validación."""
        with pytest.raises(ValidationError, match="role='user'"):
            AIRequest(messages=[self._system_msg()])

    def test_empty_messages_raises(self):
        with pytest.raises(ValidationError):
            AIRequest(messages=[])

    def test_max_tokens_bounds(self):
        # Válido en los extremos
        AIRequest(messages=[self._user_msg()], max_tokens=1)
        AIRequest(messages=[self._user_msg()], max_tokens=8192)
        # Inválido fuera de rango
        with pytest.raises(ValidationError):
            AIRequest(messages=[self._user_msg()], max_tokens=0)
        with pytest.raises(ValidationError):
            AIRequest(messages=[self._user_msg()], max_tokens=8193)

    def test_temperature_bounds(self):
        AIRequest(messages=[self._user_msg()], temperature=0.0)
        AIRequest(messages=[self._user_msg()], temperature=2.0)
        with pytest.raises(ValidationError):
            AIRequest(messages=[self._user_msg()], temperature=-0.1)
        with pytest.raises(ValidationError):
            AIRequest(messages=[self._user_msg()], temperature=2.1)

    def test_timeout_bounds(self):
        AIRequest(messages=[self._user_msg()], timeout_s=0.5)
        AIRequest(messages=[self._user_msg()], timeout_s=120.0)
        with pytest.raises(ValidationError):
            AIRequest(messages=[self._user_msg()], timeout_s=0.4)
        with pytest.raises(ValidationError):
            AIRequest(messages=[self._user_msg()], timeout_s=120.1)

    def test_response_format_valid_values(self):
        AIRequest(messages=[self._user_msg()], response_format="text")
        AIRequest(messages=[self._user_msg()], response_format="json_object")

    def test_response_format_invalid_raises(self):
        with pytest.raises(ValidationError):
            AIRequest(messages=[self._user_msg()], response_format="xml")

    def test_model_override_optional(self):
        req = AIRequest(messages=[self._user_msg()], model_override="gemini-2.5-pro")
        assert req.model_override == "gemini-2.5-pro"

    def test_multi_turn_conversation(self):
        msgs = [
            self._system_msg("Eres un coach."),
            self._user_msg("¿Cómo mejoro mi sentadilla?"),
            AIMessage(role="assistant", content="Trabaja el core primero."),
            self._user_msg("¿Y la movilidad de cadera?"),
        ]
        req = AIRequest(messages=msgs)
        assert len(req.messages) == 4


# ── AIResponse ────────────────────────────────────────────────────────────────

class TestAIResponse:
    def test_valid_response(self):
        resp = AIResponse(
            content="Tu peso ha mejorado un 2% este mes.",
            provider_used="gemini",
            model_used="gemini-2.5-flash",
            latency_ms=345,
            tokens_used=128,
            finish_reason="stop",
        )
        assert resp.provider_used == "gemini"
        assert resp.fallback_triggered is False  # default

    def test_fallback_triggered_flag(self):
        resp = AIResponse(
            content="Respuesta de emergencia.",
            provider_used="groq",
            model_used="llama-3.3-70b-versatile",
            latency_ms=890,
            finish_reason="stop",
            fallback_triggered=True,
        )
        assert resp.fallback_triggered is True

    def test_tokens_used_optional(self):
        """Cerebras no siempre devuelve tokens — debe ser nullable."""
        resp = AIResponse(
            content="ok",
            provider_used="cerebras",
            model_used="llama-3.3-70b",
            latency_ms=200,
            finish_reason="stop",
        )
        assert resp.tokens_used is None

    def test_latency_ms_non_negative(self):
        with pytest.raises(ValidationError):
            AIResponse(
                content="ok",
                provider_used="groq",
                model_used="llama-3.3-70b-versatile",
                latency_ms=-1,
                finish_reason="stop",
            )


# ── RoutingRule ───────────────────────────────────────────────────────────────

class TestRoutingRule:
    def test_valid_with_fallback(self):
        rule = RoutingRule(
            primary="gemini",
            primary_model="gemini-2.5-flash",
            fallback="groq",
            fallback_model="llama-3.3-70b-versatile",
        )
        assert rule.primary == "gemini"
        assert rule.fallback == "groq"

    def test_valid_without_fallback(self):
        """Use cases que prefieren 503 limpio sobre fallback automático."""
        rule = RoutingRule(
            primary="cerebras",
            primary_model="llama-3.3-70b",
        )
        assert rule.fallback is None
        assert rule.fallback_model is None

    def test_fallback_without_model_raises(self):
        """Si defines fallback, debes definir también fallback_model."""
        with pytest.raises(ValidationError, match="fallback_model"):
            RoutingRule(
                primary="gemini",
                primary_model="gemini-2.5-pro",
                fallback="groq",
                # fallback_model ausente — debe fallar
            )

    def test_fallback_model_without_fallback_is_ok(self):
        """fallback_model sin fallback es inócuo (se ignora)."""
        rule = RoutingRule(
            primary="gemini",
            primary_model="gemini-2.5-flash",
            fallback_model="llama-3.3-70b-versatile",  # ignorado si no hay fallback
        )
        assert rule.fallback is None


# ── Jerarquía de excepciones ──────────────────────────────────────────────────

class TestExceptionHierarchy:
    def test_timeout_is_provider_error(self):
        err = AITimeoutError(provider="gemini", reason="30s exceeded")
        assert isinstance(err, AIProviderError)
        assert isinstance(err, AITimeoutError)

    def test_rate_limit_is_provider_error(self):
        err = AIRateLimitError(provider="groq", reason="429 Too Many Requests")
        assert isinstance(err, AIProviderError)

    def test_invalid_request_is_provider_error(self):
        err = AIInvalidRequestError(provider="cerebras", reason="400 context too long")
        assert isinstance(err, AIProviderError)

    def test_str_representation(self):
        err = AIProviderError(provider="groq", reason="connection refused")
        assert "[groq]" in str(err)
        assert "connection refused" in str(err)

    def test_original_exception_stored(self):
        original = ConnectionRefusedError("refused")
        err = AITimeoutError(provider="gemini", reason="timeout", original=original)
        assert err.original is original

    def test_subclass_catchable_as_parent(self):
        """El router captura AIProviderError y subclases con un solo except."""
        errors = [
            AITimeoutError("g", "t"),
            AIRateLimitError("g", "r"),
            AIInvalidRequestError("g", "i"),
        ]
        for e in errors:
            try:
                raise e
            except AIProviderError as caught:
                assert caught.provider == "g"
