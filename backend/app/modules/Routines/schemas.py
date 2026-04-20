"""
app/modules/Routines/schemas.py
=================================
Pydantic v2 schemas para el módulo de rutinas.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RoutineCreate(BaseModel):
    """Body del endpoint POST /api/v1/routines/."""

    label: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Nombre/etiqueta de la rutina.",
    )
    routine_json: str = Field(
        ...,
        description="JSON string completo de la rutina generada por el frontend.",
    )


class RoutineResponse(BaseModel):
    """Respuesta de una rutina guardada."""

    id: UUID
    label: str
    routine_json: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RoutineListResponse(BaseModel):
    """Lista paginada de rutinas."""

    routines: list[RoutineResponse]
    total: int
