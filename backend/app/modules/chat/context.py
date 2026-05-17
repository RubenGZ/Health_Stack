"""
app/modules/chat/context.py
============================
Construye el bloque de contexto del usuario para el system prompt del chat.

Cuando el usuario está autenticado (JWT válido), el chatbot recibe un bloque
[CONTEXTO DEL USUARIO] con datos reales: nivel/XP, racha, peso reciente y
última rutina. Esto permite respuestas personalizadas sin que el usuario
tenga que repetir su situación en cada conversación.

Diseño:
- 3 queries en paralelo con asyncio.gather (< 150ms añadido)
- Nunca lanza excepciones hacia afuera — devuelve None si algo falla
- Los datos son read-only y efímeros: no se persisten ni se logean
- RGPD: weight_kg sale de health_records (vía health_subject_id opaco)

Uso en router.py:
    context_block = await build_user_context(user_id, db)
    if context_block:
        system_prompt = context_block + "\n\n" + _BASE_SYSTEM_PROMPT
    else:
        system_prompt = _BASE_SYSTEM_PROMPT
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.cryptoservice import CryptoService
from app.modules.gamification.models import GamificationState
from app.modules.health.models import HealthRecord
from app.modules.routines.models import SavedRoutine

logger = logging.getLogger(__name__)


# ── Queries individuales ──────────────────────────────────────────────────────

async def _fetch_gamification(db: AsyncSession, user_id: str) -> dict | None:
    """Level, XP total y racha de días del usuario."""
    try:
        result = await db.execute(
            select(GamificationState).where(
                GamificationState.user_id == user_id
            )
        )
        state = result.scalar_one_or_none()
        if state is None:
            return None
        return {
            "level": state.level,
            "xp_total": state.xp_total,
            "streak_days": state.streak_days,
        }
    except Exception as exc:
        logger.debug("chat_context: gamification fetch failed — %s", exc)
        return None


async def _fetch_recent_weights(
    db: AsyncSession, user_id: str, days: int = 7
) -> list[float]:
    """
    Devuelve los pesos de los últimos `days` días, en orden ascendente.
    Usa health_subject_id para cumplir RGPD (aislamiento de identidad).
    """
    try:
        crypto = CryptoService()
        subject_id = await crypto.resolve_health_subject_id(user_id, db)
        cutoff = date.today() - timedelta(days=days)
        result = await db.execute(
            select(HealthRecord)
            .where(
                and_(
                    HealthRecord.health_subject_id == str(subject_id),
                    HealthRecord.recorded_date >= cutoff,
                    HealthRecord.weight_kg.is_not(None),
                )
            )
            .order_by(HealthRecord.recorded_date.asc())
        )
        records = list(result.scalars().all())
        return [r.weight_kg for r in records if r.weight_kg is not None]
    except Exception as exc:
        logger.debug("chat_context: weight fetch failed — %s", exc)
        return []


async def _fetch_last_routine(
    db: AsyncSession, user_id: str
) -> dict | None:
    """Nombre y fecha de la última rutina guardada."""
    try:
        result = await db.execute(
            select(SavedRoutine)
            .where(SavedRoutine.user_id == user_id)
            .order_by(SavedRoutine.created_at.desc())
            .limit(1)
        )
        routine = result.scalar_one_or_none()
        if routine is None:
            return None
        days_ago = (date.today() - routine.created_at.date()).days
        return {
            "label": routine.label,
            "days_ago": days_ago,
        }
    except Exception as exc:
        logger.debug("chat_context: routine fetch failed — %s", exc)
        return None


# ── Builder principal ─────────────────────────────────────────────────────────

async def build_user_context(user_id: str, db: AsyncSession) -> str | None:
    """
    Construye el bloque [CONTEXTO DEL USUARIO] para el system prompt.

    Lanza las 3 queries en paralelo y formatea el resultado.
    Si todas fallan o no hay datos relevantes, devuelve None
    (el chat funciona sin contexto, como usuario anónimo).

    Args:
        user_id: UUID del usuario autenticado (str).
        db: Sesión de base de datos async.

    Returns:
        String con el bloque de contexto, o None si no hay datos útiles.
    """
    gami, weights, routine = await asyncio.gather(
        _fetch_gamification(db, user_id),
        _fetch_recent_weights(db, user_id),
        _fetch_last_routine(db, user_id),
        return_exceptions=False,
    )

    # Si no hay absolutamente nada → sin contexto
    if not gami and not weights and not routine:
        return None

    lines: list[str] = ["[CONTEXTO DEL USUARIO — usa esto para personalizar tu respuesta]"]

    if gami:
        streak_txt = f" | Racha: {gami['streak_days']} días" if gami["streak_days"] > 0 else ""
        lines.append(
            f"• Nivel: {gami['level']} | XP total: {gami['xp_total']:,}{streak_txt}"
        )

    if weights:
        if len(weights) == 1:
            lines.append(f"• Peso registrado (7d): {weights[0]:.1f} kg")
        else:
            trend_arrow = ""
            diff = weights[-1] - weights[0]
            if diff < -0.3:
                trend_arrow = " ↓ bajando"
            elif diff > 0.3:
                trend_arrow = " ↑ subiendo"
            else:
                trend_arrow = " → estable"
            weights_str = " → ".join(f"{w:.1f}" for w in weights)
            lines.append(f"• Peso (7d): {weights_str} kg{trend_arrow}")

    if routine:
        when = "hoy" if routine["days_ago"] == 0 else (
            "ayer" if routine["days_ago"] == 1 else f"hace {routine['days_ago']} días"
        )
        lines.append(f"• Última rutina guardada: «{routine['label']}» ({when})")

    return "\n".join(lines)
