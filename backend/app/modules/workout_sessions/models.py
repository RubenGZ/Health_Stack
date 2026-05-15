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
    Integer, String, Text, Index,
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
    routine_id      = Column(Integer, ForeignKey("public.saved_routines.id"), nullable=True)
    started_at      = Column(DateTime(timezone=True), nullable=False)
    finished_at     = Column(DateTime(timezone=True), nullable=True)
    duration_secs   = Column(Integer, nullable=True)
    notes           = Column(Text, nullable=True)
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
    exercise_key  = Column(String(80), nullable=False)
    exercise_name = Column(String(120), nullable=False)
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
    rpe          = Column(Float, nullable=True)
    is_warmup    = Column(Boolean, default=False, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    exercise = relationship("SessionExercise", back_populates="sets")

    def __repr__(self) -> str:
        return f"<ExerciseSet id={self.id} {self.weight_kg}kg×{self.reps}>"
