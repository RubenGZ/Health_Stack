"""
app/modules/Gamification/service.py
======================================
Lógica de negocio para el módulo de gamificación.

Sistema de niveles:
    XP necesaria para nivel N = 100 * N^1.5
    Nivel 1: 0 XP
    Nivel 2: ~283 XP
    Nivel 5: ~1118 XP
    Nivel 10: ~3162 XP
"""

from __future__ import annotations

import logging
import math

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.Gamification.models import XP_TABLE, GamificationState
from app.modules.Gamification.repository import GamificationRepository
from app.modules.Gamification.schemas import GamificationStateResponse

logger = logging.getLogger(__name__)


def _xp_for_level(level: int) -> int:
    """XP total necesaria para alcanzar el nivel `level`."""
    return int(100 * (level ** 1.5))


def _calculate_level(xp_total: int) -> int:
    """Calcula el nivel actual a partir del XP total."""
    level = 1
    while _xp_for_level(level + 1) <= xp_total:
        level += 1
    return level


def _compute_response(state: GamificationState) -> GamificationStateResponse:
    """Construye el schema de respuesta con cálculos derivados."""
    current_level = state.level
    xp_current_level = _xp_for_level(current_level)
    xp_next_level = _xp_for_level(current_level + 1)
    xp_to_next = max(0, xp_next_level - state.xp_total)
    xp_in_level = state.xp_total - xp_current_level
    level_range = xp_next_level - xp_current_level
    progress_pct = min(100.0, round((xp_in_level / level_range) * 100, 1)) if level_range > 0 else 0.0

    return GamificationStateResponse(
        xp_total=state.xp_total,
        level=state.level,
        weight_count=state.weight_count,
        routine_count=state.routine_count,
        post_count=state.post_count,
        tdee_calc=state.tdee_calc,
        streak_days=state.streak_days,
        badge_latest=state.badge_latest,
        xp_to_next_level=xp_to_next,
        level_progress_pct=progress_pct,
    )


def _award_badge(state: GamificationState) -> None:
    """Asigna badges según hitos de XP/contadores."""
    if state.xp_total >= 10_000 and state.badge_latest != "legend":
        state.badge_latest = "legend"
    elif state.xp_total >= 5_000 and state.badge_latest not in ("legend", "master"):
        state.badge_latest = "master"
    elif state.weight_count >= 30 and state.badge_latest not in ("legend", "master", "consistent"):
        state.badge_latest = "consistent"
    elif state.xp_total >= 500 and state.badge_latest not in ("legend", "master", "consistent", "rookie"):
        state.badge_latest = "rookie"


class GamificationService:

    @staticmethod
    async def get_state(
        db: AsyncSession,
        user_id: str,
    ) -> GamificationStateResponse:
        state = await GamificationRepository.get_or_create(db, user_id)
        return _compute_response(state)

    @staticmethod
    async def add_xp(
        db: AsyncSession,
        user_id: str,
        action: str,
    ) -> GamificationStateResponse:
        """
        Registra una acción y añade el XP correspondiente.
        Si la acción no es reconocida, se ignora silenciosamente.
        """
        xp_gain = XP_TABLE.get(action, 0)
        if xp_gain == 0:
            logger.debug(f"[Gamification] Acción desconocida ignorada: '{action}'")
            state = await GamificationRepository.get_or_create(db, user_id)
            return _compute_response(state)

        state = await GamificationRepository.get_or_create(db, user_id)

        # Actualizar contador específico
        if action == "weight":
            state.weight_count += 1
        elif action == "routine":
            state.routine_count += 1
        elif action == "post":
            state.post_count += 1
        elif action == "tdee":
            state.tdee_calc += 1

        # Acumular XP y recalcular nivel
        state.xp_total += xp_gain
        state.level = _calculate_level(state.xp_total)

        # Asignar badge si corresponde
        _award_badge(state)

        await GamificationRepository.save(db, state)

        logger.debug(
            f"[Gamification] user={user_id[:8]}... action={action} "
            f"+{xp_gain}xp → total={state.xp_total} level={state.level}"
        )

        return _compute_response(state)
