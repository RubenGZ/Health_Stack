"""
tests/integration/test_auth.py
================================
Tests de integración para los endpoints de autenticación.
"""

import pytest


REGISTER_PAYLOAD = {
    "email": "integration@healthstack.com",
    "password": "SecurePass123!",
    "full_name": "Integration User",
    "gdpr_consent": True,
}


@pytest.mark.asyncio
class TestRegister:

    async def test_register_success(self, client):
        resp = await client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
        assert resp.status_code == 201
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_register_duplicate_email(self, client):
        await client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
        resp = await client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
        assert resp.status_code == 409

    async def test_register_without_gdpr_fails(self, client):
        payload = {**REGISTER_PAYLOAD, "gdpr_consent": False, "email": "other@test.com"}
        resp = await client.post("/api/v1/auth/register", json=payload)
        assert resp.status_code == 422

    async def test_register_invalid_email_fails(self, client):
        payload = {**REGISTER_PAYLOAD, "email": "not-an-email"}
        resp = await client.post("/api/v1/auth/register", json=payload)
        assert resp.status_code == 422


@pytest.mark.asyncio
class TestLogin:

    async def test_login_success(self, client):
        await client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
        resp = await client.post("/api/v1/auth/login", json={
            "email": REGISTER_PAYLOAD["email"],
            "password": REGISTER_PAYLOAD["password"],
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    async def test_login_wrong_password(self, client):
        await client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
        resp = await client.post("/api/v1/auth/login", json={
            "email": REGISTER_PAYLOAD["email"],
            "password": "wrong_password",
        })
        assert resp.status_code == 401

    async def test_login_unknown_email(self, client):
        resp = await client.post("/api/v1/auth/login", json={
            "email": "noexiste@test.com",
            "password": "whatever",
        })
        assert resp.status_code == 401


@pytest.mark.asyncio
class TestMe:

    async def test_me_authenticated(self, client, registered_user, auth_headers):
        resp = await client.get("/api/v1/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "test@healthstack.com"

    async def test_me_no_token(self, client):
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    async def test_me_invalid_token(self, client):
        resp = await client.get("/api/v1/auth/me", headers={
            "Authorization": "Bearer token.falso.aqui"
        })
        assert resp.status_code == 401
