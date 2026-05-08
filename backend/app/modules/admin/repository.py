from __future__ import annotations
from datetime import UTC, datetime, timedelta
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

ALLOWED_TABLES = {"users", "health_records", "routines", "community_posts", "gamification_profiles", "page_views"}
MASKED_COLUMNS = {"password_hash", "health_uuid_enc"}

class AdminRepository:

    @staticmethod
    async def get_overview(db: AsyncSession) -> dict:
        now = datetime.now(UTC)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        ago_30d = now - timedelta(days=30)

        r = await db.execute(text("""
            SELECT
                COUNT(*)::int AS total_users,
                COUNT(*) FILTER (WHERE last_login_at >= :ago_30d)::int AS active_users_30d,
                COUNT(*) FILTER (WHERE created_at >= :today_start)::int AS new_users_today,
                COUNT(*) FILTER (WHERE role = 'admin')::int AS admin_count
            FROM public.users
        """), {"ago_30d": ago_30d, "today_start": today_start})
        row = r.mappings().one()
        return dict(row)

    @staticmethod
    async def get_timeseries(db: AsyncSession, days: int = 30) -> list[dict]:
        r = await db.execute(text("""
            SELECT DATE(created_at AT TIME ZONE 'UTC') AS date, COUNT(*)::int AS count
            FROM public.users
            WHERE created_at >= NOW() - INTERVAL '1 day' * :days
            GROUP BY 1 ORDER BY 1
        """), {"days": days})
        return [{"date": str(row.date), "count": row.count} for row in r]

    @staticmethod
    async def get_module_activity(db: AsyncSession) -> list[dict]:
        results = []
        queries = {
            "health":        "SELECT COUNT(*)::int FROM public.health_records",
            "routines":      "SELECT COUNT(*)::int FROM public.routines",
            "community":     "SELECT COUNT(*)::int FROM public.community_posts",
            "gamification":  "SELECT COUNT(*)::int FROM public.gamification_profiles",
            "page_views":    "SELECT COUNT(*)::int FROM public.page_views WHERE is_admin = false",
        }
        for module, q in queries.items():
            try:
                r = await db.execute(text(q))
                count = r.scalar() or 0
            except Exception:
                count = 0
            results.append({"module": module, "count": count})
        return results

    @staticmethod
    async def get_table_list(db: AsyncSession) -> list[dict]:
        r = await db.execute(text("""
            SELECT relname AS table_name, n_live_tup::int AS approx_count
            FROM pg_stat_user_tables
            WHERE schemaname = 'public'
              AND relname = ANY(:tables)
            ORDER BY relname
        """), {"tables": list(ALLOWED_TABLES)})
        return [{"table_name": row.table_name, "approx_count": row.approx_count} for row in r]

    @staticmethod
    async def get_table_data(db: AsyncSession, table_name: str, page: int, limit: int) -> list[dict]:
        if table_name not in ALLOWED_TABLES:
            return []
        safe_limit = min(limit, 100)
        offset = (page - 1) * safe_limit
        r = await db.execute(
            text(f"SELECT * FROM public.{table_name} ORDER BY created_at DESC LIMIT :limit OFFSET :offset"),
            {"limit": safe_limit, "offset": offset}
        )
        rows = []
        for row in r.mappings():
            d = dict(row)
            for col in MASKED_COLUMNS:
                if col in d:
                    d[col] = "[ENCRYPTED]" if col == "health_uuid_enc" else "[HASH]"
            # Serialize non-JSON-serializable types
            for k, v in d.items():
                if hasattr(v, 'isoformat'):
                    d[k] = v.isoformat()
                elif hasattr(v, 'hex'):
                    d[k] = str(v)
            rows.append(d)
        return rows

    @staticmethod
    async def get_technical_metrics(db: AsyncSession) -> dict:
        now = datetime.now(UTC)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        ago_7d = now - timedelta(days=7)
        try:
            r = await db.execute(text("""
                SELECT
                    COUNT(*) FILTER (WHERE created_at >= :today)::int AS today,
                    COUNT(*) FILTER (WHERE created_at >= :ago7d)::int AS week
                FROM public.page_views WHERE is_admin = false
            """), {"today": today_start, "ago7d": ago_7d})
            row = r.mappings().one()
            pv_today = row["today"]
            pv_7d = row["week"]
        except Exception:
            pv_today = 0
            pv_7d = 0
        return {"page_views_today": pv_today, "page_views_7d": pv_7d, "top_endpoints": []}

    @staticmethod
    async def get_users(db: AsyncSession, limit: int, offset: int) -> list:
        from app.modules.identity.repository import UserRepository
        return await UserRepository.get_all(db, limit=limit, offset=offset)

    @staticmethod
    async def get_admin_count(db: AsyncSession) -> int:
        r = await db.execute(text("SELECT COUNT(*)::int FROM public.users WHERE role = 'admin' AND is_active = true"))
        return r.scalar() or 0
