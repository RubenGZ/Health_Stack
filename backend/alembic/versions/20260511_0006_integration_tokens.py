"""Add integration_tokens table for OAuth2 fitness platform integrations.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-05-11 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f6a7b8c9d0e1"
down_revision: str = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "integration_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("platform", sa.String(length=50), nullable=False),
        sa.Column("access_token_enc", sa.Text(), nullable=False),
        sa.Column("refresh_token_enc", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scope", sa.String(length=1000), nullable=True),
        sa.Column("platform_user_id", sa.String(length=255), nullable=True),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "platform", name="uq_integration_user_platform"),
        comment=(
            "OAuth2 tokens for Google Fit, Strava, Fitbit integrations. "
            "Tokens are AES-256-GCM encrypted — same key as health_link, "
            "different AAD context."
        ),
    )
    op.create_index("ix_integration_tokens_user_id", "integration_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_integration_tokens_user_id", table_name="integration_tokens")
    op.drop_table("integration_tokens")
