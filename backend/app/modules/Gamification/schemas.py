"""
app/modules/Gamification/schemas.py
======================================
Pydantic v2 schemas para el módulo de gamificación.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ActionRequest(BaseModel):
    """Body del endpoint POST /api/v1/gamification/action."""

    action: str = Field(
        ...,
        description="Tipo de acción: 'weight' | 'tdee' | 'routine' | 'post' | 'recipe' | 'streak'",
    )


class GamificationStateResponse(BaseModel):
    """Estado completo de gamificación del usuario."""

    xp_total: int
    level: int
    weight_count: int
    routine_count: int
    post_count: int
    tdee_calc: int
    streak_days: int
    badge_latest: str | None
    xp_to_next_level: int  # Calculado en el servicio
    level_progress_pct: float  # 0.0 – 100.0

    model_config = ConfigDict(from_attributes=True)
