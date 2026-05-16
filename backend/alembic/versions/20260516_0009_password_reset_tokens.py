"""password_reset_tokens table

Revision ID: c3d4e5f6a7b9
Revises: b2c3d4e5f6a8
Create Date: 2026-05-16 10:00:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = 'c3d4e5f6a7b9'
down_revision = 'b2c3d4e5f6a8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'password_reset_tokens',
        sa.Column(
            'id',
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text('gen_random_uuid()'),
            nullable=False,
        ),
        sa.Column(
            'user_id',
            UUID(as_uuid=True),
            sa.ForeignKey('public.users.id', ondelete='CASCADE'),
            nullable=False,
            index=True,
        ),
        sa.Column(
            'token_hash',
            sa.String(64),
            nullable=False,
            unique=True,
            index=True,
            comment='SHA-256 hex del token en claro. El token original nunca se persiste.',
        ),
        sa.Column(
            'expires_at',
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            'used_at',
            sa.DateTime(timezone=True),
            nullable=True,
            comment='Null = válido. Timestamp = ya consumido (single-use).',
        ),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        schema='public',
    )


def downgrade() -> None:
    op.drop_table('password_reset_tokens', schema='public')
