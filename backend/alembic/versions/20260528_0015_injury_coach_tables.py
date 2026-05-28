"""add_injury_coach_tables

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-05-28

Añade:
  - user_chronic_injuries: registro de lesiones crónicas por usuario
  - workout_ai_plans: planes IA post-entrenamiento para la próxima sesión
"""
from __future__ import annotations

from alembic import op

revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE user_chronic_injuries (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            body_area    VARCHAR(30)  NOT NULL,
            injury_label VARCHAR(100) NOT NULL,
            severity     VARCHAR(10)  NOT NULL
                             CHECK (severity IN ('mild', 'moderate', 'severe')),
            notes        TEXT,
            is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
            created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE INDEX ix_user_chronic_injuries_user_active
        ON user_chronic_injuries(user_id, is_active)
    """)
    op.execute("""
        CREATE TABLE workout_ai_plans (
            id                SERIAL       PRIMARY KEY,
            user_id           UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            source_session_id INTEGER      NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
            created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
            expires_at        TIMESTAMPTZ,
            plan_json         JSONB        NOT NULL,
            coach_notes       TEXT,
            deload_signal     BOOLEAN      NOT NULL DEFAULT FALSE,
            used              BOOLEAN      NOT NULL DEFAULT FALSE,
            UNIQUE (source_session_id)
        )
    """)
    op.execute("""
        CREATE INDEX ix_workout_ai_plans_user_unused
        ON workout_ai_plans(user_id, used, expires_at)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_workout_ai_plans_user_unused")
    op.execute("DROP TABLE  IF EXISTS workout_ai_plans")
    op.execute("DROP INDEX IF EXISTS ix_user_chronic_injuries_user_active")
    op.execute("DROP TABLE  IF EXISTS user_chronic_injuries")
