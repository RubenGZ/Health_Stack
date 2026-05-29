from __future__ import annotations

from pydantic import BaseModel, Field


class PageViewCreate(BaseModel):
    page: str = Field(..., max_length=100)
    country: str | None = Field(default=None, max_length=2)

class PageViewResponse(BaseModel):
    ok: bool = True

class EventCreate(BaseModel):
    event: str = Field(..., max_length=80)
    data: dict = Field(default_factory=dict)
