# backend/app/modules/ranked/models.py
"""
Ranked system — LP engine con dos colas (Normal / Competitivo).

Tiers Normal (journey): novato | regular | constante | comprometido |
                        veterano | forjado | elite | leyenda
Tiers Competitivo (perf): calentando | amateur | semipro | bestia |
                          titan | fenomeno | invicto | apex

Cada tier tiene 4 divisiones (1-4) excepto 'leyenda' y 'apex' (division=None).
"""
from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.shared.base_model import Base

TIERS_NORMAL = [
    "novato", "regular", "constante", "comprometido",
    "veterano", "forjado", "elite", "leyenda",
]
TIERS_COMPETITIVE = [
    "calentando", "amateur", "semipro", "bestia",
    "titan", "fenomeno", "invicto", "apex",
]
MAX_LP_PER_WEEK = 60   # anti-spam: máx LP por cola en 7 días
TOP_TIER_NORMAL = "leyenda"
TOP_TIER_COMPETITIVE = "apex"


class RankedProfile(Base):
    __tablename__ = "ranked_profiles"
    __table_args__ = (
        UniqueConstraint("user_id", "queue", name="uq_ranked_user_queue"),
        {"schema": "public", "comment": "Estado de ranking del usuario por cola."},
    )

    id       = Column(Integer, primary_key=True, autoincrement=True)
    user_id  = Column(UUID(as_uuid=True), ForeignKey("public.users.id", ondelete="CASCADE"), nullable=False, index=True)
    queue    = Column(String(20), nullable=False)      # 'normal' | 'competitive'
    season   = Column(Integer, nullable=False, default=1)
    tier     = Column(String(20), nullable=False)      # e.g. 'comprometido'
    division = Column(Integer, nullable=True)          # 1-4; None en tier máximo
    lp       = Column(Integer, nullable=False, default=0)
    peak_tier      = Column(String(20), nullable=False)
    peak_division  = Column(Integer, nullable=True)
    prev_season_tier = Column(String(20), nullable=True)
    lp_week        = Column(Integer, nullable=False, default=0)
    lp_week_reset  = Column(DateTime(timezone=True), nullable=True)
    competitive_unlocked = Column(Boolean, default=False, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class RankedEvent(Base):
    __tablename__ = "ranked_events"
    __table_args__ = (
        {"schema": "public", "comment": "Log inmutable de cambios LP. Nunca se actualiza."},
    )

    id       = Column(Integer, primary_key=True, autoincrement=True)
    user_id  = Column(UUID(as_uuid=True), ForeignKey("public.users.id", ondelete="CASCADE"), nullable=False, index=True)
    queue    = Column(String(20), nullable=False)
    season   = Column(Integer, nullable=False)
    event_type  = Column(String(30), nullable=False)
    lp_delta    = Column(Integer, nullable=False)
    lp_after    = Column(Integer, nullable=False)
    tier_after  = Column(String(20), nullable=False)
    div_after   = Column(Integer, nullable=True)
    meta        = Column(JSONB, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())


class RankedSeason(Base):
    __tablename__ = "ranked_seasons"
    __table_args__ = (
        {"schema": "public", "comment": "Temporadas del sistema de rankeds."},
    )

    id          = Column(Integer, primary_key=True, autoincrement=True)
    season      = Column(Integer, nullable=False, unique=True)
    start_date  = Column(Date, nullable=False)
    end_date    = Column(Date, nullable=False)
    closed      = Column(Boolean, default=False, nullable=False)
