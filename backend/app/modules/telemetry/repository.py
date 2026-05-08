from __future__ import annotations
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.telemetry.models import PageView

class TelemetryRepository:

    @staticmethod
    async def create_page_view(
        db: AsyncSession,
        page: str,
        country: str | None,
        user_id: str | None,
        is_auth: bool,
        is_admin: bool,
    ) -> None:
        pv = PageView(
            page=page,
            country=country,
            user_id=uuid.UUID(user_id) if user_id else None,
            is_auth=is_auth,
            is_admin=is_admin,
        )
        db.add(pv)
        await db.flush()
