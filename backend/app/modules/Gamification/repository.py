"""
app/modules/Gamification/repository.py
=========================================
Capa de acceso a datos para el módulo de gamificación.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.Gamification.models import GamificationState


class GamificationRepository:

    @staticmethod
    async def get_or_create(
        db: AsyncSession,
        user_id: str | uuid.UUID,
    ) -> GamificationState:
        """
        Devuelve el estado existente o crea uno nuevo con valores iniciales.
        Patrón get-or-create: seguro para llamadas idempotentes.
        """
        uid = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id
        result = await db.execute(
            select(GamificationState).where(GamificationState.user_id == uid)
        )
        state = result.scalar_one_or_none()
        if state is None:
            state = GamificationState(user_id=uid)
            db.add(state)
            await db.flush()
            await db.refresh(state)
        return state

    @staticmethod
    async def save(db: AsyncSession, state: GamificationState) -> GamificationState:
        await db.flush()
        await db.refresh(state)
        return state
