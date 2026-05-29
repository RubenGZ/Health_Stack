"""
tests/integration/test_telemetry.py
=====================================
Tests de integración para el módulo de telemetría (page views).
"""

import pytest

TELEMETRY_URL = "/api/v1/telemetry/page-view"


@pytest.mark.asyncio
class TestPageView:

    async def test_record_anonymous_page_view(self, client):
        resp = await client.post(TELEMETRY_URL, json={"page": "/dashboard"})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    async def test_record_page_view_with_country(self, client):
        resp = await client.post(TELEMETRY_URL, json={"page": "/landing", "country": "ES"})
        assert resp.status_code == 200

    async def test_record_page_view_authenticated_user(self, client, auth_headers):
        resp = await client.post(
            TELEMETRY_URL,
            json={"page": "/dashboard"},
            headers=auth_headers,
        )
        assert resp.status_code == 200

    async def test_page_too_long_rejected(self, client):
        resp = await client.post(TELEMETRY_URL, json={"page": "x" * 200})
        assert resp.status_code == 422

    async def test_admin_page_view_marked_is_admin(self, client, admin_headers):
        resp = await client.post(
            TELEMETRY_URL,
            json={"page": "/admin"},
            headers=admin_headers,
        )
        assert resp.status_code == 200

    async def test_page_view_appears_in_admin_metrics(self, client, admin_headers):
        # Record a page view
        await client.post(TELEMETRY_URL, json={"page": "/dashboard"})
        # Check it shows in admin metrics
        metrics_resp = await client.get(
            "/api/v1/admin/metrics/technical",
            headers=admin_headers,
        )
        assert metrics_resp.status_code == 200
        data = metrics_resp.json()
        assert data["page_views_today"] >= 1


EVENT_URL = "/api/v1/telemetry/event"


@pytest.mark.asyncio
class TestProductEvent:

    async def test_event_anonymous(self, client):
        resp = await client.post(
            EVENT_URL,
            json={"event": "primera_sesion_guardada", "data": {"ttfv_secs": 120}},
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    async def test_event_authenticated(self, client, auth_headers):
        resp = await client.post(
            EVENT_URL,
            json={"event": "pr_detectado", "data": {"count": 2}},
            headers=auth_headers,
        )
        assert resp.status_code == 200

    async def test_event_name_too_long(self, client):
        resp = await client.post(
            EVENT_URL,
            json={"event": "x" * 81, "data": {}},
        )
        assert resp.status_code == 422

    async def test_event_empty_data(self, client):
        resp = await client.post(
            EVENT_URL,
            json={"event": "test_event", "data": {}},
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    async def test_event_admin_user(self, client, admin_headers):
        resp = await client.post(
            EVENT_URL,
            json={"event": "habito_formado", "data": {}},
            headers=admin_headers,
        )
        assert resp.status_code == 200
