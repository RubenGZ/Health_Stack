"""smart_onboarding: NEAT fields en users + tabla health.user_health_profiles

Revision ID: e1f2a3b4c5d6
Revises: d1e2f3a4b5c6
Create Date: 2026-06-01

Cambios:
  - public.users: añade work_type, daily_steps_range, sport_activities (JSONB),
    strength_experience, strength_consistency, eating_style, ai_consent_at,
    onboarding_v2_completed
  - health.user_health_profiles: nueva tabla con datos Art.9 cifrados
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "e1f2a3b4c5d6"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Nuevos campos en public.users ─────────────────────────────────────────

    op.add_column("users", sa.Column(
        "work_type", sa.String(32), nullable=True,
        comment="Tipo de trabajo: desk|standing|physical|remote|none",
    ), schema="public")

    op.add_column("users", sa.Column(
        "daily_steps_range", sa.String(16), nullable=True,
        comment="Rango de pasos diarios: lt4k|4k7k|7k10k|gt10k",
    ), schema="public")

    op.add_column("users", sa.Column(
        "sport_activities", postgresql.JSONB(astext_type=sa.Text()), nullable=True,
        comment="Lista de deportes: [{sport, days_per_week, duration_min, intensity}]",
    ), schema="public")

    op.add_column("users", sa.Column(
        "strength_experience", sa.String(16), nullable=True,
        comment="Experiencia en fuerza: never|lt6m|6m2y|gt2y",
    ), schema="public")

    op.add_column("users", sa.Column(
        "strength_consistency", sa.String(16), nullable=True,
        comment="Consistencia en fuerza: regular|inconsistent|starting",
    ), schema="public")

    op.add_column("users", sa.Column(
        "eating_style", sa.String(32), nullable=True,
        comment="Estilo de alimentación: omnivore|vegetarian|vegan",
    ), schema="public")

    op.add_column("users", sa.Column(
        "ai_consent_at", sa.DateTime(timezone=True), nullable=True,
        comment="Timestamp de consentimiento RGPD Art.9 para procesamiento IA",
    ), schema="public")

    op.add_column("users", sa.Column(
        "onboarding_v2_completed",
        sa.Boolean(),
        nullable=False,
        server_default="false",
        comment="True cuando el usuario completa el wizard extendido v2",
    ), schema="public")

    # ── Nueva tabla health.user_health_profiles ───────────────────────────────

    op.create_table(
        "user_health_profiles",
        sa.Column(
            "health_subject_id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            comment="UUID pseudónimo. NO FK a public.users.",
        ),
        sa.Column(
            "body_fat_pct", sa.Text(), nullable=True,
            comment="% grasa cifrado AES-256-GCM",
        ),
        sa.Column(
            "body_fat_visual", sa.Text(), nullable=True,
            comment="Estimación visual cifrada: lean_soft|belly_main|uniform|high_volume",
        ),
        sa.Column(
            "food_intolerances", sa.Text(), nullable=True,
            comment='JSON cifrado p.ej. ["gluten","lactose"]',
        ),
        sa.Column(
            "ai_profile", sa.Text(), nullable=True,
            comment="JSON resultado Groq cifrado (~2-3KB)",
        ),
        sa.Column(
            "ai_profile_generated_at",
            sa.DateTime(timezone=True), nullable=True,
            comment="Timestamp de la última llamada Groq exitosa",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        schema="health",
    )


def downgrade() -> None:
    # Tabla health.user_health_profiles
    op.drop_table("user_health_profiles", schema="health")

    # Columnas de public.users (en orden inverso)
    for col in [
        "onboarding_v2_completed", "ai_consent_at", "eating_style",
        "strength_consistency", "strength_experience", "sport_activities",
        "daily_steps_range", "work_type",
    ]:
        op.drop_column("users", col, schema="public")
