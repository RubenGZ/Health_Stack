"""
tests/integration/test_injury_aware_routine.py
===============================================
Integration tests for the injury-aware routine feature.

Endpoints under test:
    GET    /api/v1/routines/injuries
    POST   /api/v1/routines/injuries
    DELETE /api/v1/routines/injuries/{id}
    POST   /api/v1/routines/ai-generate-injury-aware
"""

import pytest
import uuid

from httpx import AsyncClient

BASE_INJURIES = "/api/v1/routines/injuries"
BASE_AI = "/api/v1/routines/ai-generate-injury-aware"

INJURY_PAYLOAD = {
    "body_area": "knee",
    "injury_label": "Tendinitis rotuliana",
    "severity": "moderate",
    "notes": "Dolor al bajar escaleras",
}

AI_GENERATE_PAYLOAD = {
    "goal": "hypertrophy",
    "level": "intermediate",
    "days_per_week": 3,
    "equipment": "full_gym",
}


@pytest.mark.asyncio
class TestInjuryAwareRoutine:

    async def test_create_and_list_injury(
        self, client: AsyncClient, auth_headers: dict
    ):
        """POST /injuries crea con 201; GET /injuries lo devuelve en la lista."""
        # Create
        r_create = await client.post(
            BASE_INJURIES, json=INJURY_PAYLOAD, headers=auth_headers
        )
        assert r_create.status_code == 201, r_create.text
        created = r_create.json()
        assert created["body_area"] == "knee"
        assert created["severity"] == "moderate"
        assert created["is_active"] is True
        injury_id = created["id"]

        # List
        r_list = await client.get(BASE_INJURIES, headers=auth_headers)
        assert r_list.status_code == 200, r_list.text
        injuries = r_list.json()
        assert isinstance(injuries, list)
        ids = [inj["id"] for inj in injuries]
        assert injury_id in ids

    async def test_delete_injury_soft(
        self, client: AsyncClient, auth_headers: dict
    ):
        """DELETE /injuries/{id} devuelve 204 y la lesión desaparece de GET."""
        # Create
        r_create = await client.post(
            BASE_INJURIES, json=INJURY_PAYLOAD, headers=auth_headers
        )
        assert r_create.status_code == 201, r_create.text
        injury_id = r_create.json()["id"]

        # Delete
        r_delete = await client.delete(
            f"{BASE_INJURIES}/{injury_id}", headers=auth_headers
        )
        assert r_delete.status_code == 204, r_delete.text

        # List — should not appear anymore (soft-deleted)
        r_list = await client.get(BASE_INJURIES, headers=auth_headers)
        assert r_list.status_code == 200, r_list.text
        ids = [inj["id"] for inj in r_list.json()]
        assert injury_id not in ids

    async def test_delete_injury_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """DELETE /injuries/<random-uuid> para lesión inexistente devuelve 404."""
        random_id = str(uuid.uuid4())
        r = await client.delete(
            f"{BASE_INJURIES}/{random_id}", headers=auth_headers
        )
        assert r.status_code == 404, r.text

    async def test_ai_generate_injury_aware_no_injuries(
        self, client: AsyncClient, auth_headers: dict
    ):
        """
        POST /ai-generate-injury-aware sin lesiones → 200 con campo 'days'.
        Cuando no hay lesiones el endpoint usa el path de generate_ai_routine()
        que tiene fallback estático, por lo que no requiere Groq key.
        """
        r = await client.post(
            BASE_AI, json=AI_GENERATE_PAYLOAD, headers=auth_headers
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "days" in data
        assert isinstance(data["days"], list)

    async def test_ai_generate_injury_aware_injects_injury_context(
        self, client: AsyncClient, auth_headers: dict
    ):
        """
        Con una lesión creada, POST /ai-generate-injury-aware inyecta 'knee'
        y 'moderate' en el prompt enviado al AIRouter.
        """
        from app.main import app as fastapi_app
        from app.services.ai_router.schemas import AIResponse

        # Create a knee/moderate injury first
        r_create = await client.post(
            BASE_INJURIES, json=INJURY_PAYLOAD, headers=auth_headers
        )
        assert r_create.status_code == 201, r_create.text

        captured_prompts: list[str] = []

        class _PromptRecorder:
            async def call(self, *, use_case, request, user_id=None):
                for msg in request.messages:
                    captured_prompts.append(msg.content)
                # Return minimal valid AIRoutineResponse JSON
                fake_json = (
                    '{"label":"Test Routine",'
                    '"description":"Test desc",'
                    '"days_per_week":3,'
                    '"focus_area":"hypertrophy",'
                    '"days":['
                    '{"day_label":"Day 1","focus":"Upper","exercises":['
                    '{"name":"Press","muscle_group":"Chest","sets":3,"reps":"8-10","rest_sec":90,"notes":""}'
                    ']},'
                    '{"day_label":"Day 2","focus":"Lower","exercises":['
                    '{"name":"Squat","muscle_group":"Quads","sets":3,"reps":"8-10","rest_sec":90,"notes":""}'
                    ']},'
                    '{"day_label":"Day 3","focus":"Full","exercises":['
                    '{"name":"Row","muscle_group":"Back","sets":3,"reps":"8-10","rest_sec":90,"notes":""}'
                    ']}'
                    ']}'
                )
                return AIResponse(
                    content=fake_json,
                    provider_used="recorder",
                    model_used="recorder",
                    tokens_used=0,
                    fallback_triggered=False,
                )

        original = getattr(fastapi_app.state, "ai_router", None)
        fastapi_app.state.ai_router = _PromptRecorder()
        try:
            r = await client.post(
                BASE_AI, json=AI_GENERATE_PAYLOAD, headers=auth_headers
            )
        finally:
            fastapi_app.state.ai_router = original

        assert r.status_code == 200, r.text
        data = r.json()
        assert "days" in data

        # The prompt must have been captured
        assert captured_prompts, (
            "_PromptRecorder did not capture any prompt — check the ai_router patch"
        )

        blob = "\n".join(captured_prompts).lower()
        assert "knee" in blob, (
            f"'knee' not found in AI prompt. Prompt blob: {blob[:500]}"
        )
        assert "moderate" in blob, (
            f"'moderate' not found in AI prompt. Prompt blob: {blob[:500]}"
        )
