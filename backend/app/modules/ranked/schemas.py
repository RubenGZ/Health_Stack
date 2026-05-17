# backend/app/modules/ranked/schemas.py
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class QueueProfile(BaseModel):
    tier:      str
    division:  int | None
    lp:        int
    peak_tier: str
    peak_div:  int | None
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
    division:   int | None
    lp:         int
    badge:      str | None = None
    model_config = ConfigDict(from_attributes=True)


class LeaderboardResponse(BaseModel):
    scope:    str
    gym_id:   int | None
    season:   int
    entries:  list[LeaderboardEntry]
    my_rank:  int | None
    total:    int


class RankedEventResponse(BaseModel):
    event_type: str
    lp_delta:   int
    lp_after:   int
    tier_after: str
    div_after:  int | None
    created_at: str
    model_config = ConfigDict(from_attributes=True)
