from __future__ import annotations

from pydantic import BaseModel, Field


class BiomarkerNarratorResponse(BaseModel):
    narrative: str
    trend: str  # "improving" | "declining" | "stable" | "insufficient_data"
    highlights: list[str]


_FATIGUE_DISCLAIMER = (
    "⚠️ AVISO LEGAL: Este análisis es una estimación algorítmica de carga acumulada "
    "basada en datos de entrenamiento registrados en la aplicación. "
    "No es un diagnóstico médico, no constituye consejo clínico y no reemplaza "
    "la evaluación de un profesional sanitario o fisioterapeuta colegiado. "
    "Ante cualquier dolor, molestia o lesión, consulte a un médico."
)


class InjuryRiskFlag(BaseModel):
    muscle_group: str
    risk_level: str  # "low" | "medium" | "high"
    detail: str
    recommendation: str


class InjuryRiskResponse(BaseModel):
    risk_flags: list[InjuryRiskFlag]
    overall_risk: str  # "low" | "medium" | "high"
    summary: str
    # Nombre público: "Índice de Fatiga Acumulada" (no "injury risk" — evita implicación médica)
    index_label: str = "Índice de Fatiga Acumulada"
    disclaimer: str = _FATIGUE_DISCLAIMER


class MicroGoal(BaseModel):
    goal: str
    reasoning: str
    category: str  # "weight" | "training" | "nutrition" | "recovery"


class WeeklyGoalsResponse(BaseModel):
    goals: list[MicroGoal] = Field(max_length=3)
    week_summary: str
