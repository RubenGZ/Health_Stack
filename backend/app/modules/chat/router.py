"""
app/modules/chat/router.py
==========================
Proxy seguro hacia la API de xAI Grok para el asistente virtual.

La API key NUNCA sale al frontend — vive solo en el servidor.
Rate limit: 10 req/min por IP para evitar abuso.
"""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.main import limiter

logger = logging.getLogger(__name__)
router = APIRouter()

_GROK_URL   = "https://api.groq.com/openai/v1/chat/completions"
_MODEL      = "llama-3.3-70b-versatile"
_MAX_TOKENS = 512

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
@limiter.limit("10/minute")
async def chat_message(request: Request, body: ChatRequest) -> JSONResponse:
    """
    Envía un mensaje al asistente IA (Grok) y devuelve la respuesta.
    El historial de conversación se recibe del cliente para mantener contexto.
    """
    cfg = get_settings()
    if not cfg.grok_api_key:
        return JSONResponse(
            status_code=503,
            content={"detail": "El asistente IA no está configurado."},
        )

    messages = [{"role": "system", "content": _SYSTEM_PROMPT}]
    # Añadir historial (máx. últimos 10 turnos para no gastar tokens)
    for msg in body.history[-10:]:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": body.message})

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                _GROK_URL,
                headers={
                    "Authorization": f"Bearer {cfg.grok_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": _MODEL,
                    "messages": messages,
                    "max_tokens": _MAX_TOKENS,
                    "temperature": 0.7,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            reply = data["choices"][0]["message"]["content"]
            return JSONResponse(content={"reply": reply})

    except httpx.HTTPStatusError as exc:
        logger.error("Grok API error %s: %s", exc.response.status_code, exc.response.text[:200])
        return JSONResponse(
            status_code=502,
            content={"detail": "Error al contactar el asistente IA. Inténtalo de nuevo."},
        )
    except Exception as exc:
        logger.error("Chat error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "Error interno del asistente. Inténtalo de nuevo."},
        )
