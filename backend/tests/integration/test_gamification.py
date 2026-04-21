"""
tests/integration/test_gamification.py
=========================================
Tests de integración para el módulo de gamificación.

Respuesta real: GamificationStateResponse
  - xp_total: int          (NO "xp")
  - level: int
  - streak_days: int
  - weight_count, routine_count, post_count, tdee_calc: int
  - badge_latest: str | None
  - xp_to_next_level: int
  - level_progress_pct: float
"""
import pytest


@pytest.mark.asyncio
class TestGamification:

    async def test_state_requires_auth(self, client):
        resp = await client.get("/api/v1/gamification/state")
        assert resp.status_code == 401

    async def test_state_initial(self, client, auth_headers):
        resp = await client.get("/api/v1/gamification/state", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["xp_total"] == 0
        assert data["level"] == 1
        assert data["streak_days"] == 0

    async def test_action_requires_auth(self, client):
        resp = await client.post("/api/v1/gamification/action", json={"action": "weight"})
        assert resp.status_code == 401

    async def test_valid_action_grants_xp(self, client, auth_headers):
        resp = await client.post("/api/v1/gamification/action",
                                  json={"action": "weight"}, headers=auth_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["xp_total"] > 0

    async def test_routine_action_grants_more_xp(self, client, auth_headers):
        resp = await client.post("/api/v1/gamification/action",
                                  json={"action": "routine"}, headers=auth_headers)
        assert resp.status_code == 200, resp.text
        # routine otorga al menos 20 XP
        assert resp.json()["xp_total"] >= 20

    async def test_invalid_action_fails(self, client, auth_headers):
        """Acciones no reconocidas devuelven 422 (validación de Pydantic)."""
        resp = await client.post("/api/v1/gamification/action",
                                  json={"action": "accion_inventada"}, headers=auth_headers)
        assert resp.status_code == 422

    async def test_xp_accumulates(self, client, auth_headers):
        await client.post("/api/v1/gamification/action",
                          json={"action": "weight"}, headers=auth_headers)
        await client.post("/api/v1/gamification/action",
                          json={"action": "routine"}, headers=auth_headers)
        resp = await client.get("/api/v1/gamification/state", headers=auth_headers)
        assert resp.json()["xp_total"] >= 30
