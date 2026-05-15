"""workout_sessions_tables

Revision ID: a1b2c3d4e5f7
Revises: f6a7b8c9d0e1
Create Date: 2026-05-15 10:00:00.000000

"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision = 'a1b2c3d4e5f7'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'workout_sessions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('routine_id', sa.Integer(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('duration_secs', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('total_volume_kg', sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['public.users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['routine_id'], ['public.saved_routines.id']),
        sa.PrimaryKeyConstraint('id'),
        schema='public',
        comment='Cabecera de sesión de entrenamiento.',
    )
    op.create_index('ix_workout_sessions_user_id', 'workout_sessions', ['user_id'], schema='public')
    op.create_table(
        'session_exercises',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('exercise_key', sa.String(80), nullable=False),
        sa.Column('exercise_name', sa.String(120), nullable=False),
        sa.Column('order_index', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['session_id'], ['public.workout_sessions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='public',
        comment='Ejercicio dentro de una sesión.',
    )
    op.create_index('ix_session_exercises_session_order', 'session_exercises', ['session_id', 'order_index'], schema='public')
    op.create_index('ix_session_exercises_session_id', 'session_exercises', ['session_id'], schema='public')
    op.create_table(
        'exercise_sets',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('session_exercise_id', sa.Integer(), nullable=False),
        sa.Column('set_number', sa.Integer(), nullable=False),
        sa.Column('weight_kg', sa.Float(), nullable=False),
        sa.Column('reps', sa.Integer(), nullable=False),
        sa.Column('rpe', sa.Float(), nullable=True),
        sa.Column('is_warmup', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['session_exercise_id'], ['public.session_exercises.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='public',
        comment='Set individual dentro de un ejercicio de sesión.',
    )
    op.create_index('ix_exercise_sets_session_exercise_id', 'exercise_sets', ['session_exercise_id'], schema='public')


def downgrade() -> None:
    op.drop_index('ix_exercise_sets_session_exercise_id', table_name='exercise_sets', schema='public')
    op.drop_table('exercise_sets', schema='public')
    op.drop_index('ix_session_exercises_session_order', table_name='session_exercises', schema='public')
    op.drop_index('ix_session_exercises_session_id', table_name='session_exercises', schema='public')
    op.drop_table('session_exercises', schema='public')
    op.drop_index('ix_workout_sessions_user_id', table_name='workout_sessions', schema='public')
    op.drop_table('workout_sessions', schema='public')
