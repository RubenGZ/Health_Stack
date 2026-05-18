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
from app.services.ai_router.dependencies import get_ai_router
from app.services.ai_router.router import AIRouter
from app.session import get_db

router = APIRouter()


@router.get("/biomarker-narrative", response_model=BiomarkerNarratorResponse)
async def biomarker_narrative(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    ai_router: AIRouter = Depends(get_ai_router),
) -> BiomarkerNarratorResponse:
    """
    Narración de los biomarcadores del usuario de los últimos 30 días.
    Requiere JWT.
    """
    return await get_biomarker_narrative(str(current_user["user_id"]), db, ai_router)


@router.get("/injury-risk", response_model=InjuryRiskResponse)
async def injury_risk(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    ai_router: AIRouter = Depends(get_ai_router),
) -> InjuryRiskResponse:
    """
    Índice de Fatiga Acumulada / Sugerencia de Carga.

    Estimación algorítmica de la carga de entrenamiento basada en el historial
    de sesiones y rutinas. NO es un diagnóstico médico ni un dispositivo sanitario.
    El campo `disclaimer` en la respuesta contiene el aviso legal obligatorio.
    Requiere JWT.
    """
    return await get_injury_risk(str(current_user["user_id"]), db, ai_router)


@router.get("/weekly-goals", response_model=WeeklyGoalsResponse)
async def weekly_goals(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    ai_router: AIRouter = Depends(get_ai_router),
) -> WeeklyGoalsResponse:
    """
    Genera 3 micro-objetivos personalizados para la semana.
    Requiere JWT.
    """
    return await get_weekly_goals(str(current_user["user_id"]), db, ai_router)
