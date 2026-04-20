"""
tests/conftest.py
=================
Fixtures compartidas para toda la suite de tests.
"""

import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.main import app
from app.session import get_db
from app.shared.base_model import Base

# BD en memoria SQLite para tests (no toca PostgreSQL de desarrollo)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(engine):
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture(scope="function")
async def client(db_session):
    """Cliente HTTP con BD de test inyectada."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def registered_user(client):
    """Crea y devuelve un usuario registrado con sus tokens."""
    resp = await client.post("/api/v1/auth/register", json={
        "email": "test@healthstack.com",
        "password": "TestPass123!",
        "full_name": "Test User",
        "gdpr_consent": True,
    })
    assert resp.status_code == 201
    return resp.json()


@pytest_asyncio.fixture
async def auth_headers(registered_user):
    """Cabeceras Bearer para endpoints protegidos."""
    token = registered_user["access_token"]
    return {"Authorization": f"Bearer {token}"}
