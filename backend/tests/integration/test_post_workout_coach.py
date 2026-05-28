"""
tests/integration/test_post_workout_coach.py
============================================
Integration tests for the Post-Workout AI Coach feature.

Endpoints under test:
    POST   /api/v1/workout/post-workout-coach
    POST   /api/v1/workout/post-workout-coach/dismiss
    GET    /api/v1/workout/post-workout-coach/{session_id}
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient

BASE_COACH = "/api/v1/workout/post-workout-coach"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SESSION_PAYLOAD = {
    "started_at": "2026-01-15T10:00:00Z",
    "finished_at": "2026-01-15T11:00:00Z",
    "notes": None,
    "exercises": [
        {
            "exercise_key": "bench_press",
            "exercise_name": "Press de banca",
            "order_index": 0,
            "sets": [
                {"set_number": 1, "weight_kg": 80.0, "reps": 8, "is_warmup": False},
                {"set_number": 2, "weight_kg": 85.0, "reps": 6, "is_warmup": False},
                {"set_number": 3, "weight_kg": 85.0, "reps": 5, "is_warmup": False},
            ],
        },
        {
            "exercise_key": "squat",
            "exercise_name": "Sentadilla",
            "order_index": 1,
            "sets": [
                {"set_number": 1, "weight_kg": 100.0, "reps": 5, "is_warmup": False},
                {"set_number": 2, "weight_kg": 100.0, "reps": 5, "is_warmup": False},
            ],
        },
    ],
}


async def _create_session_and_get_token(
    client: AsyncClient, auth_headers: dict
) -> uuid.UUID:
    """Creates a completed workout session and returns a fresh session_id UUID."""
    r = await client.post(
        "/api/v1/workout/sessions", json=SESSION_PAYLOAD, headers=auth_headers
    )
    assert r.status_code == 201, f"Failed to create workout session: {r.text}"
    # Return a fresh UUID to use as session_id for the coaching request
    return uuid.uuid4()


# ---------------------------------------------------------------------------
# Test suite
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestPostWorkoutCoach:

    async def test_generate_coaching_returns_plan(
        self, client: AsyncClient, auth_headers: dict
    ):
        """
        POST /post-workout-coach con una sesión existente devuelve 200 con
        los campos summary, tips, next_session y plan_id.
        """
        session_id = await _create_session_and_get_token(client, auth_headers)

        r = await client.post(
            BASE_COACH,
            json={"session_id": str(session_id), "notes": "Entreno fuerte hoy"},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text

        data = r.json()
        assert "summary" in data, f"Missing 'summary'. Got: {data}"
        assert "tips" in data, f"Missing 'tips'. Got: {data}"
        assert "next_session" in data, f"Missing 'next_session'. Got: {data}"
        assert "plan_id" in data, f"Missing 'plan_id'. Got: {data}"

        # Tips is a non-empty list
        assert isinstance(data["tips"], list)
        assert len(data["tips"]) >= 1

        # plan_id is a positive integer
        assert isinstance(data["plan_id"], int)
        assert data["plan_id"] > 0

        # next_session has expected fields
        ns = data["next_session"]
        assert "focus" in ns
        assert "intensity" in ns
        assert ns["intensity"] in {"light", "moderate", "hard"}

    async def test_generate_coaching_idempotent(
        self, client: AsyncClient, auth_headers: dict
    ):
        """
        POST /post-workout-coach dos veces con el mismo session_id devuelve
        el mismo plan_id (idempotencia).
        """
        session_id = await _create_session_and_get_token(client, auth_headers)
        payload = {"session_id": str(session_id), "notes": None}

        r1 = await client.post(BASE_COACH, json=payload, headers=auth_headers)
        assert r1.status_code == 200, r1.text
        plan_id_first = r1.json()["plan_id"]

        r2 = await client.post(BASE_COACH, json=payload, headers=auth_headers)
        assert r2.status_code == 200, r2.text
        plan_id_second = r2.json()["plan_id"]

        assert plan_id_first == plan_id_second, (
            f"Expected same plan_id on second call (idempotent). "
            f"Got {plan_id_first} vs {plan_id_second}"
        )

    async def test_get_plan_by_session(
        self, client: AsyncClient, auth_headers: dict
    ):
        """
        GET /post-workout-coach/{session_id} tras generar un plan devuelve 200
        con los campos plan_json, used y expires_at.
        """
        session_id = await _create_session_and_get_token(client, auth_headers)

        # Generate plan first
        r_gen = await client.post(
            BASE_COACH,
            json={"session_id": str(session_id), "notes": None},
            headers=auth_headers,
        )
        assert r_gen.status_code == 200, r_gen.text

        # Retrieve via GET
        r_get = await client.get(
            f"{BASE_COACH}/{session_id}", headers=auth_headers
        )
        assert r_get.status_code == 200, r_get.text

        data = r_get.json()
        assert "plan_json" in data, f"Missing 'plan_json'. Got: {data}"
        assert "used" in data, f"Missing 'used'. Got: {data}"
        assert "expires_at" in data, f"Missing 'expires_at'. Got: {data}"

        assert isinstance(data["plan_json"], dict)
        assert data["used"] is False  # freshly generated, not dismissed yet

    async def test_get_plan_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """
        GET /post-workout-coach/{random_uuid} para una sesión sin plan devuelve 404.
        """
        random_session_id = uuid.uuid4()
        r = await client.get(
            f"{BASE_COACH}/{random_session_id}", headers=auth_headers
        )
        assert r.status_code == 404, r.text

    async def test_dismiss_plan(
        self, client: AsyncClient, auth_headers: dict
    ):
        """
        POST /post-workout-coach/dismiss con plan_id válido devuelve 204.
        """
        session_id = await _create_session_and_get_token(client, auth_headers)

        # Generate plan
        r_gen = await client.post(
            BASE_COACH,
            json={"session_id": str(session_id), "notes": None},
            headers=auth_headers,
        )
        assert r_gen.status_code == 200, r_gen.text
        plan_id = r_gen.json()["plan_id"]

        # Dismiss it
        r_dismiss = await client.post(
            f"{BASE_COACH}/dismiss",
            json={"plan_id": plan_id},
            headers=auth_headers,
        )
        assert r_dismiss.status_code == 204, r_dismiss.text

    async def test_dismiss_plan_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """
        POST /post-workout-coach/dismiss con plan_id inexistente devuelve 404.
        """
        fake_plan_id = 999_999_999
        r = await client.post(
            f"{BASE_COACH}/dismiss",
            json={"plan_id": fake_plan_id},
            headers=auth_headers,
        )
        assert r.status_code == 404, r.text

    async def test_generate_coaching_no_auth(self, client: AsyncClient):
        """
        POST /post-workout-coach sin auth headers devuelve 401.
        """
        r = await client.post(BASE_COACH, json={"session_id": str(uuid.uuid4())})
        assert r.status_code == 401

    async def test_get_plan_no_auth(self, client: AsyncClient):
        """
        GET /post-workout-coach/{session_id} sin auth headers devuelve 401.
        """
        r = await client.get(f"{BASE_COACH}/{uuid.uuid4()}")
        assert r.status_code == 401

    async def test_dismiss_plan_no_auth(self, client: AsyncClient):
        """
        POST /post-workout-coach/dismiss sin auth headers devuelve 401.
        """
        r = await client.post(
            f"{BASE_COACH}/dismiss", json={"plan_id": 1}
        )
        assert r.status_code == 401

    async def test_coaching_prompt_contains_rgpd_safe_data(
        self, client: AsyncClient, auth_headers: dict
    ):
        """
        El prompt enviado al AIRouter NO debe contener ningún UUID (user_id,
        session_id) — cumplimiento RGPD Art. 32 / pseudonimización.
        Se usa un _PromptRecorder inline para capturar el prompt antes de
        que llegue al proveedor IA.
        """
        from app.main import app as fastapi_app
        from app.services.ai_router.schemas import AIResponse

        # Create a real workout session so the service has data to build the prompt
        await _create_session_and_get_token(client, auth_headers)

        # Use a fresh session_id UUID as idempotency key (not in DB yet → new plan)
        session_id = uuid.uuid4()
        captured_prompts: list[str] = []

        class _PromptRecorder:
            async def call(self, *, use_case, request, user_id=None):
                for msg in request.messages:
                    captured_prompts.append(msg.content)
                # Return a minimal valid coaching JSON
                fake_json = (
                    '{"summary":"Buen entreno.",'
                    '"tips":[{"category":"recovery","tip":"Descansa bien."}],'
                    '"next_session":{'
                    '"focus":"Upper body",'
                    '"suggested_exercises":["Press banca","Remo"],'
                    '"intensity":"moderate",'
                    '"estimated_duration_min":60}}'
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
                BASE_COACH,
                json={"session_id": str(session_id), "notes": None},
                headers=auth_headers,
            )
        finally:
            fastapi_app.state.ai_router = original

        assert r.status_code == 200, r.text

        # The recorder must have captured at least one prompt
        assert captured_prompts, (
            "_PromptRecorder did not capture any prompt — "
            "check that get_ai_router uses fastapi_app.state.ai_router"
        )

        # RGPD check: no UUID pattern in any prompt message
        UUID_PATTERN = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE)
        full_blob = "\n".join(captured_prompts)
        matches = UUID_PATTERN.findall(full_blob)
        assert not matches, (
            f"UUID fragment(s) found in AI prompt — RGPD violation: "
            f"{matches[:5]}\nBlob (first 500 chars): {full_blob[:500]}"
        )
