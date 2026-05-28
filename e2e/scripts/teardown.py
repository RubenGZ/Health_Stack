#!/usr/bin/env python3
"""
teardown.py — Delete E2E test users and all their associated data.

Calls DELETE /api/v1/auth/account (requires the user's own JWT).
This cascades through health records, routines, gamification state,
community posts — all FK-constrained to user_id.

Usage:
    python e2e/scripts/teardown.py
"""

import os, sys
from pathlib import Path
from dotenv import load_dotenv

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

USERS = [
    {
        'email':    os.getenv('TEST_USER_EMAIL',    'e2e_user@healthstack.test'),
        'password': os.getenv('TEST_USER_PASSWORD', 'E2eTest!2026'),
    },
    {
        'email':    os.getenv('TEST_ADMIN_EMAIL',    'e2e_admin@healthstack.test'),
        'password': os.getenv('TEST_ADMIN_PASSWORD', 'E2eAdmin!2026'),
    },
]


def login(client: httpx.Client, creds: dict) -> str | None:
    r = client.post(f'{API_URL}/api/v1/auth/login',
                    json={'email': creds['email'], 'password': creds['password']})
    if r.status_code == 200:
        return r.json().get('access_token')
    if r.status_code == 401:
        print(f"  ℹ  {creds['email']} — not found or wrong password (may already be deleted)")
    else:
        print(f"  ✗  login {creds['email']}: {r.status_code} {r.text[:100]}")
    return None


def delete_account(client: httpx.Client, token: str, email: str) -> None:
    r = client.delete(
        f'{API_URL}/api/v1/auth/account',
        headers={'Authorization': f'Bearer {token}'},
    )
    if r.status_code in (200, 204):
        print(f"  ✓  deleted {email}")
    elif r.status_code == 404:
        print(f"  ℹ  {email} — account not found (already deleted?)")
    else:
        print(f"  ✗  delete {email}: {r.status_code} {r.text[:200]}")
        # Fallback: try direct SQL deletion if DELETE /account is not implemented
        print(f"     Tip: if DELETE /api/v1/auth/account is not implemented,")
        print(f"     run manually:  DELETE FROM users WHERE email = '{email}';")


def main() -> None:
    print(f"\n{'='*60}")
    print(f"  HealthStack E2E — Teardown script")
    print(f"  API: {API_URL}")
    print(f"{'='*60}\n")

    with httpx.Client(timeout=15) as client:
        for creds in USERS:
            print(f"── {creds['email']}")
            token = login(client, creds)
            if token:
                delete_account(client, token, creds['email'])

    print(f"\n{'='*60}")
    print("  Teardown complete. ✓")
    print(f"{'='*60}\n")


if __name__ == '__main__':
    main()
