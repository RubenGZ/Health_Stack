"""ai_insights_cache table

Revision ID: d4e5f6a7b8c0
Revises: c3d4e5f6a7b9
Create Date: 2026-05-17 12:00:00.000000

Caché de respuestas de IA para biomarker_narrative, injury_risk y weekly_goals.
Evita llamadas repetidas a Groq/Gemini cuando el usuario recarga la página.
Exactamente una fila por (user_id, insight_type) gracias al índice único.
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = 'd4e5f6a7b8c0'
down_revision = 'c3d4e5f6a7b9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'ai_insights_cache',
        sa.Column('id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('insight_type', sa.String(50), nullable=False),
        sa.Column('result_json', sa.Text(), nullable=False),
        sa.Column(
            'generated_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text('NOW()'),
        ),
    )
    op.create_index(
        'ix_ai_insights_cache_user_id',
        'ai_insights_cache',
        ['user_id'],
    )
    op.create_unique_constraint(
        'uq_ai_insights_cache_user_type',
        'ai_insights_cache',
        ['user_id', 'insight_type'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_ai_insights_cache_user_type', 'ai_insights_cache')
    op.drop_index('ix_ai_insights_cache_user_id', 'ai_insights_cache')
    op.drop_table('ai_insights_cache')
