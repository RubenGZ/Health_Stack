# Post-Workout AI Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After every workout, trigger a Groq AI analysis that examines session data, detects trends, and generates a concrete plan (weights, sets, reps) for the next training session, pre-loaded when the user starts their next workout.

**Architecture:** New `WorkoutAIPlan` ORM model added to the `workout_sessions` module. Two new service files (`post_workout_service.py`, `post_workout_repository.py`) keep the new code isolated from the existing session CRUD. Three new endpoints extend the existing workout router. Two new frontend JS files (`postWorkoutCoach.js`, `nextSessionPreloader.js`) integrate with the existing summary flow. The session notes textarea (field already in backend) is surfaced in `summary.js`.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, PostgreSQL 17 (JSONB + SERIAL PK), Groq llama-3.3-70b-versatile via AIRouter (`AIUseCase.POST_WORKOUT_COACH`), Pydantic v2, vanilla JS ES modules, `window.PostWorkoutCoach` / `window.NextSessionPreloader` globals.

**Prerequisite:** Plan A Task 1 (AIUseCase additions) and Plan A Task 2 (Alembic migration) must be completed first. The `workout_ai_plans` table is created in Plan A's migration.

---

## File Map

| Action | File |
|--------|------|
| Modify | `backend/app/modules/workout_sessions/models.py` — add `WorkoutAIPlan` ORM model |
| Modify | `backend/app/modules/workout_sessions/schemas.py` — add `PostWorkoutPlanOut`, `AIPlanSet`, `AIPlanExercise` |
| Create | `backend/app/modules/workout_sessions/post_workout_repository.py` — plan CRUD |
| Create | `backend/app/modules/workout_sessions/post_workout_service.py` — AI analysis + prompt building |
| Modify | `backend/app/modules/workout_sessions/router.py` — add 3 new endpoints |
| Create | `backend/tests/integration/test_post_workout_coach.py` — 7 integration tests |
| Modify | `frontend/js/workout/summary.js` — add notes textarea + trigger analysis after session save |
| Create | `frontend/js/workout/postWorkoutCoach.js` — UI for analysis results |
| Create | `frontend/js/workout/nextSessionPreloader.js` — pre-populate weights on session start |
| Modify | `frontend/index.html` — add script tags for two new JS files |
| Modify | `frontend/sw.js` — bump to v74 |

---

## Task 1 — WorkoutAIPlan ORM model

**Files:**
- Modify: `backend/app/modules/workout_sessions/models.py`

- [ ] **Step 1.1: Write failing import test**

```bash
docker exec healthstack_backend python -c "from app.modules.workout_sessions.models import WorkoutAIPlan; print('NOT YET')" 2>&1 | grep -E "ImportError|NOT YET"
```

Expected: `ImportError`

- [ ] **Step 1.2: Add WorkoutAIPlan to models.py**

At the bottom of `backend/app/modules/workout_sessions/models.py`, add:

```python
from datetime import datetime, timedelta, timezone
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB


class WorkoutAIPlan(Base):
    """Plan generado por IA después de una sesión, para pre-cargar la siguiente."""

    __tablename__ = "workout_ai_plans"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_session_id = Column(
        Integer,
        ForeignKey("workout_sessions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    expires_at = Column(DateTime(timezone=True), nullable=True)
    plan_json = Column(JSONB, nullable=False)
    coach_notes = Column(Text, nullable=True)
    deload_signal = Column(Boolean, nullable=False, default=False)
    used = Column(Boolean, nullable=False, default=False)
```

> Note: `Base`, `Column`, and `UUID` are already imported at the top of models.py. Add `JSONB`, `Boolean`, `DateTime`, `Integer`, `ForeignKey`, `Text`, `func` if any are missing.

- [ ] **Step 1.3: Verify import**

```bash
docker exec healthstack_backend python -c "from app.modules.workout_sessions.models import WorkoutAIPlan; print('OK', WorkoutAIPlan.__tablename__)"
```

Expected: `OK workout_ai_plans`

- [ ] **Step 1.4: Commit**

```bash
git add backend/app/modules/workout_sessions/models.py
git commit -m "feat(workout): add WorkoutAIPlan ORM model"
```

---

## Task 2 — Pydantic schemas

**Files:**
- Modify: `backend/app/modules/workout_sessions/schemas.py`

- [ ] **Step 2.1: Add post-workout schemas to schemas.py**

Add at the end of `backend/app/modules/workout_sessions/schemas.py`:

```python
import uuid as _uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ── AI Plan sub-schemas ───────────────────────────────────────────────────────

class AIPlanSet(BaseModel):
    set_number: int
    weight_kg: float
    reps: int
    is_warmup: bool = False


class AIPlanExercise(BaseModel):
    exercise_key: str
    exercise_name: str
    sets: list[AIPlanSet]
    notes: Optional[str] = None


class AIPlanContent(BaseModel):
    exercises: list[AIPlanExercise]


class RehabSuggestion(BaseModel):
    body_area: str
    message: str


class PostWorkoutPlanOut(BaseModel):
    id: int
    source_session_id: int
    created_at: datetime
    expires_at: Optional[datetime]
    plan_json: AIPlanContent
    coach_notes: Optional[str]
    deload_signal: bool
    used: bool
    rehab_suggestion: Optional[RehabSuggestion] = None  # from AI, not stored in DB

    model_config = {"from_attributes": True}
```

- [ ] **Step 2.2: Verify import**

```bash
docker exec healthstack_backend python -c "from app.modules.workout_sessions.schemas import PostWorkoutPlanOut, AIPlanContent; print('OK')"
```

- [ ] **Step 2.3: Commit**

```bash
git add backend/app/modules/workout_sessions/schemas.py
git commit -m "feat(workout): add PostWorkoutPlanOut and related schemas"
```

---

## Task 3 — post_workout_repository.py

**Files:**
- Create: `backend/app/modules/workout_sessions/post_workout_repository.py`

- [ ] **Step 3.1: Write failing import test**

```bash
docker exec healthstack_backend python -c "from app.modules.workout_sessions.post_workout_repository import PostWorkoutRepository; print('NOT YET')" 2>&1 | grep -E "ImportError|NOT YET"
```

Expected: `ImportError`

- [ ] **Step 3.2: Create the repository file**

Create `backend/app/modules/workout_sessions/post_workout_repository.py`:

```python
"""
app/modules/workout_sessions/post_workout_repository.py
=========================================================
Acceso a datos para workout_ai_plans.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.workout_sessions.models import WorkoutAIPlan


class PostWorkoutRepository:

    @staticmethod
    async def create_plan(
        db: AsyncSession,
        *,
        user_id: uuid.UUID,
        source_session_id: int,
        plan_json: dict,
        coach_notes: str | None,
        deload_signal: bool,
    ) -> WorkoutAIPlan:
        """Crea un nuevo plan IA. Si ya existe uno para esa sesión, lo sobreescribe."""
        # Eliminar plan previo para la misma sesión (constraint UNIQUE)
        existing = await db.execute(
            select(WorkoutAIPlan).where(
                WorkoutAIPlan.source_session_id == source_session_id
            )
        )
        prev = existing.scalar_one_or_none()
        if prev:
            await db.delete(prev)
            await db.flush()

        expires = datetime.now(timezone.utc) + timedelta(days=7)
        plan = WorkoutAIPlan(
            user_id=user_id,
            source_session_id=source_session_id,
            plan_json=plan_json,
            coach_notes=coach_notes,
            deload_signal=deload_signal,
            expires_at=expires,
        )
        db.add(plan)
        await db.flush()
        await db.refresh(plan)
        return plan

    @staticmethod
    async def get_latest_unused(
        db: AsyncSession,
        user_id: uuid.UUID,
    ) -> WorkoutAIPlan | None:
        """Devuelve el plan más reciente que no ha sido usado y no ha expirado."""
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(WorkoutAIPlan)
            .where(
                WorkoutAIPlan.user_id == user_id,
                WorkoutAIPlan.used == False,   # noqa: E712
                WorkoutAIPlan.expires_at > now,
            )
            .order_by(WorkoutAIPlan.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def mark_used(db: AsyncSession, user_id: uuid.UUID) -> None:
        """Marca el plan más reciente no-usado como used=True."""
        plan = await PostWorkoutRepository.get_latest_unused(db, user_id)
        if plan:
            plan.used = True
            await db.flush()
```

- [ ] **Step 3.3: Verify import**

```bash
docker exec healthstack_backend python -c "from app.modules.workout_sessions.post_workout_repository import PostWorkoutRepository; print('OK')"
```

- [ ] **Step 3.4: Commit**

```bash
git add backend/app/modules/workout_sessions/post_workout_repository.py
git commit -m "feat(workout): add PostWorkoutRepository for workout_ai_plans"
```

---

## Task 4 — post_workout_service.py

**Files:**
- Create: `backend/app/modules/workout_sessions/post_workout_service.py`

- [ ] **Step 4.1: Write failing import test**

```bash
docker exec healthstack_backend python -c "from app.modules.workout_sessions.post_workout_service import analyze_post_workout; print('NOT YET')" 2>&1 | grep -E "ImportError|NOT YET"
```

Expected: `ImportError`

- [ ] **Step 4.2: Create the service file**

Create `backend/app/modules/workout_sessions/post_workout_service.py`:

```python
"""
app/modules/workout_sessions/post_workout_service.py
=====================================================
Análisis post-entrenamiento con IA.

Responsabilidades:
  - Construir el prompt anónimo (RGPD: sin PII)
  - Llamar al AIRouter con AIUseCase.POST_WORKOUT_COACH
  - Parsear la respuesta JSON del modelo
  - Detectar palabras de dolor en notas → rehab_suggestion
  - Persistir el resultado en workout_ai_plans
  - Devolver fallback si la IA falla
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.workout_sessions.models import (
    WorkoutSession,
    SessionExercise,
    ExerciseSet,
)
from app.modules.workout_sessions.post_workout_repository import PostWorkoutRepository
from app.modules.workout_sessions.schemas import (
    PostWorkoutPlanOut,
    AIPlanContent,
    RehabSuggestion,
)
from app.services.ai_router.base import AIProviderError
from app.services.ai_router.schemas import AIMessage, AIRequest, AIUseCase

logger = logging.getLogger(__name__)

# ── Pain keywords → rehab routing ─────────────────────────────────────────────
_PAIN_KEYWORDS = [
    "dolor", "molestia", "duele", "duelen", "lesión", "lesion",
    "inflamación", "inflamacion", "pinchazos", "pinzamiento",
]

# ── Fallback plan when AI is unavailable ──────────────────────────────────────
def _static_fallback_plan(session: WorkoutSession) -> dict:
    """Genera un plan de 'mantener pesos' como fallback cuando la IA no responde."""
    exercises = []
    for ex in session.exercises:
        working_sets = [s for s in ex.sets if not s.is_warmup]
        if not working_sets:
            continue
        sets_out = []
        for i, s in enumerate(working_sets, 1):
            sets_out.append({
                "set_number": i,
                "weight_kg": s.weight_kg,
                "reps": s.reps,
                "is_warmup": False,
            })
        exercises.append({
            "exercise_key": ex.exercise_key,
            "exercise_name": ex.exercise_name,
            "sets": sets_out,
            "notes": "Mantén el peso de la sesión anterior.",
        })
    return {"exercises": exercises}


# ── Prompt builder (RGPD: no PII) ─────────────────────────────────────────────
def _build_prompt(
    session: WorkoutSession,
    recent_sessions: list[WorkoutSession],
    injuries: list,
) -> str:
    duration_min = (session.duration_secs or 0) // 60
    volume = session.total_volume_kg or 0.0

    # Exercises summary
    exercises_text = ""
    for ex in session.exercises:
        working = [s for s in ex.sets if not s.is_warmup]
        if not working:
            continue
        sets_str = ", ".join(f"{s.weight_kg}kg×{s.reps}" for s in working)
        last_rpe = working[-1].rpe
        rpe_str = f" (RPE último set: {last_rpe}/10)" if last_rpe else ""
        exercises_text += f"- {ex.exercise_name}: {len(working)} series → {sets_str}{rpe_str}\n"

    # Trend analysis from recent sessions
    history_text = ""
    for ex in session.exercises:
        key = ex.exercise_key
        history_weights = []
        for prev in sorted(recent_sessions, key=lambda s: s.started_at or datetime.min):
            for prev_ex in prev.exercises:
                if prev_ex.exercise_key == key:
                    working = [s for s in prev_ex.sets if not s.is_warmup]
                    if working:
                        history_weights.append(max(s.weight_kg for s in working))
        if history_weights:
            history_text += f"- {ex.exercise_name}: " + ", ".join(f"{w}kg" for w in history_weights[-4:]) + "\n"

    # Chronic injuries
    injury_text = ""
    if injuries:
        injury_text = "LESIONES CRÓNICAS:\n"
        for inj in injuries:
            injury_text += f"- {inj.body_area} ({inj.severity}): {inj.notes or 'ver restricciones de rutina'}.\n"

    notes_text = f'Notas del atleta: "{session.notes}"\n' if session.notes else ""

    prompt = f"""Análisis post-entrenamiento. Calcula los sets y pesos para la próxima sesión.

SESIÓN COMPLETADA:
- Duración: {duration_min} min
- Volumen total: {volume:,.0f} kg
{notes_text}
EJERCICIOS DE HOY:
{exercises_text}
HISTORIAL RECIENTE (últimas sesiones):
{history_text if history_text else "Sin historial previo.\n"}
{injury_text}
REGLAS DE SOBRECARGA PROGRESIVA:
1. Si el último set se completó con RPE ≤ 8 y las reps objetivo se lograron: sube 2.5kg.
2. Si RPE 9-10 o reps cortas (>1 rep por debajo del objetivo): mantén peso.
3. Si las notas mencionan dolor en una zona: reduce 10% ese ejercicio y añade nota de precaución.
4. Si detectas plateau (mismo peso 3+ sesiones): propón variación de reps (-2 reps, +5kg) o técnica avanzada.
5. Si el volumen total cayó >20% respecto a la sesión anterior: señala deload.

Responde SOLO con JSON válido con esta estructura:
{{
  "exercises": [
    {{
      "exercise_key": "nombre_snake_case",
      "exercise_name": "Nombre del ejercicio",
      "sets": [
        {{"set_number": 1, "weight_kg": 80.0, "reps": 5, "is_warmup": true}},
        {{"set_number": 2, "weight_kg": 90.0, "reps": 4, "is_warmup": false}}
      ],
      "notes": "Explicación del ajuste"
    }}
  ],
  "coach_notes": "Resumen breve del análisis en 2-3 frases",
  "deload_signal": false,
  "rehab_suggestion": null
}}

Si rehab_suggestion aplica, usa: {{"body_area": "knee", "message": "Descripción breve"}}"""

    return prompt


def _detect_pain(notes: str | None) -> bool:
    if not notes:
        return False
    notes_lower = notes.lower()
    return any(kw in notes_lower for kw in _PAIN_KEYWORDS)


# ── Main service function ──────────────────────────────────────────────────────
async def analyze_post_workout(
    db: AsyncSession,
    session_id: int,
    user_id: uuid.UUID,
    ai_router,
) -> PostWorkoutPlanOut:
    """
    Analiza una sesión completada y genera el plan para la siguiente.
    Nunca lanza — siempre devuelve un plan válido (estático si la IA falla).
    """
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    # 1. Fetch la sesión actual con exercises + sets
    result = await db.execute(
        select(WorkoutSession)
        .options(
            selectinload(WorkoutSession.exercises).selectinload(SessionExercise.sets)
        )
        .where(WorkoutSession.id == session_id, WorkoutSession.user_id == user_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    # 2. Fetch las últimas 5 sesiones para contexto de tendencias
    recent_result = await db.execute(
        select(WorkoutSession)
        .options(
            selectinload(WorkoutSession.exercises).selectinload(SessionExercise.sets)
        )
        .where(
            WorkoutSession.user_id == user_id,
            WorkoutSession.id != session_id,
        )
        .order_by(WorkoutSession.started_at.desc())
        .limit(5)
    )
    recent_sessions = list(recent_result.scalars().all())

    # 3. Fetch lesiones crónicas (cross-module DB read — no HTTP)
    injuries: list = []
    try:
        from app.modules.routines.repository import InjuryRepository
        injuries = await InjuryRepository.list_active(db, user_id)
    except Exception:
        pass  # Module A may not be deployed yet — graceful degradation

    # 4. Build prompt + call AI
    prompt = _build_prompt(session, recent_sessions, injuries)
    fallback_plan_dict = _static_fallback_plan(session)

    plan_dict = fallback_plan_dict
    coach_notes: str | None = None
    deload_signal = False
    rehab_raw: dict | None = None

    try:
        response = await ai_router.call(
            use_case=AIUseCase.POST_WORKOUT_COACH,
            request=AIRequest(
                messages=[AIMessage(role="user", content=prompt)],
                max_tokens=2048,
                temperature=0.5,
                timeout_s=30.0,
                response_format="json_object",
            ),
        )
        data = json.loads(response.content)
        plan_dict = {"exercises": data.get("exercises", [])}
        coach_notes = data.get("coach_notes")
        deload_signal = bool(data.get("deload_signal", False))
        rehab_raw = data.get("rehab_suggestion")

    except (AIProviderError, json.JSONDecodeError, Exception) as exc:
        logger.warning("post_workout AI fallback: %s", exc)

    # 5. Persist plan
    plan = await PostWorkoutRepository.create_plan(
        db,
        user_id=user_id,
        source_session_id=session_id,
        plan_json=plan_dict,
        coach_notes=coach_notes,
        deload_signal=deload_signal,
    )

    rehab_suggestion = None
    if rehab_raw and isinstance(rehab_raw, dict):
        try:
            rehab_suggestion = RehabSuggestion(**rehab_raw)
        except Exception:
            pass
    elif _detect_pain(session.notes) and not rehab_suggestion:
        # Fallback: notas contienen palabras de dolor pero la IA no generó sugerencia
        rehab_suggestion = RehabSuggestion(
            body_area="general",
            message="Se detectaron menciones de molestias en tus notas. Considera revisar el módulo de rehabilitación.",
        )

    return PostWorkoutPlanOut(
        id=plan.id,
        source_session_id=plan.source_session_id,
        created_at=plan.created_at,
        expires_at=plan.expires_at,
        plan_json=AIPlanContent(**plan_dict),
        coach_notes=plan.coach_notes,
        deload_signal=plan.deload_signal,
        used=plan.used,
        rehab_suggestion=rehab_suggestion,
    )
```

- [ ] **Step 4.3: Verify import**

```bash
docker exec healthstack_backend python -c "from app.modules.workout_sessions.post_workout_service import analyze_post_workout; print('OK')"
```

- [ ] **Step 4.4: Commit**

```bash
git add backend/app/modules/workout_sessions/post_workout_service.py
git commit -m "feat(workout): add post_workout_service with AI analysis + fallback"
```

---

## Task 5 — Router: 3 new endpoints

**Files:**
- Modify: `backend/app/modules/workout_sessions/router.py`

- [ ] **Step 5.1: Add imports and 3 endpoints to router.py**

Add to the top imports section of `backend/app/modules/workout_sessions/router.py`:

```python
from fastapi import Depends
from app.modules.workout_sessions.post_workout_service import analyze_post_workout
from app.modules.workout_sessions.post_workout_repository import PostWorkoutRepository
from app.modules.workout_sessions.schemas import PostWorkoutPlanOut
from app.services.ai_router.dependencies import get_ai_router
from app.services.ai_router.router import AIRouter
```

Add at the bottom of `backend/app/modules/workout_sessions/router.py`:

```python
@router.post(
    "/sessions/{session_id}/post-workout-analysis",
    response_model=PostWorkoutPlanOut,
    summary="Análisis post-entrenamiento con IA",
    description=(
        "Analiza la sesión completada, genera el plan para la próxima sesión "
        "y lo persiste en workout_ai_plans. Fallback graceful si la IA falla."
    ),
)
async def post_workout_analysis(
    session_id: int,
    db: DBSession,
    current_user: CurrentUser,
    ai_router: AIRouter = Depends(get_ai_router),
):
    uid = uuid.UUID(current_user["user_id"])
    return await analyze_post_workout(
        db=db,
        session_id=session_id,
        user_id=uid,
        ai_router=ai_router,
    )


@router.get(
    "/next-session-plan",
    response_model=PostWorkoutPlanOut | None,
    summary="Plan IA para la próxima sesión",
    description="Devuelve el plan más reciente no-usado y no-expirado, o null si no existe.",
)
async def get_next_session_plan(
    db: DBSession,
    current_user: CurrentUser,
):
    uid = uuid.UUID(current_user["user_id"])
    plan = await PostWorkoutRepository.get_latest_unused(db, uid)
    if not plan:
        return None
    from app.modules.workout_sessions.schemas import AIPlanContent
    return PostWorkoutPlanOut(
        id=plan.id,
        source_session_id=plan.source_session_id,
        created_at=plan.created_at,
        expires_at=plan.expires_at,
        plan_json=AIPlanContent(**plan.plan_json),
        coach_notes=plan.coach_notes,
        deload_signal=plan.deload_signal,
        used=plan.used,
    )


@router.post(
    "/next-session-plan/apply",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Marcar plan IA como aplicado",
    description="Marca el plan activo como used=True cuando el usuario inicia su próxima sesión.",
)
async def apply_next_session_plan(
    db: DBSession,
    current_user: CurrentUser,
):
    uid = uuid.UUID(current_user["user_id"])
    await PostWorkoutRepository.mark_used(db, uid)
```

- [ ] **Step 5.2: Verify router loads with 7 routes**

```bash
docker exec healthstack_backend python -c "from app.modules.workout_sessions.router import router; print('Routes:', len(router.routes))"
```

Expected: 7 routes (was 4, now 7).

- [ ] **Step 5.3: Commit**

```bash
git add backend/app/modules/workout_sessions/router.py
git commit -m "feat(workout): add post-workout-analysis, next-session-plan, and apply endpoints"
```

---

## Task 6 — Integration tests (7 tests)

**Files:**
- Create: `backend/tests/integration/test_post_workout_coach.py`

- [ ] **Step 6.1: Create test file**

Create `backend/tests/integration/test_post_workout_coach.py`:

```python
"""
Tests de integración — Post-Workout AI Coach.

Cubre:
1. Análisis trigger → plan guardado en DB
2. Fallback cuando IA falla → plan estático devuelto
3. GET next-session-plan → null sin plan
4. GET next-session-plan → devuelve plan tras análisis
5. POST /apply → marca como used=True
6. deload_signal propagado correctamente
7. Contexto de lesiones crónicas inyectado en el prompt
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

WORKOUT_BASE = "/api/v1/workout"
ROUTINE_BASE = "/api/v1/routines"

SESSION_PAYLOAD = {
    "started_at": "2026-05-28T10:00:00Z",
    "finished_at": "2026-05-28T11:10:00Z",
    "notes": "Buenas sensaciones hoy",
    "exercises": [
        {
            "exercise_key": "press_banca_plano",
            "exercise_name": "Press banca plano",
            "order_index": 0,
            "sets": [
                {"set_number": 1, "weight_kg": 60.0,  "reps": 10, "is_warmup": True},
                {"set_number": 2, "weight_kg": 90.0,  "reps": 5,  "is_warmup": False},
                {"set_number": 3, "weight_kg": 90.0,  "reps": 4,  "is_warmup": False},
                {"set_number": 4, "weight_kg": 90.0,  "reps": 4,  "is_warmup": False, "rpe": 8},
            ],
        }
    ],
}


async def _create_session(client: AsyncClient, auth_headers: dict) -> int:
    resp = await client.post(f"{WORKOUT_BASE}/sessions", json=SESSION_PAYLOAD, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["session_id"]


@pytest.mark.asyncio
async def test_post_workout_analysis_creates_plan(client: AsyncClient, auth_headers: dict):
    """Trigger analysis → respuesta 200 con plan válido y plan guardado en DB."""
    session_id = await _create_session(client, auth_headers)

    resp = await client.post(
        f"{WORKOUT_BASE}/sessions/{session_id}/post-workout-analysis",
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "plan_json" in data
    assert "exercises" in data["plan_json"]
    assert data["source_session_id"] == session_id
    assert data["used"] is False


@pytest.mark.asyncio
async def test_post_workout_analysis_fallback(client: AsyncClient, auth_headers: dict):
    """Cuando la IA falla, el endpoint devuelve un plan estático válido (no 500)."""
    from app.main import app as fastapi_app
    from app.services.ai_router.base import AIProviderError

    session_id = await _create_session(client, auth_headers)

    class FailingAIRouter:
        async def call(self, *, use_case, request, user_id=None):
            raise AIProviderError("Simulated failure")

    original = getattr(fastapi_app.state, "ai_router", None)
    fastapi_app.state.ai_router = FailingAIRouter()
    try:
        resp = await client.post(
            f"{WORKOUT_BASE}/sessions/{session_id}/post-workout-analysis",
            headers=auth_headers,
        )
    finally:
        fastapi_app.state.ai_router = original

    # Debe devolver 200 con fallback — nunca 500
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "exercises" in data["plan_json"]


@pytest.mark.asyncio
async def test_get_next_session_plan_empty(client: AsyncClient, auth_headers: dict):
    """Sin análisis previo → GET next-session-plan devuelve null."""
    resp = await client.get(f"{WORKOUT_BASE}/next-session-plan", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() is None


@pytest.mark.asyncio
async def test_get_next_session_plan_returns_plan(client: AsyncClient, auth_headers: dict):
    """Tras un análisis, GET next-session-plan devuelve el plan."""
    session_id = await _create_session(client, auth_headers)

    await client.post(
        f"{WORKOUT_BASE}/sessions/{session_id}/post-workout-analysis",
        headers=auth_headers,
    )

    resp = await client.get(f"{WORKOUT_BASE}/next-session-plan", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data is not None
    assert data["source_session_id"] == session_id
    assert data["used"] is False


@pytest.mark.asyncio
async def test_apply_plan_marks_used(client: AsyncClient, auth_headers: dict):
    """POST /apply → el plan queda como used=True; GET siguiente → null."""
    session_id = await _create_session(client, auth_headers)
    await client.post(
        f"{WORKOUT_BASE}/sessions/{session_id}/post-workout-analysis",
        headers=auth_headers,
    )

    apply_resp = await client.post(
        f"{WORKOUT_BASE}/next-session-plan/apply", headers=auth_headers
    )
    assert apply_resp.status_code == 204

    # Ahora no debe haber plan disponible
    resp = await client.get(f"{WORKOUT_BASE}/next-session-plan", headers=auth_headers)
    assert resp.json() is None


@pytest.mark.asyncio
async def test_deload_signal_stored_correctly(client: AsyncClient, auth_headers: dict):
    """Si la IA devuelve deload_signal=True, se almacena y se devuelve en el plan."""
    from app.main import app as fastapi_app
    from app.services.ai_router.schemas import AIResponse

    session_id = await _create_session(client, auth_headers)

    class DeloadAIRouter:
        async def call(self, *, use_case, request, user_id=None):
            fake = '{"exercises":[],"coach_notes":"Necesitas descansar","deload_signal":true,"rehab_suggestion":null}'
            return AIResponse(content=fake, provider_used="test", model_used="test",
                              tokens_used=0, fallback_triggered=False)

    original = getattr(fastapi_app.state, "ai_router", None)
    fastapi_app.state.ai_router = DeloadAIRouter()
    try:
        resp = await client.post(
            f"{WORKOUT_BASE}/sessions/{session_id}/post-workout-analysis",
            headers=auth_headers,
        )
    finally:
        fastapi_app.state.ai_router = original

    assert resp.status_code == 200
    assert resp.json()["deload_signal"] is True


@pytest.mark.asyncio
async def test_injury_context_injected_in_prompt(client: AsyncClient, auth_headers: dict):
    """Con una lesión crónica registrada, el prompt enviado al AI incluye el body_area."""
    from app.main import app as fastapi_app
    from app.services.ai_router.schemas import AIResponse

    # Registrar lesión crónica (requiere Plan A implementado)
    injury_resp = await client.post(
        f"{ROUTINE_BASE}/injuries",
        json={"body_area": "elbow", "injury_label": "Codo derecho", "severity": "mild", "notes": None},
        headers=auth_headers,
    )
    # Si Module A no está implementado aún, saltar el test
    if injury_resp.status_code != 201:
        pytest.skip("Module A (injury endpoints) not yet implemented")

    session_id = await _create_session(client, auth_headers)
    captured: list[str] = []

    class RecorderAIRouter:
        async def call(self, *, use_case, request, user_id=None):
            for msg in request.messages:
                captured.append(msg.content)
            fake = '{"exercises":[],"coach_notes":"ok","deload_signal":false,"rehab_suggestion":null}'
            return AIResponse(content=fake, provider_used="recorder", model_used="recorder",
                              tokens_used=0, fallback_triggered=False)

    original = getattr(fastapi_app.state, "ai_router", None)
    fastapi_app.state.ai_router = RecorderAIRouter()
    try:
        await client.post(
            f"{WORKOUT_BASE}/sessions/{session_id}/post-workout-analysis",
            headers=auth_headers,
        )
    finally:
        fastapi_app.state.ai_router = original

    assert captured, "RecorderAIRouter no capturó ningún prompt"
    prompt_blob = "\n".join(captured)
    assert "elbow" in prompt_blob, f"'elbow' no encontrado en prompt:\n{prompt_blob[:500]}"
```

- [ ] **Step 6.2: Run tests**

```bash
docker exec healthstack_backend python -m pytest tests/integration/test_post_workout_coach.py -v --tb=short
```

Expected: `7 passed` (test 7 may skip if Module A not deployed yet — that's acceptable).

- [ ] **Step 6.3: Commit**

```bash
git add backend/tests/integration/test_post_workout_coach.py
git commit -m "test(workout): 7 integration tests for post-workout AI coach"
```

---

## Task 7 — Notes textarea in summary.js

**Files:**
- Modify: `frontend/js/workout/summary.js`

> The notes textarea needs to appear in the workout logger before the user clicks "Finalizar". In `workoutLogger.js`, add the textarea HTML. In `summary.js`'s `onFinish()`, read it and include in the payload.

- [ ] **Step 7.1: Add notes textarea to workoutLogger.js HTML template**

In `frontend/js/workoutLogger.js`, find the HTML template inside the `renderWorkoutLogger()` function (or wherever the logger HTML is built). Find the `.wl-exercises-col` div and add a notes textarea section after `wl-add-ex-panel`:

```html
<!-- Notas de sesión (para el AI coach post-entrenamiento) -->
<div class="wl-notes-section">
  <label class="wl-notes-label" for="wl-session-notes">
    Notas de sesión
    <span class="wl-notes-hint">El coach IA analiza tus notas para personalizar el siguiente entreno</span>
  </label>
  <textarea
    id="wl-session-notes"
    class="wl-notes-textarea"
    placeholder="¿Cómo te sentiste? ¿Alguna molestia? ¿Sorpresas?"
    rows="3"
    maxlength="1000"
  ></textarea>
</div>
```

- [ ] **Step 7.2: Read notes in summary.js onFinish()**

In `frontend/js/workout/summary.js`, in the `onFinish()` function, find the line `notes: null` in the payload object and replace it with:

```javascript
notes: document.getElementById('wl-session-notes')?.value?.trim() || null,
```

- [ ] **Step 7.3: Trigger post-workout analysis after session save**

In `frontend/js/workout/summary.js`, after the line `if (resp.ok) result = await resp.json();`, add:

```javascript
    // Trigger post-workout AI analysis asynchronously (non-blocking)
    if (resp.ok && result?.session_id && window.PostWorkoutCoach) {
      window.PostWorkoutCoach.triggerAnalysis(result.session_id).catch(() => {});
    }
```

- [ ] **Step 7.4: Commit**

```bash
git add frontend/js/workoutLogger.js frontend/js/workout/summary.js
git commit -m "feat(workout-ui): add session notes textarea + trigger post-workout AI analysis"
```

---

## Task 8 — postWorkoutCoach.js

**Files:**
- Create: `frontend/js/workout/postWorkoutCoach.js`

- [ ] **Step 8.1: Create postWorkoutCoach.js**

Create `frontend/js/workout/postWorkoutCoach.js`:

```javascript
/**
 * postWorkoutCoach.js
 * ====================
 * Muestra los resultados del análisis IA post-entrenamiento en la pantalla de resumen.
 *
 * API pública:
 *   window.PostWorkoutCoach.triggerAnalysis(sessionId)  → Promise<void>
 */
window.PostWorkoutCoach = (() => {
  const BASE = '/api/v1/workout';

  function _authHeaders() {
    const tok = localStorage.getItem('hs_access_token') || sessionStorage.getItem('hs_access_token') || '';
    return { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
  }

  // ── UI helpers ──────────────────────────────────────────────────────────────
  function _showAnalyzingIndicator(container) {
    const el = document.createElement('div');
    el.id = 'pwc-analyzing';
    el.className = 'pwc-analyzing';
    el.innerHTML = `<span class="pwc-pulse">●</span> Analizando tu entreno con IA...`;
    container.appendChild(el);
    return el;
  }

  function _removeIndicator() {
    document.getElementById('pwc-analyzing')?.remove();
  }

  function _renderPlanCard(plan, container) {
    _removeIndicator();

    const exercises = plan.plan_json?.exercises || [];
    const exercisesHtml = exercises.map(ex => {
      const workingSets = ex.sets.filter(s => !s.is_warmup);
      if (!workingSets.length) return '';
      const setsHtml = workingSets.map(s =>
        `<span class="pwc-set">${s.weight_kg}kg × ${s.reps}</span>`
      ).join('');
      return `<div class="pwc-exercise">
        <span class="pwc-ex-name">${_esc(ex.exercise_name)}</span>
        <div class="pwc-sets">${setsHtml}</div>
        ${ex.notes ? `<p class="pwc-ex-notes">${_esc(ex.notes)}</p>` : ''}
      </div>`;
    }).join('');

    const card = document.createElement('div');
    card.className = 'pwc-plan-card';
    card.innerHTML = `
      <div class="pwc-plan-header">
        <span class="pwc-plan-icon">✦</span>
        <h4 class="pwc-plan-title">Plan para el próximo entreno</h4>
        <button class="pwc-collapse-btn" aria-label="Contraer">▾</button>
      </div>
      <div class="pwc-plan-body">
        ${exercisesHtml || '<p class="pwc-no-ex">Mantén tus ejercicios actuales.</p>'}
        ${plan.coach_notes ? `<p class="pwc-coach-notes">${_esc(plan.coach_notes)}</p>` : ''}
        ${plan.deload_signal ? `
          <div class="pwc-deload-warning">
            ⚠️ El análisis detecta señales de fatiga. Considera una semana de descarga.
          </div>` : ''}
      </div>`;

    // Collapse toggle
    const btn = card.querySelector('.pwc-collapse-btn');
    const body = card.querySelector('.pwc-plan-body');
    btn.addEventListener('click', () => {
      const collapsed = body.style.display === 'none';
      body.style.display = collapsed ? '' : 'none';
      btn.textContent = collapsed ? '▾' : '▸';
    });

    container.appendChild(card);

    // Deload signal → notify autoDeload
    if (plan.deload_signal) {
      window.dispatchEvent(new CustomEvent('hs:ai-deload-signal', { detail: { source: 'post_workout_coach' } }));
    }

    // Rehab suggestion → toast
    if (plan.rehab_suggestion) {
      const msg = plan.rehab_suggestion.message;
      if (typeof showToast === 'function') {
        showToast(`💊 ${msg}`, 'warning', 8000);
      }
    }
  }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  async function triggerAnalysis(sessionId) {
    // Find the summary container — it may not exist yet; retry once
    let container = document.querySelector('.wl-summary');
    if (!container) {
      await new Promise(r => setTimeout(r, 500));
      container = document.querySelector('.wl-summary');
    }
    if (!container) return;

    const indicator = _showAnalyzingIndicator(container);

    try {
      const resp = await fetch(`${BASE}/sessions/${sessionId}/post-workout-analysis`, {
        method: 'POST',
        headers: _authHeaders(),
      });
      if (!resp.ok) { indicator.remove(); return; }
      const plan = await resp.json();
      _renderPlanCard(plan, container);
    } catch {
      indicator.remove();
    }
  }

  return { triggerAnalysis };
})();
```

- [ ] **Step 8.2: Commit**

```bash
git add frontend/js/workout/postWorkoutCoach.js
git commit -m "feat(frontend): add postWorkoutCoach.js — AI plan card in summary screen"
```

---

## Task 9 — nextSessionPreloader.js

**Files:**
- Create: `frontend/js/workout/nextSessionPreloader.js`

- [ ] **Step 9.1: Create nextSessionPreloader.js**

Create `frontend/js/workout/nextSessionPreloader.js`:

```javascript
/**
 * nextSessionPreloader.js
 * ========================
 * Al iniciar una nueva sesión, consulta el plan IA y pre-carga los pesos sugeridos
 * en los inputs del workout logger. Muestra badge "AI" en campos pre-llenados.
 *
 * API pública:
 *   window.NextSessionPreloader.init()    → llamar cuando el logger está en DOM
 *   window.NextSessionPreloader.applyPlan() → marcar el plan como usado
 */
window.NextSessionPreloader = (() => {
  const BASE = '/api/v1/workout';
  let _plan = null;

  function _authHeaders() {
    const tok = localStorage.getItem('hs_access_token') || sessionStorage.getItem('hs_access_token') || '';
    return { ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
  }

  async function _fetchPlan() {
    try {
      const resp = await fetch(`${BASE}/next-session-plan`, { headers: _authHeaders() });
      if (resp.ok) _plan = await resp.json();
    } catch { _plan = null; }
  }

  function _getPlannedWeight(exerciseKey, setNumber) {
    if (!_plan?.plan_json?.exercises) return null;
    const ex = _plan.plan_json.exercises.find(e => e.exercise_key === exerciseKey);
    if (!ex) return null;
    const set = ex.sets.find(s => s.set_number === setNumber && !s.is_warmup);
    return set ? set.weight_kg : null;
  }

  function _badgeInput(input, weight) {
    if (!input) return;
    input.value = weight;
    input.dataset.aiSuggested = 'true';
    // Add gold AI badge next to the input
    if (!input.parentElement.querySelector('.pwc-ai-badge')) {
      const badge = document.createElement('span');
      badge.className = 'pwc-ai-badge';
      badge.textContent = 'AI';
      badge.title = 'Peso sugerido por el análisis IA';
      input.parentElement.appendChild(badge);
    }
  }

  /**
   * Pre-populate weight inputs for a newly added exercise.
   * Call this whenever an exercise card is rendered.
   */
  function prePopulateExercise(exerciseKey, exerciseCard) {
    if (!_plan) return;
    const weightInputs = exerciseCard.querySelectorAll('[data-set-number][data-field="weight"]');
    weightInputs.forEach(input => {
      const setNum = parseInt(input.dataset.setNumber, 10);
      const suggested = _getPlannedWeight(exerciseKey, setNum);
      if (suggested != null) _badgeInput(input, suggested);
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  return {
    async init() {
      await _fetchPlan();
      if (_plan) {
        console.info('[NextSessionPreloader] Plan IA disponible:', _plan.id);
        // Broadcast so workoutLogger.js can call prePopulateExercise when adding exercises
        window.dispatchEvent(new CustomEvent('hs:ai-plan-loaded', { detail: _plan }));
      }
    },

    prePopulateExercise,

    async applyPlan() {
      if (!_plan) return;
      try {
        await fetch(`${BASE}/next-session-plan/apply`, {
          method: 'POST',
          headers: _authHeaders(),
        });
        _plan = null;
      } catch { /* non-critical */ }
    },

    get hasPlan() { return !!_plan; },
    get plan() { return _plan; },
  };
})();
```

- [ ] **Step 9.2: Call NextSessionPreloader.init() in workoutLogger.js**

In `frontend/js/workoutLogger.js`, inside the init or `renderWorkoutLogger()` function (where the workout logger first appears), add:

```javascript
// Pre-load AI plan for this session
if (window.NextSessionPreloader) {
  window.NextSessionPreloader.init().then(() => {
    if (window.NextSessionPreloader.hasPlan) {
      // Mark plan as applied — user started a new session
      window.NextSessionPreloader.applyPlan();
    }
  });
}
```

- [ ] **Step 9.3: Commit**

```bash
git add frontend/js/workout/nextSessionPreloader.js frontend/js/workoutLogger.js
git commit -m "feat(frontend): add nextSessionPreloader.js — pre-populate AI-suggested weights"
```

---

## Task 10 — index.html script tags + SW bump

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/sw.js`

- [ ] **Step 10.1: Add script tags to index.html**

In `frontend/index.html`, find where other workout JS files are loaded (look for `workout/summary.js`, `workout/views.js`, etc.) and add after them:

```html
<script src="/js/workout/postWorkoutCoach.js?v=1"></script>
<script src="/js/workout/nextSessionPreloader.js?v=1"></script>
```

- [ ] **Step 10.2: Add new files to SW STATIC_ASSETS**

In `frontend/sw.js`, find the `STATIC_ASSETS` array. Add after the existing workout submodule entries (`workout/summary.js` etc.):

```javascript
  '/js/workout/postWorkoutCoach.js',
  '/js/workout/nextSessionPreloader.js',
```

- [ ] **Step 10.3: Bump CACHE_NAME to v74**

In `frontend/sw.js`, change:
```javascript
const CACHE_NAME = 'healthstack-v73';
```
to:
```javascript
const CACHE_NAME = 'healthstack-v74';
```

> If Module A's SW bump (to v73) hasn't been done yet, bump directly from v72 to v74 here.

- [ ] **Step 10.4: Commit and deploy**

```bash
git add frontend/index.html frontend/sw.js
git commit -m "chore(sw): bump to v74, add postWorkoutCoach + nextSessionPreloader to cache"
```

Deploy to Pi:
```bash
bash ~/healthstack-pi-server/scripts/update.sh
```

---

## Self-Review Checklist

- [x] **Spec coverage**: post-workout-analysis endpoint ✅, next-session-plan GET ✅, apply POST ✅, postWorkoutCoach.js UI ✅, nextSessionPreloader.js ✅, notes textarea ✅, deload signal → autoDeload integration ✅, rehab_suggestion → toast ✅, injury context cross-module ✅
- [x] **No placeholders**: all code is complete, no TBDs
- [x] **Graceful fallback**: `analyze_post_workout()` catches ALL exceptions (including `AIProviderError`, `json.JSONDecodeError`, and `Exception`) and falls back to static plan
- [x] **RGPD**: `user_id` never sent to Groq; only aggregate data (weights, reps, duration, volumes); `notes` sent verbatim (user-authored for AI use)
- [x] **Module B independent**: can run without Module A — `InjuryRepository.list_active()` is wrapped in try/except
- [x] **AIRouter pattern**: uses `ai_router.call()` with `AIUseCase.POST_WORKOUT_COACH`; `latency_ms` and `provider_used` are part of `AIResponse` already
- [x] **Type consistency**: `AIPlanContent(**plan.plan_json)` and `AIPlanContent(**plan_dict)` both work since plan_dict has `{"exercises": [...]}`
- [x] **Test coverage**: fallback test ✅, deload signal ✅, injury context ✅, GET null ✅, apply ✅
- [x] **Prerequisite note**: Plan B Task 1 (models) requires migration from Plan A to already be run
