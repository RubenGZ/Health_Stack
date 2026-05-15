# backend/app/modules/gym_servers/schemas.py
from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class GymCreateRequest(BaseModel):
    name:        str  = Field(..., min_length=3, max_length=80)
    description: Optional[str] = Field(None, max_length=500)
    city:        Optional[str] = Field(None, max_length=80)
    province:    Optional[str] = Field(None, max_length=80)
    country:     str           = Field("ES", max_length=5)
    is_public:   bool          = True


class GymResponse(BaseModel):
    id:          int
    name:        str
    description: Optional[str]
    city:        Optional[str]
    province:    Optional[str]
    country:     str
    invite_code: str
    is_public:   bool
    is_verified: bool
    member_count: int
    model_config = ConfigDict(from_attributes=True)


class JoinGymRequest(BaseModel):
    invite_code: Optional[str] = None
    gym_id:      Optional[int] = None


class MembershipUpdateRequest(BaseModel):
    profile_public:    Optional[bool] = None
    training_schedule: Optional[str]  = Field(None, pattern="^(morning|afternoon|evening)$")
    training_goal:     Optional[str]  = Field(None, pattern="^(strength|volume|health)$")
    contact_info:      Optional[str]  = Field(None, max_length=120)


class ChallengeCreateRequest(BaseModel):
    title:        str  = Field(..., min_length=3, max_length=100)
    description:  Optional[str] = None
    target_type:  str  = Field(..., pattern="^(sessions|volume_kg|pr_count)$")
    target_value: int  = Field(..., ge=1)
    starts_at:    datetime
    ends_at:      datetime
