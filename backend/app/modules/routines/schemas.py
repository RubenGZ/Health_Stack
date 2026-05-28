"""
app/modules/Routines/schemas.py
=================================
Pydantic v2 schemas para el módulo de rutinas.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

import json
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
        description="JSON string de la rutina generada por el frontend.",
    )

    @field_validator("routine_json")
    @classmethod
    def validate_routine_json(cls, v: str) -> str:
        """Valida que routine_json sea JSON válido antes de persistir."""
        try:
            json.loads(v)
        except json.JSONDecodeError as exc:
            raise ValueError(f"routine_json no es JSON válido: {exc}") from exc
        return v


class RoutineResponse(BaseModel):
    """Respuesta de una rutina guardada.

    routine_json se almacena como JSONB (dict) en la BD desde migración 0014.
    Se serializa de vuelta a string JSON para mantener compatibilidad con el frontend.
    """

    id: UUID
    label: str
    routine_json: Any  # dict desde JSONB; serializado a str en model_post_init
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("routine_json", mode="before")
    @classmethod
    def serialize_routine_json(cls, v: Any) -> str:
        """
        Normaliza routine_json a JSON string.
        - Si es dict (JSONB desde ORM) → serializar a JSON string
        - Si es str (legacy o tests) → devolver tal cual
        """
        if isinstance(v, dict):
            return json.dumps(v, ensure_ascii=False)
        return v


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


# ── Injury-aware routine schemas ──────────────────────────────────────────────

import uuid as _uuid
from typing import Literal, Optional

from app.modules.rehab.schemas import BodyArea


class ChronicInjuryCreate(BaseModel):
    body_area: BodyArea
    injury_label: str = Field(..., min_length=1, max_length=100)
    severity: Literal["mild", "moderate", "severe"]
    notes: Optional[str] = Field(None, max_length=500)


class ChronicInjuryOut(BaseModel):
    id: _uuid.UUID
    body_area: str
    injury_label: str
    severity: str
    notes: Optional[str] = None
    is_active: bool

    model_config = {"from_attributes": True}
