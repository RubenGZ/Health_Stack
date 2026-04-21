"""
app/modules/Health/router.py
==============================
Endpoints REST para el módulo de salud biométrica.

Prefijo: /api/v1/health
Todos los endpoints requieren autenticación (Bearer token).

Endpoints:
    GET    /records           → Listar registros (paginado)
    POST   /records           → Crear registro
    PATCH  /records/{id}      → Actualizar registro
    DELETE /records/{id}      → Eliminar registro
"""


from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.core.security.cryptoservice import CryptoService, get_crypto_service
from app.core.security.dependencies import CurrentUser
from app.modules.health.schemas import (
    HealthRecordCreate,
    HealthRecordListResponse,
    HealthRecordResponse,
    HealthRecordUpdate,
)
from app.modules.health.service import HealthService
from app.session import DBSession

router = APIRouter()

# Dependencia del CryptoService
CryptoDep = Annotated[CryptoService, Depends(get_crypto_service)]


@router.get(
    "/records",
    response_model=HealthRecordListResponse,
    summary="Listar registros biométricos",
    description=(
        "Devuelve los registros biométricos del usuario autenticado, "
        "ordenados por fecha descendente. Soporta paginación."
    ),
)
async def list_records(
    db: DBSession,
    current_user: CurrentUser,
    crypto: CryptoDep,
    limit: int = Query(default=90, ge=1, le=365, description="Máximo de registros"),
    offset: int = Query(default=0, ge=0, description="Registros a saltar"),
):
    return await HealthService.list_records(
        db=db,
        user_id=current_user["user_id"],
        crypto=crypto,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/records/{record_id}",
    response_model=HealthRecordResponse,
    summary="Obtener registro biométrico por ID",
    description="Devuelve un registro específico del usuario autenticado. 404 si no existe o no pertenece al usuario.",
)
async def get_record(
    record_id: str,
    db: DBSession,
    current_user: CurrentUser,
    crypto: CryptoDep,
):
    return await HealthService.get_record(
        db=db,
        user_id=current_user["user_id"],
        record_id=record_id,
        crypto=crypto,
    )


@router.post(
    "/records",
    response_model=HealthRecordResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear registro biométrico",
    description=(
        "Crea un nuevo registro de salud para la fecha indicada. "
        "Devuelve 409 si ya existe un registro para esa fecha (usar PATCH)."
    ),
)
async def create_record(
    body: HealthRecordCreate,
    db: DBSession,
    current_user: CurrentUser,
    crypto: CryptoDep,
):
    return await HealthService.create_record(
        db=db,
        user_id=current_user["user_id"],
        data=body,
        crypto=crypto,
    )


@router.patch(
    "/records/{record_id}",
    response_model=HealthRecordResponse,
    summary="Actualizar registro biométrico",
    description=(
        "Actualiza campos específicos de un registro existente (PATCH semántico). "
        "Solo los campos enviados en el body se modifican."
    ),
)
async def update_record(
    record_id: str,
    body: HealthRecordUpdate,
    db: DBSession,
    current_user: CurrentUser,
    crypto: CryptoDep,
):
    return await HealthService.update_record(
        db=db,
        user_id=current_user["user_id"],
        record_id=record_id,
        data=body,
        crypto=crypto,
    )


@router.delete(
    "/records/{record_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar registro biométrico",
    description=(
        "Elimina permanentemente un registro de salud. "
        "Ejercicio del derecho al olvido (Art. 17 RGPD)."
    ),
)
async def delete_record(
    record_id: str,
    db: DBSession,
    current_user: CurrentUser,
    crypto: CryptoDep,
):
    await HealthService.delete_record(
        db=db,
        user_id=current_user["user_id"],
        record_id=record_id,
        crypto=crypto,
    )
