"""
tests/conftest.py
=================
Fixtures compartidas para toda la suite de tests.
"""

import asyncio
import pytest
import pytest_asyncio
from pathlib import Path
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

from app.main import app as fastapi_app
from app.session import get_db
from app.shared.base_model import Base

# Importar todos los modelos para que SQLAlchemy configure los mappers
import app.modules.identity.models      # noqa: F401
import app.modules.health.models        # noqa: F401
import app.modules.nutrition.models     # noqa: F401
import app.modules.routines.models      # noqa: F401
import app.modules.community.models     # noqa: F401
import app.modules.gamification.models  # noqa: F401

TEST_DB_URL = "postgresql+asyncpg://postgres:P%40ssw0rd@localhost:5432/healthstack_test"

# Tablas a truncar entre tests (orden respeta FK)
TRUNCATE_TABLES = [
    "health.health_records",
    "public.data_links",
    "public.community_likes",
    "public.community_posts",
    "public.gamification_states",
    "public.saved_routines",
    "public.user_recipes",
    "public.users",
]

TRUNCATE_SQL = "TRUNCATE " + ", ".join(TRUNCATE_TABLES) + " RESTART IDENTITY CASCADE"


# ── Event loop ────────────────────────────────────────────────────────────────
# MUST be session-scoped so all async fixtures share the SAME event loop.
# asyncpg connections are bound to the loop they were created on — if session-
# scoped and function-scoped fixtures use different loops, asyncpg raises
# "Future attached to a different loop".
@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ── BD de test ────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """Motor SQLAlchemy compartido por toda la sesión de test."""
    eng = create_async_engine(TEST_DB_URL, echo=False, pool_size=5)
    async with eng.begin() as conn:
        await conn.execute(text("CREATE SCHEMA IF NOT EXISTS health"))
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(test_engine):
    """
    Sesión de BD individual por test.
    El TRUNCATE se ejecuta en SETUP (antes del test) para garantizar
    un estado limpio sin depender del teardown (que puede fallar con asyncpg
    cuando el event loop está en estado de finalización).
    """
    # Limpiar ANTES del test — estado limpio garantizado
    async with test_engine.connect() as conn:
        await conn.execute(text(TRUNCATE_SQL))
        await conn.commit()

    factory = async_sessionmaker(test_engine, expire_on_commit=False, autoflush=True)
    session = factory()
    try:
        yield session
    finally:
        try:
            await session.close()
        except Exception:
            pass  # Suprimir errores de cierre en teardown


# ── Rate limiter ──────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """
    Resetea el almacenamiento del rate limiter antes de cada test.
    Evita que las peticiones de un test agoten el límite de los siguientes.
    slowapi usa limits.storage.MemoryStorage que expone reset().
    """
    from app.main import limiter
    try:
        limiter._storage.reset()
    except Exception:
        pass
    yield


# ── Cliente HTTP ──────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="function")
async def client(db_session):
    """Cliente HTTP de test con la BD sobreescrita por db_session."""
    async def override_get_db():
        yield db_session

    fastapi_app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=fastapi_app),
        base_url="http://test",
    ) as ac:
        yield ac
    fastapi_app.dependency_overrides.clear()


# ── Seed de datos de referencia ───────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session")
async def seed_ingredients(test_engine):
    """
    Inserta un ingrediente mínimo de referencia en la BD de test.
    Se ejecuta UNA vez por sesión (los ingredientes no se truncan entre tests).
    """
    async with test_engine.connect() as conn:
        await conn.execute(text("""
            INSERT INTO public.ingredients
                (name, category, quality, calorie_density, satiety_index,
                 protein, carbs, fat, calories, inflammation_base)
            SELECT * FROM (VALUES
                ('Pechuga de pollo', 'protein_high', 'high', 'low', 'high',
                 31.0::float, 0.0::float, 3.6::float, 165.0::float, 'low'),
                ('Arroz integral', 'carb_high', 'medium', 'medium', 'medium',
                 2.7::float, 23.0::float, 1.0::float, 112.0::float, 'low')
            ) AS v(name, category, quality, calorie_density, satiety_index,
                   protein, carbs, fat, calories, inflammation_base)
            WHERE NOT EXISTS (SELECT 1 FROM public.ingredients LIMIT 1)
        """))
        await conn.commit()


# ── Fixtures de usuario ───────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def registered_user(client):
    """Registra un usuario de prueba estándar y devuelve la respuesta con tokens."""
    resp = await client.post("/api/v1/auth/register", json={
        "email": "test@healthstack.com",
        "password": "TestPass123!",
        "display_name": "Test User",
        "consent_gdpr": True,
    })
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest_asyncio.fixture
async def auth_headers(registered_user):
    """Cabeceras Authorization: Bearer <token> para el usuario de prueba."""
    return {"Authorization": f"Bearer {registered_user['access_token']}"}
