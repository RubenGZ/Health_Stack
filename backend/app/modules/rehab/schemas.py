"""
app/modules/rehab/schemas.py
==============================
Schemas Pydantic v2 para el módulo de rehabilitación.

AVISO LEGAL:
    Los protocolos generados son orientativos y NO constituyen prescripción médica.
    El usuario debe consultar a un fisioterapeuta o médico antes de seguir
    cualquier protocolo de rehabilitación.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ── Enums / Literales ──────────────────────────────────────────────────────────

InjuryType = Literal[
    "tendinopathy",      # Tendinopatía / tendinitis
    "muscle_strain",     # Desgarro / rotura muscular
    "joint_sprain",      # Esguince articular
    "overuse",           # Sobrecarga por uso repetitivo
    "post_surgery",      # Post-operatorio
    "general_pain",      # Dolor difuso / inespecífico
]

BodyArea = Literal[
    "shoulder",
    "elbow",
    "wrist",
    "lower_back",
    "hip",
    "knee",
    "ankle",
    "neck",
    "thoracic",
]

PainLevel = Literal[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]


# ── Aviso legal compartido ─────────────────────────────────────────────────────

REHAB_DISCLAIMER = (
    "⚠️ AVISO: Este protocolo es orientativo y NO constituye prescripción médica ni "
    "fisioterapéutica. Ante cualquier dolor, empeoramiento o duda, suspende los "
    "ejercicios y consulta a un profesional sanitario cualificado. HealthStack Pro "
    "no se hace responsable de lesiones derivadas del uso de este contenido."
)


# ── REQUEST ────────────────────────────────────────────────────────────────────

class RehabProtocolRequest(BaseModel):
    """Body del endpoint POST /rehab/protocol."""

    injury_type: InjuryType = Field(
        ...,
        description="Tipo de lesión o problema.",
    )
    body_area: BodyArea = Field(
        ...,
        description="Zona corporal afectada.",
    )
    pain_level: PainLevel = Field(
        ...,
        description="Nivel de dolor actual (1 = sin dolor, 10 = máximo).",
    )
    weeks_since_injury: int = Field(
        default=1,
        ge=0,
        le=104,
        description="Semanas desde la lesión (0 = reciente).",
    )
    notes: str | None = Field(
        default=None,
        max_length=500,
        description="Notas adicionales (historial, limitaciones, etc.).",
    )


# ── RESPONSE ───────────────────────────────────────────────────────────────────

class RehabExercise(BaseModel):
    """Un ejercicio dentro de un protocolo de rehabilitación."""

    name: str
    description: str
    sets: int | None = None
    reps: str | None = None        # Puede ser "10-15" o "30 segundos"
    rest_seconds: int | None = None
    frequency_per_week: int | None = None
    progression_note: str | None = None


class RehabPhase(BaseModel):
    """Fase de un protocolo de rehabilitación."""

    phase_name: str                  # Ej: "Fase 1 — Reducción del dolor"
    duration_weeks: int
    goal: str
    precautions: list[str] = []
    exercises: list[RehabExercise]


class RehabProtocolResponse(BaseModel):
    """Respuesta del endpoint POST /rehab/protocol."""

    title: str
    injury_type: str
    body_area: str
    tier: Literal["free", "pro"]
    is_ai_generated: bool
    phases: list[RehabPhase]
    general_advice: str
    red_flags: list[str] = Field(
        description="Señales de alarma que requieren consulta médica urgente.",
    )
    disclaimer: str = REHAB_DISCLAIMER


class RehabPreset(BaseModel):
    """Vista de resumen de un preset disponible en tier free."""

    injury_type: str
    body_area: str
    title: str
    phases_count: int
    total_weeks: int
