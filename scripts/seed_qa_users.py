"""
scripts/seed_qa_users.py
========================
QA user simulation — crea múltiples usuarios estándar y genera datos realistas:
  - Registro de usuario
  - Login y obtención de JWT
  - Historial de peso (7 registros por usuario, últimos 7 días)
  - Rutina de entrenamiento guardada
  - Sesión de entrenamiento completada
  - Receta de nutrición (anónima vía user_local_id)

Uso:
    python scripts/seed_qa_users.py [BASE_URL]
    python scripts/seed_qa_users.py http://localhost  # default

Requiere solo stdlib. Sin dependencias externas.
"""

from __future__ import annotations

import json
import sys
import urllib.request
import urllib.error
import uuid
from datetime import date, datetime, timedelta, timezone

# ── Configuración ─────────────────────────────────────────────────────────────

BASE_URL = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost").rstrip("/")

USERS = [
    {
        "display_name": "QA_Carlos_Mendez",
        "email": "qa_carlos@healthstack.test",
        "password": "QATest1234!",
        "weight_kg": 84.0,
        "height_cm": 178.0,
        "goal": "perder grasa y ganar músculo",
    },
    {
        "display_name": "QA_Maria_Lopez",
        "email": "qa_maria@healthstack.test",
        "password": "QATest1234!",
        "weight_kg": 62.0,
        "height_cm": 165.0,
        "goal": "mejorar resistencia",
    },
    {
        "display_name": "QA_Andres_Torres",
        "email": "qa_andres@healthstack.test",
        "password": "QATest1234!",
        "weight_kg": 95.0,
        "height_cm": 182.0,
        "goal": "ganar fuerza",
    },
    {
        "display_name": "QA_Sofia_Ruiz",
        "email": "qa_sofia@healthstack.test",
        "password": "QATest1234!",
        "weight_kg": 57.0,
        "height_cm": 160.0,
        "goal": "fitness general",
    },
]

# IDs de ingredientes reales (sembrados por seed_nutrition.py)
# Chicken breast (id aprox), rice, eggs, etc.
# Usamos los que conocemos desde la API
RECIPE_INGREDIENT_SETS = [
    # Receta proteica básica
    [
        {"ingredient_id": 1, "name": "Pollo a la plancha", "grams": 150.0},
        {"ingredient_id": 16, "name": "Arroz blanco (cocido)", "grams": 100.0},
    ],
    # Ensalada mediterránea
    [
        {"ingredient_id": 25, "name": "Aguacate", "grams": 80.0},
        {"ingredient_id": 26, "name": "Aceite de oliva virgen extra", "grams": 15.0},
    ],
    # Batido proteico
    [
        {"ingredient_id": 28, "name": "Almendras", "grams": 30.0},
        {"ingredient_id": 4, "name": "Atún en agua", "grams": 120.0},
    ],
    # Post-workout
    [
        {"ingredient_id": 15, "name": "Arroz integral", "grams": 120.0},
        {"ingredient_id": 28, "name": "Almendras", "grams": 25.0},
    ],
]

WORKOUT_ROUTINES = [
    {
        "label": "QA Rutina Fuerza — Push/Pull/Legs",
        "routine_json": json.dumps({
            "type": "PPL",
            "days": [
                {
                    "day": "Push",
                    "exercises": [
                        {"name": "Press de banca", "sets": 4, "reps": "6-8", "rest": "2-3 min"},
                        {"name": "Press militar", "sets": 3, "reps": "8-10", "rest": "90s"},
                        {"name": "Fondos en paralelas", "sets": 3, "reps": "10-12", "rest": "60s"},
                    ]
                },
                {
                    "day": "Pull",
                    "exercises": [
                        {"name": "Dominadas", "sets": 4, "reps": "6-8", "rest": "2 min"},
                        {"name": "Remo con barra", "sets": 3, "reps": "8-10", "rest": "90s"},
                        {"name": "Curl de bíceps", "sets": 3, "reps": "10-12", "rest": "60s"},
                    ]
                },
            ]
        })
    },
    {
        "label": "QA Rutina Cardio — HIIT + Resistencia",
        "routine_json": json.dumps({
            "type": "cardio",
            "sessions": [
                {"type": "HIIT", "duration_min": 20, "intervals": "30s ON / 30s OFF"},
                {"type": "steady_state", "duration_min": 40, "intensity": "65% FC max"},
            ]
        })
    },
    {
        "label": "QA Rutina Femenina — Full Body",
        "routine_json": json.dumps({
            "type": "full_body",
            "frequency": "3x/semana",
            "exercises": [
                {"name": "Sentadilla goblet", "sets": 3, "reps": "12-15"},
                {"name": "Hip thrust", "sets": 4, "reps": "10-12"},
                {"name": "Zancadas", "sets": 3, "reps": "12 por pierna"},
                {"name": "Press mancuernas", "sets": 3, "reps": "12-15"},
            ]
        })
    },
    {
        "label": "QA Rutina Powerlifting — SBD",
        "routine_json": json.dumps({
            "type": "powerlifting",
            "lifts": ["sentadilla", "banca", "peso_muerto"],
            "week_1": [
                {"lift": "sentadilla", "sets": 5, "reps": 5, "intensity": "75%"},
                {"lift": "banca", "sets": 5, "reps": 5, "intensity": "75%"},
                {"lift": "peso_muerto", "sets": 3, "reps": 3, "intensity": "80%"},
            ]
        })
    },
]

WORKOUT_SESSIONS = [
    {
        "notes": "QA Entreno push — banca + hombro",
        "exercises": [
            {
                "exercise_key": "bench_press",
                "exercise_name": "Press de banca",
                "order_index": 0,
                "sets": [
                    {"set_number": 1, "weight_kg": 80.0, "reps": 8, "rpe": 7.0, "is_warmup": False},
                    {"set_number": 2, "weight_kg": 85.0, "reps": 6, "rpe": 8.0, "is_warmup": False},
                    {"set_number": 3, "weight_kg": 85.0, "reps": 6, "rpe": 8.5, "is_warmup": False},
                ]
            },
            {
                "exercise_key": "overhead_press",
                "exercise_name": "Press militar",
                "order_index": 1,
                "sets": [
                    {"set_number": 1, "weight_kg": 50.0, "reps": 10, "rpe": 7.0, "is_warmup": False},
                    {"set_number": 2, "weight_kg": 55.0, "reps": 8, "rpe": 8.0, "is_warmup": False},
                ]
            },
        ]
    },
    {
        "notes": "QA Entreno pull — dominadas + remo",
        "exercises": [
            {
                "exercise_key": "pull_up",
                "exercise_name": "Dominadas",
                "order_index": 0,
                "sets": [
                    {"set_number": 1, "weight_kg": 0.0, "reps": 8, "rpe": 7.0, "is_warmup": False},
                    {"set_number": 2, "weight_kg": 0.0, "reps": 7, "rpe": 8.0, "is_warmup": False},
                    {"set_number": 3, "weight_kg": 0.0, "reps": 6, "rpe": 8.5, "is_warmup": False},
                ]
            },
            {
                "exercise_key": "barbell_row",
                "exercise_name": "Remo con barra",
                "order_index": 1,
                "sets": [
                    {"set_number": 1, "weight_kg": 70.0, "reps": 8, "rpe": 7.0, "is_warmup": False},
                    {"set_number": 2, "weight_kg": 75.0, "reps": 8, "rpe": 7.5, "is_warmup": False},
                ]
            },
        ]
    },
    {
        "notes": "QA Entreno legs — sentadilla + peso muerto",
        "exercises": [
            {
                "exercise_key": "squat",
                "exercise_name": "Sentadilla",
                "order_index": 0,
                "sets": [
                    {"set_number": 1, "weight_kg": 60.0, "reps": 5, "is_warmup": True},
                    {"set_number": 2, "weight_kg": 100.0, "reps": 5, "rpe": 7.0, "is_warmup": False},
                    {"set_number": 3, "weight_kg": 100.0, "reps": 5, "rpe": 7.5, "is_warmup": False},
                    {"set_number": 4, "weight_kg": 105.0, "reps": 4, "rpe": 8.5, "is_warmup": False},
                ]
            },
            {
                "exercise_key": "deadlift",
                "exercise_name": "Peso muerto",
                "order_index": 1,
                "sets": [
                    {"set_number": 1, "weight_kg": 120.0, "reps": 3, "rpe": 8.0, "is_warmup": False},
                    {"set_number": 2, "weight_kg": 130.0, "reps": 2, "rpe": 9.0, "is_warmup": False},
                ]
            },
        ]
    },
    {
        "notes": "QA Entreno full body — circuito femenino",
        "exercises": [
            {
                "exercise_key": "goblet_squat",
                "exercise_name": "Sentadilla goblet",
                "order_index": 0,
                "sets": [
                    {"set_number": 1, "weight_kg": 20.0, "reps": 15, "rpe": 6.0, "is_warmup": False},
                    {"set_number": 2, "weight_kg": 24.0, "reps": 12, "rpe": 7.0, "is_warmup": False},
                    {"set_number": 3, "weight_kg": 24.0, "reps": 12, "rpe": 7.5, "is_warmup": False},
                ]
            },
            {
                "exercise_key": "hip_thrust",
                "exercise_name": "Hip thrust",
                "order_index": 1,
                "sets": [
                    {"set_number": 1, "weight_kg": 40.0, "reps": 12, "rpe": 7.0, "is_warmup": False},
                    {"set_number": 2, "weight_kg": 50.0, "reps": 10, "rpe": 8.0, "is_warmup": False},
                    {"set_number": 3, "weight_kg": 55.0, "reps": 8, "rpe": 8.5, "is_warmup": False},
                ]
            },
        ]
    },
]


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def http(method: str, path: str, body: dict | None = None, token: str | None = None) -> tuple[int, dict]:
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {"error": str(e)}
    except Exception as e:
        return 0, {"error": str(e)}


def ok(label: str, status: int, body: dict, *, acceptable: list[int] | None = None) -> bool:
    expected = acceptable or [200, 201]
    if status in expected:
        print(f"  ✅ {label} → {status}")
        return True
    else:
        print(f"  ❌ {label} → {status}: {json.dumps(body)[:200]}")
        return False


# ── Verificar ingredientes disponibles ───────────────────────────────────────

def verify_ingredients() -> list[int]:
    """Devuelve lista de IDs de ingredientes disponibles."""
    st, body = http("GET", "/api/v1/nutrition/ingredients")
    if st == 200 and isinstance(body, list) and body:
        ids = [ing["id"] for ing in body]
        print(f"  ℹ️  {len(ids)} ingredientes disponibles (ids: {ids[:5]}...)")
        return ids
    print(f"  ⚠️  Sin ingredientes ({st}). Ejecuta seed_nutrition.py primero.")
    return []


def build_recipe_ingredients(ingredient_ids: list[int], recipe_idx: int) -> list[dict]:
    """Construye ingredientes reales usando IDs disponibles."""
    if not ingredient_ids:
        return []
    # Tomar 2 ingredientes del set disponible, rotando por recipe_idx
    offset = (recipe_idx * 2) % len(ingredient_ids)
    ing1_id = ingredient_ids[offset % len(ingredient_ids)]
    ing2_id = ingredient_ids[(offset + 1) % len(ingredient_ids)]
    return [
        {"ingredient_id": ing1_id, "name": f"Ingrediente QA {ing1_id}", "grams": 150.0},
        {"ingredient_id": ing2_id, "name": f"Ingrediente QA {ing2_id}", "grams": 80.0},
    ]


# ── Main simulation ───────────────────────────────────────────────────────────

def simulate_user(user: dict, idx: int, ingredient_ids: list[int]) -> dict:
    """Simula el ciclo completo de un usuario estándar."""
    print(f"\n{'─'*60}")
    print(f"👤 Usuario {idx+1}: {user['display_name']} ({user['email']})")
    print(f"{'─'*60}")

    results = {
        "user": user["display_name"],
        "register": False,
        "login": False,
        "weight_records": 0,
        "routine_saved": False,
        "workout_session": False,
        "recipe_created": False,
    }

    # 1. REGISTRO
    st, body = http("POST", "/api/v1/auth/register", {
        "display_name": user["display_name"],
        "email": user["email"],
        "password": user["password"],
    })
    if ok("POST /auth/register", st, body, acceptable=[200, 201, 409]):
        results["register"] = True
    else:
        return results

    # 2. LOGIN
    st, body = http("POST", "/api/v1/auth/login", {
        "email": user["email"],
        "password": user["password"],
    })
    if not ok("POST /auth/login", st, body):
        return results
    token = body.get("access_token") or body.get("token")
    if not token:
        print(f"  ❌ No token en respuesta de login: {body}")
        return results
    results["login"] = True

    # 3. HISTORIAL DE PESO — 7 registros (últimos 7 días)
    print("  📊 Creando historial de peso (7 días)...")
    today = date.today()
    base_weight = user["weight_kg"]
    weight_count = 0
    for day_offset in range(6, -1, -1):
        record_date = today - timedelta(days=day_offset)
        # Fluctuación realista de ±0.5 kg
        fluctuation = round((day_offset % 3 - 1) * 0.3, 1)
        weight = round(base_weight + fluctuation, 1)
        st, body = http("POST", "/api/v1/health/records", {
            "recorded_date": record_date.isoformat(),
            "weight_kg": weight,
            "height_cm": user["height_cm"],
            "sleep_hours": 7.0 + (day_offset % 2) * 0.5,
            "notes": f"QA auto-seed día {7 - day_offset}",
        }, token=token)
        if st in (201, 409):  # 409 = ya existe ese día
            weight_count += 1
    print(f"  ✅ Peso → {weight_count}/7 registros creados")
    results["weight_records"] = weight_count

    # 4. GUARDAR RUTINA DE ENTRENAMIENTO
    routine = WORKOUT_ROUTINES[idx % len(WORKOUT_ROUTINES)]
    st, body = http("POST", "/api/v1/routines/", {
        "label": routine["label"],
        "routine_json": routine["routine_json"],
    }, token=token)
    if ok("POST /routines", st, body, acceptable=[200, 201]):
        results["routine_saved"] = True
        routine_id = body.get("id")
        print(f"     Rutina ID: {routine_id}")
    else:
        routine_id = None

    # 5. SESIÓN DE ENTRENAMIENTO
    session_data = WORKOUT_SESSIONS[idx % len(WORKOUT_SESSIONS)]
    now_utc = datetime.now(timezone.utc)
    started_at = (now_utc - timedelta(minutes=75)).isoformat().replace("+00:00", "Z")
    finished_at = now_utc.isoformat().replace("+00:00", "Z")

    workout_payload = {
        "started_at": started_at,
        "finished_at": finished_at,
        "notes": session_data["notes"],
        "exercises": [
            {
                "exercise_key": ex["exercise_key"],
                "exercise_name": ex["exercise_name"],
                "order_index": ex["order_index"],
                "sets": [
                    {
                        "set_number": s["set_number"],
                        "weight_kg": s["weight_kg"],
                        "reps": s["reps"],
                        "rpe": s.get("rpe"),
                        "is_warmup": s.get("is_warmup", False),
                    }
                    for s in ex["sets"]
                ],
            }
            for ex in session_data["exercises"]
        ],
    }
    if routine_id:
        workout_payload["routine_id"] = routine_id

    st, body = http("POST", "/api/v1/workout/sessions", workout_payload, token=token)
    if ok("POST /workout/sessions", st, body, acceptable=[200, 201]):
        results["workout_session"] = True
        vol = body.get("total_volume_kg", "?")
        xp = body.get("xp_awarded", "?")
        prs = body.get("prs", [])
        print(f"     Volumen: {vol} kg | XP: {xp} | PRs: {len(prs)}")

    # 6. RECETA DE NUTRICIÓN (anónima por user_local_id)
    local_id = str(uuid.uuid4())
    recipe_ingredients = build_recipe_ingredients(ingredient_ids, idx)
    if recipe_ingredients:
        st, body = http("POST", "/api/v1/nutrition/recipes", {
            "user_local_id": local_id,
            "name": f"QA Receta {user['display_name']} — Proteína",
            "category": ["almuerzo", "desayuno", "cena", "post"][idx % 4],
            "ingredients": recipe_ingredients,
            "instructions": f"Receta QA generada automáticamente para {user['display_name']}. "
                          f"Preparación: mezclar ingredientes y cocinar a fuego medio.",
            "rating_stars": 4,
        })
        if ok("POST /nutrition/recipes", st, body, acceptable=[200, 201]):
            results["recipe_created"] = True
            cals = body.get("total_calories", "?")
            prot = body.get("total_protein", "?")
            print(f"     Calorías: {cals} kcal | Proteína: {prot}g")
    else:
        print("  ⚠️  Sin ingredientes disponibles — receta omitida")

    return results


def main() -> None:
    print(f"\n{'='*60}")
    print(f"🏋️  HealthStack QA — Simulación de usuarios estándar")
    print(f"     Base URL: {BASE_URL}")
    print(f"     Usuarios a crear: {len(USERS)}")
    print(f"{'='*60}")

    # Verificar ingredientes disponibles
    print("\n📦 Verificando ingredientes en BD...")
    ingredient_ids = verify_ingredients()
    if not ingredient_ids:
        print("  🚫 Ejecuta primero: docker exec healthstack_backend python -m scripts.seed_nutrition")
        sys.exit(1)

    # Simular cada usuario
    all_results = []
    for idx, user in enumerate(USERS):
        result = simulate_user(user, idx, ingredient_ids)
        all_results.append(result)

    # ── Resumen final ─────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print("📋 RESUMEN FINAL")
    print(f"{'='*60}")
    total_ok = 0
    total_checks = 0
    for r in all_results:
        checks = [r["register"], r["login"], r["weight_records"] >= 5, r["routine_saved"], r["workout_session"], r["recipe_created"]]
        passed = sum(checks)
        total_ok += passed
        total_checks += len(checks)
        icon = "✅" if passed == len(checks) else ("⚠️ " if passed >= 4 else "❌")
        print(f"  {icon} {r['user']}: {passed}/{len(checks)} — "
              f"peso={r['weight_records']}reg | rutina={'✓' if r['routine_saved'] else '✗'} | "
              f"sesión={'✓' if r['workout_session'] else '✗'} | receta={'✓' if r['recipe_created'] else '✗'}")

    print(f"\n  Total: {total_ok}/{total_checks} checks pasados")
    if total_ok == total_checks:
        print("\n  🎉 Simulación completada con éxito. Datos visibles en admin panel.")
    elif total_ok >= total_checks * 0.8:
        print("\n  ⚠️  Simulación completada con algunas advertencias.")
    else:
        print("\n  ❌ Simulación con errores. Revisa los logs.")

    sys.exit(0 if total_ok >= total_checks * 0.8 else 1)


if __name__ == "__main__":
    main()
