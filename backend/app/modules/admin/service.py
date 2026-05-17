from __future__ import annotations

import logging

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.repository import ALLOWED_TABLES, AdminRepository
from app.modules.admin.schemas import PatchUserRequest
from app.modules.identity.repository import UserRepository

logger = logging.getLogger(__name__)

class AdminService:

    @staticmethod
    async def get_overview(db: AsyncSession) -> dict:
        return await AdminRepository.get_overview(db)

    @staticmethod
    async def get_timeseries(db: AsyncSession, days: int) -> list[dict]:
        days = max(1, min(days, 365))
        return await AdminRepository.get_timeseries(db, days)

    @staticmethod
    async def get_module_activity(db: AsyncSession) -> list[dict]:
        return await AdminRepository.get_module_activity(db)

    @staticmethod
    async def get_table_list(db: AsyncSession) -> list[dict]:
        return await AdminRepository.get_table_list(db)

    @staticmethod
    async def get_table_data(db: AsyncSession, table_name: str, page: int, limit: int) -> list[dict]:
        if table_name not in ALLOWED_TABLES:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Tabla '{table_name}' no disponible.")
        return await AdminRepository.get_table_data(db, table_name, page, min(limit, 100))

    @staticmethod
    async def get_technical_metrics(db: AsyncSession) -> dict:
        return await AdminRepository.get_technical_metrics(db)

    @staticmethod
    async def get_users(db: AsyncSession, limit: int, offset: int) -> list:
        return await AdminRepository.get_users(db, limit, offset)

    @staticmethod
    async def patch_user(db: AsyncSession, admin_user_id: str, target_id: str, body: PatchUserRequest) -> object:
        if admin_user_id == target_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes modificar tu propia cuenta.")

        user = await UserRepository.get_by_id(db, target_id)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado.")

        if body.role is not None:
            if body.role not in ("user", "admin"):
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Rol inválido. Valores: 'user', 'admin'.")
            if body.role == "user" and user.role == "admin":
                admin_count = await AdminRepository.get_admin_count(db)
                if admin_count <= 1:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No puedes degradar al único admin activo.")
            user.role = body.role

        if body.plan is not None:
            if body.plan not in ("free", "pro", "elite"):
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Plan inválido. Valores: 'free', 'pro', 'elite'.")
            user.plan = body.plan

        if body.is_active is not None:
            user.is_active = body.is_active

        await db.flush()
        await db.refresh(user)
        logger.info(f"Admin {admin_user_id[:8]} actualizó usuario {target_id[:8]}: role={body.role} plan={body.plan} is_active={body.is_active}")
        return user
