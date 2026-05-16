"""
app/modules/ai_coach/service.py
================================
Coach de fuerza intra-sesión.

Migrado en Bloque D: usa AIRouter en lugar de llamar Groq directamente.
Provider primario: Cerebras (~2000 tok/s, latencia mínima).
Fallback: Groq llama-3.3-70b-versatile.

El contrato de respuesta CoachResponse no cambia.
"""

from __future__ import annotations

import logging

from app.modules.ai_coach.schemas import CoachResponse, SetFeedbackRequest
from app.services.ai_router.base import AIProviderError
from app.services.ai_router.router import AIRouter
from app.services.ai_router.schemas import AIMessage, AIRequest, AIUseCase

logger = logging.getLogger(__name__)

_SUGGESTION_MAP = {
    "sube":     "increase_weight",
    "aumenta":  "increase_weight",
    "baja":     "decrease_weight",
    "reduce":   "decrease_weight",
    "descansa": "rest",
    "descanso": "rest",
    "mantén":   "maintain",
    "mantener": "maintain",
    "forma":    "good_form",
    "técnica":  "good_form",
}


def _build_prompt(req: SetFeedbackRequest) -> str:
    prev_same = [
        s for s in req.session_sets
        if s.exercise.lower() == req.exercise.lower()
    ]

    history_lines = ""
    if prev_same:
        history_lines = "Series anteriores esta sesión:\n"
        for s in prev_same[-3:]:
            rpe_str = f", RPE {s.rpe}" if s.rpe else ""
            history_lines += f"  {s.weight_kg}kg × {s.reps} reps{rpe_str}\n"

    plan_line = ""
    if req.planned_weight_kg and req.planned_reps:
        plan_line = f"Plan objetivo: {req.planned_weight_kg}kg × {req.planned_reps} reps\n"

    rpe_line = f"RPE declarado: {req.rpe}/10\n" if req.rpe else ""

    return f"""Eres un coach de fuerza experto. Analiza este set y da UNA recomendación concreta.

Ejercicio: {req.exercise}
Set actual: {req.weight_kg}kg × {req.reps} reps
{rpe_line}{plan_line}{history_lines}
Responde SOLO con:
1. Una frase de coaching (máx 20 palabras, en español, directa y motivadora)
2. En una segunda línea, exactamente una palabra: SUBE / BAJA / MANTÉN / DESCANSA / TÉCNICA

Ejemplo:
Excelente serie, sube 2.5kg en la siguiente.
SUBE"""


def _parse_suggestion(text: str) -> str:
    lower = text.lower()
    for keyword, suggestion in _SUGGESTION_MAP.items():
        if keyword in lower:
            return suggestion
    return "maintain"


async def get_set_feedback(
    req: SetFeedbackRequest,
    ai_router: AIRouter,
) -> CoachResponse:
    """
    Genera feedback de coaching para un set completado.

    Args:
        req:       datos del set (ejercicio, peso, reps, RPE, historial)
        ai_router: instancia del AIRouter (inyectada desde el endpoint)

    Returns:
        CoachResponse con coaching phrase, suggestion y confidence.
        Nunca lanza — siempre devuelve un fallback válido si la IA falla.
    """
    prompt = _build_prompt(req)

    try:
        response = await ai_router.call(
            use_case=AIUseCase.REALTIME_COACH,
            request=AIRequest(
                messages=[AIMessage(role="user", content=prompt)],
                max_tokens=60,
                temperature=0.4,
                timeout_s=8.0,
            ),
        )
        raw = response.content.strip()
        lines = [line.strip() for line in raw.split("\n") if line.strip()]
        coaching = lines[0] if lines else "¡Buen set! Sigue así."
        suggestion = _parse_suggestion(raw)
        confidence = 0.85 if not response.fallback_triggered else 0.70

        return CoachResponse(
            coaching=coaching,
            suggestion=suggestion,
            confidence=confidence,
        )

    except AIProviderError as exc:
        logger.warning("Coach AIProviderError, usando fallback estático: %s", exc)
        return CoachResponse(
            coaching="¡Buen trabajo! Sigue con la sesión.",
            suggestion="maintain",
            confidence=0.5,
        )
    except Exception as exc:
        logger.error("Coach unexpected error: %s", exc)
        return CoachResponse(
            coaching="¡Buen set! Continúa.",
            suggestion="maintain",
            confidence=0.5,
        )
