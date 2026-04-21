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

    async def test_claim_requires_auth(self, client):
        """Sin Bearer token → 401."""
        resp = await client.post(
            "/api/v1/nutrition/recipes/claim",
            json={"user_local_id": str(uuid.uuid4())},
        )
        assert resp.status_code == 401

    async def test_claim_no_anon_recipes_returns_zero(
        self, client, registered_user, auth_headers
    ):
        """Reclamar un local_id sin recetas → claimed=0, no es error."""
        resp = await client.post(
            "/api/v1/nutrition/recipes/claim",
            json={"user_local_id": str(uuid.uuid4())},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["claimed"] == 0

    async def test_claim_links_anon_recipes_to_user(
        self, client, seed_ingredients, registered_user, auth_headers
    ):
        """Recetas anónimas quedan vinculadas al usuario autenticado tras /claim."""
        local_id = str(uuid.uuid4())

        # Obtener ingrediente válido
        ingredients = (await client.get("/api/v1/nutrition/ingredients")).json()
        assert ingredients, "seed_ingredients debe haber insertado datos"
        ing = ingredients[0]

        # Crear 2 recetas anónimas con ese local_id
        for i in range(2):
            await client.post("/api/v1/nutrition/recipes", json={
                "user_local_id": local_id,
                "name": f"Receta anónima {i}",
                "category": "almuerzo",
                "ingredients": [
                    {"ingredient_id": ing["id"], "name": ing["name"], "grams": 100.0}
                ],
            })

        # Reclamar
        resp = await client.post(
            "/api/v1/nutrition/recipes/claim",
            json={"user_local_id": local_id},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["claimed"] == 2

    async def test_claim_idempotent(
        self, client, seed_ingredients, registered_user, auth_headers
    ):
        """Reclamar dos veces el mismo local_id → segunda vez claimed=0 (ya vinculadas)."""
        local_id = str(uuid.uuid4())
        ingredients = (await client.get("/api/v1/nutrition/ingredients")).json()
        ing = ingredients[0]

        await client.post("/api/v1/nutrition/recipes", json={
            "user_local_id": local_id,
            "name": "Receta para reclamar",
            "category": "almuerzo",
            "ingredients": [
                {"ingredient_id": ing["id"], "name": ing["name"], "grams": 150.0}
            ],
        })

        headers = auth_headers
        resp1 = await client.post(
            "/api/v1/nutrition/recipes/claim",
            json={"user_local_id": local_id},
            headers=headers,
        )
        resp2 = await client.post(
            "/api/v1/nutrition/recipes/claim",
            json={"user_local_id": local_id},
            headers=headers,
        )
        assert resp1.json()["claimed"] == 1
        assert resp2.json()["claimed"] == 0  # Ya vinculada, no hay nada que reclamar
