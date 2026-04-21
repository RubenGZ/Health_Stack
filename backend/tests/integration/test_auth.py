"""
tests/integration/test_auth.py
================================
Tests de integración para los endpoints de autenticación.
"""

import pytest


REGISTER_PAYLOAD = {
    "email": "integration@healthstack.com",
    "password": "SecurePass123!",
    "display_name": "Integration User",
    "consent_gdpr": True,
}

_REFRESH_URL = "/api/v1/auth/refresh"
_LOGOUT_URL  = "/api/v1/auth/logout"


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
        payload = {**REGISTER_PAYLOAD, "consent_gdpr": False, "email": "other@test.com"}
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


@pytest.mark.asyncio
class TestRefreshRotation:
    """Verifica que /auth/refresh rota el token y revoca el antiguo (ADR-001-B)."""

    async def test_refresh_issues_new_pair(self, client, registered_user):
        """Un refresh token válido produce un par nuevo (access + refresh)."""
        resp = await client.post(_REFRESH_URL, json={
            "refresh_token": registered_user["refresh_token"]
        })
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        # El nuevo refresh token debe ser diferente al original
        assert data["refresh_token"] != registered_user["refresh_token"]

    async def test_refresh_old_token_revoked(self, client, registered_user):
        """Tras la rotación el refresh token antiguo queda revocado → 401."""
        old_rt = registered_user["refresh_token"]
        # Primera rotación — OK
        resp1 = await client.post(_REFRESH_URL, json={"refresh_token": old_rt})
        assert resp1.status_code == 200
        # Reutilizar el token antiguo → debe fallar (token reuse attack detection)
        resp2 = await client.post(_REFRESH_URL, json={"refresh_token": old_rt})
        assert resp2.status_code == 401

    async def test_refresh_chained_rotations(self, client, registered_user):
        """La cadena de rotaciones funciona: cada token nuevo sirve para el siguiente."""
        rt = registered_user["refresh_token"]
        for _ in range(3):
            resp = await client.post(_REFRESH_URL, json={"refresh_token": rt})
            assert resp.status_code == 200, f"Rotación falló: {resp.text}"
            rt = resp.json()["refresh_token"]

    async def test_refresh_invalid_token_fails(self, client):
        """Token JWT con firma incorrecta → 401."""
        resp = await client.post(_REFRESH_URL, json={"refresh_token": "token.invalido.aqui"})
        assert resp.status_code == 401

    async def test_refresh_access_token_rejected(self, client, registered_user):
        """Un access token NO puede usarse como refresh token → 401."""
        resp = await client.post(_REFRESH_URL, json={
            "refresh_token": registered_user["access_token"]
        })
        assert resp.status_code == 401


@pytest.mark.asyncio
class TestLogout:
    """Verifica que /auth/logout revoca el refresh token (ADR-001-B)."""

    async def test_logout_returns_204(self, client, registered_user):
        """Logout con refresh token válido → 204 No Content."""
        resp = await client.post(_LOGOUT_URL, json={
            "refresh_token": registered_user["refresh_token"]
        })
        assert resp.status_code == 204

    async def test_logout_revokes_refresh_token(self, client, registered_user):
        """Después del logout el refresh token no puede usarse para /refresh."""
        rt = registered_user["refresh_token"]
        # Logout
        await client.post(_LOGOUT_URL, json={"refresh_token": rt})
        # Intentar renovar con el token revocado → 401
        resp = await client.post(_REFRESH_URL, json={"refresh_token": rt})
        assert resp.status_code == 401

    async def test_logout_is_idempotent(self, client, registered_user):
        """Hacer logout dos veces con el mismo token no lanza error (204 ambas veces)."""
        rt = registered_user["refresh_token"]
        resp1 = await client.post(_LOGOUT_URL, json={"refresh_token": rt})
        resp2 = await client.post(_LOGOUT_URL, json={"refresh_token": rt})
        assert resp1.status_code == 204
        assert resp2.status_code == 204

    async def test_logout_invalid_token_is_ignored(self, client):
        """Token completamente inválido en logout → 204 (no revelar info)."""
        resp = await client.post(_LOGOUT_URL, json={"refresh_token": "basura.total.aqui"})
        assert resp.status_code == 204
