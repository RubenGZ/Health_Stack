from __future__ import annotations

import logging
import time
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ── Tabla → schema PostgreSQL ──────────────────────────────────────────────────
# data_links y health.health_records excluidos (RGPD Art. 9 / pseudonymisation key)
ALLOWED_TABLES: dict[str, str] = {
    "users":                      "public",
    "page_views":                 "public",
    "supplements":                "public",
    "ingredients":                "public",
    "user_recipes":               "public",
    "saved_routines":             "public",
    "community_posts":            "public",
    "community_likes":            "public",
    "gamification_states":        "public",
    "gamification_events":        "public",
    "refresh_tokens":             "public",
    "password_reset_tokens":      "public",
    "integration_tokens":         "public",
    "workout_sessions":           "public",
    "session_exercises":          "public",
    "exercise_sets":              "public",
    "ranked_seasons":             "public",
    "ranked_profiles":            "public",
    "ranked_events":              "public",
    "gym_servers":                "public",
    "gym_memberships":            "public",
    "gym_champion_badges":        "public",
    "gym_challenges":             "public",
    "gym_challenge_participants": "public",
    "ai_insights_cache":          "public",
    "user_chronic_injuries":      "public",
    "workout_ai_plans":           "public",
}

# Columna de ordenación por defecto es "created_at".
# Las tablas sin esa columna usan la aquí definida.
TABLES_SORT_COLUMN: dict[str, str] = {
    "workout_sessions":           "started_at",
    "exercise_sets":              "id",
    "session_exercises":          "id",
    "ranked_seasons":             "id",
    "ranked_profiles":            "id",
    "gym_memberships":            "joined_at",
    "gym_champion_badges":        "earned_at",
    "gym_challenges":             "id",
    "gym_challenge_participants": "joined_at",
}

# Columnas que contienen secretos — se reemplazan por placeholders
MASKED_COLUMNS = {
    "password_hash",
    "health_uuid_enc",
    "jti",
    "token_hash",
    "access_token_enc",
    "refresh_token_enc",
}


class AdminRepository:

    # ── Overview KPIs ──────────────────────────────────────────────────────────

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
        return dict(r.mappings().one())

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
    async def get_timeseries_multi(db: AsyncSession, days: int = 30) -> list[dict]:
        """Timeseries multi-módulo: usuarios, workouts, posts y rutinas por día."""
        r = await db.execute(text("""
            WITH calendar AS (
                SELECT DATE(d) AS dt
                FROM generate_series(
                    (NOW() - INTERVAL '1 day' * :days)::date,
                    NOW()::date,
                    '1 day'::interval
                ) AS d
            )
            SELECT
                c.dt                           AS date,
                COALESCE(u.cnt,  0)::int       AS users,
                COALESCE(w.cnt,  0)::int       AS workouts,
                COALESCE(p.cnt,  0)::int       AS posts,
                COALESCE(rt.cnt, 0)::int       AS routines
            FROM calendar c
            LEFT JOIN (
                SELECT DATE(created_at AT TIME ZONE 'UTC') AS dt, COUNT(*) AS cnt
                FROM public.users
                WHERE created_at >= NOW() - INTERVAL '1 day' * :days
                GROUP BY 1
            ) u  ON u.dt  = c.dt
            LEFT JOIN (
                SELECT DATE(started_at AT TIME ZONE 'UTC') AS dt, COUNT(*) AS cnt
                FROM public.workout_sessions
                WHERE started_at >= NOW() - INTERVAL '1 day' * :days
                GROUP BY 1
            ) w  ON w.dt  = c.dt
            LEFT JOIN (
                SELECT DATE(created_at AT TIME ZONE 'UTC') AS dt, COUNT(*) AS cnt
                FROM public.community_posts
                WHERE created_at >= NOW() - INTERVAL '1 day' * :days
                GROUP BY 1
            ) p  ON p.dt  = c.dt
            LEFT JOIN (
                SELECT DATE(created_at AT TIME ZONE 'UTC') AS dt, COUNT(*) AS cnt
                FROM public.saved_routines
                WHERE created_at >= NOW() - INTERVAL '1 day' * :days
                GROUP BY 1
            ) rt ON rt.dt = c.dt
            ORDER BY c.dt
        """), {"days": days})
        return [
            {
                "date":     str(row.date),
                "users":    row.users,
                "workouts": row.workouts,
                "posts":    row.posts,
                "routines": row.routines,
            }
            for row in r
        ]

    @staticmethod
    async def get_module_activity(db: AsyncSession) -> list[dict]:
        queries = {
            "health_records":       "SELECT COUNT(*)::int FROM health.health_records",
            "saved_routines":       "SELECT COUNT(*)::int FROM public.saved_routines",
            "community_posts":      "SELECT COUNT(*)::int FROM public.community_posts",
            "gamification_states":  "SELECT COUNT(*)::int FROM public.gamification_states",
            "page_views":           "SELECT COUNT(*)::int FROM public.page_views WHERE is_admin = false",
            "workout_sessions":     "SELECT COUNT(*)::int FROM public.workout_sessions",
            "user_recipes":         "SELECT COUNT(*)::int FROM public.user_recipes",
            "ai_insights_cache":    "SELECT COUNT(*)::int FROM public.ai_insights_cache",
            "user_chronic_injuries":"SELECT COUNT(*)::int FROM public.user_chronic_injuries",
            "ranked_profiles":      "SELECT COUNT(*)::int FROM public.ranked_profiles",
            "gym_servers":          "SELECT COUNT(*)::int FROM public.gym_servers",
        }
        results = []
        for module, q in queries.items():
            try:
                r = await db.execute(text(q))
                count = r.scalar() or 0
            except Exception:
                count = 0
            results.append({"module": module, "count": count})
        return results

    @staticmethod
    async def get_plans_distribution(db: AsyncSession) -> list[dict]:
        """Distribución real de planes de usuarios activos."""
        r = await db.execute(text("""
            SELECT plan, COUNT(*)::int AS count
            FROM public.users
            WHERE is_active = true
            GROUP BY plan
            ORDER BY plan
        """))
        return [{"plan": row.plan, "count": row.count} for row in r]

    # ── DB Health (semáforo) ───────────────────────────────────────────────────

    @staticmethod
    async def get_db_health(db: AsyncSession) -> list[dict]:
        """
        Semáforo de salud por módulo.
        status:
          ok    → tiene registros y actividad en los últimos 7 días
          warn  → tiene registros pero sin actividad en los últimos 7 días
          empty → 0 registros
          error → fallo de query (tabla no encontrada, etc.)
        """
        modules = [
            {"module": "users",               "table": "public.users",                "ts": "created_at",  "label": "Usuarios"},
            {"module": "workout_sessions",     "table": "public.workout_sessions",     "ts": "started_at",  "label": "Entrenamientos"},
            {"module": "community_posts",      "table": "public.community_posts",      "ts": "created_at",  "label": "Posts comunidad"},
            {"module": "saved_routines",       "table": "public.saved_routines",       "ts": "created_at",  "label": "Rutinas guardadas"},
            {"module": "user_recipes",         "table": "public.user_recipes",         "ts": "created_at",  "label": "Recetas"},
            {"module": "health_records",       "table": "health.health_records",       "ts": "created_at",  "label": "Registros salud"},
            {"module": "gamification_events",  "table": "public.gamification_events",  "ts": "created_at",  "label": "Gamificación"},
            {"module": "ai_insights_cache",    "table": "public.ai_insights_cache",    "ts": "created_at",  "label": "AI Insights"},
            {"module": "user_chronic_injuries","table": "public.user_chronic_injuries","ts": "created_at",  "label": "Lesiones"},
            {"module": "workout_ai_plans",     "table": "public.workout_ai_plans",     "ts": "created_at",  "label": "Planes IA"},
            {"module": "gym_servers",          "table": "public.gym_servers",          "ts": "created_at",  "label": "Gym Servers"},
            {"module": "ranked_profiles",      "table": "public.ranked_profiles",      "ts": "updated_at",  "label": "Rankings"},
        ]

        results = []
        for m in modules:
            try:
                r = await db.execute(text(f"""
                    SELECT
                        COUNT(*)::int AS total,
                        MAX({m['ts']}) AS last_at,
                        COUNT(*) FILTER (WHERE {m['ts']} >= NOW() - INTERVAL '24 hours')::int AS active_24h,
                        COUNT(*) FILTER (WHERE {m['ts']} >= NOW() - INTERVAL '7 days')::int  AS active_7d
                    FROM {m['table']}
                """))
                row = r.mappings().one()
                total     = row["total"] or 0
                last_at   = row["last_at"]
                active_24h = row["active_24h"] or 0
                active_7d  = row["active_7d"] or 0

                if total == 0:
                    status = "empty"
                elif active_7d > 0:
                    status = "ok"
                else:
                    status = "warn"

                results.append({
                    "module":        m["module"],
                    "label":         m["label"],
                    "total":         total,
                    "last_record_at": last_at.isoformat() if last_at else None,
                    "active_24h":    active_24h,
                    "active_7d":     active_7d,
                    "status":        status,
                })
            except Exception as exc:
                logger.warning("[AdminRepository.get_db_health] %s: %s", m["module"], exc)
                results.append({
                    "module":        m["module"],
                    "label":         m["label"],
                    "total":         0,
                    "last_record_at": None,
                    "active_24h":    0,
                    "active_7d":     0,
                    "status":        "error",
                })

        return results

    # ── System Health (pings on-demand) ───────────────────────────────────────

    @staticmethod
    async def get_system_health(db: AsyncSession) -> list[dict]:
        """Pings on-demand a servicios clave. Ejecuta en ~3-5 s."""
        results: list[dict] = []

        # 1. API – si llegamos aquí, la API está online
        results.append({
            "service":    "API",
            "status":     "ok",
            "latency_ms": 0,
            "detail":     "Online",
        })

        # 2. PostgreSQL
        t0 = time.monotonic()
        try:
            await db.execute(text("SELECT 1"))
            db_ms = round((time.monotonic() - t0) * 1000, 1)
            results.append({
                "service":    "PostgreSQL",
                "status":     "ok",
                "latency_ms": db_ms,
                "detail":     f"Responsive ({db_ms} ms)",
            })
        except Exception as exc:
            results.append({
                "service":    "PostgreSQL",
                "status":     "error",
                "latency_ms": -1,
                "detail":     str(exc)[:120],
            })

        # 3. Redis
        t0 = time.monotonic()
        try:
            from app.shared.cache import _get_client  # noqa: PLC0415
            client = await _get_client()
            if client is not None:
                await client.ping()
                redis_ms = round((time.monotonic() - t0) * 1000, 1)
                results.append({
                    "service":    "Redis",
                    "status":     "ok",
                    "latency_ms": redis_ms,
                    "detail":     f"Responsive ({redis_ms} ms)",
                })
            else:
                results.append({
                    "service":    "Redis",
                    "status":     "warn",
                    "latency_ms": -1,
                    "detail":     "No configurado o no disponible",
                })
        except Exception as exc:
            results.append({
                "service":    "Redis",
                "status":     "error",
                "latency_ms": -1,
                "detail":     str(exc)[:120],
            })

        # 4. Frontend / Nginx
        t0 = time.monotonic()
        try:
            from app.core.config import get_settings  # noqa: PLC0415
            url = (get_settings().app_frontend_url or "http://localhost").rstrip("/")
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as hx:
                resp = await hx.get(url + "/")
            fe_ms = round((time.monotonic() - t0) * 1000, 1)
            ok = resp.status_code < 400
            results.append({
                "service":    "Frontend/Nginx",
                "status":     "ok" if ok else "warn",
                "latency_ms": fe_ms,
                "detail":     f"HTTP {resp.status_code} ({fe_ms} ms)",
            })
        except Exception as exc:
            results.append({
                "service":    "Frontend/Nginx",
                "status":     "error",
                "latency_ms": -1,
                "detail":     str(exc)[:120],
            })

        return results

    # ── Table list / data ──────────────────────────────────────────────────────

    @staticmethod
    async def get_table_list(db: AsyncSession) -> list[dict]:
        r = await db.execute(text("""
            SELECT relname AS table_name, n_live_tup::int AS approx_count
            FROM pg_stat_user_tables
            WHERE relname = ANY(:tables)
            ORDER BY relname
        """), {"tables": list(ALLOWED_TABLES.keys())})
        return [{"table_name": row.table_name, "approx_count": row.approx_count} for row in r]

    @staticmethod
    async def get_table_data(db: AsyncSession, table_name: str, page: int, limit: int) -> list[dict]:
        if table_name not in ALLOWED_TABLES:
            return []
        schema   = ALLOWED_TABLES[table_name]
        sort_col = TABLES_SORT_COLUMN.get(table_name, "created_at")
        safe_limit = min(limit, 100)
        offset  = (page - 1) * safe_limit

        try:
            r = await db.execute(
                text(f"SELECT * FROM {schema}.{table_name} ORDER BY {sort_col} DESC LIMIT :limit OFFSET :offset"),
                {"limit": safe_limit, "offset": offset},
            )
        except Exception:
            # Fallback: sort by id if the sort column doesn't exist
            try:
                r = await db.execute(
                    text(f"SELECT * FROM {schema}.{table_name} ORDER BY id DESC LIMIT :limit OFFSET :offset"),
                    {"limit": safe_limit, "offset": offset},
                )
            except Exception:
                r = await db.execute(
                    text(f"SELECT * FROM {schema}.{table_name} LIMIT :limit OFFSET :offset"),
                    {"limit": safe_limit, "offset": offset},
                )

        rows = []
        for row in r.mappings():
            d = dict(row)
            for col in MASKED_COLUMNS:
                if col in d:
                    # Use [HASH] for hashed passwords, [ENCRYPTED] for all other
                    # sensitive columns. These values match the frontend display logic
                    # in adminTables.js which already handles both markers.
                    d[col] = "[HASH]" if col == "password_hash" else "[ENCRYPTED]"
            for k, v in d.items():
                if hasattr(v, "isoformat"):
                    d[k] = v.isoformat()
                elif hasattr(v, "hex"):
                    d[k] = str(v)
                elif isinstance(v, dict) and len(str(v)) > 80:
                    d[k] = str(v)[:80] + "…"
            rows.append(d)
        return rows

    # ── Technical Metrics ──────────────────────────────────────────────────────

    @staticmethod
    async def get_technical_metrics(db: AsyncSession) -> dict:
        now = datetime.now(UTC)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        ago_7d = now - timedelta(days=7)
        try:
            r = await db.execute(text("""
                SELECT
                    COUNT(*) FILTER (WHERE created_at >= :today)::int AS today,
                    COUNT(*) FILTER (WHERE created_at >= :ago7d)::int  AS week
                FROM public.page_views WHERE is_admin = false
            """), {"today": today_start, "ago7d": ago_7d})
            row = r.mappings().one()
            pv_today = row["today"]
            pv_7d    = row["week"]
        except Exception:
            pv_today = 0
            pv_7d    = 0

        top_endpoints = await AdminRepository.get_top_pages(db)
        return {"page_views_today": pv_today, "page_views_7d": pv_7d, "top_endpoints": top_endpoints}

    @staticmethod
    async def get_top_pages(db: AsyncSession, days: int = 7) -> list[dict]:
        """Top páginas visitadas en los últimos N días (excluye admins)."""
        try:
            r = await db.execute(text("""
                SELECT page AS endpoint, COUNT(*)::int AS count
                FROM public.page_views
                WHERE is_admin = false
                  AND created_at >= NOW() - INTERVAL '1 day' * :days
                GROUP BY page
                ORDER BY count DESC
                LIMIT 10
            """), {"days": days})
            return [{"endpoint": row.endpoint, "count": row.count} for row in r]
        except Exception:
            return []

    # ── Users ──────────────────────────────────────────────────────────────────

    @staticmethod
    async def get_users(db: AsyncSession, limit: int, offset: int) -> list:
        from app.modules.identity.repository import UserRepository  # noqa: PLC0415
        return await UserRepository.get_all(db, limit=limit, offset=offset)

    @staticmethod
    async def get_admin_count(db: AsyncSession) -> int:
        r = await db.execute(text(
            "SELECT COUNT(*)::int FROM public.users WHERE role = 'admin' AND is_active = true"
        ))
        return r.scalar() or 0
