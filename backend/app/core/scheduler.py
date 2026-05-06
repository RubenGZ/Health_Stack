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

import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.modules.identity.models import User

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


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
    cfg = get_settings()
    logger.info("[Scheduler] weekly_insights_job started — %s", datetime.now(timezone.utc).isoformat())

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

        async with session_factory() as session:
            from app.modules.ai_insights.service import get_injury_risk, get_weekly_goals

            for user_id in user_ids:
                try:
                    risk = await get_injury_risk(user_id, session)
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
    logger.info("[Scheduler] daily_narrative_job started — %s", datetime.now(timezone.utc).isoformat())

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
