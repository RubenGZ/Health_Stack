# tests/integration/test_gym_servers.py
"""Integration tests for gym server endpoints."""
from httpx import AsyncClient
import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _register_and_login(client: AsyncClient, email: str, display_name: str) -> dict:
    """Registra un usuario nuevo y devuelve sus headers de auth."""
    await client.post("/api/v1/auth/register", json={
        "email": email,
        "display_name": display_name,
        "password": "TestPass123!",
        "consent_gdpr": True,
    })
    login_resp = await client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "TestPass123!",
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

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


@pytest.mark.asyncio
async def test_discover_public_gyms(client: AsyncClient, auth_headers: dict):
    """GET /api/v1/gym-servers — endpoint público, sin auth requerida."""
    # Crear un gym público
    create_resp = await client.post(BASE, json=GYM_PAYLOAD, headers=auth_headers)
    assert create_resp.status_code == 201
    gym_id = create_resp.json()["id"]

    # Descubrir gyms sin token
    resp = await client.get(BASE)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1

    # Verificar estructura del objeto devuelto
    gym = next((g for g in data if g["id"] == gym_id), None)
    assert gym is not None, "El gym creado debe aparecer en el listado"
    assert gym["name"] == "CrossFit Test Gym"
    assert "invite_code" not in gym, "El listado público NO debe exponer invite_code"
    assert "member_count" in gym
    assert gym["member_count"] >= 1

    # Verificar paginación — limit=1 debe devolver solo 1
    resp_page = await client.get(f"{BASE}?limit=1&offset=0")
    assert resp_page.status_code == 200
    assert len(resp_page.json()) == 1


@pytest.mark.asyncio
async def test_leave_gym(client: AsyncClient, auth_headers: dict):
    """DELETE /api/v1/gym-servers/{gym_id}/members/me — abandonar un gym."""
    # User 1 crea gym
    create_resp = await client.post(BASE, json={**GYM_PAYLOAD, "name": "Leave Test Gym"}, headers=auth_headers)
    assert create_resp.status_code == 201
    gym = create_resp.json()
    gym_id = gym["id"]
    invite_code = gym["invite_code"]

    # User 2 se une al gym
    headers2 = await _register_and_login(client, "leave_test@test.com", "Leave Tester")
    join_resp = await client.post(f"{BASE}/join", json={"invite_code": invite_code}, headers=headers2)
    assert join_resp.status_code == 201

    # User 2 verifica que está en el gym
    my_gyms_resp = await client.get(f"{BASE}/my-gyms", headers=headers2)
    assert any(g["id"] == gym_id for g in my_gyms_resp.json())

    # User 2 abandona el gym
    leave_resp = await client.delete(f"{BASE}/{gym_id}/members/me", headers=headers2)
    assert leave_resp.status_code == 204

    # User 2 ya no aparece en my-gyms
    my_gyms_after = await client.get(f"{BASE}/my-gyms", headers=headers2)
    assert not any(g["id"] == gym_id for g in my_gyms_after.json())

    # Intentar abandonar de nuevo → 400
    leave_again = await client.delete(f"{BASE}/{gym_id}/members/me", headers=headers2)
    assert leave_again.status_code == 400
    assert "No eres miembro" in leave_again.json()["detail"]


@pytest.mark.asyncio
async def test_owner_cannot_leave_without_other_owner(client: AsyncClient, auth_headers: dict):
    """El único owner no puede abandonar el gym."""
    # User 1 crea gym y es el único owner
    create_resp = await client.post(BASE, json={**GYM_PAYLOAD, "name": "Owner Leave Test"}, headers=auth_headers)
    assert create_resp.status_code == 201
    gym_id = create_resp.json()["id"]

    # Intentar abandonar siendo el único owner → 400
    leave_resp = await client.delete(f"{BASE}/{gym_id}/members/me", headers=auth_headers)
    assert leave_resp.status_code == 400
    assert "único owner" in leave_resp.json()["detail"]
