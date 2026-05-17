# backend/app/modules/workout_sessions/schemas.py
"""Pydantic v2 schemas para workout sessions."""
from __future__ import annotations

from datetime import datetime
import uuid

from pydantic import BaseModel, ConfigDict, Field


class SetIn(BaseModel):
    set_number:   int   = Field(..., ge=1)
    weight_kg:    float = Field(..., ge=0)
    reps:         int   = Field(..., ge=0)
    rpe:          float | None = Field(None, ge=6.0, le=10.0)
    is_warmup:    bool  = False
    completed_at: datetime | None = None


class ExerciseIn(BaseModel):
    exercise_key:  str = Field(..., max_length=80)
    exercise_name: str = Field(..., max_length=120)
    order_index:   int = Field(..., ge=0)
    sets:          list[SetIn]


class SessionCreateRequest(BaseModel):
    routine_id:  uuid.UUID | None = None  # FK → saved_routines.id (UUID, no Integer)
    started_at:  datetime
    finished_at: datetime | None = None
    notes:       str | None = Field(None, max_length=1000)
    exercises:   list[ExerciseIn]


class PRRecord(BaseModel):
    exercise_key: str
    type:         str
    value:        float
    prev:         float | None


class SessionCreateResponse(BaseModel):
    session_id:      int
    total_volume_kg: float
    duration_secs:   int | None
    prs:             list[PRRecord]
    xp_awarded:      int


class SessionSummary(BaseModel):
    id:              int
    started_at:      datetime
    duration_secs:   int | None
    total_volume_kg: float | None
    exercises:       list[str]
    model_config = ConfigDict(from_attributes=True)


class SetOut(BaseModel):
    set_number: int
    weight_kg:  float
    reps:       int
    rpe:        float | None
    is_warmup:  bool
    model_config = ConfigDict(from_attributes=True)


class ExerciseOut(BaseModel):
    id:            int
    exercise_key:  str
    exercise_name: str
    order_index:   int
    sets:          list[SetOut]
    model_config = ConfigDict(from_attributes=True)


class SessionDetail(BaseModel):
    id:              int
    started_at:      datetime
    finished_at:     datetime | None
    duration_secs:   int | None
    total_volume_kg: float | None
    notes:           str | None
    exercises:       list[ExerciseOut]
    model_config = ConfigDict(from_attributes=True)


class SessionListResponse(BaseModel):
    sessions: list[SessionSummary]
    total:    int
    page:     int


class ExerciseHistoryPoint(BaseModel):
    date:            str
    max_weight_kg:   float
    max_reps:        int
    estimated_1rm:   float
    total_volume_kg: float


class ExerciseHistoryResponse(BaseModel):
    exercise_key: str
    sessions:     list[ExerciseHistoryPoint]
