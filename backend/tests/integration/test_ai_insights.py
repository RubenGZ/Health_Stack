"""
tests/integration/test_ai_insights.py
========================================
Tests de integración para el módulo ai_insights.
"""

import pytest


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
        """AIRouter inyectado con RecorderAIRouter → endpoint parsea el JSON devuelto."""
        from app.main import app as fastapi_app
        from app.services.ai_router.schemas import AIResponse

        # Seed para superar el guard de insufficient_data
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

        class _NarrativeRecorder:
            async def call(self, *, use_case, request, user_id=None):
                return AIResponse(
                    content=ai_json,
                    provider_used="recorder",
                    model_used="recorder",
                    tokens_used=0,
                    fallback_triggered=False,
                )

        original = getattr(fastapi_app.state, "ai_router", None)
        fastapi_app.state.ai_router = _NarrativeRecorder()
        try:
            resp = await client.get(
                "/api/v1/ai-insights/biomarker-narrative",
                headers=auth_headers,
            )
        finally:
            fastapi_app.state.ai_router = original

        assert resp.status_code == 200
        data = resp.json()
        assert data["narrative"] == "Excelente progreso este mes."
        assert data["trend"] == "improving"
        assert len(data["highlights"]) == 3

    async def test_weekly_goals_ai_mocked(self, client, auth_headers):
        """AIRouter inyectado devuelve 3 goals personalizados → endpoint los parsea."""
        from app.main import app as fastapi_app
        from app.services.ai_router.schemas import AIResponse

        ai_json = (
            '{"goals": ['
            '{"goal": "Completar 4 entrenamientos", "reasoning": "Subir de 3 a 4", "category": "training"},'
            '{"goal": "Registrar peso 5 días", "reasoning": "Consistencia en seguimiento", "category": "weight"},'
            '{"goal": "Dormir 8h mínimo", "reasoning": "Mejorar recuperación", "category": "recovery"}'
            '], "week_summary": "¡Esta semana, a por todas!"}'
        )

        class _GoalsRecorder:
            async def call(self, *, use_case, request, user_id=None):
                return AIResponse(
                    content=ai_json,
                    provider_used="recorder",
                    model_used="recorder",
                    tokens_used=0,
                    fallback_triggered=False,
                )

        original = getattr(fastapi_app.state, "ai_router", None)
        fastapi_app.state.ai_router = _GoalsRecorder()
        try:
            resp = await client.get(
                "/api/v1/ai-insights/weekly-goals",
                headers=auth_headers,
            )
        finally:
            fastapi_app.state.ai_router = original

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["goals"]) == 3
        assert data["goals"][0]["goal"] == "Completar 4 entrenamientos"
        assert data["week_summary"] == "¡Esta semana, a por todas!"

    async def test_injury_risk_all_providers_timeout_fallback(self, client, auth_headers):
        """AIRouter lanza excepción → injury-risk devuelve fallback graceful, no 500."""
        from app.main import app as fastapi_app

        class _ErrorRouter:
            async def call(self, *, use_case, request, user_id=None):
                raise RuntimeError("All providers timed out")

        original = getattr(fastapi_app.state, "ai_router", None)
        fastapi_app.state.ai_router = _ErrorRouter()
        try:
            resp = await client.get(
                "/api/v1/ai-insights/injury-risk",
                headers=auth_headers,
            )
        finally:
            fastapi_app.state.ai_router = original

        assert resp.status_code == 200
        data = resp.json()
        assert data["overall_risk"] in ("low", "medium", "high")

    async def test_ai_prompts_never_contain_pii(self, client, auth_headers, registered_user):
        """
        RGPD Art. 25 — Privacy by design.

        Verifica que NINGUNO de los tres endpoints de ai_insights envía
        identificadores personales (user_id, email, display_name) ni el
        health_subject_id en el prompt que se manda al AIRouter.

        Patrón: sustituye `app.state.ai_router` por un Recorder que captura
        cada AIRequest y luego comprueba el contenido. El test es agnóstico
        del proveedor concreto (Groq, Gemini, Cerebras).
        """
        from app.main import app as fastapi_app
        from app.services.ai_router.schemas import AIResponse

        user_id = registered_user["user"]["id"]
        email = registered_user["user"]["email"]
        display_name = registered_user["user"].get("display_name", "")

        # Seed un evento de gamification para pasar el guard de "insufficient_data"
        await client.post(
            "/api/v1/gamification/action",
            json={"action": "routine"},
            headers=auth_headers,
        )

        captured_prompts: list[str] = []

        class RecorderAIRouter:
            async def call(self, *, use_case, request, user_id=None):
                # Capturar todos los mensajes del request
                for msg in request.messages:
                    captured_prompts.append(msg.content)
                # Devolver una respuesta JSON válida para que el endpoint no caiga al fallback
                fake_json = (
                    '{"narrative":"x","trend":"stable","highlights":["a","b","c"],'
                    '"risk_flags":[],"overall_risk":"low","summary":"x",'
                    '"goals":[{"goal":"x","reasoning":"y","category":"training"},'
                    '{"goal":"x","reasoning":"y","category":"weight"},'
                    '{"goal":"x","reasoning":"y","category":"recovery"}],'
                    '"week_summary":"x"}'
                )
                return AIResponse(
                    content=fake_json,
                    provider_used="recorder",
                    model_used="recorder",
                    tokens_used=0,
                    fallback_triggered=False,
                )

        original_router = getattr(fastapi_app.state, "ai_router", None)
        fastapi_app.state.ai_router = RecorderAIRouter()

        try:
            await client.get("/api/v1/ai-insights/biomarker-narrative", headers=auth_headers)
            await client.get("/api/v1/ai-insights/injury-risk", headers=auth_headers)
            await client.get("/api/v1/ai-insights/weekly-goals", headers=auth_headers)
        finally:
            fastapi_app.state.ai_router = original_router

        assert captured_prompts, "El RecorderAIRouter no capturó ningún prompt — revisa el patch"

        # Construir blob con todos los prompts concatenados para comprobar contenido
        blob = "\n---\n".join(captured_prompts).lower()

        # Identificadores que NUNCA deben aparecer en un prompt enviado a IA externa
        forbidden = [
            user_id.lower(),        # UUID del usuario
            email.lower(),          # email — siempre PII
            "test@healthstack.com",
        ]
        if display_name:
            forbidden.append(display_name.lower())

        for token in forbidden:
            assert token not in blob, (
                f"RGPD VIOLATION: el identificador '{token}' apareció en un prompt enviado a IA. "
                f"Revisa _build_anonymous_ai_context() en ai_insights/service.py"
            )

        # Tokens que sugieren que se está pasando texto libre del usuario
        suspicious = ["bearer", "jwt", "token=", "password", "health_subject_id"]
        for token in suspicious:
            assert token not in blob, (
                f"RGPD VIOLATION: el token sospechoso '{token}' apareció en un prompt"
            )

    async def test_weekly_goals_cache_hit_skips_ai(self, client, auth_headers):
        """Segunda llamada idéntica usa caché — el AIRouter NO se vuelve a invocar."""
        from app.main import app as fastapi_app
        from app.services.ai_router.schemas import AIResponse

        ai_json = (
            '{"goals": ['
            '{"goal": "Objetivo cacheado", "reasoning": "Test", "category": "training"},'
            '{"goal": "Objetivo 2", "reasoning": "Test 2", "category": "weight"},'
            '{"goal": "Objetivo 3", "reasoning": "Test 3", "category": "recovery"}'
            '], "week_summary": "Semana desde caché"}'
        )

        call_count = 0

        class _CountingRecorder:
            async def call(self, *, use_case, request, user_id=None):
                nonlocal call_count
                call_count += 1
                return AIResponse(
                    content=ai_json,
                    provider_used="recorder",
                    model_used="recorder",
                    tokens_used=0,
                    fallback_triggered=False,
                )

        original = getattr(fastapi_app.state, "ai_router", None)
        fastapi_app.state.ai_router = _CountingRecorder()
        try:
            # Primera llamada → invoca AIRouter, guarda en caché
            resp1 = await client.get("/api/v1/ai-insights/weekly-goals", headers=auth_headers)
            # Segunda llamada → debe venir de caché, AIRouter no se invoca
            resp2 = await client.get("/api/v1/ai-insights/weekly-goals", headers=auth_headers)
        finally:
            fastapi_app.state.ai_router = original

        assert resp1.status_code == 200
        assert resp2.status_code == 200
        # El AIRouter solo debe haberse invocado UNA vez (la segunda viene de caché)
        assert call_count <= 1, f"El AIRouter se invocó {call_count} veces — la caché no funcionó"
        # Ambas respuestas deben ser coherentes
        assert resp1.json()["week_summary"] == resp2.json()["week_summary"]
