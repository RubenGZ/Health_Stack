from __future__ import annotations

from fastapi import APIRouter, Depends, Query
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


_VALID_LANGS = {"es", "en", "fr", "de", "it"}


def _validate_lang(lang: str) -> str:
    """Devuelve el código de idioma si es válido, o 'es' por defecto."""
    return lang if lang in _VALID_LANGS else "es"


@router.get("/biomarker-narrative", response_model=BiomarkerNarratorResponse)
async def biomarker_narrative(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    ai_router: AIRouter = Depends(get_ai_router),
    lang: str = Query(default="es", max_length=5),
) -> BiomarkerNarratorResponse:
    """
    Narración de los biomarcadores del usuario de los últimos 30 días.
    Requiere JWT. Parámetro opcional `lang` (es/en/fr/de/it).
    """
    return await get_biomarker_narrative(
        str(current_user["user_id"]), db, ai_router, lang=_validate_lang(lang)
    )


@router.get("/injury-risk", response_model=InjuryRiskResponse)
async def injury_risk(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    ai_router: AIRouter = Depends(get_ai_router),
    lang: str = Query(default="es", max_length=5),
) -> InjuryRiskResponse:
    """
    Índice de Fatiga Acumulada / Sugerencia de Carga.

    Estimación algorítmica de la carga de entrenamiento basada en el historial
    de sesiones y rutinas. NO es un diagnóstico médico ni un dispositivo sanitario.
    El campo `disclaimer` en la respuesta contiene el aviso legal obligatorio.
    Requiere JWT. Parámetro opcional `lang` (es/en/fr/de/it).
    """
    return await get_injury_risk(
        str(current_user["user_id"]), db, ai_router, lang=_validate_lang(lang)
    )


@router.get("/weekly-goals", response_model=WeeklyGoalsResponse)
async def weekly_goals(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    ai_router: AIRouter = Depends(get_ai_router),
    lang: str = Query(default="es", max_length=5),
) -> WeeklyGoalsResponse:
    """
    Genera 3 micro-objetivos personalizados para la semana.
    Requiere JWT. Parámetro opcional `lang` (es/en/fr/de/it).
    """
    return await get_weekly_goals(
        str(current_user["user_id"]), db, ai_router, lang=_validate_lang(lang)
    )
