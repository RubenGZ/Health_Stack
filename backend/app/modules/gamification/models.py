"""
app/modules/Gamification/models.py
=====================================
Modelo SQLAlchemy para el estado de gamificación de cada usuario.

Diseño: una sola fila por usuario (upsert) en lugar de event log.
Esto permite lecturas O(1) pero pierde el historial granular de eventos.
Para una versión futura se puede añadir una tabla de eventos.

RGPD: Datos funcionales (no categoría especial Art. 9).
      CASCADE DELETE desde users.id.
"""

from __future__ import annotations

import uuid

from sqlalchemy import BigInteger, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import Base, TimestampMixin, UUIDPrimaryKeyMixin

# Tabla de puntos XP por acción
XP_TABLE: dict[str, int] = {
    "weight":   10,    # Registro de peso
    "tdee":     15,    # Cálculo TDEE
    "routine":  20,    # Rutina guardada
    "post":      5,    # Post en comunidad
    "recipe":   10,    # Receta creada
    "streak":   25,    # Racha de 7 días
}


class GamificationState(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Tabla `gamification_states` — Estado acumulado de gamificación por usuario.
    Una sola fila por usuario. FK UNIQUE sobre user_id.
    """

    __tablename__ = "gamification_states"
    __table_args__ = {
        "schema": "public",
        "comment": "Estado de gamificación: XP, nivel, contadores de acciones.",
    }

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("public.users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    xp_total: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        server_default="0",
        comment="XP total acumulada.",
    )

    level: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="1",
        comment="Nivel calculado a partir del XP.",
    )

    weight_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="0",
        comment="Número de registros de peso.",
    )

    routine_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="0",
        comment="Número de rutinas guardadas.",
    )

    post_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="0",
        comment="Número de posts publicados.",
    )

    tdee_calc: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="0",
        comment="Número de veces que calculó TDEE.",
    )

    streak_days: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="0",
        comment="Racha actual de días consecutivos activo.",
    )

    badge_latest: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        comment="Último badge desbloqueado (slug).",
    )

    def __repr__(self) -> str:
        return (
            f"<GamificationState user={str(self.user_id)[:8]}... "
            f"level={self.level} xp={self.xp_total}>"
        )
