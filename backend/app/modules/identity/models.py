"""
app/modules/identity/models.py
================================
Modelos SQLAlchemy del módulo de identidad.

REGLA FUNDAMENTAL:
    La tabla `users` contiene SOLO datos de identificación (email, contraseña, rol).
    NO tiene columnas de salud, peso, biometría ni historial médico.

    La tabla `data_links` contiene el puente cifrado user_id → health_subject_id.
    El campo `health_uuid_enc` es un ciphertext AES-256-GCM: sin la MASTER_KEY,
    es solo bytes aleatorios sin significado.

RELACIÓN ENTRE TABLAS:
    users.id  ──(1:1)──  data_links.user_id
                         data_links.health_uuid_enc  ──(cifrado)──  health_records.health_subject_id

    NUNCA hay una FK directa users → health_records.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.shared.base_model import Base, TimestampMixin, UUIDPrimaryKeyMixin


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Tabla `users` — Identidad del usuario (schema: public).

    Contiene exclusivamente datos que identifican a la persona:
    email, contraseña hasheada, nombre visible y rol.

    NO contiene: peso, altura, diagnósticos, biometría, ni ningún
    dato que entre en la categoría especial del Art. 9 RGPD.
    """

    __tablename__ = "users"
    __table_args__ = {
        "schema": "public",
        "comment": (
            "Tabla de identidad. "
            "No contiene datos de salud (Art. 9 RGPD). "
            "Vinculada a health_records SOLO a través de data_links cifrada."
        ),
    }

    # ── Datos de identidad ────────────────────────────────────────────────────

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
        comment="Email único del usuario. Dato personal (Art. 4 RGPD).",
    )

    # Argon2id hash — NUNCA almacenar la contraseña en texto plano
    password_hash: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Hash Argon2id de la contraseña. Nunca es la contraseña original.",
    )

    display_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        comment="Nombre visible elegido por el usuario (no obligatorio).",
    )

    # ── Control de acceso ─────────────────────────────────────────────────────

    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="user",
        server_default="user",
        comment="Rol para RBAC: 'user' | 'admin'.",
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
        comment="Soft-delete: False = cuenta suspendida.",
    )

    # ── Consentimiento RGPD (Art. 7) ─────────────────────────────────────────

    consent_gdpr: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
        comment="Consentimiento explícito dado por el usuario (Art. 7 RGPD).",
    )

    consent_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Fecha y hora del consentimiento. Null = no dado aún.",
    )

    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # ── Relaciones ────────────────────────────────────────────────────────────

    # Relación 1:1 con la tabla de llave de cruce
    # uselist=False → devuelve objeto único, no lista
    data_link: Mapped["DataLink | None"] = relationship(
        "DataLink",
        back_populates="user",
        uselist=False,
        lazy="select",
        cascade="all, delete-orphan",  # Al borrar user → borra data_link (Art. 17 RGPD)
    )

    def __repr__(self) -> str:
        # Nunca incluir el email en repr → puede aparecer en logs
        return f"<User id={str(self.id)[:8]}... role={self.role}>"


class DataLink(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Tabla `data_links` — Llave de Cruce Cifrada (schema: public).

    Esta tabla es el corazón de la seudonimización AEPD.

    PROPÓSITO:
        Almacena el vínculo entre user_id (identidad) y health_subject_id (salud)
        de forma cifrada. Sin la MASTER_KEY del entorno, este vínculo es irresoluble.

    CUÁNDO SE CREA:
        Exactamente una vez: cuando el usuario completa el registro.
        El CryptoService genera un health_subject_id UUID aleatorio, lo cifra
        con AES-256-GCM y lo almacena aquí.

    ROTACIÓN DE CLAVES:
        Si la MASTER_KEY se rota, se debe re-cifrar TODOS los health_uuid_enc.
        El campo `rotated_at` registra la última rotación.

    ESCENARIO DE ATAQUE MITIGADO:
        Si la BD de health_records es exfiltrada → solo UUIDs anónimos.
        Si data_links es exfiltrada → solo ciphertext, sin la MASTER_KEY es inútil.
        Solo si el atacante obtiene BD + MASTER_KEY puede correlacionar datos.
        (La MASTER_KEY nunca está en la BD → está solo en el entorno del servidor).
    """

    __tablename__ = "data_links"
    __table_args__ = {
        "schema": "public",
        "comment": (
            "Tabla pivote cifrada que vincula identidad con biometría. "
            "health_uuid_enc = AES-256-GCM(health_subject_id). "
            "Implementa seudonimización per Art. 25 RGPD / AEPD."
        ),
    }

    # FK al usuario propietario de esta llave
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("public.users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,   # UNIQUE: cada usuario tiene exactamente una llave de cruce
        index=True,
        comment="FK a users.id. UNIQUE garantiza una llave por usuario.",
    )

    # El UUID del health_subject cifrado con AES-256-GCM.
    # Formato: "<nonce_hex>:<auth_tag_hex>:<ciphertext_hex>"
    # Almacenado como TEXT (en producción podría ser BYTEA para mayor seguridad)
    health_uuid_enc: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment=(
            "AES-256-GCM(health_subject_id). "
            "Formato: nonce_hex:auth_tag_hex:ciphertext_hex. "
            "Solo el CryptoService puede descifrar este campo."
        ),
    )

    # Auditoría de rotación de clave maestra
    rotated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Última vez que se re-cifró con una nueva MASTER_KEY.",
    )

    # ── Relación ──────────────────────────────────────────────────────────────

    user: Mapped["User"] = relationship(
        "User",
        back_populates="data_link",
    )

    def __repr__(self) -> str:
        # NUNCA mostrar health_uuid_enc en repr → es material criptográfico
        return f"<DataLink user_id={str(self.user_id)[:8]}... [encrypted]>"
