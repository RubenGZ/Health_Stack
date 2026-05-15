# backend/app/modules/ranked/schemas.py
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, ConfigDict


class QueueProfile(BaseModel):
    tier:      str
    division:  Optional[int]
    lp:        int
    peak_tier: str
    peak_div:  Optional[int]
    season:    int
    unlocked:  bool = True
    model_config = ConfigDict(from_attributes=True)


class RankedProfileResponse(BaseModel):
    normal:      QueueProfile
    competitive: QueueProfile


class LeaderboardEntry(BaseModel):
    rank:       int
    username:   str
    tier:       str
    division:   Optional[int]
    lp:         int
    badge:      Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class LeaderboardResponse(BaseModel):
    scope:    str
    gym_id:   Optional[int]
    season:   int
    entries:  list[LeaderboardEntry]
    my_rank:  Optional[int]
    total:    int


class RankedEventResponse(BaseModel):
    event_type: str
    lp_delta:   int
    lp_after:   int
    tier_after: str
    div_after:  Optional[int]
    created_at: str
    model_config = ConfigDict(from_attributes=True)
