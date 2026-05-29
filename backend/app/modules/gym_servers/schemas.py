# backend/app/modules/gym_servers/schemas.py
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class GymCreateRequest(BaseModel):
    name:        str  = Field(..., min_length=3, max_length=80)
    description: str | None = Field(None, max_length=500)
    city:        str | None = Field(None, max_length=80)
    province:    str | None = Field(None, max_length=80)
    country:     str           = Field("ES", max_length=5)
    is_public:   bool          = True


class GymResponse(BaseModel):
    id:          int
    name:        str
    description: str | None
    city:        str | None
    province:    str | None
    country:     str
    invite_code: str
    is_public:   bool
    is_verified: bool
    member_count: int
    model_config = ConfigDict(from_attributes=True)


class GymPublicResponse(BaseModel):
    """Respuesta pública para listado de gyms — sin invite_code."""
    id:          int
    name:        str
    description: str | None
    city:        str | None
    province:    str | None
    country:     str
    is_public:   bool
    is_verified: bool
    member_count: int
    model_config = ConfigDict(from_attributes=True)


class JoinGymRequest(BaseModel):
    invite_code: str | None = Field(None, max_length=12)
    gym_id:      int | None = None


class JoinGymResponse(BaseModel):
    joined: bool


class MembershipUpdateRequest(BaseModel):
    profile_public:    bool | None = None
    training_schedule: str | None  = Field(None, pattern="^(morning|afternoon|evening)$")
    training_goal:     str | None  = Field(None, pattern="^(strength|volume|health)$")
    contact_info:      str | None  = Field(None, max_length=120)


class MembershipUpdateResponse(BaseModel):
    updated: bool


class SparringProfile(BaseModel):
    display_name: str
    schedule:     str | None
    goal:         str | None
    contact:      str | None


class ChallengeCreateRequest(BaseModel):
    title:        str  = Field(..., min_length=3, max_length=100)
    description:  str | None = None
    target_type:  str  = Field(..., pattern="^(sessions|volume_kg|pr_count)$")
    target_value: int  = Field(..., ge=1)
    starts_at:    datetime
    ends_at:      datetime


class ChallengeResponse(BaseModel):
    id:    int
    title: str


class JoinChallengeResponse(BaseModel):
    joined: bool


class MyGymSummary(BaseModel):
    id:          int
    name:        str
    invite_code: str
