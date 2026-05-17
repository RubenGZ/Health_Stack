"""
app/modules/ai_insights/models.py
===================================
Caché de respuestas de IA para los tres endpoints de insights.

Evita llamadas redundantes cuando el usuario recarga la página o entra
varias veces al día. El service lee de aquí antes de llamar a Groq/Gemini.

TTLs (definidos en service.py, no aquí):
  biomarker_narrative  6h  — puede cambiar con nuevos registros de peso
  injury_risk          6h  — puede cambiar con nuevos entrenamientos
  weekly_goals        24h  — objetivos semanales, no cambian con frecuencia

La tabla usa ON CONFLICT DO UPDATE (UPSERT) para mantener exactamente
una fila por (user_id, insight_type) — sin crecer sin límite.
"""

from __future__ import annotations

from datetime import datetime
import uuid

from sqlalchemy import DateTime, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import Base


class AIInsightsCache(Base):
    __tablename__ = "ai_insights_cache"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    insight_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # 'biomarker_narrative' | 'injury_risk' | 'weekly_goals'
    result_json: Mapped[str] = mapped_column(Text, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "insight_type",
            name="uq_ai_insights_cache_user_type",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<AIInsightsCache user={self.user_id[:8]} "
            f"type={self.insight_type} "
            f"at={self.generated_at.isoformat()[:16]}>"
        )
