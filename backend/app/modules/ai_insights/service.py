"""
app/modules/ai_insights/service.py
====================================
Tres análisis de IA sobre los datos del usuario:
  - Narración de biomarcadores (últimos 30 días)
  - Índice de Fatiga Acumulada / Sugerencia de Carga (antes "injury risk")
  - Micro-objetivos semanales (basado en nivel/XP/peso)

Migrado en Bloque D: usa AIRouter en lugar de llamar Groq directamente.
Los 3 endpoints usan Gemini como primario (pro para análisis, flash para goals)
con Groq como fallback.

Bloque F — Caché DB:
Antes de llamar a la IA se consulta ai_insights_cache. Si hay resultado
fresco (TTL configurable por tipo) se devuelve directamente.
TTLs: biomarker_narrative=6h, injury_risk=6h, weekly_goals=24h.
El UPSERT garantiza una sola fila por (user_id, insight_type).

Todos los fallbacks de templates se mantienen intactos — si TODOS los
providers fallan, los endpoints devuelven respuestas útiles sin IA.

PRIVACIDAD — Pipeline de anonimización (RGPD Art. 25 / AEPD):
  Antes de enviar cualquier dato a proveedores externos (Groq/Gemini),
  _build_anonymous_ai_context() filtra y mapea los datos del usuario.
  Garantías:
    ✓ NO se envía: user_id, email, display_name, health_subject_id
    ✓ NO se envía: notes_encrypted ni ningún campo de texto libre personal
    ✓ SÍ se envía: valores numéricos (peso en kg, conteos, nivel, XP)
    ✓ SÍ se envía: nombres de ejercicios (terminología fitness, no PII)
  Esta capa es explícita e independiente del schema de BD —
  aunque se añadan columnas PII al modelo, no llegan a la IA.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
import json
import logging

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.cryptoservice import CryptoService
from app.modules.ai_insights.models import AIInsightsCache
from app.modules.ai_insights.schemas import (
    BiomarkerNarratorResponse,
    InjuryRiskFlag,
    InjuryRiskResponse,
    MicroGoal,
    WeeklyGoalsResponse,
)
from app.modules.gamification.models import GamificationEvent, GamificationState
from app.modules.health.models import HealthRecord
from app.modules.routines.models import SavedRoutine
from app.services.ai_router.base import AIProviderError
from app.services.ai_router.router import AIRouter
from app.services.ai_router.schemas import AIMessage, AIRequest, AIUseCase

logger = logging.getLogger(__name__)

# ── Anonimización — RGPD Art. 25 ─────────────────────────────────────────────

def _build_anonymous_ai_context(
    *,
    weight_values_kg: list[float],
    workout_count_30d: int,
    workout_count_7d: int,
    gamification_level: int,
    gamification_xp: int,
    gamification_streak: int,
    exercise_names: list[str] | None = None,
) -> dict:
    """
    Construye el contexto que se enviará a proveedores de IA externos.

    GARANTÍAS DE PRIVACIDAD:
    - Solo acepta parámetros nombrados explícitos (no acepta dicts libres)
    - Nunca incluye: user_id, email, display_name, health_subject_id,
      notes_encrypted, ni ningún texto libre del usuario
    - Los exercise_names son términos fitness (ej. "press banca"), no PII

    Returns:
        dict con claves seguras para insertar en prompts de IA.
    """
    ctx: dict = {
        "workout_count_30d": int(workout_count_30d),
        "workout_count_7d": int(workout_count_7d),
        "gamification_level": int(gamification_level),
        "gamification_xp": int(gamification_xp),
        "gamification_streak": int(gamification_streak),
    }

    if weight_values_kg:
        # Solo valores numéricos — nunca fechas que puedan correlacionar identidad
        ctx["weight_first_kg"] = round(float(weight_values_kg[0]), 1)
        ctx["weight_last_kg"] = round(float(weight_values_kg[-1]), 1)
        ctx["weight_delta_kg"] = round(float(weight_values_kg[-1]) - float(weight_values_kg[0]), 1)
        ctx["weight_records_count"] = len(weight_values_kg)

    if exercise_names:
        # Limitar a 10 nombres, solo nombres de ejercicio (no notas del usuario)
        safe_names = [str(n)[:50] for n in exercise_names[:10] if n and isinstance(n, str)]
        ctx["exercise_names"] = safe_names

    return ctx


# ── TTLs por tipo de insight ──────────────────────────────────────────────────

_TTL_HOURS: dict[str, int] = {
    "biomarker_narrative": 6,
    "injury_risk": 6,
    "weekly_goals": 24,
}


# ── Helpers de caché ──────────────────────────────────────────────────────────

def _now_utc() -> datetime:
    return datetime.now(UTC)


async def _cache_get(
    db: AsyncSession,
    user_id: str,
    insight_type: str,
) -> dict | None:
    """
    Devuelve el resultado cacheado si existe y no ha expirado según el TTL
    del tipo de insight. None si no hay caché o está obsoleta.
    """
    ttl_hours = _TTL_HOURS.get(insight_type, 6)
    cutoff = _now_utc() - timedelta(hours=ttl_hours)

    result = await db.execute(
        select(AIInsightsCache).where(
            and_(
                AIInsightsCache.user_id == user_id,
                AIInsightsCache.insight_type == insight_type,
                AIInsightsCache.generated_at >= cutoff,
            )
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return None
    try:
        return json.loads(row.result_json)
    except json.JSONDecodeError:
        return None


async def _cache_set(
    db: AsyncSession,
    user_id: str,
    insight_type: str,
    data: dict,
) -> None:
    """
    UPSERT: actualiza la fila existente o la crea si no existe.
    Garantiza exactamente una fila por (user_id, insight_type).
    Silencia errores — si falla el caché no afecta la respuesta.
    """
    try:
        result = await db.execute(
            select(AIInsightsCache).where(
                and_(
                    AIInsightsCache.user_id == user_id,
                    AIInsightsCache.insight_type == insight_type,
                )
            )
        )
        row = result.scalar_one_or_none()
        payload = json.dumps(data, ensure_ascii=False)

        if row is not None:
            row.result_json = payload
            row.generated_at = _now_utc()
        else:
            db.add(AIInsightsCache(
                user_id=user_id,
                insight_type=insight_type,
                result_json=payload,
                generated_at=_now_utc(),
            ))
        await db.commit()
        logger.debug("ai_insights cache SET %s for user %s…", insight_type, user_id[:8])
    except Exception as exc:
        logger.warning("ai_insights cache SET failed (non-fatal): %s", exc)
        await db.rollback()


# ── DB helpers (sin cambios respecto a versión anterior) ──────────────────────

async def _resolve_health_subject(user_id: str, db: AsyncSession) -> str | None:
    crypto = CryptoService()
    try:
        subject_id = await crypto.resolve_health_subject_id(user_id, db)
        return str(subject_id)
    except Exception:
        return None


async def _get_recent_weight_records(
    db: AsyncSession, subject_id: str, days: int = 30
) -> list[HealthRecord]:
    from datetime import date
    from datetime import timedelta as td
    cutoff = date.today() - td(days=days)
    result = await db.execute(
        select(HealthRecord)
        .where(
            and_(
                HealthRecord.health_subject_id == subject_id,
                HealthRecord.recorded_date >= cutoff,
            )
        )
        .order_by(HealthRecord.recorded_date.asc())
    )
    return list(result.scalars().all())


async def _get_gamification_state(db: AsyncSession, user_id: str) -> dict:
    result = await db.execute(
        select(GamificationState).where(GamificationState.user_id == user_id)
    )
    state = result.scalar_one_or_none()
    if state:
        return {"level": state.level, "xp": state.xp_total, "streak": state.streak_days}
    return {"level": 1, "xp": 0, "streak": 0}


async def _count_workout_events(db: AsyncSession, user_id: str, days: int = 7) -> int:
    from datetime import date
    from datetime import timedelta as td
    cutoff = date.today() - td(days=days)
    result = await db.execute(
        select(func.count()).where(
            and_(
                GamificationEvent.user_id == user_id,
                GamificationEvent.action == "routine",
                GamificationEvent.created_at >= cutoff,
            )
        )
    )
    return result.scalar_one()


async def _get_saved_routines(db: AsyncSession, user_id: str) -> list[SavedRoutine]:
    result = await db.execute(
        select(SavedRoutine)
        .where(SavedRoutine.user_id == user_id)
        .order_by(SavedRoutine.created_at.desc())
        .limit(3)
    )
    return list(result.scalars().all())


# ── Biomarker Narrator ────────────────────────────────────────────────────────

async def get_biomarker_narrative(
    user_id: str,
    db: AsyncSession,
    ai_router: AIRouter,
) -> BiomarkerNarratorResponse:
    _CACHE_KEY = "biomarker_narrative"

    # ── 1. Intentar caché ─────────────────────────────────────────────────────
    cached = await _cache_get(db, user_id, _CACHE_KEY)
    if cached:
        logger.debug("ai_insights cache HIT %s for user %s…", _CACHE_KEY, user_id[:8])
        return BiomarkerNarratorResponse(**cached)

    # ── 2. Obtener datos de BD ────────────────────────────────────────────────
    subject_id    = await _resolve_health_subject(user_id, db)
    gamification  = await _get_gamification_state(db, user_id)
    workout_count = await _count_workout_events(db, user_id, days=30)

    weight_records: list[HealthRecord] = []
    if subject_id:
        weight_records = await _get_recent_weight_records(db, subject_id, days=30)

    # Fallback sin datos suficientes — sin llamada a IA
    if not weight_records and workout_count == 0:
        return BiomarkerNarratorResponse(
            narrative="Aún no tienes suficientes datos registrados. Empieza a registrar tu peso y entrenamientos para obtener un análisis personalizado.",
            trend="insufficient_data",
            highlights=["Registra tu peso diariamente", "Completa al menos 3 entrenamientos esta semana"],
        )

    weight_values = [float(r.weight_kg) for r in weight_records if r.weight_kg]

    # ── Construir contexto anonimizado — NUNCA enviar PII a la IA ────────────
    ctx = _build_anonymous_ai_context(
        weight_values_kg=weight_values,
        workout_count_30d=workout_count,
        workout_count_7d=0,
        gamification_level=gamification["level"],
        gamification_xp=gamification["xp"],
        gamification_streak=gamification["streak"],
    )

    weight_summary = ""
    if weight_values:
        weight_summary = (
            f"Peso inicial: {ctx['weight_first_kg']}kg, peso actual: {ctx['weight_last_kg']}kg, "
            f"cambio: {ctx['weight_delta_kg']:+.1f}kg en {ctx['weight_records_count']} registros.\n"
        )

    prompt = f"""Eres un analista de salud y fitness. Analiza estos datos de los últimos 30 días y genera un resumen narrativo conciso.

{weight_summary}Entrenamientos completados este mes: {ctx['workout_count_30d']}
Nivel en la app: {ctx['gamification_level']}, racha: {ctx['gamification_streak']} días

Responde EXACTAMENTE en este formato JSON (sin bloques de código):
{{
  "narrative": "3-4 frases en español describiendo el progreso del usuario de forma motivadora y honesta",
  "trend": "improving" o "declining" o "stable" o "insufficient_data",
  "highlights": ["punto clave 1", "punto clave 2", "punto clave 3"]
}}"""

    # ── 3. Llamar a la IA ─────────────────────────────────────────────────────
    raw: str | None = None
    try:
        response = await ai_router.call(
            use_case=AIUseCase.INSIGHTS_NARRATIVE,
            request=AIRequest(
                messages=[AIMessage(role="user", content=prompt)],
                max_tokens=250,
                temperature=0.5,
                timeout_s=10.0,
                response_format="json_object",
            ),
            user_id=user_id,
        )
        raw = response.content
    except AIProviderError as exc:
        logger.warning("insights narrative AIProviderError, usando fallback: %s", exc)

    if raw:
        try:
            data = json.loads(raw)
            result = BiomarkerNarratorResponse(
                narrative=data.get("narrative", ""),
                trend=data.get("trend", "stable"),
                highlights=data.get("highlights", []),
            )
            # ── 4. Guardar en caché ───────────────────────────────────────────
            await _cache_set(db, user_id, _CACHE_KEY, result.model_dump())
            return result
        except (json.JSONDecodeError, KeyError):
            pass

    # ── 5. Fallback de templates ──────────────────────────────────────────────
    if weight_values:
        delta = weight_values[-1] - weight_values[0]
        trend = "declining" if delta > 0.5 else ("improving" if delta < -0.5 else "stable")
    else:
        trend = "stable"

    return BiomarkerNarratorResponse(
        narrative=f"Has completado {workout_count} entrenamientos este mes. ¡Sigue con la consistencia!",
        trend=trend,
        highlights=[
            f"{workout_count} entrenamientos este mes",
            f"Racha actual: {gamification['streak']} días",
            f"Nivel {gamification['level']}",
        ],
    )


# ── Injury Risk ───────────────────────────────────────────────────────────────

async def get_injury_risk(
    user_id: str,
    db: AsyncSession,
    ai_router: AIRouter,
) -> InjuryRiskResponse:
    _CACHE_KEY = "injury_risk"

    # ── 1. Intentar caché ─────────────────────────────────────────────────────
    cached = await _cache_get(db, user_id, _CACHE_KEY)
    if cached:
        logger.debug("ai_insights cache HIT %s for user %s…", _CACHE_KEY, user_id[:8])
        flags = [InjuryRiskFlag(**f) for f in cached.get("risk_flags", [])]
        return InjuryRiskResponse(
            risk_flags=flags,
            overall_risk=cached.get("overall_risk", "low"),
            summary=cached.get("summary", ""),
        )

    # ── 2. Obtener datos de BD ────────────────────────────────────────────────
    routines            = await _get_saved_routines(db, user_id)
    workouts_this_week  = await _count_workout_events(db, user_id, days=7)

    if not routines:
        return InjuryRiskResponse(
            risk_flags=[],
            overall_risk="low",
            summary="Sin datos de rutinas para analizar. Registra tus entrenamientos para obtener análisis de riesgo.",
        )

    latest_json: dict = {}
    try:
        latest_json = json.loads(routines[0].routine_json)
    except (json.JSONDecodeError, AttributeError):
        pass

    sessions = latest_json.get("sessions", [])
    raw_exercise_names: list[str] = []
    for s in sessions:
        for ex in s.get("exercises", []):
            raw_exercise_names.append(ex.get("name", ""))

    # ── Construir contexto anonimizado — NUNCA enviar PII a la IA ────────────
    ctx = _build_anonymous_ai_context(
        weight_values_kg=[],
        workout_count_30d=0,
        workout_count_7d=workouts_this_week,
        gamification_level=0,
        gamification_xp=0,
        gamification_streak=0,
        exercise_names=raw_exercise_names,
    )
    exercise_summary = ", ".join(ctx.get("exercise_names", [])) or "rutina genérica"

    prompt = f"""Eres un especialista en readaptación deportiva. Analiza este plan de entrenamiento y evalúa la carga acumulada.

Ejercicios en la rutina: {exercise_summary}
Entrenamientos esta semana: {ctx['workout_count_7d']} de 7 días

Responde EXACTAMENTE en este formato JSON (sin bloques de código):
{{
  "risk_flags": [
    {{"muscle_group": "nombre", "risk_level": "low|medium|high", "detail": "qué observas", "recommendation": "qué hacer"}}
  ],
  "overall_risk": "low" o "medium" o "high",
  "summary": "1-2 frases resumiendo el estado general"
}}

Máximo 3 risk_flags. Si no hay riesgos claros, devuelve risk_flags vacío con overall_risk "low"."""

    # ── 3. Llamar a la IA ─────────────────────────────────────────────────────
    raw: str | None = None
    try:
        response = await ai_router.call(
            use_case=AIUseCase.INJURY_RISK,
            request=AIRequest(
                messages=[AIMessage(role="user", content=prompt)],
                max_tokens=300,
                temperature=0.5,
                timeout_s=10.0,
                response_format="json_object",
            ),
            user_id=user_id,
        )
        raw = response.content
    except AIProviderError as exc:
        logger.warning("injury risk AIProviderError, usando fallback: %s", exc)

    if raw:
        try:
            data = json.loads(raw)
            flags = [
                InjuryRiskFlag(
                    muscle_group=f.get("muscle_group", ""),
                    risk_level=f.get("risk_level", "low"),
                    detail=f.get("detail", ""),
                    recommendation=f.get("recommendation", ""),
                )
                for f in data.get("risk_flags", [])[:3]
            ]
            result = InjuryRiskResponse(
                risk_flags=flags,
                overall_risk=data.get("overall_risk", "low"),
                summary=data.get("summary", ""),
            )
            # ── 4. Guardar en caché ───────────────────────────────────────────
            await _cache_set(db, user_id, _CACHE_KEY, result.model_dump())
            return result
        except (json.JSONDecodeError, KeyError):
            pass

    # ── 5. Fallback de templates ──────────────────────────────────────────────
    risk = "high" if workouts_this_week >= 6 else ("medium" if workouts_this_week >= 4 else "low")
    return InjuryRiskResponse(
        risk_flags=[],
        overall_risk=risk,
        summary=f"Con {workouts_this_week} entrenamientos esta semana, asegúrate de incluir días de descanso.",
    )


# ── Weekly Goals ──────────────────────────────────────────────────────────────

async def get_weekly_goals(
    user_id: str,
    db: AsyncSession,
    ai_router: AIRouter,
) -> WeeklyGoalsResponse:
    _CACHE_KEY = "weekly_goals"

    # ── 1. Intentar caché ─────────────────────────────────────────────────────
    cached = await _cache_get(db, user_id, _CACHE_KEY)
    if cached:
        logger.debug("ai_insights cache HIT %s for user %s…", _CACHE_KEY, user_id[:8])
        goals = [MicroGoal(**g) for g in cached.get("goals", [])]
        return WeeklyGoalsResponse(
            goals=goals,
            week_summary=cached.get("week_summary", ""),
        )

    # ── 2. Obtener datos de BD ────────────────────────────────────────────────
    gamification  = await _get_gamification_state(db, user_id)
    workout_count = await _count_workout_events(db, user_id, days=7)
    subject_id    = await _resolve_health_subject(user_id, db)

    weight_records: list[HealthRecord] = []
    if subject_id:
        weight_records = await _get_recent_weight_records(db, subject_id, days=14)

    weight_str = ""
    if weight_records:
        weights = [float(r.weight_kg) for r in weight_records if r.weight_kg]
        if weights:
            weight_str = f"Peso reciente: {weights[-1]}kg. "

    prompt = f"""Eres un coach de fitness personal. Genera 3 micro-objetivos específicos y alcanzables para esta semana.

Datos del usuario:
- Nivel: {gamification['level']}, XP total: {gamification['xp']}
- Racha actual: {gamification['streak']} días
- Entrenamientos la semana pasada: {workout_count}
- {weight_str}

Responde EXACTAMENTE en este formato JSON (sin bloques de código):
{{
  "goals": [
    {{"goal": "objetivo concreto en español", "reasoning": "por qué este objetivo ahora", "category": "weight|training|nutrition|recovery"}},
    {{"goal": "...", "reasoning": "...", "category": "..."}},
    {{"goal": "...", "reasoning": "...", "category": "..."}}
  ],
  "week_summary": "1 frase motivadora para esta semana"
}}"""

    # ── 3. Llamar a la IA ─────────────────────────────────────────────────────
    raw: str | None = None
    try:
        response = await ai_router.call(
            use_case=AIUseCase.WEEKLY_GOALS,
            request=AIRequest(
                messages=[AIMessage(role="user", content=prompt)],
                max_tokens=300,
                temperature=0.5,
                timeout_s=10.0,
                response_format="json_object",
            ),
            user_id=user_id,
        )
        raw = response.content
    except AIProviderError as exc:
        logger.warning("weekly goals AIProviderError, usando fallback: %s", exc)

    if raw:
        try:
            data = json.loads(raw)
            goals = [
                MicroGoal(
                    goal=g.get("goal", ""),
                    reasoning=g.get("reasoning", ""),
                    category=g.get("category", "training"),
                )
                for g in data.get("goals", [])[:3]
            ]
            result = WeeklyGoalsResponse(
                goals=goals,
                week_summary=data.get("week_summary", ""),
            )
            # ── 4. Guardar en caché ───────────────────────────────────────────
            await _cache_set(db, user_id, _CACHE_KEY, result.model_dump())
            return result
        except (json.JSONDecodeError, KeyError):
            pass

    # ── 5. Fallback de templates ──────────────────────────────────────────────
    default_goals = [
        MicroGoal(goal="Completa 3 entrenamientos esta semana", reasoning="La consistencia es la base del progreso", category="training"),
        MicroGoal(goal="Registra tu peso cada mañana", reasoning="El seguimiento es clave para ajustar el plan", category="weight"),
        MicroGoal(goal="Duerme al menos 7 horas cada noche", reasoning="El descanso es donde ocurre la recuperación muscular", category="recovery"),
    ]
    return WeeklyGoalsResponse(
        goals=default_goals,
        week_summary="¡Esta semana, la constancia marca la diferencia!",
    )
