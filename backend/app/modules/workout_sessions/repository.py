# backend/app/modules/workout_sessions/repository.py
"""Queries SQLAlchemy async para workout sessions."""
from __future__ import annotations

from datetime import datetime
import uuid

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.workout_sessions.models import ExerciseSet, SessionExercise, WorkoutSession


async def create_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    routine_id: uuid.UUID | None,
    started_at: datetime,
    finished_at: datetime | None,
    notes: str | None,
    total_volume_kg: float,
    exercises_data: list[dict],
) -> WorkoutSession:
    duration_secs = None
    if finished_at and started_at:
        duration_secs = int((finished_at - started_at).total_seconds())

    session = WorkoutSession(
        user_id=user_id,
        routine_id=routine_id,
        started_at=started_at,
        finished_at=finished_at,
        duration_secs=duration_secs,
        notes=notes,
        total_volume_kg=total_volume_kg,
    )
    db.add(session)
    await db.flush()

    for ex_data in exercises_data:
        ex = SessionExercise(
            session_id=session.id,
            exercise_key=ex_data["exercise_key"],
            exercise_name=ex_data["exercise_name"],
            order_index=ex_data["order_index"],
        )
        db.add(ex)
        await db.flush()

        for s_data in ex_data["sets"]:
            s = ExerciseSet(
                session_exercise_id=ex.id,
                set_number=s_data["set_number"],
                weight_kg=s_data["weight_kg"],
                reps=s_data["reps"],
                rpe=s_data.get("rpe"),
                is_warmup=s_data.get("is_warmup", False),
                completed_at=s_data.get("completed_at"),
            )
            db.add(s)

    await db.commit()
    await db.refresh(session)
    return session


async def get_session_detail(
    db: AsyncSession, session_id: int, user_id: uuid.UUID
) -> WorkoutSession | None:
    result = await db.execute(
        select(WorkoutSession)
        .options(
            selectinload(WorkoutSession.exercises)
            .selectinload(SessionExercise.sets)
        )
        .where(WorkoutSession.id == session_id, WorkoutSession.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def list_sessions(
    db: AsyncSession,
    user_id: uuid.UUID,
    page: int = 1,
    per_page: int = 20,
    exercise_key: str | None = None,
) -> tuple[list[WorkoutSession], int]:
    base_q = select(WorkoutSession).where(WorkoutSession.user_id == user_id)
    if exercise_key:
        base_q = base_q.join(WorkoutSession.exercises).where(
            SessionExercise.exercise_key == exercise_key
        )
    count_q = select(func.count()).select_from(base_q.subquery())
    total = (await db.execute(count_q)).scalar_one()
    sessions_q = (
        base_q
        .options(selectinload(WorkoutSession.exercises))
        .order_by(desc(WorkoutSession.started_at))
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    rows = (await db.execute(sessions_q)).scalars().all()
    return list(rows), total


async def get_exercise_history(
    db: AsyncSession,
    user_id: uuid.UUID,
    exercise_key: str,
) -> list[dict]:
    result = await db.execute(
        select(
            WorkoutSession.started_at,
            func.max(ExerciseSet.weight_kg).label("max_weight_kg"),
            func.max(ExerciseSet.reps).label("max_reps"),
            func.sum(ExerciseSet.weight_kg * ExerciseSet.reps).label("total_volume_kg"),
        )
        .join(WorkoutSession.exercises)
        .join(SessionExercise.sets)
        .where(
            WorkoutSession.user_id == user_id,
            SessionExercise.exercise_key == exercise_key,
            ExerciseSet.is_warmup == False,  # noqa: E712
        )
        .group_by(WorkoutSession.started_at, WorkoutSession.id)
        .order_by(WorkoutSession.started_at)
    )
    rows = result.all()
    return [
        {
            "date": r.started_at.strftime("%Y-%m-%d"),
            "max_weight_kg": float(r.max_weight_kg),
            "max_reps": int(r.max_reps),
            "total_volume_kg": float(r.total_volume_kg),
        }
        for r in rows
    ]


async def get_best_1rm(
    db: AsyncSession,
    user_id: uuid.UUID,
    exercise_key: str,
) -> float | None:
    result = await db.execute(
        select(ExerciseSet.weight_kg, ExerciseSet.reps)
        .join(ExerciseSet.exercise)
        .join(SessionExercise.session)
        .where(
            WorkoutSession.user_id == user_id,
            SessionExercise.exercise_key == exercise_key,
            ExerciseSet.is_warmup == False,  # noqa: E712
        )
    )
    rows = result.all()
    if not rows:
        return None
    return max(r.weight_kg * (1 + r.reps / 30) for r in rows)
