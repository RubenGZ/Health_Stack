# backend/app/modules/workout_sessions/post_workout_service.py
"""
Post-Workout AI Coach — lógica de negocio.

Genera un análisis completo de la sesión terminada:
  1. Resumen narrativo (qué salió bien, volumen, PRs)
  2. 3-5 consejos de coaching (recuperación, técnica, progresión, nutrición, mentalidad)
  3. Plan para la próxima sesión (foco, ejercicios, intensidad, duración)

El plan se guarda en workout_ai_plans con TTL 48 h y es idempotente por session_id.

RGPD: el prompt NUNCA contiene user_id, session_id UUID, email ni display_name.
Solo envía métricas numéricas (volumen, duración, sets/reps/pesos), nombres de
ejercicios y día de la semana (sin fecha completa).
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.workout_sessions.models import (
    ExerciseSet,
    SessionExercise,
    WorkoutSession,
)
from app.modules.workout_sessions.post_workout_repository import PostWorkoutRepository
from app.modules.workout_sessions.schemas import (
    CoachTip,
    NextSessionPlan,
    PostWorkoutCoachResponse,
)
from app.services.ai_router.schemas import AIMessage, AIRequest, AIUseCase

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Fallback plan — usado cuando la IA falla o devuelve JSON inválido
# ---------------------------------------------------------------------------

_FALLBACK_PLAN: dict = {
    "summary": "Buen entrenamiento completado. Mantén la consistencia y la progresión gradual.",
    "tips": [
        {
            "category": "recovery",
            "tip": "Asegúrate de dormir 7-9 horas esta noche para maximizar la recuperación muscular.",
        },
        {
            "category": "technique",
            "tip": "Revisa tu técnica en los ejercicios principales del próximo entreno.",
        },
        {
            "category": "progression",
            "tip": "Considera aumentar el peso un 2.5-5% cuando completes todas las series con buena técnica.",
        },
    ],
    "next_session": {
        "focus": "Recuperación activa o grupo muscular alternativo",
        "suggested_exercises": ["Sentadilla", "Press banca", "Peso muerto"],
        "intensity": "moderate",
        "estimated_duration_min": 60,
    },
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_DAYS_ES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]


def _day_of_week(dt: datetime) -> str:
    """Devuelve el día de la semana en español (sin fecha completa — RGPD)."""
    return _DAYS_ES[dt.weekday()]


async def _load_recent_sessions(
    db: AsyncSession,
    user_id: uuid.UUID,
    exclude_session_int_id: int | None,
    limit: int = 3,
) -> list[WorkoutSession]:
    """Carga las últimas `limit` sesiones del usuario excluyendo la sesión actual."""
    q = (
        select(WorkoutSession)
        .options(
            selectinload(WorkoutSession.exercises).selectinload(SessionExercise.sets)
        )
        .where(WorkoutSession.user_id == user_id)
        .order_by(desc(WorkoutSession.started_at))
        .limit(limit + 1)  # +1 para poder excluir la actual si aparece
    )
    rows = (await db.execute(q)).scalars().all()
    if exclude_session_int_id is not None:
        rows = [r for r in rows if r.id != exclude_session_int_id]
    return list(rows[:limit])


def _compute_session_volume(session: WorkoutSession) -> float:
    """Calcula el volumen total de una sesión sumando peso × reps por set."""
    total = 0.0
    for ex in session.exercises:
        for s in ex.sets:
            if not s.is_warmup:
                total += s.weight_kg * s.reps
    return round(total, 2)


def _build_recent_history_block(sessions: list[WorkoutSession]) -> str:
    """Genera el bloque de historial reciente para el prompt (sin fechas completas)."""
    if not sessions:
        return "Sin historial reciente disponible."
    lines = []
    for i, sess in enumerate(sessions, 1):
        day = _day_of_week(sess.started_at) if sess.started_at else "N/A"
        exercise_names = [ex.exercise_name for ex in sess.exercises[:6]]  # máx 6
        vol = sess.total_volume_kg or _compute_session_volume(sess)
        dur_min = (sess.duration_secs or 0) // 60
        lines.append(
            f"  Sesión -{i} ({day}): {', '.join(exercise_names)} | "
            f"volumen={vol:.0f} kg | duración={dur_min} min"
        )
    return "\n".join(lines)


def _build_prompt(
    session: WorkoutSession,
    recent_sessions: list[WorkoutSession],
    user_notes: str | None,
) -> str:
    """Construye el prompt de usuario para el coach post-entrenamiento.

    RGPD: no incluye user_id, session_id UUID, email ni display_name.
    """
    dur_min = (session.duration_secs or 0) // 60
    volume = session.total_volume_kg or _compute_session_volume(session)
    exercise_count = len(session.exercises)
    day = _day_of_week(session.started_at) if session.started_at else "N/A"

    # Construir lista de ejercicios con totales
    exercise_lines: list[str] = []
    for ex in session.exercises:
        work_sets = [s for s in ex.sets if not s.is_warmup]
        if work_sets:
            best_set = max(work_sets, key=lambda s: s.weight_kg * (1 + s.reps / 30))
            total_vol = sum(s.weight_kg * s.reps for s in work_sets)
            exercise_lines.append(
                f"  - {ex.exercise_name}: {len(work_sets)} series, "
                f"mejor set {best_set.weight_kg:.1f} kg × {best_set.reps} reps, "
                f"volumen={total_vol:.0f} kg"
            )
        else:
            exercise_lines.append(f"  - {ex.exercise_name}: sin series de trabajo registradas")

    exercises_block = "\n".join(exercise_lines) if exercise_lines else "  (sin detalle de ejercicios)"
    history_block = _build_recent_history_block(recent_sessions)
    notes_block = f"\nNotas del usuario: {user_notes}" if user_notes else ""

    return f"""Analiza este entrenamiento y devuelve SOLO JSON válido con el esquema exacto indicado.

SESIÓN ACTUAL ({day}):
- Duración: {dur_min} minutos
- Volumen total: {volume:.0f} kg
- Ejercicios ({exercise_count}):
{exercises_block}{notes_block}

HISTORIAL RECIENTE (últimas 3 sesiones):
{history_block}

ESQUEMA JSON A COMPLETAR (sin texto extra, sin markdown):
{{
  "summary": "string (2-3 frases que resuman logros, volumen y aspectos positivos)",
  "tips": [
    {{"category": "recovery|technique|progression|nutrition|mindset", "tip": "consejo concreto y accionable"}}
  ],
  "next_session": {{
    "focus": "string (grupo muscular o tipo de entreno recomendado)",
    "suggested_exercises": ["ejercicio1", "ejercicio2", "ejercicio3"],
    "intensity": "light|moderate|hard",
    "estimated_duration_min": 60
  }}
}}

Reglas:
- Entre 3 y 5 tips, cada uno de categoría diferente si es posible.
- El array tips debe tener objetos con exactamente los campos "category" y "tip".
- La intensidad next_session debe ser "light", "moderate" o "hard" (en inglés, sin variantes).
- Responde SOLO con el JSON, sin explicaciones adicionales."""


def _validate_and_parse_plan(raw_text: str) -> dict:
    """Parsea el JSON de la IA y valida los campos obligatorios.

    Devuelve el plan parseado o _FALLBACK_PLAN en caso de error.
    """
    # Strip markdown code fences si están presentes
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:])
        if text.endswith("```"):
            text = text[: text.rfind("```")]

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        logger.warning("[PostWorkoutCoach] JSON parse error: %s | raw: %.200s", exc, raw_text)
        return dict(_FALLBACK_PLAN)

    # Validar campos obligatorios
    if not all(k in data for k in ("summary", "tips", "next_session")):
        logger.warning("[PostWorkoutCoach] Missing required fields in AI response: %.200s", raw_text)
        return dict(_FALLBACK_PLAN)

    # Validar y sanear tips
    valid_categories = {"recovery", "technique", "progression", "nutrition", "mindset"}
    valid_tips = []
    for tip in data.get("tips", []):
        if isinstance(tip, dict) and "category" in tip and "tip" in tip:
            cat = tip["category"]
            if cat not in valid_categories:
                cat = "technique"
            valid_tips.append({"category": cat, "tip": str(tip["tip"])})
    if not valid_tips:
        valid_tips = _FALLBACK_PLAN["tips"]
    data["tips"] = valid_tips[:5]  # máx 5

    # Validar next_session
    ns = data.get("next_session", {})
    valid_intensities = {"light", "moderate", "hard"}
    if not isinstance(ns, dict) or "focus" not in ns:
        data["next_session"] = _FALLBACK_PLAN["next_session"]
    else:
        if ns.get("intensity") not in valid_intensities:
            ns["intensity"] = "moderate"
        if not isinstance(ns.get("suggested_exercises"), list):
            ns["suggested_exercises"] = _FALLBACK_PLAN["next_session"]["suggested_exercises"]
        try:
            ns["estimated_duration_min"] = int(ns.get("estimated_duration_min", 60))
        except (TypeError, ValueError):
            ns["estimated_duration_min"] = 60
        data["next_session"] = ns

    return data


# ---------------------------------------------------------------------------
# Public service function
# ---------------------------------------------------------------------------

async def generate_post_workout_coaching(
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    notes: str | None,
    ai_router,
) -> PostWorkoutCoachResponse:
    """Genera el análisis post-entrenamiento usando el AI Coach.

    Es idempotente: si ya existe un plan para este session_id, lo devuelve
    sin volver a llamar a la IA.

    Args:
        db: Sesión de base de datos async.
        user_id: UUID del usuario autenticado.
        session_id: UUID del plan (usado como clave de idempotencia en workout_ai_plans).
                    No es el entero PK de WorkoutSession — es el UUID enviado por el cliente.
        notes: Notas opcionales del usuario sobre la sesión.
        ai_router: Instancia de AIRouter para llamadas a la IA.

    Returns:
        PostWorkoutCoachResponse con el análisis completo.
    """

    # ── Step 1: Comprobar si ya existe un plan (idempotencia) ─────────────────
    existing_plan = await PostWorkoutRepository.get_plan_by_session(
        db=db,
        user_id=user_id,
        session_id=session_id,
    )
    if existing_plan:
        logger.info("[PostWorkoutCoach] Plan existente encontrado para session_id=%s", str(session_id)[:8])
        return _build_response_from_plan(existing_plan, session_id)

    # ── Step 2: Cargar la sesión más reciente del usuario como contexto ───────
    # WorkoutSession.id es Integer (PK auto), no UUID.
    # Cargamos la última sesión completada del usuario para extraer métricas.
    latest_q = (
        select(WorkoutSession)
        .options(
            selectinload(WorkoutSession.exercises).selectinload(SessionExercise.sets)
        )
        .where(
            WorkoutSession.user_id == user_id,
            WorkoutSession.finished_at.isnot(None),
        )
        .order_by(desc(WorkoutSession.started_at))
        .limit(1)
    )
    latest_result = await db.execute(latest_q)
    current_session = latest_result.scalar_one_or_none()

    if current_session is None:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    # ── Step 3: Cargar historial reciente (últimas 3 sesiones anteriores) ─────
    recent_sessions = await _load_recent_sessions(
        db=db,
        user_id=user_id,
        exclude_session_int_id=current_session.id,
        limit=3,
    )

    # ── Step 4: Construir el prompt ───────────────────────────────────────────
    system_msg = AIMessage(
        role="system",
        content=(
            "Eres un coach de fuerza personal experto. Analiza el entrenamiento "
            "y responde SOLO con JSON válido según el esquema indicado."
        ),
    )
    user_msg = AIMessage(
        role="user",
        content=_build_prompt(current_session, recent_sessions, notes),
    )

    # ── Step 5: Llamar al AIRouter ────────────────────────────────────────────
    parsed_plan: dict
    provider_used = "fallback"

    try:
        response = await ai_router.call(
            use_case=AIUseCase.POST_WORKOUT_COACH,
            request=AIRequest(
                messages=[system_msg, user_msg],
                max_tokens=1024,
                temperature=0.6,
                timeout_s=20.0,
                response_format="json_object",
            ),
            user_id=str(user_id),
        )
        provider_used = response.provider_used
        parsed_plan = _validate_and_parse_plan(response.content)
        logger.info(
            "[PostWorkoutCoach] Respuesta IA recibida. provider=%s latency=%dms",
            response.provider_used,
            response.latency_ms,
        )
    except Exception as exc:
        logger.warning("[PostWorkoutCoach] AIRouter error — usando fallback: %s", exc)
        parsed_plan = dict(_FALLBACK_PLAN)

    # ── Step 6: Guardar en DB ─────────────────────────────────────────────────
    expires_at = datetime.now(timezone.utc) + timedelta(hours=48)
    plan = await PostWorkoutRepository.save_plan(
        db=db,
        user_id=user_id,
        source_session_id=session_id,
        plan_json=parsed_plan,
        expires_at=expires_at,
    )

    # ── Step 7: Construir y devolver PostWorkoutCoachResponse ─────────────────
    response_obj = _build_response_from_plan(plan, session_id, provider_used=provider_used)
    logger.info(
        "[PostWorkoutCoach] Plan generado. plan_id=%d user=%s",
        plan.id,
        str(user_id)[:8],
    )
    return response_obj


# ---------------------------------------------------------------------------
# Internal builder
# ---------------------------------------------------------------------------

def _build_response_from_plan(
    plan,
    session_id: uuid.UUID,
    provider_used: str = "cache",
) -> PostWorkoutCoachResponse:
    """Construye un PostWorkoutCoachResponse desde un WorkoutAIPlan ORM."""
    data = plan.plan_json

    tips = [
        CoachTip(category=t["category"], tip=t["tip"])
        for t in data.get("tips", _FALLBACK_PLAN["tips"])
    ]

    ns_data = data.get("next_session", _FALLBACK_PLAN["next_session"])
    next_session = NextSessionPlan(
        focus=ns_data.get("focus", "Recuperación"),
        suggested_exercises=ns_data.get("suggested_exercises", []),
        intensity=ns_data.get("intensity", "moderate"),
        estimated_duration_min=int(ns_data.get("estimated_duration_min", 60)),
    )

    return PostWorkoutCoachResponse(
        session_id=session_id,
        summary=data.get("summary", _FALLBACK_PLAN["summary"]),
        tips=tips,
        next_session=next_session,
        plan_id=plan.id,
        expires_at=plan.expires_at,
        provider_used=provider_used,
    )
