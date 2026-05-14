"""
tests/integration/test_notifications.py
=========================================
Tests de integración para el módulo de notificaciones push.

TDD: estos tests se escriben ANTES que el código de producción.
Ciclo Red-Green-Refactor siguiendo superpowers:test-driven-development.
"""

import pytest

_BASE = "/api/v1/notifications"

_REGISTER_PAYLOAD = {
    "email": "notif@healthstack.com",
    "password": "SecurePass123!",
    "display_name": "Notif User",
    "consent_gdpr": True,
}


async def _get_token(client) -> str:
    """Helper: registra usuario y devuelve access_token JWT."""
    resp = await client.post("/api/v1/auth/register", json=_REGISTER_PAYLOAD)
    return resp.json()["access_token"]


@pytest.mark.asyncio
class TestRegisterFCMToken:

    async def test_register_token_success(self, client):
        """Usuario autenticado puede registrar su FCM token."""
        token = await _get_token(client)
        resp = await client.post(
            f"{_BASE}/register-token",
            json={"fcm_token": "valid-fcm-token-abc123", "platform": "web"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["registered"] is True

    async def test_register_token_requires_auth(self, client):
        """Sin JWT → 401 Unauthorized."""
        resp = await client.post(
            f"{_BASE}/register-token",
            json={"fcm_token": "some-token", "platform": "web"},
        )
        assert resp.status_code == 401

    async def test_register_token_empty_token_rejected(self, client):
        """Token FCM vacío → 422 validación Pydantic."""
        token = await _get_token(client)
        resp = await client.post(
            f"{_BASE}/register-token",
            json={"fcm_token": "", "platform": "web"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 422

    async def test_register_token_invalid_platform_rejected(self, client):
        """Platform fuera de Literal['web', 'ios', 'android'] → 422."""
        token = await _get_token(client)
        resp = await client.post(
            f"{_BASE}/register-token",
            json={"fcm_token": "valid-token", "platform": "windows"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 422

    async def test_register_token_upsert_same_user(self, client):
        """Registrar el mismo token dos veces → 201, sin duplicar filas (upsert)."""
        token = await _get_token(client)
        payload = {"fcm_token": "my-stable-token", "platform": "ios"}
        headers = {"Authorization": f"Bearer {token}"}
        await client.post(f"{_BASE}/register-token", json=payload, headers=headers)
        resp = await client.post(f"{_BASE}/register-token", json=payload, headers=headers)
        assert resp.status_code == 201
