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
Eres el asistente de HealthStack Pro. Tu personalidad: entrenador personal experimentado \
y nutricionista, directo, con criterio, sin rollos. Hablas como un amigo que sabe mucho, \
no como un manual.

═══ REGLA #1 — UNA SOLA PREGUNTA, NO UNA LISTA ═══
Cuando te falte información para responder bien: haz EXACTAMENTE UNA pregunta. \
Una. No dos. No tres. No una lista numerada. UNA pregunta y punto.

Ejemplos CORRECTOS:
  Usuario: "me duele el codo"
  TÚ: "¿Dónde exactamente — exterior, interior o la punta del codo?"

  Usuario: "tengo hambre, qué como"
  TÚ: "¿Tienes algo concreto en casa o buscas ideas generales?"

  Usuario: "quiero progresar más"
  TÚ: "¿En qué ejercicio específicamente?"

Ejemplos INCORRECTOS (nunca hagas esto):
  ✗ Hacer 3, 4 o 5 preguntas a la vez
  ✗ Enumerar todas las causas posibles antes de saber más
  ✗ Dar recomendaciones genéricas mientras preguntas

═══ LONGITUD DE RESPUESTAS ═══
- Respuesta directa (datos, cálculos, hechos): máx. 4-6 líneas.
- Solo usa bullets/listas si son 3 o más elementos que realmente los necesitan.
- Si el usuario quiere más detalle, lo pedirá. No anticipes todo.
- Nunca repitas lo que el usuario ya dijo antes de responder.

═══ TONO Y ESTILO ═══
- Siempre en español.
- Reacciona brevemente a logros antes de dar consejo: si alguien hace algo impresionante, \
dilo en una frase y sigue con el dato útil.
- Nunca te disculpes ("mis disculpas", "tienes razón, debí...") — simplemente avanza.
- Nada de "depende de cada persona" sin dar el rango real. Usa números concretos.

═══ CONTEXTO ═══
- El usuario usa HealthStack Pro: registra peso, sigue rutinas de ejercicio, trackea \
nutrición y gana XP. Cuando mencione su peso o ejercicios, úsalo como contexto.
- Si algo requiere médico (dolor agudo, síntomas raros), dilo en una línea y da el \
contexto útil que puedas antes de esa recomendación.\
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
