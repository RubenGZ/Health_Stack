#!/usr/bin/env python3
"""
seed.py — Create test users and 4 weeks of realistic data for E2E tests.

Strategy: API-based seeding (not direct DB).  This exercises the real
application logic (password hashing, health-UUID encryption, XP calculation)
and stays in sync automatically when the backend schema changes.

Usage:
    python e2e/scripts/seed.py

Environment variables (from e2e/.env):
    API_URL          — FastAPI base URL   (default: http://localhost:8000)
    TEST_USER_EMAIL  — test user email
    TEST_USER_PASSWORD
    TEST_USER_NAME
    TEST_ADMIN_EMAIL — admin user email (optional, skipped if role=admin grant not available)
    TEST_ADMIN_PASSWORD
    TEST_ADMIN_NAME
"""

import os, sys, json, random
from datetime import date, timedelta
from pathlib import Path
from dotenv import load_dotenv

# ── Load env ───────────────────────────────────────────────────────────────────
env_path = Path(__file__).parent.parent / '.env'
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv(Path(__file__).parent.parent / '.env.example')

try:
    import httpx
except ImportError:
    print("ERROR: httpx is required.  Run:  pip install httpx python-dotenv")
    sys.exit(1)

API_URL = os.getenv('API_URL', 'http://localhost:8000')

TEST_USER = {
    'email':        os.getenv('TEST_USER_EMAIL',    'e2e_user@healthstack.test'),
    'password':     os.getenv('TEST_USER_PASSWORD', 'E2eTest!2026'),
    'display_name': os.getenv('TEST_USER_NAME',     'E2E Atleta'),
}
TEST_ADMIN = {
    'email':        os.getenv('TEST_ADMIN_EMAIL',    'e2e_admin@healthstack.test'),
    'password':     os.getenv('TEST_ADMIN_PASSWORD', 'E2eAdmin!2026'),
    'display_name': os.getenv('TEST_ADMIN_NAME',     'E2E Admin'),
}

# ── Helpers ────────────────────────────────────────────────────────────────────

def ok(r: httpx.Response, label: str) -> dict:
    if r.status_code not in (200, 201):
        print(f"  ✗ {label}: {r.status_code} — {r.text[:200]}")
        return {}
    print(f"  ✓ {label}")
    try:
        return r.json()
    except Exception:
        return {}


def register_or_login(client: httpx.Client, creds: dict) -> str | None:
    """Register user; if already exists, login instead.  Returns access_token."""
    r = client.post(f'{API_URL}/api/v1/auth/register', json=creds)
    if r.status_code in (200, 201):
        data = ok(r, f"register {creds['email']}")
        return data.get('access_token')
    if r.status_code == 409:
        print(f"  ℹ  {creds['email']} already exists, logging in…")
        r2 = client.post(f'{API_URL}/api/v1/auth/login',
                         json={'email': creds['email'], 'password': creds['password']})
        data = ok(r2, f"login {creds['email']}")
        return data.get('access_token')
    ok(r, f"register {creds['email']}")
    return None


def auth_headers(token: str) -> dict:
    return {'Authorization': f'Bearer {token}'}


# ── Seed functions ─────────────────────────────────────────────────────────────

def seed_health_records(client: httpx.Client, token: str, weeks: int = 4) -> None:
    """Create daily weight records for the past `weeks` weeks."""
    print(f"\n  Seeding {weeks * 7} health records (weight)…")
    today = date.today()
    # Simulate gradual weight loss: start at 85 kg, lose ~0.2 kg/week
    base_weight = 85.0
    headers = auth_headers(token)

    seeded = 0
    for day_offset in range(weeks * 7, 0, -1):
        record_date = today - timedelta(days=day_offset)
        week_num    = day_offset // 7
        weight_kg   = round(base_weight - (weeks - week_num) * 0.2 + random.uniform(-0.3, 0.3), 1)
        # Skip a few days to simulate realistic data (not every day)
        if random.random() < 0.15:
            continue
        payload = {
            'recorded_date': record_date.isoformat(),
            'weight_kg':     weight_kg,
        }
        r = client.post(f'{API_URL}/api/v1/health/records', json=payload, headers=headers)
        if r.status_code in (200, 201, 409):
            seeded += 1
        # If 409, record already exists for that date — that's fine
    print(f"    → {seeded} records created (skipped existing)")


def seed_gamification(client: httpx.Client, token: str) -> None:
    """Fire several gamification actions to build up XP and level."""
    print("\n  Seeding gamification actions…")
    headers = auth_headers(token)
    actions = (
        ['weight'] * 20 +   # ~200 XP
        ['routine'] * 10 +  # ~200 XP
        ['post']    * 5  +  # ~50 XP
        ['tdee']    * 3     # ~30 XP
    )
    fired = 0
    for action in actions:
        r = client.post(f'{API_URL}/api/v1/gamification/action',
                        json={'action': action}, headers=headers)
        if r.status_code in (200, 201):
            fired += 1
    print(f"    → {fired} actions fired")


def seed_routine(client: httpx.Client, token: str) -> str | None:
    """Create a saved routine and return its id."""
    print("\n  Seeding routine…")
    routine_json = {
        'label':       'E2E Fuerza Total',
        'description': 'Rutina de prueba para E2E — 3 días a la semana, full body.',
        'days_per_week': 3,
        'focus_area':    'Fuerza',
        'days': [
            {
                'day_label':  'Día 1 — Empuje',
                'focus':      'Pecho, Hombros, Tríceps',
                'exercises': [
                    {'name': 'Press banca', 'sets': 4, 'reps': '6-8',  'rest': '90s', 'notes': ''},
                    {'name': 'Press militar','sets': 3, 'reps': '8-10', 'rest': '60s', 'notes': ''},
                    {'name': 'Extensión tríceps','sets': 3,'reps':'12','rest':'45s','notes':''},
                ],
            },
            {
                'day_label':  'Día 2 — Tirón',
                'focus':      'Espalda, Bíceps',
                'exercises': [
                    {'name': 'Dominadas', 'sets': 4, 'reps': '6-8', 'rest': '90s', 'notes': ''},
                    {'name': 'Remo barra', 'sets': 3, 'reps': '8',  'rest': '75s', 'notes': ''},
                    {'name': 'Curl bíceps','sets': 3, 'reps': '12', 'rest': '45s', 'notes': ''},
                ],
            },
            {
                'day_label':  'Día 3 — Pierna',
                'focus':      'Cuádriceps, Glúteo, Femoral',
                'exercises': [
                    {'name': 'Sentadilla',    'sets': 4, 'reps': '6-8', 'rest': '120s','notes': ''},
                    {'name': 'Peso muerto',   'sets': 3, 'reps': '5',   'rest': '120s','notes': ''},
                    {'name': 'Prensa pierna', 'sets': 3, 'reps': '12',  'rest': '60s', 'notes': ''},
                ],
            },
        ],
    }
    headers = auth_headers(token)
    payload = {
        'label':        routine_json['label'],
        'routine_json': json.dumps(routine_json),
    }
    r = client.post(f'{API_URL}/api/v1/routines/', json=payload, headers=headers)
    data = ok(r, f"routine '{routine_json['label']}'")
    return str(data.get('id')) if data.get('id') else None


def seed_community_posts(client: httpx.Client, token: str) -> None:
    """Create a few community posts."""
    print("\n  Seeding community posts…")
    headers = auth_headers(token)
    posts = [
        "¡Primer PR en sentadilla! 100 kg. 🎉",
        "Semana 2 completada — 4 sesiones consecutivas. La constancia es clave.",
        "¿Alguien más usa el planner de nutrición? Me ha ayudado mucho con las macros.",
    ]
    for content in posts:
        r = client.post(f'{API_URL}/api/v1/community/posts',
                        json={'content': content}, headers=headers)
        ok(r, f"post '{content[:40]}…'")


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    print(f"\n{'='*60}")
    print(f"  HealthStack E2E — Seed script")
    print(f"  API: {API_URL}")
    print(f"{'='*60}\n")

    with httpx.Client(timeout=30) as client:
        # ── Health check ──
        try:
            r = client.get(f'{API_URL}/health')
            if r.status_code != 200:
                print(f"ERROR: Backend not healthy ({r.status_code}).  Is it running?")
                sys.exit(1)
            print("✓ Backend is healthy\n")
        except httpx.ConnectError:
            print(f"ERROR: Cannot connect to {API_URL}.  Start the backend first.")
            sys.exit(1)

        # ── Seed test user ──
        print(f"── Test user: {TEST_USER['email']}")
        token = register_or_login(client, TEST_USER)
        if not token:
            print("FATAL: Could not obtain token for test user.  Aborting.")
            sys.exit(1)

        seed_health_records(client, token)
        seed_gamification(client, token)
        routine_id = seed_routine(client, token)
        seed_community_posts(client, token)

        # ── Seed admin user (optional) ──
        print(f"\n── Admin user: {TEST_ADMIN['email']}")
        admin_token = register_or_login(client, TEST_ADMIN)
        if admin_token:
            seed_gamification(client, admin_token)

    print(f"\n{'='*60}")
    print("  Seed complete. ✓")
    if routine_id:
        print(f"  Active routine id: {routine_id}")
        print(f"  → Set in browser localStorage as: hs_active_routine_id={routine_id}")
    print(f"{'='*60}\n")


if __name__ == '__main__':
    main()
