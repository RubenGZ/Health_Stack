"""Esquema inicial: schemas public+health, tablas users, data_links, health_records

Revision ID: a1b2c3d4e5f6
Revises:
Create Date: 2025-04-15 00:00:00.000000

Cambios:
- Crea schema PostgreSQL "health" (separado de "public" para RGPD Art. 9)
- Crea tabla public.users         (identidad del usuario)
- Crea tabla public.data_links    (llave de cruce cifrada AES-256-GCM)
- Crea tabla health.health_records (biometría seudonimizada)

Seguridad:
- users y data_links en schema "public"
- health_records en schema "health" con permisos PostgreSQL separados
- NUNCA hay FK directa users → health_records (seudonimización AEPD)
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# Identificadores de revisión
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Crear schema "health" (si no existe) ──────────────────────────────
    # El schema "public" existe por defecto en PostgreSQL.
    # El schema "health" es donde aislamos los datos biométricos.
    op.execute("CREATE SCHEMA IF NOT EXISTS health")

    # ── 2. Tabla: public.users ────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            comment="UUID v4 generado por Python. PK no secuencial.",
        ),
        sa.Column(
            "email",
            sa.String(255),
            nullable=False,
            comment="Email único del usuario. Dato personal (Art. 4 RGPD).",
        ),
        sa.Column(
            "password_hash",
            sa.Text,
            nullable=False,
            comment="Hash Argon2id de la contraseña. Nunca almacenar plaintext.",
        ),
        sa.Column(
            "display_name",
            sa.String(100),
            nullable=True,
            comment="Nombre visible elegido por el usuario (opcional).",
        ),
        sa.Column(
            "role",
            sa.String(20),
            nullable=False,
            server_default="user",
            comment="Rol RBAC: 'user' | 'admin'.",
        ),
        sa.Column(
            "is_active",
            sa.Boolean,
            nullable=False,
            server_default="true",
            comment="Soft-delete: False = cuenta suspendida.",
        ),
        sa.Column(
            "consent_gdpr",
            sa.Boolean,
            nullable=False,
            server_default="false",
            comment="Consentimiento explícito (Art. 7 RGPD).",
        ),
        sa.Column(
            "consent_date",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Fecha del consentimiento. NULL = no dado aún.",
        ),
        sa.Column(
            "last_login_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        schema="public",
        comment=(
            "Tabla de identidad. "
            "No contiene datos de salud (Art. 9 RGPD). "
            "Vinculada a health_records SOLO a través de data_links cifrada."
        ),
    )

    # Índice único en email (búsquedas de login O(log n))
    op.create_index(
        "ix_users_email",
        "users",
        ["email"],
        unique=True,
        schema="public",
    )

    # ── 3. Tabla: public.data_links ───────────────────────────────────────────
    op.create_table(
        "data_links",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            comment="FK a users.id. UNIQUE: cada usuario tiene exactamente una llave.",
        ),
        sa.Column(
            "health_uuid_enc",
            sa.Text,
            nullable=False,
            comment=(
                "AES-256-GCM(health_subject_id). "
                "Formato: nonce_hex:auth_tag_hex:ciphertext_hex."
            ),
        ),
        sa.Column(
            "rotated_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Última rotación de la MASTER_KEY.",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        # FK a users — cascade delete: al borrar usuario, se borra su data_link (Art. 17 RGPD)
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["public.users.id"],
            name="fk_data_links_user_id",
            ondelete="CASCADE",
        ),
        schema="public",
        comment=(
            "Tabla pivote cifrada (identidad ↔ biometría). "
            "health_uuid_enc = AES-256-GCM(health_subject_id). "
            "Seudonimización per Art. 25 RGPD / AEPD."
        ),
    )

    # Índice único en user_id (garantiza 1 llave por usuario)
    op.create_index(
        "ix_data_links_user_id",
        "data_links",
        ["user_id"],
        unique=True,
        schema="public",
    )

    # ── 4. Tabla: health.health_records ───────────────────────────────────────
    op.create_table(
        "health_records",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "health_subject_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            index=True,
            comment=(
                "UUID opaco. NO es users.id. "
                "Sin la MASTER_KEY, no hay forma de saber a quién pertenece."
            ),
        ),
        sa.Column(
            "recorded_date",
            sa.Date,
            nullable=False,
            comment="Fecha de la medición (solo fecha, sin hora — minimiza datos).",
        ),
        sa.Column("weight_kg", sa.Numeric(5, 2), nullable=True),
        sa.Column("height_cm", sa.Numeric(5, 1), nullable=True),
        sa.Column("body_fat_pct", sa.Numeric(4, 1), nullable=True),
        sa.Column("muscle_mass_kg", sa.Numeric(5, 2), nullable=True),
        sa.Column("waist_cm", sa.Numeric(5, 1), nullable=True),
        sa.Column("resting_heart_rate", sa.Integer, nullable=True),
        sa.Column("sleep_hours", sa.Numeric(3, 1), nullable=True),
        sa.Column(
            "notes_encrypted",
            sa.Text,
            nullable=True,
            comment="Notas cifradas con AES-256-GCM. Mismo formato que health_uuid_enc.",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        schema="health",
        comment=(
            "Datos biométricos seudonimizados. "
            "health_subject_id es opaco — no referencia users.id. "
            "Categoría especial Art. 9 RGPD."
        ),
    )

    # Índices para health_records
    op.create_index(
        "ix_health_records_health_subject_id",
        "health_records",
        ["health_subject_id"],
        schema="health",
    )
    op.create_index(
        "ix_health_records_recorded_date",
        "health_records",
        ["recorded_date"],
        schema="health",
    )

    # Índice compuesto: búsquedas "todos los registros del sujeto X ordenados por fecha"
    op.create_index(
        "ix_health_records_subject_date",
        "health_records",
        ["health_subject_id", "recorded_date"],
        schema="health",
    )


def downgrade() -> None:
    # Deshacer en orden inverso (respetar dependencias FK)
    op.drop_index("ix_health_records_subject_date", table_name="health_records", schema="health")
    op.drop_index("ix_health_records_recorded_date", table_name="health_records", schema="health")
    op.drop_index("ix_health_records_health_subject_id", table_name="health_records", schema="health")
    op.drop_table("health_records", schema="health")

    op.drop_index("ix_data_links_user_id", table_name="data_links", schema="public")
    op.drop_table("data_links", schema="public")

    op.drop_index("ix_users_email", table_name="users", schema="public")
    op.drop_table("users", schema="public")

    op.execute("DROP SCHEMA IF EXISTS health CASCADE")
