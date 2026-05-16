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

_SYSTEM_PROMPT = (
    "Eres el asistente de inteligencia artificial de HealthStack Pro, "
    "la app de salud y fitness más avanzada. "
    "Tu misión es responder cualquier pregunta que te hagan — sobre nutrición, "
    "entrenamiento, salud, ciencia, tecnología, vida cotidiana o cualquier otro tema. "
    "Responde siempre en español, de forma directa, clara y útil. "
    "Cuando la pregunta sea sobre fitness o salud, aporta datos concretos basados "
    "en evidencia científica. Si la pregunta no tiene que ver con salud, responde "
    "igualmente con tu mejor conocimiento. "
    "No inventes datos médicos específicos ni reemplaces diagnósticos médicos profesionales."
)


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
                max_tokens=512,
                temperature=0.7,
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
