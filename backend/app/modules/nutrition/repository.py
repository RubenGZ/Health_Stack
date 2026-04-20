"""
app/modules/Nutrition/repository.py
=====================================
Capa de repositorio para el módulo de nutrición.

Patrón: métodos estáticos, reciben AsyncSession, no hacen commit.
El commit/rollback lo controla get_db() en session.py.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.nutrition.models import Ingredient, Supplement, UserRecipe


# ── Supplement Repository ─────────────────────────────────────────────────────

class SupplementRepository:

    @staticmethod
    async def get_all_active(db: AsyncSession) -> list[Supplement]:
        """Devuelve todos los suplementos activos ordenados por sort_order."""
        result = await db.execute(
            select(Supplement)
            .where(Supplement.is_active.is_(True))
            .order_by(Supplement.sort_order.asc(), Supplement.id.asc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_by_id(db: AsyncSession, supplement_id: int) -> Supplement | None:
        result = await db.execute(
            select(Supplement).where(Supplement.id == supplement_id)
        )
        return result.scalar_one_or_none()


# ── Ingredient Repository ─────────────────────────────────────────────────────

class IngredientRepository:

    @staticmethod
    async def get_all(db: AsyncSession) -> list[Ingredient]:
        """Devuelve todos los ingredientes ordenados por nombre."""
        result = await db.execute(
            select(Ingredient).order_by(Ingredient.name.asc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_by_id(db: AsyncSession, ingredient_id: int) -> Ingredient | None:
        result = await db.execute(
            select(Ingredient).where(Ingredient.id == ingredient_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_ids(db: AsyncSession, ids: list[int]) -> list[Ingredient]:
        """Devuelve ingredientes por lista de IDs (para cálculo de macros)."""
        if not ids:
            return []
        result = await db.execute(
            select(Ingredient).where(Ingredient.id.in_(ids))
        )
        return list(result.scalars().all())


# ── UserRecipe Repository ─────────────────────────────────────────────────────

class UserRecipeRepository:

    @staticmethod
    async def create(db: AsyncSession, recipe: UserRecipe) -> UserRecipe:
        db.add(recipe)
        await db.flush()
        await db.refresh(recipe)
        return recipe

    @staticmethod
    async def get_by_local_id(
        db: AsyncSession,
        user_local_id: str,
    ) -> list[UserRecipe]:
        """Todas las recetas de un cliente identificado por su localStorage UUID."""
        result = await db.execute(
            select(UserRecipe)
            .where(UserRecipe.user_local_id == user_local_id)
            .order_by(UserRecipe.created_at.desc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_by_id(db: AsyncSession, recipe_id: int) -> UserRecipe | None:
        result = await db.execute(
            select(UserRecipe).where(UserRecipe.id == recipe_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def delete(db: AsyncSession, recipe: UserRecipe) -> None:
        await db.delete(recipe)
        await db.flush()
