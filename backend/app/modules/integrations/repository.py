"""
app/modules/integrations/repository.py
========================================
Database access layer for integration tokens.
"""

from __future__ import annotations

from datetime import UTC
import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.integrations.models import IntegrationToken


class IntegrationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_token(self, user_id: uuid.UUID, platform: str) -> IntegrationToken | None:
        result = await self._db.execute(
            select(IntegrationToken).where(
                IntegrationToken.user_id == user_id,
                IntegrationToken.platform == platform,
            )
        )
        return result.scalar_one_or_none()

    async def list_tokens(self, user_id: uuid.UUID) -> list[IntegrationToken]:
        result = await self._db.execute(
            select(IntegrationToken).where(IntegrationToken.user_id == user_id)
        )
        return list(result.scalars().all())

    async def upsert_token(
        self,
        user_id: uuid.UUID,
        platform: str,
        access_token_enc: str,
        refresh_token_enc: str | None,
        expires_at: object,
        scope: str | None,
        platform_user_id: str | None,
    ) -> IntegrationToken:
        existing = await self.get_token(user_id, platform)
        if existing:
            existing.access_token_enc = access_token_enc
            existing.refresh_token_enc = refresh_token_enc
            existing.expires_at = expires_at
            existing.scope = scope
            existing.platform_user_id = platform_user_id
            await self._db.flush()
            return existing

        token = IntegrationToken(
            user_id=user_id,
            platform=platform,
            access_token_enc=access_token_enc,
            refresh_token_enc=refresh_token_enc,
            expires_at=expires_at,
            scope=scope,
            platform_user_id=platform_user_id,
        )
        self._db.add(token)
        await self._db.flush()
        return token

    async def mark_synced(self, user_id: uuid.UUID, platform: str) -> None:
        from datetime import datetime
        token = await self.get_token(user_id, platform)
        if token:
            token.last_sync_at = datetime.now(tz=UTC)
            await self._db.flush()

    async def delete_token(self, user_id: uuid.UUID, platform: str) -> bool:
        result = await self._db.execute(
            delete(IntegrationToken).where(
                IntegrationToken.user_id == user_id,
                IntegrationToken.platform == platform,
            )
        )
        await self._db.flush()
        return result.rowcount > 0
