# Admin Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a protected `/admin` page with user management, DB explorer, analytics KPIs, charts, and technical metrics — visible only to `role=admin` users.

**Architecture:** Separate `admin.html` + vanilla JS SPA. New `admin` and `telemetry` backend modules follow Router→Service→Repository pattern. Triple-layer auth: nginx location + `require_role("admin")` + frontend JWT check.

**Tech Stack:** FastAPI async, SQLAlchemy 2.0, Alembic, Chart.js v4 (local), vanilla JS, PostgreSQL 17.

---

## File Map

**New backend files:**
- `backend/app/modules/admin/__init__.py`
- `backend/app/modules/admin/schemas.py`
- `backend/app/modules/admin/repository.py`
- `backend/app/modules/admin/service.py`
- `backend/app/modules/admin/router.py`
- `backend/app/modules/telemetry/__init__.py`
- `backend/app/modules/telemetry/models.py`
- `backend/app/modules/telemetry/schemas.py`
- `backend/app/modules/telemetry/repository.py`
- `backend/app/modules/telemetry/service.py`
- `backend/app/modules/telemetry/router.py`
- `backend/tests/integration/test_admin.py`
- `backend/tests/integration/test_telemetry.py`
- `backend/alembic/versions/XXXX_add_plan_to_users.py`
- `backend/alembic/versions/XXXX_add_page_views_table.py`

**Modified backend files:**
- `backend/app/core/security/jwt_handler.py` — add `plan` param to `create_access_token`
- `backend/app/modules/identity/schemas.py` — add `plan`, `is_active`, `last_login_at` to `UserPublicResponse`
- `backend/app/modules/identity/router.py` — pass `plan` to `create_access_token`; 301 redirects old admin endpoints
- `backend/app/main.py` — register admin + telemetry routers
- `backend/app/core/scheduler.py` — add page_views retention job

**New frontend files:**
- `frontend/admin.html`
- `frontend/css/admin.css`
- `frontend/js/vendor/chart.umd.min.js`
- `frontend/js/admin/admin.js`
- `frontend/js/admin/adminApi.js`
- `frontend/js/admin/adminStats.js`
- `frontend/js/admin/adminUsers.js`
- `frontend/js/admin/adminTables.js`
- `frontend/js/admin/adminMetrics.js`

**Modified frontend files:**
- `frontend/js/api.js` — sync `plan` from JWT to `hs_plan` localStorage

**nginx:**
- `nginx/nginx.conf` — admin rate limit zone + `/admin` location
- `nginx/nginx.pi.conf` — same

---

## Task 1: Create feature branch

- [ ] Create and switch to feature branch
```bash
cd C:\Users\josel\OneDrive\Escritorio\CLAUDE\Health_Stack
git checkout -b feat/admin-panel
```

---

## Task 2: Alembic migration — add `plan` to users

- [ ] Create migration file `backend/alembic/versions/XXXX_add_plan_to_users.py`

```python
"""add plan to users

Revision ID: a1b2c3d4e5f6
Revises: <previous_revision>
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = None  # set to actual previous revision
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column('users',
        sa.Column('plan', sa.String(10), nullable=False, server_default='free'),
        schema='public'
    )
    op.create_check_constraint(
        'users_plan_check', 'users',
        "plan IN ('free', 'pro', 'elite')",
        schema='public'
    )

def downgrade() -> None:
    op.drop_constraint('users_plan_check', 'users', schema='public')
    op.drop_column('users', 'plan', schema='public')
```

---

## Task 3: Alembic migration — create `page_views` table

- [ ] Create migration file `backend/alembic/versions/XXXX_add_page_views_table.py`

```python
"""add page_views table

Revision ID: b2c3d4e5f6a1
Revises: a1b2c3d4e5f6
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'b2c3d4e5f6a1'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table('page_views',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('page', sa.String(100), nullable=False),
        sa.Column('country', sa.String(2), nullable=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('public.users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('is_auth', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_admin', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        schema='public'
    )
    op.create_index('idx_page_views_created_at', 'page_views', ['created_at'], schema='public')
    op.create_index('idx_page_views_page', 'page_views', ['page'], schema='public')

def downgrade() -> None:
    op.drop_index('idx_page_views_page', 'page_views', schema='public')
    op.drop_index('idx_page_views_created_at', 'page_views', schema='public')
    op.drop_table('page_views', schema='public')
```

---

## Task 4: Update JWT + identity schemas for `plan`

- [ ] Add `plan` to `create_access_token` in `jwt_handler.py`
- [ ] Add `plan`, `is_active`, `last_login_at` to `UserPublicResponse` in `identity/schemas.py`
- [ ] Update all callers of `create_access_token` in `identity/router.py`

---

## Task 5: Backend `admin` module

- [ ] Create all 5 files: `__init__.py`, `schemas.py`, `repository.py`, `service.py`, `router.py`
- [ ] Key endpoints: stats/overview, stats/timeseries, stats/modules, db/tables, db/tables/{name}, metrics/technical, metrics/prometheus, users (GET+PATCH)
- [ ] Safety checks in PATCH: self-modification blocked, last-admin protection

---

## Task 6: Backend `telemetry` module

- [ ] Create all files with `POST /api/v1/telemetry/page-view` endpoint
- [ ] Public endpoint with rate limit 10/min
- [ ] Extract role from JWT if present to set `is_admin`

---

## Task 7: Register routers + scheduler job in `main.py`

- [ ] Import and register admin + telemetry routers
- [ ] Add page_views retention job to scheduler

---

## Task 8: Tests

- [ ] `test_admin.py`: 403 for non-admin, self-mod blocked, last-admin protection, whitelist, masking, pagination cap
- [ ] `test_telemetry.py`: page-view creation, is_admin flag, rate limit

---

## Task 9: nginx updates

- [ ] Add `admin` rate limit zone + location in both configs

---

## Task 10: Frontend — Download Chart.js + structure

- [ ] Download Chart.js v4 UMD build to `frontend/js/vendor/chart.umd.min.js`
- [ ] Create `frontend/js/admin/` directory structure

---

## Task 11: Frontend files

- [ ] `admin.html` — full layout with sidebar, topbar, section containers
- [ ] `admin.css` — styles inheriting teal tokens
- [ ] `admin.js` — bootstrap, JWT auth check, SPA routing
- [ ] `adminApi.js` — fetch wrapper with JWT auto-attach
- [ ] `adminStats.js` — KPI cards + Chart.js line/donut/bar
- [ ] `adminUsers.js` — users table + modals (suspend, role, plan)
- [ ] `adminTables.js` — DB explorer with masking
- [ ] `adminMetrics.js` — page_views + Prometheus metrics

---

## Task 12: Update `api.js` for plan sync

- [ ] Modify `saveAuth` to write `plan` from user object to `hs_plan` localStorage

---

## Task 13: Commit, check conflicts, merge, push

- [ ] Run tests to verify no regressions
- [ ] Commit all changes
- [ ] Check for conflicts with main
- [ ] Merge to main
- [ ] Push
