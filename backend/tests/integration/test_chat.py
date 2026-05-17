"""
tests/integration/test_chat.py
================================
Pool de 20 conversaciones estándar para el chatbot de HealthStack Pro.

Dos niveles de test:
  1. Tests de infraestructura — mock del AIRouter, verifican contratos HTTP
     y que los mensajes se construyen correctamente (history, roles, límites).
  2. Tests de calidad de prompt — via smoke_test_chat.py contra endpoint real.
     Aquí solo comprobamos que el endpoint devuelve estructura válida.

Para testear la calidad de respuesta real ejecuta:
    python scripts/chat_smoke_test.py --url https://<tunnel>.trycloudflare.com
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.main import app as fastapi_app
from app.services.ai_router.base import AIProviderError
from app.services.ai_router.schemas import AIResponse

# ── Helpers ───────────────────────────────────────────────────────────────────

def _mock_router(reply: str = "Respuesta del asistente.") -> MagicMock:
    """Crea un AIRouter mockeado que devuelve reply fijo."""
    mock = MagicMock()
    mock.call = AsyncMock(return_value=AIResponse(
        content=reply,
        provider_used="groq",
        model_used="llama-3.3-70b-versatile",
        latency_ms=80,
        tokens_used=25,
        fallback_used=False,
    ))
    return mock


def _mock_router_fail() -> MagicMock:
    mock = MagicMock()
    mock.call = AsyncMock(side_effect=AIProviderError("all", "test failure"))
    return mock


def _user_msg(content: str) -> dict:
    return {"role": "user", "content": content}


def _assistant_msg(content: str) -> dict:
    return {"role": "assistant", "content": content}


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def patch_ai_router():
    """Parcha el AIRouter en app.state antes de cada test, restaura después."""
    original = getattr(fastapi_app.state, "ai_router", None)
    fastapi_app.state.ai_router = _mock_router()
    yield
    if original is not None:
        fastapi_app.state.ai_router = original


# ── Bloque 1: Contratos HTTP básicos ─────────────────────────────────────────

@pytest.mark.asyncio
class TestChatContracts:

    async def test_mensaje_simple_devuelve_reply(self, client):
        """Contrato base: POST /message → 200 con campo 'reply'."""
        resp = await client.post("/api/v1/chat/message", json={"message": "Hola"})
        assert resp.status_code == 200
        data = resp.json()
        assert "reply" in data
        assert isinstance(data["reply"], str)
        assert len(data["reply"]) > 0

    async def test_mensaje_vacio_rechazado(self, client):
        """Mensaje vacío → 422 validation error."""
        resp = await client.post("/api/v1/chat/message", json={"message": ""})
        assert resp.status_code == 422

    async def test_mensaje_sin_campo_message_rechazado(self, client):
        """Body sin 'message' → 422."""
        resp = await client.post("/api/v1/chat/message", json={"history": []})
        assert resp.status_code == 422

    async def test_mensaje_muy_largo_rechazado(self, client):
        """Mensaje > 2000 chars → 422 (límite del schema)."""
        resp = await client.post(
            "/api/v1/chat/message",
            json={"message": "x" * 2001},
        )
        assert resp.status_code == 422

    async def test_historial_con_roles_invalidos_rechazado(self, client):
        """Role distinto de user|assistant → 422."""
        resp = await client.post(
            "/api/v1/chat/message",
            json={
                "message": "test",
                "history": [{"role": "system", "content": "hack"}],
            },
        )
        assert resp.status_code == 422

    async def test_endpoint_publico_sin_auth(self, client):
        """El chat es público — no necesita JWT."""
        resp = await client.post("/api/v1/chat/message", json={"message": "Hola"})
        assert resp.status_code == 200

    async def test_ai_provider_error_devuelve_502(self, client):
        """Cuando todos los providers fallan → 502, no 500."""
        fastapi_app.state.ai_router = _mock_router_fail()
        resp = await client.post("/api/v1/chat/message", json={"message": "Hola"})
        assert resp.status_code == 502
        assert "detail" in resp.json()


# ── Bloque 2: Manejo del historial ────────────────────────────────────────────

@pytest.mark.asyncio
class TestChatHistory:

    async def test_historial_vacio_es_valido(self, client):
        resp = await client.post(
            "/api/v1/chat/message",
            json={"message": "Tengo hambre", "history": []},
        )
        assert resp.status_code == 200

    async def test_historial_completo_10_turnos(self, client):
        """10 turnos de historial — dentro del límite."""
        history = []
        for i in range(5):
            history.append(_user_msg(f"Mensaje usuario {i}"))
            history.append(_assistant_msg(f"Respuesta asistente {i}"))
        resp = await client.post(
            "/api/v1/chat/message",
            json={"message": "Siguiente pregunta", "history": history},
        )
        assert resp.status_code == 200

    async def test_historial_mas_de_20_items_rechazado(self, client):
        """Historial > 20 items → 422 (max_length=20 en schema)."""
        history = [_user_msg(f"msg {i}") for i in range(21)]
        resp = await client.post(
            "/api/v1/chat/message",
            json={"message": "Más", "history": history},
        )
        assert resp.status_code == 422

    async def test_historial_alternado_usuario_asistente(self, client):
        """Historial bien formado con roles alternados."""
        resp = await client.post(
            "/api/v1/chat/message",
            json={
                "message": "Y ahora qué hago?",
                "history": [
                    _user_msg("me duele el codo"),
                    _assistant_msg("¿Dónde exactamente — parte externa, interna o la punta?"),
                    _user_msg("la parte externa"),
                    _assistant_msg("Suena a epicondilitis lateral (codo de tenista)."),
                ],
            },
        )
        assert resp.status_code == 200


# ── Bloque 3: Pool de 20 escenarios estándar ─────────────────────────────────
#
# Estos tests verifican que el endpoint procesa correctamente cada tipo de
# mensaje sin errores. La calidad de la respuesta de la IA se verifica en
# scripts/chat_smoke_test.py contra el endpoint real.
#
# Categorías:
#   A - Síntomas (debe preguntar localización)
#   B - Nutrición (pregunta o responde según info disponible)
#   C - Entrenamiento (con contexto → dato; sin contexto → pregunta)
#   D - Logros (reconocimiento + dato)
#   E - Preguntas factuales (respuesta directa con números)

CONVERSATION_SCENARIOS = [
    # ── A: Síntomas ──────────────────────────────────────────────────────────
    pytest.param(
        {"message": "me duele el codo"},
        id="A1_dolor_codo_sin_localizar",
    ),
    pytest.param(
        {"message": "tengo dolor en la rodilla al bajar escaleras"},
        id="A2_dolor_rodilla_con_contexto_parcial",
    ),
    pytest.param(
        {"message": "noto molestia en el hombro cuando levanto el brazo"},
        id="A3_molestia_hombro_con_gesto",
    ),
    pytest.param(
        {
            "message": "sigue doliéndome",
            "history": [
                _user_msg("me duele el codo"),
                _assistant_msg("¿Dónde exactamente — parte externa, interna o la punta?"),
                _user_msg("la parte externa"),
                _assistant_msg("Suena a epicondilitis lateral. ¿Lo notas al extender la muñeca?"),
            ],
        },
        id="A4_dolor_seguimiento_en_conversacion",
    ),
    # ── B: Nutrición ─────────────────────────────────────────────────────────
    pytest.param(
        {"message": "tengo hambre"},
        id="B1_hambre_sin_contexto",
    ),
    pytest.param(
        {"message": "qué puedo comer para ganar músculo"},
        id="B2_nutricion_objetivo_musculo",
    ),
    pytest.param(
        {"message": "cuántas proteínas necesito al día"},
        id="B3_proteinas_sin_peso",
    ),
    pytest.param(
        {"message": "cuántas calorías tiene un huevo"},
        id="B4_factual_calorias_huevo",
    ),
    pytest.param(
        {
            "message": "y si le añado queso?",
            "history": [
                _user_msg("cuántas calorías tiene un huevo"),
                _assistant_msg("Un huevo mediano tiene ~70 kcal: 6g proteína, 5g grasa."),
            ],
        },
        id="B5_nutricion_pregunta_de_seguimiento",
    ),
    # ── C: Entrenamiento ──────────────────────────────────────────────────────
    pytest.param(
        {"message": "quiero progresar más"},
        id="C1_progresion_sin_ejercicio",
    ),
    pytest.param(
        {"message": "cuántos días debo entrenar a la semana"},
        id="C2_frecuencia_entrenamiento",
    ),
    pytest.param(
        {"message": "qué ejercicios hago para los hombros"},
        id="C3_ejercicios_hombros",
    ),
    pytest.param(
        {
            "message": "y cuándo subo peso?",
            "history": [
                _user_msg("quiero progresar más"),
                _assistant_msg("¿En qué ejercicio?"),
                _user_msg("sentadilla, ahora hago 100kg"),
                _assistant_msg("¿Cuántas reps y series?"),
                _user_msg("5 series de 5 reps"),
                _assistant_msg("Con 5×5 a 100kg: cuando hagas las 5 series sin fallar reps, sube 2.5kg."),
            ],
        },
        id="C4_progresion_conversacion_larga",
    ),
    pytest.param(
        {"message": "cuánto tiempo descanso entre series"},
        id="C5_tiempo_descanso_factual",
    ),
    # ── D: Logros ─────────────────────────────────────────────────────────────
    pytest.param(
        {"message": "acabo de hacer 130kg en banca a 6 reps"},
        id="D1_logro_banca_con_datos",
    ),
    pytest.param(
        {"message": "hoy corrí 10km en 45 minutos"},
        id="D2_logro_carrera_con_datos",
    ),
    pytest.param(
        {"message": "acabo de hacer mi primer dominado"},
        id="D3_logro_primer_dominado",
    ),
    pytest.param(
        {"message": "bajé 1kg esta semana"},
        id="D4_logro_perdida_peso",
    ),
    # ── E: Preguntas factuales ────────────────────────────────────────────────
    pytest.param(
        {"message": "qué es el RPE"},
        id="E1_factual_rpe_definicion",
    ),
    pytest.param(
        {"message": "es malo entrenar en ayunas"},
        id="E2_factual_ayunas_entrenamiento",
    ),
]


@pytest.mark.asyncio
class TestChatScenarios:
    """Pool de 20 escenarios — verifica que el endpoint procesa cada uno sin error."""

    @pytest.mark.parametrize("payload", CONVERSATION_SCENARIOS)
    async def test_scenario(self, client, payload):
        resp = await client.post("/api/v1/chat/message", json=payload)
        assert resp.status_code == 200, (
            f"Escenario falló con {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert "reply" in data
        assert isinstance(data["reply"], str)
        assert len(data["reply"]) > 5, "Respuesta demasiado corta — posible bug"
