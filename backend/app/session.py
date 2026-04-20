"""
app/core/database/session.py
============================
Gestión de sesiones asíncronas de SQLAlchemy.

Usamos SQLAlchemy 2.0 con asyncio + asyncpg para:
- Non-blocking I/O (no bloquea el event loop de FastAPI)
- Connection pooling automático
- Transacciones explícitas con async context manager

El patrón "session per request" (una sesión por request HTTP) garantiza
que las transacciones no se filtren entre requests diferentes.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

_settings = get_settings()

# ── Motor de base de datos ────────────────────────────────────────────────────
# pool_size=20, max_overflow=10 → hasta 30 conexiones concurrentes
# pool_pre_ping=True → verifica que la conexión sigue viva antes de usarla
#   (importante para conexiones que lleven tiempo inactivas en el pool)
_engine = create_async_engine(
    _settings.database_url,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    # echo=True en desarrollo para ver todas las queries SQL generadas
    echo=_settings.debug,
)

# ── Fábrica de sesiones ───────────────────────────────────────────────────────
# expire_on_commit=False → los objetos ORM siguen accesibles después del commit.
# Necesario en FastAPI donde los objetos se usan en la respuesta después del commit.
AsyncSessionFactory = async_sessionmaker(
    bind=_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,   # No hacer flush automático — control explícito
    autocommit=False,  # Transacciones explícitas siempre
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency de FastAPI: provee una sesión de BD por request.

    Patrón:
        1. Abre sesión
        2. Inyecta en el endpoint/service vía Depends()
        3. Al terminar el request (o si hay excepción), hace rollback automático
           y cierra la sesión → sin resource leaks

    Uso:
        @router.post("/endpoint")
        async def endpoint(db: DBSession):
            result = await service.do_something(db)
    """
    async with AsyncSessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            # Rollback explícito en cualquier excepción no manejada
            # Garantiza que no queden transacciones abiertas en el pool
            await session.rollback()
            raise
        finally:
            await session.close()


# Tipo anotado para usar en las firmas de funciones — mejora legibilidad
DBSession = Annotated[AsyncSession, Depends(get_db)]
