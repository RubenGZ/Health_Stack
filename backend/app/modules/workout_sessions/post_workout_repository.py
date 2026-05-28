# backend/app/modules/workout_sessions/post_workout_repository.py
"""Repository para WorkoutAIPlan — planes IA post-entrenamiento."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.workout_sessions.models import WorkoutAIPlan


class PostWorkoutRepository:
    """CRUD estático para la tabla workout_ai_plans."""

    @staticmethod
    async def save_plan(
        db: AsyncSession,
        user_id: uuid.UUID,
        source_session_id: uuid.UUID,
        plan_json: dict,
        expires_at: datetime,
    ) -> WorkoutAIPlan:
        """Inserta un nuevo WorkoutAIPlan.

        Si ya existe un plan para source_session_id (UNIQUE constraint),
        captura el IntegrityError y devuelve el plan existente.
        """
        plan = WorkoutAIPlan(
            user_id=user_id,
            source_session_id=source_session_id,
            plan_json=plan_json,
            expires_at=expires_at,
        )
        db.add(plan)
        try:
            await db.flush()
            await db.commit()
            await db.refresh(plan)
            return plan
        except IntegrityError:
            await db.rollback()
            # El plan ya existe — devolver el existente
            result = await db.execute(
                select(WorkoutAIPlan).where(
                    WorkoutAIPlan.source_session_id == source_session_id
                )
            )
            return result.scalar_one()

    @staticmethod
    async def get_plan_by_session(
        db: AsyncSession,
        user_id: uuid.UUID,
        session_id: uuid.UUID,
    ) -> WorkoutAIPlan | None:
        """Devuelve el plan cuyo source_session_id coincide, filtrando por user_id."""
        result = await db.execute(
            select(WorkoutAIPlan).where(
                WorkoutAIPlan.source_session_id == session_id,
                WorkoutAIPlan.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_latest_active_plan(
        db: AsyncSession,
        user_id: uuid.UUID,
    ) -> WorkoutAIPlan | None:
        """Devuelve el plan más reciente no usado y no expirado para el usuario."""
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(WorkoutAIPlan)
            .where(
                WorkoutAIPlan.user_id == user_id,
                WorkoutAIPlan.used == False,  # noqa: E712
                WorkoutAIPlan.expires_at > now,
            )
            .order_by(WorkoutAIPlan.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def mark_used(
        db: AsyncSession,
        plan_id: int,
        user_id: uuid.UUID,
    ) -> bool:
        """Marca el plan como usado. Devuelve True si se actualizó, False si no existe o no pertenece al usuario."""
        result = await db.execute(
            update(WorkoutAIPlan)
            .where(
                WorkoutAIPlan.id == plan_id,
                WorkoutAIPlan.user_id == user_id,
            )
            .values(used=True)
        )
        await db.commit()
        return result.rowcount > 0
