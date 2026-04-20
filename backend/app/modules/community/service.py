"""
app/modules/Community/service.py
===================================
Lógica de negocio para el módulo de comunidad.
"""

from __future__ import annotations

import logging

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.community.repository import CommunityRepository
from app.modules.community.schemas import PostCreate, PostListResponse, PostResponse
from app.modules.identity.repository import UserRepository

logger = logging.getLogger(__name__)


class CommunityService:

    @staticmethod
    async def get_posts(
        db: AsyncSession,
        current_user_id: str | None,
        limit: int = 20,
        offset: int = 0,
    ) -> PostListResponse:
        posts, total = await CommunityRepository.list_posts(db, limit=limit, offset=offset)

        # Determinar qué posts ya dio like el usuario autenticado (si aplica)
        liked_ids: set = set()
        if current_user_id and posts:
            post_ids = [p.id for p in posts]
            liked_ids = await CommunityRepository.get_liked_post_ids(
                db, current_user_id, post_ids
            )

        responses = [
            PostResponse(
                id=p.id,
                display_name=p.display_name,
                content=p.content,
                likes_count=p.likes_count,
                created_at=p.created_at,
                liked_by_me=p.id in liked_ids,
            )
            for p in posts
        ]
        return PostListResponse(posts=responses, total=total)

    @staticmethod
    async def create_post(
        db: AsyncSession,
        user_id: str,
        data: PostCreate,
    ) -> PostResponse:
        # Obtener display_name del usuario
        user = await UserRepository.get_by_id(db, user_id)
        display_name = (user.display_name or "Usuario") if user else "Usuario"

        post = await CommunityRepository.create_post(
            db,
            user_id=user_id,
            display_name=display_name,
            content=data.content,
        )
        return PostResponse(
            id=post.id,
            display_name=post.display_name,
            content=post.content,
            likes_count=post.likes_count,
            created_at=post.created_at,
            liked_by_me=False,
        )

    @staticmethod
    async def like_post(
        db: AsyncSession,
        user_id: str,
        post_id: str,
    ) -> PostResponse:
        post = await CommunityRepository.get_post(db, post_id)
        if post is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Post no encontrado.",
            )
        liked = await CommunityRepository.toggle_like(db, user_id, post_id)
        return PostResponse(
            id=post.id,
            display_name=post.display_name,
            content=post.content,
            likes_count=post.likes_count,
            created_at=post.created_at,
            liked_by_me=liked,
        )
