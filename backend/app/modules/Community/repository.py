"""
app/modules/Community/repository.py
======================================
Capa de acceso a datos para el módulo de comunidad.
"""

from __future__ import annotations

import uuid

from sqlalchemy import and_, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.Community.models import CommunityLike, CommunityPost


class CommunityRepository:

    @staticmethod
    async def create_post(
        db: AsyncSession,
        *,
        user_id: str | uuid.UUID,
        display_name: str,
        content: str,
    ) -> CommunityPost:
        uid = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id
        post = CommunityPost(
            user_id=uid,
            display_name=display_name,
            content=content,
        )
        db.add(post)
        await db.flush()
        await db.refresh(post)
        return post

    @staticmethod
    async def list_posts(
        db: AsyncSession,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[CommunityPost], int]:
        count_result = await db.execute(select(func.count(CommunityPost.id)))
        total = count_result.scalar_one()

        result = await db.execute(
            select(CommunityPost)
            .order_by(CommunityPost.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all()), total

    @staticmethod
    async def get_post(
        db: AsyncSession,
        post_id: str | uuid.UUID,
    ) -> CommunityPost | None:
        pid = uuid.UUID(str(post_id)) if isinstance(post_id, str) else post_id
        result = await db.execute(select(CommunityPost).where(CommunityPost.id == pid))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_liked_post_ids(
        db: AsyncSession,
        user_id: str | uuid.UUID,
        post_ids: list[uuid.UUID],
    ) -> set[uuid.UUID]:
        """Devuelve el conjunto de post_ids que el usuario ya ha dado like."""
        if not post_ids:
            return set()
        uid = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id
        result = await db.execute(
            select(CommunityLike.post_id).where(
                and_(
                    CommunityLike.user_id == uid,
                    CommunityLike.post_id.in_(post_ids),
                )
            )
        )
        return set(result.scalars().all())

    @staticmethod
    async def toggle_like(
        db: AsyncSession,
        user_id: str | uuid.UUID,
        post_id: str | uuid.UUID,
    ) -> bool:
        """
        Da o quita like. Devuelve True si se añadió, False si se quitó.
        La lógica es idempotente gracias al UNIQUE constraint.
        """
        uid = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id
        pid = uuid.UUID(str(post_id)) if isinstance(post_id, str) else post_id

        # Verificar si ya existe el like
        result = await db.execute(
            select(CommunityLike).where(
                and_(
                    CommunityLike.user_id == uid,
                    CommunityLike.post_id == pid,
                )
            )
        )
        existing_like = result.scalar_one_or_none()

        # Obtener el post para actualizar el contador
        post_result = await db.execute(
            select(CommunityPost).where(CommunityPost.id == pid)
        )
        post = post_result.scalar_one_or_none()
        if post is None:
            return False

        if existing_like:
            # Quitar like
            await db.delete(existing_like)
            post.likes_count = max(0, post.likes_count - 1)
            await db.flush()
            return False
        else:
            # Añadir like
            like = CommunityLike(user_id=uid, post_id=pid)
            db.add(like)
            post.likes_count += 1
            await db.flush()
            return True
