#!/usr/bin/env python3
"""
scripts/db_cleanup.py
======================
Limpieza periódica de datos obsoletos en HealthStack Pro.

Política de retención (ver docs/superpowers/specs/2026-05-28-database-improvements-design.md):
  - refresh_tokens        → borrar tokens revocados con > 30 días
  - gamification_events   → borrar eventos con > 90 días
  - page_views            → borrar registros con > 30 días

Uso:
    # Ver qué se borraría (sin borrar nada)
    python scripts/db_cleanup.py --dry-run

    # Ejecutar limpieza real
    python scripts/db_cleanup.py

    # Limpieza con retención personalizada (días)
    python scripts/db_cleanup.py --tokens-days 60 --events-days 180 --views-days 14

Recomendación para la Pi:
    Añadir a crontab (ejecutar a las 03:00 cada día):
    0 3 * * * docker exec healthstack_backend python scripts/db_cleanup.py >> /var/log/healthstack-cleanup.log 2>&1

RGPD:
    Este script aplica la política de limitación del plazo de conservación
    (Art. 5.1.e RGPD). Los datos eliminados son funcionales, no datos de salud.
    Los datos de salud (health_records) no están sujetos a esta limpieza automática
    y se borran únicamente mediante el derecho de supresión del usuario (Art. 17).
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from dataclasses import dataclass
from datetime import UTC, datetime

# Añadir el directorio raíz al path para importar app.*
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("db_cleanup")


@dataclass
class CleanupPolicy:
    name: str
    table: str
    condition: str  # SQL WHERE clause (sin WHERE)
    description: str


def build_policies(
    tokens_days: int = 30,
    events_days: int = 90,
    views_days: int = 30,
) -> list[CleanupPolicy]:
    return [
        CleanupPolicy(
            name="refresh_tokens_revoked",
            table="public.refresh_tokens",
            condition=f"revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '{tokens_days} days'",
            description=f"Refresh tokens revocados hace más de {tokens_days} días",
        ),
        CleanupPolicy(
            name="gamification_events_old",
            table="public.gamification_events",
            condition=f"created_at < NOW() - INTERVAL '{events_days} days'",
            description=f"Eventos de gamificación con más de {events_days} días",
        ),
        CleanupPolicy(
            name="page_views_old",
            table="public.page_views",
            condition=f"created_at < NOW() - INTERVAL '{views_days} days'",
            description=f"Page views con más de {views_days} días",
        ),
        CleanupPolicy(
            name="password_reset_tokens_expired",
            table="public.password_reset_tokens",
            condition=f"expires_at < NOW() - INTERVAL '{tokens_days} days'",
            description=f"Password reset tokens expirados hace más de {tokens_days} días",
        ),
    ]


async def run_cleanup(
    database_url: str,
    policies: list[CleanupPolicy],
    dry_run: bool = False,
) -> dict[str, int]:
    """
    Ejecuta la limpieza según las políticas definidas.

    Returns:
        dict con {policy_name: filas_eliminadas_o_contadas}
    """
    engine = create_async_engine(database_url, echo=False, pool_size=1)
    results: dict[str, int] = {}

    mode = "DRY-RUN" if dry_run else "LIVE"
    logger.info("=" * 60)
    logger.info("HealthStack DB Cleanup — %s — %s", mode, datetime.now(UTC).isoformat())
    logger.info("=" * 60)

    try:
        async with engine.begin() as conn:
            for policy in policies:
                if dry_run:
                    # Solo contar, sin borrar
                    count_sql = text(
                        f"SELECT COUNT(*) FROM {policy.table} WHERE {policy.condition}"
                    )
                    result = await conn.execute(count_sql)
                    count = result.scalar_one()
                    results[policy.name] = count
                    logger.info(
                        "[DRY-RUN] %-35s → %d filas que se borrarían",
                        policy.description,
                        count,
                    )
                else:
                    # Borrar en lotes de 1000 para no lockear la tabla
                    total_deleted = 0
                    while True:
                        delete_sql = text(
                            f"""
                            DELETE FROM {policy.table}
                            WHERE ctid IN (
                                SELECT ctid FROM {policy.table}
                                WHERE {policy.condition}
                                LIMIT 1000
                            )
                            """
                        )
                        result = await conn.execute(delete_sql)
                        batch_deleted = result.rowcount
                        total_deleted += batch_deleted
                        if batch_deleted < 1000:
                            break  # No hay más filas que borrar
                    results[policy.name] = total_deleted
                    logger.info(
                        "%-35s → %d filas eliminadas",
                        policy.description,
                        total_deleted,
                    )

        logger.info("-" * 60)
        total = sum(results.values())
        action = "se borrarían" if dry_run else "eliminadas"
        logger.info("Total filas que %s: %d", action, total)
        logger.info("=" * 60)

    finally:
        await engine.dispose()

    return results


async def run_vacuum(database_url: str, dry_run: bool = False) -> None:
    """
    Ejecuta VACUUM ANALYZE en las tablas con mayor acumulación de dead tuples.
    VACUUM no puede ejecutarse dentro de una transacción, por eso usa autocommit.
    """
    if dry_run:
        logger.info("[DRY-RUN] Se ejecutaría VACUUM ANALYZE en: users, gamification_states, ai_insights_cache")
        return

    tables = [
        "public.users",
        "public.gamification_states",
        "public.ai_insights_cache",
        "public.community_posts",
        "public.refresh_tokens",
        "public.gamification_events",
    ]

    # VACUUM requiere autocommit (isolation_level="AUTOCOMMIT")
    engine = create_async_engine(
        database_url,
        echo=False,
        pool_size=1,
        isolation_level="AUTOCOMMIT",
    )
    try:
        async with engine.connect() as conn:
            for table in tables:
                logger.info("VACUUM ANALYZE %s ...", table)
                await conn.execute(text(f"VACUUM ANALYZE {table}"))
        logger.info("VACUUM completado.")
    except Exception as exc:
        logger.warning("VACUUM falló (no crítico): %s", exc)
    finally:
        await engine.dispose()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Limpieza periódica de datos obsoletos en HealthStack Pro",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Mostrar cuántas filas se borrarían sin borrar nada.",
    )
    parser.add_argument(
        "--tokens-days",
        type=int,
        default=30,
        help="Retener tokens revocados/expirados N días (default: 30).",
    )
    parser.add_argument(
        "--events-days",
        type=int,
        default=90,
        help="Retener eventos de gamificación N días (default: 90).",
    )
    parser.add_argument(
        "--views-days",
        type=int,
        default=30,
        help="Retener page_views N días (default: 30).",
    )
    parser.add_argument(
        "--no-vacuum",
        action="store_true",
        help="Omitir VACUUM ANALYZE al final.",
    )
    return parser.parse_args()


async def main() -> int:
    args = parse_args()

    # Cargar configuración
    try:
        from app.core.config import get_settings
        settings = get_settings()
        database_url = settings.database_url
    except Exception as exc:
        logger.error("No se pudo cargar la configuración: %s", exc)
        logger.error("Asegúrate de ejecutar desde el directorio backend/ con el .env correcto.")
        return 1

    policies = build_policies(
        tokens_days=args.tokens_days,
        events_days=args.events_days,
        views_days=args.views_days,
    )

    results = await run_cleanup(database_url, policies, dry_run=args.dry_run)

    if not args.no_vacuum and not args.dry_run:
        await run_vacuum(database_url, dry_run=args.dry_run)

    # Exit code 0 si hay cambios (o dry-run), 0 siempre (no fallar el cron)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
