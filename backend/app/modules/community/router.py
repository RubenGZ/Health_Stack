"""
app/modules/Community/router.py
=================================
Endpoints REST para el módulo de comunidad.

Prefijo: /api/v1/community

Endpoints:
    GET    /posts           → Listar posts (público)
    POST   /posts           → Crear post (requiere auth)
    POST   /posts/{id}/like → Toggle like (requiere auth)
"""


from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security.dependencies import CurrentUser, get_current_user
from app.modules.community.schemas import PostCreate, PostListResponse, PostResponse
from app.modules.community.service import CommunityService
from app.session import DBSession

router = APIRouter()

_bearer_scheme = HTTPBearer(auto_error=False)


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> dict | None:
    """
    Dependencia opcional: si hay token válido devuelve el usuario,
    si no hay token devuelve None (no lanza 401).
    Permite que el listado de posts sea público pero detecte likes propios.
    """
    if credentials is None:
        return None
    try:
        return await get_current_user(credentials)
    except Exception:
        return None


@router.get(
    "/posts",
    response_model=PostListResponse,
    summary="Listar posts de la comunidad",
    description="Endpoint público. Si se incluye Bearer token, marca los posts que ya recibieron like del usuario.",
)
async def get_posts(
    db: DBSession,
    optional_user: Annotated[dict | None, Depends(get_optional_user)],
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    user_id = optional_user["user_id"] if optional_user else None
    return await CommunityService.get_posts(
        db=db,
        current_user_id=user_id,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/posts",
    response_model=PostResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Publicar en la comunidad",
)
async def create_post(
    body: PostCreate,
    db: DBSession,
    current_user: CurrentUser,
):
    return await CommunityService.create_post(
        db=db,
        user_id=current_user["user_id"],
        data=body,
    )


@router.post(
    "/posts/{post_id}/like",
    response_model=PostResponse,
    summary="Toggle like en un post",
    description="Da o quita like. Idempotente: llamar dos veces quita el like.",
)
async def like_post(
    post_id: str,
    db: DBSession,
    current_user: CurrentUser,
):
    return await CommunityService.like_post(
        db=db,
        user_id=current_user["user_id"],
        post_id=post_id,
    )
