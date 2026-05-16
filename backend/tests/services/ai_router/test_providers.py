"""
tests/services/ai_router/test_providers.py
============================================
Tests unitarios de los 3 providers: Groq, Gemini, Cerebras.

CERO llamadas reales a APIs:
- Groq y Gemini: mockeados con respx (intercepta httpx).
- Cerebras: mockeado parcheando asyncio.to_thread (el SDK es síncrono).

Patrón general de cada test:
1. Construir un AIRequest válido
2. Mockear la llamada HTTP / SDK call
3. Llamar provider.complete()
4. Assertar en el AIResponse resultante O en la excepción lanzada
"""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
import respx

from app.services.ai_router.base import (
    AIInvalidRequestError,
    AIProviderError,
    AIRateLimitError,
    AITimeoutError,
)
from app.services.ai_router.providers.gemini import GeminiProvider, _GEMINI_BASE_URL
from app.services.ai_router.providers.groq import GroqProvider, _GROQ_BASE_URL
from app.services.ai_router.schemas import AIMessage, AIRequest


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def user_request() -> AIRequest:
    return AIRequest(
        messages=[
            AIMessage(role="system", content="Eres un asistente de salud."),
            AIMessage(role="user", content="¿Cuántas calorías tiene un huevo?"),
        ],
        max_tokens=200,
        temperature=0.7,
        timeout_s=10.0,
    )


@pytest.fixture
def coach_request() -> AIRequest:
    return AIRequest(
        messages=[AIMessage(role="user", content="Serie: 80kg x 5 reps, RPE 8.")],
        max_tokens=60,
        temperature=0.4,
        timeout_s=8.0,
    )


def _openai_response(content: str, model: str = "llama-3.3-70b-versatile") -> dict:
    """Construye un payload de respuesta compatible con OpenAI."""
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 50, "completion_tokens": 30, "total_tokens": 80},
    }


# ══════════════════════════════════════════════════════════════════════════════
# GroqProvider
# ══════════════════════════════════════════════════════════════════════════════

class TestGroqProvider:
    def _provider(self) -> GroqProvider:
        return GroqProvider(api_key="gsk_test_key")

    @respx.mock
    async def test_success(self, user_request: AIRequest):
        respx.post(f"{_GROQ_BASE_URL}/chat/completions").mock(
            return_value=httpx.Response(
                200,
                json=_openai_response("Un huevo tiene unas 70 kcal."),
            )
        )
        provider = self._provider()
        resp = await provider.complete(user_request)

        assert resp.provider_used == "groq"
        assert "70 kcal" in resp.content
        assert resp.tokens_used == 80
        assert resp.finish_reason == "stop"
        assert resp.fallback_triggered is False
        assert resp.latency_ms >= 0

    @respx.mock
    async def test_model_override_respected(self, user_request: AIRequest):
        user_request.model_override = "llama-3.1-8b-instant"
        captured_body: dict = {}

        async def capture(request: httpx.Request):
            captured_body.update(json.loads(request.content))
            return httpx.Response(
                200,
                json=_openai_response("ok", model="llama-3.1-8b-instant"),
            )

        respx.post(f"{_GROQ_BASE_URL}/chat/completions").mock(side_effect=capture)

        provider = self._provider()
        resp = await provider.complete(user_request)
        assert captured_body["model"] == "llama-3.1-8b-instant"
        assert resp.model_used == "llama-3.1-8b-instant"

    @respx.mock
    async def test_timeout_raises_ai_timeout_error(self, user_request: AIRequest):
        respx.post(f"{_GROQ_BASE_URL}/chat/completions").mock(
            side_effect=httpx.ReadTimeout("timeout", request=MagicMock())
        )
        provider = self._provider()
        with pytest.raises(AITimeoutError) as exc_info:
            await provider.complete(user_request)
        assert exc_info.value.provider == "groq"

    @respx.mock
    async def test_429_raises_rate_limit_error(self, user_request: AIRequest):
        respx.post(f"{_GROQ_BASE_URL}/chat/completions").mock(
            return_value=httpx.Response(429, text="rate limited")
        )
        provider = self._provider()
        with pytest.raises(AIRateLimitError) as exc_info:
            await provider.complete(user_request)
        assert exc_info.value.provider == "groq"

    @respx.mock
    async def test_4xx_not_429_raises_invalid_request(self, user_request: AIRequest):
        respx.post(f"{_GROQ_BASE_URL}/chat/completions").mock(
            return_value=httpx.Response(400, text="bad request: context too long")
        )
        provider = self._provider()
        with pytest.raises(AIInvalidRequestError) as exc_info:
            await provider.complete(user_request)
        assert exc_info.value.provider == "groq"

    @respx.mock
    async def test_5xx_raises_provider_error(self, user_request: AIRequest):
        respx.post(f"{_GROQ_BASE_URL}/chat/completions").mock(
            return_value=httpx.Response(503, text="service unavailable")
        )
        provider = self._provider()
        with pytest.raises(AIProviderError):
            await provider.complete(user_request)

    @respx.mock
    async def test_network_error_raises_provider_error(self, user_request: AIRequest):
        respx.post(f"{_GROQ_BASE_URL}/chat/completions").mock(
            side_effect=httpx.ConnectError("connection refused")
        )
        provider = self._provider()
        with pytest.raises(AIProviderError) as exc_info:
            await provider.complete(user_request)
        # ConnectError no es Timeout → AIProviderError base, no AITimeoutError
        assert type(exc_info.value) is AIProviderError

    @respx.mock
    async def test_empty_choices_raises_provider_error(self, user_request: AIRequest):
        respx.post(f"{_GROQ_BASE_URL}/chat/completions").mock(
            return_value=httpx.Response(200, json={"choices": []})
        )
        provider = self._provider()
        with pytest.raises(AIProviderError, match="sin choices"):
            await provider.complete(user_request)

    async def test_missing_api_key_raises_provider_error(self, user_request: AIRequest):
        provider = GroqProvider(api_key="")
        with pytest.raises(AIProviderError, match="API key"):
            await provider.complete(user_request)

    @respx.mock
    async def test_json_object_format_sent_in_payload(self, user_request: AIRequest):
        user_request.response_format = "json_object"
        captured: dict = {}

        async def capture(request: httpx.Request):
            captured.update(json.loads(request.content))
            return httpx.Response(200, json=_openai_response('{"cal": 70}'))

        respx.post(f"{_GROQ_BASE_URL}/chat/completions").mock(side_effect=capture)

        provider = self._provider()
        await provider.complete(user_request)
        assert captured.get("response_format") == {"type": "json_object"}

    def test_supports_vision_is_false(self):
        assert self._provider().supports_vision is False

    def test_name_is_groq(self):
        assert self._provider().name == "groq"


# ══════════════════════════════════════════════════════════════════════════════
# GeminiProvider
# ══════════════════════════════════════════════════════════════════════════════

class TestGeminiProvider:
    def _provider(self) -> GeminiProvider:
        return GeminiProvider(api_key="AIza_test_key")

    @respx.mock
    async def test_success_with_flash_model(self, user_request: AIRequest):
        user_request.model_override = "gemini-2.5-flash"
        respx.post(f"{_GEMINI_BASE_URL}/chat/completions").mock(
            return_value=httpx.Response(
                200,
                json=_openai_response("Un huevo grande tiene ~70 kcal.", model="gemini-2.5-flash"),
            )
        )
        provider = self._provider()
        resp = await provider.complete(user_request)

        assert resp.provider_used == "gemini"
        assert resp.model_used == "gemini-2.5-flash"
        assert "70 kcal" in resp.content

    @respx.mock
    async def test_success_with_pro_model(self, user_request: AIRequest):
        user_request.model_override = "gemini-2.5-pro"
        respx.post(f"{_GEMINI_BASE_URL}/chat/completions").mock(
            return_value=httpx.Response(
                200,
                json=_openai_response("Análisis detallado...", model="gemini-2.5-pro"),
            )
        )
        provider = self._provider()
        resp = await provider.complete(user_request)
        assert resp.model_used == "gemini-2.5-pro"

    @respx.mock
    async def test_json_response_format(self, user_request: AIRequest):
        user_request.response_format = "json_object"
        captured: dict = {}

        async def capture(request: httpx.Request):
            captured.update(json.loads(request.content))
            return httpx.Response(200, json=_openai_response('{"narrative": "ok"}'))

        respx.post(f"{_GEMINI_BASE_URL}/chat/completions").mock(side_effect=capture)

        provider = self._provider()
        await provider.complete(user_request)
        assert captured.get("response_format") == {"type": "json_object"}

    @respx.mock
    async def test_timeout_raises_ai_timeout_error(self, user_request: AIRequest):
        respx.post(f"{_GEMINI_BASE_URL}/chat/completions").mock(
            side_effect=httpx.ReadTimeout("timeout", request=MagicMock())
        )
        provider = self._provider()
        with pytest.raises(AITimeoutError):
            await provider.complete(user_request)

    @respx.mock
    async def test_429_raises_rate_limit_error(self, user_request: AIRequest):
        respx.post(f"{_GEMINI_BASE_URL}/chat/completions").mock(
            return_value=httpx.Response(429, text="quota exceeded")
        )
        provider = self._provider()
        with pytest.raises(AIRateLimitError):
            await provider.complete(user_request)

    @respx.mock
    async def test_4xx_not_429_raises_invalid_request(self, user_request: AIRequest):
        respx.post(f"{_GEMINI_BASE_URL}/chat/completions").mock(
            return_value=httpx.Response(400, text="invalid message")
        )
        provider = self._provider()
        with pytest.raises(AIInvalidRequestError):
            await provider.complete(user_request)

    async def test_missing_api_key_raises_provider_error(self, user_request: AIRequest):
        provider = GeminiProvider(api_key="")
        with pytest.raises(AIProviderError, match="API key"):
            await provider.complete(user_request)

    def test_supports_vision_is_true(self):
        """Gemini soporta visión — necesario para food-vision (PR siguiente)."""
        assert self._provider().supports_vision is True

    def test_name_is_gemini(self):
        assert self._provider().name == "gemini"


# ══════════════════════════════════════════════════════════════════════════════
# CerebrasProvider
# ══════════════════════════════════════════════════════════════════════════════

class TestCerebrasProvider:
    """
    El SDK de Cerebras es síncrono. Los tests mockean asyncio.to_thread
    para inyectar resultados o excepciones sin tocar el SDK real.
    """

    def _provider(self) -> "CerebrasProvider":
        from app.services.ai_router.providers.cerebras import CerebrasProvider
        return CerebrasProvider(api_key="csk_test_key")

    def _make_sync_result(self, content: str, tokens: int = 50) -> dict:
        return {
            "content": content,
            "finish_reason": "stop",
            "tokens_used": tokens,
        }

    async def test_success(self, coach_request: AIRequest):
        from app.services.ai_router.providers.cerebras import CerebrasProvider

        provider = CerebrasProvider(api_key="csk_test_key")
        sync_result = self._make_sync_result("Excelente serie, sube 2.5kg.")

        with patch("asyncio.to_thread", new_callable=AsyncMock) as mock_thread:
            mock_thread.return_value = sync_result
            resp = await provider.complete(coach_request)

        assert resp.provider_used == "cerebras"
        assert "Excelente" in resp.content
        assert resp.tokens_used == 50
        assert resp.finish_reason == "stop"
        assert resp.latency_ms >= 0

    async def test_model_override_passed_to_sync_call(self, coach_request: AIRequest):
        from app.services.ai_router.providers.cerebras import CerebrasProvider

        coach_request.model_override = "llama-3.3-70b"
        provider = CerebrasProvider(api_key="csk_test_key")
        captured_args = {}

        async def fake_to_thread(func, *args, **kwargs):
            # El primer arg después de func es el request, el segundo es el model
            if len(args) >= 2:
                captured_args["model"] = args[1]
            # Llamar la función real con args para verificar que model se pasa
            return self._make_sync_result("ok")

        with patch("asyncio.to_thread", side_effect=fake_to_thread):
            resp = await provider.complete(coach_request)

        assert captured_args.get("model") == "llama-3.3-70b"
        assert resp.model_used == "llama-3.3-70b"

    async def test_timeout_propagates_as_ai_timeout_error(self, coach_request: AIRequest):
        from app.services.ai_router.providers.cerebras import CerebrasProvider

        provider = CerebrasProvider(api_key="csk_test_key")

        async def raise_timeout(*args, **kwargs):
            raise AITimeoutError("cerebras", "timeout")

        with patch("asyncio.to_thread", side_effect=raise_timeout):
            with pytest.raises(AITimeoutError):
                await provider.complete(coach_request)

    async def test_rate_limit_propagates(self, coach_request: AIRequest):
        from app.services.ai_router.providers.cerebras import CerebrasProvider

        provider = CerebrasProvider(api_key="csk_test_key")

        async def raise_rate_limit(*args, **kwargs):
            raise AIRateLimitError("cerebras", "429")

        with patch("asyncio.to_thread", side_effect=raise_rate_limit):
            with pytest.raises(AIRateLimitError):
                await provider.complete(coach_request)

    async def test_empty_content_raises_provider_error(self, coach_request: AIRequest):
        from app.services.ai_router.providers.cerebras import CerebrasProvider

        provider = CerebrasProvider(api_key="csk_test_key")

        with patch("asyncio.to_thread", new_callable=AsyncMock) as mock_thread:
            mock_thread.return_value = {"content": "", "finish_reason": "stop", "tokens_used": None}
            with pytest.raises(AIProviderError, match="content vacío"):
                await provider.complete(coach_request)

    async def test_missing_api_key_raises_provider_error(self, coach_request: AIRequest):
        from app.services.ai_router.providers.cerebras import CerebrasProvider

        provider = CerebrasProvider(api_key="")
        with pytest.raises(AIProviderError, match="API key"):
            await provider.complete(coach_request)

    def test_supports_vision_is_false(self):
        from app.services.ai_router.providers.cerebras import CerebrasProvider
        assert CerebrasProvider(api_key="x").supports_vision is False

    def test_name_is_cerebras(self):
        from app.services.ai_router.providers.cerebras import CerebrasProvider
        assert CerebrasProvider(api_key="x").name == "cerebras"

    async def test_tokens_used_nullable(self, coach_request: AIRequest):
        """Cerebras puede no devolver usage — tokens_used debe ser None."""
        from app.services.ai_router.providers.cerebras import CerebrasProvider

        provider = CerebrasProvider(api_key="csk_test_key")

        with patch("asyncio.to_thread", new_callable=AsyncMock) as mock_thread:
            mock_thread.return_value = {
                "content": "Mantén el peso.",
                "finish_reason": "stop",
                "tokens_used": None,
            }
            resp = await provider.complete(coach_request)

        assert resp.tokens_used is None
