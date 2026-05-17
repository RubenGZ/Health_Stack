from __future__ import annotations

from pydantic import BaseModel, Field


class PageViewCreate(BaseModel):
    page: str = Field(..., max_length=100)
    country: str | None = Field(default=None, max_length=2)

class PageViewResponse(BaseModel):
    ok: bool = True
