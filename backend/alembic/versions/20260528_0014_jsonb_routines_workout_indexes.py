"""jsonb_routines_workout_indexes

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-05-28 09:30:00.000000

Dos mejoras independientes empaquetadas en una migración:

1. saved_routines.routine_json TEXT → JSONB
   - JSONB almacena datos en formato binario descompuesto, más eficiente en lectura.
   - Permite usar operadores JSON nativos de PostgreSQL (->, ->>, @>, etc.).
   - Valida estructura JSON al insertar (protege contra JSON malformado).
   - La conversión TEXT→JSONB es in-place: sin pérdida de datos.
   - PRE-CHECK: si existen filas con JSON malformado, la migración falla limpiamente
     antes de alterar nada (USING routine_json::jsonb lanza error si el cast falla).

2. Índices para gráficos de progreso por ejercicio
   - ix_workout_sessions_user_started: cubre (user_id, started_at DESC) para
     listar sesiones de un usuario ordenadas cronológicamente.
   - ix_session_exercises_exercise_key: cubre exercise_key para filtrar
     todas las ocurrencias de un ejercicio específico a través de sesiones.

QUERY PATTERN que beneficia (progreso Bench Press):
  SELECT ws.started_at, es.weight_kg, es.reps
  FROM workout_sessions ws                          -- ix_workout_sessions_user_started
  JOIN session_exercises se ON se.session_id = ws.id
  JOIN exercise_sets es ON es.session_exercise_id = se.id
  WHERE ws.user_id = :uid                           -- → index scan
    AND se.exercise_key = 'bench_press'             -- ix_session_exercises_exercise_key
  ORDER BY ws.started_at DESC;
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'b8c9d0e1f2a3'
down_revision = 'a7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. saved_routines.routine_json: TEXT → JSONB ──────────────────────────
    # El USING cast valida JSON al vuelo. Si hay filas con JSON inválido,
    # la migración falla antes de alterar la columna → rollback automático.
    op.execute("""
        ALTER TABLE public.saved_routines
        ALTER COLUMN routine_json TYPE JSONB
        USING routine_json::jsonb
    """)

    # ── 2. Índice compuesto para sesiones de usuario ordenadas por fecha ──────
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_workout_sessions_user_started
        ON public.workout_sessions (user_id, started_at DESC)
    """)

    # ── 3. Índice en exercise_key para búsquedas de progreso por ejercicio ────
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_session_exercises_exercise_key
        ON public.session_exercises (exercise_key)
    """)


def downgrade() -> None:
    # Revertir JSONB → TEXT (sin pérdida: JSONB siempre convierte a TEXT válido)
    op.execute("""
        ALTER TABLE public.saved_routines
        ALTER COLUMN routine_json TYPE TEXT
        USING routine_json::text
    """)

    op.drop_index('ix_workout_sessions_user_started', table_name='workout_sessions', schema='public', if_exists=True)
    op.drop_index('ix_session_exercises_exercise_key', table_name='session_exercises', schema='public', if_exists=True)
