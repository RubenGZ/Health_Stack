# Sistema de Rankeds + Gym Servers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sistema de ranking con dos colas (Normal/Competitivo), tiers con nombres propios de gym, gym servers con leaderboard interno, búsqueda de sparring, retos de gym e insignias de campeón por temporada.

**Architecture:** Backend modular FastAPI (ranked/ + gym_servers/). LP engine interno (no público). Gym servers como entidad social reutilizable. Frontend ranked.js con panel dual + gym server UI.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, PostgreSQL 17, Alembic, Pydantic v2, JSONB para meta en eventos, Vanilla JS.

**Spec:** `docs/superpowers/specs/2026-05-15-ranked-system-design.md`

**Prerequisito:** La acción `ranked_promotion` ya debe estar en `XP_TABLE` (cubierta en Task 1 del plan workout-logger). Verificar antes de ejecutar este plan.

---

### Task 1: Ranked models

**Files:**
- Create: `backend/app/modules/ranked/__init__.py`
- Create: `backend/app/modules/ranked/models.py`

- [ ] **Step 1: Crear paquete**

```bash
mkdir -p backend/app/modules/ranked
touch backend/app/modules/ranked/__init__.py
```

- [ ] **Step 2: Escribir models.py**

```python
# backend/app/modules/ranked/models.py
"""
Ranked system — LP engine con dos colas (Normal / Competitivo).

Tiers Normal (journey): novato | regular | constante | comprometido |
                        veterano | forjado | elite | leyenda
Tiers Competitivo (perf): calentando | amateur | semipro | bestia |
                          titan | fenomeno | invicto | apex

Cada tier tiene 4 divisiones (1-4) excepto 'leyenda' y 'apex' (division=None).
"""
from __future__ import annotations

import uuid
from sqlalchemy import (
    Boolean, Column, DateTime, Date, ForeignKey,
    Integer, String, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.shared.base_model import Base

TIERS_NORMAL = [
    "novato", "regular", "constante", "comprometido",
    "veterano", "forjado", "elite", "leyenda",
]
TIERS_COMPETITIVE = [
    "calentando", "amateur", "semipro", "bestia",
    "titan", "fenomeno", "invicto", "apex",
]
MAX_LP_PER_WEEK = 60   # anti-spam: máx LP por cola en 7 días
TOP_TIER_NORMAL = "leyenda"
TOP_TIER_COMPETITIVE = "apex"


class RankedProfile(Base):
    __tablename__ = "ranked_profiles"
    __table_args__ = (
        UniqueConstraint("user_id", "queue", name="uq_ranked_user_queue"),
        {"schema": "public", "comment": "Estado de ranking del usuario por cola."},
    )

    id       = Column(Integer, primary_key=True, autoincrement=True)
    user_id  = Column(UUID(as_uuid=True), ForeignKey("public.users.id", ondelete="CASCADE"), nullable=False, index=True)
    queue    = Column(String(20), nullable=False)      # 'normal' | 'competitive'
    season   = Column(Integer, nullable=False, default=1)
    tier     = Column(String(20), nullable=False)      # e.g. 'comprometido'
    division = Column(Integer, nullable=True)          # 1-4; None en tier máximo
    lp       = Column(Integer, nullable=False, default=0)
    peak_tier      = Column(String(20), nullable=False)
    peak_division  = Column(Integer, nullable=True)
    prev_season_tier = Column(String(20), nullable=True)
    lp_week        = Column(Integer, nullable=False, default=0)   # LP acumulado esta semana
    lp_week_reset  = Column(DateTime(timezone=True), nullable=True)  # cuándo resetear lp_week
    competitive_unlocked = Column(Boolean, default=False, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        return f"<RankedProfile user={str(self.user_id)[:8]}... queue={self.queue} {self.tier}{self.division or ''} {self.lp}LP>"


class RankedEvent(Base):
    __tablename__ = "ranked_events"
    __table_args__ = (
        {"schema": "public", "comment": "Log inmutable de cambios LP. Nunca se actualiza."},
    )

    id       = Column(Integer, primary_key=True, autoincrement=True)
    user_id  = Column(UUID(as_uuid=True), ForeignKey("public.users.id", ondelete="CASCADE"), nullable=False, index=True)
    queue    = Column(String(20), nullable=False)
    season   = Column(Integer, nullable=False)
    # event_type: session_lp | pr_lp | volume_lp | streak_lp | decay
    #             promotion | demotion | season_reset | competitive_unlock
    event_type  = Column(String(30), nullable=False)
    lp_delta    = Column(Integer, nullable=False)
    lp_after    = Column(Integer, nullable=False)
    tier_after  = Column(String(20), nullable=False)
    div_after   = Column(Integer, nullable=True)
    meta        = Column(JSONB, nullable=True)   # { exercise_key, old_1rm, new_1rm, ... }
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self) -> str:
        return f"<RankedEvent {self.event_type} {self.lp_delta:+d}LP>"


class RankedSeason(Base):
    __tablename__ = "ranked_seasons"
    __table_args__ = (
        {"schema": "public", "comment": "Temporadas del sistema de rankeds."},
    )

    id          = Column(Integer, primary_key=True, autoincrement=True)
    season      = Column(Integer, nullable=False, unique=True)
    start_date  = Column(Date, nullable=False)
    end_date    = Column(Date, nullable=False)
    closed      = Column(Boolean, default=False, nullable=False)

    def __repr__(self) -> str:
        return f"<RankedSeason {self.season} {self.start_date}–{self.end_date}>"
```

- [ ] **Step 3: Verificar importación**

```bash
cd backend
python -c "from app.modules.ranked.models import RankedProfile, RankedEvent, RankedSeason, TIERS_NORMAL, TIERS_COMPETITIVE; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/ranked/
git commit -m "feat(ranked): RankedProfile, RankedEvent, RankedSeason models"
```

---

### Task 2: Gym servers models

**Files:**
- Create: `backend/app/modules/gym_servers/__init__.py`
- Create: `backend/app/modules/gym_servers/models.py`

- [ ] **Step 1: Crear paquete**

```bash
mkdir -p backend/app/modules/gym_servers
touch backend/app/modules/gym_servers/__init__.py
```

- [ ] **Step 2: Escribir models.py**

```python
# backend/app/modules/gym_servers/models.py
"""
Gym Servers — entidades sociales de competición y descubrimiento.

GymServer           — el "servidor" del gym (puede ser real o virtual)
GymMembership       — relación user ↔ gym
GymChampionBadge    — insignia top-3 de temporada
GymChallenge        — reto colectivo del gym
GymChallengeParticipant — usuario participando en un reto
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
    max_members = Column(Integer, default=50, nullable=False)   # 0 = ilimitado (verified)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    memberships = relationship("GymMembership", back_populates="gym", cascade="all, delete-orphan")
    challenges  = relationship("GymChallenge", back_populates="gym", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<GymServer id={self.id} name={self.name!r}>"


class GymMembership(Base):
    __tablename__ = "gym_memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "gym_id", name="uq_gym_membership"),
        {"schema": "public"},
    )

    id        = Column(Integer, primary_key=True, autoincrement=True)
    user_id   = Column(UUID(as_uuid=True), ForeignKey("public.users.id", ondelete="CASCADE"), nullable=False, index=True)
    gym_id    = Column(Integer, ForeignKey("public.gym_servers.id", ondelete="CASCADE"), nullable=False, index=True)
    role      = Column(String(10), nullable=False, default="member")  # member | admin | owner
    # Perfil público opt-in
    profile_public    = Column(Boolean, default=False, nullable=False)
    training_schedule = Column(String(20), nullable=True)   # 'morning' | 'afternoon' | 'evening'
    training_goal     = Column(String(20), nullable=True)   # 'strength' | 'volume' | 'health'
    contact_info      = Column(String(120), nullable=True)  # Instagram, Telegram, etc. (opt-in)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    gym = relationship("GymServer", back_populates="memberships")

    def __repr__(self) -> str:
        return f"<GymMembership user={str(self.user_id)[:8]}... gym={self.gym_id} role={self.role}>"


class GymChampionBadge(Base):
    __tablename__ = "gym_champion_badges"
    __table_args__ = (
        {"schema": "public", "comment": "Insignia top-3 de temporada en un gym."},
    )

    id        = Column(Integer, primary_key=True, autoincrement=True)
    user_id   = Column(UUID(as_uuid=True), ForeignKey("public.users.id", ondelete="CASCADE"), nullable=False, index=True)
    gym_id    = Column(Integer, ForeignKey("public.gym_servers.id", ondelete="CASCADE"), nullable=False)
    season    = Column(Integer, nullable=False)
    position  = Column(Integer, nullable=False)   # 1, 2, o 3
    queue     = Column(String(20), nullable=False, default="competitive")
    # Acceso a ligas geográficas (activo durante la temporada siguiente)
    city_league_eligible = Column(Boolean, default=False, nullable=False)
    earned_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self) -> str:
        return f"<GymChampionBadge user={str(self.user_id)[:8]}... pos={self.position} gym={self.gym_id}>"


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
    target_type  = Column(String(20), nullable=False)   # 'sessions' | 'volume_kg' | 'pr_count'
    target_value = Column(Integer, nullable=False)
    starts_at    = Column(DateTime(timezone=True), nullable=False)
    ends_at      = Column(DateTime(timezone=True), nullable=False)
    closed       = Column(Boolean, default=False, nullable=False)

    gym          = relationship("GymServer", back_populates="challenges")
    participants = relationship("GymChallengeParticipant", back_populates="challenge", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<GymChallenge id={self.id} title={self.title!r}>"


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

    def __repr__(self) -> str:
        return f"<GymChallengeParticipant challenge={self.challenge_id} user={str(self.user_id)[:8]}...>"
```

- [ ] **Step 3: Verificar importación**

```bash
cd backend
python -c "from app.modules.gym_servers.models import GymServer, GymMembership, GymChampionBadge, GymChallenge; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/gym_servers/
git commit -m "feat(gym): GymServer, GymMembership, GymChampionBadge, GymChallenge models"
```

---

### Task 3: Migración Alembic — ranked + gym tables

**Files:**
- Create: `backend/alembic/versions/20260515_0008_ranked_gym_tables.py`

- [ ] **Step 1: Asegurarse de que los modelos se importan en env.py**

En `backend/alembic/env.py`, verificar que hay un import de todos los modelos.
Añadir si falta:

```python
import app.modules.ranked.models  # noqa: F401
import app.modules.gym_servers.models  # noqa: F401
```

- [ ] **Step 2: Generar migración**

```bash
cd backend
alembic revision --autogenerate -m "ranked_and_gym_tables"
```

Expected: genera un archivo con las 7 tablas nuevas (ranked_profiles, ranked_events, ranked_seasons, gym_servers, gym_memberships, gym_champion_badges, gym_challenges, gym_challenge_participants).

- [ ] **Step 3: Aplicar migración**

```bash
alembic upgrade head
```

Expected: sin errores.

- [ ] **Step 4: Verificar tablas**

```bash
docker exec healthstack_db psql -U postgres -d healthstack -c "\dt public.ranked_* public.gym_*"
```

Expected: 8 tablas listadas.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/
git commit -m "feat(ranked): alembic migration for ranked and gym tables"
```

---

### Task 4: Ranked service — LP engine

**Files:**
- Create: `backend/app/modules/ranked/service.py`

- [ ] **Step 1: Escribir service.py**

```python
# backend/app/modules/ranked/service.py
"""Motor de LP para el sistema de rankeds. Soporta colas Normal y Competitivo."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.modules.ranked.models import (
    RankedProfile, RankedEvent, TIERS_NORMAL, TIERS_COMPETITIVE,
    TOP_TIER_NORMAL, TOP_TIER_COMPETITIVE, MAX_LP_PER_WEEK,
)


# ── Helpers de tier ───────────────────────────────────────────────────────────

def tier_index(queue: str, tier: str) -> int:
    tiers = TIERS_NORMAL if queue == "normal" else TIERS_COMPETITIVE
    return tiers.index(tier) if tier in tiers else 0


def is_top_tier(queue: str, tier: str) -> bool:
    return tier in (TOP_TIER_NORMAL, TOP_TIER_COMPETITIVE)


def tier_at_index(queue: str, idx: int) -> str:
    tiers = TIERS_NORMAL if queue == "normal" else TIERS_COMPETITIVE
    return tiers[max(0, min(idx, len(tiers) - 1))]


# ── Obtener o crear perfil ────────────────────────────────────────────────────

async def get_or_create_profile(
    db: AsyncSession, user_id: uuid.UUID, queue: str, season: int = 1
) -> RankedProfile:
    result = await db.execute(
        select(RankedProfile).where(
            RankedProfile.user_id == user_id,
            RankedProfile.queue == queue,
        )
    )
    profile = result.scalar_one_or_none()
    if profile:
        return profile

    tier = TIERS_NORMAL[0] if queue == "normal" else TIERS_COMPETITIVE[0]
    profile = RankedProfile(
        user_id=user_id, queue=queue, season=season,
        tier=tier, division=4, lp=0,
        peak_tier=tier, peak_division=4,
        competitive_unlocked=(queue == "normal"),  # normal siempre disponible
    )
    db.add(profile)
    await db.flush()
    return profile


# ── Aplicar delta de LP ───────────────────────────────────────────────────────

async def apply_lp_delta(
    db: AsyncSession,
    profile: RankedProfile,
    delta: int,
    event_type: str,
    meta: Optional[dict] = None,
) -> dict:
    """
    Aplica delta de LP al perfil con lógica de promoción/descenso.
    Devuelve { promoted, demoted, tier_before, tier_after, div_before, div_after, lp_after }.
    """
    if is_top_tier(profile.queue, profile.tier):
        # En tier máximo: LP sube sin límite, no hay promoción
        profile.lp = max(0, profile.lp + delta)
        await _log_event(db, profile, event_type, delta, meta)
        await db.commit()
        return {"promoted": False, "demoted": False, "tier_after": profile.tier, "lp_after": profile.lp}

    tier_before = profile.tier
    div_before  = profile.division

    profile.lp += delta
    promoted = demoted = False

    # Promoción
    if profile.lp >= 100:
        idx = tier_index(profile.queue, profile.tier)
        if profile.division > 1:
            profile.division -= 1
            profile.lp = 0
        else:
            next_idx = idx + 1
            tiers = TIERS_NORMAL if profile.queue == "normal" else TIERS_COMPETITIVE
            if next_idx < len(tiers):
                profile.tier = tiers[next_idx]
                profile.division = None if is_top_tier(profile.queue, profile.tier) else 4
                profile.lp = 0
                promoted = True
                # Actualizar peak
                if tier_index(profile.queue, profile.tier) > tier_index(profile.queue, profile.peak_tier):
                    profile.peak_tier = profile.tier
                    profile.peak_division = profile.division
                # Desbloquear competitivo si llega a Comprometido en Normal
                if profile.queue == "normal" and profile.tier == "comprometido":
                    profile.competitive_unlocked = True

    # Descenso
    elif profile.lp < 0:
        if profile.division and profile.division < 4:
            profile.division += 1
            profile.lp = 75
        else:
            idx = tier_index(profile.queue, profile.tier)
            if idx > 0:
                profile.tier = tier_at_index(profile.queue, idx - 1)
                profile.division = 1
                profile.lp = 75
                demoted = True
            else:
                profile.lp = 0   # ya en el tier más bajo

    await _log_event(db, profile, event_type, delta, meta)
    await db.commit()
    return {
        "promoted": promoted, "demoted": demoted,
        "tier_before": tier_before, "div_before": div_before,
        "tier_after": profile.tier, "div_after": profile.division,
        "lp_after": profile.lp,
    }


async def _log_event(
    db: AsyncSession, profile: RankedProfile, event_type: str, delta: int, meta: Optional[dict]
) -> None:
    event = RankedEvent(
        user_id=profile.user_id,
        queue=profile.queue,
        season=profile.season,
        event_type=event_type,
        lp_delta=delta,
        lp_after=profile.lp,
        tier_after=profile.tier,
        div_after=profile.division,
        meta=meta,
    )
    db.add(event)


# ── Puntuación por sesión ─────────────────────────────────────────────────────

async def process_workout_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    session_data: dict,
    season: int = 1,
) -> dict:
    """
    session_data = {
      total_volume_kg: float,
      personal_avg_volume: float | None,
      muscle_groups: list[str],
      prs: list[{ exercise_key, old_1rm, new_1rm }],
      streak_days: int,
    }
    Devuelve { normal: {...}, competitive: {...} }
    """
    normal_profile = await get_or_create_profile(db, user_id, "normal", season)
    comp_profile   = await get_or_create_profile(db, user_id, "competitive", season)

    results = {}

    # ── Cola Normal ───────────────────────────────────────────────────────────
    normal_lp = 8   # sesión completada
    muscle_groups = session_data.get("muscle_groups", [])
    if len(set(muscle_groups)) >= 3:
        normal_lp += 4   # variedad
    streak = session_data.get("streak_days", 0)
    if streak >= 7:
        normal_lp += 20
    elif streak >= 3:
        normal_lp += 12

    results["normal"] = await apply_lp_delta(
        db, normal_profile, normal_lp, "session_lp",
        meta={"muscle_groups": muscle_groups, "streak_days": streak},
    )

    # ── Cola Competitivo (solo si está desbloqueada) ──────────────────────────
    if not comp_profile.competitive_unlocked and not normal_profile.competitive_unlocked:
        results["competitive"] = {"locked": True}
    else:
        comp_profile.competitive_unlocked = True
        comp_lp = 0
        prs = session_data.get("prs", [])
        if prs:
            comp_lp += 15 * len(prs)   # +15 LP por cada PR

        vol = session_data.get("total_volume_kg", 0)
        avg = session_data.get("personal_avg_volume")
        if avg and avg > 0:
            ratio = vol / avg
            if ratio >= 1.2:
                comp_lp += 18
            elif ratio >= 1.0:
                comp_lp += 10

        meta = {"prs": prs, "volume_kg": vol, "avg_volume": avg}
        results["competitive"] = await apply_lp_delta(
            db, comp_profile, comp_lp, "session_lp" if not prs else "pr_lp", meta=meta,
        )

    return results
```

- [ ] **Step 2: Test unitario de la lógica de promoción**

Crear `tests/unit/test_ranked_service.py`:

```python
from app.modules.ranked.service import tier_index, tier_at_index, is_top_tier
from app.modules.ranked.models import TIERS_NORMAL, TIERS_COMPETITIVE

def test_tier_index_normal():
    assert tier_index("normal", "novato") == 0
    assert tier_index("normal", "leyenda") == 7

def test_tier_index_competitive():
    assert tier_index("competitive", "calentando") == 0
    assert tier_index("competitive", "apex") == 7

def test_top_tier_detection():
    assert is_top_tier("normal", "leyenda")
    assert is_top_tier("competitive", "apex")
    assert not is_top_tier("normal", "elite")

def test_tier_at_index_bounds():
    assert tier_at_index("normal", -1) == TIERS_NORMAL[0]
    assert tier_at_index("normal", 99) == TIERS_NORMAL[-1]
    assert tier_at_index("competitive", 3) == TIERS_COMPETITIVE[3]
```

```bash
cd backend
python -m pytest tests/unit/test_ranked_service.py -v
```

Expected: 4 tests pasan.

- [ ] **Step 3: Commit**

```bash
git add backend/app/modules/ranked/service.py tests/unit/test_ranked_service.py
git commit -m "feat(ranked): LP engine with Normal/Competitive queues, promotions, demotions"
```

---

### Task 5: Ranked schemas + repository + router

**Files:**
- Create: `backend/app/modules/ranked/schemas.py`
- Create: `backend/app/modules/ranked/repository.py`
- Create: `backend/app/modules/ranked/router.py`

- [ ] **Step 1: Escribir schemas.py**

```python
# backend/app/modules/ranked/schemas.py
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, ConfigDict


class QueueProfile(BaseModel):
    tier:      str
    division:  Optional[int]
    lp:        int
    peak_tier: str
    peak_div:  Optional[int]
    season:    int
    unlocked:  bool = True
    model_config = ConfigDict(from_attributes=True)


class RankedProfileResponse(BaseModel):
    normal:      QueueProfile
    competitive: QueueProfile


class LeaderboardEntry(BaseModel):
    rank:       int
    username:   str
    tier:       str
    division:   Optional[int]
    lp:         int
    badge:      Optional[str]   # 'gold' | 'silver' | 'bronze' | None
    model_config = ConfigDict(from_attributes=True)


class LeaderboardResponse(BaseModel):
    scope:    str       # 'gym' | 'city' | 'national' | 'global'
    gym_id:   Optional[int]
    season:   int
    entries:  list[LeaderboardEntry]
    my_rank:  Optional[int]
    total:    int


class RankedEventResponse(BaseModel):
    event_type: str
    lp_delta:   int
    lp_after:   int
    tier_after: str
    div_after:  Optional[int]
    created_at: str
    model_config = ConfigDict(from_attributes=True)
```

- [ ] **Step 2: Escribir repository.py**

```python
# backend/app/modules/ranked/repository.py
"""Queries para leaderboard y perfil ranked."""
from __future__ import annotations

import uuid
from typing import Optional
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.ranked.models import RankedProfile, RankedEvent
from app.modules.gym_servers.models import GymMembership


async def get_profile(db: AsyncSession, user_id: uuid.UUID, queue: str) -> Optional[RankedProfile]:
    result = await db.execute(
        select(RankedProfile).where(
            RankedProfile.user_id == user_id,
            RankedProfile.queue == queue,
        )
    )
    return result.scalar_one_or_none()


async def get_gym_leaderboard(
    db: AsyncSession, gym_id: int, queue: str, limit: int = 50
) -> list[dict]:
    """Top usuarios del gym según LP en la cola dada."""
    result = await db.execute(
        select(RankedProfile, GymMembership)
        .join(GymMembership, GymMembership.user_id == RankedProfile.user_id)
        .where(
            GymMembership.gym_id == gym_id,
            RankedProfile.queue == queue,
        )
        .order_by(desc(RankedProfile.lp))
        .limit(limit)
    )
    rows = result.all()
    return [
        {
            "profile": r.RankedProfile,
            "membership": r.GymMembership,
        }
        for r in rows
    ]


async def get_recent_events(
    db: AsyncSession, user_id: uuid.UUID, queue: str, limit: int = 20
) -> list[RankedEvent]:
    result = await db.execute(
        select(RankedEvent)
        .where(RankedEvent.user_id == user_id, RankedEvent.queue == queue)
        .order_by(desc(RankedEvent.created_at))
        .limit(limit)
    )
    return list(result.scalars().all())
```

- [ ] **Step 3: Escribir router.py**

```python
# backend/app/modules/ranked/router.py
"""Endpoints públicos del sistema de rankeds."""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.session import get_db
from app.core.security.jwt_handler import get_current_user
from app.modules.ranked import repository as repo
from app.modules.ranked import service as svc
from app.modules.ranked.schemas import (
    RankedProfileResponse, QueueProfile, LeaderboardResponse,
    LeaderboardEntry, RankedEventResponse,
)

router = APIRouter(prefix="/api/ranked", tags=["ranked"])


@router.get("/profile", response_model=RankedProfileResponse)
async def get_ranked_profile(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """LP y tier del usuario en ambas colas."""
    season = 1   # TODO: obtener de RankedSeason activa

    normal_p = await svc.get_or_create_profile(db, current_user.id, "normal", season)
    comp_p   = await svc.get_or_create_profile(db, current_user.id, "competitive", season)

    return RankedProfileResponse(
        normal=QueueProfile(
            tier=normal_p.tier, division=normal_p.division, lp=normal_p.lp,
            peak_tier=normal_p.peak_tier, peak_div=normal_p.peak_division,
            season=normal_p.season, unlocked=True,
        ),
        competitive=QueueProfile(
            tier=comp_p.tier, division=comp_p.division, lp=comp_p.lp,
            peak_tier=comp_p.peak_tier, peak_div=comp_p.peak_division,
            season=comp_p.season, unlocked=comp_p.competitive_unlocked,
        ),
    )


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard(
    queue: str = Query("competitive", pattern="^(normal|competitive)$"),
    scope: str = Query("gym", pattern="^(gym|city|national|global)$"),
    gym_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Leaderboard por scope. scope=gym requiere gym_id."""
    if scope == "gym" and not gym_id:
        raise HTTPException(status_code=400, detail="gym_id requerido para scope=gym")

    entries = []
    total = 0
    my_rank = None

    if scope == "gym" and gym_id:
        rows = await repo.get_gym_leaderboard(db, gym_id, queue)
        total = len(rows)
        for i, row in enumerate(rows, 1):
            p = row["profile"]
            entries.append(LeaderboardEntry(
                rank=i, username=str(p.user_id)[:8] + "...",  # TODO: join con users.username
                tier=p.tier, division=p.division, lp=p.lp, badge=None,
            ))
            if p.user_id == current_user.id:
                my_rank = i

    return LeaderboardResponse(
        scope=scope, gym_id=gym_id, season=1,
        entries=entries[:50], my_rank=my_rank, total=total,
    )


@router.get("/events", response_model=list[RankedEventResponse])
async def get_ranked_events(
    queue: str = Query("normal", pattern="^(normal|competitive)$"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Últimos eventos LP del usuario (historial de cambios)."""
    events = await repo.get_recent_events(db, current_user.id, queue, limit)
    return [
        RankedEventResponse(
            event_type=e.event_type, lp_delta=e.lp_delta, lp_after=e.lp_after,
            tier_after=e.tier_after, div_after=e.div_after,
            created_at=e.created_at.isoformat(),
        )
        for e in events
    ]
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/ranked/
git commit -m "feat(ranked): schemas, repository, router for ranked system"
```

---

### Task 6: Gym servers schemas + service + router

**Files:**
- Create: `backend/app/modules/gym_servers/schemas.py`
- Create: `backend/app/modules/gym_servers/service.py`
- Create: `backend/app/modules/gym_servers/router.py`

- [ ] **Step 1: Escribir schemas.py**

```python
# backend/app/modules/gym_servers/schemas.py
from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class GymCreateRequest(BaseModel):
    name:        str  = Field(..., min_length=3, max_length=80)
    description: Optional[str] = Field(None, max_length=500)
    city:        Optional[str] = Field(None, max_length=80)
    province:    Optional[str] = Field(None, max_length=80)
    country:     str           = Field("ES", max_length=5)
    is_public:   bool          = True


class GymResponse(BaseModel):
    id:          int
    name:        str
    description: Optional[str]
    city:        Optional[str]
    province:    Optional[str]
    country:     str
    invite_code: str
    is_public:   bool
    is_verified: bool
    member_count: int
    model_config = ConfigDict(from_attributes=True)


class JoinGymRequest(BaseModel):
    invite_code: Optional[str] = None
    gym_id:      Optional[int] = None


class MembershipUpdateRequest(BaseModel):
    profile_public:    Optional[bool] = None
    training_schedule: Optional[str]  = Field(None, pattern="^(morning|afternoon|evening)$")
    training_goal:     Optional[str]  = Field(None, pattern="^(strength|volume|health)$")
    contact_info:      Optional[str]  = Field(None, max_length=120)


class SparringProfile(BaseModel):
    username:     str
    tier_normal:  Optional[str]
    tier_comp:    Optional[str]
    training_schedule: Optional[str]
    training_goal:     Optional[str]
    contact_info:      Optional[str]


class ChallengeCreateRequest(BaseModel):
    title:        str  = Field(..., min_length=3, max_length=100)
    description:  Optional[str] = None
    target_type:  str  = Field(..., pattern="^(sessions|volume_kg|pr_count)$")
    target_value: int  = Field(..., ge=1)
    starts_at:    datetime
    ends_at:      datetime


class ChallengeResponse(BaseModel):
    id:           int
    title:        str
    target_type:  str
    target_value: int
    current_value: int
    participant_count: int
    ends_at:      datetime
    model_config = ConfigDict(from_attributes=True)
```

- [ ] **Step 2: Escribir service.py**

```python
# backend/app/modules/gym_servers/service.py
"""Lógica de gym servers: crear, unirse, sparring, retos."""
from __future__ import annotations

import random
import string
import uuid
from typing import Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.gym_servers.models import (
    GymServer, GymMembership, GymChallenge, GymChallengeParticipant,
)


def _generate_invite_code(length: int = 8) -> str:
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=length))


async def create_gym(
    db: AsyncSession, user_id: uuid.UUID, data: dict
) -> GymServer:
    code = _generate_invite_code()
    # Asegurar código único
    while (await db.execute(select(GymServer).where(GymServer.invite_code == code))).scalar_one_or_none():
        code = _generate_invite_code()

    gym = GymServer(
        name=data["name"],
        description=data.get("description"),
        created_by=user_id,
        city=data.get("city"),
        province=data.get("province"),
        country=data.get("country", "ES"),
        invite_code=code,
        is_public=data.get("is_public", True),
    )
    db.add(gym)
    await db.flush()

    # El creador es owner
    membership = GymMembership(user_id=user_id, gym_id=gym.id, role="owner")
    db.add(membership)
    await db.commit()
    await db.refresh(gym)
    return gym


async def join_gym(
    db: AsyncSession, user_id: uuid.UUID, gym_id: Optional[int], invite_code: Optional[str]
) -> GymMembership:
    if invite_code:
        gym = (await db.execute(select(GymServer).where(GymServer.invite_code == invite_code))).scalar_one_or_none()
    elif gym_id:
        gym = (await db.execute(select(GymServer).where(GymServer.id == gym_id, GymServer.is_public == True))).scalar_one_or_none()
    else:
        raise ValueError("Se requiere invite_code o gym_id")

    if not gym:
        raise ValueError("Gym no encontrado")

    # Verificar que no está ya en el gym
    existing = (await db.execute(
        select(GymMembership).where(GymMembership.user_id == user_id, GymMembership.gym_id == gym.id)
    )).scalar_one_or_none()
    if existing:
        return existing

    # Verificar límite de miembros
    if gym.max_members > 0:
        count = (await db.execute(
            select(func.count()).where(GymMembership.gym_id == gym.id)
        )).scalar_one()
        if count >= gym.max_members:
            raise ValueError("El gym está lleno")

    membership = GymMembership(user_id=user_id, gym_id=gym.id, role="member")
    db.add(membership)
    await db.commit()
    return membership


async def get_sparrings(
    db: AsyncSession, gym_id: int, requesting_user_id: uuid.UUID,
    tier_range: Optional[str] = None,
) -> list[dict]:
    """Miembros del gym con perfil público, excepto el usuario que pide."""
    result = await db.execute(
        select(GymMembership).where(
            GymMembership.gym_id == gym_id,
            GymMembership.profile_public == True,
            GymMembership.user_id != requesting_user_id,
        )
    )
    return [{"membership": m} for m in result.scalars().all()]


async def create_challenge(
    db: AsyncSession, gym_id: int, user_id: uuid.UUID, data: dict
) -> GymChallenge:
    challenge = GymChallenge(
        gym_id=gym_id, created_by=user_id,
        title=data["title"], description=data.get("description"),
        target_type=data["target_type"], target_value=data["target_value"],
        starts_at=data["starts_at"], ends_at=data["ends_at"],
    )
    db.add(challenge)
    await db.commit()
    await db.refresh(challenge)
    return challenge


async def join_challenge(
    db: AsyncSession, challenge_id: int, user_id: uuid.UUID
) -> GymChallengeParticipant:
    existing = (await db.execute(
        select(GymChallengeParticipant).where(
            GymChallengeParticipant.challenge_id == challenge_id,
            GymChallengeParticipant.user_id == user_id,
        )
    )).scalar_one_or_none()
    if existing:
        return existing
    p = GymChallengeParticipant(challenge_id=challenge_id, user_id=user_id)
    db.add(p)
    await db.commit()
    return p
```

- [ ] **Step 3: Escribir router.py**

```python
# backend/app/modules/gym_servers/router.py
"""Endpoints de gym servers."""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.session import get_db
from app.core.security.jwt_handler import get_current_user
from app.modules.gym_servers import service as svc
from app.modules.gym_servers.models import GymServer, GymMembership
from app.modules.gym_servers.schemas import (
    GymCreateRequest, GymResponse, JoinGymRequest,
    MembershipUpdateRequest, ChallengeCreateRequest, ChallengeResponse,
)

router = APIRouter(prefix="/api/gym-servers", tags=["gym-servers"])


@router.post("", response_model=GymResponse, status_code=status.HTTP_201_CREATED)
async def create_gym(
    body: GymCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    gym = await svc.create_gym(db, current_user.id, body.model_dump())
    count = (await db.execute(select(func.count()).where(GymMembership.gym_id == gym.id))).scalar_one()
    return GymResponse(**gym.__dict__, member_count=count)


@router.post("/join", status_code=status.HTTP_201_CREATED)
async def join_gym(
    body: JoinGymRequest,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    try:
        await svc.join_gym(db, current_user.id, body.gym_id, body.invite_code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"joined": True}


@router.get("/my-gyms")
async def my_gyms(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    result = await db.execute(
        select(GymServer)
        .join(GymMembership, GymMembership.gym_id == GymServer.id)
        .where(GymMembership.user_id == current_user.id)
    )
    gyms = result.scalars().all()
    return [{"id": g.id, "name": g.name, "invite_code": g.invite_code} for g in gyms]


@router.get("/{gym_id}/sparrings")
async def get_sparrings(
    gym_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    rows = await svc.get_sparrings(db, gym_id, current_user.id)
    return [{"user_id": str(r["membership"].user_id), "schedule": r["membership"].training_schedule, "goal": r["membership"].training_goal, "contact": r["membership"].contact_info} for r in rows]


@router.patch("/my-profile/{gym_id}")
async def update_profile(
    gym_id: int,
    body: MembershipUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    result = await db.execute(
        select(GymMembership).where(
            GymMembership.user_id == current_user.id,
            GymMembership.gym_id == gym_id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="No eres miembro de este gym")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(membership, field, val)
    await db.commit()
    return {"updated": True}


@router.post("/{gym_id}/challenges", status_code=status.HTTP_201_CREATED)
async def create_challenge(
    gym_id: int,
    body: ChallengeCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    # Solo admins y owners pueden crear retos
    result = await db.execute(
        select(GymMembership).where(
            GymMembership.gym_id == gym_id,
            GymMembership.user_id == current_user.id,
            GymMembership.role.in_(["admin", "owner"]),
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Solo admins pueden crear retos")
    challenge = await svc.create_challenge(db, gym_id, current_user.id, body.model_dump())
    return {"id": challenge.id, "title": challenge.title}


@router.post("/{gym_id}/challenges/{challenge_id}/join")
async def join_challenge(
    gym_id: int,
    challenge_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    await svc.join_challenge(db, challenge_id, current_user.id)
    return {"joined": True}
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/gym_servers/
git commit -m "feat(gym): gym servers schemas, service, router with sparring and challenges"
```

---

### Task 7: Registrar routers en main.py + tests de integración

**Files:**
- Modify: `backend/app/main.py`
- Create: `tests/integration/test_ranked.py`
- Create: `tests/integration/test_gym_servers.py`

- [ ] **Step 1: Registrar ambos routers en main.py**

```python
from app.modules.ranked.router import router as ranked_router
from app.modules.gym_servers.router import router as gym_router
# junto al resto de include_router:
app.include_router(ranked_router)
app.include_router(gym_router)
```

- [ ] **Step 2: Escribir tests de ranked**

Crear `tests/integration/test_ranked.py`:

```python
# tests/integration/test_ranked.py
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_ranked_profile_creates_defaults(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/ranked/profile", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["normal"]["tier"] == "novato"
    assert data["normal"]["division"] == 4
    assert data["normal"]["lp"] == 0
    assert data["competitive"]["unlocked"] == False


@pytest.mark.asyncio
async def test_ranked_events_empty_initially(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/ranked/events?queue=normal", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_ranked_requires_auth(client: AsyncClient):
    resp = await client.get("/api/ranked/profile")
    assert resp.status_code == 401
```

- [ ] **Step 3: Escribir tests de gym servers**

Crear `tests/integration/test_gym_servers.py`:

```python
# tests/integration/test_gym_servers.py
import pytest
from httpx import AsyncClient

GYM_PAYLOAD = {
    "name": "CrossFit Test Gym",
    "description": "Gym de prueba",
    "city": "Madrid",
    "is_public": True,
}


@pytest.mark.asyncio
async def test_create_gym(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/gym-servers", json=GYM_PAYLOAD, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "CrossFit Test Gym"
    assert len(data["invite_code"]) == 8
    assert data["member_count"] == 1


@pytest.mark.asyncio
async def test_my_gyms(client: AsyncClient, auth_headers: dict):
    await client.post("/api/gym-servers", json=GYM_PAYLOAD, headers=auth_headers)
    resp = await client.get("/api/gym-servers/my-gyms", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


@pytest.mark.asyncio
async def test_join_gym_by_invite_code(client: AsyncClient, auth_headers: dict):
    create_resp = await client.post("/api/gym-servers", json=GYM_PAYLOAD, headers=auth_headers)
    invite_code = create_resp.json()["invite_code"]

    # Segundo usuario se une
    await client.post("/api/v1/auth/register", json={
        "email": "gym_joiner@test.com", "username": "gym_joiner", "password": "TestPass123!"
    })
    login_resp = await client.post("/api/v1/auth/login", json={
        "email": "gym_joiner@test.com", "password": "TestPass123!"
    })
    token2 = login_resp.json()["access_token"]
    headers2 = {"Authorization": f"Bearer {token2}"}

    resp = await client.post("/api/gym-servers/join", json={"invite_code": invite_code}, headers=headers2)
    assert resp.status_code == 201
    assert resp.json()["joined"] == True


@pytest.mark.asyncio
async def test_gym_requires_auth(client: AsyncClient):
    resp = await client.post("/api/gym-servers", json=GYM_PAYLOAD)
    assert resp.status_code == 401
```

- [ ] **Step 4: Ejecutar todos los tests**

```bash
cd backend
python -m pytest -v --tb=short
```

Expected: ≥ 107 tests pasan (90 base + 7 workout + 3 ranked + 4 gym).

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py tests/integration/test_ranked.py tests/integration/test_gym_servers.py
git commit -m "feat(ranked+gym): register routers, integration tests for ranked and gym servers"
```

---

### Task 8: Frontend — ranked.js (panel + gym server UI)

**Files:**
- Create: `frontend/js/ranked.js`
- Modify: `frontend/index.html`

- [ ] **Step 1: Escribir ranked.js**

```js
// frontend/js/ranked.js
// Panel de rankeds: dos colas + gym server + búsqueda de sparring + retos.

const TIER_COLORS = {
  // Normal
  novato:       '#6b7280', regular:      '#10b981', constante:    '#22d3ee',
  comprometido: '#3b82f6', veterano:     '#8b5cf6', forjado:      '#f59e0b',
  elite:        '#ef4444', leyenda:      '#fbbf24',
  // Competitivo
  calentando:   '#6b7280', amateur:      '#10b981', semipro:      '#22d3ee',
  bestia:       '#3b82f6', titan:        '#8b5cf6', fenomeno:     '#f59e0b',
  invicto:      '#ef4444', apex:         '#fbbf24',
};

const TIER_LABELS = {
  novato:'Novato', regular:'Regular', constante:'Constante', comprometido:'Comprometido',
  veterano:'Veterano', forjado:'Forjado', elite:'Élite', leyenda:'Leyenda',
  calentando:'Calentando', amateur:'Amateur', semipro:'Semipro', bestia:'Bestia',
  titan:'Titán', fenomeno:'Fenómeno', invicto:'Invicto', apex:'Apex',
};

export async function init(container) {
  container.innerHTML = '<div class="rk-loading">Cargando rankeds...</div>';
  try {
    const [profile, gyms] = await Promise.all([
      fetchJSON('/api/ranked/profile'),
      fetchJSON('/api/gym-servers/my-gyms'),
    ]);
    render(container, profile, gyms);
  } catch (e) {
    container.innerHTML = '<p class="rk-error">No se pudo cargar el ranking.</p>';
  }
}

function render(container, profile, gyms) {
  container.innerHTML = `
    <div class="rk-panel">
      ${queueCard('Normal', profile.normal, 'normal')}
      ${profile.competitive.unlocked
        ? queueCard('Competitivo', profile.competitive, 'competitive')
        : lockedCard()
      }
    </div>
    ${gyms.length ? gymPanel(gyms[0]) : noGymPanel()}`;

  // Evento: ver leaderboard del gym
  container.querySelectorAll('[data-gym-id]').forEach(btn => {
    btn.addEventListener('click', () => openGymLeaderboard(container, btn.dataset.gymId));
  });
  // Evento: buscar sparring
  container.querySelectorAll('[data-sparring-gym]').forEach(btn => {
    btn.addEventListener('click', () => openSparring(container, btn.dataset.sparringGym));
  });
  // Evento: crear gym
  const createBtn = container.querySelector('#rk-create-gym');
  if (createBtn) createBtn.addEventListener('click', () => openCreateGym(container));
}

function queueCard(label, q, queue) {
  const color   = TIER_COLORS[q.tier] || '#7c6bff';
  const tierLbl = TIER_LABELS[q.tier] || q.tier;
  const divLbl  = q.division ? ` ${['I','II','III','IV'][q.division - 1]}` : '';
  const pct     = q.tier === 'leyenda' || q.tier === 'apex' ? 100 : q.lp;

  return `<div class="rk-queue-card">
    <div class="rk-queue-header">
      <span class="rk-queue-label">${label}</span>
      <span class="rk-tier-badge" style="background:${color}22;color:${color};">${tierLbl}${divLbl}</span>
    </div>
    <div class="rk-lp-bar-track">
      <div class="rk-lp-bar-fill" style="width:${pct}%;background:${color};"></div>
    </div>
    <div class="rk-lp-info">${q.lp} LP${q.tier !== 'leyenda' && q.tier !== 'apex' ? ' / 100' : ''}</div>
  </div>`;
}

function lockedCard() {
  return `<div class="rk-queue-card rk-locked">
    <p class="rk-locked-msg">🔒 Cola Competitivo</p>
    <p class="rk-locked-hint">Llega a <strong>Comprometido</strong> en Normal para desbloquear.</p>
  </div>`;
}

function gymPanel(gym) {
  return `<div class="rk-gym-panel">
    <div class="rk-gym-header">
      <span class="rk-gym-name">🏋️ ${gym.name}</span>
      <span class="rk-gym-code">Código: <strong>${gym.invite_code}</strong></span>
    </div>
    <div class="rk-gym-actions">
      <button class="btn-secondary rk-action" data-gym-id="${gym.id}">🏆 Leaderboard</button>
      <button class="btn-secondary rk-action" data-sparring-gym="${gym.id}">🤝 Buscar Sparring</button>
    </div>
  </div>`;
}

function noGymPanel() {
  return `<div class="rk-no-gym">
    <p>Aún no perteneces a ningún gym. ¡Crea uno o únete con un código!</p>
    <button class="btn-primary" id="rk-create-gym">+ Crear Gym</button>
    <div class="rk-join-form">
      <input type="text" id="rk-join-code" placeholder="Código de invitación" class="wl-input" maxlength="12" />
      <button class="btn-secondary" id="rk-join-btn">Unirse</button>
    </div>
  </div>`;
}

async function openGymLeaderboard(container, gymId) {
  const data = await fetchJSON(`/api/ranked/leaderboard?queue=competitive&scope=gym&gym_id=${gymId}`);
  const rows = data.entries.map((e, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
    const tier  = TIER_LABELS[e.tier] || e.tier;
    const div   = e.division ? ` ${['I','II','III','IV'][e.division-1]}` : '';
    return `<div class="rk-lb-row${e.rank === data.my_rank ? ' rk-lb-me' : ''}">
      <span class="rk-lb-rank">${medal}</span>
      <span class="rk-lb-name">${e.username}</span>
      <span class="rk-lb-tier">${tier}${div}</span>
      <span class="rk-lb-lp">${e.lp} LP</span>
    </div>`;
  }).join('');
  showModal(container, 'Leaderboard Competitivo', rows || '<p>Sin datos</p>');
}

async function openSparring(container, gymId) {
  const data = await fetchJSON(`/api/gym-servers/${gymId}/sparrings`);
  const cards = data.map(m => {
    const goals = { strength:'Fuerza', volume:'Volumen', health:'Salud' };
    const times = { morning:'Mañana', afternoon:'Tarde', evening:'Noche' };
    return `<div class="rk-sparring-card">
      <span class="rk-sparring-name">${m.user_id}</span>
      <span class="rk-sparring-meta">${times[m.schedule] || '—'} · ${goals[m.goal] || '—'}</span>
      ${m.contact ? `<a class="rk-sparring-contact" href="${m.contact}" target="_blank">Contactar</a>` : ''}
    </div>`;
  }).join('');
  showModal(container, 'Buscar Sparring', cards || '<p>Ningún miembro ha activado su perfil aún.</p>');
}

function openCreateGym(container) {
  showModal(container, 'Crear Gym', `
    <div class="rk-create-form">
      <input id="rk-gym-name" class="wl-input" placeholder="Nombre del gym" maxlength="80" />
      <input id="rk-gym-city" class="wl-input" placeholder="Ciudad (opcional)" maxlength="80" />
      <button class="btn-primary" id="rk-gym-submit">Crear</button>
    </div>`);
  document.getElementById('rk-gym-submit')?.addEventListener('click', async () => {
    const name = document.getElementById('rk-gym-name')?.value?.trim();
    const city = document.getElementById('rk-gym-city')?.value?.trim();
    if (!name) return;
    await fetchJSON('/api/gym-servers', { method:'POST', body: JSON.stringify({ name, city, is_public: true }) });
    closeModal();
    init(container);   // re-render
  });
}

function showModal(container, title, html) {
  let overlay = document.getElementById('rk-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'rk-modal-overlay';
    overlay.className = 'rk-modal-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="rk-modal">
    <div class="rk-modal-header"><span>${title}</span><button class="rk-modal-close" onclick="document.getElementById('rk-modal-overlay').remove()">✕</button></div>
    <div class="rk-modal-body">${html}</div>
  </div>`;
  overlay.style.display = 'flex';
}

function closeModal() {
  document.getElementById('rk-modal-overlay')?.remove();
}

async function fetchJSON(url, options = {}) {
  const token = localStorage.getItem('hs_auth_token') || sessionStorage.getItem('hs_auth_token') || '';
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}
```

- [ ] **Step 2: Añadir sección #ranked-section en index.html**

```html
<!-- Sección Rankeds -->
<section id="ranked-section" class="health-card" style="display:none;">
  <h2 class="section-title">Rankeds</h2>
  <div id="ranked-root"></div>
</section>
```

Añadir en el menú:
```html
<button class="nav-btn" data-section="ranked-section">Rankeds</button>
```

- [ ] **Step 3: Inicializar en el JS principal**

```js
import { init as initRanked } from './ranked.js';
const rankedRoot = document.getElementById('ranked-root');
if (rankedRoot) initRanked(rankedRoot);
```

- [ ] **Step 4: Añadir CSS al final de main.css**

```css
/* ── Ranked System ─────────────────────────────────────────────────── */
.rk-panel { display: flex; flex-direction: column; gap: 12px; }
.rk-queue-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 14px; }
.rk-queue-card.rk-locked { opacity: 0.6; }
.rk-queue-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.rk-queue-label { font-weight: 600; font-size: 13px; }
.rk-tier-badge { font-size: 12px; padding: 3px 10px; border-radius: 20px; font-weight: 700; }
.rk-lp-bar-track { height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; }
.rk-lp-bar-fill { height: 100%; border-radius: 3px; transition: width 0.6s ease; }
.rk-lp-info { font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 4px; }
.rk-locked-msg { font-weight: 600; margin-bottom: 4px; }
.rk-locked-hint { font-size: 12px; color: rgba(255,255,255,0.4); }

.rk-gym-panel { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 14px; margin-top: 12px; }
.rk-gym-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.rk-gym-name { font-weight: 600; font-size: 14px; }
.rk-gym-code { font-size: 11px; color: rgba(255,255,255,0.4); }
.rk-gym-actions { display: flex; gap: 8px; }
.rk-action { font-size: 12px; padding: 6px 12px; }

.rk-no-gym { text-align: center; padding: 20px; }
.rk-no-gym p { color: rgba(255,255,255,0.5); font-size: 13px; margin-bottom: 12px; }
.rk-join-form { display: flex; gap: 8px; margin-top: 10px; justify-content: center; }

.rk-lb-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 13px; }
.rk-lb-row.rk-lb-me { background: rgba(124,107,255,0.08); border-radius: 6px; padding: 8px 6px; }
.rk-lb-rank { width: 32px; text-align: center; }
.rk-lb-name { flex: 1; }
.rk-lb-tier { font-size: 11px; color: rgba(255,255,255,0.5); }
.rk-lb-lp { font-weight: 600; color: #7c6bff; }

.rk-sparring-card { padding: 10px; border: 1px solid rgba(255,255,255,0.07); border-radius: 8px; margin-bottom: 8px; }
.rk-sparring-name { font-weight: 600; display: block; }
.rk-sparring-meta { font-size: 11px; color: rgba(255,255,255,0.4); display: block; margin-top: 2px; }
.rk-sparring-contact { display: inline-block; margin-top: 6px; font-size: 12px; color: #7c6bff; }

.rk-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.rk-modal { background: #0c0c1e; border: 1px solid rgba(124,107,255,0.3); border-radius: 16px; width: min(480px, 94vw); max-height: 80vh; overflow: hidden; display: flex; flex-direction: column; }
.rk-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.07); font-weight: 600; }
.rk-modal-close { background: none; border: none; color: rgba(255,255,255,0.5); cursor: pointer; font-size: 18px; }
.rk-modal-body { padding: 16px; overflow-y: auto; }
.rk-create-form { display: flex; flex-direction: column; gap: 10px; }
```

- [ ] **Step 5: Commit final**

```bash
git add frontend/js/ranked.js frontend/index.html frontend/css/main.css
git commit -m "feat(ranked): ranked.js UI with dual queues, gym panel, sparring search, modal leaderboard"
```

---

### Task 9: Integración ranked ↔ workout sessions

**Files:**
- Modify: `backend/app/modules/workout_sessions/service.py`

- [ ] **Step 1: Llamar al LP engine tras guardar sesión**

En `backend/app/modules/workout_sessions/service.py`, al final de `create_workout_session()`,
después de otorgar XP de gamificación, añadir:

```python
# Ranked: actualizar LP según la sesión
try:
    from app.modules.ranked.service import process_workout_session as ranked_update
    muscle_groups = list({
        ex["exercise_key"].split("_")[0]   # aproximación rápida al grupo muscular
        for ex in exercises_data
    })
    # personal_avg_volume: promedio de las últimas 10 sesiones del usuario
    # (simplificado: pasamos None para que el servicio lo ignore si no hay historial)
    await ranked_update(db=db, user_id=user_id, session_data={
        "total_volume_kg": total_volume,
        "personal_avg_volume": None,   # TODO: calcular en repository
        "muscle_groups": muscle_groups,
        "prs": [{"exercise_key": pr.exercise_key, "old_1rm": pr.prev, "new_1rm": pr.value} for pr in prs],
        "streak_days": 0,   # TODO: obtener del perfil de gamificación
    })
except Exception:
    pass   # ranked no bloquea si falla
```

- [ ] **Step 2: Verificar que los tests de workout siguen pasando**

```bash
cd backend
python -m pytest tests/integration/test_workout_sessions.py -v
```

Expected: 7 tests pasan.

- [ ] **Step 3: Ejecutar la suite completa**

```bash
python -m pytest -v --tb=short
```

Expected: todos los tests pasan.

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/workout_sessions/service.py
git commit -m "feat(ranked): wire ranked LP update on workout session save"
```
