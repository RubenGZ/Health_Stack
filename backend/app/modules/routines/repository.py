"""
app/modules/Routines/repository.py
=====================================
Capa de acceso a datos para el módulo de rutinas.
"""

from __future__ import annotations

import json
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.routines.models import SavedRoutine


class RoutineRepository:

    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        user_id: str | uuid.UUID,
        label: str,
        routine_json: str | dict,
    ) -> SavedRoutine:
        uid = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id
        # JSONB requiere dict; el frontend envía JSON string → parsear si es necesario
        routine_dict = json.loads(routine_json) if isinstance(routine_json, str) else routine_json
        routine = SavedRoutine(user_id=uid, label=label, routine_json=routine_dict)
        db.add(routine)
        await db.flush()
        await db.refresh(routine)
        return routine

    @staticmethod
    async def list_by_user(
        db: AsyncSession,
        user_id: str | uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[SavedRoutine], int]:
        uid = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id

        count_result = await db.execute(
            select(func.count()).where(SavedRoutine.user_id == uid)
        )
        total = count_result.scalar_one()

        result = await db.execute(
            select(SavedRoutine)
            .where(SavedRoutine.user_id == uid)
            .order_by(SavedRoutine.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all()), total

    @staticmethod
    async def get_by_id(
        db: AsyncSession,
        routine_id: str | uuid.UUID,
        user_id: str | uuid.UUID,
    ) -> SavedRoutine | None:
        rid = uuid.UUID(str(routine_id)) if isinstance(routine_id, str) else routine_id
        uid = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id
        result = await db.execute(
            select(SavedRoutine).where(
                SavedRoutine.id == rid,
                SavedRoutine.user_id == uid,
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def delete(db: AsyncSession, routine: SavedRoutine) -> None:
        await db.delete(routine)
        await db.flush()
