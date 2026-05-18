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


@pytest.mark.asyncio
async def test_gym_leaderboard_returns_display_name_not_uuid(
    client: AsyncClient, auth_headers: dict
):
    """
    Regression: GET /leaderboard?scope=gym debe devolver display_name del User,
    no un fragmento del UUID. Antes el router hacía
    `username=str(p.user_id)[:8] + "..."` y mostraba "a4f3b2c1..." al usuario.
    """
    # Crear gym (el usuario test queda como miembro automáticamente)
    gym_resp = await client.post("/api/v1/gym-servers", json={
        "name": "Test Gym Leaderboard",
        "city": "Madrid",
        "is_public": True,
    }, headers=auth_headers)
    assert gym_resp.status_code == 201, gym_resp.text
    gym_id = gym_resp.json()["id"]

    # Forzar creación del perfil ranked (lo crea on-demand al pedirlo)
    await client.get(f"{BASE}/profile", headers=auth_headers)

    # Pedir leaderboard del gym
    lb_resp = await client.get(
        f"{BASE}/leaderboard?queue=competitive&scope=gym&gym_id={gym_id}",
        headers=auth_headers,
    )
    assert lb_resp.status_code == 200, lb_resp.text
    data = lb_resp.json()
    assert len(data["entries"]) >= 1, "El creador del gym debería aparecer"

    entry = data["entries"][0]
    # display_name del registered_user fixture es "Test User"
    assert entry["username"] == "Test User", (
        f"username debe ser display_name, no UUID fragment. Got: {entry['username']!r}"
    )
    # Sanity: NUNCA puede tener "..." que era el patrón viejo del UUID truncado
    assert "..." not in entry["username"], "Patrón UUID truncado detectado"
    assert "…" not in entry["username"], "Patrón UUID truncado (ellipsis) detectado"
