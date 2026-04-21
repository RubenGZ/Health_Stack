"""
app/modules/Nutrition/router.py
=================================
Endpoints REST del módulo de nutrición.

Prefijo montado en main.py: /api/v1/nutrition

Endpoints:
  GET  /supplements              → lista de suplementos activos
  GET  /ingredients              → catálogo completo de ingredientes
  POST /recipes                  → crear receta personalizada
  GET  /recipes/{local_id}       → recetas de un usuario (por localStorage UUID)
  PUT  /recipes/{id}             → actualizar receta
  DELETE /recipes/{id}           → eliminar receta
"""


from fastapi import APIRouter, Body, Query, status

from app.core.security.dependencies import CurrentUser
from app.modules.nutrition.schemas import (
    IngredientResponse,
    SupplementResponse,
    UserRecipeCreate,
    UserRecipeResponse,
    UserRecipeUpdate,
)
from app.modules.nutrition.service import NutritionService
from app.session import DBSession

router = APIRouter()


# ── Suplementos ───────────────────────────────────────────────────────────────

@router.get(
    "/supplements",
    response_model=list[SupplementResponse],
    status_code=status.HTTP_200_OK,
    summary="Lista de suplementos activos",
    description=(
        "Devuelve todos los suplementos deportivos activos ordenados por relevancia. "
        "Incluye placeholder del enlace de afiliado (se resuelve en frontend/js/config.js)."
    ),
)
async def list_supplements(db: DBSession):
    return await NutritionService.list_supplements(db)


# ── Ingredientes ──────────────────────────────────────────────────────────────

@router.get(
    "/ingredients",
    response_model=list[IngredientResponse],
    status_code=status.HTTP_200_OK,
    summary="Catálogo de ingredientes",
    description="Devuelve todos los ingredientes con sus macros por 100 g.",
)
async def list_ingredients(db: DBSession):
    return await NutritionService.list_ingredients(db)


# ── Recetas de usuario ────────────────────────────────────────────────────────

@router.post(
    "/recipes",
    response_model=UserRecipeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear receta personalizada",
)
async def create_recipe(
    payload: UserRecipeCreate,
    db: DBSession,
):
    return await NutritionService.create_recipe(db, payload)


@router.get(
    "/recipes",
    response_model=list[UserRecipeResponse],
    status_code=status.HTTP_200_OK,
    summary="Obtener recetas del usuario",
)
async def list_user_recipes(
    local_id: str = Query(..., description="UUID localStorage del cliente"),
    db: DBSession = ...,
):
    return await NutritionService.list_recipes(db, local_id)


@router.put(
    "/recipes/{recipe_id}",
    response_model=UserRecipeResponse,
    status_code=status.HTTP_200_OK,
    summary="Actualizar receta personalizada",
)
async def update_recipe(
    recipe_id: int,
    payload: UserRecipeUpdate,
    local_id: str = Query(..., description="UUID localStorage — autorización"),
    db: DBSession = ...,
):
    return await NutritionService.update_recipe(db, recipe_id, local_id, payload)


@router.delete(
    "/recipes/{recipe_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar receta personalizada",
)
async def delete_recipe(
    recipe_id: int,
    local_id: str = Query(..., description="UUID localStorage — autorización"),
    db: DBSession = ...,
):
    await NutritionService.delete_recipe(db, recipe_id, local_id)


@router.post(
    "/recipes/claim",
    status_code=status.HTTP_200_OK,
    summary="Reclamar recetas anónimas",
    description=(
        "Vincula todas las recetas anónimas (identificadas por localStorage UUID) "
        "al usuario autenticado. Úsalo justo después del registro para que el usuario "
        "no pierda las recetas que creó antes de tener cuenta. Idempotente."
    ),
)
async def claim_recipes(
    current_user: CurrentUser,
    db: DBSession,
    user_local_id: str = Body(..., embed=True, description="UUID localStorage del cliente"),
) -> dict:
    """
    Flujo (ADR-001-A):
    1. Autenticar usuario vía Bearer token
    2. Buscar recetas con user_local_id dado y user_id = NULL
    3. Asignar user_id del token autenticado a esas recetas
    4. Devolver el número de recetas reclamadas

    Si no hay recetas anónimas con ese local_id → devuelve {"claimed": 0}
    (no es un error — puede que ya se hayan reclamado previamente).
    """
    count = await NutritionService.claim_recipes(
        db=db,
        user_local_id=user_local_id,
        user_id=current_user["user_id"],
    )
    return {"claimed": count}
