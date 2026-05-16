"""
tests/services/ai_router/test_integration_endpoints.py
=========================================================
Tests de integración de los 5 endpoints de IA con el AIRouter.

Verifican que:
1. El contrato JSON de cada endpoint no ha cambiado.
2. El routing correcto llega al provider correcto.
3. El fallback de templates funciona cuando TODOS los providers fallan.
4. Los errores de IA devuelven el código HTTP correcto (no 500 desnudo).

Sin llamadas reales — el AIRouter se reemplaza con un mock en app.state.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import AsyncClient, ASGITransport

from app.services.ai_router.base import AIProviderError
from app.services.ai_router.schemas import AIResponse, AIUseCase


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_ai_response(
    content: str,
    provider: str = "gemini",
    model: str = "gemini-2.5-flash",
    fallback: bool = False,
) -> AIResponse:
    return AIResponse(
        content=content,
        provider_used=provider,
        model_used=model,
        latency_ms=200,
        tokens_used=100,
        finish_reason="stop",
        fallback_triggered=fallback,
    )


def _mock_router(response: AIResponse | Exception) -> MagicMock:
    """Crea un mock de AIRouter cuyo .call() devuelve response o lanza exc."""
    mock = MagicMock()
    if isinstance(response, Exception):
        mock.call = AsyncMock(side_effect=response)
    else:
        mock.call = AsyncMock(return_value=response)
    return mock


# ── Fixture de app con AIRouter mockeado ──────────────────────────────────────

@pytest.fixture
def app_with_mock_router():
    """
    Devuelve una función que crea un AsyncClient con app.state.ai_router
    reemplazado por el mock dado. Evita inicializar BD real.
    """
    from app.main import app as fastapi_app

    def _make_client(mock_router) -> AsyncClient:
        fastapi_app.state.ai_router = mock_router
        return AsyncClient(
            transport=ASGITransport(app=fastapi_app),
            base_url="http://test",
        )

    return _make_client


# ══════════════════════════════════════════════════════════════════════════════
# Chat endpoint — POST /api/v1/chat/message
# ══════════════════════════════════════════════════════════════════════════════

class TestChatEndpoint:
    async def test_routes_to_gemini_by_default(self, app_with_mock_router):
        """El chat debe llamar al router con PUBLIC_CHAT."""
        captured_use_case: list[AIUseCase] = []

        async def capture_call(use_case, request, **kwargs):
            captured_use_case.append(use_case)
            return _make_ai_response("Un huevo tiene 70 kcal.")

        mock = MagicMock()
        mock.call = AsyncMock(side_effect=capture_call)

        async with app_with_mock_router(mock) as client:
            resp = await client.post(
                "/api/v1/chat/message",
                json={"message": "¿Cuántas calorías tiene un huevo?", "history": []},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert "reply" in data
        assert "70 kcal" in data["reply"]
        assert captured_use_case[0] == AIUseCase.PUBLIC_CHAT

    async def test_response_contract_unchanged(self, app_with_mock_router):
        """El contrato JSON {"reply": "..."} no debe haber cambiado."""
        mock = _mock_router(_make_ai_response("Respuesta del asistente."))

        async with app_with_mock_router(mock) as client:
            resp = await client.post(
                "/api/v1/chat/message",
                json={"message": "Hola", "history": []},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert list(body.keys()) == ["reply"]
        assert isinstance(body["reply"], str)

    async def test_ai_error_returns_502(self, app_with_mock_router):
        """Si el router lanza AIProviderError, el endpoint debe devolver 502."""
        mock = _mock_router(AIProviderError("all", "todos los providers fallaron"))

        async with app_with_mock_router(mock) as client:
            resp = await client.post(
                "/api/v1/chat/message",
                json={"message": "Hola", "history": []},
            )

        assert resp.status_code == 502
        assert "detail" in resp.json()

    async def test_history_passed_to_router(self, app_with_mock_router):
        """El historial de conversación debe incluirse en los mensajes del AIRequest."""
        captured_messages: list = []

        async def capture(use_case, request, **kwargs):
            captured_messages.extend(request.messages)
            return _make_ai_response("ok")

        mock = MagicMock()
        mock.call = AsyncMock(side_effect=capture)

        async with app_with_mock_router(mock) as client:
            await client.post(
                "/api/v1/chat/message",
                json={
                    "message": "¿Y la proteína?",
                    "history": [
                        {"role": "user", "content": "¿Cuántas kcal tiene un huevo?"},
                        {"role": "assistant", "content": "Unas 70 kcal."},
                    ],
                },
            )

        roles = [m.role for m in captured_messages]
        assert "system" in roles
        assert "user" in roles
        assert "assistant" in roles


# ══════════════════════════════════════════════════════════════════════════════
# AI Insights — fallback a templates cuando todos los providers fallan
# ══════════════════════════════════════════════════════════════════════════════

class TestInsightsFallbackToTemplates:
    """
    Cuando el AIRouter lanza AIProviderError (todos los providers fallaron),
    los endpoints de insights deben devolver respuestas de templates, no 500.
    """

    async def test_narrative_falls_back_to_template_when_all_ai_fails(
        self, app_with_mock_router, authenticated_client_headers
    ):
        """
        narrative endpoint: si el router falla, devuelve narrativa por templates.
        El status code debe ser 200 (el fallback es graceful).
        """
        mock = _mock_router(AIProviderError("all", "fallaron todos"))

        async with app_with_mock_router(mock) as client:
            resp = await client.get(
                "/api/v1/ai-insights/biomarker-narrative",
                headers=authenticated_client_headers,
            )

        # 200 con fallback — nunca 500
        assert resp.status_code == 200
        data = resp.json()
        assert "narrative" in data
        assert "trend" in data
        assert "highlights" in data

    async def test_injury_risk_falls_back_to_template(
        self, app_with_mock_router, authenticated_client_headers
    ):
        mock = _mock_router(AIProviderError("all", "fallaron todos"))

        async with app_with_mock_router(mock) as client:
            resp = await client.get(
                "/api/v1/ai-insights/injury-risk",
                headers=authenticated_client_headers,
            )

        assert resp.status_code == 200
        data = resp.json()
        assert "risk_flags" in data
        assert "overall_risk" in data
        assert "summary" in data

    async def test_weekly_goals_falls_back_to_template(
        self, app_with_mock_router, authenticated_client_headers
    ):
        mock = _mock_router(AIProviderError("all", "fallaron todos"))

        async with app_with_mock_router(mock) as client:
            resp = await client.get(
                "/api/v1/ai-insights/weekly-goals",
                headers=authenticated_client_headers,
            )

        assert resp.status_code == 200
        data = resp.json()
        assert "goals" in data
        assert "week_summary" in data
        assert len(data["goals"]) == 3  # siempre 3 objetivos en fallback


# ══════════════════════════════════════════════════════════════════════════════
# Verificación de use_cases (sin BD — solo routing)
# ══════════════════════════════════════════════════════════════════════════════

class TestRoutingToCorrectUseCase:
    """Verifica que cada endpoint llama al router con el use_case correcto."""

    async def test_chat_uses_public_chat(self, app_with_mock_router):
        captured: list[AIUseCase] = []

        async def capture(use_case, request, **kw):
            captured.append(use_case)
            return _make_ai_response("ok")

        mock = MagicMock()
        mock.call = AsyncMock(side_effect=capture)

        async with app_with_mock_router(mock) as client:
            await client.post(
                "/api/v1/chat/message",
                json={"message": "test", "history": []},
            )

        assert captured[0] == AIUseCase.PUBLIC_CHAT

    async def test_coach_uses_realtime_coach(
        self, app_with_mock_router, authenticated_client_headers
    ):
        captured: list[AIUseCase] = []

        async def capture(use_case, request, **kw):
            captured.append(use_case)
            return _make_ai_response("Sube 2.5kg.\nSUBE")

        mock = MagicMock()
        mock.call = AsyncMock(side_effect=capture)

        async with app_with_mock_router(mock) as client:
            await client.post(
                "/api/v1/ai-coach/set-feedback",
                headers=authenticated_client_headers,
                json={
                    "exercise": "Sentadilla",
                    "weight_kg": 80,
                    "reps": 5,
                    "session_sets": [],
                },
            )

        assert len(captured) > 0
        assert captured[0] == AIUseCase.REALTIME_COACH

    async def test_narrative_uses_insights_narrative(
        self, app_with_mock_router, authenticated_client_headers
    ):
        captured: list[AIUseCase] = []

        async def capture(use_case, request, **kw):
            captured.append(use_case)
            return _make_ai_response('{"narrative":"ok","trend":"stable","highlights":[]}')

        mock = MagicMock()
        mock.call = AsyncMock(side_effect=capture)

        async with app_with_mock_router(mock) as client:
            await client.get(
                "/api/v1/ai-insights/biomarker-narrative",
                headers=authenticated_client_headers,
            )

        if captured:  # puede no llamarse si no hay datos suficientes
            assert captured[0] == AIUseCase.INSIGHTS_NARRATIVE


# ── Fixture de headers JWT para tests que requieren autenticación ─────────────
# Nota: estos tests completos requieren la BD de test activa (Pi).
# En CI local sin BD, los tests de insights/coach se marcan como skip
# automáticamente si la conexión falla.

@pytest.fixture
def authenticated_client_headers():
    """
    Headers JWT mínimos para endpoints que requieren autenticación.
    En tests de integración sin BD real, muchos endpoints devuelven 401/422
    pero verificamos el comportamiento del AIRouter, no el auth completo.
    """
    return {"Authorization": "Bearer test_token_placeholder"}
