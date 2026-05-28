# backend/app/modules/workout_sessions/router.py
"""Endpoints de workout sessions."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security.dependencies import CurrentUser
from app.modules.workout_sessions import repository as repo
from app.modules.workout_sessions import service as svc
from app.modules.workout_sessions.post_workout_repository import PostWorkoutRepository
from app.modules.workout_sessions.post_workout_service import generate_post_workout_coaching
from app.modules.workout_sessions.schemas import (
    DismissPlanRequest,
    ExerciseHistoryPoint,
    ExerciseHistoryResponse,
    PostWorkoutCoachRequest,
    PostWorkoutCoachResponse,
    PostWorkoutPlanOut,
    SessionCreateRequest,
    SessionCreateResponse,
    SessionDetail,
    SessionListResponse,
    SessionSummary,
)
from app.services.ai_router.dependencies import get_ai_router
from app.services.ai_router.router import AIRouter
from app.session import DBSession

router = APIRouter()


@router.post(
    "/sessions",
    response_model=SessionCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear sesión de entrenamiento",
    description="Guarda una sesión de entrenamiento completa (bulk insert) y detecta PRs.",
)
async def create_session(
    body: SessionCreateRequest,
    db: DBSession,
    current_user: CurrentUser,
):
    """Guarda una sesión de entrenamiento completa (bulk insert)."""
    try:
        from app.modules.gamification.service import GamificationService
        gamification_service = GamificationService()
    except Exception:
        gamification_service = None

    user_id = uuid.UUID(current_user["user_id"])
    return await svc.create_workout_session(
        db=db,
        user_id=user_id,
        request=body,
        gamification_service=gamification_service,
    )


@router.get(
    "/sessions",
    response_model=SessionListResponse,
    summary="Listar sesiones de entrenamiento",
    description="Lista sesiones del usuario autenticado, paginadas.",
)
async def list_sessions(
    db: DBSession,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    exercise_key: str | None = Query(None),
):
    """Lista sesiones del usuario, paginadas."""
    user_id = uuid.UUID(current_user["user_id"])
    sessions, total = await repo.list_sessions(
        db=db,
        user_id=user_id,
        page=page,
        per_page=per_page,
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


@router.get(
    "/sessions/{session_id}",
    response_model=SessionDetail,
    summary="Detalle de una sesión",
    description="Devuelve el detalle completo de una sesión con exercises y sets.",
)
async def get_session(
    session_id: int,
    db: DBSession,
    current_user: CurrentUser,
):
    """Detalle completo de una sesión con exercises y sets."""
    user_id = uuid.UUID(current_user["user_id"])
    session = await repo.get_session_detail(db, session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    return session


@router.get(
    "/history/{exercise_key}",
    response_model=ExerciseHistoryResponse,
    summary="Historial de progresión de un ejercicio",
    description="Devuelve el historial de un ejercicio con 1RM estimado (fórmula Epley).",
)
async def exercise_history(
    exercise_key: str,
    db: DBSession,
    current_user: CurrentUser,
):
    """Historial de progresión de un ejercicio con 1RM estimado."""
    user_id = uuid.UUID(current_user["user_id"])
    rows = await repo.get_exercise_history(db, user_id, exercise_key)
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


@router.post(
    "/post-workout-coach",
    response_model=PostWorkoutCoachResponse,
    summary="Coaching AI post-entrenamiento",
    description="Genera feedback de coaching IA tras una sesión de entrenamiento.",
)
async def post_workout_coaching(
    body: PostWorkoutCoachRequest,
    current_user: CurrentUser,
    db: DBSession,
    ai_router: AIRouter = Depends(get_ai_router),
) -> PostWorkoutCoachResponse:
    """Generate AI coaching feedback after a workout session."""
    return await generate_post_workout_coaching(
        db=db,
        user_id=uuid.UUID(current_user["user_id"]),
        session_id=body.session_id,
        notes=body.notes,
        ai_router=ai_router,
    )


@router.post(
    "/post-workout-coach/dismiss",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Descartar plan de coaching",
    description="Marca un plan de coaching como usado/descartado.",
)
async def dismiss_post_workout_plan(
    body: DismissPlanRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> None:
    """Mark a coaching plan as used/dismissed."""
    found = await PostWorkoutRepository.mark_used(
        db=db,
        plan_id=body.plan_id,
        user_id=uuid.UUID(current_user["user_id"]),
    )
    if not found:
        raise HTTPException(status_code=404, detail="Plan no encontrado")


@router.get(
    "/post-workout-coach/{session_id}",
    response_model=PostWorkoutPlanOut,
    summary="Obtener plan de coaching de una sesión",
    description="Recupera el plan de coaching IA almacenado para una sesión.",
)
async def get_post_workout_plan(
    session_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> PostWorkoutPlanOut:
    """Retrieve the stored AI coaching plan for a session."""
    plan = await PostWorkoutRepository.get_plan_by_session(
        db=db,
        session_id=session_id,
        user_id=uuid.UUID(current_user["user_id"]),
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    return plan
