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


# ── AI Generation ─────────────────────────────────────────────────────────────

class AIRoutineRequest(BaseModel):
    """Parámetros del wizard para generar rutina con IA."""

    goal: str = Field(
        ...,
        description="Objetivo: strength | hypertrophy | fat_loss | endurance",
    )
    level: str = Field(
        ...,
        description="Nivel: beginner | intermediate | advanced",
    )
    days_per_week: int = Field(
        ...,
        ge=2,
        le=6,
        description="Días de entrenamiento por semana.",
    )
    equipment: str = Field(
        ...,
        description="Equipamiento: full_gym | home_weights | bodyweight",
    )


class AIRoutineExercise(BaseModel):
    """Ejercicio dentro de una rutina generada."""

    name: str
    muscle_group: str
    sets: int
    reps: str
    rest_sec: int
    notes: str = ""


class AIRoutineDay(BaseModel):
    """Día de entrenamiento."""

    day_label: str
    focus: str
    exercises: list[AIRoutineExercise]


class AIRoutineResponse(BaseModel):
    """Respuesta de la generación de rutina por IA."""

    label: str
    description: str
    days_per_week: int
    focus_area: str
    days: list[AIRoutineDay]
