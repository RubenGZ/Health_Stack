"""
app/modules/Community/models.py
=================================
Modelos para el módulo de comunidad.

Tablas:
- community_posts: publicaciones de usuarios
- community_likes: likes de posts (UNIQUE user+post para idempotencia)

RGPD: Los posts son contenido público elegido por el usuario.
      El display_name se almacena desnormalizado para evitar JOINs frecuentes.
      Un borrado de usuario hace CASCADE sobre sus posts.
"""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import Base, TimestampMixin, UUIDPrimaryKeyMixin


class CommunityPost(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Publicaciones de la comunidad. Schema: public."""

    __tablename__ = "community_posts"
    __table_args__ = {
        "schema": "public",
        "comment": "Posts públicos de la comunidad HealthStack.",
    }

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("public.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    display_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        server_default="Usuario",
        comment="Nombre visible del autor (desnormalizado para evitar JOIN en listado).",
    )

    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Contenido del post (máx 1000 chars, validado en schema Pydantic).",
    )

    likes_count: Mapped[int] = mapped_column(
        default=0,
        nullable=False,
        server_default="0",
        comment="Contador desnormalizado de likes. Se actualiza en cada like/unlike.",
    )

    def __repr__(self) -> str:
        return f"<CommunityPost id={str(self.id)[:8]}... user={str(self.user_id)[:8]}...>"


class CommunityLike(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Registro de likes. UNIQUE (user_id, post_id) garantiza idempotencia.
    Un usuario no puede dar like dos veces al mismo post.
    """

    __tablename__ = "community_likes"
    __table_args__ = (
        UniqueConstraint("user_id", "post_id", name="uq_community_likes_user_post"),
        {
            "schema": "public",
            "comment": "Likes de posts de comunidad. UNIQUE user+post para idempotencia.",
        },
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("public.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    post_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("public.community_posts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
