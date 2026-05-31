"""
scripts/seed_empty_modules.py
==============================
Seed de datos de prueba para los módulos que aparecen vacíos en DB Health:
  - user_recipes    (Recetas — SIN DATOS)
  - user_chronic_injuries (Lesiones — SIN DATOS)
  - saved_routines  (Rutinas — SIN ACTIVIDAD RECIENTE, fuerza un registro nuevo)

Uso en la Pi:
    docker exec healthstack_backend python -m scripts.seed_empty_modules

Requiere al menos 1 usuario registrado en la BD.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings

# ── Datos de seed ────────────────────────────────────────────────────────────

SAMPLE_RECIPES = [
    {
        "name": "Tortilla proteica de avena",
        "total_kcal": 410,
        "total_protein": 38,
        "total_carbs": 32,
        "total_fat": 12,
        "ingredients_json": json.dumps([
            {"name": "Avena", "grams": 60, "kcal": 230, "protein": 8, "carbs": 40, "fat": 4},
            {"name": "Huevos (3)", "grams": 150, "kcal": 180, "protein": 18, "carbs": 0, "fat": 12},
            {"name": "Clara de huevo (2)", "grams": 60, "kcal": 30, "protein": 6, "carbs": 0, "fat": 0},
        ]),
        "user_local_id": "seed-test-local-001",
    },
    {
        "name": "Bowl de arroz con pollo",
        "total_kcal": 520,
        "total_protein": 45,
        "total_carbs": 60,
        "total_fat": 8,
        "ingredients_json": json.dumps([
            {"name": "Arroz blanco cocido", "grams": 200, "kcal": 260, "protein": 5, "carbs": 57, "fat": 0},
            {"name": "Pechuga de pollo", "grams": 150, "kcal": 165, "protein": 35, "carbs": 0, "fat": 3},
            {"name": "Aceite de oliva", "grams": 10, "kcal": 90, "protein": 0, "carbs": 0, "fat": 10},
        ]),
        "user_local_id": "seed-test-local-001",
    },
    {
        "name": "Batido post-entreno",
        "total_kcal": 340,
        "total_protein": 40,
        "total_carbs": 35,
        "total_fat": 5,
        "ingredients_json": json.dumps([
            {"name": "Proteína whey", "grams": 30, "kcal": 120, "protein": 24, "carbs": 3, "fat": 2},
            {"name": "Plátano", "grams": 120, "kcal": 107, "protein": 1, "carbs": 28, "fat": 0},
            {"name": "Leche desnatada", "grams": 250, "kcal": 88, "protein": 8, "carbs": 12, "fat": 0},
            {"name": "Mantequilla de cacahuete", "grams": 15, "kcal": 88, "protein": 4, "carbs": 3, "fat": 7},
        ]),
        "user_local_id": "seed-test-local-002",
    },
]

SAMPLE_INJURIES = [
    {
        "body_area": "rodilla",
        "injury_label": "Tendinitis rotuliana leve",
        "severity": "leve",
        "notes": "Dolor en la zona anterior de la rodilla después de sesiones largas de sentadilla. Evitar carga excesiva.",
    },
    {
        "body_area": "hombro",
        "injury_label": "Impingement subacromial",
        "severity": "moderado",
        "notes": "Molestia en el hombro derecho con press militar y elevaciones laterales. Sin dolor en reposo.",
    },
]

SAMPLE_ROUTINE = {
    "label": "Fullbody Fuerza · Seed",
    "routine_json": {
        "name": "Fullbody Fuerza · Seed",
        "days": [
            {
                "day": "Lunes",
                "exercises": [
                    {"key": "sentadilla", "name": "Sentadilla", "sets": 4, "reps": "5", "equipment": "barra"},
                    {"key": "press_banca_plano", "name": "Press banca plano", "sets": 4, "reps": "5", "equipment": "barra"},
                    {"key": "peso_muerto_convencional", "name": "Peso muerto convencional", "sets": 3, "reps": "5", "equipment": "barra"},
                ],
            },
            {
                "day": "Miércoles",
                "exercises": [
                    {"key": "press_militar_barra", "name": "Press militar barra", "sets": 4, "reps": "6", "equipment": "barra"},
                    {"key": "dominadas_pronas", "name": "Dominadas prenas", "sets": 4, "reps": "6", "equipment": "peso_corporal"},
                    {"key": "remo_barra", "name": "Remo con barra", "sets": 3, "reps": "8", "equipment": "barra"},
                ],
            },
        ],
        "source": "seed",
        "sfr_level": "moderado",
    },
}


# ── Runner ───────────────────────────────────────────────────────────────────

async def seed(dry_run: bool = False) -> None:
    settings = get_settings()
    engine = create_async_engine(settings.database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # Obtener el primer usuario no-admin
        result = await db.execute(
            text("SELECT id FROM public.users WHERE role != 'admin' ORDER BY created_at LIMIT 1")
        )
        row = result.fetchone()
        if not row:
            result = await db.execute(
                text("SELECT id FROM public.users ORDER BY created_at LIMIT 1")
            )
            row = result.fetchone()
        if not row:
            print("ERROR: No hay usuarios en la BD. Registra al menos uno primero.")
            return

        user_id = str(row[0])
        print(f"Usando usuario: {user_id[:8]}...")

        # ── Recetas ─────────────────────────────────────────────────────────
        print("\n[Recetas]")
        # Verificar si ya hay datos
        r = await db.execute(text("SELECT COUNT(*) FROM public.user_recipes"))
        existing = r.scalar()
        if existing and existing > 0:
            print(f"  Ya existen {existing} recetas — saltando.")
        else:
            for recipe in SAMPLE_RECIPES:
                if not dry_run:
                    await db.execute(
                        text("""
                            INSERT INTO public.user_recipes
                                (name, total_kcal, total_protein, total_carbs, total_fat,
                                 ingredients_json, user_local_id, created_at, updated_at)
                            VALUES
                                (:name, :kcal, :protein, :carbs, :fat,
                                 :ingredients::jsonb, :local_id, NOW(), NOW())
                        """),
                        {
                            "name": recipe["name"],
                            "kcal": recipe["total_kcal"],
                            "protein": recipe["total_protein"],
                            "carbs": recipe["total_carbs"],
                            "fat": recipe["total_fat"],
                            "ingredients": recipe["ingredients_json"],
                            "local_id": recipe["user_local_id"],
                        },
                    )
                print(f"  {'[DRY] ' if dry_run else ''}+ {recipe['name']}")

        # ── Lesiones ────────────────────────────────────────────────────────
        print("\n[Lesiones]")
        r = await db.execute(text("SELECT COUNT(*) FROM public.user_chronic_injuries"))
        existing = r.scalar()
        if existing and existing > 0:
            print(f"  Ya existen {existing} lesiones — saltando.")
        else:
            for injury in SAMPLE_INJURIES:
                if not dry_run:
                    await db.execute(
                        text("""
                            INSERT INTO public.user_chronic_injuries
                                (id, user_id, body_area, injury_label, severity, notes,
                                 is_active, created_at, updated_at)
                            VALUES
                                (:id, :user_id, :area, :label, :severity, :notes,
                                 true, NOW(), NOW())
                        """),
                        {
                            "id": str(uuid.uuid4()),
                            "user_id": user_id,
                            "area": injury["body_area"],
                            "label": injury["injury_label"],
                            "severity": injury["severity"],
                            "notes": injury["notes"],
                        },
                    )
                print(f"  {'[DRY] ' if dry_run else ''}+ {injury['injury_label']} ({injury['body_area']})")

        # ── Rutinas (forzar actividad reciente) ─────────────────────────────
        print("\n[Rutinas guardadas]")
        r = await db.execute(
            text("SELECT COUNT(*) FROM public.saved_routines WHERE user_id = :uid"),
            {"uid": user_id},
        )
        existing = r.scalar()
        print(f"  Rutinas actuales del usuario: {existing}")
        if not dry_run:
            routine_id = str(uuid.uuid4())
            await db.execute(
                text("""
                    INSERT INTO public.saved_routines
                        (id, user_id, label, routine_json, created_at, updated_at)
                    VALUES
                        (:id, :user_id, :label, :routine_json::jsonb, NOW(), NOW())
                    ON CONFLICT DO NOTHING
                """),
                {
                    "id": routine_id,
                    "user_id": user_id,
                    "label": SAMPLE_ROUTINE["label"],
                    "routine_json": json.dumps(SAMPLE_ROUTINE["routine_json"]),
                },
            )
        print(f"  {'[DRY] ' if dry_run else ''}+ {SAMPLE_ROUTINE['label']}")

        if not dry_run:
            await db.commit()
            print("\nSeed completado. Recarga DB Health en el admin panel.")
        else:
            print("\n[DRY RUN] Ningún dato insertado. Elimina --dry-run para ejecutar.")

    await engine.dispose()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Seed módulos vacíos en DB Health")
    parser.add_argument("--dry-run", action="store_true", help="Solo mostrar qué se insertaría")
    args = parser.parse_args()
    asyncio.run(seed(dry_run=args.dry_run))
