"""
app/modules/Routines/router.py
================================
Endpoints REST para el módulo de rutinas.

Prefijo: /api/v1/routines
Todos requieren autenticación.

Endpoints:
    GET    /        → Listar rutinas del usuario
    POST   /        → Guardar rutina
    DELETE /{id}    → Eliminar rutina
"""

from __future__ import annotations

from fastapi import APIRouter, Query, status

from app.core.security.dependencies import CurrentUser
from app.modules.routines.schemas import RoutineCreate, RoutineListResponse, RoutineResponse
from app.modules.routines.service import RoutineService
from app.session import DBSession

router = APIRouter()


@router.get(
    "/",
    response_model=RoutineListResponse,
    summary="Listar rutinas guardadas",
)
async def list_routines(
    db: DBSession,
    current_user: CurrentUser,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    return await RoutineService.list_routines(
        db=db,
        user_id=current_user["user_id"],
        limit=limit,
        offset=offset,
    )


@router.post(
    "/",
    response_model=RoutineResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Guardar rutina",
)
async def save_routine(
    body: RoutineCreate,
    db: DBSession,
    current_user: CurrentUser,
):
    return await RoutineService.save_routine(
        db=db,
        user_id=current_user["user_id"],
        data=body,
    )


@router.delete(
    "/{routine_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar rutina",
)
async def delete_routine(
    routine_id: str,
    db: DBSession,
    current_user: CurrentUser,
):
    await RoutineService.delete_routine(
        db=db,
        user_id=current_user["user_id"],
        routine_id=routine_id,
    )
