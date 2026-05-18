"""user_onboarding_profile

Revision ID: e5f6a7b8c9d1
Revises: d4e5f6a7b8c0
Create Date: 2026-05-18 10:00:00.000000

Añade columnas de perfil de onboarding a public.users:
  - biological_sex       ENUM('male','female') nullable
  - birth_date           DATE nullable
  - current_weight_kg    NUMERIC(5,2) nullable
  - height_cm            NUMERIC(5,1) nullable
  - activity_level       ENUM(...) nullable
  - primary_fitness_goal ENUM(...) nullable
  - onboarding_completed BOOLEAN default False

Estas columnas son datos de preferencia/perfil (no datos de salud Art. 9 RGPD).
Los registros biométricos detallados siguen en health.health_records.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = 'e5f6a7b8c9d1'
down_revision = 'd4e5f6a7b8c0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enums
    biological_sex_enum = postgresql.ENUM(
        'male', 'female',
        name='biological_sex_enum',
        schema='public',
        create_type=True,
    )
    biological_sex_enum.create(op.get_bind(), checkfirst=True)

    activity_level_enum = postgresql.ENUM(
        'sedentary', 'lightly_active', 'moderately_active', 'very_active',
        name='activity_level_enum',
        schema='public',
        create_type=True,
    )
    activity_level_enum.create(op.get_bind(), checkfirst=True)

    fitness_goal_enum = postgresql.ENUM(
        'lose_fat', 'maintain', 'gain_muscle', 'increase_strength',
        name='fitness_goal_enum',
        schema='public',
        create_type=True,
    )
    fitness_goal_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        'users',
        sa.Column(
            'biological_sex',
            sa.Enum('male', 'female', name='biological_sex_enum', schema='public'),
            nullable=True,
            comment='Sexo biológico — usado para cálculo de zonas cardíacas y modelo 3D.',
        ),
        schema='public',
    )
    op.add_column(
        'users',
        sa.Column(
            'birth_date',
            sa.Date(),
            nullable=True,
            comment='Fecha de nacimiento — edad calculada dinámicamente para umbrales de entrenamiento.',
        ),
        schema='public',
    )
    op.add_column(
        'users',
        sa.Column(
            'current_weight_kg',
            sa.Numeric(5, 2),
            nullable=True,
            comment='Peso actual en kg — baseline para cálculo Epley 1RM y macros.',
        ),
        schema='public',
    )
    op.add_column(
        'users',
        sa.Column(
            'height_cm',
            sa.Numeric(5, 1),
            nullable=True,
            comment='Altura en cm — combinada con peso para IMC y TDEE.',
        ),
        schema='public',
    )
    op.add_column(
        'users',
        sa.Column(
            'activity_level',
            sa.Enum(
                'sedentary', 'lightly_active', 'moderately_active', 'very_active',
                name='activity_level_enum',
                schema='public',
            ),
            nullable=True,
            comment='Nivel de actividad — multiplicador TDEE para módulo de nutrición.',
        ),
        schema='public',
    )
    op.add_column(
        'users',
        sa.Column(
            'primary_fitness_goal',
            sa.Enum(
                'lose_fat', 'maintain', 'gain_muscle', 'increase_strength',
                name='fitness_goal_enum',
                schema='public',
            ),
            nullable=True,
            comment='Objetivo principal — usado por AI Coach y splits de macros.',
        ),
        schema='public',
    )
    op.add_column(
        'users',
        sa.Column(
            'onboarding_completed',
            sa.Boolean(),
            nullable=False,
            server_default='false',
            comment='True cuando el usuario completa el flujo de onboarding.',
        ),
        schema='public',
    )


def downgrade() -> None:
    for col in [
        'onboarding_completed',
        'primary_fitness_goal',
        'activity_level',
        'height_cm',
        'current_weight_kg',
        'birth_date',
        'biological_sex',
    ]:
        op.drop_column('users', col, schema='public')

    op.execute("DROP TYPE IF EXISTS public.fitness_goal_enum")
    op.execute("DROP TYPE IF EXISTS public.activity_level_enum")
    op.execute("DROP TYPE IF EXISTS public.biological_sex_enum")
