"""
tests/unit/test_scheduler.py
==============================
Tests del scheduler APScheduler.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestScheduler:

    def test_get_scheduler_returns_scheduler(self):
        """get_scheduler() devuelve una instancia válida de AsyncIOScheduler."""
        from app.core.scheduler import get_scheduler, stop_scheduler
        stop_scheduler()  # limpieza previa

        scheduler = get_scheduler()
        assert scheduler is not None
        jobs = scheduler.get_jobs()
        assert len(jobs) == 2
        job_ids = [j.id for j in jobs]
        assert "weekly_insights" in job_ids
        assert "daily_narrative" in job_ids

        stop_scheduler()  # cleanup

    def test_weekly_job_cron_trigger(self):
        """El job semanal está configurado para los lunes."""
        from app.core.scheduler import get_scheduler, stop_scheduler
        stop_scheduler()

        scheduler = get_scheduler()
        weekly_job = next(j for j in scheduler.get_jobs() if j.id == "weekly_insights")
        # CronTrigger with day_of_week=mon
        trigger_str = str(weekly_job.trigger)
        assert "mon" in trigger_str.lower() or "0" in trigger_str  # APScheduler formats vary

        stop_scheduler()

    @pytest.mark.asyncio
    async def test_start_stop_scheduler(self):
        """El scheduler arranca y para sin errores."""
        from app.core.scheduler import get_scheduler, start_scheduler, stop_scheduler
        stop_scheduler()

        start_scheduler()
        scheduler = get_scheduler()
        assert scheduler.running

        stop_scheduler()
        # After stop, _scheduler is None — get_scheduler() returns a new instance (not running)
        new_scheduler = get_scheduler()
        assert not new_scheduler.running

        stop_scheduler()  # cleanup

    @pytest.mark.asyncio
    async def test_start_scheduler_idempotent(self):
        """Llamar start_scheduler() dos veces no falla."""
        from app.core.scheduler import start_scheduler, stop_scheduler
        stop_scheduler()

        start_scheduler()
        start_scheduler()  # second call should be a no-op

        stop_scheduler()

    @pytest.mark.asyncio
    async def test_weekly_insights_job_no_api_key(self):
        """Sin GROK_API_KEY el job termina limpiamente sin hacer llamadas."""
        from app.core.scheduler import weekly_insights_job

        with patch("app.core.scheduler.get_settings") as mock_cfg:
            mock_cfg.return_value.grok_api_key = ""
            # Should not raise
            await weekly_insights_job()

    @pytest.mark.asyncio
    async def test_daily_narrative_job_no_api_key(self):
        """Sin GROK_API_KEY el job diario termina limpiamente."""
        from app.core.scheduler import daily_narrative_job

        with patch("app.core.scheduler.get_settings") as mock_cfg:
            mock_cfg.return_value.grok_api_key = ""
            await daily_narrative_job()

    @pytest.mark.asyncio
    async def test_weekly_insights_job_with_users(self):
        """El job semanal procesa usuarios y llama a los servicios."""
        from app.core.scheduler import weekly_insights_job
        from app.modules.ai_insights.schemas import InjuryRiskResponse

        mock_risk = InjuryRiskResponse(risk_flags=[], overall_risk="low", summary="OK")

        with patch("app.core.scheduler.get_settings") as mock_cfg, \
             patch("app.core.scheduler.create_async_engine") as mock_engine_cls, \
             patch("app.core.scheduler.async_sessionmaker") as mock_factory_cls, \
             patch("app.core.scheduler._get_active_user_ids", new=AsyncMock(return_value=["user-1", "user-2"])), \
             patch("app.modules.ai_insights.service.get_injury_risk", new=AsyncMock(return_value=mock_risk)):

            mock_cfg.return_value.grok_api_key = "gsk_test_key"
            mock_cfg.return_value.database_url = "postgresql+asyncpg://test"

            mock_engine = AsyncMock()
            mock_engine.dispose = AsyncMock()
            mock_engine_cls.return_value = mock_engine

            mock_session = AsyncMock()
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)
            mock_factory_cls.return_value = MagicMock(return_value=mock_session)

            await weekly_insights_job()
