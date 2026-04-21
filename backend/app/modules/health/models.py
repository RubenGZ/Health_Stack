"""
app/modules/health/models.py
==============================
Modelo SQLAlchemy del módulo de salud.

REGLA FUNDAMENTAL:
    `health_records` NO tiene ninguna columna que referencie a `users`.
    No hay FK, no hay JOIN directo, no hay índice en email ni user_id.

    La única forma de vincular un HealthRecord con un User es:
        1. Obtener data_links.health_uuid_enc para ese user_id
        2. Descifrar con CryptoService → health_subject_id
        3. Filtrar health_records WHERE health_subject_id = ?

    Este diseño garantiza que una query directa a health_records
    nunca revela a quién pertenecen los datos.

    Schema PostgreSQL: "health" (aislado del schema "public" de identidad)
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
import uuid

from sqlalchemy import Date, Integer, Numeric, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import Base, TimestampMixin, UUIDPrimaryKeyMixin


class HealthRecord(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Tabla `health_records` — Datos biométricos seudonimizados (schema: health).

    AISLAMIENTO DE IDENTIDAD:
        health_subject_id es un UUID v4 aleatorio generado por CryptoService.
        No tiene relación matemática ni criptográfica con users.id.
        Si esta tabla se exfiltra, los datos son anónimos (seudonimizados).

    DATO ESPECIAL (Art. 9 RGPD):
        Los datos de salud son categoría especial bajo el RGPD.
        Requieren base legal explícita (consentimiento del Art. 7).
        Por eso están en un schema separado con permisos PostgreSQL distintos.

    CAMPO notes_encrypted:
        Las notas del usuario también se cifran (pueden contener PII indirecta
        como "me dolía la rodilla izquierda" que podría identificar a alguien
        en ciertos contextos). El cifrado lo gestiona el HealthService.
    """

    __tablename__ = "health_records"
    __table_args__ = {
        "schema": "health",  # Schema separado de identidad
        "comment": (
            "Datos biométricos seudonimizados. "
            "health_subject_id es opaco — no referencia users.id. "
            "Categoría especial Art. 9 RGPD."
        ),
    }

    # ── Identificador seudonimizado ───────────────────────────────────────────

    health_subject_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
        comment=(
            "UUID opaco del sujeto de salud. "
            "NO es users.id. Generado aleatoriamente por CryptoService. "
            "Sin la MASTER_KEY, no hay forma de saber a qué usuario pertenece."
        ),
    )

    # ── Datos biométricos ─────────────────────────────────────────────────────

    recorded_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        index=True,
        comment="Fecha de la medición (solo fecha, sin hora para minimizar datos).",
    )

    weight_kg: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2),  # Hasta 999.99 kg con 2 decimales
        nullable=True,
        comment="Peso en kilogramos.",
    )

    height_cm: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 1),  # Hasta 999.9 cm
        nullable=True,
        comment="Altura en centímetros (no cambia mucho, pero se registra por referencia).",
    )

    body_fat_pct: Mapped[Decimal | None] = mapped_column(
        Numeric(4, 1),  # 0.0 a 99.9 %
        nullable=True,
        comment="Porcentaje de grasa corporal.",
    )

    muscle_mass_kg: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2),
        nullable=True,
        comment="Masa muscular en kg (calculada o medida por bioimpedancia).",
    )

    waist_cm: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 1),
        nullable=True,
    )

    resting_heart_rate: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Frecuencia cardíaca en reposo (ppm).",
    )

    sleep_hours: Mapped[Decimal | None] = mapped_column(
        Numeric(3, 1),  # 0.0 a 99.9 horas
        nullable=True,
        comment="Horas de sueño. Relevante para el motor de entrenamiento (RPE).",
    )

    # Notas personales cifradas — pueden contener PII indirecta
    # El HealthService cifra/descifra este campo antes de persistir/leer
    notes_encrypted: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment=(
            "Notas personales cifradas con AES-256-GCM. "
            "Mismo formato que health_uuid_enc: nonce:tag:ct. "
            "El HealthService gestiona el cifrado de este campo."
        ),
    )

    def __repr__(self) -> str:
        # Mostrar solo el subject_id truncado y la fecha — sin datos biométricos reales
        subject_short = str(self.health_subject_id)[:8]
        return f"<HealthRecord subject={subject_short}... date={self.recorded_date}>"
