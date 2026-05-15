# Workout Logger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulo completo de registro de sesiones de entrenamiento: backend (3 tablas, 4 endpoints), frontend (workoutLogger.js, workoutSession.js, workoutHistory.js), integración con gamificación y bridge para fatigueHeatmap.

**Architecture:** Backend modular FastAPI (Router→Service→Repository→Model). Offline-first: draft en localStorage, bulk POST al finalizar. Carry-forward de peso dentro de sesión, progresión sugerida vs. sesión anterior.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, PostgreSQL 17, Alembic, Pydantic v2, Vanilla JS ES modules.

**Spec:** `docs/superpowers/specs/2026-05-15-workout-logger-design.md`

---

### Task 1: Fix gamificación — añadir acciones 'workout' y 'ranked_promotion'

**Files:**
- Modify: `backend/app/modules/gamification/models.py`
- Modify: `backend/app/modules/gamification/schemas.py`

- [ ] **Step 1: Añadir 'workout' y 'ranked_promotion' a XP_TABLE**

En `backend/app/modules/gamification/models.py`, línea 69, cambiar:

```python
XP_TABLE: dict[str, int] = {
    "weight":           10,
    "tdee":             15,
    "routine":          20,
    "post":              5,
    "recipe":           10,
    "streak":           25,
    "workout":          30,    # sesión de entrenamiento completada
    "ranked_promotion": 50,    # subir de tier en ranked
}
```

- [ ] **Step 2: Actualizar ValidAction en schemas.py**

En `backend/app/modules/gamification/schemas.py`, línea 14:

```python
ValidAction = Literal["weight", "tdee", "routine", "post", "recipe", "streak", "workout", "ranked_promotion"]
```

Actualizar también el `description` del Field en `ActionRequest`:

```python
action: ValidAction = Field(
    ...,
    description="Tipo de acción: 'weight' | 'tdee' | 'routine' | 'post' | 'recipe' | 'streak' | 'workout' | 'ranked_promotion'",
)
```

- [ ] **Step 3: Verificar que los tests existentes de gamificación siguen pasando**

```bash
cd backend
python -m pytest tests/integration/test_gamification.py -v
```

Expected: todos los tests pasan (las nuevas acciones no rompen las existentes).

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/gamification/models.py backend/app/modules/gamification/schemas.py
git commit -m "feat(gamification): add workout and ranked_promotion actions to XP_TABLE"
```

---

### Task 2: Backend models — WorkoutSession, SessionExercise, ExerciseSet

**Files:**
- Create: `backend/app/modules/workout_sessions/__init__.py`
- Create: `backend/app/modules/workout_sessions/models.py`

- [ ] **Step 1: Crear el paquete**

```bash
mkdir -p backend/app/modules/workout_sessions
touch backend/app/modules/workout_sessions/__init__.py
```

- [ ] **Step 2: Escribir models.py**

```python
# backend/app/modules/workout_sessions/models.py
"""
Workout Sessions — tablas para registrar sesiones de entrenamiento.

Diseño: 3 tablas normalizadas.
  WorkoutSession   — cabecera de sesión (usuario, rutina, duración, volumen)
  SessionExercise  — ejercicios realizados en esa sesión
  ExerciseSet      — sets individuales (peso, reps, RPE)

user_id usa UUID(as_uuid=True) porque users.id es UUID — no Integer.
"""
from __future__ import annotations

import uuid
from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey,
    Integer, String, Text, UniqueConstraint, Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.shared.base_model import Base


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"
    __table_args__ = (
        {"schema": "public", "comment": "Cabecera de sesión de entrenamiento."},
    )

    id       = Column(Integer, primary_key=True, autoincrement=True)
    user_id  = Column(
        UUID(as_uuid=True),
        ForeignKey("public.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    routine_id     = Column(Integer, ForeignKey("public.saved_routines.id"), nullable=True)
    started_at     = Column(DateTime(timezone=True), nullable=False)
    finished_at    = Column(DateTime(timezone=True), nullable=True)
    duration_secs  = Column(Integer, nullable=True)
    notes          = Column(Text, nullable=True)
    total_volume_kg = Column(Float, nullable=True)

    exercises = relationship("SessionExercise", back_populates="session", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<WorkoutSession id={self.id} user={str(self.user_id)[:8]}...>"


class SessionExercise(Base):
    __tablename__ = "session_exercises"
    __table_args__ = (
        Index("ix_session_exercises_session_order", "session_id", "order_index"),
        {"schema": "public", "comment": "Ejercicio dentro de una sesión."},
    )

    id           = Column(Integer, primary_key=True, autoincrement=True)
    session_id   = Column(
        Integer,
        ForeignKey("public.workout_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    exercise_key  = Column(String(80), nullable=False)    # snake_case muscleMap key
    exercise_name = Column(String(120), nullable=False)   # nombre legible
    order_index   = Column(Integer, nullable=False)

    session = relationship("WorkoutSession", back_populates="exercises")
    sets    = relationship("ExerciseSet", back_populates="exercise", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<SessionExercise id={self.id} key={self.exercise_key!r}>"


class ExerciseSet(Base):
    __tablename__ = "exercise_sets"
    __table_args__ = (
        {"schema": "public", "comment": "Set individual dentro de un ejercicio de sesión."},
    )

    id                  = Column(Integer, primary_key=True, autoincrement=True)
    session_exercise_id = Column(
        Integer,
        ForeignKey("public.session_exercises.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    set_number   = Column(Integer, nullable=False)
    weight_kg    = Column(Float, nullable=False)
    reps         = Column(Integer, nullable=False)
    rpe          = Column(Float, nullable=True)          # 6.0–10.0, opcional
    is_warmup    = Column(Boolean, default=False, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    exercise = relationship("SessionExercise", back_populates="sets")

    def __repr__(self) -> str:
        return f"<ExerciseSet id={self.id} {self.weight_kg}kg×{self.reps}>"
```

- [ ] **Step 3: Verificar que Python importa el módulo sin errores**

```bash
cd backend
python -c "from app.modules.workout_sessions.models import WorkoutSession, SessionExercise, ExerciseSet; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/workout_sessions/
git commit -m "feat(workout): add WorkoutSession, SessionExercise, ExerciseSet models"
```

---

### Task 3: Migración Alembic

**Files:**
- Create: `backend/alembic/versions/20260515_0007_workout_sessions.py`

- [ ] **Step 1: Generar migración**

```bash
cd backend
alembic revision --autogenerate -m "workout_sessions_tables"
```

Expected: crea un archivo en `alembic/versions/` con las 3 tablas nuevas.

- [ ] **Step 2: Revisar la migración generada**

Abrir el archivo generado y verificar:
- Las 3 tablas aparecen en `upgrade()`
- `user_id` es `postgresql.UUID` (no Integer)
- El índice `ix_session_exercises_session_order` aparece

Si autogenerate no incluye algo, añadirlo manualmente.

- [ ] **Step 3: Aplicar la migración**

```bash
alembic upgrade head
```

Expected: `Running upgrade ... -> ..., workout_sessions_tables` sin errores.

- [ ] **Step 4: Verificar en DB que las tablas existen**

```bash
docker exec healthstack_db psql -U postgres -d healthstack -c "\dt public.workout_sessions public.session_exercises public.exercise_sets"
```

Expected: las 3 tablas aparecen listadas.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/
git commit -m "feat(workout): alembic migration for workout session tables"
```

---

### Task 4: Backend schemas (Pydantic)

**Files:**
- Create: `backend/app/modules/workout_sessions/schemas.py`

- [ ] **Step 1: Escribir schemas.py**

```python
# backend/app/modules/workout_sessions/schemas.py
"""Pydantic v2 schemas para workout sessions."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class SetIn(BaseModel):
    set_number: int    = Field(..., ge=1)
    weight_kg:  float  = Field(..., ge=0)
    reps:       int    = Field(..., ge=0)
    rpe:        Optional[float] = Field(None, ge=6.0, le=10.0)
    is_warmup:  bool   = False
    completed_at: Optional[datetime] = None


class ExerciseIn(BaseModel):
    exercise_key:  str = Field(..., max_length=80)
    exercise_name: str = Field(..., max_length=120)
    order_index:   int = Field(..., ge=0)
    sets: list[SetIn]


class SessionCreateRequest(BaseModel):
    routine_id:  Optional[int] = None
    started_at:  datetime
    finished_at: Optional[datetime] = None
    notes:       Optional[str] = Field(None, max_length=1000)
    exercises:   list[ExerciseIn]


# ── Response schemas ──────────────────────────────────────────────────────────

class PRRecord(BaseModel):
    exercise_key: str
    type:         str          # '1rm_estimated'
    value:        float        # nuevo 1RM
    prev:         Optional[float]  # anterior (None si es el primero)


class SessionCreateResponse(BaseModel):
    session_id:      int
    total_volume_kg: float
    duration_secs:   Optional[int]
    prs:             list[PRRecord]
    xp_awarded:      int


class SessionSummary(BaseModel):
    id:              int
    started_at:      datetime
    duration_secs:   Optional[int]
    total_volume_kg: Optional[float]
    exercises:       list[str]   # lista de exercise_key
    model_config = ConfigDict(from_attributes=True)


class SetOut(BaseModel):
    set_number: int
    weight_kg:  float
    reps:       int
    rpe:        Optional[float]
    is_warmup:  bool
    model_config = ConfigDict(from_attributes=True)


class ExerciseOut(BaseModel):
    id:            int
    exercise_key:  str
    exercise_name: str
    order_index:   int
    sets:          list[SetOut]
    model_config = ConfigDict(from_attributes=True)


class SessionDetail(BaseModel):
    id:              int
    started_at:      datetime
    finished_at:     Optional[datetime]
    duration_secs:   Optional[int]
    total_volume_kg: Optional[float]
    notes:           Optional[str]
    exercises:       list[ExerciseOut]
    model_config = ConfigDict(from_attributes=True)


class SessionListResponse(BaseModel):
    sessions: list[SessionSummary]
    total:    int
    page:     int


class ExerciseHistoryPoint(BaseModel):
    date:             str       # YYYY-MM-DD
    max_weight_kg:    float
    max_reps:         int
    estimated_1rm:    float
    total_volume_kg:  float


class ExerciseHistoryResponse(BaseModel):
    exercise_key: str
    sessions:     list[ExerciseHistoryPoint]
```

- [ ] **Step 2: Verificar importación**

```bash
cd backend
python -c "from app.modules.workout_sessions.schemas import SessionCreateRequest, SessionCreateResponse; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/modules/workout_sessions/schemas.py
git commit -m "feat(workout): add Pydantic schemas for workout sessions"
```

---

### Task 5: Backend repository

**Files:**
- Create: `backend/app/modules/workout_sessions/repository.py`

- [ ] **Step 1: Escribir repository.py**

```python
# backend/app/modules/workout_sessions/repository.py
"""Queries SQLAlchemy async para workout sessions."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import func, select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.workout_sessions.models import WorkoutSession, SessionExercise, ExerciseSet


async def create_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    routine_id: Optional[int],
    started_at: datetime,
    finished_at: Optional[datetime],
    notes: Optional[str],
    total_volume_kg: float,
    exercises_data: list[dict],
) -> WorkoutSession:
    """Inserta sesión completa en una transacción. Devuelve el ORM con ejercicios y sets cargados."""
    duration_secs = None
    if finished_at and started_at:
        duration_secs = int((finished_at - started_at).total_seconds())

    session = WorkoutSession(
        user_id=user_id,
        routine_id=routine_id,
        started_at=started_at,
        finished_at=finished_at,
        duration_secs=duration_secs,
        notes=notes,
        total_volume_kg=total_volume_kg,
    )
    db.add(session)
    await db.flush()  # obtener session.id

    for ex_data in exercises_data:
        ex = SessionExercise(
            session_id=session.id,
            exercise_key=ex_data["exercise_key"],
            exercise_name=ex_data["exercise_name"],
            order_index=ex_data["order_index"],
        )
        db.add(ex)
        await db.flush()  # obtener ex.id

        for s_data in ex_data["sets"]:
            s = ExerciseSet(
                session_exercise_id=ex.id,
                set_number=s_data["set_number"],
                weight_kg=s_data["weight_kg"],
                reps=s_data["reps"],
                rpe=s_data.get("rpe"),
                is_warmup=s_data.get("is_warmup", False),
                completed_at=s_data.get("completed_at"),
            )
            db.add(s)

    await db.commit()
    await db.refresh(session)
    return session


async def get_session_detail(db: AsyncSession, session_id: int, user_id: uuid.UUID) -> Optional[WorkoutSession]:
    """Carga sesión con exercises y sets. Verifica que pertenezca al usuario."""
    result = await db.execute(
        select(WorkoutSession)
        .options(
            selectinload(WorkoutSession.exercises)
            .selectinload(SessionExercise.sets)
        )
        .where(WorkoutSession.id == session_id, WorkoutSession.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def list_sessions(
    db: AsyncSession,
    user_id: uuid.UUID,
    page: int = 1,
    per_page: int = 20,
    exercise_key: Optional[str] = None,
) -> tuple[list[WorkoutSession], int]:
    """Lista sesiones paginadas. Devuelve (sessions, total)."""
    base_q = select(WorkoutSession).where(WorkoutSession.user_id == user_id)

    if exercise_key:
        base_q = base_q.join(WorkoutSession.exercises).where(
            SessionExercise.exercise_key == exercise_key
        )

    count_q = select(func.count()).select_from(base_q.subquery())
    total = (await db.execute(count_q)).scalar_one()

    sessions_q = (
        base_q
        .options(selectinload(WorkoutSession.exercises))
        .order_by(desc(WorkoutSession.started_at))
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    rows = (await db.execute(sessions_q)).scalars().all()
    return list(rows), total


async def get_exercise_history(
    db: AsyncSession,
    user_id: uuid.UUID,
    exercise_key: str,
) -> list[dict]:
    """Historial de un ejercicio: máx peso, 1RM estimado, volumen por sesión."""
    result = await db.execute(
        select(
            WorkoutSession.started_at,
            func.max(ExerciseSet.weight_kg).label("max_weight_kg"),
            func.max(ExerciseSet.reps).label("max_reps"),
            func.sum(ExerciseSet.weight_kg * ExerciseSet.reps).label("total_volume_kg"),
        )
        .join(WorkoutSession.exercises)
        .join(SessionExercise.sets)
        .where(
            WorkoutSession.user_id == user_id,
            SessionExercise.exercise_key == exercise_key,
            ExerciseSet.is_warmup == False,
        )
        .group_by(WorkoutSession.started_at, WorkoutSession.id)
        .order_by(WorkoutSession.started_at)
    )
    rows = result.all()
    return [
        {
            "date": r.started_at.strftime("%Y-%m-%d"),
            "max_weight_kg": float(r.max_weight_kg),
            "max_reps": int(r.max_reps),
            "total_volume_kg": float(r.total_volume_kg),
        }
        for r in rows
    ]


async def get_best_1rm(
    db: AsyncSession,
    user_id: uuid.UUID,
    exercise_key: str,
) -> Optional[float]:
    """Mejor 1RM estimado histórico del usuario para un ejercicio."""
    result = await db.execute(
        select(ExerciseSet.weight_kg, ExerciseSet.reps)
        .join(ExerciseSet.exercise)
        .join(SessionExercise.session)
        .where(
            WorkoutSession.user_id == user_id,
            SessionExercise.exercise_key == exercise_key,
            ExerciseSet.is_warmup == False,
        )
    )
    rows = result.all()
    if not rows:
        return None
    return max(r.weight_kg * (1 + r.reps / 30) for r in rows)
```

- [ ] **Step 2: Verificar importación**

```bash
cd backend
python -c "from app.modules.workout_sessions.repository import create_session; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/modules/workout_sessions/repository.py
git commit -m "feat(workout): add async repository for workout sessions"
```

---

### Task 6: Backend service — Epley, PRs, volumen, gamificación

**Files:**
- Create: `backend/app/modules/workout_sessions/service.py`

- [ ] **Step 1: Escribir service.py**

```python
# backend/app/modules/workout_sessions/service.py
"""Lógica de negocio para workout sessions: Epley 1RM, PR detection, gamificación."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.workout_sessions import repository as repo
from app.modules.workout_sessions.schemas import (
    SessionCreateRequest, SessionCreateResponse, PRRecord,
)


def epley_1rm(weight_kg: float, reps: int) -> float:
    """Epley formula: weight × (1 + reps/30). Si reps=1, devuelve weight."""
    if reps <= 1:
        return float(weight_kg)
    return float(weight_kg * (1 + reps / 30))


def compute_volume(exercises_data: list[dict]) -> float:
    """Suma de weight_kg × reps para todos los sets de trabajo."""
    total = 0.0
    for ex in exercises_data:
        for s in ex["sets"]:
            if not s.get("is_warmup", False):
                total += s["weight_kg"] * s["reps"]
    return round(total, 2)


def detect_prs(
    exercises_data: list[dict],
    prev_bests: dict[str, Optional[float]],
) -> list[PRRecord]:
    """
    Calcula el mejor 1RM de la sesión por ejercicio y compara con el histórico.
    prev_bests: { exercise_key: best_1rm_or_None }
    """
    prs = []
    for ex in exercises_data:
        key = ex["exercise_key"]
        working = [s for s in ex["sets"] if not s.get("is_warmup", False)]
        if not working:
            continue
        session_best = max(epley_1rm(s["weight_kg"], s["reps"]) for s in working)
        prev = prev_bests.get(key)
        if prev is None or session_best > prev:
            prs.append(PRRecord(
                exercise_key=key,
                type="1rm_estimated",
                value=round(session_best, 2),
                prev=round(prev, 2) if prev else None,
            ))
    return prs


async def create_workout_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    request: SessionCreateRequest,
    gamification_service,   # inyectado para no crear ciclo de imports
) -> SessionCreateResponse:
    """
    Orquesta la creación de una sesión:
    1. Calcula volumen total
    2. Obtiene PRs históricos por ejercicio
    3. Detecta nuevos PRs de la sesión
    4. Inserta sesión en DB
    5. Otorga XP de gamificación
    """
    exercises_data = [e.model_dump() for e in request.exercises]

    # Calcular volumen
    total_volume = compute_volume(exercises_data)

    # Obtener best 1RM histórico para cada ejercicio
    prev_bests: dict[str, Optional[float]] = {}
    for ex in exercises_data:
        key = ex["exercise_key"]
        prev_bests[key] = await repo.get_best_1rm(db, user_id, key)

    # Detectar PRs
    prs = detect_prs(exercises_data, prev_bests)

    # Insertar sesión
    session_obj = await repo.create_session(
        db=db,
        user_id=user_id,
        routine_id=request.routine_id,
        started_at=request.started_at,
        finished_at=request.finished_at or datetime.now(timezone.utc),
        notes=request.notes,
        total_volume_kg=total_volume,
        exercises_data=exercises_data,
    )

    # Gamificación: otorgar XP por sesión completada
    xp = 0
    try:
        result = await gamification_service.award_action(db, user_id, "workout")
        xp = result.xp_awarded if result else 0
    except Exception:
        pass  # gamificación no bloquea si falla

    duration_secs = None
    if session_obj.finished_at and session_obj.started_at:
        duration_secs = int((session_obj.finished_at - session_obj.started_at).total_seconds())

    return SessionCreateResponse(
        session_id=session_obj.id,
        total_volume_kg=total_volume,
        duration_secs=duration_secs,
        prs=prs,
        xp_awarded=xp,
    )
```

- [ ] **Step 2: Verificar importación**

```bash
cd backend
python -c "from app.modules.workout_sessions.service import epley_1rm, detect_prs; print(epley_1rm(100, 5))"
```

Expected: `116.66666666666667`

- [ ] **Step 3: Test unitario de epley_1rm y detect_prs**

Crear `tests/unit/test_workout_service.py`:

```python
from app.modules.workout_sessions.service import epley_1rm, detect_prs, compute_volume

def test_epley_1rm_one_rep():
    assert epley_1rm(100, 1) == 100.0

def test_epley_1rm_five_reps():
    result = epley_1rm(100, 5)
    assert abs(result - 116.67) < 0.1

def test_detect_prs_new_pr():
    exercises = [{"exercise_key": "press_banca_plano", "sets": [
        {"weight_kg": 100, "reps": 5, "is_warmup": False}
    ]}]
    prs = detect_prs(exercises, {"press_banca_plano": 110.0})
    assert len(prs) == 0   # 100×5 = ~116.67 > 110 → SÍ es PR

def test_detect_prs_no_pr():
    exercises = [{"exercise_key": "sentadilla", "sets": [
        {"weight_kg": 80, "reps": 3, "is_warmup": False}
    ]}]
    prs = detect_prs(exercises, {"sentadilla": 200.0})
    assert len(prs) == 0   # 80×3 → ~88 < 200

def test_compute_volume_excludes_warmup():
    exercises = [{"exercise_key": "x", "sets": [
        {"weight_kg": 60, "reps": 10, "is_warmup": True},   # warmup: no cuenta
        {"weight_kg": 80, "reps": 8,  "is_warmup": False},  # working: 640
        {"weight_kg": 80, "reps": 6,  "is_warmup": False},  # working: 480
    ]}]
    assert compute_volume(exercises) == 1120.0
```

```bash
cd backend
python -m pytest tests/unit/test_workout_service.py -v
```

Expected: 5 tests pasan.

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/workout_sessions/service.py tests/unit/test_workout_service.py
git commit -m "feat(workout): service with Epley 1RM, PR detection, volume calc"
```

---

### Task 7: Backend router + registro en main.py

**Files:**
- Create: `backend/app/modules/workout_sessions/router.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Escribir router.py**

```python
# backend/app/modules/workout_sessions/router.py
"""Endpoints de workout sessions."""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.session import get_db
from app.core.security.jwt_handler import get_current_user
from app.modules.workout_sessions import repository as repo
from app.modules.workout_sessions import service as svc
from app.modules.workout_sessions.schemas import (
    SessionCreateRequest, SessionCreateResponse,
    SessionDetail, SessionListResponse, SessionSummary,
    ExerciseHistoryResponse, ExerciseHistoryPoint,
)
from app.modules.gamification.service import GamificationService

router = APIRouter(prefix="/api/workout", tags=["workout"])


@router.post("/sessions", response_model=SessionCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: SessionCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Guarda una sesión de entrenamiento completa (bulk insert)."""
    gamification_service = GamificationService()
    return await svc.create_workout_session(
        db=db,
        user_id=current_user.id,
        request=body,
        gamification_service=gamification_service,
    )


@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    exercise_key: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Lista sesiones del usuario, paginadas."""
    sessions, total = await repo.list_sessions(
        db=db, user_id=current_user.id, page=page, per_page=per_page,
        exercise_key=exercise_key,
    )
    summaries = [
        SessionSummary(
            id=s.id,
            started_at=s.started_at,
            duration_secs=s.duration_secs,
            total_volume_kg=s.total_volume_kg,
            exercises=[e.exercise_key for e in s.exercises],
        )
        for s in sessions
    ]
    return SessionListResponse(sessions=summaries, total=total, page=page)


@router.get("/sessions/{session_id}", response_model=SessionDetail)
async def get_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Detalle completo de una sesión."""
    session = await repo.get_session_detail(db, session_id, current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    return session


@router.get("/history/{exercise_key}", response_model=ExerciseHistoryResponse)
async def exercise_history(
    exercise_key: str,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Historial de un ejercicio con 1RM estimado por sesión."""
    rows = await repo.get_exercise_history(db, current_user.id, exercise_key)
    points = [
        ExerciseHistoryPoint(
            date=r["date"],
            max_weight_kg=r["max_weight_kg"],
            max_reps=r["max_reps"],
            estimated_1rm=round(svc.epley_1rm(r["max_weight_kg"], r["max_reps"]), 2),
            total_volume_kg=r["total_volume_kg"],
        )
        for r in rows
    ]
    return ExerciseHistoryResponse(exercise_key=exercise_key, sessions=points)
```

- [ ] **Step 2: Registrar el router en main.py**

Buscar el bloque donde se registran otros routers en `backend/app/main.py` y añadir:

```python
from app.modules.workout_sessions.router import router as workout_router
# ...junto a los otros include_router:
app.include_router(workout_router)
```

- [ ] **Step 3: Levantar el servidor y verificar que los endpoints aparecen**

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Abrir `http://localhost:8000/docs` y verificar que aparece la sección "workout" con los 4 endpoints.

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/workout_sessions/router.py backend/app/main.py
git commit -m "feat(workout): router with POST /sessions, GET /sessions, GET /history"
```

---

### Task 8: Tests de integración backend

**Files:**
- Create: `tests/integration/test_workout_sessions.py`

- [ ] **Step 1: Escribir el archivo de tests**

```python
# tests/integration/test_workout_sessions.py
"""Tests de integración para workout sessions."""
import pytest
from httpx import AsyncClient


SESSION_PAYLOAD = {
    "started_at": "2026-05-15T10:00:00Z",
    "finished_at": "2026-05-15T11:15:00Z",
    "notes": "Test session",
    "exercises": [
        {
            "exercise_key": "press_banca_plano",
            "exercise_name": "Press banca plano",
            "order_index": 0,
            "sets": [
                {"set_number": 1, "weight_kg": 60, "reps": 10, "is_warmup": True},
                {"set_number": 2, "weight_kg": 80, "reps": 8,  "is_warmup": False},
                {"set_number": 3, "weight_kg": 82.5, "reps": 6, "is_warmup": False},
            ],
        }
    ],
}


@pytest.mark.asyncio
async def test_create_session_success(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/workout/sessions", json=SESSION_PAYLOAD, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["session_id"] > 0
    assert data["total_volume_kg"] == pytest.approx(80 * 8 + 82.5 * 6, abs=0.1)
    assert data["xp_awarded"] == 30


@pytest.mark.asyncio
async def test_create_session_detects_pr(client: AsyncClient, auth_headers: dict):
    # Primera sesión establece el baseline
    await client.post("/api/workout/sessions", json=SESSION_PAYLOAD, headers=auth_headers)
    # Segunda sesión con más peso → debe detectar PR
    heavy = {**SESSION_PAYLOAD, "started_at": "2026-05-16T10:00:00Z"}
    heavy["exercises"][0]["sets"][2] = {"set_number": 3, "weight_kg": 100, "reps": 8, "is_warmup": False}
    resp = await client.post("/api/workout/sessions", json=heavy, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert any(pr["exercise_key"] == "press_banca_plano" for pr in data["prs"])


@pytest.mark.asyncio
async def test_list_sessions(client: AsyncClient, auth_headers: dict):
    await client.post("/api/workout/sessions", json=SESSION_PAYLOAD, headers=auth_headers)
    resp = await client.get("/api/workout/sessions", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert len(data["sessions"]) >= 1


@pytest.mark.asyncio
async def test_get_session_detail(client: AsyncClient, auth_headers: dict):
    create_resp = await client.post("/api/workout/sessions", json=SESSION_PAYLOAD, headers=auth_headers)
    session_id = create_resp.json()["session_id"]
    resp = await client.get(f"/api/workout/sessions/{session_id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["exercises"]) == 1
    assert len(data["exercises"][0]["sets"]) == 3


@pytest.mark.asyncio
async def test_exercise_history(client: AsyncClient, auth_headers: dict):
    await client.post("/api/workout/sessions", json=SESSION_PAYLOAD, headers=auth_headers)
    resp = await client.get("/api/workout/history/press_banca_plano", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["sessions"]) >= 1
    assert data["sessions"][0]["estimated_1rm"] > data["sessions"][0]["max_weight_kg"]


@pytest.mark.asyncio
async def test_session_requires_auth(client: AsyncClient):
    resp = await client.post("/api/workout/sessions", json=SESSION_PAYLOAD)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_session_not_found_returns_404(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/workout/sessions/99999", headers=auth_headers)
    assert resp.status_code == 404
```

- [ ] **Step 2: Verificar que `auth_headers` fixture existe en conftest.py**

Buscar en `tests/conftest.py` si hay una fixture `auth_headers`. Si no existe, añadir:

```python
@pytest.fixture
async def auth_headers(client: AsyncClient) -> dict:
    """Registra usuario de test y devuelve headers con JWT."""
    await client.post("/api/v1/auth/register", json={
        "email": "workout_test@test.com",
        "username": "workout_test",
        "password": "TestPass123!",
    })
    resp = await client.post("/api/v1/auth/login", json={
        "email": "workout_test@test.com",
        "password": "TestPass123!",
    })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
```

- [ ] **Step 3: Ejecutar los tests**

```bash
cd backend
python -m pytest tests/integration/test_workout_sessions.py -v
```

Expected: 7 tests pasan.

- [ ] **Step 4: Ejecutar la suite completa**

```bash
python -m pytest -v --tb=short
```

Expected: todos los tests anteriores siguen pasando.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/test_workout_sessions.py tests/conftest.py
git commit -m "test(workout): integration tests for workout sessions API"
```

---

### Task 9: Frontend — workoutSession.js (modelo de datos)

**Files:**
- Create: `frontend/js/workoutSession.js`

- [ ] **Step 1: Escribir workoutSession.js**

```js
// frontend/js/workoutSession.js
// Modelo de datos para la sesión activa — localStorage draft + carry-forward + progresión.

const DRAFT_KEY = 'hs_workout_active';
const HISTORY_KEY = 'hs_workout_sessions_local';
const MAX_HISTORY = 90;      // sesiones locales guardadas
const TARGET_REPS = 8;       // reps objetivo para sugerir progresión

// ── resolveExerciseKey ────────────────────────────────────────────────────────

const EXERCISE_NAME_MAP = {
  'press banca plano':         'press_banca_plano',
  'press banca':               'press_banca_plano',
  'press inclinado':           'press_banca_inclinado',
  'aperturas':                 'aperturas_mancuernas',
  'fondos':                    'fondos_pecho',
  'fondos pecho':              'fondos_pecho',
  'flexiones diamante':        'flexiones_diamante',
  'dominadas':                 'dominadas_pronas',
  'dominadas pronas':          'dominadas_pronas',
  'remo barra':                'remo_barra',
  'jalon':                     'jalon_pecho',
  'jalón':                     'jalon_pecho',
  'remo mancuerna':            'remo_mancuerna',
  'peso muerto':               'peso_muerto_convencional',
  'peso muerto convencional':  'peso_muerto_convencional',
  'press militar':             'press_militar_barra',
  'press militar barra':       'press_militar_barra',
  'elevaciones laterales':     'elevaciones_laterales',
  'pajaros':                   'pajaros_mancuernas',
  'pájaros':                   'pajaros_mancuernas',
  'face pull':                 'face_pull',
  'curl barra':                'curl_barra',
  'curl martillo':             'curl_martillo',
  'extension triceps':         'extension_triceps_polea',
  'extensión tríceps':         'extension_triceps_polea',
  'press frances':             'press_frances',
  'press francés':             'press_frances',
  'plancha':                   'plancha',
  'crunch':                    'crunch',
  'ab wheel':                  'ab_wheel',
  'plancha lateral':           'plancha_lateral',
  'sentadilla':                'sentadilla',
  'prensa':                    'prensa_piernas',
  'prensa piernas':            'prensa_piernas',
  'extension cuadriceps':      'extension_cuadriceps',
  'extensión cuádriceps':      'extension_cuadriceps',
  'curl femoral':              'curl_femoral_tumbado',
  'sentadilla bulgara':        'sentadilla_bulgara',
  'sentadilla búlgara':        'sentadilla_bulgara',
  'hip thrust':                'hip_thrust',
  'kickback':                  'kickback_cable',
  'puente gluteos':            'puente_gluteos',
  'puente glúteos':            'puente_gluteos',
  'burpees':                   'burpees',
  'comba':                     'jump_rope',
  'saltar comba':              'jump_rope',
  'remo maquina':              'remo_maquina',
  'remo máquina':              'remo_maquina',
};

export function resolveExerciseKey(name) {
  const normalized = name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');  // quita tildes
  return EXERCISE_NAME_MAP[normalized] ?? normalized.replace(/\s+/g, '_');
}

// ── Draft: sesión activa ──────────────────────────────────────────────────────

export function getDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
  } catch { return null; }
}

export function saveDraft(session) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(session)); } catch {}
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

export function startSession(routineId = null) {
  const draft = {
    routineId,
    startedAt: new Date().toISOString(),
    exercises: [],
  };
  saveDraft(draft);
  return draft;
}

export function addExercise(session, name) {
  const key = resolveExerciseKey(name);
  const ex = { key, name, orderIndex: session.exercises.length, sets: [] };
  session.exercises.push(ex);
  saveDraft(session);
  return ex;
}

export function addSet(session, exerciseKey) {
  const ex = session.exercises.find(e => e.key === exerciseKey);
  if (!ex) return null;
  const last = ex.sets[ex.sets.length - 1];
  const newSet = {
    setNumber:   last ? last.setNumber + 1 : 1,
    weightKg:    last ? last.weightKg : getSuggestedWeight(exerciseKey) ?? 0,
    reps:        last ? last.reps : TARGET_REPS,
    rpe:         null,
    isWarmup:    false,
    completedAt: null,
  };
  ex.sets.push(newSet);
  saveDraft(session);
  return newSet;
}

export function updateSet(session, exerciseKey, setIndex, patch) {
  const ex = session.exercises.find(e => e.key === exerciseKey);
  if (!ex || !ex.sets[setIndex]) return;
  Object.assign(ex.sets[setIndex], patch);
  saveDraft(session);
}

// ── Historial local ───────────────────────────────────────────────────────────

export function getLocalSessions() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch { return []; }
}

export function saveToLocalHistory(sessionData) {
  const history = getLocalSessions();
  history.unshift(sessionData);                      // más reciente primero
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
}

// ── Progresión: peso sugerido ─────────────────────────────────────────────────

export function getSuggestedWeight(exerciseKey) {
  const history = getLocalSessions();
  const prevSession = history.find(s =>
    s.exercises && s.exercises.some(e => e.key === exerciseKey)
  );
  if (!prevSession) return null;

  const prevEx = prevSession.exercises.find(e => e.key === exerciseKey);
  const working = (prevEx.sets || []).filter(s => !s.isWarmup);
  if (!working.length) return null;

  const maxWeight = Math.max(...working.map(s => s.weightKg));
  const allHitTarget = working.every(s => s.reps >= TARGET_REPS);
  return allHitTarget ? maxWeight + 2.5 : maxWeight;
}

export function getPrevSessionSummary(exerciseKey) {
  const history = getLocalSessions();
  const prev = history.find(s =>
    s.exercises && s.exercises.some(e => e.key === exerciseKey)
  );
  if (!prev) return null;
  const prevEx = prev.exercises.find(e => e.key === exerciseKey);
  const date = new Date(prev.startedAt).toLocaleDateString('es-ES', { day:'numeric', month:'short' });
  const setsStr = (prevEx.sets || [])
    .filter(s => !s.isWarmup)
    .map(s => `${s.weightKg}×${s.reps}`)
    .join(' | ');
  return { date, setsStr };
}
```

- [ ] **Step 2: Verificar sintaxis**

Abrir DevTools en el navegador o usar Node:

```bash
node --input-type=module < frontend/js/workoutSession.js
```

Expected: sin errores (el módulo se evalúa limpiamente).

- [ ] **Step 3: Commit**

```bash
git add frontend/js/workoutSession.js
git commit -m "feat(workout): workoutSession.js - draft model, carry-forward, progression"
```

---

### Task 10: Frontend — workoutLogger.js (UI)

**Files:**
- Create: `frontend/js/workoutLogger.js`

- [ ] **Step 1: Escribir workoutLogger.js**

```js
// frontend/js/workoutLogger.js
// UI de registro de sesión: estados IDLE / ACTIVE / SUMMARY.
import * as Session from './workoutSession.js';

let _root = null;
let _session = null;
let _timerInterval = null;

export function init(container) {
  _root = container;
  const draft = Session.getDraft();
  if (draft) {
    _session = draft;
    renderActive();
  } else {
    renderIdle();
  }
}

// ── IDLE ─────────────────────────────────────────────────────────────────────

function renderIdle() {
  _root.innerHTML = `
    <div class="wl-idle">
      <p class="wl-idle-hint">¿Listo para entrenar?</p>
      <button class="btn-primary wl-start-btn" id="wl-start">Iniciar sesión</button>
    </div>`;
  _root.querySelector('#wl-start').addEventListener('click', onStart);
}

function onStart() {
  _session = Session.startSession();
  renderActive();
}

// ── ACTIVE ────────────────────────────────────────────────────────────────────

function renderActive() {
  _root.innerHTML = `
    <div class="wl-active">
      <div class="wl-header">
        <span class="wl-timer" id="wl-timer">00:00</span>
        <button class="btn-danger wl-finish-btn" id="wl-finish">Finalizar sesión</button>
      </div>
      <div id="wl-exercises" class="wl-exercises"></div>
      <div class="wl-add-exercise">
        <input type="text" id="wl-ex-input" placeholder="Añadir ejercicio..." class="wl-input" autocomplete="off" />
        <button class="btn-secondary" id="wl-add-ex">+ Añadir</button>
      </div>
    </div>`;

  startTimer();
  renderExercises();

  _root.querySelector('#wl-finish').addEventListener('click', onFinish);
  _root.querySelector('#wl-add-ex').addEventListener('click', onAddExercise);
  _root.querySelector('#wl-ex-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') onAddExercise();
  });
}

function startTimer() {
  const el = _root.querySelector('#wl-timer');
  const start = new Date(_session.startedAt);
  clearInterval(_timerInterval);
  _timerInterval = setInterval(() => {
    const secs = Math.floor((Date.now() - start) / 1000);
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    if (el) el.textContent = `${m}:${s}`;
  }, 1000);
}

function renderExercises() {
  const container = _root.querySelector('#wl-exercises');
  if (!container) return;
  container.innerHTML = '';
  _session.exercises.forEach((ex, exIdx) => {
    const prev = Session.getPrevSessionSummary(ex.key);
    const div = document.createElement('div');
    div.className = 'wl-exercise';
    div.dataset.key = ex.key;
    div.innerHTML = `
      <div class="wl-ex-header">
        <span class="wl-ex-name">${ex.name}</span>
        ${prev ? `<span class="wl-ex-prev">Última vez (${prev.date}): ${prev.setsStr}</span>` : ''}
      </div>
      <div class="wl-sets" id="wl-sets-${ex.key}"></div>
      <button class="btn-ghost wl-add-set" data-key="${ex.key}">+ Añadir set</button>`;
    container.appendChild(div);
    renderSets(ex);
    div.querySelector('.wl-add-set').addEventListener('click', () => {
      Session.addSet(_session, ex.key);
      renderSets(ex);
    });
  });
}

function renderSets(ex) {
  const container = _root.querySelector(`#wl-sets-${ex.key}`);
  if (!container) return;
  container.innerHTML = '';
  ex.sets.forEach((s, idx) => {
    const suggested = idx === 0 && !s.weightKg ? Session.getSuggestedWeight(ex.key) : null;
    const row = document.createElement('div');
    row.className = `wl-set-row${s.isWarmup ? ' wl-warmup' : ''}`;
    row.innerHTML = `
      <label class="wl-set-num">Set ${s.setNumber}</label>
      <label class="wl-warmup-toggle">
        <input type="checkbox" ${s.isWarmup ? 'checked' : ''} data-idx="${idx}" data-key="${ex.key}" class="wl-is-warmup" />
        <span>Calentamiento</span>
      </label>
      <input type="number" class="wl-weight" value="${s.weightKg || ''}" placeholder="${suggested ? suggested + ' kg' : 'kg'}" min="0" step="0.5" data-idx="${idx}" data-key="${ex.key}" />
      <span class="wl-x">×</span>
      <input type="number" class="wl-reps" value="${s.reps || ''}" placeholder="reps" min="0" data-idx="${idx}" data-key="${ex.key}" />`;
    container.appendChild(row);
  });

  // Eventos de edición
  container.querySelectorAll('.wl-weight').forEach(inp => {
    inp.addEventListener('change', e => {
      const { idx, key } = e.target.dataset;
      Session.updateSet(_session, key, +idx, { weightKg: parseFloat(e.target.value) || 0 });
    });
  });
  container.querySelectorAll('.wl-reps').forEach(inp => {
    inp.addEventListener('change', e => {
      const { idx, key } = e.target.dataset;
      Session.updateSet(_session, key, +idx, { reps: parseInt(e.target.value) || 0 });
    });
  });
  container.querySelectorAll('.wl-is-warmup').forEach(inp => {
    inp.addEventListener('change', e => {
      const { idx, key } = e.target.dataset;
      Session.updateSet(_session, key, +idx, { isWarmup: e.target.checked });
      renderSets(ex);   // re-render para actualizar la clase
    });
  });
}

function onAddExercise() {
  const input = _root.querySelector('#wl-ex-input');
  const name = input?.value?.trim();
  if (!name) return;
  Session.addExercise(_session, name);
  input.value = '';
  renderExercises();
}

async function onFinish() {
  clearInterval(_timerInterval);
  const finishedAt = new Date().toISOString();

  // Construir payload para el backend
  const payload = {
    routine_id: _session.routineId ?? null,
    started_at: _session.startedAt,
    finished_at: finishedAt,
    notes: null,
    exercises: _session.exercises.map(ex => ({
      exercise_key: ex.key,
      exercise_name: ex.name,
      order_index: ex.orderIndex,
      sets: ex.sets.map(s => ({
        set_number: s.setNumber,
        weight_kg:  s.weightKg,
        reps:       s.reps,
        rpe:        s.rpe ?? null,
        is_warmup:  s.isWarmup,
      })),
    })),
  };

  let result = null;
  try {
    const resp = await fetch('/api/workout/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(payload),
    });
    if (resp.ok) result = await resp.json();
  } catch {}

  // Guardar en historial local independientemente del resultado del backend
  Session.saveToLocalHistory({
    id: result?.session_id ?? Date.now(),
    startedAt: _session.startedAt,
    durationSecs: result?.duration_secs ?? null,
    totalVolumeKg: result?.total_volume_kg ?? null,
    exercises: _session.exercises,
  });

  Session.clearDraft();
  renderSummary(result, finishedAt);
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────

function renderSummary(result, finishedAt) {
  const volume = result?.total_volume_kg ? `${result.total_volume_kg.toLocaleString('es-ES')} kg` : '—';
  const xp = result?.xp_awarded ? `+${result.xp_awarded} XP` : '';
  const prs = result?.prs?.length
    ? `<ul class="wl-prs">${result.prs.map(pr => `<li>🏆 PR ${pr.exercise_key.replace(/_/g,' ')}: ${pr.value} kg 1RM</li>`).join('')}</ul>`
    : '';

  _root.innerHTML = `
    <div class="wl-summary">
      <h3 class="wl-summary-title">¡Sesión completada! 💪</h3>
      <div class="wl-summary-stats">
        <div class="wl-stat"><span class="wl-stat-val">${volume}</span><span class="wl-stat-lbl">Volumen total</span></div>
        ${xp ? `<div class="wl-stat"><span class="wl-stat-val">${xp}</span><span class="wl-stat-lbl">Gamificación</span></div>` : ''}
      </div>
      ${prs}
      <button class="btn-secondary wl-done-btn" id="wl-done">Cerrar</button>
    </div>`;
  _root.querySelector('#wl-done').addEventListener('click', () => {
    _session = null;
    renderIdle();
  });
}

// ── Util ──────────────────────────────────────────────────────────────────────

function getAuthHeaders() {
  const token = localStorage.getItem('hs_auth_token') || sessionStorage.getItem('hs_auth_token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/js/workoutLogger.js
git commit -m "feat(workout): workoutLogger.js UI with IDLE/ACTIVE/SUMMARY states"
```

---

### Task 11: Frontend — workoutHistory.js + index.html + fix fatigueHeatmap

**Files:**
- Create: `frontend/js/workoutHistory.js`
- Modify: `frontend/index.html`
- Modify: `frontend/js/fatigueHeatmap.js`

- [ ] **Step 1: Escribir workoutHistory.js**

```js
// frontend/js/workoutHistory.js
// Historial de sesiones + gráfico de progresión canvas.
import { getLocalSessions } from './workoutSession.js';

export function init(container) {
  render(container);
}

function render(container) {
  const sessions = getLocalSessions().slice(0, 10);   // últimas 10 locales
  if (!sessions.length) {
    container.innerHTML = '<p class="wl-history-empty">Aún no hay sesiones registradas.</p>';
    return;
  }
  container.innerHTML = `
    <h3 class="wl-history-title">Historial reciente</h3>
    <div class="wl-session-list">${sessions.map(sessionCard).join('')}</div>
    <div class="wl-chart-section">
      <label class="wl-chart-label">Progresión de ejercicio:</label>
      <select id="wl-chart-select" class="wl-select">${exerciseOptions(sessions)}</select>
      <canvas id="wl-chart" class="wl-chart" height="160"></canvas>
    </div>`;

  const select = container.querySelector('#wl-chart-select');
  if (select) {
    drawChart(container, select.value, sessions);
    select.addEventListener('change', () => drawChart(container, select.value, sessions));
  }
}

function sessionCard(s) {
  const date = new Date(s.startedAt).toLocaleDateString('es-ES', { weekday:'short', day:'numeric', month:'short' });
  const duration = s.durationSecs ? `${Math.round(s.durationSecs / 60)} min` : '';
  const volume   = s.totalVolumeKg ? `${s.totalVolumeKg.toLocaleString('es-ES')} kg` : '';
  const exNames  = (s.exercises || []).map(e => e.name).join(', ');
  return `<div class="wl-session-card">
    <span class="wl-sc-date">${date}</span>
    <span class="wl-sc-exercises">${exNames}</span>
    <span class="wl-sc-meta">${[duration, volume].filter(Boolean).join(' · ')}</span>
  </div>`;
}

function exerciseOptions(sessions) {
  const keys = new Set();
  sessions.forEach(s => (s.exercises || []).forEach(e => keys.add(e.key + '|' + e.name)));
  return [...keys].map(k => {
    const [key, name] = k.split('|');
    return `<option value="${key}">${name}</option>`;
  }).join('');
}

function drawChart(container, exerciseKey, sessions) {
  const canvas = container.querySelector('#wl-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 400;
  canvas.width = W;

  // Recopilar puntos: { date, max1RM }
  const points = sessions
    .filter(s => s.exercises && s.exercises.some(e => e.key === exerciseKey))
    .map(s => {
      const ex = s.exercises.find(e => e.key === exerciseKey);
      const working = (ex.sets || []).filter(s => !s.isWarmup);
      const best = working.length
        ? Math.max(...working.map(s => s.weightKg * (1 + s.reps / 30)))
        : 0;
      return { date: new Date(s.startedAt), val: Math.round(best * 10) / 10 };
    })
    .filter(p => p.val > 0)
    .reverse();   // cronológico

  if (points.length < 2) {
    ctx.clearRect(0, 0, W, 160);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '12px system-ui';
    ctx.fillText('Necesitas al menos 2 sesiones para ver el gráfico.', 20, 80);
    return;
  }

  const H = 160, PAD = 30;
  const maxVal = Math.max(...points.map(p => p.val));
  const minVal = Math.min(...points.map(p => p.val));
  const range  = maxVal - minVal || 1;
  const toX = i => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const toY = v => H - PAD - ((v - minVal) / range) * (H - PAD * 2);

  ctx.clearRect(0, 0, W, H);

  // Línea
  ctx.beginPath();
  ctx.strokeStyle = '#7c6bff';
  ctx.lineWidth = 2;
  points.forEach((p, i) => i === 0 ? ctx.moveTo(toX(i), toY(p.val)) : ctx.lineTo(toX(i), toY(p.val)));
  ctx.stroke();

  // Puntos + valores
  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(toX(i), toY(p.val), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#7c6bff';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px system-ui';
    ctx.fillText(`${p.val}`, toX(i) - 10, toY(p.val) - 8);
  });
}
```

- [ ] **Step 2: Añadir sección #workout-section en index.html**

Buscar en `frontend/index.html` la sección de gamificación o ejercicios y añadir después:

```html
<!-- Sección Entrenos -->
<section id="workout-section" class="health-card" style="display:none;">
  <h2 class="section-title">Entrenos</h2>
  <div id="workout-logger-root"></div>
  <div id="workout-history-root" style="margin-top:16px;"></div>
</section>
```

Añadir en el menú de navegación (junto a los otros ítems):

```html
<button class="nav-btn" data-section="workout-section">Entrenos</button>
```

- [ ] **Step 3: Inicializar módulos en el JS principal**

En `frontend/js/main.js` o `health.js` (donde se inicializan los módulos), añadir:

```js
import { init as initLogger } from './workoutLogger.js';
import { init as initHistory } from './workoutHistory.js';

// Dentro del bloque de inicialización de la sección workout:
const loggerRoot = document.getElementById('workout-logger-root');
const historyRoot = document.getElementById('workout-history-root');
if (loggerRoot) initLogger(loggerRoot);
if (historyRoot) initHistory(historyRoot);
```

- [ ] **Step 4: Fix fatigueHeatmap.js — leer hs_workout_sessions_local**

En `frontend/js/fatigueHeatmap.js`, localizar la función `getLastTrained()` (actualmente en línea ~21).
Añadir la lectura de `hs_workout_sessions_local` ANTES de la lectura de `hs_pr_records`:

```js
function getLastTrained() {
  var lastTrained = {};

  // Fuente 1: workout logger (nueva, prioritaria)
  try {
    var sessions = JSON.parse(localStorage.getItem('hs_workout_sessions_local') || '[]');
    sessions.forEach(function(session) {
      var date = new Date(session.startedAt);
      (session.exercises || []).forEach(function(ex) {
        Object.keys(MUSCLE_MAP).forEach(function(muscle) {
          var keywords = MUSCLE_MAP[muscle];
          var matches = keywords.some(function(kw) {
            return (ex.name || '').toLowerCase().indexOf(kw.toLowerCase()) !== -1;
          });
          if (matches && (!lastTrained[muscle] || date > lastTrained[muscle])) {
            lastTrained[muscle] = date;
          }
        });
      });
    });
  } catch(e) {}

  // Fuente 2: hs_pr_records legacy (fallback)
  try {
    var prs = JSON.parse(localStorage.getItem('hs_pr_records') || '{}');
    // ... resto de la lógica existente, sin cambios ...
```

- [ ] **Step 5: Commit**

```bash
git add frontend/js/workoutHistory.js frontend/js/workoutLogger.js frontend/js/fatigueHeatmap.js frontend/index.html
git commit -m "feat(workout): workoutHistory.js, index.html section, fatigueHeatmap bridge fix"
```

---

### Task 12: CSS para workout logger

**Files:**
- Modify: `frontend/css/main.css`

- [ ] **Step 1: Añadir estilos al final de main.css**

```css
/* ── Workout Logger ──────────────────────────────────────────────────── */
.wl-idle { text-align: center; padding: 32px 16px; }
.wl-idle-hint { color: rgba(255,255,255,0.5); margin-bottom: 16px; font-size: 14px; }
.wl-start-btn { font-size: 15px; padding: 12px 32px; }

.wl-active { display: flex; flex-direction: column; gap: 12px; }
.wl-header { display: flex; align-items: center; justify-content: space-between; }
.wl-timer { font-size: 20px; font-variant-numeric: tabular-nums; font-weight: 600; color: #7c6bff; }

.wl-exercise { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 12px; }
.wl-ex-header { margin-bottom: 8px; }
.wl-ex-name { font-weight: 600; font-size: 14px; }
.wl-ex-prev { display: block; font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 2px; }

.wl-set-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; }
.wl-set-row.wl-warmup { opacity: 0.6; }
.wl-set-num { width: 40px; color: rgba(255,255,255,0.5); font-size: 12px; }
.wl-warmup-toggle { display: flex; align-items: center; gap: 4px; font-size: 11px; color: rgba(255,255,255,0.4); }
.wl-weight, .wl-reps { width: 64px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.10); border-radius: 6px; color: #fff; padding: 4px 8px; text-align: center; font-size: 13px; }
.wl-x { color: rgba(255,255,255,0.3); }

.wl-add-exercise { display: flex; gap: 8px; }
.wl-input { flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.10); border-radius: 8px; color: #fff; padding: 8px 12px; font-size: 13px; }

.wl-summary { text-align: center; padding: 24px 16px; }
.wl-summary-title { font-size: 20px; margin-bottom: 16px; }
.wl-summary-stats { display: flex; gap: 24px; justify-content: center; margin-bottom: 12px; }
.wl-stat { display: flex; flex-direction: column; }
.wl-stat-val { font-size: 22px; font-weight: 700; color: #7c6bff; }
.wl-stat-lbl { font-size: 11px; color: rgba(255,255,255,0.4); }
.wl-prs { list-style: none; padding: 0; margin: 12px 0; font-size: 13px; color: #f59e0b; }

.wl-history-title { font-size: 15px; font-weight: 600; margin-bottom: 10px; }
.wl-session-card { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13px; }
.wl-sc-date { font-weight: 600; min-width: 90px; }
.wl-sc-exercises { color: rgba(255,255,255,0.6); flex: 1; }
.wl-sc-meta { font-size: 11px; color: rgba(255,255,255,0.4); }

.wl-chart-section { margin-top: 16px; }
.wl-chart-label { font-size: 12px; color: rgba(255,255,255,0.5); display: block; margin-bottom: 6px; }
.wl-select { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.10); border-radius: 6px; color: #fff; padding: 4px 8px; font-size: 13px; margin-bottom: 10px; }
.wl-chart { width: 100%; border-radius: 8px; background: rgba(255,255,255,0.02); }
```

- [ ] **Step 2: Verificar visualmente**

Abrir `frontend/index.html` en el navegador, navegar a la sección Entrenos y verificar que:
- El botón "Iniciar sesión" es visible y centrado
- Al añadir un ejercicio aparece con el panel de sets correcto
- El timer avanza en tiempo real

- [ ] **Step 3: Ejecutar todos los tests para verificar que nada se rompió**

```bash
cd backend && python -m pytest -v --tb=short
```

Expected: ≥ 97 tests pasan.

- [ ] **Step 4: Commit final**

```bash
git add frontend/css/main.css
git commit -m "feat(workout): CSS styles for workout logger UI"
```
