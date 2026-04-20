"""
tests/integration/test_routines.py
=====================================
Tests de integración para el módulo de rutinas.
"""

import pytest

ROUTINE_PAYLOAD = {
    "label": "Rutina Fuerza 5x5",
    "routine_json": '{"days": ["lunes", "miercoles"], "exercises": [{"name": "Sentadilla", "sets": 5, "reps": 5}]}',
}


@pytest.mark.asyncio
class TestRoutines:

    async def test_list_empty(self, client, auth_headers):
        resp = await client.get("/api/v1/routines/", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["routines"] == []

    async def test_create_routine(self, client, auth_headers):
        resp = await client.post("/api/v1/routines/", json=ROUTINE_PAYLOAD, headers=auth_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["label"] == ROUTINE_PAYLOAD["label"]
        assert "id" in data
        assert "created_at" in data

    async def test_list_after_create(self, client, auth_headers):
        await client.post("/api/v1/routines/", json=ROUTINE_PAYLOAD, headers=auth_headers)
        resp = await client.get("/api/v1/routines/", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    async def test_delete_routine(self, client, auth_headers):
        create = await client.post("/api/v1/routines/", json=ROUTINE_PAYLOAD, headers=auth_headers)
        routine_id = create.json()["id"]
        resp = await client.delete(f"/api/v1/routines/{routine_id}", headers=auth_headers)
        assert resp.status_code == 204

    async def test_delete_nonexistent_routine(self, client, auth_headers):
        resp = await client.delete("/api/v1/routines/00000000-0000-0000-0000-000000000000", headers=auth_headers)
        assert resp.status_code == 404

    async def test_create_requires_auth(self, client):
        resp = await client.post("/api/v1/routines/", json=ROUTINE_PAYLOAD)
        assert resp.status_code == 401
