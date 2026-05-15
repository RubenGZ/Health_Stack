# backend/app/modules/gym_servers/router.py
"""Endpoints de gym servers."""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select, func

from app.core.security.dependencies import CurrentUser, DBSession
from app.modules.gym_servers import service as svc
from app.modules.gym_servers.models import GymServer, GymMembership
from app.modules.gym_servers.schemas import (
    GymCreateRequest, GymResponse, JoinGymRequest,
    MembershipUpdateRequest, ChallengeCreateRequest,
)

router = APIRouter()


@router.post(
    "",
    response_model=GymResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear gym server",
)
async def create_gym(
    body: GymCreateRequest,
    db: DBSession,
    current_user: CurrentUser,
):
    user_id = uuid.UUID(current_user["user_id"])
    gym = await svc.create_gym(db, user_id, body.model_dump())
    count = (await db.execute(select(func.count()).where(GymMembership.gym_id == gym.id))).scalar_one()
    return GymResponse(
        id=gym.id, name=gym.name, description=gym.description,
        city=gym.city, province=gym.province, country=gym.country,
        invite_code=gym.invite_code, is_public=gym.is_public,
        is_verified=gym.is_verified, member_count=count,
    )


@router.post(
    "/join",
    status_code=status.HTTP_201_CREATED,
    summary="Unirse a un gym",
)
async def join_gym(
    body: JoinGymRequest,
    db: DBSession,
    current_user: CurrentUser,
):
    user_id = uuid.UUID(current_user["user_id"])
    try:
        await svc.join_gym(db, user_id, body.gym_id, body.invite_code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"joined": True}


@router.get(
    "/my-gyms",
    summary="Mis gyms",
)
async def my_gyms(
    db: DBSession,
    current_user: CurrentUser,
):
    user_id = uuid.UUID(current_user["user_id"])
    result = await db.execute(
        select(GymServer)
        .join(GymMembership, GymMembership.gym_id == GymServer.id)
        .where(GymMembership.user_id == user_id)
    )
    gyms = result.scalars().all()
    return [{"id": g.id, "name": g.name, "invite_code": g.invite_code} for g in gyms]


@router.get(
    "/{gym_id}/sparrings",
    summary="Buscar sparring en un gym",
)
async def get_sparrings(
    gym_id: int,
    db: DBSession,
    current_user: CurrentUser,
):
    user_id = uuid.UUID(current_user["user_id"])
    rows = await svc.get_sparrings(db, gym_id, user_id)
    return [
        {
            "user_id": str(r["membership"].user_id),
            "schedule": r["membership"].training_schedule,
            "goal": r["membership"].training_goal,
            "contact": r["membership"].contact_info,
        }
        for r in rows
    ]


@router.patch(
    "/my-profile/{gym_id}",
    summary="Actualizar perfil de sparring en un gym",
)
async def update_profile(
    gym_id: int,
    body: MembershipUpdateRequest,
    db: DBSession,
    current_user: CurrentUser,
):
    user_id = uuid.UUID(current_user["user_id"])
    result = await db.execute(
        select(GymMembership).where(
            GymMembership.user_id == user_id,
            GymMembership.gym_id == gym_id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="No eres miembro de este gym")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(membership, field, val)
    await db.commit()
    return {"updated": True}


@router.post(
    "/{gym_id}/challenges",
    status_code=status.HTTP_201_CREATED,
    summary="Crear reto de gym (solo admin/owner)",
)
async def create_challenge(
    gym_id: int,
    body: ChallengeCreateRequest,
    db: DBSession,
    current_user: CurrentUser,
):
    user_id = uuid.UUID(current_user["user_id"])
    result = await db.execute(
        select(GymMembership).where(
            GymMembership.gym_id == gym_id,
            GymMembership.user_id == user_id,
            GymMembership.role.in_(["admin", "owner"]),
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Solo admins pueden crear retos")
    challenge = await svc.create_challenge(db, gym_id, user_id, body.model_dump())
    return {"id": challenge.id, "title": challenge.title}


@router.post(
    "/{gym_id}/challenges/{challenge_id}/join",
    summary="Unirse a un reto de gym",
)
async def join_challenge(
    gym_id: int,
    challenge_id: int,
    db: DBSession,
    current_user: CurrentUser,
):
    user_id = uuid.UUID(current_user["user_id"])
    await svc.join_challenge(db, challenge_id, user_id)
    return {"joined": True}
