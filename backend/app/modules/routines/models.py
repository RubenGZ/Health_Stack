"""
app/modules/Routines/models.py
================================
Modelo SQLAlchemy para rutinas de entrenamiento guardadas.

RGPD: Las rutinas son datos funcionales (no categoría especial Art. 9).
      Se almacenan con FK directa a users.id (no requieren seudonimización).
      El JSON de la rutina no contiene datos biométricos directos.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, CheckConstraint, Column, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import Base, TimestampMixin, UUIDPrimaryKeyMixin


class SavedRoutine(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Tabla `routines` — Rutinas de entrenamiento guardadas por el usuario.

    routine_json almacena la rutina completa como JSONB (desde migración 0014,
    previamente TEXT). JSONB permite queries JSON nativas y validación de estructura.
    El frontend recibe el campo serializado como JSON string (ver RoutineResponse).
    """

    __tablename__ = "saved_routines"
    __table_args__ = {
        "schema": "public",
        "comment": "Rutinas de entrenamiento guardadas. routine_json es el objeto completo.",
    }

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("public.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="FK a users.id. CASCADE DELETE: al borrar usuario se borran sus rutinas.",
    )

    label: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="Etiqueta/nombre de la rutina (ej: 'Fullbody Fuerza - Semana 1').",
    )

    routine_json: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        comment="Rutina completa en JSONB (migrado de TEXT en 0014). Permite queries JSON nativas.",
    )

    def __repr__(self) -> str:
        return f"<SavedRoutine id={str(self.id)[:8]}... label={self.label[:20]}>"


class UserChronicInjury(Base, TimestampMixin):
    """Lesión crónica registrada por el usuario. Soft-delete con is_active."""

    __tablename__ = "user_chronic_injuries"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("public.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    body_area = Column(String(30), nullable=False)
    injury_label = Column(String(100), nullable=False)
    severity = Column(String(10), nullable=False)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    __table_args__ = (
        CheckConstraint(
            "severity IN ('mild','moderate','severe')",
            name="ck_injury_severity",
        ),
    )
