"""Módulos Routines, Community y Gamification

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-20 00:00:00.000000

Cambios:
- Crea tabla public.saved_routines       (rutinas guardadas por usuario)
- Crea tabla public.community_posts      (posts de la comunidad)
- Crea tabla public.community_likes      (likes con UNIQUE user+post)
- Crea tabla public.gamification_states  (estado XP/nivel por usuario)

RGPD:
- saved_routines, community_posts, community_likes → datos funcionales (no Art. 9)
  FK directa a public.users.id con CASCADE DELETE (Art. 17)
- gamification_states → datos funcionales, misma política
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. saved_routines ─────────────────────────────────────────────────────
    op.create_table(
        "saved_routines",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            comment="FK a users.id. CASCADE DELETE.",
        ),
        sa.Column(
            "label",
            sa.String(200),
            nullable=False,
            comment="Etiqueta de la rutina.",
        ),
        sa.Column(
            "routine_json",
            sa.Text,
            nullable=False,
            comment="JSON string completo de la rutina.",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["public.users.id"],
            name="fk_saved_routines_user_id",
            ondelete="CASCADE",
        ),
        schema="public",
        comment="Rutinas de entrenamiento guardadas por el usuario.",
    )
    op.create_index(
        "ix_saved_routines_user_id",
        "saved_routines",
        ["user_id"],
        schema="public",
    )

    # ── 2. community_posts ────────────────────────────────────────────────────
    op.create_table(
        "community_posts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "display_name",
            sa.String(100),
            nullable=False,
            server_default="Usuario",
            comment="Nombre visible desnormalizado.",
        ),
        sa.Column(
            "content",
            sa.Text,
            nullable=False,
        ),
        sa.Column(
            "likes_count",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["public.users.id"],
            name="fk_community_posts_user_id",
            ondelete="CASCADE",
        ),
        schema="public",
        comment="Posts públicos de la comunidad HealthStack.",
    )
    op.create_index(
        "ix_community_posts_user_id",
        "community_posts",
        ["user_id"],
        schema="public",
    )
    op.create_index(
        "ix_community_posts_created_at",
        "community_posts",
        ["created_at"],
        schema="public",
    )

    # ── 3. community_likes ────────────────────────────────────────────────────
    op.create_table(
        "community_likes",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("post_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["public.users.id"],
            name="fk_community_likes_user_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["post_id"],
            ["public.community_posts.id"],
            name="fk_community_likes_post_id",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "user_id",
            "post_id",
            name="uq_community_likes_user_post",
        ),
        schema="public",
        comment="Likes de posts. UNIQUE user+post para idempotencia.",
    )
    op.create_index(
        "ix_community_likes_user_id",
        "community_likes",
        ["user_id"],
        schema="public",
    )
    op.create_index(
        "ix_community_likes_post_id",
        "community_likes",
        ["post_id"],
        schema="public",
    )

    # ── 4. gamification_states ────────────────────────────────────────────────
    op.create_table(
        "gamification_states",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            unique=True,
        ),
        sa.Column("xp_total",      sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("level",         sa.Integer,    nullable=False, server_default="1"),
        sa.Column("weight_count",  sa.Integer,    nullable=False, server_default="0"),
        sa.Column("routine_count", sa.Integer,    nullable=False, server_default="0"),
        sa.Column("post_count",    sa.Integer,    nullable=False, server_default="0"),
        sa.Column("tdee_calc",     sa.Integer,    nullable=False, server_default="0"),
        sa.Column("streak_days",   sa.Integer,    nullable=False, server_default="0"),
        sa.Column("badge_latest",  sa.String(50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["public.users.id"],
            name="fk_gamification_states_user_id",
            ondelete="CASCADE",
        ),
        schema="public",
        comment="Estado de gamificación por usuario. Una fila por usuario.",
    )
    op.create_index(
        "ix_gamification_states_user_id",
        "gamification_states",
        ["user_id"],
        unique=True,
        schema="public",
    )


def downgrade() -> None:
    op.drop_index("ix_gamification_states_user_id", table_name="gamification_states", schema="public")
    op.drop_table("gamification_states", schema="public")

    op.drop_index("ix_community_likes_post_id", table_name="community_likes", schema="public")
    op.drop_index("ix_community_likes_user_id", table_name="community_likes", schema="public")
    op.drop_table("community_likes", schema="public")

    op.drop_index("ix_community_posts_created_at", table_name="community_posts", schema="public")
    op.drop_index("ix_community_posts_user_id", table_name="community_posts", schema="public")
    op.drop_table("community_posts", schema="public")

    op.drop_index("ix_saved_routines_user_id", table_name="saved_routines", schema="public")
    op.drop_table("saved_routines", schema="public")
