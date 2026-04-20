"""
alembic/env.py
===============
Configuración del entorno de migraciones Alembic.

Usa el patrón async de SQLAlchemy 2.0 con asyncpg:
- `run_async_migrations()` → corre en un event loop temporal
- No necesita psycopg2 — usa asyncpg directamente con el driver sync wrapper

Por qué async Alembic:
- Reutiliza la misma URL de base de datos que la app (DATABASE_URL con asyncpg)
- No necesita instalar psycopg2 como dependencia adicional
- Es el patrón recomendado por SQLAlchemy 2.0 + Alembic para proyectos async

Referencia: https://alembic.sqlalchemy.org/en/latest/cookbook.html#using-asyncio-with-alembic
"""

from __future__ import annotations

import asyncio
import os
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# ── Cargar variables de entorno desde .env ────────────────────────────────────
# Alembic se ejecuta desde la CLI, fuera del ciclo de vida de FastAPI,
# así que cargamos el .env manualmente.
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
except ImportError:
    pass  # python-dotenv no está instalado — usar variables del shell

# ── Importar todos los modelos para que Alembic los detecte ──────────────────
# Alembic necesita conocer todos los modelos SQLAlchemy para generar
# migraciones automáticas con `alembic revision --autogenerate`.
# Importar la Base primero, luego los modelos que la usan.
from app.shared.base_model import Base  # noqa: F401 — importar Base
from app.modules.Identity.models import User, DataLink  # noqa: F401
from app.modules.Health.models import HealthRecord  # noqa: F401
from app.modules.Routines.models import SavedRoutine  # noqa: F401
from app.modules.Community.models import CommunityPost, CommunityLike  # noqa: F401
from app.modules.Gamification.models import GamificationState  # noqa: F401
from app.modules.Nutrition.models import Supplement, Ingredient, UserRecipe  # noqa: F401

# ── Configuración de Alembic ──────────────────────────────────────────────────
config = context.config

# Configurar logging desde alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# MetaData de SQLAlchemy — Alembic la usa para detectar cambios en modelos
target_metadata = Base.metadata

# ── URL de base de datos ──────────────────────────────────────────────────────
# Alembic usa la URL async (asyncpg). Si la URL no está en alembic.ini,
# la toma de la variable de entorno DATABASE_URL.
_db_url = os.environ.get("DATABASE_URL", config.get_main_option("sqlalchemy.url"))

# asyncpg no soporta el prefijo "postgresql+asyncpg" en alembic de forma directa.
# Usamos "postgresql+asyncpg" para el engine async de SQLAlchemy.
if _db_url and not _db_url.startswith("postgresql+asyncpg"):
    _db_url = _db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

config.set_main_option("sqlalchemy.url", _db_url or "")


# ── MODO OFFLINE ──────────────────────────────────────────────────────────────

def run_migrations_offline() -> None:
    """
    Genera SQL sin conectarse a la BD.
    Útil para generar scripts de migración para revisión manual.

    Uso: alembic upgrade head --sql > migration.sql
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # Necesario para schemas múltiples (public + health)
        include_schemas=True,
        # Comparar tipos para detectar cambios de columna
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


# ── MODO ONLINE (ASYNC) ────────────────────────────────────────────────────────

def do_run_migrations(connection: Connection) -> None:
    """Ejecuta las migraciones en una conexión sync provista por asyncio.run()."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        # Incluir schemas no-default (el schema "health" para health_records)
        include_schemas=True,
        # Detectar cambios de tipo en columnas existentes
        compare_type=True,
        # Incluir tablas de todos los schemas gestionados
        include_name=lambda name, type_, parent_names: True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """
    Crea un engine async temporal para las migraciones y ejecuta
    `do_run_migrations()` en el contexto de conexión sync que Alembic requiere.

    asyncpg no soporta operaciones DDL síncronas directamente, pero
    SQLAlchemy provee `sync_engine` que envuelve asyncpg para compatibilidad.
    """
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,  # Sin pool para migraciones — una sola conexión
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Punto de entrada para migraciones online (modo por defecto)."""
    asyncio.run(run_async_migrations())


# ── Dispatcher ────────────────────────────────────────────────────────────────
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
