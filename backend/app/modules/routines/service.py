"""
app/modules/Routines/service.py
=================================
Lógica de negocio para el módulo de rutinas.
"""

from __future__ import annotations

import json
import logging

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
import uuid

from app.modules.routines.repository import InjuryRepository, RoutineRepository
from app.modules.routines.schemas import (
    ChronicInjuryCreate,
    ChronicInjuryOut,
    AIRoutineDay,
    AIRoutineExercise,
    AIRoutineRequest,
    AIRoutineResponse,
    RoutineCreate,
    RoutineListResponse,
    RoutineResponse,
)
from app.services.ai_router.base import AIProviderError
from app.services.ai_router.schemas import AIMessage, AIRequest, AIUseCase
from app.shared.exceptions import HealthRecordNotFoundError

logger = logging.getLogger(__name__)

_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
_MODEL    = "llama-3.3-70b-versatile"

_GOAL_LABELS = {
    "strength":    "Fuerza máxima",
    "hypertrophy": "Hipertrofia muscular",
    "fat_loss":    "Pérdida de grasa",
    "endurance":   "Resistencia muscular",
}
_LEVEL_LABELS = {
    "beginner":     "Principiante",
    "intermediate": "Intermedio",
    "advanced":     "Avanzado",
}
_EQUIPMENT_LABELS = {
    "full_gym":     "gimnasio completo (barras, mancuernas, máquinas)",
    "home_weights": "entrenamiento en casa con mancuernas y barra",
    "bodyweight":   "solo peso corporal sin equipamiento",
}

_FALLBACK_ROUTINE = AIRoutineResponse(
    label="Full Body – Fuerza Base",
    description="Rutina de fuerza 3 días/semana para desarrollar masa y potencia.",
    days_per_week=3,
    focus_area="Fuerza compuesta",
    days=[
        AIRoutineDay(
            day_label="Día A",
            focus="Empuje + Pierna",
            exercises=[
                AIRoutineExercise(name="Sentadilla", muscle_group="Cuádriceps", sets=4, reps="6-8", rest_sec=120, notes="Bajar hasta paralelo"),
                AIRoutineExercise(name="Press de banca", muscle_group="Pecho", sets=4, reps="6-8", rest_sec=120, notes="Agarre ancho"),
                AIRoutineExercise(name="Press militar", muscle_group="Hombros", sets=3, reps="8-10", rest_sec=90, notes=""),
                AIRoutineExercise(name="Fondos en paralelas", muscle_group="Tríceps", sets=3, reps="10-12", rest_sec=60, notes=""),
            ],
        ),
        AIRoutineDay(
            day_label="Día B",
            focus="Tirón + Core",
            exercises=[
                AIRoutineExercise(name="Peso muerto", muscle_group="Espalda baja", sets=3, reps="5", rest_sec=150, notes="Mantener espalda recta"),
                AIRoutineExercise(name="Dominadas", muscle_group="Espalda", sets=4, reps="6-8", rest_sec=120, notes="Agarre supino"),
                AIRoutineExercise(name="Remo con barra", muscle_group="Dorsal", sets=3, reps="8-10", rest_sec=90, notes=""),
                AIRoutineExercise(name="Curl bíceps", muscle_group="Bíceps", sets=3, reps="10-12", rest_sec=60, notes=""),
            ],
        ),
        AIRoutineDay(
            day_label="Día C",
            focus="Full Body ligero + Core",
            exercises=[
                AIRoutineExercise(name="Sentadilla búlgara", muscle_group="Cuádriceps", sets=3, reps="10-12", rest_sec=90, notes="Cada pierna"),
                AIRoutineExercise(name="Press inclinado mancuernas", muscle_group="Pecho", sets=3, reps="10-12", rest_sec=90, notes=""),
                AIRoutineExercise(name="Face pull", muscle_group="Deltoides posterior", sets=3, reps="15", rest_sec=60, notes=""),
                AIRoutineExercise(name="Plancha abdominal", muscle_group="Core", sets=3, reps="40s", rest_sec=45, notes=""),
            ],
        ),
    ],
)

# Reutilizamos HealthRecordNotFoundError como "not found" genérico — o podemos
# simplemente devolver 404 desde el router con HTTPException directa.


class RoutineService:

    @staticmethod
    async def list_routines(
        db: AsyncSession,
        user_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> RoutineListResponse:
        routines, total = await RoutineRepository.list_by_user(
            db, user_id, limit=limit, offset=offset
        )
        return RoutineListResponse(
            routines=[RoutineResponse.model_validate(r) for r in routines],
            total=total,
        )

    @staticmethod
    async def save_routine(
        db: AsyncSession,
        user_id: str,
        data: RoutineCreate,
    ) -> RoutineResponse:
        routine = await RoutineRepository.create(
            db,
            user_id=user_id,
            label=data.label,
            routine_json=data.routine_json,
        )
        logger.info(
            f"[Routines] Rutina guardada: user={user_id[:8]}... label={data.label[:30]}"
        )
        return RoutineResponse.model_validate(routine)

    @staticmethod
    async def delete_routine(
        db: AsyncSession,
        user_id: str,
        routine_id: str,
    ) -> None:
        routine = await RoutineRepository.get_by_id(db, routine_id, user_id)
        if routine is None:
            raise HealthRecordNotFoundError(
                f"No se encontró la rutina con ID {routine_id}."
            )
        await RoutineRepository.delete(db, routine)

    @staticmethod
    async def generate_ai_routine(params: AIRoutineRequest) -> AIRoutineResponse:
        """Genera una rutina personalizada usando Groq/Llama."""
        cfg = get_settings()
        if not cfg.grok_api_key:
            logger.warning("[Routines] Groq key not configured — returning fallback routine")
            return _FALLBACK_ROUTINE

        goal_label  = _GOAL_LABELS.get(params.goal, params.goal)
        level_label = _LEVEL_LABELS.get(params.level, params.level)
        equip_label = _EQUIPMENT_LABELS.get(params.equipment, params.equipment)

        prompt = f"""Eres un entrenador personal experto. Genera una rutina de entrenamiento en JSON.

PARÁMETROS:
- Objetivo: {goal_label}
- Nivel: {level_label}
- Días por semana: {params.days_per_week}
- Equipamiento: {equip_label}

Devuelve SOLO un JSON válido con esta estructura exacta (sin texto extra, sin markdown):
{{
  "label": "Nombre corto de la rutina",
  "description": "Descripción motivacional en 1-2 frases",
  "days_per_week": {params.days_per_week},
  "focus_area": "Área de enfoque principal",
  "days": [
    {{
      "day_label": "Día 1",
      "focus": "Grupo muscular principal",
      "exercises": [
        {{
          "name": "Nombre ejercicio",
          "muscle_group": "Músculo principal",
          "sets": 3,
          "reps": "8-10",
          "rest_sec": 90,
          "notes": "Indicación técnica opcional"
        }}
      ]
    }}
  ]
}}

Incluye exactamente {params.days_per_week} días. Cada día debe tener entre 4 y 6 ejercicios. Adapta al nivel {level_label} y al equipamiento disponible."""

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    _GROQ_URL,
                    headers={
                        "Authorization": f"Bearer {cfg.grok_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": _MODEL,
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 2000,
                        "temperature": 0.7,
                    },
                )
                resp.raise_for_status()
                raw_text = resp.json()["choices"][0]["message"]["content"].strip()
        except httpx.TimeoutException:
            logger.warning("[Routines] Groq timeout — returning fallback routine")
            return _FALLBACK_ROUTINE
        except Exception as exc:
            logger.error("[Routines] Groq error: %s", exc)
            return _FALLBACK_ROUTINE

        # Strip markdown code fences if present
        if raw_text.startswith("```"):
            raw_text = "\n".join(raw_text.split("\n")[1:])
            if raw_text.endswith("```"):
                raw_text = raw_text[: raw_text.rfind("```")]

        try:
            data = json.loads(raw_text)
            days = [
                AIRoutineDay(
                    day_label=d["day_label"],
                    focus=d["focus"],
                    exercises=[
                        AIRoutineExercise(
                            name=e["name"],
                            muscle_group=e["muscle_group"],
                            sets=int(e["sets"]),
                            reps=str(e["reps"]),
                            rest_sec=int(e["rest_sec"]),
                            notes=e.get("notes", ""),
                        )
                        for e in d["exercises"]
                    ],
                )
                for d in data["days"]
            ]
            return AIRoutineResponse(
                label=data["label"],
                description=data["description"],
                days_per_week=data["days_per_week"],
                focus_area=data["focus_area"],
                days=days,
            )
        except Exception as exc:
            logger.error("[Routines] Failed to parse Groq JSON: %s | raw: %s", exc, raw_text[:200])
            return _FALLBACK_ROUTINE


# ── Severity constraint map (used in AI prompt) ───────────────────────────────
_SEVERITY_CONSTRAINTS: dict[str, str] = {
    "mild": (
        "evitar variantes de alta carga, sustituir con alternativas de bajo impacto articular"
    ),
    "moderate": (
        "excluir todo ejercicio con estrés directo sobre la articulación afectada; "
        "usar solo ejercicios rehab-compatibles"
    ),
    "severe": (
        "evitación completa de toda la cadena cinética afectada"
    ),
}


def _build_injury_prompt_block(injuries: list) -> str:
    """Construye el bloque de restricciones para el prompt de generación."""
    if not injuries:
        return ""
    lines = ["RESTRICCIONES POR LESIONES CRÓNICAS DEL USUARIO:"]
    for inj in injuries:
        constraint = _SEVERITY_CONSTRAINTS.get(inj.severity, "precaución adicional")
        lines.append(f"- {inj.body_area} (severidad: {inj.severity}): {constraint}.")
    lines.append("")
    lines.append(
        "REGLA IMPORTANTE: Para cada ejercicio que involucre una zona lesionada, incluye en el "
        'campo "notes" del ejercicio la modificación aplicada y el motivo.'
    )
    return "\n".join(lines)


# ── InjuryService ─────────────────────────────────────────────────────────────

class InjuryService:
    """Servicio para CRUD de lesiones crónicas del usuario."""

    @staticmethod
    async def list_injuries(db: AsyncSession, user_id: str) -> list[ChronicInjuryOut]:
        uid = uuid.UUID(user_id)
        injuries = await InjuryRepository.list_active(db, uid)
        return [ChronicInjuryOut.model_validate(i) for i in injuries]

    @staticmethod
    async def create_injury(
        db: AsyncSession, user_id: str, data: ChronicInjuryCreate
    ) -> ChronicInjuryOut:
        uid = uuid.UUID(user_id)
        injury = await InjuryRepository.create(
            db,
            user_id=uid,
            body_area=data.body_area,
            injury_label=data.injury_label,
            severity=data.severity,
            notes=data.notes,
        )
        return ChronicInjuryOut.model_validate(injury)

    @staticmethod
    async def delete_injury(
        db: AsyncSession, user_id: str, injury_id: str
    ) -> None:
        from fastapi import HTTPException
        uid = uuid.UUID(user_id)
        iid = uuid.UUID(injury_id)
        injury = await InjuryRepository.get_by_id(db, iid, uid)
        if not injury:
            raise HTTPException(status_code=404, detail="Lesión no encontrada")
        await InjuryRepository.soft_delete(db, injury)


# ── generate_ai_routine_injury_aware ─────────────────────────────────────────

async def generate_ai_routine_injury_aware(
    request: AIRoutineRequest,
    db: AsyncSession,
    user_id: str,
    ai_router,
) -> AIRoutineResponse:
    """
    Genera una rutina adaptada a las lesiones crónicas del usuario.

    Si no hay lesiones activas, delega al generate_ai_routine() estándar.
    Siempre devuelve una respuesta válida: fallback estático si la IA falla.
    RGPD: solo envía body_area y severity (no injury_label, que es texto libre del usuario).
    """
    uid = uuid.UUID(user_id)
    injuries = await InjuryRepository.list_active(db, uid)

    if not injuries:
        return await RoutineService.generate_ai_routine(request)

    injury_block = _build_injury_prompt_block(injuries)

    base_prompt = f"""Eres un entrenador personal experto. Genera una rutina de entrenamiento estructurada en JSON.

Parámetros:
- Objetivo: {request.goal}
- Nivel: {request.level}
- Días por semana: {request.days_per_week}
- Equipamiento: {request.equipment}

{injury_block}

Responde SOLO con JSON válido con esta estructura exacta:
{{
  "label": "Nombre descriptivo de la rutina",
  "description": "Descripción breve de 1-2 frases",
  "days_per_week": {request.days_per_week},
  "focus_area": "área principal",
  "days": [
    {{
      "day_label": "Nombre del día",
      "focus": "Grupo muscular principal",
      "exercises": [
        {{
          "name": "Nombre del ejercicio",
          "muscle_group": "Músculo principal",
          "sets": 3,
          "reps": "8-12",
          "rest_sec": 90,
          "notes": "nota sobre modificación si aplica"
        }}
      ]
    }}
  ]
}}

Incluye exactamente {request.days_per_week} días. Cada día debe tener entre 4 y 6 ejercicios."""

    _STATIC_FALLBACK = AIRoutineResponse(
        label="Rutina de fuerza adaptada",
        description="Rutina adaptada a tus restricciones. Ajusta los ejercicios según tus sensaciones.",
        days_per_week=request.days_per_week,
        focus_area=request.goal,
        days=[],
    )

    try:
        response = await ai_router.call(
            use_case=AIUseCase.ROUTINE_GENERATION,
            request=AIRequest(
                messages=[AIMessage(role="user", content=base_prompt)],
                max_tokens=2048,
                temperature=0.7,
                timeout_s=30.0,
                response_format="json_object",
            ),
        )
        raw_text = response.content.strip()
        # Strip markdown code fences if present
        if raw_text.startswith("```"):
            raw_text = "\n".join(raw_text.split("\n")[1:])
            if raw_text.endswith("```"):
                raw_text = raw_text[: raw_text.rfind("```")]
        data = json.loads(raw_text)
        days = [
            AIRoutineDay(
                day_label=d["day_label"],
                focus=d["focus"],
                exercises=[
                    AIRoutineExercise(
                        name=e["name"],
                        muscle_group=e["muscle_group"],
                        sets=int(e["sets"]),
                        reps=str(e["reps"]),
                        rest_sec=int(e["rest_sec"]),
                        notes=e.get("notes", ""),
                    )
                    for e in d["exercises"]
                ],
            )
            for d in data["days"]
        ]
        return AIRoutineResponse(
            label=data["label"],
            description=data["description"],
            days_per_week=data["days_per_week"],
            focus_area=data["focus_area"],
            days=days,
        )

    except (AIProviderError, json.JSONDecodeError, Exception) as exc:
        logger.warning("generate_ai_routine_injury_aware fallback: %s", exc)
        return _STATIC_FALLBACK
