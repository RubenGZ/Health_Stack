"""
app/modules/Community/schemas.py
===================================
Pydantic v2 schemas para el módulo de comunidad.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PostCreate(BaseModel):
    content: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Contenido del post.",
    )


class PostResponse(BaseModel):
    id: UUID
    display_name: str
    content: str
    likes_count: int
    created_at: datetime
    liked_by_me: bool = False  # Se rellena en el servicio

    model_config = ConfigDict(from_attributes=True)


class PostListResponse(BaseModel):
    posts: list[PostResponse]
    total: int
