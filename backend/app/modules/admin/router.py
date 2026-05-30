from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.security.dependencies import require_role
from app.modules.admin.schemas import (
    ModuleActivity,
    ModuleHealthItem,
    OverviewStats,
    PatchUserRequest,
    PlanDistributionItem,
    SystemServiceItem,
    TableInfo,
    TechnicalMetrics,
    TimeseriesMultiPoint,
    TimeseriesPoint,
    UserAdminRow,
)
from app.modules.admin.service import AdminService
from app.session import DBSession

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Maintenance mode (in-memory flag) ─────────────────────────────────────────
_maintenance_active: bool = False


class MaintenanceToggle(BaseModel):
    active: bool


@router.get("/maintenance", summary="[Admin] Estado del modo mantenimiento")
async def get_maintenance(_: None = Depends(require_role("admin"))):
    return {"active": _maintenance_active}


@router.post("/maintenance", summary="[Admin] Activar/desactivar modo mantenimiento")
async def set_maintenance(body: MaintenanceToggle, _: None = Depends(require_role("admin"))):
    global _maintenance_active
    _maintenance_active = body.active
    logger.info("Maintenance mode set to %s", _maintenance_active)
    return {"active": _maintenance_active}


# Función exportable para que el middleware de main.py la consulte
def is_maintenance_active() -> bool:
    return _maintenance_active


# ── Overview ──────────────────────────────────────────────────────────────────

@router.get("/stats/overview", response_model=OverviewStats, summary="[Admin] KPIs principales")
async def stats_overview(
    db: DBSession,
    _: dict = Depends(require_role("admin")),
) -> OverviewStats:
    data = await AdminService.get_overview(db)
    return OverviewStats(**data)


@router.get("/stats/timeseries", response_model=list[TimeseriesPoint], summary="[Admin] Registros por día")
async def stats_timeseries(
    db: DBSession,
    days: int = Query(default=30, ge=1, le=365),
    _: dict = Depends(require_role("admin")),
) -> list[TimeseriesPoint]:
    data = await AdminService.get_timeseries(db, days)
    return [TimeseriesPoint(**p) for p in data]


@router.get("/stats/timeseries-multi", response_model=list[TimeseriesMultiPoint], summary="[Admin] Timeseries multi-módulo")
async def stats_timeseries_multi(
    db: DBSession,
    days: int = Query(default=30, ge=1, le=365),
    _: dict = Depends(require_role("admin")),
) -> list[TimeseriesMultiPoint]:
    data = await AdminService.get_timeseries_multi(db, days)
    return [TimeseriesMultiPoint(**p) for p in data]


@router.get("/stats/modules", response_model=list[ModuleActivity], summary="[Admin] Actividad por módulo")
async def stats_modules(
    db: DBSession,
    _: dict = Depends(require_role("admin")),
) -> list[ModuleActivity]:
    data = await AdminService.get_module_activity(db)
    return [ModuleActivity(**m) for m in data]


@router.get("/stats/plans", response_model=list[PlanDistributionItem], summary="[Admin] Distribución de planes")
async def stats_plans(
    db: DBSession,
    _: dict = Depends(require_role("admin")),
) -> list[PlanDistributionItem]:
    data = await AdminService.get_plans_distribution(db)
    return [PlanDistributionItem(**item) for item in data]


# ── DB Explorer ───────────────────────────────────────────────────────────────

@router.get("/db/tables", response_model=list[TableInfo], summary="[Admin] Lista de tablas")
async def db_tables(
    db: DBSession,
    _: dict = Depends(require_role("admin")),
) -> list[TableInfo]:
    data = await AdminService.get_table_list(db)
    return [TableInfo(**t) for t in data]


@router.get("/db/tables/{table_name}", summary="[Admin] Datos de tabla paginados")
async def db_table_data(
    table_name: str,
    db: DBSession,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    _: dict = Depends(require_role("admin")),
) -> list[dict]:
    return await AdminService.get_table_data(db, table_name, page, limit)


# ── DB Health semaphore ───────────────────────────────────────────────────────

@router.get("/db/health", response_model=list[ModuleHealthItem], summary="[Admin] Salud de módulos BD")
async def db_health(
    db: DBSession,
    _: dict = Depends(require_role("admin")),
) -> list[ModuleHealthItem]:
    data = await AdminService.get_db_health(db)
    return [ModuleHealthItem(**item) for item in data]


# ── System health ─────────────────────────────────────────────────────────────

@router.get("/system/health", response_model=list[SystemServiceItem], summary="[Admin] Salud del sistema")
async def system_health(
    db: DBSession,
    _: dict = Depends(require_role("admin")),
) -> list[SystemServiceItem]:
    data = await AdminService.get_system_health(db)
    return [SystemServiceItem(**item) for item in data]


# ── Technical metrics ─────────────────────────────────────────────────────────

@router.get("/metrics/technical", response_model=TechnicalMetrics, summary="[Admin] Métricas técnicas")
async def metrics_technical(
    db: DBSession,
    _: dict = Depends(require_role("admin")),
) -> TechnicalMetrics:
    data = await AdminService.get_technical_metrics(db)
    return TechnicalMetrics(**data)


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserAdminRow], summary="[Admin] Listar usuarios")
async def list_users(
    db: DBSession,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: dict = Depends(require_role("admin")),
) -> list[UserAdminRow]:
    users = await AdminService.get_users(db, limit, offset)
    return [UserAdminRow.model_validate(u) for u in users]


@router.patch("/users/{user_id}", response_model=UserAdminRow, summary="[Admin] Actualizar usuario")
async def patch_user(
    user_id: str,
    body: PatchUserRequest,
    db: DBSession,
    admin: dict = Depends(require_role("admin")),
) -> UserAdminRow:
    user = await AdminService.patch_user(db, admin["user_id"], user_id, body)
    return UserAdminRow.model_validate(user)
