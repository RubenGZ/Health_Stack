#!/usr/bin/env python3
"""
smoke_test.py — HealthStack Pro Smoke Test
==========================================
Prueba los 17 módulos del monolito modular contra un backend vivo.

Uso:
    python scripts/smoke_test.py <BASE_URL>
    python scripts/smoke_test.py https://abc123.trycloudflare.com

El script:
  1. Registra un usuario de prueba temporal
  2. Ejecuta un check por módulo (happy path)
  3. Imprime tabla de resultados con pass/fail por módulo
  4. Sale con código 1 si algún módulo falla

No tiene dependencias externas — usa solo stdlib (urllib).
"""

from __future__ import annotations

import json
import sys
import uuid
from datetime import date, datetime
from typing import Optional
import urllib.error
import urllib.parse
import urllib.request

# ── Config ────────────────────────────────────────────────────────────────────

BASE_URL = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:8000"

# Credenciales efímeras — únicas por ejecución
_uid      = uuid.uuid4().hex[:8]
EMAIL     = f"smoke_{_uid}@healthstack-test.com"
PASSWORD  = "SmokeTest123!"
NAME      = f"Smoke {_uid}"
LOCAL_ID  = uuid.uuid4().hex          # user_local_id para Nutrition

# ── Estado global ─────────────────────────────────────────────────────────────

_access_token:  Optional[str] = None
_refresh_token: Optional[str] = None
_results: list[dict] = []

# ── Colores ANSI ──────────────────────────────────────────────────────────────

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
RESET  = "\033[0m"


# ── HTTP helper ───────────────────────────────────────────────────────────────

def http(
    method: str,
    path: str,
    body: Optional[dict] = None,
    auth: bool = True,
    timeout: int = 15,
) -> tuple[int, dict]:
    """Hace una petición HTTP y devuelve (status_code, body_dict)."""
    url  = BASE_URL + path
    data = json.dumps(body).encode() if body is not None else None
    hdrs = {"Content-Type": "application/json", "Accept": "application/json"}
    if auth and _access_token:
        hdrs["Authorization"] = f"Bearer {_access_token}"

    req = urllib.request.Request(url, data=data, headers=hdrs, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            try:
                resp_body = json.loads(resp.read().decode())
            except Exception:
                resp_body = {}
            return resp.status, resp_body
    except urllib.error.HTTPError as exc:
        try:
            exc_body = json.loads(exc.read().decode())
        except Exception:
            exc_body = {"detail": str(exc)}
        return exc.code, exc_body
    except Exception as exc:
        return 0, {"detail": str(exc)}


# ── Check helper ──────────────────────────────────────────────────────────────

def check(
    label: str,
    module: str,
    status: int,
    body: dict,
    *,
    expected: Optional[int] = None,
    acceptable: Optional[list[int]] = None,
) -> tuple[bool, dict]:
    """
    Evalúa si el resultado es correcto.
    - expected: código exacto requerido
    - acceptable: lista de códigos válidos
    - Si ninguno: cualquier 2xx o 3xx cuenta como OK
    """
    if expected is not None:
        ok = status == expected
    elif acceptable is not None:
        ok = status in acceptable
    else:
        ok = 0 < status < 400

    sym    = f"{GREEN}✓{RESET}" if ok else f"{RED}✗{RESET}"
    detail = ""
    if not ok:
        msg = body.get("detail", "")
        if msg:
            detail = f" — {str(msg)[:90]}"

    print(f"  {sym} {label} [{status}]{detail}")
    _results.append({"module": module, "label": label, "ok": ok, "status": status})
    return ok, body


# ── Setup ─────────────────────────────────────────────────────────────────────

def setup() -> None:
    global _access_token, _refresh_token

    print(f"\n{BOLD}🔧 Setup — registrando usuario de prueba{RESET}")

    st, body = http("POST", "/api/v1/auth/register", {
        "email":        EMAIL,
        "password":     PASSWORD,
        "display_name": NAME,
        "consent_gdpr": True,
    }, auth=False)

    if st != 201:
        print(f"  {RED}✗ Register failed [{st}]: {body.get('detail', body)}{RESET}")
        sys.exit(1)

    _access_token  = body.get("access_token")
    _refresh_token = body.get("refresh_token")
    print(f"  {GREEN}✓ Usuario registrado: {EMAIL}{RESET}")


# ── Módulos ───────────────────────────────────────────────────────────────────

def test_system() -> None:
    print(f"\n{BOLD}[01] System{RESET}")
    st, body = http("GET", "/health", auth=False)
    check("GET /health", "System", st, body, expected=200)


def test_identity() -> None:
    global _access_token, _refresh_token
    print(f"\n{BOLD}[02] Identity{RESET}")

    # Login
    st, body = http("POST", "/api/v1/auth/login",
                    {"email": EMAIL, "password": PASSWORD}, auth=False)
    ok, body = check("POST /auth/login", "Identity", st, body, expected=200)
    if ok:
        _access_token  = body.get("access_token",  _access_token)
        _refresh_token = body.get("refresh_token", _refresh_token)

    # Me
    st, body = http("GET", "/api/v1/auth/me")
    check("GET /auth/me", "Identity", st, body, expected=200)

    # Refresh
    if _refresh_token:
        st, body = http("POST", "/api/v1/auth/refresh",
                        {"refresh_token": _refresh_token}, auth=False)
        ok, body = check("POST /auth/refresh", "Identity", st, body, expected=200)
        if ok and body.get("access_token"):
            _access_token  = body["access_token"]
            _refresh_token = body.get("refresh_token", _refresh_token)


def test_health_module() -> None:
    print(f"\n{BOLD}[03] Health (biométricos){RESET}")
    today = date.today().isoformat()

    st, body = http("POST", "/api/v1/health/records",
                    {"recorded_date": today, "weight_kg": 80.5})
    check("POST /health/records", "Health", st, body, expected=201)

    st, body = http("GET", "/api/v1/health/records")
    check("GET /health/records", "Health", st, body, expected=200)


def test_nutrition() -> None:
    print(f"\n{BOLD}[04] Nutrition{RESET}")

    st, body = http("GET", "/api/v1/nutrition/ingredients?limit=5", auth=False)
    check("GET /nutrition/ingredients", "Nutrition", st, body, expected=200)

    st, body = http("GET", f"/api/v1/nutrition/recipes?local_id={LOCAL_ID}")
    check("GET /nutrition/recipes", "Nutrition", st, body, expected=200)

    st, body = http("GET", "/api/v1/nutrition/supplements", auth=False)
    check("GET /nutrition/supplements", "Nutrition", st, body, expected=200)


def test_routines() -> None:
    print(f"\n{BOLD}[05] Routines{RESET}")

    st, body = http("GET", "/api/v1/routines")
    check("GET /routines", "Routines", st, body, expected=200)


def test_community() -> None:
    print(f"\n{BOLD}[06] Community{RESET}")

    st, body = http("GET", "/api/v1/community/posts")
    check("GET /community/posts", "Community", st, body, expected=200)

    st, body = http("POST", "/api/v1/community/posts",
                    {"content": "Smoke test post 🔥", "category": "general"})
    ok, post = check("POST /community/posts", "Community", st, body, expected=201)

    if ok and post.get("id"):
        post_id = post["id"]
        st, body = http("POST", f"/api/v1/community/posts/{post_id}/like")
        check("POST /community/posts/:id/like", "Community", st, body,
              acceptable=[200, 201])


def test_gamification() -> None:
    print(f"\n{BOLD}[07] Gamification{RESET}")

    st, body = http("GET", "/api/v1/gamification/state")
    check("GET /gamification/state", "Gamification", st, body, expected=200)

    st, body = http("POST", "/api/v1/gamification/action", {"action": "workout"})
    check("POST /gamification/action", "Gamification", st, body, expected=200)


def test_ai_coach() -> None:
    print(f"\n{BOLD}[08] AI Coach{RESET}")

    st, body = http("POST", "/api/v1/ai-coach/set-feedback", {
        "exercise":  "banca",
        "weight_kg": 80.0,
        "reps":      10,
        "rir":       2,
        "notes":     "Smoke test",
    })
    # 200 = AI responde, 502/503 = provider down (aceptable en smoke test)
    check("POST /ai-coach/set-feedback", "AI Coach", st, body,
          acceptable=[200, 502, 503])


def test_ai_insights() -> None:
    print(f"\n{BOLD}[09] AI Insights{RESET}")

    st, body = http("GET", "/api/v1/ai-insights/biomarker-narrative")
    # 200 = OK, 503 = sin datos/key (aceptable), 422 = sin datos de salud
    check("GET /ai-insights/biomarker-narrative", "AI Insights", st, body,
          acceptable=[200, 422, 503])

    st, body = http("GET", "/api/v1/ai-insights/injury-risk")
    check("GET /ai-insights/injury-risk", "AI Insights", st, body,
          acceptable=[200, 422, 503])


def test_chat() -> None:
    print(f"\n{BOLD}[10] Chat (Wizard AI){RESET}")

    st, body = http("POST", "/api/v1/chat/message", {
        "message": "Hola, ¿cuánta proteína necesito?",
        "history": [],
    }, auth=False)
    # 200 = AI responde, 502 = provider down (aceptable)
    check("POST /chat/message", "Chat", st, body, acceptable=[200, 502])


def test_geopricing() -> None:
    print(f"\n{BOLD}[11] Geo-Pricing{RESET}")

    st, body = http("GET", "/api/geo-price", auth=False)
    check("GET /geo-price", "Geo-Pricing", st, body, expected=200)


def test_telemetry() -> None:
    print(f"\n{BOLD}[12] Telemetry{RESET}")

    st, body = http("POST", "/api/v1/telemetry/page-view", {
        "page": "/smoke-test",
    }, auth=False)
    # 200 o 201 según la implementación
    check("POST /telemetry/page-view", "Telemetry", st, body,
          acceptable=[200, 201])


def test_workout_sessions() -> None:
    print(f"\n{BOLD}[13] Workout Sessions{RESET}")

    st, body = http("GET", "/api/v1/workout/sessions")
    check("GET /workout/sessions", "Workout Sessions", st, body, expected=200)


def test_ranked() -> None:
    print(f"\n{BOLD}[14] Ranked{RESET}")

    st, body = http("GET", "/api/v1/ranked/profile")
    check("GET /ranked/profile", "Ranked", st, body, expected=200)

    st, body = http("GET", "/api/v1/ranked/leaderboard?queue=normal&scope=global")
    check("GET /ranked/leaderboard", "Ranked", st, body, expected=200)


def test_gym_servers() -> None:
    print(f"\n{BOLD}[15] Gym Servers{RESET}")

    st, body = http("GET", "/api/v1/gym-servers/my-gyms")
    check("GET /gym-servers/my-gyms", "Gym Servers", st, body, expected=200)


def test_integrations() -> None:
    print(f"\n{BOLD}[16] Integrations{RESET}")

    st, body = http("GET", "/api/v1/integrations")
    check("GET /integrations", "Integrations", st, body, expected=200)


def test_admin() -> None:
    print(f"\n{BOLD}[17] Admin (403 esperado para usuario normal){RESET}")

    st, body = http("GET", "/api/v1/admin/stats/overview")
    # Usuario normal → 403 (correcto). Admin → 200.
    check("GET /admin/stats/overview", "Admin", st, body, acceptable=[200, 403])


# ── Report ────────────────────────────────────────────────────────────────────

def report() -> None:
    total  = len(_results)
    passed = sum(1 for r in _results if r["ok"])
    failed = total - passed

    # Agrupar por módulo
    modules: dict[str, list[dict]] = {}
    for r in _results:
        modules.setdefault(r["module"], []).append(r)

    print(f"\n{'─' * 56}")
    print(f"{BOLD}Smoke Test — HealthStack Pro{RESET}")
    print(f"{DIM}{BASE_URL}{RESET}")
    print(f"{'─' * 56}")

    for mod, checks in modules.items():
        mod_ok = all(c["ok"] for c in checks)
        sym    = f"{GREEN}✓{RESET}" if mod_ok else f"{RED}✗{RESET}"
        failing = [c for c in checks if not c["ok"]]
        detail  = ""
        if failing:
            detail = f" {RED}← {', '.join(c['label'] for c in failing)}{RESET}"
        print(f"  {sym} {mod}{detail}")

    print(f"{'─' * 56}")
    print(f"  Checks: {GREEN}{passed}{RESET}/{total} passed", end="")
    if failed:
        print(f"  |  {RED}{failed} failed{RESET}")
    else:
        print(f"  {GREEN}🎉 All clean!{RESET}")
    print(f"{'─' * 56}\n")

    sys.exit(0 if failed == 0 else 1)


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"\n{BOLD}HealthStack Pro — Smoke Test{RESET}")
    print(f"Target : {BASE_URL}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    setup()

    test_system()
    test_identity()
    test_health_module()
    test_nutrition()
    test_routines()
    test_community()
    test_gamification()
    test_ai_coach()
    test_ai_insights()
    test_chat()
    test_geopricing()
    test_telemetry()
    test_workout_sessions()
    test_ranked()
    test_gym_servers()
    test_integrations()
    test_admin()

    report()
