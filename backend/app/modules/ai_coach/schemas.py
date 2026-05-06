from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field


class SessionSet(BaseModel):
    exercise: str
    weight_kg: float
    reps: int
    rpe: int | None = None


class SetFeedbackRequest(BaseModel):
    exercise: str = Field(..., min_length=1, max_length=100)
    weight_kg: float = Field(..., gt=0, le=500)
    reps: int = Field(..., gt=0, le=100)
    rpe: int | None = Field(None, ge=1, le=10)
    session_sets: list[SessionSet] = Field(default_factory=list, max_length=50)
    planned_weight_kg: float | None = None
    planned_reps: int | None = None


class CoachResponse(BaseModel):
    coaching: str
    suggestion: Literal["increase_weight", "decrease_weight", "maintain", "rest", "good_form"] = "maintain"
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)
