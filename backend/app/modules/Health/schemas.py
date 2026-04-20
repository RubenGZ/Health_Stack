"""
app/modules/Health/schemas.py
==============================
Pydantic v2 schemas para el módulo de salud biométrica.

Separación de responsabilidades:
- HealthRecordCreate: valida datos de entrada del usuario (POST)
- HealthRecordUpdate: PATCH semántico — todos los campos opcionales
- HealthRecordResponse: qué devolvemos al cliente (notas desencriptadas)
- HealthRecordListResponse: lista paginada con total

SEGURIDAD:
    El campo notes en la entrada es texto plano — el servicio lo cifra.
    El campo notes en la respuesta es texto plano — el servicio lo descifra.
    Nunca se expone notes_encrypted al cliente.
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ── REQUEST SCHEMAS ────────────────────────────────────────────────────────────

class HealthRecordCreate(BaseModel):
    """Body del endpoint POST /api/v1/health/records."""

    recorded_date: date = Field(
        ...,
        description="Fecha de la medición.",
    )
    weight_kg: float | None = Field(
        default=None,
        ge=0,
        le=999.99,
        description="Peso en kilogramos.",
    )
    height_cm: float | None = Field(
        default=None,
        ge=0,
        le=999.9,
        description="Altura en centímetros.",
    )
    body_fat_pct: float | None = Field(
        default=None,
        ge=0,
        le=100,
        description="Porcentaje de grasa corporal.",
    )
    muscle_mass_kg: float | None = Field(
        default=None,
        ge=0,
        le=999.99,
        description="Masa muscular en kilogramos.",
    )
    waist_cm: float | None = Field(
        default=None,
        ge=0,
        le=999.9,
        description="Perímetro de cintura en centímetros.",
    )
    resting_heart_rate: int | None = Field(
        default=None,
        ge=20,
        le=300,
        description="Frecuencia cardíaca en reposo (ppm).",
    )
    sleep_hours: float | None = Field(
        default=None,
        ge=0,
        le=24,
        description="Horas de sueño.",
    )
    notes: str | None = Field(
        default=None,
        max_length=500,
        description="Notas personales en texto plano. El servicio las cifra antes de persistir.",
    )


class HealthRecordUpdate(BaseModel):
    """Body del endpoint PATCH /api/v1/health/records/{id} — todos los campos opcionales."""

    recorded_date: date | None = Field(default=None)
    weight_kg: float | None = Field(default=None, ge=0, le=999.99)
    height_cm: float | None = Field(default=None, ge=0, le=999.9)
    body_fat_pct: float | None = Field(default=None, ge=0, le=100)
    muscle_mass_kg: float | None = Field(default=None, ge=0, le=999.99)
    waist_cm: float | None = Field(default=None, ge=0, le=999.9)
    resting_heart_rate: int | None = Field(default=None, ge=20, le=300)
    sleep_hours: float | None = Field(default=None, ge=0, le=24)
    notes: str | None = Field(
        default=None,
        max_length=500,
        description="Notas en texto plano. El servicio las cifra antes de persistir.",
    )


# ── RESPONSE SCHEMAS ────────────────────────────────────────────────────────────

class HealthRecordResponse(BaseModel):
    """
    Respuesta de un registro biométrico.

    notes contiene el texto plano descifrado por el servicio.
    Nunca se incluye notes_encrypted ni health_subject_id.
    """

    id: UUID
    recorded_date: date
    weight_kg: float | None
    height_cm: float | None
    body_fat_pct: float | None
    muscle_mass_kg: float | None
    waist_cm: float | None
    resting_heart_rate: int | None
    sleep_hours: float | None
    notes: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HealthRecordListResponse(BaseModel):
    """Respuesta paginada de registros biométricos."""

    records: list[HealthRecordResponse]
    total: int
