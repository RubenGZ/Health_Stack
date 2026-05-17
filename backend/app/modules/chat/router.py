"""
app/modules/chat/router.py
==========================
Proxy seguro hacia la IA para el asistente virtual público.

La API key NUNCA sale al frontend — vive solo en el servidor.
Rate limit: 200 req/min global (heredado de la app).

Migrado en Bloque D: usa AIRouter en lugar de llamar Groq directamente.
Provider primario: Groq llama-3.3-70b-versatile. Fallback: Gemini 2.5 Flash.

Contexto de usuario (Bloque E):
  Si el request incluye un Bearer token válido, se inyecta automáticamente
  un bloque [CONTEXTO DEL USUARIO] al system prompt con nivel/XP, peso
  reciente y última rutina. Sin token → chat genérico público sin cambios.
"""

from __future__ import annotations

import json
import logging
import re

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from app.core.security.jwt_handler import decode_token
from app.modules.chat.context import build_user_context
from app.services.ai_router.dependencies import get_ai_router
from app.services.ai_router.router import AIRouter
from app.services.ai_router.schemas import AIMessage, AIRequest, AIUseCase
from app.services.ai_router.base import AIProviderError
from app.session import DBSession

logger = logging.getLogger(__name__)
router = APIRouter()

# Esquema Bearer opcional — no lanza 403 si falta el token
_optional_bearer = HTTPBearer(auto_error=False)

# ── System prompt base ────────────────────────────────────────────────────────

_BASE_SYSTEM_PROMPT = """\
Eres el asistente de HealthStack Pro: entrenador personal y nutricionista experto. \
Directo, con criterio, sin rollos. Hablas como un amigo que sabe mucho, no como un manual.

Siempre en español. Números concretos cuando los tengas. Nunca te disculpes.

Si tienes [CONTEXTO DEL USUARIO] al inicio: úsalo para personalizar. \
Menciona sus datos cuando sea relevante — "dado que estás en nivel 12…", \
"con tu peso actual de 84 kg…". No los menciones si no aportan nada.

━━━ REGLA ABSOLUTA — UNA SOLA PREGUNTA ━━━
Cuando te falta un dato clave: haces UNA pregunta y paras. Sin contexto previo. \
Sin "podría ser X o Y". Sin recomendaciones mientras preguntas. Solo la pregunta.
Cuando tienes la info: respondes directo, máx. 5-6 líneas, sin repetir lo que dijo el usuario.
Si el usuario hace algo impresionante, una frase de reconocimiento y luego el dato.

━━━ EJEMPLOS CORRECTOS ━━━

Dolor sin localizar:
  user: me duele el codo
  assistant: ¿Dónde exactamente — parte externa, interna o la punta?
  [Una pregunta. Nada más. Sin causas posibles, sin contexto.]

Dolor localizado:
  user: me duele el codo
  assistant: ¿Dónde exactamente — parte externa, interna o la punta?
  user: la parte externa
  assistant: Suena a epicondilitis lateral (codo de tenista). ¿Lo notas al extender la muñeca o al coger algo con la palma hacia abajo?

Hambre sin contexto:
  user: tengo hambre, qué puedo comer
  assistant: ¿Buscas algo rápido de preparar o una comida completa?
  user: algo rápido
  assistant: Yogur griego con nueces — ~20g de proteína, listo en 30 segundos. O 3 huevos revueltos, ~18g, en 3 minutos. ¿Cuánto tiempo tienes?

Logro + consejo:
  user: acabo de hacer 130kg en banca a 6 reps
  assistant: 130 kg × 6 reps — tu 1RM estimado es ~155 kg (fórmula Brzycki). Para seguir subiendo: cuando puedas hacer 8 reps limpias, sube 2.5 kg. ¿Cuántas series estás haciendo ahora?

Progresión sin dato:
  user: quiero progresar más
  assistant: ¿En qué ejercicio?
  user: sentadilla, ahora hago 100kg
  assistant: ¿Cuántas reps y series? Con ese dato te digo exactamente cuándo subir peso.

━━━ EJEMPLOS INCORRECTOS — NUNCA HAGAS ESTO ━━━

  user: me duele el codo
  INCORRECTO: "El dolor de codo puede tener varias causas: epicondilitis, bursitis o una contractura. ¿Dónde exactamente sientes el dolor? ¿Has estado haciendo ejercicios con mucha carga?"
  [Mal: dio contexto + hizo dos preguntas. Solo debía preguntar la localización.]

  user: tengo hambre
  INCORRECTO: "Depende de tus objetivos. Si buscas proteína, puedes tomar yogur griego. Si prefieres carbohidratos, una fruta. ¿Qué tipo de comida buscas?"
  [Mal: dio opciones y contexto antes de preguntar. Solo debía preguntar qué busca.]

━━━ LO QUE NUNCA HACES ━━━
- Nunca hagas 2 o más preguntas a la vez.
- Nunca listes causas posibles antes de tener la info.
- Nunca des contexto ni recomendaciones mientras preguntas.
- Nunca uses más de 6 líneas cuando la respuesta puede ser más corta.

━━━ DATOS GUARDABLES — ACCIÓN AUTOMÁTICA ━━━
Cuando el usuario mencione datos concretos y numéricos sobre sí mismo, añade AL FINAL
de tu respuesta (sin línea en blanco antes, sin mencionarlo en el texto):

  Peso corporal → [ACTION:{"type":"save_weight","kg":83.5}]
  Levantamiento → [ACTION:{"type":"save_pr","exercise":"sentadilla","weight_kg":100,"reps":5}]
  Entreno hecho → [ACTION:{"type":"log_workout"}]
  Horas de sueño → [ACTION:{"type":"save_sleep","hours":7.5}]

Reglas estrictas:
- Solo UNO por respuesta, el más relevante.
- Solo si el dato es explícito, numérico y del propio usuario — nunca si es vago.
- El campo "exercise" en save_pr: nombre en minúsculas sin tildes (ej: "banca", "sentadilla", "peso muerto", "press militar", "dominadas").
- NUNCA menciones "[ACTION" en el texto visible de tu respuesta.\
"""


# ── Schemas ───────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., max_length=2000)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)


# ── Action parser ────────────────────────────────────────────────────────────

_ACTION_RE = re.compile(r'\[ACTION:(\{[^]]*\})\]', re.DOTALL)


def _extract_action(reply: str) -> tuple[str, dict | None]:
    """
    Extrae el bloque [ACTION:{...}] del reply del modelo.
    Devuelve (reply_limpio, action_dict | None).
    El reply limpio es el texto visible sin el tag de acción.
    """
    match = _ACTION_RE.search(reply)
    if not match:
        return reply, None
    clean = _ACTION_RE.sub('', reply).strip()
    try:
        action = json.loads(match.group(1))
        action_type = action.get('type', '')
        if action_type not in ('save_weight', 'save_pr', 'log_workout', 'save_sleep'):
            return clean, None
        return clean, action
    except (json.JSONDecodeError, KeyError):
        return clean, None


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/message")
async def chat_message(
    request: Request,
    body: ChatRequest,
    db: DBSession,
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
    ai_router: AIRouter = Depends(get_ai_router),
) -> JSONResponse:
    """
    Envía un mensaje al asistente IA y devuelve la respuesta.

    El historial de conversación se recibe del cliente para mantener contexto.
    Si hay Bearer token válido → inyecta contexto del usuario al system prompt.
    Contrato JSON de respuesta: {"reply": "<string>", "action": {...} | null}.
    El campo "action" aparece cuando el modelo detecta datos guardables del usuario
    (peso, PR, entreno completado, sueño). El frontend lo usa para mostrar
    una pill de confirmación antes de guardar.
    """
    # ── Resolver contexto de usuario (opcional) ───────────────────────────────
    system_prompt = _BASE_SYSTEM_PROMPT

    if credentials is not None:
        try:
            payload = decode_token(credentials.credentials)
            if payload.get("type") == "access":
                user_id = payload["sub"]
                context_block = await build_user_context(user_id, db)
                if context_block:
                    system_prompt = context_block + "\n\n" + _BASE_SYSTEM_PROMPT
                    logger.debug("Chat: contexto de usuario inyectado para %s…", user_id[:8])
        except Exception:
            # Token inválido/expirado → chat anónimo sin bloquear
            pass

    # ── Construir mensajes para el AIRouter ───────────────────────────────────
    messages = [AIMessage(role="system", content=system_prompt)]
    for msg in body.history[-10:]:  # máx. 10 turnos de historial
        messages.append(AIMessage(role=msg.role, content=msg.content))
    messages.append(AIMessage(role="user", content=body.message))

    try:
        response = await ai_router.call(
            use_case=AIUseCase.PUBLIC_CHAT,
            request=AIRequest(
                messages=messages,
                max_tokens=700,
                temperature=0.6,
                timeout_s=30.0,
            ),
        )
        reply, action = _extract_action(response.content)
        payload: dict = {"reply": reply}
        if action:
            payload["action"] = action
            logger.debug("Chat action detectada: %s", action.get("type"))
        return JSONResponse(content=payload)

    except AIProviderError as exc:
        logger.error("Chat AIProviderError (%s): %s", type(exc).__name__, exc)
        return JSONResponse(
            status_code=502,
            content={"detail": "No se pudo conectar con el asistente IA. Inténtalo de nuevo."},
        )
    except Exception as exc:
        logger.error("Chat unexpected error (%s): %s", type(exc).__name__, exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "Error interno del asistente. Inténtalo de nuevo."},
        )
