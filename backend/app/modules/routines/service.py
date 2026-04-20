"""
app/modules/Routines/service.py
=================================
Lógica de negocio para el módulo de rutinas.
"""

from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.routines.repository import RoutineRepository
from app.modules.routines.schemas import (
    RoutineCreate,
    RoutineListResponse,
    RoutineResponse,
)
from app.shared.exceptions import HealthRecordNotFoundError

logger = logging.getLogger(__name__)

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
