# backend/app/modules/ranked/repository.py
"""Queries para leaderboard y perfil ranked."""
from __future__ import annotations

import uuid

from sqlalchemy import case, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.gym_servers.models import GymMembership
from app.modules.ranked.models import TIERS_COMPETITIVE, TIERS_NORMAL, RankedEvent, RankedProfile, RankedSeason
from app.modules.identity.models import User


async def get_active_season(db: AsyncSession) -> int:
    """
    Devuelve el número de la temporada activa (closed=False), o la más reciente
    si no hay ninguna marcada como activa. Fallback a season_id=1 si la tabla
    está vacía.
    """
    # Intentar obtener la temporada abierta (no cerrada)
    result = await db.execute(
        select(RankedSeason)
        .where(RankedSeason.closed == False)  # noqa: E712
        .order_by(desc(RankedSeason.season))
        .limit(1)
    )
    season_row = result.scalar_one_or_none()
    if season_row:
        return season_row.season

    # Si todas están cerradas, devolver la más reciente
    result = await db.execute(
        select(RankedSeason).order_by(desc(RankedSeason.season)).limit(1)
    )
    season_row = result.scalar_one_or_none()
    if season_row:
        return season_row.season

    # Fallback: sin filas en la tabla, usar season 1
    return 1


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
    """Top usuarios del gym por tier (desc) y LP (desc) en la cola dada.

    Hace JOIN con User para incluir display_name — necesario para no mostrar
    fragmentos UUID en el leaderboard visible al usuario.
    """
    tier_order = _tier_order_expr(queue)
    result = await db.execute(
        select(RankedProfile, GymMembership, User)
        .join(GymMembership, GymMembership.user_id == RankedProfile.user_id)
        .join(User, User.id == RankedProfile.user_id)
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
            "user": r.User,
        }
        for r in rows
    ]


async def get_global_leaderboard(
    db: AsyncSession, queue: str, limit: int = 50
) -> list[dict]:
    """
    Top usuarios global por tier (desc) y LP (desc).
    Sin filtro geográfico — incluye todos los usuarios con perfil ranked.
    """
    tier_order = _tier_order_expr(queue)
    result = await db.execute(
        select(RankedProfile, User)
        .join(User, User.id == RankedProfile.user_id)
        .where(RankedProfile.queue == queue)
        .order_by(desc(tier_order), desc(RankedProfile.lp))
        .limit(limit)
    )
    rows = result.all()
    return [
        {
            "profile": r.RankedProfile,
            "user": r.User,
        }
        for r in rows
    ]


async def get_national_leaderboard(
    db: AsyncSession, queue: str, country_code: str | None = None, limit: int = 50
) -> list[dict]:
    """
    Top usuarios por país.
    TODO: User model no tiene campo country_code — necesitaría migración para
    filtrar por país real. Por ahora fallback a leaderboard global.
    """
    # TODO: implement national filter once User.country_code column is added
    # e.g.: .where(User.country_code == country_code) if country_code else no-op
    return await get_global_leaderboard(db, queue, limit)


async def get_city_leaderboard(
    db: AsyncSession, queue: str, city: str | None = None, limit: int = 50
) -> list[dict]:
    """
    Top usuarios por ciudad.
    TODO: User model no tiene campo city — necesitaría migración para filtrar
    por ciudad real. Por ahora fallback a leaderboard global.
    """
    # TODO: implement city filter once User.city column is added
    # e.g.: .where(User.city == city) if city else fallback to national/global
    return await get_global_leaderboard(db, queue, limit)


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
