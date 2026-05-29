# backend/app/modules/gym_servers/router.py
"""Endpoints de gym servers."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, select

from app.core.security.dependencies import CurrentUser
from app.modules.gym_servers import service as svc
from app.modules.gym_servers.models import GymMembership, GymServer
from app.modules.gym_servers.schemas import (
    ChallengeCreateRequest,
    ChallengeResponse,
    GymCreateRequest,
    GymPublicResponse,
    GymResponse,
    JoinChallengeResponse,
    JoinGymRequest,
    JoinGymResponse,
    MembershipUpdateRequest,
    MembershipUpdateResponse,
    MyGymSummary,
    SparringProfile,
)
from app.session import DBSession

router = APIRouter()


@router.get(
    "",
    response_model=list[GymPublicResponse],
    summary="Descubrir gyms públicos",
    description="Listado público de gyms. No requiere autenticación.",
)
async def discover_gyms(
    db: DBSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    rows = await svc.list_public_gyms(db, limit=limit, offset=offset)
    return [
        GymPublicResponse(
            id=r["gym"].id,
            name=r["gym"].name,
            description=r["gym"].description,
            city=r["gym"].city,
            province=r["gym"].province,
            country=r["gym"].country,
            is_public=r["gym"].is_public,
            is_verified=r["gym"].is_verified,
            member_count=r["member_count"],
        )
        for r in rows
    ]


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
    response_model=JoinGymResponse,
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
    return JoinGymResponse(joined=True)


@router.get(
    "/my-gyms",
    response_model=list[MyGymSummary],
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
    return [MyGymSummary(id=g.id, name=g.name, invite_code=g.invite_code) for g in gyms]


@router.delete(
    "/{gym_id}/members/me",
    summary="Abandonar gym",
    description="El usuario autenticado abandona el gym. Devuelve 204 si tiene éxito.",
)
async def leave_gym(
    gym_id: int,
    db: DBSession,
    current_user: CurrentUser,
):
    user_id = uuid.UUID(current_user["user_id"])
    try:
        await svc.leave_gym(db, user_id, gym_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return Response(status_code=204)


@router.get(
    "/{gym_id}/sparrings",
    response_model=list[SparringProfile],
    summary="Buscar sparring en un gym",
)
async def get_sparrings(
    gym_id: int,
    db: DBSession,
    current_user: CurrentUser,
):
    user_id = uuid.UUID(current_user["user_id"])
    # Solo miembros del gym pueden ver los perfiles de sparring
    membership_check = (await db.execute(
        select(GymMembership).where(
            GymMembership.user_id == user_id,
            GymMembership.gym_id == gym_id,
        )
    )).scalar_one_or_none()
    if not membership_check:
        raise HTTPException(status_code=403, detail="No eres miembro de este gym")

    rows = await svc.get_sparrings(db, gym_id, user_id)
    return [
        SparringProfile(
            # display_name (no UUID) — evita filtrar PII a otros miembros del gym
            display_name=r["user"].display_name or "Atleta",
            schedule=r["membership"].training_schedule,
            goal=r["membership"].training_goal,
            contact=r["membership"].contact_info,
        )
        for r in rows
    ]


@router.patch(
    "/my-profile/{gym_id}",
    response_model=MembershipUpdateResponse,
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
    return MembershipUpdateResponse(updated=True)


@router.post(
    "/{gym_id}/challenges",
    response_model=ChallengeResponse,
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
    return ChallengeResponse(id=challenge.id, title=challenge.title)


@router.post(
    "/{gym_id}/challenges/{challenge_id}/join",
    response_model=JoinChallengeResponse,
    summary="Unirse a un reto de gym",
)
async def join_challenge(
    gym_id: int,
    challenge_id: int,
    db: DBSession,
    current_user: CurrentUser,
):
    user_id = uuid.UUID(current_user["user_id"])
    # Solo miembros del gym pueden unirse a sus retos
    membership_check = (await db.execute(
        select(GymMembership).where(
            GymMembership.user_id == user_id,
            GymMembership.gym_id == gym_id,
        )
    )).scalar_one_or_none()
    if not membership_check:
        raise HTTPException(status_code=403, detail="No eres miembro de este gym")

    try:
        await svc.join_challenge(db, challenge_id, gym_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return JoinChallengeResponse(joined=True)
