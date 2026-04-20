"""
app/modules/Nutrition/service.py
==================================
Lógica de negocio del módulo de nutrición.

Responsabilidades:
- Calcular macros totales de una receta a partir de ingredientes + gramos
- Calcular puntuación inflamatoria compuesta
- Coordinar repositorios para CRUD de recetas de usuario
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.nutrition.models import Ingredient, UserRecipe
from app.modules.nutrition.repository import (
    IngredientRepository,
    SupplementRepository,
    UserRecipeRepository,
)
from app.modules.nutrition.schemas import (
    IngredientResponse,
    RecipeIngredientItem,
    SupplementResponse,
    UserRecipeCreate,
    UserRecipeResponse,
    UserRecipeUpdate,
)
from app.shared.exceptions import ValidationError


# Mapa numérico para calcular el índice inflamatorio ponderado
_INFLAMMATION_SCORE: dict[str, int] = {"low": 1, "medium": 2, "high": 3}
_INFLAMMATION_LABEL: dict[float, str] = {}  # calculado dinámicamente


def _inflammation_label(score: float) -> str:
    if score < 1.5:
        return "low"
    if score < 2.3:
        return "medium"
    return "high"


def _calc_macros_for_recipe(
    ingredient_map: dict[int, Ingredient],
    items: list[RecipeIngredientItem],
) -> dict:
    """
    Calcula totales de macros para una lista de ingredientes con gramos.

    Returns:
        {total_calories, total_protein, total_carbs, total_fat, inflammation_score}
    """
    total_calories = total_protein = total_carbs = total_fat = 0.0
    inflammation_weights: list[float] = []

    for item in items:
        ing = ingredient_map.get(item.ingredient_id)
        if ing is None:
            raise ValidationError(
                f"Ingrediente con id={item.ingredient_id} no encontrado."
            )
        factor = item.grams / 100.0
        total_calories += round(ing.calories * factor, 1)
        total_protein  += round(ing.protein * factor, 1)
        total_carbs    += round(ing.carbs * factor, 1)
        total_fat      += round(ing.fat * factor, 1)
        inflammation_weights.append(_INFLAMMATION_SCORE.get(ing.inflammation_base, 1))

    avg_inflammation = (
        sum(inflammation_weights) / len(inflammation_weights)
        if inflammation_weights else 1.0
    )

    return {
        "total_calories": round(total_calories, 1),
        "total_protein":  round(total_protein, 1),
        "total_carbs":    round(total_carbs, 1),
        "total_fat":      round(total_fat, 1),
        "inflammation_score": _inflammation_label(avg_inflammation),
    }


class NutritionService:

    # ── Supplements ───────────────────────────────────────────────────────────

    @staticmethod
    async def list_supplements(db: AsyncSession) -> list[SupplementResponse]:
        rows = await SupplementRepository.get_all_active(db)
        return [SupplementResponse.model_validate(r) for r in rows]

    # ── Ingredients ───────────────────────────────────────────────────────────

    @staticmethod
    async def list_ingredients(db: AsyncSession) -> list[IngredientResponse]:
        rows = await IngredientRepository.get_all(db)
        return [IngredientResponse.model_validate(r) for r in rows]

    # ── User Recipes ──────────────────────────────────────────────────────────

    @staticmethod
    async def create_recipe(
        db: AsyncSession,
        payload: UserRecipeCreate,
    ) -> UserRecipeResponse:
        # 1. Obtener todos los ingredientes implicados
        ids = [i.ingredient_id for i in payload.ingredients]
        ingredients = await IngredientRepository.get_by_ids(db, ids)
        ingredient_map = {ing.id: ing for ing in ingredients}

        # 2. Calcular macros
        macros = _calc_macros_for_recipe(ingredient_map, payload.ingredients)

        # 3. Construir lista JSON de ingredientes (id + nombre + gramos)
        ingredients_json = [
            {
                "ingredient_id": item.ingredient_id,
                "name": item.name,
                "grams": item.grams,
            }
            for item in payload.ingredients
        ]

        # 4. Crear entidad
        recipe = UserRecipe(
            user_local_id=payload.user_local_id,
            name=payload.name,
            category=payload.category,
            ingredients_json=ingredients_json,
            instructions=payload.instructions,
            rating_stars=payload.rating_stars,
            **macros,
        )

        saved = await UserRecipeRepository.create(db, recipe)
        return UserRecipeResponse.model_validate(saved)

    @staticmethod
    async def list_recipes(
        db: AsyncSession,
        user_local_id: str,
    ) -> list[UserRecipeResponse]:
        rows = await UserRecipeRepository.get_by_local_id(db, user_local_id)
        return [UserRecipeResponse.model_validate(r) for r in rows]

    @staticmethod
    async def update_recipe(
        db: AsyncSession,
        recipe_id: int,
        user_local_id: str,
        payload: UserRecipeUpdate,
    ) -> UserRecipeResponse:
        recipe = await UserRecipeRepository.get_by_id(db, recipe_id)
        if recipe is None or recipe.user_local_id != user_local_id:
            raise ValidationError("Receta no encontrada o no autorizada.")

        if payload.name is not None:
            recipe.name = payload.name
        if payload.category is not None:
            recipe.category = payload.category
        if payload.instructions is not None:
            recipe.instructions = payload.instructions
        if payload.rating_stars is not None:
            recipe.rating_stars = payload.rating_stars

        if payload.ingredients is not None:
            ids = [i.ingredient_id for i in payload.ingredients]
            ingredients = await IngredientRepository.get_by_ids(db, ids)
            ingredient_map = {ing.id: ing for ing in ingredients}
            macros = _calc_macros_for_recipe(ingredient_map, payload.ingredients)
            recipe.ingredients_json = [
                {"ingredient_id": i.ingredient_id, "name": i.name, "grams": i.grams}
                for i in payload.ingredients
            ]
            recipe.total_calories    = macros["total_calories"]
            recipe.total_protein     = macros["total_protein"]
            recipe.total_carbs       = macros["total_carbs"]
            recipe.total_fat         = macros["total_fat"]
            recipe.inflammation_score = macros["inflammation_score"]

        await db.flush()
        await db.refresh(recipe)
        return UserRecipeResponse.model_validate(recipe)

    @staticmethod
    async def delete_recipe(
        db: AsyncSession,
        recipe_id: int,
        user_local_id: str,
    ) -> None:
        recipe = await UserRecipeRepository.get_by_id(db, recipe_id)
        if recipe is None or recipe.user_local_id != user_local_id:
            raise ValidationError("Receta no encontrada o no autorizada.")
        await UserRecipeRepository.delete(db, recipe)
