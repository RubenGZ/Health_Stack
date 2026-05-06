from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.dependencies import get_current_user
from app.modules.ai_coach.schemas import CoachResponse, SetFeedbackRequest
from app.modules.ai_coach.service import get_set_feedback
from app.modules.identity.models import User
from app.session import get_db

router = APIRouter()


@router.post("/set-feedback", response_model=CoachResponse)
async def set_feedback(
    body: SetFeedbackRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CoachResponse:
    """
    Devuelve feedback de coaching tras logar un set.
    Requiere JWT. Cubierto por el rate limit global de 200 req/min.
    """
    return await get_set_feedback(body)
