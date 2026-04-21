"""
tests/integration/test_community.py
=====================================
Tests de integración para el módulo de comunidad.

PostCreate schema real: solo campo "content"
PostResponse schema real:
  - id, display_name, content, likes_count, created_at
  - liked_by_me: bool  (NO "liked")
"""
import pytest


POST_PAYLOAD = {
    "content": "Hoy entrené pierna por primera vez en meses.",
}


@pytest.mark.asyncio
class TestCommunity:

    async def test_list_posts_public(self, client):
        resp = await client.get("/api/v1/community/posts")
        assert resp.status_code == 200
        data = resp.json()
        assert "posts" in data
        assert "total" in data

    async def test_create_post_requires_auth(self, client):
        resp = await client.post("/api/v1/community/posts", json=POST_PAYLOAD)
        assert resp.status_code == 401

    async def test_create_post_authenticated(self, client, auth_headers):
        resp = await client.post("/api/v1/community/posts", json=POST_PAYLOAD, headers=auth_headers)
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["content"] == POST_PAYLOAD["content"]
        assert data["likes_count"] == 0
        assert "id" in data

    async def test_post_appears_in_list(self, client, auth_headers):
        await client.post("/api/v1/community/posts", json=POST_PAYLOAD, headers=auth_headers)
        resp = await client.get("/api/v1/community/posts")
        assert resp.json()["total"] >= 1

    async def test_toggle_like(self, client, auth_headers):
        create = await client.post("/api/v1/community/posts", json=POST_PAYLOAD, headers=auth_headers)
        assert create.status_code == 201, create.text
        post_id = create.json()["id"]

        # Like
        resp = await client.post(f"/api/v1/community/posts/{post_id}/like", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["liked_by_me"] is True

        # Unlike (idempotente)
        resp = await client.post(f"/api/v1/community/posts/{post_id}/like", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["liked_by_me"] is False

    async def test_like_requires_auth(self, client, auth_headers):
        create = await client.post("/api/v1/community/posts", json=POST_PAYLOAD, headers=auth_headers)
        post_id = create.json()["id"]
        resp = await client.post(f"/api/v1/community/posts/{post_id}/like")
        assert resp.status_code == 401
