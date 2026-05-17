from __future__ import annotations

from pydantic import BaseModel, Field


class BiomarkerNarratorResponse(BaseModel):
    narrative: str
    trend: str  # "improving" | "declining" | "stable" | "insufficient_data"
    highlights: list[str]


class InjuryRiskFlag(BaseModel):
    muscle_group: str
    risk_level: str  # "low" | "medium" | "high"
    detail: str
    recommendation: str


class InjuryRiskResponse(BaseModel):
    risk_flags: list[InjuryRiskFlag]
    overall_risk: str  # "low" | "medium" | "high"
    summary: str


class MicroGoal(BaseModel):
    goal: str
    reasoning: str
    category: str  # "weight" | "training" | "nutrition" | "recovery"


class WeeklyGoalsResponse(BaseModel):
    goals: list[MicroGoal] = Field(max_length=3)
    week_summary: str
