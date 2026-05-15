# backend/app/modules/gym_servers/models.py
"""
Gym Servers — entidades sociales de competición y descubrimiento.
"""
from __future__ import annotations

import uuid
from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey,
    Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.shared.base_model import Base


class GymServer(Base):
    __tablename__ = "gym_servers"
    __table_args__ = (
        {"schema": "public", "comment": "Servidor de gimnasio — comunidad de entrenamiento."},
    )

    id          = Column(Integer, primary_key=True, autoincrement=True)
    name        = Column(String(80), nullable=False)
    description = Column(Text, nullable=True)
    created_by  = Column(UUID(as_uuid=True), ForeignKey("public.users.id"), nullable=False)
    city        = Column(String(80), nullable=True)
    province    = Column(String(80), nullable=True)
    country     = Column(String(5), nullable=False, default="ES")
    invite_code = Column(String(12), nullable=False, unique=True)
    is_public   = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    max_members = Column(Integer, default=50, nullable=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    memberships = relationship("GymMembership", back_populates="gym", cascade="all, delete-orphan")
    challenges  = relationship("GymChallenge", back_populates="gym", cascade="all, delete-orphan")


class GymMembership(Base):
    __tablename__ = "gym_memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "gym_id", name="uq_gym_membership"),
        {"schema": "public"},
    )

    id        = Column(Integer, primary_key=True, autoincrement=True)
    user_id   = Column(UUID(as_uuid=True), ForeignKey("public.users.id", ondelete="CASCADE"), nullable=False, index=True)
    gym_id    = Column(Integer, ForeignKey("public.gym_servers.id", ondelete="CASCADE"), nullable=False, index=True)
    role      = Column(String(10), nullable=False, default="member")
    profile_public    = Column(Boolean, default=False, nullable=False)
    training_schedule = Column(String(20), nullable=True)
    training_goal     = Column(String(20), nullable=True)
    contact_info      = Column(String(120), nullable=True)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    gym = relationship("GymServer", back_populates="memberships")


class GymChampionBadge(Base):
    __tablename__ = "gym_champion_badges"
    __table_args__ = (
        {"schema": "public", "comment": "Insignia top-3 de temporada en un gym."},
    )

    id        = Column(Integer, primary_key=True, autoincrement=True)
    user_id   = Column(UUID(as_uuid=True), ForeignKey("public.users.id", ondelete="CASCADE"), nullable=False, index=True)
    gym_id    = Column(Integer, ForeignKey("public.gym_servers.id", ondelete="CASCADE"), nullable=False)
    season    = Column(Integer, nullable=False)
    position  = Column(Integer, nullable=False)
    queue     = Column(String(20), nullable=False, default="competitive")
    city_league_eligible = Column(Boolean, default=False, nullable=False)
    earned_at = Column(DateTime(timezone=True), server_default=func.now())


class GymChallenge(Base):
    __tablename__ = "gym_challenges"
    __table_args__ = (
        {"schema": "public", "comment": "Reto colectivo dentro de un gym server."},
    )

    id           = Column(Integer, primary_key=True, autoincrement=True)
    gym_id       = Column(Integer, ForeignKey("public.gym_servers.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by   = Column(UUID(as_uuid=True), ForeignKey("public.users.id"), nullable=False)
    title        = Column(String(100), nullable=False)
    description  = Column(Text, nullable=True)
    target_type  = Column(String(20), nullable=False)
    target_value = Column(Integer, nullable=False)
    starts_at    = Column(DateTime(timezone=True), nullable=False)
    ends_at      = Column(DateTime(timezone=True), nullable=False)
    closed       = Column(Boolean, default=False, nullable=False)

    gym          = relationship("GymServer", back_populates="challenges")
    participants = relationship("GymChallengeParticipant", back_populates="challenge", cascade="all, delete-orphan")


class GymChallengeParticipant(Base):
    __tablename__ = "gym_challenge_participants"
    __table_args__ = (
        UniqueConstraint("challenge_id", "user_id", name="uq_challenge_participant"),
        {"schema": "public"},
    )

    id           = Column(Integer, primary_key=True, autoincrement=True)
    challenge_id = Column(Integer, ForeignKey("public.gym_challenges.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id      = Column(UUID(as_uuid=True), ForeignKey("public.users.id", ondelete="CASCADE"), nullable=False)
    contribution = Column(Integer, nullable=False, default=0)
    joined_at    = Column(DateTime(timezone=True), server_default=func.now())

    challenge    = relationship("GymChallenge", back_populates="participants")
