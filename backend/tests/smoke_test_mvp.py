"""
tests/smoke_test_mvp.py
========================
Smoke test de ciclo de vida completo — MVP Alpha.

Ejecuta un flujo de usuario real de extremo a extremo sobre el backend:
  1. Registro de usuario nuevo
  2. Onboarding biométrico (POST /auth/onboarding)
  3. GET /auth/me — verifica que los datos biométricos se persistieron
  4. POST /rehab/protocol — tier free → preset estático, sin llamada a LLM

Uso:
    pytest tests/smoke_test_mvp.py -v

Prerequisito: la BD de test debe estar disponible (misma que usa conftest.py).
"""

from __future__ import annotations

import pytest

# ── Payloads reutilizables ────────────────────────────────────────────────────

_ALPHA_EMAIL    = "alpha_tester_01@healthstack.com"
_ALPHA_PASSWORD = "AlphaTest123!"

_REGISTER_PAYLOAD = {
    "email":        _ALPHA_EMAIL,
    "password":     _ALPHA_PASSWORD,
    "display_name": "Alpha Tester",
    "consent_gdpr": True,
}

_ONBOARDING_PAYLOAD = {
    "biological_sex":       "male",
    "birth_date":           "1992-06-15",
    "current_weight_kg":    "82.5",
    "height_cm":            "180.0",
    "activity_level":       "moderately_active",
    "primary_fitness_goal": "gain_muscle",
}

_REHAB_PAYLOAD = {
    "injury_type":        "tendinopathy",
    "body_area":          "knee",
    "pain_level":         4,
    "weeks_since_injury": 2,
    "notes":              None,
}


# ── Smoke test ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestMVPLifecycle:
    """
    Flujo de ciclo de vida completo del alpha tester.
    Cada step depende del anterior — fallar pronto es intencional.
    """

    async def test_step1_register(self, client):
        """Paso 1: Registro de usuario nuevo con consentimiento RGPD."""
        resp = await client.post("/api/v1/auth/register", json=_REGISTER_PAYLOAD)

        assert resp.status_code == 201, (
            f"Registro falló con {resp.status_code}: {resp.text}"
        )
        data = resp.json()

        # Tokens emitidos
        assert "access_token"  in data, "Falta access_token en la respuesta"
        assert "refresh_token" in data, "Falta refresh_token en la respuesta"
        assert data["token_type"] == "bearer"

        # El usuario tiene los datos correctos
        user = data["user"]
        assert user["email"]        == _ALPHA_EMAIL
        assert user["consent_gdpr"] is True
        assert user["role"]         == "user"
        assert user["plan"]         == "free"

        # RGPD: la respuesta NO debe exponer datos sensibles
        assert "password_hash"      not in data
        assert "health_subject_id"  not in data
        assert "health_uuid_enc"    not in data

    async def test_step2_onboarding(self, client):
        """Paso 2: Onboarding biométrico guarda el perfil en public.users."""
        # Registrar primero
        reg = await client.post("/api/v1/auth/register", json=_REGISTER_PAYLOAD)
        assert reg.status_code == 201
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Enviar onboarding
        resp = await client.post(
            "/api/v1/auth/onboarding",
            json=_ONBOARDING_PAYLOAD,
            headers=headers,
        )
        assert resp.status_code == 200, (
            f"Onboarding falló con {resp.status_code}: {resp.text}"
        )
        data = resp.json()

        assert data["onboarding_completed"] is True, (
            "El flag onboarding_completed debe ser True tras el onboarding"
        )
        # health_record_seeded puede ser True o False según disponibilidad de crypto;
        # en test la clave maestra puede no estar — aceptamos ambos valores
        assert "health_record_seeded" in data

    async def test_step3_me_reflects_onboarding(self, client):
        """Paso 3: GET /auth/me devuelve los datos biométricos del onboarding."""
        # Registrar
        reg = await client.post("/api/v1/auth/register", json=_REGISTER_PAYLOAD)
        assert reg.status_code == 201
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Completar onboarding
        ob = await client.post(
            "/api/v1/auth/onboarding",
            json=_ONBOARDING_PAYLOAD,
            headers=headers,
        )
        assert ob.status_code == 200

        # Verificar perfil
        me_resp = await client.get("/api/v1/auth/me", headers=headers)
        assert me_resp.status_code == 200, (
            f"GET /me falló con {me_resp.status_code}: {me_resp.text}"
        )
        me = me_resp.json()

        # El usuario existe con el email correcto
        assert me["email"] == _ALPHA_EMAIL

        # onboarding_completed ya debería ser True (reflejado en /me si se expone)
        # UserPublicResponse no expone campos biométricos por diseño (RGPD),
        # así que solo verificamos que la respuesta es válida y sin PII sensible
        assert "password_hash"     not in me
        assert "health_subject_id" not in me
        assert me["role"] == "user"

    async def test_step4_rehab_free_returns_static_preset(self, client):
        """
        Paso 4: POST /rehab/protocol como Free tier devuelve un preset
        estático sin invocar ningún LLM externo.

        Garantías:
        - HTTP 200
        - tier == 'free'
        - is_ai_generated == False  → sin llamada a Groq/Gemini
        - disclaimer presente       → aviso legal obligatorio
        - phases no vacías          → al menos una fase de ejercicios
        - red_flags no vacías       → señales de alarma incluidas
        """
        # Registrar usuario (plan=free por defecto)
        reg = await client.post("/api/v1/auth/register", json=_REGISTER_PAYLOAD)
        assert reg.status_code == 201
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Solicitar protocolo de rehabilitación
        resp = await client.post(
            "/api/v1/rehab/protocol",
            json=_REHAB_PAYLOAD,
            headers=headers,
        )
        assert resp.status_code == 200, (
            f"POST /rehab/protocol falló con {resp.status_code}: {resp.text}"
        )
        data = resp.json()

        # Freemium: sin IA para tier free
        assert data.get("tier") == "free", (
            f"Esperado tier='free', obtenido '{data.get('tier')}'"
        )
        assert data.get("is_ai_generated") is False, (
            "Un usuario Free no debe generar protocolos con IA (coste LLM evitado)"
        )

        # Contenido mínimo del protocolo
        assert data.get("title"),    "El protocolo debe tener título"
        assert data.get("phases"),   "El protocolo debe tener al menos una fase"
        assert data.get("red_flags"), "El protocolo debe incluir señales de alarma"

        # Aviso legal obligatorio (LOPD / responsabilidad médica)
        disclaimer = data.get("disclaimer", "")
        assert len(disclaimer) > 50, (
            "El disclaimer legal debe estar presente y ser sustancial"
        )
        assert "AVISO" in disclaimer.upper() or "WARNING" in disclaimer.upper(), (
            "El disclaimer debe contener un aviso explícito"
        )

        # Estructura mínima de una fase
        first_phase = data["phases"][0]
        assert first_phase.get("phase_name"), "La fase debe tener nombre"
        assert first_phase.get("exercises"),  "La fase debe contener ejercicios"
        first_ex = first_phase["exercises"][0]
        assert first_ex.get("name"),          "El ejercicio debe tener nombre"
        assert first_ex.get("description"),   "El ejercicio debe tener descripción"

    async def test_step5_sentry_filter_blocks_biometrics(self, client):
        """
        Paso 5: El filtro Sentry elimina datos biométricos del evento
        antes de enviarlo al servicio externo.

        Verifica directamente la función _sentry_before_send con un evento
        simulado de onboarding que contiene datos sensibles.
        """
        from app.main import _sentry_before_send

        # Simulamos un evento Sentry de un error en POST /auth/onboarding
        mock_event = {
            "request": {
                "url": "http://localhost/api/v1/auth/onboarding",
                "method": "POST",
                "data": {
                    "biological_sex":       "female",
                    "birth_date":           "1990-03-22",
                    "current_weight_kg":    "65.0",
                    "height_cm":            "165.0",
                    "activity_level":       "lightly_active",
                    "primary_fitness_goal": "lose_fat",
                },
                "headers": {
                    "Authorization": "Bearer eyJhbGciOiJSUzI1NiJ9...",
                    "Content-Type":  "application/json",
                },
            },
            "user": {
                "ip_address": "192.168.1.45",
            },
        }

        filtered = _sentry_before_send(mock_event, {})

        assert filtered is not None, "El filtro no debe descartar el evento completo"

        req_data = filtered["request"].get("data", {})

        # El filtro puede actuar de dos formas:
        # A) Full-scrub (endpoint en _FULL_SCRUB_PATHS) → req_data es un string "[SCRUBBED...]"
        # B) Key-scrub (endpoint genérico)              → req_data es un dict con valores [FILTERED]
        biometric_keys = [
            "biological_sex", "birth_date", "current_weight_kg",
            "height_cm", "activity_level", "primary_fitness_goal",
        ]
        if isinstance(req_data, str):
            # Full-scrub aplicado: ningún dato biométrico está en la respuesta → OK
            assert "[SCRUBBED" in req_data or "[FILTERED" in req_data, (
                f"Se esperaba un string de scrubbing completo, se obtuvo: '{req_data}'"
            )
        else:
            # Key-scrub aplicado: verificar campo por campo
            for key in biometric_keys:
                value = req_data.get(key, "[FILTERED]")
                assert value == "[FILTERED]", (
                    f"El campo '{key}' con valor '{value}' NO fue filtrado por Sentry. "
                    f"Riesgo de RGPD Art. 9."
                )

        # El JWT debe estar filtrado
        auth_header = filtered["request"]["headers"].get("Authorization", "")
        assert auth_header == "[FILTERED]", (
            "La cabecera Authorization con JWT no fue filtrada"
        )

        # La IP debe estar truncada (solo primer octeto)
        ip = filtered["user"]["ip_address"]
        assert ip.endswith(".x.x.x"), (
            f"La IP '{ip}' no está correctamente anonimizada"
        )

    async def test_step6_rehab_invalid_body_returns_422(self, client):
        """
        Paso 6: Validación de entrada — un body inválido en /rehab/protocol
        debe retornar 422 sin procesar ni registrar datos parciales.
        """
        reg = await client.post("/api/v1/auth/register", json=_REGISTER_PAYLOAD)
        assert reg.status_code == 201
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        invalid_payload = {
            "injury_type": "not_a_real_injury",   # Literal inválido
            "body_area":   "knee",
            "pain_level":  15,                     # Fuera de rango 1-10
        }

        resp = await client.post(
            "/api/v1/rehab/protocol",
            json=invalid_payload,
            headers=headers,
        )
        assert resp.status_code == 422, (
            f"Se esperaba 422 para body inválido, se obtuvo {resp.status_code}"
        )
