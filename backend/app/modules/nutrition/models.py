"""
app/modules/Nutrition/models.py
================================
Modelos SQLAlchemy del módulo de nutrición.

Tablas:
- supplements   : Catálogo de suplementos deportivos con dosis, timing y afiliados.
- ingredients   : Catálogo de ingredientes con macros por 100 g (≥ 30 registros via seed).
- user_recipes  : Recetas personalizadas creadas por el usuario.

Nota sobre PKs:
    Supplement e Ingredient usan Integer autoincremental porque son tablas de
    referencia/catálogo, no datos personales sensibles.
    UserRecipe también usa Integer PK; el campo user_local_id (UUID string generado
    en el cliente y guardado en localStorage) permite recuperar las recetas sin
    autenticación obligatoria.
"""

from __future__ import annotations

import uuid

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import Base, TimestampMixin

# ── Supplement ────────────────────────────────────────────────────────────────

class Supplement(TimestampMixin, Base):
    """
    Tabla `supplements` — Catálogo de suplementos deportivos (schema: public).

    Cada fila describe un suplemento con su dosis óptima, momento de toma,
    nivel de evidencia científica y un placeholder para el enlace de afiliado.
    Los placeholders (ej. '{{AFFILIATE_WHEY}}') se sustituyen en el frontend
    mediante frontend/js/config.js para separar datos de URLs comerciales.
    """

    __tablename__ = "supplements"
    __table_args__ = {
        "schema": "public",
        "comment": (
            "Catálogo de suplementos deportivos. "
            "affiliate_link_placeholder se resuelve en frontend/js/config.js."
        ),
    }

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    name: Mapped[str] = mapped_column(
        String(100), nullable=False,
        comment="Nombre del suplemento (ej: 'Proteína Whey')",
    )
    dose: Mapped[str] = mapped_column(
        String(50), nullable=False,
        comment="Dosis recomendada (ej: '20-40 g')",
    )
    timing: Mapped[str] = mapped_column(
        String(100), nullable=False,
        comment="Momento óptimo de toma (ej: 'Post-entreno', 'Cualquier hora')",
    )
    level: Mapped[str] = mapped_column(
        String(20), nullable=False,
        default="essential", server_default="essential",
        comment="'essential' | 'optional'",
    )
    description: Mapped[str] = mapped_column(
        Text, nullable=False,
        comment="Descripción con evidencia científica.",
    )
    affiliate_link_placeholder: Mapped[str | None] = mapped_column(
        String(100), nullable=True,
        comment="Placeholder sustituido en config.js (ej: '{{AFFILIATE_WHEY}}')",
    )
    icon_emoji: Mapped[str | None] = mapped_column(
        String(10), nullable=True,
        comment="Emoji representativo del suplemento",
    )
    evidence_level: Mapped[str] = mapped_column(
        String(20), nullable=False,
        default="high", server_default="high",
        comment="Nivel de evidencia: 'high' | 'medium' | 'low'",
    )
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False,
        default=0, server_default="0",
        comment="Orden de visualización ascendente.",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False,
        default=True, server_default="true",
        comment="False = ocultar del frontend sin borrar.",
    )

    def __repr__(self) -> str:
        return f"<Supplement id={self.id} name={self.name!r} level={self.level!r}>"


# ── Ingredient ────────────────────────────────────────────────────────────────

class Ingredient(TimestampMixin, Base):
    """
    Tabla `ingredients` — Catálogo de ingredientes con macros por 100 g (schema: public).

    Usado en el creador de recetas personalizadas. Los valores nutricionales
    se expresan siempre por 100 g de producto para facilitar el cálculo proporcional
    en el frontend: macro_total = (ingredient.macro / 100) * grams_used.
    """

    __tablename__ = "ingredients"
    __table_args__ = {
        "schema": "public",
        "comment": "Catálogo de ingredientes con macros por 100 g. Seed: ≥ 30 registros.",
    }

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    name: Mapped[str] = mapped_column(
        String(100), nullable=False,
        comment="Nombre del ingrediente",
    )
    # Clasificación macro-nutricional
    category: Mapped[str] = mapped_column(
        String(30), nullable=False,
        comment=(
            "Categoría macro: 'protein_high' | 'protein_medium' | "
            "'carb_high' | 'carb_medium' | 'fat_high' | 'fat_medium' | 'mixed'"
        ),
    )
    quality: Mapped[str] = mapped_column(
        String(20), nullable=False,
        default="medium", server_default="medium",
        comment="Calidad nutricional general: 'high' | 'medium' | 'low'",
    )
    calorie_density: Mapped[str] = mapped_column(
        String(20), nullable=False,
        default="medium", server_default="medium",
        comment="Densidad calórica: 'low' (<100 kcal/100g) | 'medium' | 'high' (>350 kcal/100g)",
    )
    satiety_index: Mapped[str] = mapped_column(
        String(20), nullable=False,
        default="medium", server_default="medium",
        comment="Índice de saciedad: 'low' | 'medium' | 'high'",
    )
    # Macros por 100 g
    protein: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0, server_default="0.0",
        comment="Proteína (g) por 100 g",
    )
    carbs: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0, server_default="0.0",
        comment="Hidratos de carbono (g) por 100 g",
    )
    fat: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0, server_default="0.0",
        comment="Grasa (g) por 100 g",
    )
    calories: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0, server_default="0.0",
        comment="Energía (kcal) por 100 g",
    )
    inflammation_base: Mapped[str] = mapped_column(
        String(20), nullable=False,
        default="low", server_default="low",
        comment="Índice inflamatorio base: 'low' | 'medium' | 'high'",
    )

    def __repr__(self) -> str:
        return f"<Ingredient id={self.id} name={self.name!r} cat={self.category!r}>"


# ── UserRecipe ────────────────────────────────────────────────────────────────

class UserRecipe(TimestampMixin, Base):
    """
    Tabla `user_recipes` — Recetas personalizadas creadas por usuarios (schema: public).

    Diseño de ingredientes_json:
        Lista de objetos: [{"ingredient_id": 1, "name": "Pechuga de pollo", "grams": 200}, ...]
        Se almacena como JSON para flexibilidad; los totales macro se pre-calculan en el
        servicio para evitar re-calcular en cada consulta.

    Identificación sin autenticación obligatoria:
        user_local_id es un UUID generado en el cliente (localStorage) que permite
        recuperar las recetas del usuario sin que esté registrado. Si el usuario
        se autentica, este campo puede vincularse a su user UUID.
    """

    __tablename__ = "user_recipes"
    __table_args__ = {
        "schema": "public",
        "comment": "Recetas personalizadas. Ingredientes como JSON. Macros pre-calculados.",
    }

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    user_local_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True, index=True,
        comment="UUID localStorage del cliente. Permite recuperar recetas sin auth.",
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("public.users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment=(
            "FK a users.id. Null = receta anónima (localStorage). "
            "Se rellena cuando el usuario reclama sus recetas anónimas tras registrarse. "
            "Permite recuperar recetas aunque se pierda el localStorage."
        ),
    )
    name: Mapped[str] = mapped_column(
        String(200), nullable=False,
        comment="Nombre de la receta",
    )
    category: Mapped[str] = mapped_column(
        String(20), nullable=False,
        default="almuerzo", server_default="almuerzo",
        comment="Categoría: desayuno | almuerzo | cena | snack | pre | post",
    )
    # [{ingredient_id, name, grams}]
    ingredients_json: Mapped[list] = mapped_column(
        JSON, nullable=False, default=list,
        comment="Lista de ingredientes con cantidades. [{id, name, grams}]",
    )
    instructions: Mapped[str | None] = mapped_column(
        Text, nullable=True,
        comment="Instrucciones de preparación (texto libre)",
    )
    rating_stars: Mapped[int] = mapped_column(
        Integer, nullable=False,
        default=5, server_default="5",
        comment="Valoración del usuario 1-5 estrellas",
    )
    # Totales pre-calculados
    total_calories: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0.0")
    total_protein: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0.0")
    total_carbs: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0.0")
    total_fat: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0.0")
    inflammation_score: Mapped[str] = mapped_column(
        String(20), nullable=False,
        default="low", server_default="low",
        comment="Puntuación inflamatoria calculada: 'low' | 'medium' | 'high'",
    )

    def __repr__(self) -> str:
        return f"<UserRecipe id={self.id} name={self.name!r}>"
