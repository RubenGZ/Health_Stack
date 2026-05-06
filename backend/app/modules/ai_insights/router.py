from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.dependencies import CurrentUser
from app.modules.ai_insights.schemas import (
    BiomarkerNarratorResponse,
    InjuryRiskResponse,
    WeeklyGoalsResponse,
)
from app.modules.ai_insights.service import (
    get_biomarker_narrative,
    get_injury_risk,
    get_weekly_goals,
)
from app.session import get_db

router = APIRouter()


@router.get("/biomarker-narrative", response_model=BiomarkerNarratorResponse)
async def biomarker_narrative(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> BiomarkerNarratorResponse:
    """
    Narración de los biomarcadores del usuario de los últimos 30 días.
    Requiere JWT.
    """
    user_id = str(current_user["user_id"])
    return await get_biomarker_narrative(user_id, db)


@router.get("/injury-risk", response_model=InjuryRiskResponse)
async def injury_risk(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> InjuryRiskResponse:
    """
    Análisis de riesgo de lesión basado en el historial de entrenamiento.
    Requiere JWT.
    """
    user_id = str(current_user["user_id"])
    return await get_injury_risk(user_id, db)


@router.get("/weekly-goals", response_model=WeeklyGoalsResponse)
async def weekly_goals(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> WeeklyGoalsResponse:
    """
    Genera 3 micro-objetivos personalizados para la semana.
    Requiere JWT.
    """
    user_id = str(current_user["user_id"])
    return await get_weekly_goals(user_id, db)
