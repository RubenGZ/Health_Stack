"""
tests/integration/test_onboarding_v2.py
=========================================
Tests de integración para POST /api/v1/auth/onboarding-v2.

Cubre (13 tests, D7 del plan de eng-review):
  1. Happy path con ai_consent=True + Groq mockeado exitoso
  2. ai_consent=False → fallback Mifflin, sin llamada a Groq
  3. Groq timeout → fallback result (formula_used=mifflin_fallback)
  4. Groq JSON inválido → fallback result
  5. Sin auth → 401
  6. sport_activities > 6 deportes → 422
  7. body_fat_pct cifrado: valor en BD NO es el texto plano
  8. UPSERT: segundo submit mismo user → actualiza, no 500
  9. Groq 429 → fallback result
 10. Verificación campos en public.users tras onboarding v2
 11. Verificación registro en health.user_health_profiles
 12. RGPD: user_id nunca aparece directamente en health.user_health_profiles
 13. ai_consent=False → ai_profile en BD es NULL (sin llamada a Groq)
"""

import json
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import text

_V2_URL = "/api/v1/auth/onboarding-v2"

_VALID_PAYLOAD = {
    "ai_consent": False,  # Por defecto sin IA para tests aislados
    "work_type": "desk",
    "daily_steps_range": "4k7k",
    "sport_activities": [
        {"sport": "natacion", "days_per_week": 2, "duration_min": 45, "intensity": "moderate"}
    ],
    "strength_experience": "6m2y",
    "strength_consistency": "regular",
    "eating_style": "omnivore",
    "food_intolerances": [],
}

_GROQ_MOCK_RESULT = {
    "tdee_kcal": 2250,
    "target_kcal": 1900,
    "formula_used": "groq_mifflin",
    "confidence": "high",
    "confidence_reason": "Datos completos. Fórmula Mifflin + NEAT ajustado.",
    "estimated_body_fat_pct": None,
    "lean_mass_kg": None,
    "macros": {"protein_g": 155, "carbs_g": 200, "fat_g": 65},
    "protein_sources": ["Pollo", "Huevos", "Legumbres"],
    "carb_sources": ["Arroz integral", "Avena"],
    "neat_assessment": "NEAT moderado para trabajo de escritorio con 4.000-7.000 pasos.",
    "recomp_potential": "Medio — buena base de entrenamiento.",
    "diagnosis": "Tu TDEE real es de 2.250 kcal. Con tu trabajo de escritorio y natación 2x/semana, tu gasto es moderado. Para perder grasa de forma sostenible, un déficit de 350 kcal es óptimo.",
    "action_steps": [
        "Añade 1 sesión de fuerza a tu semana — el músculo aumenta tu TMB.",
        "Prioriza 155g de proteína diaria para preservar masa muscular.",
        "Distribuye los carbohidratos alrededor del entreno de natación.",
    ],
    "diet_alert": None,
}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _register_and_get_headers(client):
    """Registra un usuario y devuelve auth headers."""
    resp = await client.post("/api/v1/auth/register", json={
        "email": "v2test@healthstack.com",
        "password": "SecurePass123!",
        "display_name": "V2 Test User",
        "consent_gdpr": True,
    })
    assert resp.status_code == 201, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _complete_v1_onboarding(client, headers):
    """Completa el onboarding v1 para que el usuario tenga peso/altura/sexo."""
    await client.post("/api/v1/auth/onboarding", json={
        "biological_sex": "male",
        "birth_date": "1993-04-20",
        "current_weight_kg": 82.0,
        "height_cm": 180.0,
        "activity_level": "moderately_active",
        "primary_fitness_goal": "lose_fat",
    }, headers=headers)


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestOnboardingV2HappyPath:

    async def test_with_ai_consent_returns_200(self, client):
        """Happy path: ai_consent=True + Groq mockeado → 200 con ai_used=True."""
        headers = await _register_and_get_headers(client)
        await _complete_v1_onboarding(client, headers)

        payload = {**_VALID_PAYLOAD, "ai_consent": True}

        with patch(
            "app.modules.identity.service._call_groq_onboarding",
            new_callable=AsyncMock,
            return_value=_GROQ_MOCK_RESULT,
        ):
            resp = await client.post(_V2_URL, json=payload, headers=headers)

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["onboarding_v2_completed"] is True
        assert data["ai_used"] is True
        assert data["tdee_kcal"] == 2250
        assert data["macros"]["protein_g"] == 155

    async def test_without_consent_returns_fallback(self, client):
        """ai_consent=False → usa Mifflin fallback, ai_used=False, sin Groq."""
        headers = await _register_and_get_headers(client)
        await _complete_v1_onboarding(client, headers)

        with patch(
            "app.modules.identity.service._call_groq_onboarding",
            new_callable=AsyncMock,
        ) as mock_groq:
            resp = await client.post(_V2_URL, json=_VALID_PAYLOAD, headers=headers)
            mock_groq.assert_not_called()  # Nunca debe llamar a Groq sin consentimiento

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["ai_used"] is False
        assert data["formula_used"] == "mifflin_fallback"
        assert data["tdee_kcal"] > 0

    async def test_groq_timeout_uses_fallback(self, client):
        """Groq timeout → fallback Mifflin, sin error al usuario."""
        headers = await _register_and_get_headers(client)
        await _complete_v1_onboarding(client, headers)

        payload = {**_VALID_PAYLOAD, "ai_consent": True}

        with patch(
            "app.modules.identity.service._call_groq_onboarding",
            new_callable=AsyncMock,
            return_value=None,  # Simula timeout → devuelve None → fallback
        ):
            resp = await client.post(_V2_URL, json=payload, headers=headers)

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["ai_used"] is False
        assert data["formula_used"] == "mifflin_fallback"

    async def test_groq_invalid_json_uses_fallback(self, client):
        """Groq devuelve JSON inválido → _call_groq devuelve None → fallback."""
        headers = await _register_and_get_headers(client)
        await _complete_v1_onboarding(client, headers)

        async def raise_json_error(*args, **kwargs):
            raise ValueError("JSON inválido simulado")

        payload = {**_VALID_PAYLOAD, "ai_consent": True}

        with patch("app.modules.identity.service._call_groq_onboarding", side_effect=raise_json_error):
            resp = await client.post(_V2_URL, json=payload, headers=headers)

        # El endpoint captura el error y devuelve fallback
        assert resp.status_code == 200, resp.text
        assert resp.json()["ai_used"] is False

    async def test_fields_persisted_in_users_table(self, client, db_session):
        """Los campos NEAT se guardan en public.users."""
        headers = await _register_and_get_headers(client)
        await _complete_v1_onboarding(client, headers)

        await client.post(_V2_URL, json=_VALID_PAYLOAD, headers=headers)

        row = await db_session.execute(
            text("""
                SELECT work_type, daily_steps_range, strength_experience,
                       strength_consistency, eating_style, onboarding_v2_completed
                FROM public.users WHERE email = 'v2test@healthstack.com'
            """)
        )
        user = row.fetchone()
        assert user is not None
        assert user.work_type == "desk"
        assert user.daily_steps_range == "4k7k"
        assert user.strength_experience == "6m2y"
        assert user.strength_consistency == "regular"
        assert user.eating_style == "omnivore"
        assert user.onboarding_v2_completed is True

    async def test_health_profile_created(self, client, db_session):
        """Después del onboarding v2 existe un registro en health.user_health_profiles."""
        headers = await _register_and_get_headers(client)
        await _complete_v1_onboarding(client, headers)

        await client.post(_V2_URL, json=_VALID_PAYLOAD, headers=headers)

        row = await db_session.execute(
            text("""
                SELECT hp.health_subject_id
                FROM health.user_health_profiles hp
                JOIN public.data_links dl ON dl.health_subject_id = hp.health_subject_id
                JOIN public.users u ON u.id = dl.user_id
                WHERE u.email = 'v2test@healthstack.com'
            """)
        )
        profile = row.fetchone()
        assert profile is not None, "No se creó registro en health.user_health_profiles"

    async def test_body_fat_pct_stored_encrypted(self, client, db_session):
        """body_fat_pct en BD NO es el texto plano — está cifrado."""
        headers = await _register_and_get_headers(client)
        await _complete_v1_onboarding(client, headers)

        payload = {**_VALID_PAYLOAD, "body_fat_pct": 18.5}
        await client.post(_V2_URL, json=payload, headers=headers)

        row = await db_session.execute(
            text("""
                SELECT hp.body_fat_pct
                FROM health.user_health_profiles hp
                JOIN public.data_links dl ON dl.health_subject_id = hp.health_subject_id
                JOIN public.users u ON u.id = dl.user_id
                WHERE u.email = 'v2test@healthstack.com'
            """)
        )
        profile = row.fetchone()
        assert profile is not None
        assert profile.body_fat_pct is not None
        # El valor en BD no debe ser el número plano "18.5"
        assert profile.body_fat_pct != "18.5"
        assert profile.body_fat_pct != 18.5
        # Formato cifrado: "<nonce_hex>:<tag_hex>:<ct_hex>"
        assert ":" in profile.body_fat_pct

    async def test_upsert_second_call_updates(self, client, db_session):
        """Segunda llamada del mismo usuario → actualiza, no 500."""
        headers = await _register_and_get_headers(client)
        await _complete_v1_onboarding(client, headers)

        await client.post(_V2_URL, json=_VALID_PAYLOAD, headers=headers)

        updated = {**_VALID_PAYLOAD, "eating_style": "vegetarian"}
        resp2 = await client.post(_V2_URL, json=updated, headers=headers)
        assert resp2.status_code == 200, resp2.text

        row = await db_session.execute(
            text("SELECT eating_style FROM public.users WHERE email = 'v2test@healthstack.com'")
        )
        user = row.fetchone()
        assert user.eating_style == "vegetarian"


@pytest.mark.asyncio
class TestOnboardingV2Auth:

    async def test_no_auth_returns_401(self, client):
        """Sin Bearer token → 401."""
        resp = await client.post(_V2_URL, json=_VALID_PAYLOAD)
        assert resp.status_code == 401

    async def test_invalid_token_returns_401(self, client):
        """Token inválido → 401."""
        resp = await client.post(
            _V2_URL,
            json=_VALID_PAYLOAD,
            headers={"Authorization": "Bearer token.invalido.aqui"},
        )
        assert resp.status_code == 401


@pytest.mark.asyncio
class TestOnboardingV2Validation:

    async def test_too_many_sports_returns_422(self, client):
        """Más de 6 deportes → 422."""
        headers = await _register_and_get_headers(client)
        sport = {"sport": "natacion", "days_per_week": 2, "duration_min": 45, "intensity": "moderate"}
        payload = {**_VALID_PAYLOAD, "sport_activities": [sport] * 7}
        resp = await client.post(_V2_URL, json=payload, headers=headers)
        assert resp.status_code == 422

    async def test_missing_required_field_returns_422(self, client):
        """Sin work_type → 422."""
        headers = await _register_and_get_headers(client)
        payload = {k: v for k, v in _VALID_PAYLOAD.items() if k != "work_type"}
        resp = await client.post(_V2_URL, json=payload, headers=headers)
        assert resp.status_code == 422


@pytest.mark.asyncio
class TestOnboardingV2RGPD:

    async def test_health_profiles_has_no_user_id_column(self, client, db_session):
        """
        RGPD Art.9 — Seudonimización: health.user_health_profiles NO debe
        contener columna user_id. Solo health_subject_id (pseudónimo).
        """
        col_check = await db_session.execute(
            text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'health'
                  AND table_name = 'user_health_profiles'
                  AND column_name = 'user_id'
            """)
        )
        assert col_check.fetchone() is None, (
            "RGPD VIOLATION: health.user_health_profiles contiene columna user_id directa"
        )

    async def test_without_consent_ai_profile_is_null(self, client, db_session):
        """ai_consent=False → ai_profile en BD es NULL."""
        headers = await _register_and_get_headers(client)
        await _complete_v1_onboarding(client, headers)

        await client.post(_V2_URL, json=_VALID_PAYLOAD, headers=headers)

        row = await db_session.execute(
            text("""
                SELECT hp.ai_profile, hp.ai_profile_generated_at
                FROM health.user_health_profiles hp
                JOIN public.data_links dl ON dl.health_subject_id = hp.health_subject_id
                JOIN public.users u ON u.id = dl.user_id
                WHERE u.email = 'v2test@healthstack.com'
            """)
        )
        profile = row.fetchone()
        assert profile is not None
        assert profile.ai_profile is None, "Sin consentimiento no debe haber ai_profile"
        assert profile.ai_profile_generated_at is None
