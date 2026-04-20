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
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import Base, TimestampMixin, UUIDPrimaryKeyMixin


class SavedRoutine(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Tabla `routines` — Rutinas de entrenamiento guardadas por el usuario.

    routine_json almacena la rutina completa serializada como JSON string.
    Este diseño flexible permite que el frontend evolucione sin migraciones.
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

    routine_json: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="JSON string completo de la rutina generada por routineGenerator.js.",
    )

    def __repr__(self) -> str:
        return f"<SavedRoutine id={str(self.id)[:8]}... label={self.label[:20]}>"
