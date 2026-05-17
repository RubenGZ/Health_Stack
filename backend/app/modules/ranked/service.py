# backend/app/modules/ranked/service.py
"""Motor de LP para el sistema de rankeds. Soporta colas Normal y Competitivo."""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ranked.models import (
    TIERS_COMPETITIVE,
    TIERS_NORMAL,
    TOP_TIER_COMPETITIVE,
    TOP_TIER_NORMAL,
    RankedEvent,
    RankedProfile,
)

# ── Helpers de tier ───────────────────────────────────────────────────────────

def tier_index(queue: str, tier: str) -> int:
    tiers = TIERS_NORMAL if queue == "normal" else TIERS_COMPETITIVE
    return tiers.index(tier) if tier in tiers else 0


def is_top_tier(queue: str, tier: str) -> bool:
    top = TOP_TIER_NORMAL if queue == "normal" else TOP_TIER_COMPETITIVE
    return tier == top


def tier_at_index(queue: str, idx: int) -> str:
    tiers = TIERS_NORMAL if queue == "normal" else TIERS_COMPETITIVE
    return tiers[max(0, min(idx, len(tiers) - 1))]


# ── Obtener o crear perfil ────────────────────────────────────────────────────

async def get_or_create_profile(
    db: AsyncSession, user_id: uuid.UUID, queue: str, season: int = 1
) -> RankedProfile:
    result = await db.execute(
        select(RankedProfile).where(
            RankedProfile.user_id == user_id,
            RankedProfile.queue == queue,
        )
    )
    profile = result.scalar_one_or_none()
    if profile:
        return profile

    tier = TIERS_NORMAL[0] if queue == "normal" else TIERS_COMPETITIVE[0]
    profile = RankedProfile(
        user_id=user_id, queue=queue, season=season,
        tier=tier, division=4, lp=0,
        peak_tier=tier, peak_division=4,
        competitive_unlocked=False,  # se activa al alcanzar "comprometido" en normal
    )
    db.add(profile)
    await db.flush()
    return profile


# ── Aplicar delta de LP ───────────────────────────────────────────────────────

async def apply_lp_delta(
    db: AsyncSession,
    profile: RankedProfile,
    delta: int,
    event_type: str,
    meta: dict | None = None,
) -> dict:
    """
    Aplica delta de LP al perfil con lógica de promoción/descenso.
    Devuelve { promoted, demoted, tier_before, tier_after, div_before, div_after, lp_after }.
    """
    if is_top_tier(profile.queue, profile.tier):
        profile.lp = max(0, profile.lp + delta)
        await _log_event(db, profile, event_type, delta, meta)
        await db.flush()
        return {"promoted": False, "demoted": False, "tier_after": profile.tier, "lp_after": profile.lp}

    tier_before = profile.tier
    div_before  = profile.division

    profile.lp += delta
    promoted = demoted = False

    # Promoción
    if profile.lp >= 100:
        idx = tier_index(profile.queue, profile.tier)
        if profile.division and profile.division > 1:
            profile.division -= 1
            profile.lp = 0
        else:
            next_idx = idx + 1
            tiers = TIERS_NORMAL if profile.queue == "normal" else TIERS_COMPETITIVE
            if next_idx < len(tiers):
                profile.tier = tiers[next_idx]
                profile.division = None if is_top_tier(profile.queue, profile.tier) else 4
                profile.lp = 0
                promoted = True
                # Actualizar peak
                if tier_index(profile.queue, profile.tier) > tier_index(profile.queue, profile.peak_tier):
                    profile.peak_tier = profile.tier
                    profile.peak_division = profile.division
                # Desbloquear competitivo si llega a Comprometido en Normal
                if profile.queue == "normal" and profile.tier == "comprometido":
                    profile.competitive_unlocked = True

    # Descenso
    elif profile.lp < 0:
        if profile.division and profile.division < 4:
            profile.division += 1
            profile.lp = 75
        else:
            idx = tier_index(profile.queue, profile.tier)
            if idx > 0:
                profile.tier = tier_at_index(profile.queue, idx - 1)
                profile.division = 1
                profile.lp = 75
                demoted = True
            else:
                profile.lp = 0

    await _log_event(db, profile, event_type, delta, meta)
    await db.flush()
    return {
        "promoted": promoted, "demoted": demoted,
        "tier_before": tier_before, "div_before": div_before,
        "tier_after": profile.tier, "div_after": profile.division,
        "lp_after": profile.lp,
    }


async def _log_event(
    db: AsyncSession, profile: RankedProfile, event_type: str, delta: int, meta: dict | None
) -> None:
    event = RankedEvent(
        user_id=profile.user_id,
        queue=profile.queue,
        season=profile.season,
        event_type=event_type,
        lp_delta=delta,
        lp_after=profile.lp,
        tier_after=profile.tier,
        div_after=profile.division,
        meta=meta,
    )
    db.add(event)


# ── Puntuación por sesión ─────────────────────────────────────────────────────

async def process_workout_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    session_data: dict,
    season: int = 1,
) -> dict:
    """
    session_data = {
      total_volume_kg: float,
      personal_avg_volume: float | None,
      muscle_groups: list[str],
      prs: list[{ exercise_key, old_1rm, new_1rm }],
      streak_days: int,
    }
    Devuelve { normal: {...}, competitive: {...} }
    """
    normal_profile = await get_or_create_profile(db, user_id, "normal", season)
    comp_profile   = await get_or_create_profile(db, user_id, "competitive", season)

    results = {}

    # ── Cola Normal ───────────────────────────────────────────────────────────
    normal_lp = 8
    muscle_groups = session_data.get("muscle_groups", [])
    if len(set(muscle_groups)) >= 3:
        normal_lp += 4
    streak = session_data.get("streak_days", 0)
    if streak >= 7:
        normal_lp += 20
    elif streak >= 3:
        normal_lp += 12

    results["normal"] = await apply_lp_delta(
        db, normal_profile, normal_lp, "session_lp",
        meta={"muscle_groups": muscle_groups, "streak_days": streak},
    )

    # ── Cola Competitivo ──────────────────────────────────────────────────────
    # El competitivo se desbloquea cuando el perfil normal llega a "comprometido".
    # apply_lp_delta ya habrá marcado normal_profile.competitive_unlocked=True
    # si la sesión de hoy provocó la promoción a comprometido.
    comp_unlocked = normal_profile.competitive_unlocked
    if not comp_unlocked:
        results["competitive"] = {"locked": True}
    else:
        # Asegurar que el perfil competitivo también queda marcado (visible en GET /profile)
        if not comp_profile.competitive_unlocked:
            comp_profile.competitive_unlocked = True
        comp_lp = 0
        prs = session_data.get("prs", [])
        if prs:
            comp_lp += 15 * len(prs)

        vol = session_data.get("total_volume_kg", 0)
        avg = session_data.get("personal_avg_volume")
        if avg and avg > 0:
            ratio = vol / avg
            if ratio >= 1.2:
                comp_lp += 18
            elif ratio >= 1.0:
                comp_lp += 10

        meta = {"prs": prs, "volume_kg": vol, "avg_volume": avg}
        results["competitive"] = await apply_lp_delta(
            db, comp_profile, comp_lp, "session_lp" if not prs else "pr_lp", meta=meta,
        )

    await db.commit()
    return results
