from __future__ import annotations

import json
import logging
from datetime import date, timedelta

import httpx
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security.cryptoservice import CryptoService
from app.modules.gamification.models import GamificationEvent, GamificationState
from app.modules.health.models import HealthRecord
from app.modules.health.repository import HealthRepository
from app.modules.routines.models import SavedRoutine
from app.modules.ai_insights.schemas import (
    BiomarkerNarratorResponse,
    InjuryRiskFlag,
    InjuryRiskResponse,
    MicroGoal,
    WeeklyGoalsResponse,
)

logger = logging.getLogger(__name__)

_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
_MODEL    = "llama-3.3-70b-versatile"


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _call_groq(prompt: str, max_tokens: int = 200) -> str | None:
    cfg = get_settings()
    if not cfg.grok_api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _GROQ_URL,
                headers={
                    "Authorization": f"Bearer {cfg.grok_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": _MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": max_tokens,
                    "temperature": 0.5,
                },
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
    except httpx.TimeoutException:
        logger.warning("Groq timeout en ai_insights")
        return None
    except Exception as exc:
        logger.error("ai_insights Groq error: %s", exc)
        return None


async def _resolve_health_subject(user_id: str, db: AsyncSession) -> str | None:
    crypto = CryptoService()
    try:
        subject_id = await crypto.resolve_health_subject_id(user_id, db)
        return str(subject_id)
    except Exception:
        return None


async def _get_recent_weight_records(
    db: AsyncSession, subject_id: str, days: int = 30
) -> list[HealthRecord]:
    cutoff = date.today() - timedelta(days=days)
    result = await db.execute(
        select(HealthRecord)
        .where(
            and_(
                HealthRecord.health_subject_id == subject_id,
                HealthRecord.recorded_date >= cutoff,
            )
        )
        .order_by(HealthRecord.recorded_date.asc())
    )
    return list(result.scalars().all())


async def _get_gamification_state(db: AsyncSession, user_id: str) -> dict:
    result = await db.execute(
        select(GamificationState).where(GamificationState.user_id == user_id)
    )
    state = result.scalar_one_or_none()
    if state:
        return {"level": state.level, "xp": state.xp_total, "streak": state.streak_days}
    return {"level": 1, "xp": 0, "streak": 0}


async def _count_workout_events(db: AsyncSession, user_id: str, days: int = 7) -> int:
    cutoff = date.today() - timedelta(days=days)
    result = await db.execute(
        select(func.count()).where(
            and_(
                GamificationEvent.user_id == user_id,
                GamificationEvent.action == "routine",
                GamificationEvent.created_at >= cutoff,
            )
        )
    )
    return result.scalar_one()


async def _get_saved_routines(db: AsyncSession, user_id: str) -> list[SavedRoutine]:
    result = await db.execute(
        select(SavedRoutine)
        .where(SavedRoutine.user_id == user_id)
        .order_by(SavedRoutine.created_at.desc())
        .limit(3)
    )
    return list(result.scalars().all())


# ── Biomarker Narrator ────────────────────────────────────────────────────────

async def get_biomarker_narrative(
    user_id: str, db: AsyncSession
) -> BiomarkerNarratorResponse:
    subject_id = await _resolve_health_subject(user_id, db)
    gamification  = await _get_gamification_state(db, user_id)
    workout_count = await _count_workout_events(db, user_id, days=30)

    weight_records: list[HealthRecord] = []
    if subject_id:
        weight_records = await _get_recent_weight_records(db, subject_id, days=30)

    if not weight_records and workout_count == 0:
        return BiomarkerNarratorResponse(
            narrative="Aún no tienes suficientes datos registrados. Empieza a registrar tu peso y entrenamientos para obtener un análisis personalizado.",
            trend="insufficient_data",
            highlights=["Registra tu peso diariamente", "Completa al menos 3 entrenamientos esta semana"],
        )

    # Build summary for Groq
    weights = [(str(r.recorded_date), float(r.weight_kg)) for r in weight_records if r.weight_kg]
    weight_summary = ""
    if weights:
        first_w = weights[0][1]
        last_w  = weights[-1][1]
        delta   = last_w - first_w
        weight_summary = (
            f"Peso inicial: {first_w}kg, peso actual: {last_w}kg, "
            f"cambio: {delta:+.1f}kg en {len(weights)} registros.\n"
        )

    prompt = f"""Eres un analista de salud y fitness. Analiza estos datos de los últimos 30 días y genera un resumen narrativo conciso.

{weight_summary}Entrenamientos completados este mes: {workout_count}
Nivel en la app: {gamification['level']}, racha: {gamification['streak']} días

Responde EXACTAMENTE en este formato JSON (sin bloques de código):
{{
  "narrative": "3-4 frases en español describiendo el progreso del usuario de forma motivadora y honesta",
  "trend": "improving" o "declining" o "stable" o "insufficient_data",
  "highlights": ["punto clave 1", "punto clave 2", "punto clave 3"]
}}"""

    raw = await _call_groq(prompt, max_tokens=250)

    if raw:
        try:
            data = json.loads(raw)
            return BiomarkerNarratorResponse(
                narrative=data.get("narrative", ""),
                trend=data.get("trend", "stable"),
                highlights=data.get("highlights", []),
            )
        except (json.JSONDecodeError, KeyError):
            # Parse fallback: first line as narrative
            pass

    # Fallback without Groq
    if weights:
        delta = weights[-1][1] - weights[0][1]
        trend = "declining" if delta > 0.5 else ("improving" if delta < -0.5 else "stable")
    else:
        trend = "stable"

    return BiomarkerNarratorResponse(
        narrative=f"Has completado {workout_count} entrenamientos este mes. ¡Sigue con la consistencia!",
        trend=trend,
        highlights=[
            f"{workout_count} entrenamientos este mes",
            f"Racha actual: {gamification['streak']} días",
            f"Nivel {gamification['level']}",
        ],
    )


# ── Injury Risk ───────────────────────────────────────────────────────────────

async def get_injury_risk(user_id: str, db: AsyncSession) -> InjuryRiskResponse:
    routines = await _get_saved_routines(db, user_id)
    workouts_this_week = await _count_workout_events(db, user_id, days=7)

    if not routines:
        return InjuryRiskResponse(
            risk_flags=[],
            overall_risk="low",
            summary="Sin datos de rutinas para analizar. Registra tus entrenamientos para obtener análisis de riesgo.",
        )

    # Parse latest routine exercises
    latest_json = {}
    try:
        latest_json = json.loads(routines[0].routine_json)
    except (json.JSONDecodeError, AttributeError):
        pass

    sessions = latest_json.get("sessions", [])
    exercise_names: list[str] = []
    for s in sessions:
        for ex in s.get("exercises", []):
            exercise_names.append(ex.get("name", ""))

    exercise_summary = ", ".join(exercise_names[:10]) if exercise_names else "rutina genérica"

    prompt = f"""Eres un fisioterapeuta deportivo experto. Analiza este plan de entrenamiento y detecta riesgos de lesión.

Ejercicios en la rutina: {exercise_summary}
Entrenamientos esta semana: {workouts_this_week} de 7 días

Responde EXACTAMENTE en este formato JSON (sin bloques de código):
{{
  "risk_flags": [
    {{"muscle_group": "nombre", "risk_level": "low|medium|high", "detail": "qué observas", "recommendation": "qué hacer"}}
  ],
  "overall_risk": "low" o "medium" o "high",
  "summary": "1-2 frases resumiendo el estado general"
}}

Máximo 3 risk_flags. Si no hay riesgos claros, devuelve risk_flags vacío con overall_risk "low"."""

    raw = await _call_groq(prompt, max_tokens=300)

    if raw:
        try:
            data = json.loads(raw)
            flags = [
                InjuryRiskFlag(
                    muscle_group=f.get("muscle_group", ""),
                    risk_level=f.get("risk_level", "low"),
                    detail=f.get("detail", ""),
                    recommendation=f.get("recommendation", ""),
                )
                for f in data.get("risk_flags", [])[:3]
            ]
            return InjuryRiskResponse(
                risk_flags=flags,
                overall_risk=data.get("overall_risk", "low"),
                summary=data.get("summary", ""),
            )
        except (json.JSONDecodeError, KeyError):
            pass

    # Fallback
    risk = "high" if workouts_this_week >= 6 else ("medium" if workouts_this_week >= 4 else "low")
    return InjuryRiskResponse(
        risk_flags=[],
        overall_risk=risk,
        summary=f"Con {workouts_this_week} entrenamientos esta semana, asegúrate de incluir días de descanso.",
    )


# ── Weekly Goals ─────────────────────────────────────────────────────────────

async def get_weekly_goals(user_id: str, db: AsyncSession) -> WeeklyGoalsResponse:
    gamification  = await _get_gamification_state(db, user_id)
    workout_count = await _count_workout_events(db, user_id, days=7)
    subject_id    = await _resolve_health_subject(user_id, db)

    weight_records: list[HealthRecord] = []
    if subject_id:
        weight_records = await _get_recent_weight_records(db, subject_id, days=14)

    weight_str = ""
    if weight_records:
        weights = [float(r.weight_kg) for r in weight_records if r.weight_kg]
        if weights:
            weight_str = f"Peso reciente: {weights[-1]}kg. "

    prompt = f"""Eres un coach de fitness personal. Genera 3 micro-objetivos específicos y alcanzables para esta semana.

Datos del usuario:
- Nivel: {gamification['level']}, XP total: {gamification['xp']}
- Racha actual: {gamification['streak']} días
- Entrenamientos la semana pasada: {workout_count}
- {weight_str}

Responde EXACTAMENTE en este formato JSON (sin bloques de código):
{{
  "goals": [
    {{"goal": "objetivo concreto en español", "reasoning": "por qué este objetivo ahora", "category": "weight|training|nutrition|recovery"}},
    {{"goal": "...", "reasoning": "...", "category": "..."}},
    {{"goal": "...", "reasoning": "...", "category": "..."}}
  ],
  "week_summary": "1 frase motivadora para esta semana"
}}"""

    raw = await _call_groq(prompt, max_tokens=300)

    if raw:
        try:
            data = json.loads(raw)
            goals = [
                MicroGoal(
                    goal=g.get("goal", ""),
                    reasoning=g.get("reasoning", ""),
                    category=g.get("category", "training"),
                )
                for g in data.get("goals", [])[:3]
            ]
            return WeeklyGoalsResponse(
                goals=goals,
                week_summary=data.get("week_summary", ""),
            )
        except (json.JSONDecodeError, KeyError):
            pass

    # Fallback
    default_goals = [
        MicroGoal(goal="Completa 3 entrenamientos esta semana", reasoning="La consistencia es la base del progreso", category="training"),
        MicroGoal(goal="Registra tu peso cada mañana", reasoning="El seguimiento es clave para ajustar el plan", category="weight"),
        MicroGoal(goal="Duerme al menos 7 horas cada noche", reasoning="El descanso es donde ocurre la recuperación muscular", category="recovery"),
    ]
    return WeeklyGoalsResponse(
        goals=default_goals,
        week_summary="¡Esta semana, la constancia marca la diferencia!",
    )
