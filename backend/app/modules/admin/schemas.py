from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class UserAdminRow(BaseModel):
    id: UUID
    email: str
    display_name: str | None
    role: str
    plan: str
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime
    # Campos RGPD — visibles en admin para auditoría de consentimiento
    onboarding_completed: bool = False
    onboarding_v2_completed: bool = False
    ai_consent_at: datetime | None = None   # Null = sin consentimiento Art.9 IA
    model_config = {"from_attributes": True}


class PatchUserRequest(BaseModel):
    role: str | None = Field(None, max_length=20)   # "user" | "admin"
    plan: str | None = Field(None, max_length=10)   # "free" | "pro" | "elite"
    is_active: bool | None = None


class OverviewStats(BaseModel):
    total_users: int
    active_users_30d: int
    new_users_today: int
    admin_count: int


class TimeseriesPoint(BaseModel):
    date: str   # "YYYY-MM-DD"
    count: int


class TimeseriesMultiPoint(BaseModel):
    date: str
    users: int
    workouts: int
    posts: int
    routines: int


class ModuleActivity(BaseModel):
    module: str
    count: int


class TableInfo(BaseModel):
    table_name: str
    approx_count: int


class TechnicalMetrics(BaseModel):
    page_views_today: int
    page_views_7d: int
    top_endpoints: list[dict]   # [{endpoint, count}]


# ── Plans distribution ─────────────────────────────────────────────────────────

class PlanDistributionItem(BaseModel):
    plan: str
    count: int


# ── DB Health semaphore ────────────────────────────────────────────────────────

class ModuleHealthItem(BaseModel):
    module: str
    label: str
    total: int
    last_record_at: str | None   # ISO-8601 string or None
    active_24h: int
    active_7d: int
    status: str   # "ok" | "warn" | "empty" | "error"


# ── System health ─────────────────────────────────────────────────────────────

class SystemServiceItem(BaseModel):
    service: str
    status: str        # "ok" | "warn" | "error"
    latency_ms: float  # -1 if not measurable
    detail: str
