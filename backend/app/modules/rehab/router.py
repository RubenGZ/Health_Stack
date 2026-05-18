"""
app/modules/rehab/router.py
==============================
Endpoints del módulo de rehabilitación.

    GET  /api/v1/rehab/presets        — Lista de protocolos disponibles (free, sin auth)
    POST /api/v1/rehab/protocol       — Generar protocolo (free = preset, pro = AI)

Freemium logic:
    - Plan 'free'  → protocolo estático predefinido
    - Plan 'pro' / 'elite' → protocolo generado por IA (Groq/Gemini)

AVISO LEGAL: Los protocolos NO constituyen prescripción médica. Ver REHAB_DISCLAIMER.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request

from app.core.security.dependencies import CurrentUser
from app.modules.rehab.schemas import RehabPreset, RehabProtocolRequest, RehabProtocolResponse
from app.modules.rehab.service import RehabService
from app.session import DBSession

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_limiter():
    from app.main import limiter
    return limiter


# ── GET /presets ──────────────────────────────────────────────────────────────

@router.get(
    "/presets",
    response_model=list[RehabPreset],
    summary="Listar protocolos disponibles (free)",
    description=(
        "Devuelve la lista de protocolos estáticos incluidos en el tier free. "
        "No requiere autenticación."
    ),
)
async def list_presets() -> list[RehabPreset]:
    """Lista todos los presets de rehabilitación disponibles."""
    raw = RehabService.list_presets()
    return [RehabPreset(**p) for p in raw]


# ── POST /protocol ────────────────────────────────────────────────────────────

@router.post(
    "/protocol",
    response_model=RehabProtocolResponse,
    summary="Generar protocolo de rehabilitación",
    description=(
        "Genera un protocolo de rehabilitación basado en el tipo de lesión y zona afectada. "
        "**Free**: devuelve un protocolo estático predefinido basado en evidencia. "
        "**Pro / Elite**: genera un protocolo personalizado con IA (Groq llama-3.3-70b / Gemini fallback). "
        "⚠️ El protocolo es orientativo y NO reemplaza la valoración de un fisioterapeuta."
    ),
)
@_get_limiter().limit("10/minute")
async def generate_protocol(
    request: Request,
    body: RehabProtocolRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> RehabProtocolResponse:
    """
    Freemium: plan free → preset estático; plan pro/elite → generación IA.
    """
    plan = current_user.get("plan", "free")
    user_id = str(current_user["user_id"])

    if plan in ("pro", "elite"):
        # Construir contexto anónimo del usuario para la IA
        # RGPD: solo se envía metadata, no PII directa
        user_context: dict = {
            "gamification_level": current_user.get("level", "N/A"),
            "primary_fitness_goal": current_user.get("goal", "no especificado"),
        }

        # Recuperar sexo biológico del perfil (no PII directa — solo 'male'/'female')
        try:
            from app.modules.identity.repository import UserRepository
            user = await UserRepository.get_by_id(db, user_id)
            if user and user.biological_sex:
                user_context["biological_sex"] = user.biological_sex
            if user and user.primary_fitness_goal:
                user_context["primary_fitness_goal"] = user.primary_fitness_goal
        except Exception:
            pass  # Contexto parcial — la IA sigue funcionando

        try:
            from app.main import app as _app
            ai_router = _app.state.ai_router
        except Exception:
            ai_router = None

        if ai_router is None:
            logger.warning("RehabRouter: AIRouter no disponible — usando preset estático para plan pro")
            return RehabService.get_static_protocol(body)

        logger.info(
            "RehabRouter: generando protocolo IA para user=%s plan=%s", user_id[:8], plan
        )
        return await RehabService.generate_ai_protocol(body, ai_router, user_context)

    # Tier free: protocolo estático
    logger.info(
        "RehabRouter: devolviendo preset estático para user=%s plan=%s area=%s",
        user_id[:8], plan, body.body_area,
    )
    return RehabService.get_static_protocol(body)
