# backend/app/modules/workout_sessions/schemas.py
"""Pydantic v2 schemas para workout sessions."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class SetIn(BaseModel):
    set_number:   int   = Field(..., ge=1)
    weight_kg:    float = Field(..., ge=0)
    reps:         int   = Field(..., ge=0)
    rpe:          Optional[float] = Field(None, ge=6.0, le=10.0)
    is_warmup:    bool  = False
    completed_at: Optional[datetime] = None


class ExerciseIn(BaseModel):
    exercise_key:  str = Field(..., max_length=80)
    exercise_name: str = Field(..., max_length=120)
    order_index:   int = Field(..., ge=0)
    sets:          list[SetIn]


class SessionCreateRequest(BaseModel):
    routine_id:  Optional[uuid.UUID] = None  # FK → saved_routines.id (UUID, no Integer)
    started_at:  datetime
    finished_at: Optional[datetime] = None
    notes:       Optional[str] = Field(None, max_length=1000)
    exercises:   list[ExerciseIn]


class PRRecord(BaseModel):
    exercise_key: str
    type:         str
    value:        float
    prev:         Optional[float]


class SessionCreateResponse(BaseModel):
    session_id:      int
    total_volume_kg: float
    duration_secs:   Optional[int]
    prs:             list[PRRecord]
    xp_awarded:      int


class SessionSummary(BaseModel):
    id:              int
    started_at:      datetime
    duration_secs:   Optional[int]
    total_volume_kg: Optional[float]
    exercises:       list[str]
    model_config = ConfigDict(from_attributes=True)


class SetOut(BaseModel):
    set_number: int
    weight_kg:  float
    reps:       int
    rpe:        Optional[float]
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
    finished_at:     Optional[datetime]
    duration_secs:   Optional[int]
    total_volume_kg: Optional[float]
    notes:           Optional[str]
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
