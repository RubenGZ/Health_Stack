# backend/app/modules/gym_servers/service.py
"""Lógica de gym servers: crear, unirse, sparring, retos."""
from __future__ import annotations

import secrets
import string
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.gym_servers.models import (
    GymChallenge,
    GymChallengeParticipant,
    GymMembership,
    GymServer,
)


def _generate_invite_code(length: int = 8) -> str:
    chars = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(chars) for _ in range(length))


async def create_gym(
    db: AsyncSession, user_id: uuid.UUID, data: dict
) -> GymServer:
    code = _generate_invite_code()
    while (await db.execute(select(GymServer).where(GymServer.invite_code == code))).scalar_one_or_none():
        code = _generate_invite_code()

    gym = GymServer(
        name=data["name"],
        description=data.get("description"),
        created_by=user_id,
        city=data.get("city"),
        province=data.get("province"),
        country=data.get("country", "ES"),
        invite_code=code,
        is_public=data.get("is_public", True),
    )
    db.add(gym)
    await db.flush()

    membership = GymMembership(user_id=user_id, gym_id=gym.id, role="owner")
    db.add(membership)
    await db.commit()
    await db.refresh(gym)
    return gym


async def join_gym(
    db: AsyncSession, user_id: uuid.UUID, gym_id: int | None, invite_code: str | None
) -> GymMembership:
    if invite_code:
        gym = (await db.execute(select(GymServer).where(GymServer.invite_code == invite_code))).scalar_one_or_none()
    elif gym_id:
        gym = (await db.execute(select(GymServer).where(GymServer.id == gym_id, GymServer.is_public.is_(True)))).scalar_one_or_none()
    else:
        raise ValueError("Se requiere invite_code o gym_id")

    if not gym:
        raise ValueError("Gym no encontrado")

    existing = (await db.execute(
        select(GymMembership).where(GymMembership.user_id == user_id, GymMembership.gym_id == gym.id)
    )).scalar_one_or_none()
    if existing:
        return existing

    if gym.max_members > 0:
        count = (await db.execute(
            select(func.count()).where(GymMembership.gym_id == gym.id)
        )).scalar_one()
        if count >= gym.max_members:
            raise ValueError("El gym está lleno")

    membership = GymMembership(user_id=user_id, gym_id=gym.id, role="member")
    db.add(membership)
    await db.commit()
    return membership


async def get_sparrings(
    db: AsyncSession, gym_id: int, requesting_user_id: uuid.UUID,
) -> list[dict]:
    """Miembros del gym con perfil público, excepto el usuario que pide."""
    result = await db.execute(
        select(GymMembership).where(
            GymMembership.gym_id == gym_id,
            GymMembership.profile_public.is_(True),
            GymMembership.user_id != requesting_user_id,
        )
    )
    return [{"membership": m} for m in result.scalars().all()]


async def create_challenge(
    db: AsyncSession, gym_id: int, user_id: uuid.UUID, data: dict
) -> GymChallenge:
    challenge = GymChallenge(
        gym_id=gym_id, created_by=user_id,
        title=data["title"], description=data.get("description"),
        target_type=data["target_type"], target_value=data["target_value"],
        starts_at=data["starts_at"], ends_at=data["ends_at"],
    )
    db.add(challenge)
    await db.commit()
    await db.refresh(challenge)
    return challenge


async def join_challenge(
    db: AsyncSession, challenge_id: int, gym_id: int, user_id: uuid.UUID
) -> GymChallengeParticipant:
    # Verificar que el reto pertenece al gym indicado
    challenge = (await db.execute(
        select(GymChallenge).where(
            GymChallenge.id == challenge_id,
            GymChallenge.gym_id == gym_id,
        )
    )).scalar_one_or_none()
    if not challenge:
        raise ValueError("Reto no encontrado en este gym")
    if challenge.closed:
        raise ValueError("Este reto ya está cerrado")

    existing = (await db.execute(
        select(GymChallengeParticipant).where(
            GymChallengeParticipant.challenge_id == challenge_id,
            GymChallengeParticipant.user_id == user_id,
        )
    )).scalar_one_or_none()
    if existing:
        return existing
    p = GymChallengeParticipant(challenge_id=challenge_id, user_id=user_id)
    db.add(p)
    await db.commit()
    return p
