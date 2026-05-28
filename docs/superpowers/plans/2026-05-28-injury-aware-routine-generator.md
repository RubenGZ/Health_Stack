# Injury-Aware Routine Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add chronic injury registration (CRUD) to the routines module and an AI routine generator that incorporates those injuries as hard constraints.

**Architecture:** New `UserChronicInjury` ORM model lives inside the existing `routines` module (models/schemas/repository/service/router all extended in-place). Injury-aware generation reuses `AIRoutineRequest`/`AIRoutineResponse` schemas; the service injects an injury block into the existing Groq prompt. Cross-module: the same `user_chronic_injuries` table is read by Module B (post-workout coach) via a direct DB query.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, PostgreSQL 17 (JSONB), Groq llama-3.3-70b-versatile via AIRouter, Pydantic v2, Alembic `op.execute()` raw SQL migrations, pytest-asyncio, vanilla JS.

---

## File Map

| Action | File |
|--------|------|
| Modify | `backend/app/services/ai_router/schemas.py` — add `ROUTINE_GENERATION`, `POST_WORKOUT_COACH` to `AIUseCase` |
| Modify | `backend/app/services/ai_router/config.py` — add routing rules for both new use cases |
| Create | `backend/alembic/versions/20260528_0015_injury_coach_tables.py` — both tables (shared migration) |
| Modify | `backend/app/modules/routines/models.py` — add `UserChronicInjury` |
| Modify | `backend/app/modules/routines/schemas.py` — add `ChronicInjuryCreate`, `ChronicInjuryOut` |
| Modify | `backend/app/modules/routines/repository.py` — add `InjuryRepository` class |
| Modify | `backend/app/modules/routines/service.py` — add injury CRUD service methods + `generate_ai_routine_injury_aware()` |
| Modify | `backend/app/modules/routines/router.py` — add 4 new endpoints |
| Create | `backend/tests/integration/test_injury_aware_routine.py` — 5 integration tests |

---

## Task 1 — Add AIUseCase values and routing rules

**Files:**
- Modify: `backend/app/services/ai_router/schemas.py`
- Modify: `backend/app/services/ai_router/config.py`

> Both Module A and Module B need these. Do this once here; Plan B depends on it being done.

- [ ] **Step 1.1: Add two new AIUseCase enum values**

In `backend/app/services/ai_router/schemas.py`, add after `FOOD_VISION`:

```python
    ROUTINE_GENERATION  = "routine_generation"   # Rutinas con restricciones de lesión
    POST_WORKOUT_COACH  = "post_workout_coach"    # Análisis post-entreno y plan siguiente sesión
```

- [ ] **Step 1.2: Add routing rules**

In `backend/app/services/ai_router/config.py`, add to `_DEFAULT_ROUTING` dict (after the `FOOD_VISION` entry):

```python
    # Generación de rutinas injury-aware: Groq llama-3.3 (instruction-following, JSON output)
    AIUseCase.ROUTINE_GENERATION: RoutingRule(
        primary="groq",
        primary_model="llama-3.3-70b-versatile",
        fallback="gemini",
        fallback_model="gemini-2.5-flash",
    ),
    # Coach post-entreno: Groq llama-3.3 (análisis numérico + JSON estructurado)
    AIUseCase.POST_WORKOUT_COACH: RoutingRule(
        primary="groq",
        primary_model="llama-3.3-70b-versatile",
        fallback="gemini",
        fallback_model="gemini-2.5-flash",
    ),
```

- [ ] **Step 1.3: Verify the app still starts**

```bash
docker exec healthstack_backend python -c "from app.services.ai_router.schemas import AIUseCase; print([e.value for e in AIUseCase])"
```

Expected output includes `routine_generation` and `post_workout_coach`.

- [ ] **Step 1.4: Commit**

```bash
git add backend/app/services/ai_router/schemas.py backend/app/services/ai_router/config.py
git commit -m "feat(ai-router): add ROUTINE_GENERATION and POST_WORKOUT_COACH use cases"
```

---

## Task 2 — Alembic migration (both tables)

**Files:**
- Create: `backend/alembic/versions/20260528_0015_injury_coach_tables.py`

> This migration creates BOTH `user_chronic_injuries` (Module A) and `workout_ai_plans` (Module B). Run once, covers both.

- [ ] **Step 2.1: Create migration file**

Create `backend/alembic/versions/20260528_0015_injury_coach_tables.py`:

```python
"""add_injury_coach_tables

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-05-28

Añade:
  - user_chronic_injuries: registro de lesiones crónicas por usuario
  - workout_ai_plans: planes IA post-entrenamiento para la próxima sesión
"""
from __future__ import annotations

from alembic import op

revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE user_chronic_injuries (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            body_area    VARCHAR(30)  NOT NULL,
            injury_label VARCHAR(100) NOT NULL,
            severity     VARCHAR(10)  NOT NULL
                             CHECK (severity IN ('mild', 'moderate', 'severe')),
            notes        TEXT,
            is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
            created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE INDEX ix_user_chronic_injuries_user_active
        ON user_chronic_injuries(user_id, is_active)
    """)
    op.execute("""
        CREATE TABLE workout_ai_plans (
            id                SERIAL       PRIMARY KEY,
            user_id           UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            source_session_id INTEGER      NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
            created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
            expires_at        TIMESTAMPTZ,
            plan_json         JSONB        NOT NULL,
            coach_notes       TEXT,
            deload_signal     BOOLEAN      NOT NULL DEFAULT FALSE,
            used              BOOLEAN      NOT NULL DEFAULT FALSE,
            UNIQUE (source_session_id)
        )
    """)
    op.execute("""
        CREATE INDEX ix_workout_ai_plans_user_unused
        ON workout_ai_plans(user_id, used, expires_at)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_workout_ai_plans_user_unused")
    op.execute("DROP TABLE  IF EXISTS workout_ai_plans")
    op.execute("DROP INDEX IF EXISTS ix_user_chronic_injuries_user_active")
    op.execute("DROP TABLE  IF EXISTS user_chronic_injuries")
```

- [ ] **Step 2.2: Run migration in Pi**

```bash
docker exec healthstack_backend alembic upgrade head
```

Expected: `Running upgrade b8c9d0e1f2a3 -> c9d0e1f2a3b4, add_injury_coach_tables`

- [ ] **Step 2.3: Verify tables exist**

```bash
docker exec healthstack_db psql -U postgres -d healthstack -c "\dt user_chronic_injuries"
docker exec healthstack_db psql -U postgres -d healthstack -c "\dt workout_ai_plans"
```

- [ ] **Step 2.4: Commit**

```bash
git add backend/alembic/versions/20260528_0015_injury_coach_tables.py
git commit -m "feat(db): migration add_injury_coach_tables (user_chronic_injuries + workout_ai_plans)"
```

---

## Task 3 — UserChronicInjury ORM model

**Files:**
- Modify: `backend/app/modules/routines/models.py`

- [ ] **Step 3.1: Write failing import test**

Create a temporary check (just run Python inline, no test file yet):

```bash
docker exec healthstack_backend python -c "from app.modules.routines.models import UserChronicInjury; print('NOT YET')" 2>&1 | grep -E "ImportError|NOT YET"
```

Expected: `ImportError` (model doesn't exist yet).

- [ ] **Step 3.2: Add UserChronicInjury to models.py**

At the bottom of `backend/app/modules/routines/models.py`, add:

```python
import uuid as _uuid_module
from sqlalchemy import Boolean, CheckConstraint, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID


class UserChronicInjury(Base, TimestampMixin):
    """Lesión crónica registrada por el usuario. Soft-delete con is_active."""

    __tablename__ = "user_chronic_injuries"

    id = Column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=_uuid_module.uuid4,
    )
    user_id = Column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    body_area = Column(String(30), nullable=False)
    injury_label = Column(String(100), nullable=False)
    severity = Column(
        String(10),
        nullable=False,
        # Constraint duplicada aquí para que ORM rechace valores inválidos en tests
    )
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    __table_args__ = (
        CheckConstraint("severity IN ('mild','moderate','severe')", name="ck_injury_severity"),
    )
```

> Note: `Base` and `TimestampMixin` are already imported at the top of models.py. Check that `Column` is also imported and add it if missing.

- [ ] **Step 3.3: Verify import succeeds**

```bash
docker exec healthstack_backend python -c "from app.modules.routines.models import UserChronicInjury; print('OK', UserChronicInjury.__tablename__)"
```

Expected: `OK user_chronic_injuries`

- [ ] **Step 3.4: Commit**

```bash
git add backend/app/modules/routines/models.py
git commit -m "feat(routines): add UserChronicInjury ORM model"
```

---

## Task 4 — Pydantic schemas

**Files:**
- Modify: `backend/app/modules/routines/schemas.py`

- [ ] **Step 4.1: Add schemas to schemas.py**

Add at the end of `backend/app/modules/routines/schemas.py`:

```python
import uuid
from typing import Literal, Optional
from pydantic import BaseModel, Field

# Re-export BodyArea from rehab for validation convenience
from app.modules.rehab.schemas import BodyArea


class ChronicInjuryCreate(BaseModel):
    body_area: BodyArea
    injury_label: str = Field(..., min_length=1, max_length=100)
    severity: Literal["mild", "moderate", "severe"]
    notes: Optional[str] = Field(None, max_length=500)


class ChronicInjuryOut(BaseModel):
    id: uuid.UUID
    body_area: str
    injury_label: str
    severity: str
    notes: Optional[str]
    is_active: bool

    model_config = {"from_attributes": True}
```

- [ ] **Step 4.2: Verify import**

```bash
docker exec healthstack_backend python -c "from app.modules.routines.schemas import ChronicInjuryCreate, ChronicInjuryOut; print('OK')"
```

- [ ] **Step 4.3: Commit**

```bash
git add backend/app/modules/routines/schemas.py
git commit -m "feat(routines): add ChronicInjuryCreate and ChronicInjuryOut schemas"
```

---

## Task 5 — InjuryRepository

**Files:**
- Modify: `backend/app/modules/routines/repository.py`

- [ ] **Step 5.1: Add InjuryRepository class to repository.py**

Add at the bottom of `backend/app/modules/routines/repository.py`:

```python
from app.modules.routines.models import UserChronicInjury


class InjuryRepository:

    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        user_id: uuid.UUID,
        body_area: str,
        injury_label: str,
        severity: str,
        notes: str | None,
    ) -> UserChronicInjury:
        injury = UserChronicInjury(
            user_id=user_id,
            body_area=body_area,
            injury_label=injury_label,
            severity=severity,
            notes=notes,
        )
        db.add(injury)
        await db.flush()
        await db.refresh(injury)
        return injury

    @staticmethod
    async def list_active(
        db: AsyncSession,
        user_id: uuid.UUID,
    ) -> list[UserChronicInjury]:
        result = await db.execute(
            select(UserChronicInjury).where(
                UserChronicInjury.user_id == user_id,
                UserChronicInjury.is_active == True,  # noqa: E712
            ).order_by(UserChronicInjury.created_at.asc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_by_id(
        db: AsyncSession,
        injury_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> UserChronicInjury | None:
        result = await db.execute(
            select(UserChronicInjury).where(
                UserChronicInjury.id == injury_id,
                UserChronicInjury.user_id == user_id,
                UserChronicInjury.is_active == True,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def soft_delete(db: AsyncSession, injury: UserChronicInjury) -> None:
        injury.is_active = False
        await db.flush()
```

> Make sure `select` is imported from `sqlalchemy` at the top — it already is in this file.

- [ ] **Step 5.2: Verify import**

```bash
docker exec healthstack_backend python -c "from app.modules.routines.repository import InjuryRepository; print('OK')"
```

- [ ] **Step 5.3: Commit**

```bash
git add backend/app/modules/routines/repository.py
git commit -m "feat(routines): add InjuryRepository (CRUD for user_chronic_injuries)"
```

---

## Task 6 — RoutineService: injury CRUD + injury-aware AI generation

**Files:**
- Modify: `backend/app/modules/routines/service.py`

- [ ] **Step 6.1: Add injury service methods and prompt builder to service.py**

Add the following to `backend/app/modules/routines/service.py`:

```python
# ── Imports adicionales (al principio del archivo) ───────────────────────────
import uuid
import json
import logging
from app.modules.routines.repository import InjuryRepository
from app.modules.routines.schemas import ChronicInjuryCreate, ChronicInjuryOut
from app.services.ai_router.dependencies import get_ai_router
from app.services.ai_router.schemas import AIMessage, AIRequest, AIUseCase
from app.services.ai_router.base import AIProviderError
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ── Severity constraint descriptions (usadas en el prompt) ───────────────────
_SEVERITY_CONSTRAINTS = {
    "mild": (
        "evitar variantes de alta carga, sustituir con alternativas de bajo impacto articular"
    ),
    "moderate": (
        "excluir todo ejercicio con estrés directo sobre la articulación afectada; "
        "usar solo ejercicios rehab-compatibles"
    ),
    "severe": (
        "evitación completa de toda la cadena cinética afectada"
    ),
}


def _build_injury_prompt_block(injuries: list) -> str:
    """Construye el bloque de restricciones para el prompt de generación de rutinas."""
    if not injuries:
        return ""
    lines = [
        "RESTRICCIONES POR LESIONES CRÓNICAS DEL USUARIO:",
    ]
    for inj in injuries:
        constraint = _SEVERITY_CONSTRAINTS.get(inj.severity, "precaución adicional")
        lines.append(f"- {inj.body_area} (severidad: {inj.severity}): {constraint}.")
    lines.append("")
    lines.append(
        'REGLA IMPORTANTE: Para cada ejercicio que involucre una zona lesionada, incluye en el '
        'campo "notes" del ejercicio la modificación aplicada y el motivo.'
    )
    return "\n".join(lines)
```

- [ ] **Step 6.2: Add injury CRUD service methods to RoutineService class**

Inside the `RoutineService` class (or as module-level async functions following the existing pattern), add:

```python
class InjuryService:
    """Servicio para CRUD de lesiones crónicas."""

    @staticmethod
    async def list_injuries(db: AsyncSession, user_id: str) -> list[ChronicInjuryOut]:
        uid = uuid.UUID(user_id)
        injuries = await InjuryRepository.list_active(db, uid)
        return [ChronicInjuryOut.model_validate(i) for i in injuries]

    @staticmethod
    async def create_injury(
        db: AsyncSession, user_id: str, data: ChronicInjuryCreate
    ) -> ChronicInjuryOut:
        uid = uuid.UUID(user_id)
        injury = await InjuryRepository.create(
            db,
            user_id=uid,
            body_area=data.body_area,
            injury_label=data.injury_label,
            severity=data.severity,
            notes=data.notes,
        )
        return ChronicInjuryOut.model_validate(injury)

    @staticmethod
    async def delete_injury(
        db: AsyncSession, user_id: str, injury_id: str
    ) -> None:
        """Soft-delete. Lanza 404 si no existe o no pertenece al usuario."""
        from fastapi import HTTPException
        uid = uuid.UUID(user_id)
        iid = uuid.UUID(injury_id)
        injury = await InjuryRepository.get_by_id(db, iid, uid)
        if not injury:
            raise HTTPException(status_code=404, detail="Lesión no encontrada")
        await InjuryRepository.soft_delete(db, injury)
```

- [ ] **Step 6.3: Add generate_ai_routine_injury_aware to service.py**

Add this function at module level (outside any class, after `InjuryService`):

```python
async def generate_ai_routine_injury_aware(
    request: "AIRoutineRequest",
    db: AsyncSession,
    user_id: str,
    ai_router,
) -> "AIRoutineResponse":
    """
    Genera una rutina adaptada a las lesiones crónicas del usuario.
    Si el usuario no tiene lesiones activas, delega a generate_ai_routine().
    Siempre devuelve una respuesta válida (fallback estático si la IA falla).
    """
    uid = uuid.UUID(user_id)
    injuries = await InjuryRepository.list_active(db, uid)

    if not injuries:
        # Sin lesiones → ruta estándar (sin coste extra de AI)
        return await generate_ai_routine(request)

    injury_block = _build_injury_prompt_block(injuries)

    # Prompt base (mismo que generate_ai_routine)
    base_prompt = f"""Eres un entrenador personal experto. Genera una rutina de entrenamiento estructurada en JSON.

Parámetros:
- Objetivo: {request.goal}
- Nivel: {request.level}
- Días por semana: {request.days_per_week}
- Equipamiento: {request.equipment}

{injury_block}

Responde SOLO con JSON válido con esta estructura exacta:
{{
  "label": "Nombre descriptivo de la rutina",
  "description": "Descripción breve de 1-2 frases",
  "days_per_week": {request.days_per_week},
  "focus_area": "área principal",
  "days": [
    {{
      "day_number": 1,
      "name": "Nombre del día",
      "exercises": [
        {{
          "exercise_key": "clave_snake_case",
          "exercise_name": "Nombre del ejercicio",
          "sets": 3,
          "reps": "8-12",
          "rest_secs": 90,
          "notes": "nota sobre modificación si aplica"
        }}
      ]
    }}
  ]
}}"""

    _STATIC_FALLBACK = AIRoutineResponse(
        label="Rutina de fuerza adaptada",
        description="Rutina adaptada a tus restricciones. Ajusta los ejercicios según tus sensaciones.",
        days_per_week=request.days_per_week,
        focus_area=request.goal,
        days=[],
    )

    try:
        from app.services.ai_router.schemas import AIMessage, AIRequest, AIUseCase
        from app.services.ai_router.base import AIProviderError

        response = await ai_router.call(
            use_case=AIUseCase.ROUTINE_GENERATION,
            request=AIRequest(
                messages=[AIMessage(role="user", content=base_prompt)],
                max_tokens=2048,
                temperature=0.7,
                timeout_s=30.0,
                response_format="json_object",
            ),
        )
        data = json.loads(response.content)
        return AIRoutineResponse(**data)

    except (AIProviderError, json.JSONDecodeError, Exception) as exc:
        logger.warning("generate_ai_routine_injury_aware fallback: %s", exc)
        return _STATIC_FALLBACK
```

> Note: `generate_ai_routine` and `AIRoutineResponse` are already defined in this file. Import them at the top if they're in a different scope.

- [ ] **Step 6.4: Verify imports**

```bash
docker exec healthstack_backend python -c "from app.modules.routines.service import InjuryService, generate_ai_routine_injury_aware; print('OK')"
```

- [ ] **Step 6.5: Commit**

```bash
git add backend/app/modules/routines/service.py
git commit -m "feat(routines): InjuryService CRUD + generate_ai_routine_injury_aware"
```

---

## Task 7 — Router: 4 new endpoints

**Files:**
- Modify: `backend/app/modules/routines/router.py`

- [ ] **Step 7.1: Add injury endpoints to router.py**

Add at the bottom of `backend/app/modules/routines/router.py`:

```python
from fastapi import Depends
from app.modules.routines.schemas import ChronicInjuryCreate, ChronicInjuryOut
from app.modules.routines.service import InjuryService, generate_ai_routine_injury_aware
from app.services.ai_router.dependencies import get_ai_router
from app.services.ai_router.router import AIRouter


@router.get(
    "/injuries",
    response_model=list[ChronicInjuryOut],
    summary="Listar lesiones crónicas activas",
)
async def list_injuries(
    db: DBSession,
    current_user: CurrentUser,
):
    return await InjuryService.list_injuries(db, current_user["user_id"])


@router.post(
    "/injuries",
    response_model=ChronicInjuryOut,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar lesión crónica",
)
async def create_injury(
    body: ChronicInjuryCreate,
    db: DBSession,
    current_user: CurrentUser,
):
    return await InjuryService.create_injury(db, current_user["user_id"], body)


@router.delete(
    "/injuries/{injury_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar lesión crónica (soft delete)",
)
async def delete_injury(
    injury_id: str,
    db: DBSession,
    current_user: CurrentUser,
):
    await InjuryService.delete_injury(db, current_user["user_id"], injury_id)


@router.post(
    "/ai-generate-injury-aware",
    response_model=AIRoutineResponse,
    summary="Generar rutina IA adaptada a lesiones crónicas",
)
async def ai_generate_injury_aware(
    body: AIRoutineRequest,
    db: DBSession,
    current_user: CurrentUser,
    ai_router: AIRouter = Depends(get_ai_router),
):
    """
    Genera una rutina personalizada respetando las lesiones crónicas del usuario.
    Si no hay lesiones, equivale a /ai-generate. Fallback graceful si la IA falla.
    """
    return await generate_ai_routine_injury_aware(
        request=body,
        db=db,
        user_id=current_user["user_id"],
        ai_router=ai_router,
    )
```

- [ ] **Step 7.2: Verify the router loads**

```bash
docker exec healthstack_backend python -c "from app.modules.routines.router import router; print('Endpoints:', len(router.routes))"
```

Expected: 8 routes (was 4, now 8).

- [ ] **Step 7.3: Check OpenAPI shows new endpoints**

```bash
curl -s http://localhost:8000/openapi.json | python3 -c "import sys,json; d=json.load(sys.stdin); print([p for p in d['paths'] if 'injur' in p or 'injury' in p])"
```

Expected: `['/api/v1/routines/injuries', '/api/v1/routines/ai-generate-injury-aware']`

- [ ] **Step 7.4: Commit**

```bash
git add backend/app/modules/routines/router.py
git commit -m "feat(routines): injury CRUD endpoints + ai-generate-injury-aware"
```

---

## Task 8 — Integration tests (5 tests)

**Files:**
- Create: `backend/tests/integration/test_injury_aware_routine.py`

- [ ] **Step 8.1: Write the test file**

Create `backend/tests/integration/test_injury_aware_routine.py`:

```python
"""
Tests de integración — Injury-Aware Routine Generator.

Cubre:
1. CRUD de lesiones: crear, listar, borrar (soft delete)
2. Generación injury-aware SIN lesiones → fallback a standard
3. Generación injury-aware CON lesiones → contexto inyectado en prompt
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

BASE = "/api/v1/routines"

INJURY_PAYLOAD = {
    "body_area": "knee",
    "injury_label": "Menisco derecho",
    "severity": "moderate",
    "notes": "Operado 2022, evitar carga profunda",
}

ROUTINE_REQUEST = {
    "goal": "hypertrophy",
    "level": "intermediate",
    "days_per_week": 3,
    "equipment": "barbell",
}


@pytest.mark.asyncio
async def test_create_and_list_injury(client: AsyncClient, auth_headers: dict):
    """POST /injuries crea la lesión; GET /injuries la devuelve."""
    # Crear
    resp = await client.post(f"{BASE}/injuries", json=INJURY_PAYLOAD, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["body_area"] == "knee"
    assert data["severity"] == "moderate"
    assert data["is_active"] is True
    injury_id = data["id"]

    # Listar
    resp2 = await client.get(f"{BASE}/injuries", headers=auth_headers)
    assert resp2.status_code == 200
    ids = [i["id"] for i in resp2.json()]
    assert injury_id in ids


@pytest.mark.asyncio
async def test_delete_injury_soft(client: AsyncClient, auth_headers: dict):
    """DELETE /injuries/{id} hace soft-delete; la lesión desaparece del GET."""
    # Crear
    resp = await client.post(f"{BASE}/injuries", json=INJURY_PAYLOAD, headers=auth_headers)
    injury_id = resp.json()["id"]

    # Borrar
    del_resp = await client.delete(f"{BASE}/injuries/{injury_id}", headers=auth_headers)
    assert del_resp.status_code == 204

    # Listar → ya no aparece
    list_resp = await client.get(f"{BASE}/injuries", headers=auth_headers)
    ids = [i["id"] for i in list_resp.json()]
    assert injury_id not in ids


@pytest.mark.asyncio
async def test_delete_injury_not_found(client: AsyncClient, auth_headers: dict):
    """DELETE con UUID inexistente → 404."""
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.delete(f"{BASE}/injuries/{fake_id}", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_ai_generate_injury_aware_no_injuries(client: AsyncClient, auth_headers: dict):
    """Sin lesiones registradas, el endpoint devuelve una respuesta válida (fallback o real)."""
    resp = await client.post(
        f"{BASE}/ai-generate-injury-aware", json=ROUTINE_REQUEST, headers=auth_headers
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    # La respuesta debe tener la estructura de AIRoutineResponse
    assert "label" in data
    assert "days_per_week" in data


@pytest.mark.asyncio
async def test_ai_generate_injury_aware_injects_injury_context(
    client: AsyncClient, auth_headers: dict
):
    """Con una lesión registrada, el prompt enviado al AIRouter incluye el body_area."""
    from app.main import app as fastapi_app
    from app.services.ai_router.schemas import AIResponse

    # Registrar una lesión
    await client.post(f"{BASE}/injuries", json=INJURY_PAYLOAD, headers=auth_headers)

    captured: list[str] = []

    class RecorderAIRouter:
        async def call(self, *, use_case, request, user_id=None):
            for msg in request.messages:
                captured.append(msg.content)
            fake_routine = (
                '{"label":"Test","description":"desc","days_per_week":3,'
                '"focus_area":"hypertrophy","days":[]}'
            )
            return AIResponse(
                content=fake_routine,
                provider_used="recorder",
                model_used="recorder",
                tokens_used=0,
                fallback_triggered=False,
            )

    original = getattr(fastapi_app.state, "ai_router", None)
    fastapi_app.state.ai_router = RecorderAIRouter()
    try:
        resp = await client.post(
            f"{BASE}/ai-generate-injury-aware", json=ROUTINE_REQUEST, headers=auth_headers
        )
    finally:
        fastapi_app.state.ai_router = original

    assert resp.status_code == 200, resp.text
    assert captured, "El RecorderAIRouter no capturó ningún prompt"
    # El body_area de la lesión debe aparecer en el prompt
    prompt_blob = "\n".join(captured)
    assert "knee" in prompt_blob, f"'knee' no encontrado en el prompt:\n{prompt_blob}"
    assert "moderate" in prompt_blob, f"'moderate' no encontrado en el prompt"
```

- [ ] **Step 8.2: Run tests to verify they pass**

```bash
docker exec healthstack_backend python -m pytest tests/integration/test_injury_aware_routine.py -v --tb=short
```

Expected: `5 passed`

- [ ] **Step 8.3: Commit**

```bash
git add backend/tests/integration/test_injury_aware_routine.py
git commit -m "test(routines): 5 integration tests for injury CRUD + injury-aware AI generation"
```

---

## Task 9 — Frontend: InjuryManager in routineGenerator.js

**Files:**
- Modify: `frontend/js/routineGenerator.js`

> This file is 1250 lines. Add `InjuryManager` as a new sub-object at the bottom of the file, before the export or IIFE close. Do NOT restructure the existing code.

- [ ] **Step 9.1: Add InjuryManager to routineGenerator.js**

Add the following at the bottom of `frontend/js/routineGenerator.js`, just before the last closing `}` or after the last export:

```javascript
// ── InjuryManager ─────────────────────────────────────────────────────────────
// Sub-módulo de gestión de lesiones crónicas dentro del generador de rutinas.
// Mantiene su propio estado y sección de UI; no toca la lógica existente.
window.InjuryManager = (() => {
  const BASE = '/api/v1/routines/injuries';
  let _injuries = [];

  // ── Severity config ─────────────────────────────────────────────────────────
  const SEVERITY_COLOR = {
    mild:     { bg: 'rgba(196,165,97,0.15)',  border: '#c4a561', label: 'Leve'     },
    moderate: { bg: 'rgba(245,158,11,0.15)',  border: '#f59e0b', label: 'Moderada' },
    severe:   { bg: 'rgba(239,68,68,0.15)',   border: '#ef4444', label: 'Grave'    },
  };

  const BODY_AREAS = [
    { value: 'shoulder',    label: 'Hombro'          },
    { value: 'elbow',       label: 'Codo'            },
    { value: 'wrist',       label: 'Muñeca'          },
    { value: 'lower_back',  label: 'Espalda baja'    },
    { value: 'hip',         label: 'Cadera'          },
    { value: 'knee',        label: 'Rodilla'         },
    { value: 'ankle',       label: 'Tobillo'         },
    { value: 'neck',        label: 'Cuello'          },
    { value: 'thoracic',    label: 'Espalda torácica'},
  ];

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function _authHeaders() {
    const tok = localStorage.getItem('hs_access_token') || sessionStorage.getItem('hs_access_token') || '';
    return tok ? { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  }

  async function _fetchInjuries() {
    try {
      const r = await fetch(BASE, { headers: _authHeaders() });
      if (r.ok) _injuries = await r.json();
    } catch { _injuries = []; }
  }

  async function _createInjury(payload) {
    const r = await fetch(BASE, {
      method: 'POST', headers: _authHeaders(), body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async function _deleteInjury(id) {
    await fetch(`${BASE}/${id}`, { method: 'DELETE', headers: _authHeaders() });
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  function _renderInjuryCard(container) {
    const section = document.createElement('div');
    section.className = 'rg-injury-section';
    section.innerHTML = `
      <div class="rg-injury-header">
        <h3 class="rg-injury-title">Mis lesiones crónicas</h3>
        <button class="btn btn--ghost rg-add-injury-btn" id="rg-add-injury-btn">
          + Añadir lesión
        </button>
      </div>
      <div class="rg-injury-chips" id="rg-injury-chips"></div>
      <div class="rg-injury-form" id="rg-injury-form" style="display:none">
        <select class="rg-select" id="rg-inj-area">
          ${BODY_AREAS.map(a => `<option value="${a.value}">${a.label}</option>`).join('')}
        </select>
        <input class="rg-input" id="rg-inj-label" placeholder="Etiqueta (ej: Rodilla derecha)" maxlength="100" />
        <div class="rg-severity-row">
          <label class="rg-sev-opt"><input type="radio" name="rg-severity" value="mild" checked> Leve</label>
          <label class="rg-sev-opt"><input type="radio" name="rg-severity" value="moderate"> Moderada</label>
          <label class="rg-sev-opt"><input type="radio" name="rg-severity" value="severe"> Grave</label>
        </div>
        <textarea class="rg-textarea" id="rg-inj-notes" placeholder="Notas opcionales (ej: operado 2022)" rows="2" maxlength="500"></textarea>
        <div class="rg-form-actions">
          <button class="btn btn--primary" id="rg-inj-save">Guardar lesión</button>
          <button class="btn btn--ghost" id="rg-inj-cancel">Cancelar</button>
        </div>
      </div>`;

    container.prepend(section);
    _renderChips();
    _bindFormEvents(section);
  }

  function _renderChips() {
    const container = document.getElementById('rg-injury-chips');
    if (!container) return;
    if (!_injuries.length) {
      container.innerHTML = '<span class="rg-no-injuries">Sin lesiones registradas</span>';
      return;
    }
    container.innerHTML = _injuries.map(inj => {
      const cfg = SEVERITY_COLOR[inj.severity] || SEVERITY_COLOR.mild;
      return `<div class="rg-injury-chip"
                   style="background:${cfg.bg};border:1px solid ${cfg.border};border-radius:8px;padding:6px 12px;display:inline-flex;align-items:center;gap:8px;margin:4px;">
        <span style="color:${cfg.border};font-weight:600;font-size:0.75rem">${cfg.label}</span>
        <span style="color:var(--hs-text);font-size:0.875rem">${_esc(inj.injury_label)}</span>
        <button class="rg-chip-del" data-id="${inj.id}"
                style="background:none;border:none;color:var(--hs-text-2);cursor:pointer;padding:0;font-size:1rem;line-height:1">&times;</button>
      </div>`;
    }).join('');

    container.querySelectorAll('.rg-chip-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        await _deleteInjury(id);
        _injuries = _injuries.filter(i => i.id !== id);
        _renderChips();
        _updateGenerateButton();
      });
    });
  }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _bindFormEvents(section) {
    section.querySelector('#rg-add-injury-btn').addEventListener('click', () => {
      section.querySelector('#rg-injury-form').style.display = '';
    });
    section.querySelector('#rg-inj-cancel').addEventListener('click', () => {
      section.querySelector('#rg-injury-form').style.display = 'none';
    });
    section.querySelector('#rg-inj-save').addEventListener('click', async () => {
      const area     = section.querySelector('#rg-inj-area').value;
      const label    = section.querySelector('#rg-inj-label').value.trim();
      const severity = section.querySelector('input[name="rg-severity"]:checked')?.value || 'mild';
      const notes    = section.querySelector('#rg-inj-notes').value.trim() || null;
      if (!label) { if (typeof showToast === 'function') showToast('Escribe una etiqueta para la lesión', 'warning'); return; }
      try {
        const created = await _createInjury({ body_area: area, injury_label: label, severity, notes });
        _injuries.push(created);
        _renderChips();
        _updateGenerateButton();
        section.querySelector('#rg-injury-form').style.display = 'none';
        section.querySelector('#rg-inj-label').value = '';
        section.querySelector('#rg-inj-notes').value = '';
        if (typeof showToast === 'function') showToast('Lesión registrada', 'success');
      } catch (e) {
        if (typeof showToast === 'function') showToast('Error guardando lesión', 'error');
      }
    });
  }

  function _updateGenerateButton() {
    const btn = document.querySelector('[data-action="ai-generate"], #rg-ai-generate-btn, .rg-generate-btn');
    if (!btn) return;
    if (_injuries.length > 0) {
      btn.textContent = '✦ Generar rutina adaptada';
      btn.dataset.injuryAware = 'true';
    } else {
      btn.textContent = '✦ Generar rutina IA';
      btn.dataset.injuryAware = '';
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    async init(containerSelector) {
      await _fetchInjuries();
      const container = document.querySelector(containerSelector);
      if (container) _renderInjuryCard(container);
      _updateGenerateButton();
    },
    getInjuries() { return _injuries; },
    hasInjuries() { return _injuries.length > 0; },
  };
})();
```

- [ ] **Step 9.2: Wire InjuryManager.init() in routineGenerator.js**

Find the existing init/mount function in routineGenerator.js (where the routine generator section is initialized). Add this call after the section renders:

```javascript
// At the end of the routine generator init, after the container is in the DOM:
if (window.InjuryManager) {
  window.InjuryManager.init('.rg-container, #routine-generator-section, [data-section="routineGenerator"]');
}
```

> Find the correct selector by searching for where the routine generator container is rendered. The exact selector may differ.

- [ ] **Step 9.3: Update generate button handler to use injury-aware endpoint**

Find the click handler for the AI generate button in routineGenerator.js. Add injury-aware routing:

```javascript
// Replace the existing generate button click handler with this pattern:
const endpoint = window.InjuryManager?.hasInjuries()
  ? '/api/v1/routines/ai-generate-injury-aware'
  : '/api/v1/routines/ai-generate';

const resp = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(requestPayload),
});
```

- [ ] **Step 9.4: Commit frontend changes**

```bash
git add frontend/js/routineGenerator.js
git commit -m "feat(frontend): add InjuryManager sub-module to routineGenerator.js"
```

---

## Task 10 — SW cache bump

**Files:**
- Modify: `frontend/sw.js`

- [ ] **Step 10.1: Bump CACHE_NAME**

In `frontend/sw.js`, change:
```javascript
const CACHE_NAME = 'healthstack-v72';
```
to:
```javascript
const CACHE_NAME = 'healthstack-v73';
```

- [ ] **Step 10.2: Commit and deploy**

```bash
git add frontend/sw.js
git commit -m "chore(sw): bump cache to v73 (injury manager + routine AI routing)"
```

Then deploy to Pi:
```bash
bash ~/healthstack-pi-server/scripts/update.sh
```

---

## Self-Review Checklist

- [x] **Spec coverage**: injury CRUD (3 endpoints) ✅, ai-generate-injury-aware (1 endpoint) ✅, frontend InjuryManager ✅, migration ✅, tests ✅
- [x] **No placeholders**: all code is complete and runnable
- [x] **Type consistency**: `ChronicInjuryOut.model_validate(injury)` uses correct Pydantic v2 method throughout
- [x] **RGPD**: `injury_label` (user free text) stays in DB only; only `body_area` and `severity` are sent to the AI prompt
- [x] **AIRouter pattern**: uses `ai_router.call()` with `AIUseCase.ROUTINE_GENERATION`, not direct httpx
- [x] **Graceful fallback**: `generate_ai_routine_injury_aware()` catches all exceptions and returns static response
- [x] **Migration down_revision**: `b8c9d0e1f2a3` (latest existing migration) ✓
