# backend/app/modules/ranked/repository.py
"""Queries para leaderboard y perfil ranked."""
from __future__ import annotations

import uuid

from sqlalchemy import case, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.gym_servers.models import GymMembership
from app.modules.ranked.models import TIERS_COMPETITIVE, TIERS_NORMAL, RankedEvent, RankedProfile


async def get_profile(db: AsyncSession, user_id: uuid.UUID, queue: str) -> RankedProfile | None:
    result = await db.execute(
        select(RankedProfile).where(
            RankedProfile.user_id == user_id,
            RankedProfile.queue == queue,
        )
    )
    return result.scalar_one_or_none()


def _tier_order_expr(queue: str):
    """Expresión CASE SQL que asigna el índice numérico de cada tier para ordenar."""
    tiers = TIERS_NORMAL if queue == "normal" else TIERS_COMPETITIVE
    return case(
        *[(RankedProfile.tier == tier, idx) for idx, tier in enumerate(tiers)],
        else_=0,
    )


async def get_gym_leaderboard(
    db: AsyncSession, gym_id: int, queue: str, limit: int = 50
) -> list[dict]:
    """Top usuarios del gym por tier (desc) y LP (desc) en la cola dada."""
    tier_order = _tier_order_expr(queue)
    result = await db.execute(
        select(RankedProfile, GymMembership)
        .join(GymMembership, GymMembership.user_id == RankedProfile.user_id)
        .where(
            GymMembership.gym_id == gym_id,
            RankedProfile.queue == queue,
        )
        .order_by(desc(tier_order), desc(RankedProfile.lp))
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
