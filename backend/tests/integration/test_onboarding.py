"""
tests/integration/test_onboarding.py
======================================
Tests de integración para el endpoint POST /api/v1/auth/onboarding.

Cubre:
  - Happy path: perfil completo guardado, health_record sembrado
  - Idempotencia: segunda llamada sobreescribe sin error
  - Validaciones de campos: age < 13, age > 120, weight fuera de rango, height fuera de rango
  - Campos requeridos faltantes
  - Sin autenticación (401)
  - Valores de enums inválidos (biological_sex, activity_level, primary_fitness_goal)
  - Verificación en base de datos: campos en public.users + registro en health.health_records
  - RGPD: health_record NO contiene user_id directo (seudonimización Art. 9)
"""

from datetime import date, timedelta
import pytest
from sqlalchemy import text

# ── Fixtures ──────────────────────────────────────────────────────────────────

_ONBOARDING_URL = "/api/v1/auth/onboarding"

_VALID_PAYLOAD = {
    "biological_sex": "male",
    "birth_date": "1995-06-15",
    "current_weight_kg": 80.5,
    "height_cm": 178.0,
    "activity_level": "moderately_active",
    "primary_fitness_goal": "gain_muscle",
}


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestOnboardingHappyPath:
    """Flujo principal: usuario autenticado con datos válidos."""

    async def test_onboarding_returns_200_with_flags(self, client, auth_headers):
        resp = await client.post(_ONBOARDING_URL, json=_VALID_PAYLOAD, headers=auth_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["onboarding_completed"] is True
        assert data["health_record_seeded"] is True

    async def test_onboarding_persists_profile_in_users_table(self, client, auth_headers, db_session):
        """Los campos biométricos quedan guardados en public.users."""
        await client.post(_ONBOARDING_URL, json=_VALID_PAYLOAD, headers=auth_headers)

        row = await db_session.execute(
            text("""
                SELECT biological_sex, birth_date, current_weight_kg, height_cm,
                       activity_level, primary_fitness_goal, onboarding_completed
                FROM public.users
                WHERE email = 'test@healthstack.com'
            """)
        )
        user = row.fetchone()
        assert user is not None
        assert user.biological_sex == "male"
        assert str(user.birth_date) == "1995-06-15"
        assert float(user.current_weight_kg) == pytest.approx(80.5, abs=0.01)
        assert float(user.height_cm) == pytest.approx(178.0, abs=0.01)
        assert user.activity_level == "moderately_active"
        assert user.primary_fitness_goal == "gain_muscle"
        assert user.onboarding_completed is True

    async def test_onboarding_seeds_health_record(self, client, auth_headers, db_session):
        """Después del onboarding existe un registro baseline en health.health_records."""
        await client.post(_ONBOARDING_URL, json=_VALID_PAYLOAD, headers=auth_headers)

        row = await db_session.execute(
            text("""
                SELECT hr.weight_kg, hr.height_cm, hr.recorded_date
                FROM health.health_records hr
                JOIN public.data_links dl ON dl.health_subject_id = hr.health_subject_id
                JOIN public.users u ON u.id = dl.user_id
                WHERE u.email = 'test@healthstack.com'
                ORDER BY hr.recorded_date DESC
                LIMIT 1
            """)
        )
        record = row.fetchone()
        assert record is not None, "No se creó health record baseline"
        assert float(record.weight_kg) == pytest.approx(80.5, abs=0.01)
        assert float(record.height_cm) == pytest.approx(178.0, abs=0.01)
        assert record.recorded_date == date.today()

    async def test_onboarding_rgpd_health_record_no_direct_user_id(self, client, auth_headers, db_session):
        """
        RGPD Art. 9 — Seudonimización: health.health_records NO debe contener
        el user_id UUID directamente. Sólo health_subject_id (derivado de la
        clave AES).
        """
        await client.post(_ONBOARDING_URL, json=_VALID_PAYLOAD, headers=auth_headers)

        # Verificar que la tabla health_records NO tiene columna user_id
        col_check = await db_session.execute(
            text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'health'
                  AND table_name = 'health_records'
                  AND column_name = 'user_id'
            """)
        )
        assert col_check.fetchone() is None, (
            "RGPD VIOLATION: health.health_records contiene columna user_id directa"
        )

        # Verificar que el registro existe y sólo se accede via health_subject_id
        row = await db_session.execute(
            text("SELECT COUNT(*) FROM health.health_records")
        )
        count = row.scalar()
        assert count == 1


@pytest.mark.asyncio
class TestOnboardingIdempotency:
    """Segunda llamada sobreescribe el perfil sin error (idempotente)."""

    async def test_second_call_updates_profile(self, client, auth_headers, db_session):
        await client.post(_ONBOARDING_URL, json=_VALID_PAYLOAD, headers=auth_headers)

        updated = {**_VALID_PAYLOAD, "current_weight_kg": 75.0, "primary_fitness_goal": "lose_fat"}
        resp2 = await client.post(_ONBOARDING_URL, json=updated, headers=auth_headers)
        assert resp2.status_code == 200, resp2.text
        assert resp2.json()["onboarding_completed"] is True

        row = await db_session.execute(
            text("SELECT current_weight_kg, primary_fitness_goal FROM public.users WHERE email = 'test@healthstack.com'")
        )
        user = row.fetchone()
        assert float(user.current_weight_kg) == pytest.approx(75.0, abs=0.01)
        assert user.primary_fitness_goal == "lose_fat"


@pytest.mark.asyncio
class TestOnboardingAuth:
    """Protección del endpoint: sin token → 401."""

    async def test_onboarding_requires_auth(self, client):
        resp = await client.post(_ONBOARDING_URL, json=_VALID_PAYLOAD)
        assert resp.status_code == 401

    async def test_onboarding_invalid_token_401(self, client):
        resp = await client.post(
            _ONBOARDING_URL,
            json=_VALID_PAYLOAD,
            headers={"Authorization": "Bearer token.invalido.aqui"},
        )
        assert resp.status_code == 401


@pytest.mark.asyncio
class TestOnboardingValidation:
    """Pydantic + field_validator: datos inválidos → 422."""

    async def test_age_under_13_rejected(self, client, auth_headers):
        too_young = date.today() - timedelta(days=365 * 12)
        payload = {**_VALID_PAYLOAD, "birth_date": too_young.isoformat()}
        resp = await client.post(_ONBOARDING_URL, json=payload, headers=auth_headers)
        assert resp.status_code == 422

    async def test_age_over_120_rejected(self, client, auth_headers):
        too_old = date.today() - timedelta(days=365 * 121)
        payload = {**_VALID_PAYLOAD, "birth_date": too_old.isoformat()}
        resp = await client.post(_ONBOARDING_URL, json=payload, headers=auth_headers)
        assert resp.status_code == 422

    async def test_weight_too_low_rejected(self, client, auth_headers):
        payload = {**_VALID_PAYLOAD, "current_weight_kg": 19}
        resp = await client.post(_ONBOARDING_URL, json=payload, headers=auth_headers)
        assert resp.status_code == 422

    async def test_weight_too_high_rejected(self, client, auth_headers):
        payload = {**_VALID_PAYLOAD, "current_weight_kg": 501}
        resp = await client.post(_ONBOARDING_URL, json=payload, headers=auth_headers)
        assert resp.status_code == 422

    async def test_height_too_low_rejected(self, client, auth_headers):
        payload = {**_VALID_PAYLOAD, "height_cm": 49}
        resp = await client.post(_ONBOARDING_URL, json=payload, headers=auth_headers)
        assert resp.status_code == 422

    async def test_height_too_high_rejected(self, client, auth_headers):
        payload = {**_VALID_PAYLOAD, "height_cm": 301}
        resp = await client.post(_ONBOARDING_URL, json=payload, headers=auth_headers)
        assert resp.status_code == 422

    async def test_invalid_biological_sex(self, client, auth_headers):
        payload = {**_VALID_PAYLOAD, "biological_sex": "other"}
        resp = await client.post(_ONBOARDING_URL, json=payload, headers=auth_headers)
        assert resp.status_code == 422

    async def test_invalid_activity_level(self, client, auth_headers):
        payload = {**_VALID_PAYLOAD, "activity_level": "extremely_active"}
        resp = await client.post(_ONBOARDING_URL, json=payload, headers=auth_headers)
        assert resp.status_code == 422

    async def test_invalid_primary_fitness_goal(self, client, auth_headers):
        payload = {**_VALID_PAYLOAD, "primary_fitness_goal": "look_swole"}
        resp = await client.post(_ONBOARDING_URL, json=payload, headers=auth_headers)
        assert resp.status_code == 422

    async def test_missing_required_field(self, client, auth_headers):
        """Sin biological_sex → 422."""
        payload = {k: v for k, v in _VALID_PAYLOAD.items() if k != "biological_sex"}
        resp = await client.post(_ONBOARDING_URL, json=payload, headers=auth_headers)
        assert resp.status_code == 422

    async def test_female_user_accepted(self, client, auth_headers):
        """Verificar que 'female' también es válido."""
        payload = {**_VALID_PAYLOAD, "biological_sex": "female"}
        resp = await client.post(_ONBOARDING_URL, json=payload, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["onboarding_completed"] is True

    async def test_all_activity_levels_accepted(self, client, auth_headers):
        """Todos los niveles de actividad válidos deben ser aceptados."""
        valid_levels = ["sedentary", "lightly_active", "moderately_active", "very_active"]
        for level in valid_levels:
            payload = {**_VALID_PAYLOAD, "activity_level": level}
            resp = await client.post(_ONBOARDING_URL, json=payload, headers=auth_headers)
            assert resp.status_code == 200, f"Falló para activity_level={level}: {resp.text}"

    async def test_all_fitness_goals_accepted(self, client, auth_headers):
        """Todos los objetivos de fitness válidos deben ser aceptados."""
        valid_goals = ["lose_fat", "maintain", "gain_muscle", "increase_strength"]
        for goal in valid_goals:
            payload = {**_VALID_PAYLOAD, "primary_fitness_goal": goal}
            resp = await client.post(_ONBOARDING_URL, json=payload, headers=auth_headers)
            assert resp.status_code == 200, f"Falló para primary_fitness_goal={goal}: {resp.text}"

    async def test_boundary_weight_20_rejected(self, client, auth_headers):
        """Límite exacto: weight == 20 (gt=20, no >=) → 422."""
        payload = {**_VALID_PAYLOAD, "current_weight_kg": 20}
        resp = await client.post(_ONBOARDING_URL, json=payload, headers=auth_headers)
        assert resp.status_code == 422

    async def test_boundary_weight_500_rejected(self, client, auth_headers):
        """Límite exacto: weight == 500 (lt=500, no <=) → 422."""
        payload = {**_VALID_PAYLOAD, "current_weight_kg": 500}
        resp = await client.post(_ONBOARDING_URL, json=payload, headers=auth_headers)
        assert resp.status_code == 422
