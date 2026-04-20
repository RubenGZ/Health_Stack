"""
tests/integration/test_nutrition.py
======================================
Tests de integración para el módulo de nutrición.
"""

import pytest


@pytest.mark.asyncio
class TestNutrition:

    async def test_list_supplements(self, client):
        resp = await client.get("/api/v1/nutrition/supplements")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_list_ingredients(self, client):
        resp = await client.get("/api/v1/nutrition/ingredients")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_list_recipes_requires_auth(self, client):
        resp = await client.get("/api/v1/nutrition/recipes")
        assert resp.status_code == 401

    async def test_list_recipes_authenticated(self, client, auth_headers):
        resp = await client.get("/api/v1/nutrition/recipes", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_create_recipe(self, client, auth_headers):
        payload = {
            "name": "Bowl proteico",
            "ingredients": [
                {"ingredient_id": None, "name": "Pollo", "quantity_g": 200}
            ],
            "total_kcal": 330,
            "total_protein_g": 62.0,
            "total_carbs_g": 0.0,
            "total_fat_g": 7.0,
        }
        resp = await client.post("/api/v1/nutrition/recipes", json=payload, headers=auth_headers)
        assert resp.status_code in (200, 201)
