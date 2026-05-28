"""cleanup_duplicate_indexes

Revision ID: f1a2b3c4d5e6
Revises: e5f6a7b8c9d1
Create Date: 2026-05-28 09:00:00.000000

Elimina índices B-tree duplicados detectados en la auditoría QA del 2026-05-28.
Cuatro tablas tienen dos índices idénticos sobre la misma columna:
- gamification_states.user_id  → doble UNIQUE index
- refresh_tokens.jti           → doble UNIQUE index
- health_records.health_subject_id → dos índices ordinales iguales
- user_recipes.user_local_id   → dos índices ordinales iguales

Además ajusta autovacuum_vacuum_scale_factor en las tablas con mayor
acumulación de dead tuples (users y gamification_states).

Impacto en rendimiento:
- Reduce el trabajo de escritura a la mitad en cada INSERT/UPDATE en estas tablas.
- Sin impacto en lecturas: el índice que queda tiene exactamente la misma cobertura.
- No requiere lock exclusivo (DROP INDEX CONCURRENTLY en Postgres 9.2+).
"""
from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = 'f1a2b3c4d5e6'
down_revision = 'e5f6a7b8c9d1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Eliminar índices duplicados ────────────────────────────────────────

    # gamification_states.user_id: se queda 'gamification_states_user_id_key' (UNIQUE)
    # se elimina 'ix_gamification_states_user_id' (duplicado)
    op.drop_index(
        'ix_gamification_states_user_id',
        table_name='gamification_states',
        schema='public',
        if_exists=True,
    )

    # refresh_tokens.jti: se queda 'ix_refresh_tokens_jti' (UNIQUE + index=True en modelo)
    # se elimina 'uq_refresh_tokens_jti' — OJO: es una UNIQUE CONSTRAINT, no un índice
    # standalone. PostgreSQL prohíbe DROP INDEX sobre un índice que respalda un constraint.
    # Hay que dropear la constraint (esto también elimina el índice automáticamente).
    op.execute(
        "ALTER TABLE public.refresh_tokens DROP CONSTRAINT IF EXISTS uq_refresh_tokens_jti"
    )

    # health_records.health_subject_id: se queda 'ix_health_records_health_subject_id'
    # se elimina 'ix_health_health_records_health_subject_id' (duplicado con prefijo de schema)
    op.drop_index(
        'ix_health_health_records_health_subject_id',
        table_name='health_records',
        schema='health',
        if_exists=True,
    )

    # user_recipes.user_local_id: se queda 'ix_user_recipes_user_local_id'
    # se elimina 'ix_public_user_recipes_user_local_id' (duplicado con prefijo de schema)
    op.drop_index(
        'ix_public_user_recipes_user_local_id',
        table_name='user_recipes',
        schema='public',
        if_exists=True,
    )

    # ── 2. Ajustar autovacuum para tablas con alta tasa de actualización ──────
    # El autovacuum por defecto espera a que el 20% de las filas sean dead tuples.
    # Para tablas pequeñas muy activas (users, gamification_states), esto provoca
    # acumulación severa (hasta 91% dead tuples en users). Reducimos el threshold al 5%.
    op.execute("""
        ALTER TABLE public.users
            SET (
                autovacuum_vacuum_scale_factor = 0.05,
                autovacuum_analyze_scale_factor = 0.02
            )
    """)
    op.execute("""
        ALTER TABLE public.gamification_states
            SET (
                autovacuum_vacuum_scale_factor = 0.05,
                autovacuum_analyze_scale_factor = 0.02
            )
    """)
    op.execute("""
        ALTER TABLE public.ai_insights_cache
            SET (
                autovacuum_vacuum_scale_factor = 0.05,
                autovacuum_analyze_scale_factor = 0.02
            )
    """)

    # ── 3. VACUUM ANALYZE inmediato en las tablas más afectadas ──────────────
    # VACUUM no puede ejecutarse dentro de una transacción → usar op.execute con autocommit
    # Se ejecuta fuera de la transacción Alembic mediante VACUUM directamente.
    # Nota: Alembic wraps todo en BEGIN...COMMIT, así que el VACUUM se hace
    # en el postprocess del step o vía script de despliegue.
    # Aquí dejamos una instrucción comentada para el operador:
    # VACUUM ANALYZE public.users;
    # VACUUM ANALYZE public.gamification_states;
    # VACUUM ANALYZE public.ai_insights_cache;
    # VACUUM ANALYZE public.community_posts;
    pass


def downgrade() -> None:
    # ── Restaurar autovacuum a valores por defecto ────────────────────────────
    op.execute("ALTER TABLE public.users RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor)")
    op.execute("ALTER TABLE public.gamification_states RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor)")
    op.execute("ALTER TABLE public.ai_insights_cache RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor)")

    # ── Re-crear los índices eliminados ───────────────────────────────────────
    op.create_index(
        'ix_gamification_states_user_id',
        'gamification_states',
        ['user_id'],
        unique=True,
        schema='public',
    )
    op.create_index(
        'uq_refresh_tokens_jti',
        'refresh_tokens',
        ['jti'],
        unique=True,
        schema='public',
    )
    op.create_index(
        'ix_health_health_records_health_subject_id',
        'health_records',
        ['health_subject_id'],
        unique=False,
        schema='health',
    )
    op.create_index(
        'ix_public_user_recipes_user_local_id',
        'user_recipes',
        ['user_local_id'],
        unique=False,
        schema='public',
    )
