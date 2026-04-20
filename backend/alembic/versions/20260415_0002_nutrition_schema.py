"""Módulo de Nutrición: tablas supplements, ingredients, user_recipes

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-15 00:00:00.000000

Cambios:
- Crea tabla public.supplements  (catálogo de suplementos con afiliados)
- Crea tabla public.ingredients  (catálogo de ingredientes con macros por 100g)
- Crea tabla public.user_recipes (recetas personalizadas del usuario)

Seguridad / RGPD:
- user_recipes.user_local_id es un UUID del cliente (localStorage), no el user.id
  de la tabla users. Permite funcionalidad sin autenticación obligatoria y no
  constituye dato de salud especial (Art. 9 RGPD) — son recetas de cocina.
- Los ingredients y supplements son datos de catálogo (no PII).
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Tabla: public.supplements ─────────────────────────────────────────
    op.create_table(
        "supplements",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False,
                  comment="Nombre del suplemento"),
        sa.Column("dose", sa.String(50), nullable=False,
                  comment="Dosis recomendada (ej: '20-40 g')"),
        sa.Column("timing", sa.String(100), nullable=False,
                  comment="Momento de toma (ej: 'Post-entreno')"),
        sa.Column("level", sa.String(20), nullable=False,
                  server_default="essential",
                  comment="'essential' | 'optional'"),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("affiliate_link_placeholder", sa.String(100), nullable=True,
                  comment="Placeholder sustituido en config.js"),
        sa.Column("icon_emoji", sa.String(10), nullable=True),
        sa.Column("evidence_level", sa.String(20), nullable=False,
                  server_default="high",
                  comment="'high' | 'medium' | 'low'"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        schema="public",
        comment="Catálogo de suplementos deportivos.",
    )

    # ── 2. Tabla: public.ingredients ──────────────────────────────────────────
    op.create_table(
        "ingredients",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("category", sa.String(30), nullable=False,
                  comment="protein_high|protein_medium|carb_high|carb_medium|fat_high|fat_medium|mixed"),
        sa.Column("quality", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("calorie_density", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("satiety_index", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("protein", sa.Float(), nullable=False, server_default="0.0",
                  comment="Proteína g/100g"),
        sa.Column("carbs", sa.Float(), nullable=False, server_default="0.0",
                  comment="Hidratos g/100g"),
        sa.Column("fat", sa.Float(), nullable=False, server_default="0.0",
                  comment="Grasa g/100g"),
        sa.Column("calories", sa.Float(), nullable=False, server_default="0.0",
                  comment="kcal/100g"),
        sa.Column("inflammation_base", sa.String(20), nullable=False,
                  server_default="low",
                  comment="'low' | 'medium' | 'high'"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        schema="public",
        comment="Catálogo de ingredientes con macros por 100g.",
    )

    # ── 3. Tabla: public.user_recipes ─────────────────────────────────────────
    op.create_table(
        "user_recipes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("user_local_id", sa.String(100), nullable=True, index=True,
                  comment="UUID localStorage del cliente (no FK a users)"),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(20), nullable=False, server_default="almuerzo",
                  comment="desayuno|almuerzo|cena|snack|pre|post"),
        sa.Column("ingredients_json", sa.JSON(), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("rating_stars", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("total_calories", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("total_protein", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("total_carbs", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("total_fat", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("inflammation_score", sa.String(20), nullable=False,
                  server_default="low",
                  comment="'low' | 'medium' | 'high'"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        schema="public",
        comment="Recetas personalizadas del usuario. Ingredientes como JSON.",
    )

    # Índice en user_local_id para búsquedas eficientes
    op.create_index(
        "ix_user_recipes_user_local_id",
        "user_recipes",
        ["user_local_id"],
        schema="public",
    )


def downgrade() -> None:
    op.drop_index("ix_user_recipes_user_local_id", table_name="user_recipes", schema="public")
    op.drop_table("user_recipes", schema="public")
    op.drop_table("ingredients", schema="public")
    op.drop_table("supplements", schema="public")
