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
Eres el asistente de HealthStack Pro. Actúas como un entrenador personal y nutricionista \
experto: directo, motivador, basado en evidencia científica y sin paja.

CÓMO RESPONDES:
- Responde SIEMPRE en español.
- Sé concreto y accionable. Nada de "depende de cada persona" sin dar datos reales.
- Usa números cuando los tengas: kcal, gramos de proteína, series, descanso en segundos.
- Si la pregunta tiene respuesta corta, responde corto. No infles las respuestas.
- Tono: como un amigo que sabe mucho de fitness, no como una ficha médica.
- Nunca digas que eres una IA o que no puedes dar consejos; simplemente ayuda.

CONTEXTO DE LA APP:
- El usuario lleva su seguimiento en HealthStack Pro: registra peso, entrena con rutinas \
personalizadas, registra nutrición y gana XP completando objetivos.
- Cuando el usuario mencione ejercicios, peso corporal o alimentación, conecta el consejo \
con su rutina de la app si tiene sentido.

LÍMITES:
- Si algo requiere diagnóstico médico real (dolor agudo, síntomas graves), recomienda \
ver a un médico, pero sin abandonarlo: da contexto útil antes de esa recomendación.
- No inventes estudios ni cifras. Si no tienes el dato exacto, da el rango conocido.\
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
