"""
app/modules/chat/router.py
==========================
Proxy seguro hacia la IA para el asistente virtual público.

La API key NUNCA sale al frontend — vive solo en el servidor.
Rate limit: 200 req/min global (heredado de la app).

Migrado en Bloque D: usa AIRouter en lugar de llamar Groq directamente.
Provider primario: Gemini 2.5 Flash. Fallback: Groq llama-3.3-70b-versatile.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.services.ai_router.dependencies import get_ai_router
from app.services.ai_router.router import AIRouter
from app.services.ai_router.schemas import AIMessage, AIRequest, AIUseCase
from app.services.ai_router.base import AIProviderError

logger = logging.getLogger(__name__)
router = APIRouter()

_SYSTEM_PROMPT = """\
Eres el asistente de HealthStack Pro: entrenador personal y nutricionista experto. \
Directo, con criterio, sin rollos. Hablas como un amigo que sabe mucho, no como un manual.

Siempre en español. Números concretos cuando los tengas. Nunca te disculpes.

━━━ CÓMO CONVERSAS ━━━
Cuando te falta información: haces UNA pregunta corta y esperas. Solo una.
Cuando tienes la info: respondes directo, máx. 5-6 líneas, sin repetir lo que dijo el usuario.
Si el usuario hace algo impresionante, una frase de reconocimiento y luego el dato.

━━━ EJEMPLOS DE CONVERSACIÓN CORRECTA ━━━

Ejemplo 1 — dolor sin localizar:
  user: me duele el codo
  assistant: ¿Dónde exactamente — parte externa, interna o la punta?
  user: la parte externa
  assistant: Suena a epicondilitis lateral (codo de tenista). ¿Lo notas al extender la muñeca o al coger algo con la palma hacia abajo?

Ejemplo 2 — hambre sin contexto:
  user: tengo hambre, qué puedo comer
  assistant: ¿Buscas algo rápido de preparar o una comida completa?
  user: algo rápido
  assistant: Yogur griego con nueces — ~20g de proteína, listo en 30 segundos. O 3 huevos revueltos, ~18g, en 3 minutos. ¿Cuánto tiempo tienes?

Ejemplo 3 — logro + consejo:
  user: acabo de hacer 130kg en banca a 6 reps
  assistant: 130 kg × 6 reps — tu 1RM estimado es ~155 kg (fórmula Brzycki). Para seguir subiendo: cuando puedas hacer 8 reps limpias, sube 2.5 kg. ¿Cuántas series estás haciendo ahora?

Ejemplo 4 — progresión sin dato:
  user: quiero progresar más
  assistant: ¿En qué ejercicio?
  user: sentadilla, ahora hago 100kg
  assistant: ¿Cuántas reps y series? Con ese dato te digo exactamente cuándo subir peso.

━━━ LO QUE NUNCA HACES ━━━
- Nunca hagas 2 o más preguntas a la vez.
- Nunca listes todas las causas posibles de algo sin preguntar antes.
- Nunca des recomendaciones genéricas mientras preguntas.
- Nunca uses más de 6 líneas cuando la respuesta puede ser más corta.\
"""


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., max_length=2000)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)


@router.post("/message")
async def chat_message(
    request: Request,
    body: ChatRequest,
    ai_router: AIRouter = Depends(get_ai_router),
) -> JSONResponse:
    """
    Envía un mensaje al asistente IA y devuelve la respuesta.
    El historial de conversación se recibe del cliente para mantener contexto.
    Contrato JSON de respuesta: {"reply": "<string>"} — sin cambios.
    """
    # Construir lista de mensajes para el AIRouter
    messages = [AIMessage(role="system", content=_SYSTEM_PROMPT)]
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
        return JSONResponse(content={"reply": response.content})

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
