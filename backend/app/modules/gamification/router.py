"""
app/modules/Gamification/router.py
=====================================
Endpoints REST para el módulo de gamificación.

Prefijo: /api/v1/gamification

Endpoints:
    GET    /state           → Estado actual del usuario
    POST   /action          → Registrar acción y ganar XP
"""


from fastapi import APIRouter

from app.core.security.dependencies import CurrentUser
from app.modules.gamification.schemas import ActionRequest, GamificationStateResponse
from app.modules.gamification.service import GamificationService
from app.session import DBSession

router = APIRouter()


@router.get(
    "/state",
    response_model=GamificationStateResponse,
    summary="Estado de gamificación",
    description="Devuelve el nivel, XP total y contadores del usuario autenticado.",
)
async def get_state(
    db: DBSession,
    current_user: CurrentUser,
):
    return await GamificationService.get_state(
        db=db,
        user_id=current_user["user_id"],
    )


@router.post(
    "/action",
    response_model=GamificationStateResponse,
    summary="Registrar acción y ganar XP",
    description=(
        "Registra una acción del usuario y añade XP. "
        "Acciones válidas: 'weight', 'tdee', 'routine', 'post', 'recipe', 'streak'. "
        "Las acciones desconocidas se ignoran silenciosamente."
    ),
)
async def add_xp(
    body: ActionRequest,
    db: DBSession,
    current_user: CurrentUser,
):
    return await GamificationService.add_xp(
        db=db,
        user_id=current_user["user_id"],
        action=body.action,
    )
