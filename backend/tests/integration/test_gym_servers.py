# tests/integration/test_gym_servers.py
"""Integration tests for gym server endpoints."""
from httpx import AsyncClient
import pytest

BASE = "/api/v1/gym-servers"

GYM_PAYLOAD = {
    "name": "CrossFit Test Gym",
    "description": "Gym de prueba",
    "city": "Madrid",
    "is_public": True,
}


@pytest.mark.asyncio
async def test_create_gym(client: AsyncClient, auth_headers: dict):
    resp = await client.post(BASE, json=GYM_PAYLOAD, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "CrossFit Test Gym"
    assert len(data["invite_code"]) == 8
    assert data["member_count"] == 1


@pytest.mark.asyncio
async def test_my_gyms_after_create(client: AsyncClient, auth_headers: dict):
    await client.post(BASE, json=GYM_PAYLOAD, headers=auth_headers)
    resp = await client.get(f"{BASE}/my-gyms", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


@pytest.mark.asyncio
async def test_join_gym_by_invite_code(client: AsyncClient, auth_headers: dict):
    # Create gym as user 1
    create_resp = await client.post(BASE, json=GYM_PAYLOAD, headers=auth_headers)
    assert create_resp.status_code == 201
    invite_code = create_resp.json()["invite_code"]

    # Register and log in as user 2
    await client.post("/api/v1/auth/register", json={
        "email": "gym_joiner@test.com",
        "display_name": "Gym Joiner",
        "password": "TestPass123!",
        "consent_gdpr": True,
    })
    login_resp = await client.post("/api/v1/auth/login", json={
        "email": "gym_joiner@test.com",
        "password": "TestPass123!",
    })
    assert login_resp.status_code == 200
    token2 = login_resp.json()["access_token"]
    headers2 = {"Authorization": f"Bearer {token2}"}

    resp = await client.post(f"{BASE}/join", json={"invite_code": invite_code}, headers=headers2)
    assert resp.status_code == 201
    assert resp.json()["joined"] is True


@pytest.mark.asyncio
async def test_gym_requires_auth(client: AsyncClient):
    resp = await client.post(BASE, json=GYM_PAYLOAD)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_sparrings_returns_display_name_not_uuid(
    client: AsyncClient, auth_headers: dict
):
    """
    Regression: GET /{gym_id}/sparrings debe devolver display_name (no user_id UUID).
    Antes la response incluía `"user_id": str(membership.user_id)`, lo que filtraba
    el UUID de cada miembro a todos los demás miembros del gym.
    """
    # User 1 crea gym
    create_resp = await client.post(BASE, json=GYM_PAYLOAD, headers=auth_headers)
    assert create_resp.status_code == 201
    gym = create_resp.json()
    gym_id = gym["id"]
    invite_code = gym["invite_code"]

    # User 2 se registra, se une al gym, y activa perfil público con sparring
    await client.post("/api/v1/auth/register", json={
        "email": "sparring_user@test.com",
        "display_name": "Spar Partner",
        "password": "TestPass123!",
        "consent_gdpr": True,
    })
    login_resp = await client.post("/api/v1/auth/login", json={
        "email": "sparring_user@test.com",
        "password": "TestPass123!",
    })
    token2 = login_resp.json()["access_token"]
    headers2 = {"Authorization": f"Bearer {token2}"}

    await client.post(f"{BASE}/join", json={"invite_code": invite_code}, headers=headers2)

    # User 2 activa su perfil de sparring público
    patch_resp = await client.patch(
        f"{BASE}/my-profile/{gym_id}",
        json={
            "profile_public": True,
            "training_schedule": "morning",
            "training_goal": "strength",
            "contact_info": "https://example.com/contact",
        },
        headers=headers2,
    )
    assert patch_resp.status_code in (200, 204), patch_resp.text

    # User 1 ve la lista de sparring → debe ver "Spar Partner", no UUID
    sparr_resp = await client.get(f"{BASE}/{gym_id}/sparrings", headers=auth_headers)
    assert sparr_resp.status_code == 200, sparr_resp.text
    data = sparr_resp.json()
    assert len(data) == 1, "Debe verse al user 2"

    spar = data[0]
    # Garantía RGPD: NO debe exponerse el user_id
    assert "user_id" not in spar, f"Sparring response no debe exponer user_id (UUID): {spar!r}"
    # SÍ debe exponerse display_name
    assert spar.get("display_name") == "Spar Partner", (
        f"display_name esperado 'Spar Partner', got {spar.get('display_name')!r}"
    )
