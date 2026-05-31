"""
app/core/scheduler.py
======================
APScheduler in-process scheduler for periodic AI insights jobs.

Jobs:
  - weekly_insights_job: Monday 08:00 UTC — refreshes AI insights for all active users
  - daily_narrative_job: Every day 07:00 UTC — biomarker narrative for users with new data

The scheduler uses AsyncIOScheduler so all jobs run inside the same async event loop
as the FastAPI application. This avoids creating separate threads and keeps the
DB session lifecycle consistent.
"""

from __future__ import annotations

from datetime import UTC, datetime
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.modules.identity.models import User

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def _acquire_job_lock(job_id: str, ttl_seconds: int) -> bool:
    """
    Acquires a Redis SET NX lock so only one uvicorn worker runs each job.
    Returns True if this worker got the lock (or Redis is unavailable — fail open).
    On Pi/dev the redis_url points to localhost so we skip the lock entirely.
    """
    cfg = get_settings()
    url = cfg.redis_url
    if not url or "localhost" in url or "127.0.0.1" in url:
        return True  # no Redis available → run unconditionally (single-worker envs)
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(url, socket_connect_timeout=2)
        acquired = await r.set(f"scheduler_lock:{job_id}", "1", nx=True, ex=ttl_seconds)
        await r.aclose()
        return bool(acquired)
    except Exception as exc:
        logger.warning("[Scheduler] Redis lock unavailable, running job anyway: %s", exc)
        return True  # fail open — better to run twice than skip


# ── Job functions ─────────────────────────────────────────────────────────────

async def _get_active_user_ids(session_factory: async_sessionmaker) -> list[str]:
    """Returns user IDs for all active, GDPR-consented users."""
    async with session_factory() as session:
        result = await session.execute(
            select(User.id).where(
                User.is_active.is_(True),
                User.consent_gdpr.is_(True),
            )
        )
        return [str(row[0]) for row in result.all()]


async def weekly_insights_job() -> None:
    """
    Monday 08:00 UTC — Pre-computes weekly goals and injury risk for active users.
    Results are NOT stored (on-demand endpoints handle storage via frontend cache).
    This job exists to warm the backend cache and log any users with high injury risk.
    """
    if not await _acquire_job_lock("weekly_insights", ttl_seconds=7200):
        logger.info("[Scheduler] weekly_insights_job skipped — another worker holds the lock")
        return

    cfg = get_settings()
    logger.info("[Scheduler] weekly_insights_job started — %s", datetime.now(UTC).isoformat())

    if not cfg.grok_api_key:
        logger.warning("[Scheduler] GROK_API_KEY not set — skipping weekly insights job")
        return

    engine = create_async_engine(cfg.database_url, echo=False, pool_size=2)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    try:
        user_ids = await _get_active_user_ids(session_factory)
        logger.info("[Scheduler] weekly_insights_job — %d active users to process", len(user_ids))

        processed = 0
        high_risk_count = 0

        from app.modules.ai_insights.service import get_injury_risk
        from app.services.ai_router.config import AIRouterSettings
        from app.services.ai_router.providers.cerebras import CerebrasProvider
        from app.services.ai_router.providers.gemini import GeminiProvider
        from app.services.ai_router.providers.groq import GroqProvider
        from app.services.ai_router.router import AIRouter

        ai_settings = AIRouterSettings()
        ai_router = AIRouter(settings=ai_settings, providers={
            "groq":     GroqProvider(ai_settings.get_groq_key()),
            "gemini":   GeminiProvider(ai_settings.get_gemini_key()),
            "cerebras": CerebrasProvider(ai_settings.get_cerebras_key()),
        })

        async with session_factory() as session:
            for user_id in user_ids:
                try:
                    risk = await get_injury_risk(user_id, session, ai_router)
                    if risk.overall_risk == "high":
                        high_risk_count += 1
                        logger.warning(
                            "[Scheduler] High injury risk detected for user %s: %s",
                            user_id[:8], risk.summary,
                        )
                    processed += 1
                except Exception as exc:
                    logger.error("[Scheduler] Error processing user %s: %s", user_id[:8], exc)

        logger.info(
            "[Scheduler] weekly_insights_job completed — %d processed, %d high-risk",
            processed, high_risk_count,
        )
    finally:
        await engine.dispose()


async def daily_narrative_job() -> None:
    """
    Daily 07:00 UTC — Logs biomarker narrative health for monitoring.
    Lightweight: only runs for users with health records in the last 7 days.
    """
    if not await _acquire_job_lock("daily_narrative", ttl_seconds=3600):
        logger.info("[Scheduler] daily_narrative_job skipped — another worker holds the lock")
        return

    logger.info("[Scheduler] daily_narrative_job started — %s", datetime.now(UTC).isoformat())

    cfg = get_settings()
    if not cfg.grok_api_key:
        return

    engine = create_async_engine(cfg.database_url, echo=False, pool_size=2)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    try:
        user_ids = await _get_active_user_ids(session_factory)
        logger.info("[Scheduler] daily_narrative_job — %d active users", len(user_ids))
    finally:
        await engine.dispose()


async def cleanup_job() -> None:
    """
    Daily 03:00 UTC — Limpia filas expiradas/obsoletas que ya no son necesarias.

    Qué borra (SEGURO — nunca afecta datos activos ni stats del usuario):
      - refresh_tokens:         revocados u expirados hace > 1 día
      - password_reset_tokens:  expirados o usados hace > 1 día
      - workout_ai_plans:       expirados + ya usados (inmediato)
                                expirados hace > 7 días aunque no usados
      - page_views:             registros > 90 días (telemetría vieja)

    Qué NO borra:
      - gamification_events   — historial de XP del usuario (sus stats)
      - health_records        — datos de salud (solo el usuario puede borrar, RGPD Art. 17)
      - workout_sessions      — historial de entrenos (stats del gimnasio)
      - ai_insights_cache     — UPSERT ya gestiona el tamaño (1 fila por user+type)
    """
    if not await _acquire_job_lock("cleanup", ttl_seconds=3600):
        logger.info("[Scheduler] cleanup_job skipped — another worker holds the lock")
        return

    logger.info("[Scheduler] cleanup_job started — %s", datetime.now(UTC).isoformat())

    cfg = get_settings()
    engine = create_async_engine(cfg.database_url, echo=False, pool_size=2)

    try:
        from sqlalchemy import text
        async with engine.begin() as conn:
            # ── refresh_tokens: revocados u expirados > 1 día ────────────────
            r_tokens = await conn.execute(text("""
                DELETE FROM public.refresh_tokens
                WHERE (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '1 day')
                   OR expires_at < NOW() - INTERVAL '1 day'
            """))

            # ── password_reset_tokens: expirados o ya usados > 1 día ─────────
            r_pwd = await conn.execute(text("""
                DELETE FROM public.password_reset_tokens
                WHERE expires_at < NOW() - INTERVAL '1 day'
                   OR (used_at IS NOT NULL AND used_at < NOW() - INTERVAL '1 day')
            """))

            # ── workout_ai_plans: usados + expirados (borrar inmediato) ──────
            r_plans_used = await conn.execute(text("""
                DELETE FROM public.workout_ai_plans
                WHERE used = TRUE AND expires_at < NOW()
            """))

            # ── workout_ai_plans: sin usar pero expirados > 7 días ───────────
            r_plans_stale = await conn.execute(text("""
                DELETE FROM public.workout_ai_plans
                WHERE used = FALSE AND expires_at < NOW() - INTERVAL '7 days'
            """))

            # ── page_views: > 90 días ────────────────────────────────────────
            r_pv = await conn.execute(text("""
                DELETE FROM public.page_views
                WHERE created_at < NOW() - INTERVAL '90 days'
            """))

        total = (r_tokens.rowcount + r_pwd.rowcount +
                 r_plans_used.rowcount + r_plans_stale.rowcount + r_pv.rowcount)
        logger.info(
            "[Scheduler] cleanup_job completed — %d rows deleted "
            "(tokens: %d, pwd_reset: %d, ai_plans_used: %d, ai_plans_stale: %d, page_views: %d)",
            total,
            r_tokens.rowcount, r_pwd.rowcount,
            r_plans_used.rowcount, r_plans_stale.rowcount,
            r_pv.rowcount,
        )
    except Exception as exc:
        logger.error("[Scheduler] cleanup_job failed: %s", exc)
    finally:
        await engine.dispose()


# ── Scheduler lifecycle ───────────────────────────────────────────────────────

def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(timezone="UTC")

        # Monday 08:00 UTC — weekly goals + injury risk
        _scheduler.add_job(
            weekly_insights_job,
            trigger=CronTrigger(day_of_week="mon", hour=8, minute=0, timezone="UTC"),
            id="weekly_insights",
            name="Weekly AI Insights (injury risk + goals)",
            replace_existing=True,
            misfire_grace_time=3600,  # Allow 1h late start
        )

        # Every day 07:00 UTC — biomarker narrative logging
        _scheduler.add_job(
            daily_narrative_job,
            trigger=CronTrigger(hour=7, minute=0, timezone="UTC"),
            id="daily_narrative",
            name="Daily Biomarker Narrative",
            replace_existing=True,
            misfire_grace_time=3600,
        )

        # Daily 03:00 UTC — limpieza de tokens expirados y datos obsoletos
        _scheduler.add_job(
            cleanup_job,
            trigger=CronTrigger(hour=3, minute=0, timezone="UTC"),
            id="cleanup",
            name="Daily DB Cleanup (tokens, plans, page_views)",
            replace_existing=True,
            misfire_grace_time=3600,
        )

    return _scheduler


def start_scheduler() -> None:
    scheduler = get_scheduler()
    if not scheduler.running:
        scheduler.start()
        logger.info(
            "[Scheduler] Started — jobs: %s",
            [job.id for job in scheduler.get_jobs()],
        )


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[Scheduler] Stopped")
    _scheduler = None
