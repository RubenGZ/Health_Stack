# tests/integration/test_workout_sessions.py
"""Tests de integración para workout sessions API."""
from httpx import AsyncClient
import pytest

BASE = "/api/v1/workout"

SESSION_PAYLOAD = {
    "started_at": "2026-05-15T10:00:00Z",
    "finished_at": "2026-05-15T11:15:00Z",
    "notes": "Test session",
    "exercises": [
        {
            "exercise_key": "press_banca_plano",
            "exercise_name": "Press banca plano",
            "order_index": 0,
            "sets": [
                {"set_number": 1, "weight_kg": 60.0, "reps": 10, "is_warmup": True},
                {"set_number": 2, "weight_kg": 80.0, "reps": 8,  "is_warmup": False},
                {"set_number": 3, "weight_kg": 82.5, "reps": 6,  "is_warmup": False},
            ],
        }
    ],
}


@pytest.mark.asyncio
async def test_create_session_success(client: AsyncClient, auth_headers: dict):
    resp = await client.post(f"{BASE}/sessions", json=SESSION_PAYLOAD, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["session_id"] > 0
    # working sets: 80*8 + 82.5*6 = 640 + 495 = 1135
    assert data["total_volume_kg"] == pytest.approx(1135.0, abs=1.0)
    assert isinstance(data["prs"], list)


@pytest.mark.asyncio
async def test_create_session_detects_pr(client: AsyncClient, auth_headers: dict):
    # Primera sesión establece baseline
    await client.post(f"{BASE}/sessions", json=SESSION_PAYLOAD, headers=auth_headers)

    # Segunda sesión con más peso → debe detectar PR
    import copy
    heavy = copy.deepcopy(SESSION_PAYLOAD)
    heavy["started_at"] = "2026-05-16T10:00:00Z"
    heavy["finished_at"] = "2026-05-16T11:15:00Z"
    heavy["exercises"][0]["sets"][2] = {
        "set_number": 3, "weight_kg": 100.0, "reps": 8, "is_warmup": False
    }
    resp = await client.post(f"{BASE}/sessions", json=heavy, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert any(pr["exercise_key"] == "press_banca_plano" for pr in data["prs"])


@pytest.mark.asyncio
async def test_list_sessions(client: AsyncClient, auth_headers: dict):
    await client.post(f"{BASE}/sessions", json=SESSION_PAYLOAD, headers=auth_headers)
    resp = await client.get(f"{BASE}/sessions", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total"] >= 1
    assert len(data["sessions"]) >= 1
    assert "exercises" in data["sessions"][0]


@pytest.mark.asyncio
async def test_get_session_detail(client: AsyncClient, auth_headers: dict):
    create_resp = await client.post(f"{BASE}/sessions", json=SESSION_PAYLOAD, headers=auth_headers)
    session_id = create_resp.json()["session_id"]

    resp = await client.get(f"{BASE}/sessions/{session_id}", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert len(data["exercises"]) == 1
    assert len(data["exercises"][0]["sets"]) == 3


@pytest.mark.asyncio
async def test_exercise_history(client: AsyncClient, auth_headers: dict):
    await client.post(f"{BASE}/sessions", json=SESSION_PAYLOAD, headers=auth_headers)
    resp = await client.get(f"{BASE}/history/press_banca_plano", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert len(data["sessions"]) >= 1
    assert data["sessions"][0]["estimated_1rm"] > data["sessions"][0]["max_weight_kg"]


@pytest.mark.asyncio
async def test_session_requires_auth(client: AsyncClient):
    resp = await client.post(f"{BASE}/sessions", json=SESSION_PAYLOAD)
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_session_not_found_returns_404(client: AsyncClient, auth_headers: dict):
    resp = await client.get(f"{BASE}/sessions/99999", headers=auth_headers)
    assert resp.status_code == 404
