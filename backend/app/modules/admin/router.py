from __future__ import annotations
import logging
from fastapi import APIRouter, Depends, Query
from app.core.security.dependencies import require_role
from app.modules.admin.schemas import (
    OverviewStats, TimeseriesPoint, ModuleActivity,
    TableInfo, TechnicalMetrics, UserAdminRow, PatchUserRequest
)
from app.modules.admin.service import AdminService
from app.session import DBSession

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/stats/overview", response_model=OverviewStats, summary="[Admin] KPIs principales")
async def stats_overview(db: DBSession, _: dict = Depends(require_role("admin"))) -> OverviewStats:
    data = await AdminService.get_overview(db)
    return OverviewStats(**data)

@router.get("/stats/timeseries", response_model=list[TimeseriesPoint], summary="[Admin] Registros por día")
async def stats_timeseries(db: DBSession, days: int = Query(default=30, ge=1, le=365), _: dict = Depends(require_role("admin"))) -> list[TimeseriesPoint]:
    data = await AdminService.get_timeseries(db, days)
    return [TimeseriesPoint(**p) for p in data]

@router.get("/stats/modules", response_model=list[ModuleActivity], summary="[Admin] Actividad por módulo")
async def stats_modules(db: DBSession, _: dict = Depends(require_role("admin"))) -> list[ModuleActivity]:
    data = await AdminService.get_module_activity(db)
    return [ModuleActivity(**m) for m in data]

@router.get("/db/tables", response_model=list[TableInfo], summary="[Admin] Lista de tablas")
async def db_tables(db: DBSession, _: dict = Depends(require_role("admin"))) -> list[TableInfo]:
    data = await AdminService.get_table_list(db)
    return [TableInfo(**t) for t in data]

@router.get("/db/tables/{table_name}", summary="[Admin] Datos de tabla paginados")
async def db_table_data(
    table_name: str,
    db: DBSession,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    _: dict = Depends(require_role("admin"))
) -> list[dict]:
    return await AdminService.get_table_data(db, table_name, page, limit)

@router.get("/metrics/technical", response_model=TechnicalMetrics, summary="[Admin] Métricas técnicas")
async def metrics_technical(db: DBSession, _: dict = Depends(require_role("admin"))) -> TechnicalMetrics:
    data = await AdminService.get_technical_metrics(db)
    return TechnicalMetrics(**data)

@router.get("/users", response_model=list[UserAdminRow], summary="[Admin] Listar usuarios")
async def list_users(
    db: DBSession,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: dict = Depends(require_role("admin"))
) -> list[UserAdminRow]:
    users = await AdminService.get_users(db, limit, offset)
    return [UserAdminRow.model_validate(u) for u in users]

@router.patch("/users/{user_id}", response_model=UserAdminRow, summary="[Admin] Actualizar usuario")
async def patch_user(
    user_id: str,
    body: PatchUserRequest,
    db: DBSession,
    admin: dict = Depends(require_role("admin"))
) -> UserAdminRow:
    user = await AdminService.patch_user(db, admin["user_id"], user_id, body)
    return UserAdminRow.model_validate(user)
