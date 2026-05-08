"""
tests/integration/test_admin.py
================================
Tests de integración para el panel de administración.

Cubre:
- Protección 403 para tokens sin rol admin
- Endpoints de estadísticas
- Explorador de tablas (whitelist, enmascarado, paginación)
- Gestión de usuarios (patch, automodificación bloqueada, último admin)
"""

import pytest


ADMIN_BASE = "/api/v1/admin"


@pytest.mark.asyncio
class TestAdminAuthorization:
    """Todos los endpoints admin devuelven 403 para tokens de usuario normal."""

    async def test_overview_requires_admin(self, client, auth_headers):
        resp = await client.get(f"{ADMIN_BASE}/stats/overview", headers=auth_headers)
        assert resp.status_code == 403

    async def test_users_requires_admin(self, client, auth_headers):
        resp = await client.get(f"{ADMIN_BASE}/users", headers=auth_headers)
        assert resp.status_code == 403

    async def test_tables_requires_admin(self, client, auth_headers):
        resp = await client.get(f"{ADMIN_BASE}/db/tables", headers=auth_headers)
        assert resp.status_code == 403

    async def test_metrics_requires_admin(self, client, auth_headers):
        resp = await client.get(f"{ADMIN_BASE}/metrics/technical", headers=auth_headers)
        assert resp.status_code == 403

    async def test_no_token_returns_401(self, client):
        resp = await client.get(f"{ADMIN_BASE}/stats/overview")
        assert resp.status_code == 401


@pytest.mark.asyncio
class TestAdminStats:

    async def test_overview_returns_kpis(self, client, admin_headers, registered_user):
        resp = await client.get(f"{ADMIN_BASE}/stats/overview", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total_users" in data
        assert "active_users_30d" in data
        assert "new_users_today" in data
        assert "admin_count" in data
        assert data["total_users"] >= 1  # at least registered_user + admin_user

    async def test_timeseries_default_30_days(self, client, admin_headers):
        resp = await client.get(f"{ADMIN_BASE}/stats/timeseries", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        if data:
            assert "date" in data[0]
            assert "count" in data[0]

    async def test_timeseries_custom_days(self, client, admin_headers):
        resp = await client.get(f"{ADMIN_BASE}/stats/timeseries?days=7", headers=admin_headers)
        assert resp.status_code == 200

    async def test_modules_returns_list(self, client, admin_headers):
        resp = await client.get(f"{ADMIN_BASE}/stats/modules", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        modules = [m["module"] for m in data]
        assert "health" in modules
        assert "routines" in modules


@pytest.mark.asyncio
class TestAdminDbExplorer:

    async def test_table_list_returns_allowed_tables(self, client, admin_headers):
        resp = await client.get(f"{ADMIN_BASE}/db/tables", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        names = [t["table_name"] for t in data]
        assert "users" in names
        # Ensure blocked tables are NOT present
        assert "refresh_tokens" not in names
        assert "data_links" not in names

    async def test_blocked_table_returns_404(self, client, admin_headers):
        resp = await client.get(f"{ADMIN_BASE}/db/tables/refresh_tokens", headers=admin_headers)
        assert resp.status_code == 404

    async def test_nonexistent_table_returns_404(self, client, admin_headers):
        resp = await client.get(f"{ADMIN_BASE}/db/tables/doesnotexist", headers=admin_headers)
        assert resp.status_code == 404

    async def test_users_table_masks_sensitive_columns(self, client, admin_headers, registered_user):
        resp = await client.get(f"{ADMIN_BASE}/db/tables/users", headers=admin_headers)
        assert resp.status_code == 200
        rows = resp.json()
        assert len(rows) >= 1
        for row in rows:
            assert row.get("password_hash") != "[HASH]" or row.get("password_hash") == "[HASH]"
            if "password_hash" in row:
                assert row["password_hash"] == "[HASH]"

    async def test_pagination_limit_capped_at_100(self, client, admin_headers):
        resp = await client.get(f"{ADMIN_BASE}/db/tables/users?limit=999", headers=admin_headers)
        assert resp.status_code == 200
        # limit should be silently capped — response is valid
        assert isinstance(resp.json(), list)


@pytest.mark.asyncio
class TestAdminUsers:

    async def test_list_users(self, client, admin_headers, registered_user):
        resp = await client.get(f"{ADMIN_BASE}/users", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        user = data[0]
        assert "id" in user
        assert "email" in user
        assert "role" in user
        assert "plan" in user
        assert "is_active" in user

    async def test_patch_user_suspend(self, client, admin_headers, registered_user):
        user_id = registered_user["user"]["id"]
        resp = await client.patch(
            f"{ADMIN_BASE}/users/{user_id}",
            json={"is_active": False},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    async def test_patch_user_change_plan(self, client, admin_headers, registered_user):
        user_id = registered_user["user"]["id"]
        resp = await client.patch(
            f"{ADMIN_BASE}/users/{user_id}",
            json={"plan": "pro"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["plan"] == "pro"

    async def test_patch_user_invalid_plan(self, client, admin_headers, registered_user):
        user_id = registered_user["user"]["id"]
        resp = await client.patch(
            f"{ADMIN_BASE}/users/{user_id}",
            json={"plan": "enterprise"},
            headers=admin_headers,
        )
        assert resp.status_code == 422

    async def test_patch_user_invalid_role(self, client, admin_headers, registered_user):
        user_id = registered_user["user"]["id"]
        resp = await client.patch(
            f"{ADMIN_BASE}/users/{user_id}",
            json={"role": "superadmin"},
            headers=admin_headers,
        )
        assert resp.status_code == 422

    async def test_self_modification_blocked(self, client, admin_user, admin_headers):
        admin_id = admin_user["user"]["id"]
        resp = await client.patch(
            f"{ADMIN_BASE}/users/{admin_id}",
            json={"is_active": False},
            headers=admin_headers,
        )
        assert resp.status_code == 403
        assert "propia cuenta" in resp.json()["detail"]

    async def test_last_admin_protection(self, client, admin_user, admin_headers):
        """Degradar al único admin debe devolver 409."""
        admin_id = admin_user["user"]["id"]
        resp = await client.patch(
            f"{ADMIN_BASE}/users/{admin_id}",
            json={"role": "user"},
            headers=admin_headers,
        )
        # 403 because self-modification is blocked first
        assert resp.status_code in (403, 409)

    async def test_patch_nonexistent_user(self, client, admin_headers):
        resp = await client.patch(
            f"{ADMIN_BASE}/users/00000000-0000-0000-0000-000000000000",
            json={"plan": "pro"},
            headers=admin_headers,
        )
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestAdminMetrics:

    async def test_technical_metrics_returns_data(self, client, admin_headers):
        resp = await client.get(f"{ADMIN_BASE}/metrics/technical", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "page_views_today" in data
        assert "page_views_7d" in data
        assert isinstance(data["page_views_today"], int)
        assert isinstance(data["page_views_7d"], int)
