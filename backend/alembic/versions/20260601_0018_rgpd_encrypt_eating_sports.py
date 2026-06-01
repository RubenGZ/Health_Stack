"""rgpd_blindado: cifrar eating_style y sport_activities en health.user_health_profiles

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-06-01

Cambios:
  - DROP public.users.eating_style  (texto plano → Art.9 risk)
  - DROP public.users.sport_activities (JSONB plano → Art.9 risk)
  - ADD health.user_health_profiles.eating_style_enc  (cifrado AES-256-GCM)
  - ADD health.user_health_profiles.sport_activities_enc (cifrado AES-256-GCM)

Estos datos son potencialmente Art.9 RGPD por contexto (hábitos alimentarios,
actividad deportiva como indicador de salud). Se mueven a la tabla cifrada.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "f2a3b4c5d6e7"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Eliminar columnas planas de public.users ──────────────────────────────
    op.drop_column("users", "eating_style", schema="public")
    op.drop_column("users", "sport_activities", schema="public")

    # ── Añadir columnas cifradas a health.user_health_profiles ────────────────
    op.add_column(
        "user_health_profiles",
        sa.Column(
            "eating_style_enc", sa.Text(), nullable=True,
            comment="Estilo alimentación cifrado AES-256-GCM (Art.9 por contexto)",
        ),
        schema="health",
    )
    op.add_column(
        "user_health_profiles",
        sa.Column(
            "sport_activities_enc", sa.Text(), nullable=True,
            comment="Deportes cifrado AES-256-GCM [{sport, days_per_week, duration_min, intensity}]",
        ),
        schema="health",
    )


def downgrade() -> None:
    # Eliminar columnas cifradas de health.user_health_profiles
    op.drop_column("user_health_profiles", "eating_style_enc", schema="health")
    op.drop_column("user_health_profiles", "sport_activities_enc", schema="health")

    # Restaurar columnas planas en public.users
    op.add_column("users", sa.Column(
        "eating_style", sa.String(32), nullable=True,
    ), schema="public")
    op.add_column("users", sa.Column(
        "sport_activities", sa.Text(), nullable=True,
    ), schema="public")
