from __future__ import annotations
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.telemetry.repository import TelemetryRepository
from app.modules.telemetry.schemas import PageViewCreate

class TelemetryService:

    @staticmethod
    async def record_page_view(
        db: AsyncSession,
        data: PageViewCreate,
        user_id: str | None,
        is_auth: bool,
        is_admin: bool,
    ) -> None:
        await TelemetryRepository.create_page_view(
            db=db,
            page=data.page,
            country=data.country,
            user_id=user_id,
            is_auth=is_auth,
            is_admin=is_admin,
        )
