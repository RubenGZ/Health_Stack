"""
tests/integration/test_nutrition.py
======================================
Tests de integración para el módulo de nutrición.

NOTA SOBRE DISEÑO:
  Las recetas de usuario NO usan JWT auth — usan un UUID de localStorage
  como identificador de cliente (user_local_id). El backend actúa como
  almacén de recetas indexado por ese UUID anónimo.

  Endpoints públicos:
    GET  /supplements         → sin auth
    GET  /ingredients         → sin auth
    POST /recipes             → sin auth (identidad por user_local_id en body)
    GET  /recipes?local_id=X  → sin auth (filtra por local_id query param)
"""

import pytest
import uuid


TEST_LOCAL_ID = str(uuid.uuid4())

RECIPE_PAYLOAD = {
    "user_local_id": TEST_LOCAL_ID,
    "name": "Bowl proteico",
    "category": "almuerzo",
    "ingredients": [
        {"ingredient_id": 1, "name": "Pollo", "grams": 200.0}
    ],
}


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

    async def test_list_recipes_requires_local_id(self, client):
        """Sin local_id query param → 422 (campo requerido)."""
        resp = await client.get("/api/v1/nutrition/recipes")
        assert resp.status_code == 422

    async def test_list_recipes_with_local_id(self, client):
        """Con local_id → 200 aunque la lista esté vacía."""
        resp = await client.get(f"/api/v1/nutrition/recipes?local_id={TEST_LOCAL_ID}")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_create_recipe(self, client, seed_ingredients):
        """Crear receta con ingredientes del catálogo de test."""
        # Obtener un ingredient_id válido del catálogo sembrado
        ingredients_resp = await client.get("/api/v1/nutrition/ingredients")
        ingredients = ingredients_resp.json()
        assert len(ingredients) > 0, "seed_ingredients debe haber insertado datos"

        ingredient_id = ingredients[0]["id"]
        ingredient_name = ingredients[0]["name"]

        payload = {
            "user_local_id": TEST_LOCAL_ID,
            "name": "Bowl proteico",
            "category": "almuerzo",
            "ingredients": [
                {"ingredient_id": ingredient_id, "name": ingredient_name, "grams": 200.0}
            ],
        }

        resp = await client.post("/api/v1/nutrition/recipes", json=payload)
        assert resp.status_code in (200, 201), resp.text
