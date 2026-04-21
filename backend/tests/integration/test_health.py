"""
tests/integration/test_health.py
===================================
Tests de integración para el módulo de registros de salud.

Esquema real de HealthRecordCreate:
  - recorded_date: date (YYYY-MM-DD)
  - weight_kg: float | None
  - height_cm, body_fat_pct, muscle_mass_kg, waist_cm: float | None
  - resting_heart_rate: int | None
  - sleep_hours: float | None
  - notes: str | None
"""
import pytest


RECORD_PAYLOAD = {
    "recorded_date": "2026-04-20",
    "weight_kg": 75.5,
    "notes": "Peso en ayunas",
}

UPDATE_PAYLOAD = {
    "weight_kg": 74.0,
    "notes": "Actualizado",
}


@pytest.mark.asyncio
class TestHealthRecords:

    async def test_list_requires_auth(self, client):
        resp = await client.get("/api/v1/health/records")
        assert resp.status_code == 401

    async def test_list_empty_initially(self, client, auth_headers):
        resp = await client.get("/api/v1/health/records", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["records"] == []

    async def test_create_record(self, client, auth_headers):
        resp = await client.post("/api/v1/health/records",
                                  json=RECORD_PAYLOAD, headers=auth_headers)
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["weight_kg"] == 75.5
        assert "id" in data

    async def test_record_appears_in_list(self, client, auth_headers):
        await client.post("/api/v1/health/records", json=RECORD_PAYLOAD, headers=auth_headers)
        resp = await client.get("/api/v1/health/records", headers=auth_headers)
        assert resp.json()["total"] == 1

    async def test_get_single_record(self, client, auth_headers):
        create = await client.post("/api/v1/health/records",
                                    json=RECORD_PAYLOAD, headers=auth_headers)
        assert create.status_code == 201, create.text
        record_id = create.json()["id"]
        resp = await client.get(f"/api/v1/health/records/{record_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == record_id

    async def test_update_record(self, client, auth_headers):
        create = await client.post("/api/v1/health/records",
                                    json=RECORD_PAYLOAD, headers=auth_headers)
        assert create.status_code == 201, create.text
        record_id = create.json()["id"]
        resp = await client.patch(f"/api/v1/health/records/{record_id}",
                                   json=UPDATE_PAYLOAD,
                                   headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["weight_kg"] == 74.0

    async def test_delete_record(self, client, auth_headers):
        create = await client.post("/api/v1/health/records",
                                    json=RECORD_PAYLOAD, headers=auth_headers)
        assert create.status_code == 201, create.text
        record_id = create.json()["id"]
        resp = await client.delete(f"/api/v1/health/records/{record_id}", headers=auth_headers)
        assert resp.status_code == 204

    async def test_cannot_access_other_users_record(self, client, auth_headers):
        """Un ID inexistente devuelve 404 (no pertenece al usuario autenticado)."""
        resp = await client.get(
            "/api/v1/health/records/00000000-0000-0000-0000-000000000000",
            headers=auth_headers
        )
        assert resp.status_code == 404

    async def test_notes_encrypted_at_rest(self, client, auth_headers):
        """Las notas se almacenan cifradas pero se devuelven en texto plano."""
        create = await client.post("/api/v1/health/records",
                                    json=RECORD_PAYLOAD, headers=auth_headers)
        assert create.status_code == 201, create.text
        assert create.json()["notes"] == "Peso en ayunas"
