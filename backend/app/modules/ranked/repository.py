# backend/app/modules/ranked/repository.py
"""Queries para leaderboard y perfil ranked."""
from __future__ import annotations

import uuid
from typing import Optional
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.ranked.models import RankedProfile, RankedEvent
from app.modules.gym_servers.models import GymMembership


async def get_profile(db: AsyncSession, user_id: uuid.UUID, queue: str) -> Optional[RankedProfile]:
    result = await db.execute(
        select(RankedProfile).where(
            RankedProfile.user_id == user_id,
            RankedProfile.queue == queue,
        )
    )
    return result.scalar_one_or_none()


async def get_gym_leaderboard(
    db: AsyncSession, gym_id: int, queue: str, limit: int = 50
) -> list[dict]:
    """Top usuarios del gym según LP en la cola dada."""
    result = await db.execute(
        select(RankedProfile, GymMembership)
        .join(GymMembership, GymMembership.user_id == RankedProfile.user_id)
        .where(
            GymMembership.gym_id == gym_id,
            RankedProfile.queue == queue,
        )
        .order_by(desc(RankedProfile.lp))
        .limit(limit)
    )
    rows = result.all()
    return [
        {
            "profile": r.RankedProfile,
            "membership": r.GymMembership,
        }
        for r in rows
    ]


async def get_recent_events(
    db: AsyncSession, user_id: uuid.UUID, queue: str, limit: int = 20
) -> list[RankedEvent]:
    result = await db.execute(
        select(RankedEvent)
        .where(RankedEvent.user_id == user_id, RankedEvent.queue == queue)
        .order_by(desc(RankedEvent.created_at))
        .limit(limit)
    )
    return list(result.scalars().all())
