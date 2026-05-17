# backend/app/modules/workout_sessions/service.py
"""Lógica de negocio: Epley 1RM, PR detection, gamificación."""
from __future__ import annotations

from datetime import UTC, datetime
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.workout_sessions import repository as repo
from app.modules.workout_sessions.schemas import (
    PRRecord,
    SessionCreateRequest,
    SessionCreateResponse,
)


def epley_1rm(weight_kg: float, reps: int) -> float:
    """Epley formula: weight × (1 + reps/30). Si reps <= 1, devuelve weight."""
    if reps <= 1:
        return float(weight_kg)
    return float(weight_kg * (1 + reps / 30))


def compute_volume(exercises_data: list[dict]) -> float:
    total = 0.0
    for ex in exercises_data:
        for s in ex["sets"]:
            if not s.get("is_warmup", False):
                total += s["weight_kg"] * s["reps"]
    return round(total, 2)


def detect_prs(
    exercises_data: list[dict],
    prev_bests: dict[str, float | None],
) -> list[PRRecord]:
    prs = []
    for ex in exercises_data:
        key = ex["exercise_key"]
        working = [s for s in ex["sets"] if not s.get("is_warmup", False)]
        if not working:
            continue
        session_best = max(epley_1rm(s["weight_kg"], s["reps"]) for s in working)
        prev = prev_bests.get(key)
        if prev is None or session_best > prev:
            prs.append(PRRecord(
                exercise_key=key,
                type="1rm_estimated",
                value=round(session_best, 2),
                prev=round(prev, 2) if prev else None,
            ))
    return prs


async def create_workout_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    request: SessionCreateRequest,
    gamification_service,
) -> SessionCreateResponse:
    exercises_data = [e.model_dump() for e in request.exercises]
    total_volume = compute_volume(exercises_data)

    prev_bests: dict[str, float | None] = {}
    for ex in exercises_data:
        key = ex["exercise_key"]
        prev_bests[key] = await repo.get_best_1rm(db, user_id, key)

    prs = detect_prs(exercises_data, prev_bests)

    session_obj = await repo.create_session(
        db=db,
        user_id=user_id,
        routine_id=request.routine_id,
        started_at=request.started_at,
        finished_at=request.finished_at or datetime.now(UTC),
        notes=request.notes,
        total_volume_kg=total_volume,
        exercises_data=exercises_data,
    )

    xp = 0
    try:
        result = await gamification_service.award_action(db, user_id, "workout")
        xp = result.xp_awarded if result else 0
    except Exception:
        pass

    duration_secs = None
    if session_obj.finished_at and session_obj.started_at:
        duration_secs = int((session_obj.finished_at - session_obj.started_at).total_seconds())

    # Intentar actualizar LP de rankeds (no bloquea si falla)
    try:
        from app.modules.ranked.service import process_workout_session as ranked_update
        muscle_groups = list({ex["exercise_key"].split("_")[0] for ex in exercises_data})
        await ranked_update(db=db, user_id=user_id, session_data={
            "total_volume_kg": total_volume,
            "personal_avg_volume": None,
            "muscle_groups": muscle_groups,
            "prs": [{"exercise_key": pr.exercise_key, "old_1rm": pr.prev, "new_1rm": pr.value} for pr in prs],
            "streak_days": 0,
        })
    except Exception:
        pass

    return SessionCreateResponse(
        session_id=session_obj.id,
        total_volume_kg=total_volume,
        duration_secs=duration_secs,
        prs=prs,
        xp_awarded=xp,
    )
