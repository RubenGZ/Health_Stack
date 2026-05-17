"""add plan column to users and page_views table

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-05-08
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: str = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── plan column on users ───────────────────────────────────────────────
    op.add_column(
        "users",
        sa.Column("plan", sa.String(10), nullable=False, server_default="free"),
        schema="public",
    )
    op.create_check_constraint(
        "users_plan_check",
        "users",
        "plan IN ('free', 'pro', 'elite')",
        schema="public",
    )

    # ── page_views table ───────────────────────────────────────────────────
    op.create_table(
        "page_views",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("page", sa.String(100), nullable=False),
        sa.Column("country", sa.String(2), nullable=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("public.users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("is_auth", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        schema="public",
    )
    op.create_index(
        "idx_page_views_created_at", "page_views", ["created_at"], schema="public"
    )
    op.create_index(
        "idx_page_views_page", "page_views", ["page"], schema="public"
    )


def downgrade() -> None:
    op.drop_index("idx_page_views_page", table_name="page_views", schema="public")
    op.drop_index("idx_page_views_created_at", table_name="page_views", schema="public")
    op.drop_table("page_views", schema="public")
    op.drop_constraint("users_plan_check", "users", schema="public")
    op.drop_column("users", "plan", schema="public")
