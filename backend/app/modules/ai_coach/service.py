from __future__ import annotations

import json
import logging

import httpx

from app.core.config import get_settings
from app.modules.ai_coach.schemas import CoachResponse, SetFeedbackRequest

logger = logging.getLogger(__name__)

_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
_MODEL    = "llama-3.3-70b-versatile"

_SUGGESTION_MAP = {
    "sube":       "increase_weight",
    "aumenta":    "increase_weight",
    "baja":       "decrease_weight",
    "reduce":     "decrease_weight",
    "descansa":   "rest",
    "descanso":   "rest",
    "mantén":     "maintain",
    "mantener":   "maintain",
    "forma":      "good_form",
    "técnica":    "good_form",
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


async def get_set_feedback(req: SetFeedbackRequest) -> CoachResponse:
    cfg = get_settings()
    if not cfg.grok_api_key:
        return CoachResponse(
            coaching="Asistente IA no configurado.",
            suggestion="maintain",
            confidence=0.0,
        )

    prompt = _build_prompt(req)

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                _GROQ_URL,
                headers={
                    "Authorization": f"Bearer {cfg.grok_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": _MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 60,
                    "temperature": 0.4,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            raw = data["choices"][0]["message"]["content"].strip()

            lines = [l.strip() for l in raw.split("\n") if l.strip()]
            coaching = lines[0] if lines else "¡Buen set! Sigue así."
            suggestion = _parse_suggestion(raw)

            return CoachResponse(
                coaching=coaching,
                suggestion=suggestion,
                confidence=0.85,
            )

    except httpx.TimeoutException:
        logger.warning("Groq timeout en set-feedback")
        return CoachResponse(coaching="¡Buen trabajo! Sigue con la sesión.", suggestion="maintain", confidence=0.5)
    except Exception as exc:
        logger.error("Coach service error: %s", exc)
        return CoachResponse(coaching="¡Buen set! Continúa.", suggestion="maintain", confidence=0.5)
