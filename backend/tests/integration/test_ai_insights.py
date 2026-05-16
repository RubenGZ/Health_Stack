"""
tests/integration/test_ai_insights.py
========================================
Tests de integración para el módulo ai_insights.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
class TestAiInsights:

    async def test_biomarker_narrative_no_auth(self, client):
        resp = await client.get("/api/v1/ai-insights/biomarker-narrative")
        assert resp.status_code == 401

    async def test_injury_risk_no_auth(self, client):
        resp = await client.get("/api/v1/ai-insights/injury-risk")
        assert resp.status_code == 401

    async def test_weekly_goals_no_auth(self, client):
        resp = await client.get("/api/v1/ai-insights/weekly-goals")
        assert resp.status_code == 401

    async def test_biomarker_narrative_no_data_fallback(self, client, auth_headers):
        """Sin datos registrados devuelve respuesta de fallback graceful."""
        resp = await client.get(
            "/api/v1/ai-insights/biomarker-narrative",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "narrative" in data
        assert data["trend"] in ("improving", "declining", "stable", "insufficient_data")
        assert isinstance(data["highlights"], list)

    async def test_injury_risk_no_data_fallback(self, client, auth_headers):
        """Sin rutinas registradas devuelve riesgo bajo."""
        resp = await client.get(
            "/api/v1/ai-insights/injury-risk",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "risk_flags" in data
        assert data["overall_risk"] in ("low", "medium", "high")
        assert "summary" in data

    async def test_weekly_goals_returns_three_goals(self, client, auth_headers):
        """Siempre devuelve exactamente 3 goals (fallback)."""
        resp = await client.get(
            "/api/v1/ai-insights/weekly-goals",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "goals" in data
        assert len(data["goals"]) == 3
        for g in data["goals"]:
            assert "goal" in g
            assert "reasoning" in g
            assert "category" in g
        assert "week_summary" in data

    async def test_biomarker_narrative_ai_mocked(self, client, auth_headers):
        """Con AI mockeada (httpx intercepta Gemini/Groq) devuelve el JSON parseado."""
        # Seed a gamification event so the service bypasses the insufficient_data guard
        await client.post(
            "/api/v1/gamification/action",
            json={"action": "routine"},
            headers=auth_headers,
        )

        ai_json = (
            '{"narrative": "Excelente progreso este mes.",'
            ' "trend": "improving",'
            ' "highlights": ["3 entrenamientos", "peso estable", "buena racha"]}'
        )

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"choices": [{"message": {"content": ai_json}}]}
        mock_resp.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_cls:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_ctx.post = AsyncMock(return_value=mock_resp)
            mock_cls.return_value = mock_ctx

            resp = await client.get(
                "/api/v1/ai-insights/biomarker-narrative",
                headers=auth_headers,
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["narrative"] == "Excelente progreso este mes."
        assert data["trend"] == "improving"
        assert len(data["highlights"]) == 3

    async def test_weekly_goals_ai_mocked(self, client, auth_headers):
        """Con AI mockeada (httpx intercepta Gemini/Groq) devuelve los 3 goals personalizados."""
        ai_json = (
            '{"goals": ['
            '{"goal": "Completar 4 entrenamientos", "reasoning": "Subir de 3 a 4", "category": "training"},'
            '{"goal": "Registrar peso 5 días", "reasoning": "Consistencia en seguimiento", "category": "weight"},'
            '{"goal": "Dormir 8h mínimo", "reasoning": "Mejorar recuperación", "category": "recovery"}'
            '], "week_summary": "¡Esta semana, a por todas!"}'
        )

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"choices": [{"message": {"content": ai_json}}]}
        mock_resp.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_cls:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_ctx.post = AsyncMock(return_value=mock_resp)
            mock_cls.return_value = mock_ctx

            resp = await client.get(
                "/api/v1/ai-insights/weekly-goals",
                headers=auth_headers,
            )

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["goals"]) == 3
        assert data["goals"][0]["goal"] == "Completar 4 entrenamientos"
        assert data["week_summary"] == "¡Esta semana, a por todas!"

    async def test_injury_risk_all_providers_timeout_fallback(self, client, auth_headers):
        """Timeout de todos los providers → fallback graceful, no 500."""
        import httpx

        with patch("httpx.AsyncClient") as mock_cls:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_ctx.post = AsyncMock(side_effect=httpx.TimeoutException("timeout"))
            mock_cls.return_value = mock_ctx

            resp = await client.get(
                "/api/v1/ai-insights/injury-risk",
                headers=auth_headers,
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["overall_risk"] in ("low", "medium", "high")
