"""Mejoras arquitectónicas — refresh_tokens, gamification_events, user_id en recipes

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-21 00:00:00.000000

Cambios:
- Crea tabla public.refresh_tokens     (JTIs revocables para logout + rotación)
- Crea tabla public.gamification_events (historial de XP por acción)
- Añade columna user_id a user_recipes  (vincula recetas anónimas a usuarios reales)

Decisiones arquitectónicas (ADR-001):
- refresh_tokens: elimina el problema de refresh tokens irrevocables (7 días sin logout)
- gamification_events: añade historial inmutable (antes solo había snapshot en gamification_states)
- user_recipes.user_id: permite reclamar recetas anónimas tras registro (FK nullable)
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. refresh_tokens ─────────────────────────────────────────────────────
    op.create_table(
        "refresh_tokens",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
            comment="PK UUID.",
        ),
        sa.Column(
            "jti",
            sa.String(36),
            nullable=False,
            comment="JWT ID único. UUID v4. Índice para lookup rápido en /refresh.",
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            comment="FK al usuario propietario del token.",
        ),
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=False,
            comment="Expiración (7 días desde emisión).",
        ),
        sa.Column(
            "revoked_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Null = activo. Timestamp = revocado (logout o rotación).",
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
            ["user_id"], ["public.users.id"],
            ondelete="CASCADE",
            name="fk_refresh_tokens_user_id",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_refresh_tokens"),
        sa.UniqueConstraint("jti", name="uq_refresh_tokens_jti"),
        schema="public",
        comment="JTIs de refresh tokens activos. Permite rotación y logout global.",
    )
    op.create_index(
        "ix_refresh_tokens_jti",
        "refresh_tokens",
        ["jti"],
        unique=True,
        schema="public",
    )
    op.create_index(
        "ix_refresh_tokens_user_id",
        "refresh_tokens",
        ["user_id"],
        schema="public",
    )

    # ── 2. gamification_events ────────────────────────────────────────────────
    op.create_table(
        "gamification_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
            comment="PK UUID.",
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            comment="FK al usuario que realizó la acción.",
        ),
        sa.Column(
            "action",
            sa.String(30),
            nullable=False,
            comment="Acción: weight | tdee | routine | post | recipe | streak.",
        ),
        sa.Column(
            "xp_awarded",
            sa.Integer(),
            nullable=False,
            comment="XP otorgada por esta acción.",
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
            ["user_id"], ["public.users.id"],
            ondelete="CASCADE",
            name="fk_gamification_events_user_id",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_gamification_events"),
        schema="public",
        comment="Historial inmutable de eventos de gamificación.",
    )
    op.create_index(
        "ix_gamification_events_user_id",
        "gamification_events",
        ["user_id"],
        schema="public",
    )

    # ── 3. user_recipes.user_id ────────────────────────────────────────────────
    op.add_column(
        "user_recipes",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
            comment=(
                "FK a users.id. Null = receta anónima. "
                "Se rellena al reclamar recetas con POST /recipes/claim."
            ),
        ),
        schema="public",
    )
    op.create_foreign_key(
        "fk_user_recipes_user_id",
        "user_recipes",
        "users",
        ["user_id"],
        ["id"],
        source_schema="public",
        referent_schema="public",
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_user_recipes_user_id",
        "user_recipes",
        ["user_id"],
        schema="public",
    )


def downgrade() -> None:
    # Revertir en orden inverso
    op.drop_index("ix_user_recipes_user_id", table_name="user_recipes", schema="public")
    op.drop_constraint("fk_user_recipes_user_id", "user_recipes", schema="public", type_="foreignkey")
    op.drop_column("user_recipes", "user_id", schema="public")

    op.drop_index("ix_gamification_events_user_id", table_name="gamification_events", schema="public")
    op.drop_table("gamification_events", schema="public")

    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens", schema="public")
    op.drop_index("ix_refresh_tokens_jti", table_name="refresh_tokens", schema="public")
    op.drop_table("refresh_tokens", schema="public")
