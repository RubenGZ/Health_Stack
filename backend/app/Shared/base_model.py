"""
app/shared/base_model.py
========================
Modelo base SQLAlchemy compartido por todos los módulos.

Proporciona:
- UUID como PK (portable, no secuencial → no revela volumen de datos)
- Timestamps de auditoría (created_at, updated_at) en todos los modelos
- Método de comparación e impresión seguros
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """DeclarativeBase de SQLAlchemy 2.0. Todos los modelos heredan de esta clase."""
    pass


class TimestampMixin:
    """
    Mixin que añade campos de auditoría a cualquier tabla.
    Usa timezone=True de forma explícita — nunca almacenar timestamps naive.
    server_default delega el valor inicial al motor PostgreSQL (más seguro y consistente
    en entornos con múltiples instancias del backend).
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),  # PostgreSQL genera el timestamp, no Python
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),        # Se actualiza automáticamente en cada UPDATE
        nullable=False,
    )


class UUIDPrimaryKeyMixin:
    """
    Mixin para PK de tipo UUID v4 generado por Python.
    Ventaja sobre SERIAL/BIGINT: no revela el número total de registros,
    no tiene colisiones en sharding, y es portable entre sistemas.

    Usamos uuid.uuid4() en Python (no gen_random_uuid() de PG) para
    tener el ID disponible antes del INSERT → importante para la llave de cruce.
    """

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,  # Python genera el UUID antes del INSERT
        nullable=False,
    )

    def __repr__(self) -> str:
        # Solo mostrar el tipo y los primeros 8 chars del UUID en logs
        # para no exponer IDs completos accidentalmente
        return f"<{self.__class__.__name__} id={str(self.id)[:8]}...>"
