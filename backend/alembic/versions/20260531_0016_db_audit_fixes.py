"""db_audit_fixes

Revision ID: d1e2f3a4b5c6
Revises: c9d0e1f2a3b4
Create Date: 2026-05-31

Fixes de arquitectura de BD identificados en auditoría:
  - H1: ai_insights_cache.user_id String → UUID con FK CASCADE
  - H2: gym_servers/gym_challenges.created_by → nullable + ON DELETE SET NULL
  - M3: user_recipes.ingredients_json JSON → JSONB
  - M4: Índices compuestos para queries frecuentes
"""
from __future__ import annotations

from alembic import op

revision = "d1e2f3a4b5c6"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── H1: ai_insights_cache.user_id  String → UUID con FK CASCADE ──────────
    # Beta: no hay datos relevantes; TRUNCATE es seguro.
    op.execute("TRUNCATE TABLE public.ai_insights_cache")
    op.execute("""
        ALTER TABLE public.ai_insights_cache
            ALTER COLUMN user_id TYPE UUID USING user_id::UUID
    """)
    op.execute("""
        ALTER TABLE public.ai_insights_cache
            ADD CONSTRAINT fk_ai_insights_cache_user_id
                FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
    """)

    # ── H2: gym_servers.created_by → nullable + ON DELETE SET NULL ────────────
    op.execute("""
        ALTER TABLE public.gym_servers
            ALTER COLUMN created_by DROP NOT NULL
    """)
    op.execute("""
        ALTER TABLE public.gym_servers
            DROP CONSTRAINT IF EXISTS gym_servers_created_by_fkey
    """)
    op.execute("""
        ALTER TABLE public.gym_servers
            ADD CONSTRAINT gym_servers_created_by_fkey
                FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL
    """)

    # ── H2: gym_challenges.created_by → nullable + ON DELETE SET NULL ─────────
    op.execute("""
        ALTER TABLE public.gym_challenges
            ALTER COLUMN created_by DROP NOT NULL
    """)
    op.execute("""
        ALTER TABLE public.gym_challenges
            DROP CONSTRAINT IF EXISTS gym_challenges_created_by_fkey
    """)
    op.execute("""
        ALTER TABLE public.gym_challenges
            ADD CONSTRAINT gym_challenges_created_by_fkey
                FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL
    """)

    # ── M3: user_recipes.ingredients_json  JSON → JSONB ──────────────────────
    op.execute("""
        ALTER TABLE public.user_recipes
            ALTER COLUMN ingredients_json TYPE JSONB
            USING ingredients_json::JSONB
    """)

    # ── M4: Índices compuestos para queries frecuentes ────────────────────────

    # Sesiones recientes por usuario (workout history paginado)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_workout_sessions_user_finished
            ON public.workout_sessions(user_id, finished_at DESC)
    """)

    # Posts de comunidad por fecha (feed paginado)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_community_posts_created_desc
            ON public.community_posts(created_at DESC)
    """)

    # Eventos de gamificación por usuario y fecha
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_gamification_events_user_date
            ON public.gamification_events(user_id, created_at DESC)
    """)

    # Historial LP ranked por usuario y cola
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_ranked_events_user_queue_date
            ON public.ranked_events(user_id, queue, created_at DESC)
    """)

    # Descubrimiento de gyms públicos (índice parcial)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_gym_servers_public
            ON public.gym_servers(created_at DESC)
            WHERE is_public = TRUE
    """)

    # Health records por sujeto y fecha (perfil + historial clínico)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_health_records_subject_date
            ON health.health_records(health_subject_id, recorded_date DESC)
    """)


def downgrade() -> None:
    # ── M4: eliminar índices (orden inverso al upgrade) ───────────────────────
    op.execute("DROP INDEX IF EXISTS health.ix_health_records_subject_date")
    op.execute("DROP INDEX IF EXISTS public.ix_gym_servers_public")
    op.execute("DROP INDEX IF EXISTS public.ix_ranked_events_user_queue_date")
    op.execute("DROP INDEX IF EXISTS public.ix_gamification_events_user_date")
    op.execute("DROP INDEX IF EXISTS public.ix_community_posts_created_desc")
    op.execute("DROP INDEX IF EXISTS public.ix_workout_sessions_user_finished")

    # ── M3: revertir JSONB → TEXT (JSON exacto no es reversible; TEXT preserva datos) ──
    op.execute("""
        ALTER TABLE public.user_recipes
            ALTER COLUMN ingredients_json TYPE TEXT
            USING ingredients_json::TEXT
    """)

    # ── H2: revertir gym_challenges.created_by ────────────────────────────────
    op.execute("""
        ALTER TABLE public.gym_challenges
            DROP CONSTRAINT IF EXISTS gym_challenges_created_by_fkey
    """)
    op.execute("""
        ALTER TABLE public.gym_challenges
            ADD CONSTRAINT gym_challenges_created_by_fkey
                FOREIGN KEY (created_by) REFERENCES public.users(id)
    """)
    op.execute("""
        ALTER TABLE public.gym_challenges
            ALTER COLUMN created_by SET NOT NULL
    """)

    # ── H2: revertir gym_servers.created_by ───────────────────────────────────
    op.execute("""
        ALTER TABLE public.gym_servers
            DROP CONSTRAINT IF EXISTS gym_servers_created_by_fkey
    """)
    op.execute("""
        ALTER TABLE public.gym_servers
            ADD CONSTRAINT gym_servers_created_by_fkey
                FOREIGN KEY (created_by) REFERENCES public.users(id)
    """)
    op.execute("""
        ALTER TABLE public.gym_servers
            ALTER COLUMN created_by SET NOT NULL
    """)

    # ── H1: revertir ai_insights_cache.user_id  UUID → VARCHAR ───────────────
    op.execute("""
        ALTER TABLE public.ai_insights_cache
            DROP CONSTRAINT IF EXISTS fk_ai_insights_cache_user_id
    """)
    op.execute("TRUNCATE TABLE public.ai_insights_cache")
    op.execute("""
        ALTER TABLE public.ai_insights_cache
            ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::TEXT
    """)
