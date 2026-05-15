# tests/integration/test_gym_servers.py
"""Integration tests for gym server endpoints."""
import pytest
from httpx import AsyncClient

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
