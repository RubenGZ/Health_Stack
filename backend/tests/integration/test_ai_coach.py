"""
tests/integration/test_ai_coach.py
=====================================
Tests de integración para el módulo ai_coach.

Migrado en Bloque D: el servicio ahora usa AIRouter (no httpx directo).
Los tests que antes mockeaban httpx.AsyncClient o get_settings ahora
mockean directamente app.state.ai_router — el nivel correcto de abstracción.

Cerebras (provider primario de REALTIME_COACH) usa su propio SDK síncrono,
no httpx, por lo que parchear httpx no intercepta sus llamadas.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from app.main import app as fastapi_app
from app.services.ai_router.base import AIProviderError
from app.services.ai_router.schemas import AIResponse

SET_PAYLOAD = {
    "exercise": "Sentadilla",
    "weight_kg": 100.0,
    "reps": 5,
    "rpe": 8,
    "session_sets": [],
    "planned_weight_kg": None,
    "planned_reps": 5,
}

# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_coach_response(text: str = "Excelente serie, sube 2.5kg en la siguiente.\nSUBE",
                          fallback: bool = False) -> AIResponse:
    return AIResponse(
        content=text,
        provider_used="cerebras" if not fallback else "groq",
        model_used="llama-3.3-70b",
        latency_ms=50,
        tokens_used=30,
        finish_reason="stop",
        fallback_triggered=fallback,
    )


def _mock_router_ok(text: str = "Excelente serie, sube 2.5kg en la siguiente.\nSUBE",
                    fallback: bool = False) -> MagicMock:
    mock = MagicMock()
    mock.call = AsyncMock(return_value=_make_coach_response(text, fallback))
    return mock


def _mock_router_fail(reason: str = "todos los providers fallaron") -> MagicMock:
    mock = MagicMock()
    mock.call = AsyncMock(side_effect=AIProviderError("all", reason))
    return mock


@pytest.mark.asyncio
class TestAiCoach:

    async def test_set_feedback_no_auth(self, client):
        resp = await client.post("/api/v1/ai-coach/set-feedback", json=SET_PAYLOAD)
        assert resp.status_code == 401

    async def test_set_feedback_invalid_weight(self, client, auth_headers):
        payload = {**SET_PAYLOAD, "weight_kg": -10}
        resp = await client.post(
            "/api/v1/ai-coach/set-feedback",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_set_feedback_invalid_reps_zero(self, client, auth_headers):
        payload = {**SET_PAYLOAD, "reps": 0}
        resp = await client.post(
            "/api/v1/ai-coach/set-feedback",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_set_feedback_all_providers_fail_graceful(self, client, auth_headers):
        """Si todos los providers del AIRouter fallan, devuelve fallback graceful (200)."""
        original = fastapi_app.state.ai_router
        fastapi_app.state.ai_router = _mock_router_fail("todos los providers fallaron")
        try:
            resp = await client.post(
                "/api/v1/ai-coach/set-feedback",
                json=SET_PAYLOAD,
                headers=auth_headers,
            )
        finally:
            fastapi_app.state.ai_router = original

        assert resp.status_code == 200
        data = resp.json()
        assert "coaching" in data
        assert data["suggestion"] in (
            "increase_weight", "decrease_weight", "maintain", "rest", "good_form"
        )
        assert 0.0 <= data["confidence"] <= 1.0
        # Con AIProviderError el servicio usa el fallback estático
        assert data["suggestion"] == "maintain"
        assert data["confidence"] == 0.5

    async def test_set_feedback_with_mocked_router(self, client, auth_headers):
        """Con router mockeado devuelve la respuesta parseada correctamente."""
        original = fastapi_app.state.ai_router
        fastapi_app.state.ai_router = _mock_router_ok(
            "Excelente serie, sube 2.5kg en la siguiente.\nSUBE"
        )
        try:
            resp = await client.post(
                "/api/v1/ai-coach/set-feedback",
                json=SET_PAYLOAD,
                headers=auth_headers,
            )
        finally:
            fastapi_app.state.ai_router = original

        assert resp.status_code == 200
        data = resp.json()
        assert data["coaching"] == "Excelente serie, sube 2.5kg en la siguiente."
        assert data["suggestion"] == "increase_weight"
        assert data["confidence"] == 0.85

    async def test_set_feedback_with_session_history(self, client, auth_headers):
        """Sesión con historial de sets previos — el router recibe los mensajes correctos."""
        captured_request: list = []

        async def capture(use_case, request, **kw):
            captured_request.append(request)
            return _make_coach_response()

        original = fastapi_app.state.ai_router
        mock = MagicMock()
        mock.call = AsyncMock(side_effect=capture)
        fastapi_app.state.ai_router = mock
        try:
            payload = {
                **SET_PAYLOAD,
                "session_sets": [
                    {"exercise": "Sentadilla", "weight_kg": 95.0, "reps": 5, "rpe": 7},
                    {"exercise": "Sentadilla", "weight_kg": 97.5, "reps": 5, "rpe": 8},
                ],
            }
            resp = await client.post(
                "/api/v1/ai-coach/set-feedback",
                json=payload,
                headers=auth_headers,
            )
        finally:
            fastapi_app.state.ai_router = original

        assert resp.status_code == 200
        # Verificar que el historial llegó al prompt del router
        assert len(captured_request) == 1
        assert "95.0" in captured_request[0].messages[0].content  # historial en el prompt

    async def test_set_feedback_router_timeout_fallback(self, client, auth_headers):
        """Timeout del AIRouter (todos los providers) → fallback estático, no 500."""
        original = fastapi_app.state.ai_router
        fastapi_app.state.ai_router = _mock_router_fail("timeout en todos los providers")
        try:
            resp = await client.post(
                "/api/v1/ai-coach/set-feedback",
                json=SET_PAYLOAD,
                headers=auth_headers,
            )
        finally:
            fastapi_app.state.ai_router = original

        assert resp.status_code == 200
        data = resp.json()
        assert data["suggestion"] == "maintain"
        assert data["confidence"] == 0.5

    async def test_set_feedback_fallback_triggered_lower_confidence(self, client, auth_headers):
        """Si el router usó fallback (primary falló), confidence = 0.70."""
        original = fastapi_app.state.ai_router
        fastapi_app.state.ai_router = _mock_router_ok(
            "Buen trabajo, mantén el peso.\nMANTÉN", fallback=True
        )
        try:
            resp = await client.post(
                "/api/v1/ai-coach/set-feedback",
                json=SET_PAYLOAD,
                headers=auth_headers,
            )
        finally:
            fastapi_app.state.ai_router = original

        assert resp.status_code == 200
        data = resp.json()
        assert data["confidence"] == 0.70

    async def test_set_feedback_max_session_sets(self, client, auth_headers):
        """Payload válido con 50 sets en sesión (límite máximo)."""
        original = fastapi_app.state.ai_router
        fastapi_app.state.ai_router = _mock_router_ok()
        try:
            sets = [
                {"exercise": "Press Banca", "weight_kg": 80.0, "reps": 8, "rpe": 7}
                for _ in range(50)
            ]
            resp = await client.post(
                "/api/v1/ai-coach/set-feedback",
                json={**SET_PAYLOAD, "session_sets": sets},
                headers=auth_headers,
            )
        finally:
            fastapi_app.state.ai_router = original

        assert resp.status_code == 200

    async def test_set_feedback_exceeds_session_sets_limit(self, client, auth_headers):
        """51 sets excede max_length=50 → 422."""
        sets = [
            {"exercise": "Press Banca", "weight_kg": 80.0, "reps": 8, "rpe": None}
            for _ in range(51)
        ]
        payload = {**SET_PAYLOAD, "session_sets": sets}
        resp = await client.post(
            "/api/v1/ai-coach/set-feedback",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code == 422
