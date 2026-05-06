"""
tests/integration/test_ai_coach.py
=====================================
Tests de integración para el módulo ai_coach.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

SET_PAYLOAD = {
    "exercise": "Sentadilla",
    "weight_kg": 100.0,
    "reps": 5,
    "rpe": 8,
    "session_sets": [],
    "planned_weight_kg": None,
    "planned_reps": 5,
}

MOCK_GROQ_RESPONSE = {
    "choices": [
        {
            "message": {
                "content": "Excelente serie, sube 2.5kg en la siguiente.\nSUBE"
            }
        }
    ]
}


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

    async def test_set_feedback_without_api_key(self, client, auth_headers):
        """Sin GROK_API_KEY configurada devuelve fallback graceful."""
        with patch("app.modules.ai_coach.service.get_settings") as mock_cfg:
            mock_cfg.return_value.grok_api_key = ""
            resp = await client.post(
                "/api/v1/ai-coach/set-feedback",
                json=SET_PAYLOAD,
                headers=auth_headers,
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "coaching" in data
        assert data["suggestion"] in (
            "increase_weight", "decrease_weight", "maintain", "rest", "good_form"
        )
        assert 0.0 <= data["confidence"] <= 1.0

    async def test_set_feedback_with_mocked_groq(self, client, auth_headers):
        """Con Groq mockeado devuelve respuesta correcta."""
        import httpx

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = MOCK_GROQ_RESPONSE
        mock_resp.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_ctx.post = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_ctx

            with patch("app.modules.ai_coach.service.get_settings") as mock_cfg:
                mock_cfg.return_value.grok_api_key = "gsk_test_key"
                resp = await client.post(
                    "/api/v1/ai-coach/set-feedback",
                    json=SET_PAYLOAD,
                    headers=auth_headers,
                )

        assert resp.status_code == 200
        data = resp.json()
        assert data["coaching"] == "Excelente serie, sube 2.5kg en la siguiente."
        assert data["suggestion"] == "increase_weight"
        assert data["confidence"] == 0.85

    async def test_set_feedback_with_session_history(self, client, auth_headers):
        """Sesión con historial de sets previos."""
        payload = {
            **SET_PAYLOAD,
            "session_sets": [
                {"exercise": "Sentadilla", "weight_kg": 95.0, "reps": 5, "rpe": 7},
                {"exercise": "Sentadilla", "weight_kg": 97.5, "reps": 5, "rpe": 8},
            ],
        }
        with patch("app.modules.ai_coach.service.get_settings") as mock_cfg:
            mock_cfg.return_value.grok_api_key = ""
            resp = await client.post(
                "/api/v1/ai-coach/set-feedback",
                json=payload,
                headers=auth_headers,
            )
        assert resp.status_code == 200

    async def test_set_feedback_groq_timeout_fallback(self, client, auth_headers):
        """Timeout de Groq → devuelve respuesta de fallback, no 500."""
        import httpx

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_ctx.post = AsyncMock(side_effect=httpx.TimeoutException("timeout"))
            mock_client_cls.return_value = mock_ctx

            with patch("app.modules.ai_coach.service.get_settings") as mock_cfg:
                mock_cfg.return_value.grok_api_key = "gsk_test_key"
                resp = await client.post(
                    "/api/v1/ai-coach/set-feedback",
                    json=SET_PAYLOAD,
                    headers=auth_headers,
                )

        assert resp.status_code == 200
        data = resp.json()
        assert data["suggestion"] == "maintain"

    async def test_set_feedback_max_session_sets(self, client, auth_headers):
        """Payload válido con 50 sets en sesión (límite máximo)."""
        sets = [
            {"exercise": "Press Banca", "weight_kg": 80.0, "reps": 8, "rpe": 7}
            for _ in range(50)
        ]
        payload = {**SET_PAYLOAD, "session_sets": sets}
        with patch("app.modules.ai_coach.service.get_settings") as mock_cfg:
            mock_cfg.return_value.grok_api_key = ""
            resp = await client.post(
                "/api/v1/ai-coach/set-feedback",
                json=payload,
                headers=auth_headers,
            )
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
