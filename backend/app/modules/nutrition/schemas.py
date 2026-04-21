"""
app/modules/Nutrition/schemas.py
==================================
Pydantic v2 schemas para el módulo de nutrición.

Validación de requests y serialización de responses para:
- Supplement (solo lectura desde el cliente, admin-write)
- Ingredient  (solo lectura desde el cliente)
- UserRecipe  (CRUD completo desde el cliente)
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

# ══════════════════════════════════════════════════════════════════════════════
# SUPPLEMENT
# ══════════════════════════════════════════════════════════════════════════════

class SupplementResponse(BaseModel):
    """Schema de respuesta para un suplemento (lectura pública)."""

    id: int
    name: str
    dose: str
    timing: str
    level: str
    description: str
    affiliate_link_placeholder: str | None
    icon_emoji: str | None
    evidence_level: str
    sort_order: int
    is_active: bool

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════════════════
# INGREDIENT
# ══════════════════════════════════════════════════════════════════════════════

class IngredientResponse(BaseModel):
    """Schema de respuesta para un ingrediente (lectura pública)."""

    id: int
    name: str
    category: str
    quality: str
    calorie_density: str
    satiety_index: str
    protein: float
    carbs: float
    fat: float
    calories: float
    inflammation_base: str

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════════════════
# USER RECIPE
# ══════════════════════════════════════════════════════════════════════════════

class RecipeIngredientItem(BaseModel):
    """Un ingrediente dentro de una receta con su cantidad en gramos."""

    ingredient_id: int = Field(..., ge=1)
    name: str = Field(..., min_length=1, max_length=100)
    grams: float = Field(..., gt=0, le=5000, description="Cantidad en gramos (>0, ≤5000)")


class UserRecipeCreate(BaseModel):
    """Request para crear una nueva receta personalizada."""

    user_local_id: str | None = Field(
        None,
        max_length=100,
        description="UUID del cliente (localStorage). Null si usuario no identificado.",
    )
    name: str = Field(..., min_length=1, max_length=200)
    category: str = Field(
        "almuerzo",
        description="desayuno | almuerzo | cena | snack | pre | post",
    )
    ingredients: list[RecipeIngredientItem] = Field(
        ..., min_length=1, max_length=30,
        description="Lista de ingredientes con cantidades",
    )
    instructions: str | None = Field(None, max_length=5000)
    rating_stars: int = Field(5, ge=1, le=5)

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        allowed = {"desayuno", "almuerzo", "cena", "snack", "pre", "post"}
        if v not in allowed:
            raise ValueError(f"category debe ser uno de: {', '.join(sorted(allowed))}")
        return v


class UserRecipeUpdate(BaseModel):
    """Request para actualizar parcialmente una receta."""

    name: str | None = Field(None, min_length=1, max_length=200)
    category: str | None = None
    ingredients: list[RecipeIngredientItem] | None = None
    instructions: str | None = None
    rating_stars: int | None = Field(None, ge=1, le=5)

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str | None) -> str | None:
        if v is None:
            return v
        allowed = {"desayuno", "almuerzo", "cena", "snack", "pre", "post"}
        if v not in allowed:
            raise ValueError(f"category debe ser uno de: {', '.join(sorted(allowed))}")
        return v


class UserRecipeResponse(BaseModel):
    """Schema de respuesta para una receta personalizada."""

    id: int
    user_local_id: str | None
    name: str
    category: str
    ingredients_json: list[Any]
    instructions: str | None
    rating_stars: int
    total_calories: float
    total_protein: float
    total_carbs: float
    total_fat: float
    inflammation_score: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
