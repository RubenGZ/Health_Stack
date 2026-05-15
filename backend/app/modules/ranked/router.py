# backend/app/modules/ranked/router.py
"""Endpoints del sistema de rankeds."""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.core.security.dependencies import CurrentUser
from app.session import DBSession
from app.modules.ranked import repository as repo
from app.modules.ranked import service as svc
from app.modules.ranked.schemas import (
    RankedProfileResponse, QueueProfile, LeaderboardResponse,
    LeaderboardEntry, RankedEventResponse,
)

router = APIRouter()


@router.get(
    "/profile",
    response_model=RankedProfileResponse,
    summary="Perfil ranked del usuario",
    description="LP y tier del usuario en ambas colas (Normal y Competitivo).",
)
async def get_ranked_profile(
    db: DBSession,
    current_user: CurrentUser,
):
    user_id = uuid.UUID(current_user["user_id"])
    season = 1  # TODO: obtener de RankedSeason activa

    normal_p = await svc.get_or_create_profile(db, user_id, "normal", season)
    comp_p   = await svc.get_or_create_profile(db, user_id, "competitive", season)

    # La cola normal siempre está desbloqueada.
    # La cola competitiva se desbloquea al alcanzar "comprometido" en normal,
    # lo cual queda registrado en normal_p.competitive_unlocked.
    comp_unlocked = normal_p.competitive_unlocked or comp_p.competitive_unlocked
    return RankedProfileResponse(
        normal=QueueProfile(
            tier=normal_p.tier, division=normal_p.division, lp=normal_p.lp,
            peak_tier=normal_p.peak_tier, peak_div=normal_p.peak_division,
            season=normal_p.season, unlocked=True,
        ),
        competitive=QueueProfile(
            tier=comp_p.tier, division=comp_p.division, lp=comp_p.lp,
            peak_tier=comp_p.peak_tier, peak_div=comp_p.peak_division,
            season=comp_p.season, unlocked=comp_unlocked,
        ),
    )


@router.get(
    "/leaderboard",
    response_model=LeaderboardResponse,
    summary="Leaderboard",
    description="Leaderboard por scope (gym, city, national, global).",
)
async def get_leaderboard(
    db: DBSession,
    current_user: CurrentUser,
    queue: str = Query("competitive", pattern="^(normal|competitive)$"),
    scope: str = Query("gym", pattern="^(gym|city|national|global)$"),
    gym_id: Optional[int] = Query(None),
):
    if scope == "gym" and not gym_id:
        raise HTTPException(status_code=400, detail="gym_id requerido para scope=gym")

    user_id = uuid.UUID(current_user["user_id"])
    entries = []
    total = 0
    my_rank = None

    if scope == "gym" and gym_id:
        rows = await repo.get_gym_leaderboard(db, gym_id, queue)
        total = len(rows)
        for i, row in enumerate(rows, 1):
            p = row["profile"]
            entries.append(LeaderboardEntry(
                rank=i,
                username=str(p.user_id)[:8] + "...",
                tier=p.tier,
                division=p.division,
                lp=p.lp,
                badge=None,
            ))
            if p.user_id == user_id:
                my_rank = i

    return LeaderboardResponse(
        scope=scope, gym_id=gym_id, season=1,
        entries=entries[:50], my_rank=my_rank, total=total,
    )


@router.get(
    "/events",
    response_model=list[RankedEventResponse],
    summary="Historial de eventos LP",
    description="Últimos eventos LP del usuario.",
)
async def get_ranked_events(
    db: DBSession,
    current_user: CurrentUser,
    queue: str = Query("normal", pattern="^(normal|competitive)$"),
    limit: int = Query(20, ge=1, le=100),
):
    user_id = uuid.UUID(current_user["user_id"])
    events = await repo.get_recent_events(db, user_id, queue, limit)
    return [
        RankedEventResponse(
            event_type=e.event_type, lp_delta=e.lp_delta, lp_after=e.lp_after,
            tier_after=e.tier_after, div_after=e.div_after,
            created_at=e.created_at.isoformat(),
        )
        for e in events
    ]
