"""
scripts/seed_nutrition.py
===========================
Script de seed para poblar las tablas supplements e ingredients.

Uso:
    cd backend
    python -m scripts.seed_nutrition

Requiere que las migraciones de Alembic estén aplicadas:
    alembic upgrade head

Datos:
- 6 suplementos (de las capturas FitSciPro + omega-3, vitamina D, zinc, magnesio, beta-alanina)
- 35 ingredientes con macros reales por 100 g
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Añadir raíz del proyecto al path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.modules.Nutrition.models import Ingredient, Supplement

settings = get_settings()
engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ── Suplementos ───────────────────────────────────────────────────────────────

SUPPLEMENTS_SEED = [
    {
        "name": "Proteína Whey",
        "dose": "20-40 g",
        "timing": "Post-entreno",
        "level": "essential",
        "description": (
            "La proteína de suero (whey) tiene el perfil de aminoácidos más completo "
            "y la mayor concentración de leucina (activador principal del mTOR). "
            "Resultados: +25-35% de fuerza y mayor volumen de entrenamiento posible. "
            "Tómala los días que entrenes. Versión vegana: mezcla arroz + guisante."
        ),
        "affiliate_link_placeholder": "{{AFFILIATE_WHEY}}",
        "icon_emoji": "🥛",
        "evidence_level": "high",
        "sort_order": 1,
    },
    {
        "name": "Creatina Monohidrato",
        "dose": "3-5 g",
        "timing": "Cualquier hora (diario)",
        "level": "essential",
        "description": (
            "El suplemento más estudiado y eficaz de la historia del deporte. "
            "Mejora la potencia, la resistencia y la recuperación muscular, "
            "incrementa el rendimiento en ejercicios de alta intensidad. "
            "Resultado: +8-15% de fuerza y mayor volumen de entrenamiento. "
            "Tómala todos los días. No necesitas fase de carga."
        ),
        "affiliate_link_placeholder": "{{AFFILIATE_CREATINE}}",
        "icon_emoji": "⚡",
        "evidence_level": "high",
        "sort_order": 2,
    },
    {
        "name": "Cafeína",
        "dose": "3-6 mg/kg",
        "timing": "30-60 min antes del entreno",
        "level": "essential",
        "description": (
            "El estimulante más estudiado del mundo. Mejora la fuerza, la resistencia "
            "y reduce la percepción del esfuerzo (RPE). Para 70 kg: 200-400 mg. "
            "Evita tolerancia: usa 3-4 días/semana, descansa 2-3 sin cafeína. "
            "No la tomes aislada, combínala con tu suplemento pre-entreno habitual."
        ),
        "affiliate_link_placeholder": "{{AFFILIATE_CAFFEINE}}",
        "icon_emoji": "☕",
        "evidence_level": "high",
        "sort_order": 3,
    },
    {
        "name": "Omega-3 (EPA+DHA)",
        "dose": "2-3 g EPA+DHA",
        "timing": "Con las comidas",
        "level": "optional",
        "description": (
            "Antiinflamatorio potente que mejora la recuperación muscular, "
            "la salud cardiovascular y la función cognitiva. Especialmente relevante "
            "si no consumes pescado azul 3+ veces por semana. "
            "Busca productos con ≥500 mg EPA+DHA por cápsula y certificación IFOS."
        ),
        "affiliate_link_placeholder": "{{AFFILIATE_OMEGA3}}",
        "icon_emoji": "🐟",
        "evidence_level": "high",
        "sort_order": 4,
    },
    {
        "name": "Vitamina D3 + K2",
        "dose": "2000-4000 UI D3",
        "timing": "Con la comida principal",
        "level": "optional",
        "description": (
            "El 80% de la población tiene déficit en invierno. La vitamina D3 "
            "optimiza la producción de testosterona, la función inmune y la densidad ósea. "
            "Tomar con K2 (100-200 mcg MK-7) para una correcta distribución del calcio. "
            "Hazte una analítica para ajustar la dosis si tienes déficit severo."
        ),
        "affiliate_link_placeholder": "{{AFFILIATE_VITAMIND}}",
        "icon_emoji": "☀️",
        "evidence_level": "medium",
        "sort_order": 5,
    },
    {
        "name": "Magnesio Bisglicinato",
        "dose": "300-400 mg",
        "timing": "Antes de dormir",
        "level": "optional",
        "description": (
            "El magnesio participa en más de 300 reacciones enzimáticas. "
            "Su forma bisglicinato tiene la mejor biodisponibilidad y no causa "
            "malestar digestivo. Mejora la calidad del sueño, reduce los calambres "
            "musculares y optimiza la función nerviosa. Esencial en déficit (frecuente "
            "en deportistas que sudan mucho)."
        ),
        "affiliate_link_placeholder": "{{AFFILIATE_MAGNESIUM}}",
        "icon_emoji": "🌙",
        "evidence_level": "medium",
        "sort_order": 6,
    },
    {
        "name": "Beta-Alanina",
        "dose": "3.2-6.4 g",
        "timing": "Pre-entreno",
        "level": "optional",
        "description": (
            "Precursor de la carnosina intramuscular, que actúa como tampón del ácido "
            "láctico durante ejercicios de 1-4 minutos de alta intensidad. "
            "Produce hormigueo (parestesia) inofensivo. Más efectiva en entrenamientos "
            "de resistencia muscular (HIIT, circuitos, crossfit). Menos útil en "
            "fuerza máxima pura."
        ),
        "affiliate_link_placeholder": "{{AFFILIATE_BETAALANINE}}",
        "icon_emoji": "🔥",
        "evidence_level": "medium",
        "sort_order": 7,
    },
    {
        "name": "Zinc",
        "dose": "15-30 mg",
        "timing": "Con la cena (lejos del calcio)",
        "level": "optional",
        "description": (
            "El zinc interviene directamente en la síntesis de testosterona y GH. "
            "Los deportistas de fuerza tienen mayor riesgo de déficit por el sudor. "
            "Tomar lejos de suplementos cálcicos (compiten por absorción). "
            "No superar 40 mg/día de zinc elemental para evitar interferencia con cobre."
        ),
        "affiliate_link_placeholder": "{{AFFILIATE_ZINC}}",
        "icon_emoji": "💊",
        "evidence_level": "medium",
        "sort_order": 8,
    },
]


# ── Ingredientes (35 registros) ────────────────────────────────────────────────

INGREDIENTS_SEED = [
    # ── Proteínas alta calidad ─────────────────────────────────────────────
    {
        "name": "Pechuga de pollo",
        "category": "protein_high", "quality": "high",
        "calorie_density": "low", "satiety_index": "high",
        "protein": 31.0, "carbs": 0.0, "fat": 3.6, "calories": 165,
        "inflammation_base": "low",
    },
    {
        "name": "Pechuga de pavo",
        "category": "protein_high", "quality": "high",
        "calorie_density": "low", "satiety_index": "high",
        "protein": 29.0, "carbs": 0.0, "fat": 2.5, "calories": 135,
        "inflammation_base": "low",
    },
    {
        "name": "Salmón",
        "category": "protein_high", "quality": "high",
        "calorie_density": "medium", "satiety_index": "high",
        "protein": 25.0, "carbs": 0.0, "fat": 13.0, "calories": 208,
        "inflammation_base": "low",
    },
    {
        "name": "Atún en agua",
        "category": "protein_high", "quality": "high",
        "calorie_density": "low", "satiety_index": "high",
        "protein": 26.0, "carbs": 0.0, "fat": 1.0, "calories": 116,
        "inflammation_base": "low",
    },
    {
        "name": "Clara de huevo",
        "category": "protein_high", "quality": "high",
        "calorie_density": "low", "satiety_index": "medium",
        "protein": 11.0, "carbs": 0.7, "fat": 0.2, "calories": 52,
        "inflammation_base": "low",
    },
    {
        "name": "Huevo entero",
        "category": "protein_high", "quality": "high",
        "calorie_density": "medium", "satiety_index": "high",
        "protein": 13.0, "carbs": 1.1, "fat": 11.0, "calories": 155,
        "inflammation_base": "low",
    },
    {
        "name": "Ternera magra",
        "category": "protein_high", "quality": "high",
        "calorie_density": "medium", "satiety_index": "high",
        "protein": 26.0, "carbs": 0.0, "fat": 9.0, "calories": 189,
        "inflammation_base": "medium",
    },
    {
        "name": "Merluza",
        "category": "protein_high", "quality": "high",
        "calorie_density": "low", "satiety_index": "high",
        "protein": 17.0, "carbs": 0.0, "fat": 1.3, "calories": 82,
        "inflammation_base": "low",
    },
    {
        "name": "Proteína Whey en polvo",
        "category": "protein_high", "quality": "high",
        "calorie_density": "medium", "satiety_index": "medium",
        "protein": 75.0, "carbs": 8.0, "fat": 4.0, "calories": 370,
        "inflammation_base": "low",
    },
    {
        "name": "Requesón",
        "category": "protein_medium", "quality": "high",
        "calorie_density": "low", "satiety_index": "high",
        "protein": 14.0, "carbs": 3.3, "fat": 4.0, "calories": 105,
        "inflammation_base": "low",
    },
    {
        "name": "Yogur griego 0%",
        "category": "protein_medium", "quality": "high",
        "calorie_density": "low", "satiety_index": "high",
        "protein": 10.0, "carbs": 4.0, "fat": 0.4, "calories": 59,
        "inflammation_base": "low",
    },
    {
        "name": "Tofu firme",
        "category": "protein_medium", "quality": "high",
        "calorie_density": "low", "satiety_index": "medium",
        "protein": 8.0, "carbs": 1.9, "fat": 4.8, "calories": 76,
        "inflammation_base": "low",
    },
    {
        "name": "Tempeh",
        "category": "protein_medium", "quality": "high",
        "calorie_density": "medium", "satiety_index": "high",
        "protein": 19.0, "carbs": 9.0, "fat": 11.0, "calories": 193,
        "inflammation_base": "low",
    },
    # ── Carbohidratos de alta calidad ──────────────────────────────────────
    {
        "name": "Avena",
        "category": "carb_high", "quality": "high",
        "calorie_density": "medium", "satiety_index": "high",
        "protein": 13.0, "carbs": 67.0, "fat": 7.0, "calories": 379,
        "inflammation_base": "low",
    },
    {
        "name": "Arroz integral",
        "category": "carb_high", "quality": "high",
        "calorie_density": "medium", "satiety_index": "high",
        "protein": 2.7, "carbs": 23.0, "fat": 0.9, "calories": 111,
        "inflammation_base": "low",
    },
    {
        "name": "Arroz blanco (cocido)",
        "category": "carb_high", "quality": "medium",
        "calorie_density": "low", "satiety_index": "medium",
        "protein": 2.7, "carbs": 28.0, "fat": 0.3, "calories": 130,
        "inflammation_base": "low",
    },
    {
        "name": "Quinoa (cocida)",
        "category": "carb_high", "quality": "high",
        "calorie_density": "low", "satiety_index": "high",
        "protein": 4.4, "carbs": 21.0, "fat": 1.9, "calories": 120,
        "inflammation_base": "low",
    },
    {
        "name": "Patata (cocida)",
        "category": "carb_medium", "quality": "high",
        "calorie_density": "low", "satiety_index": "high",
        "protein": 2.0, "carbs": 17.0, "fat": 0.1, "calories": 77,
        "inflammation_base": "low",
    },
    {
        "name": "Boniato",
        "category": "carb_medium", "quality": "high",
        "calorie_density": "low", "satiety_index": "high",
        "protein": 1.6, "carbs": 20.0, "fat": 0.1, "calories": 86,
        "inflammation_base": "low",
    },
    {
        "name": "Plátano",
        "category": "carb_high", "quality": "high",
        "calorie_density": "low", "satiety_index": "medium",
        "protein": 1.1, "carbs": 23.0, "fat": 0.3, "calories": 89,
        "inflammation_base": "low",
    },
    {
        "name": "Pan integral",
        "category": "carb_medium", "quality": "medium",
        "calorie_density": "medium", "satiety_index": "medium",
        "protein": 9.0, "carbs": 41.0, "fat": 3.0, "calories": 247,
        "inflammation_base": "low",
    },
    {
        "name": "Pasta integral (cocida)",
        "category": "carb_high", "quality": "medium",
        "calorie_density": "low", "satiety_index": "medium",
        "protein": 5.3, "carbs": 25.0, "fat": 0.9, "calories": 124,
        "inflammation_base": "low",
    },
    {
        "name": "Garbanzos (cocidos)",
        "category": "mixed", "quality": "high",
        "calorie_density": "low", "satiety_index": "high",
        "protein": 8.9, "carbs": 27.0, "fat": 2.6, "calories": 164,
        "inflammation_base": "low",
    },
    {
        "name": "Lentejas (cocidas)",
        "category": "mixed", "quality": "high",
        "calorie_density": "low", "satiety_index": "high",
        "protein": 9.0, "carbs": 20.0, "fat": 0.4, "calories": 116,
        "inflammation_base": "low",
    },
    # ── Grasas saludables ──────────────────────────────────────────────────
    {
        "name": "Aguacate",
        "category": "fat_medium", "quality": "high",
        "calorie_density": "medium", "satiety_index": "high",
        "protein": 2.0, "carbs": 9.0, "fat": 15.0, "calories": 160,
        "inflammation_base": "low",
    },
    {
        "name": "Aceite de oliva virgen extra",
        "category": "fat_high", "quality": "high",
        "calorie_density": "high", "satiety_index": "low",
        "protein": 0.0, "carbs": 0.0, "fat": 100.0, "calories": 884,
        "inflammation_base": "low",
    },
    {
        "name": "Nueces",
        "category": "fat_high", "quality": "high",
        "calorie_density": "high", "satiety_index": "high",
        "protein": 15.0, "carbs": 14.0, "fat": 65.0, "calories": 654,
        "inflammation_base": "low",
    },
    {
        "name": "Almendras",
        "category": "fat_high", "quality": "high",
        "calorie_density": "high", "satiety_index": "high",
        "protein": 21.0, "carbs": 22.0, "fat": 50.0, "calories": 579,
        "inflammation_base": "low",
    },
    {
        "name": "Mantequilla de cacahuete natural",
        "category": "fat_high", "quality": "medium",
        "calorie_density": "high", "satiety_index": "high",
        "protein": 25.0, "carbs": 20.0, "fat": 50.0, "calories": 598,
        "inflammation_base": "low",
    },
    # ── Verduras y micronutrientes ─────────────────────────────────────────
    {
        "name": "Espinacas",
        "category": "mixed", "quality": "high",
        "calorie_density": "low", "satiety_index": "medium",
        "protein": 2.9, "carbs": 3.6, "fat": 0.4, "calories": 23,
        "inflammation_base": "low",
    },
    {
        "name": "Brócoli",
        "category": "mixed", "quality": "high",
        "calorie_density": "low", "satiety_index": "medium",
        "protein": 2.8, "carbs": 7.0, "fat": 0.4, "calories": 34,
        "inflammation_base": "low",
    },
    {
        "name": "Zanahoria",
        "category": "carb_medium", "quality": "high",
        "calorie_density": "low", "satiety_index": "medium",
        "protein": 0.9, "carbs": 10.0, "fat": 0.2, "calories": 41,
        "inflammation_base": "low",
    },
    {
        "name": "Frutos rojos (mix)",
        "category": "carb_medium", "quality": "high",
        "calorie_density": "low", "satiety_index": "medium",
        "protein": 0.7, "carbs": 14.0, "fat": 0.3, "calories": 57,
        "inflammation_base": "low",
    },
    {
        "name": "Leche entera",
        "category": "mixed", "quality": "medium",
        "calorie_density": "low", "satiety_index": "medium",
        "protein": 3.2, "carbs": 4.8, "fat": 3.5, "calories": 61,
        "inflammation_base": "low",
    },
    {
        "name": "Leche desnatada",
        "category": "protein_medium", "quality": "medium",
        "calorie_density": "low", "satiety_index": "medium",
        "protein": 3.5, "carbs": 5.0, "fat": 0.1, "calories": 34,
        "inflammation_base": "low",
    },
]


# ── Runner principal ──────────────────────────────────────────────────────────

async def seed() -> None:
    async with AsyncSessionLocal() as db:
        # Verificar si ya hay datos (idempotente)
        from sqlalchemy import select
        existing_sups = (await db.execute(select(Supplement.id).limit(1))).first()
        if existing_sups:
            print("✅ Los suplementos ya tienen seed. Saltando.")
        else:
            supplements = [Supplement(**s) for s in SUPPLEMENTS_SEED]
            db.add_all(supplements)
            print(f"✅ Insertados {len(supplements)} suplementos.")

        existing_ings = (await db.execute(select(Ingredient.id).limit(1))).first()
        if existing_ings:
            print("✅ Los ingredientes ya tienen seed. Saltando.")
        else:
            ingredients = [Ingredient(**i) for i in INGREDIENTS_SEED]
            db.add_all(ingredients)
            print(f"✅ Insertados {len(ingredients)} ingredientes.")

        await db.commit()
        print("🎉 Seed completado con éxito.")


if __name__ == "__main__":
    asyncio.run(seed())
