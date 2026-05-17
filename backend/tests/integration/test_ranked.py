# tests/integration/test_ranked.py
"""Integration tests for the ranked system endpoints."""
from httpx import AsyncClient
import pytest

BASE = "/api/v1/ranked"


@pytest.mark.asyncio
async def test_get_ranked_profile_creates_defaults(client: AsyncClient, auth_headers: dict):
    """GET /profile creates profiles on first call and returns correct defaults."""
    resp = await client.get(f"{BASE}/profile", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["normal"]["tier"] == "novato"
    assert data["normal"]["division"] == 4
    assert data["normal"]["lp"] == 0
    assert data["normal"]["unlocked"] is True
    assert data["competitive"]["unlocked"] is False


@pytest.mark.asyncio
async def test_ranked_events_empty_initially(client: AsyncClient, auth_headers: dict):
    """GET /events returns empty list for new user."""
    resp = await client.get(f"{BASE}/events?queue=normal", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_ranked_requires_auth(client: AsyncClient):
    """GET /profile returns 401 without token."""
    resp = await client.get(f"{BASE}/profile")
    assert resp.status_code == 401
