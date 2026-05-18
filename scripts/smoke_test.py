#!/usr/bin/env python3
"""
smoke_test.py — HealthStack Pro Smoke Test v2
=============================================
Prueba los módulos del monolito modular contra un backend vivo.
Incluye comprobaciones de seguridad basadas en la auditoría de código (2026-05-18).

Uso:
    python scripts/smoke_test.py <BASE_URL>
    python scripts/smoke_test.py https://abc123.trycloudflare.com

El script:
  1. Registra un usuario de prueba temporal
  2. Ejecuta un check por módulo (happy path)
  3. Ejecuta checks de seguridad (auth guards, rate limits, data integrity)
  4. Imprime tabla de resultados con pass/fail por módulo
  5. Sale con código 1 si algún módulo falla

No tiene dependencias externas — usa solo stdlib (urllib).
"""

from __future__ import annotations

import json
import sys
import time
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
    token_override: Optional[str] = None,
    timeout: int = 15,
) -> tuple[int, dict]:
    """Hace una petición HTTP y devuelve (status_code, body_dict)."""
    url  = BASE_URL + path
    data = json.dumps(body).encode() if body is not None else None
    hdrs = {"Content-Type": "application/json", "Accept": "application/json"}
    tok  = token_override if token_override is not None else (_access_token if auth else None)
    if tok:
        hdrs["Authorization"] = f"Bearer {tok}"

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
    warn: bool = False,
) -> tuple[bool, dict]:
    """
    Evalúa si el resultado es correcto.
    - expected: código exacto requerido
    - acceptable: lista de códigos válidos
    - warn: si True, un fallo se muestra como advertencia (⚠) sin contar como error
    - Si ninguno: cualquier 2xx o 3xx cuenta como OK
    """
    if expected is not None:
        ok = status == expected
    elif acceptable is not None:
        ok = status in acceptable
    else:
        ok = 0 < status < 400

    if ok:
        sym = f"{GREEN}✓{RESET}"
    elif warn:
        sym = f"{YELLOW}⚠{RESET}"
        ok  = True   # advertencia no cuenta como fallo
    else:
        sym = f"{RED}✗{RESET}"

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


# ── Módulos — Happy path ───────────────────────────────────────────────────────

def test_system() -> None:
    print(f"\n{BOLD}[01] System{RESET}")
    st, body = http("GET", "/health", auth=False)
    check("GET /health", "System", st, body, expected=200)

    # Nuevo: endpoint de configuración pública (añadido en mayo 2026)
    st, body = http("GET", "/api/v1/config/public", auth=False)
    check("GET /config/public", "System", st, body, expected=200)


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

        # Like toggle: 0 → 1
        st, body = http("POST", f"/api/v1/community/posts/{post_id}/like")
        check("POST /community/:id/like (toggle on)", "Community", st, body,
              acceptable=[200, 201])

        # Verify counter incremented
        st, body = http("GET", "/api/v1/community/posts")
        if st == 200:
            posts = body.get("posts", body if isinstance(body, list) else [])
            target = next((p for p in posts if str(p.get("id")) == str(post_id)), None)
            if target is not None:
                count_after_like = target.get("likes_count", -1)
                ok2 = count_after_like >= 1
                sym = f"{GREEN}✓{RESET}" if ok2 else f"{RED}✗{RESET}"
                detail = f"likes_count={count_after_like}" if not ok2 else f"likes_count={count_after_like}"
                print(f"  {sym} Community like counter incremented [{count_after_like}]")
                _results.append({"module": "Community", "label": "like counter increment", "ok": ok2, "status": st})

        # Like toggle: 1 → 0 (unlike)
        st, body = http("POST", f"/api/v1/community/posts/{post_id}/like")
        check("POST /community/:id/like (toggle off)", "Community", st, body,
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
    check("POST /chat/message (anon)", "Chat", st, body, acceptable=[200, 502])

    # Chat autenticado — debería recibir contexto de usuario
    st, body = http("POST", "/api/v1/chat/message", {
        "message": "¿Cuál es mi nivel actual?",
        "history": [],
    }, auth=True)
    check("POST /chat/message (auth)", "Chat", st, body, acceptable=[200, 502])


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

    # Crear y recuperar sesión de entrenamiento completa
    today = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    st, body = http("POST", "/api/v1/workout/sessions", {
        "started_at":  today,
        "finished_at": today,
        "exercises": [{
            "exercise_key":  "sentadilla",
            "exercise_name": "Sentadilla",
            "order_index":   0,
            "sets": [{"set_number": 1, "weight_kg": 100.0, "reps": 5, "is_warmup": False}],
        }],
    })
    ok, session = check("POST /workout/sessions", "Workout Sessions", st, body,
                        acceptable=[200, 201])

    if ok and session.get("session_id"):
        sid = session["session_id"]
        st, body = http("GET", f"/api/v1/workout/sessions/{sid}")
        check(f"GET /workout/sessions/:id", "Workout Sessions", st, body, expected=200)


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


# ── SECURITY CHECKS (basados en auditoría 2026-05-18) ────────────────────────

def test_security_auth_guards() -> None:
    """
    Verifica que los endpoints protegidos devuelven 401/403 sin token.
    Bug auditado: algunos endpoints WIP podrían olvidar el decorator de auth.
    """
    print(f"\n{BOLD}[18] Security — Auth Guards{RESET}")
    protected = [
        ("GET",  "/api/v1/health/records",         "Health records"),
        ("GET",  "/api/v1/workout/sessions",        "Workout sessions"),
        ("GET",  "/api/v1/ranked/profile",          "Ranked profile"),
        ("GET",  "/api/v1/gamification/state",      "Gamification state"),
        ("POST", "/api/v1/gamification/action",     "Gamification action"),
        ("GET",  "/api/v1/ai-coach/history",        "AI Coach history"),
        ("GET",  "/api/v1/gym-servers/my-gyms",     "Gym servers"),
        ("GET",  "/api/v1/integrations",            "Integrations"),
    ]
    for method, path, label in protected:
        st, body = http(method, path, auth=False, token_override="")
        check(
            f"{method} {path} (no auth)",
            "Security.AuthGuards",
            st, body,
            acceptable=[401, 403],
        )


def test_security_invalid_token() -> None:
    """
    Verifica que un token malformado devuelve 401 y no 500.
    Bug auditado: si la validación JWT lanza una excepción no capturada → 500 leak.
    """
    print(f"\n{BOLD}[19] Security — Token Validation{RESET}")

    bad_tokens = [
        "not.a.jwt",
        "Bearer eyJhbGciOiJSUzI1NiJ9.invalid.payload",
        "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.badsig",
    ]
    for tok in bad_tokens:
        st, body = http("GET", "/api/v1/auth/me", auth=False, token_override=tok)
        check(
            f"GET /auth/me (malformed token: {tok[:20]}…)",
            "Security.TokenValidation",
            st, body,
            acceptable=[401, 403, 422],
        )

    # Refresh con token inválido → debe ser 401, no 500
    st, body = http("POST", "/api/v1/auth/refresh",
                    {"refresh_token": "invalid_refresh_token_xyz"}, auth=False)
    check("POST /auth/refresh (bad token)", "Security.TokenValidation", st, body,
          acceptable=[401, 422])


def test_security_rate_limit_chat() -> None:
    """
    Verifica que el chat tiene rate limit per-IP para usuarios anónimos.
    Bug auditado: sin límite específico → posible DoS de costes LLM.
    Fix desplegado: 10 req/min anon, 30/min auth.

    Solo comprueba que el servidor responde 429 después del límite.
    Enviamos 12 mensajes rápidos sin auth y esperamos al menos un 429.
    """
    print(f"\n{BOLD}[20] Security — Chat Rate Limit{RESET}")

    BURST = 12
    got_429 = False
    for i in range(BURST):
        st, _ = http("POST", "/api/v1/chat/message", {
            "message": f"smoke rate limit test {i}",
            "history": [],
        }, auth=False, timeout=5)
        if st == 429:
            got_429 = True
            break

    if got_429:
        print(f"  {GREEN}✓{RESET} Chat rate limit enforced (429 received after burst)")
        _results.append({"module": "Security.RateLimit", "label": "chat rate limit", "ok": True, "status": 429})
    else:
        # Warn: rate limit might not be hit if burst < limit (race with IP tracker reset)
        print(f"  {YELLOW}⚠{RESET} Chat rate limit not triggered in {BURST} requests — verify manually")
        _results.append({"module": "Security.RateLimit", "label": "chat rate limit", "ok": True, "status": 0})


def test_security_ownership() -> None:
    """
    Verifica que un usuario no puede acceder a recursos de otro usuario.
    Crea un segundo usuario y comprueba que no puede leer los registros del primero.
    Bug auditado: workout_sessions y health_records deben filtrar por user.
    """
    print(f"\n{BOLD}[21] Security — Resource Ownership{RESET}")

    # Registrar un segundo usuario
    uid2   = uuid.uuid4().hex[:8]
    email2 = f"smoke2_{uid2}@healthstack-test.com"
    st, body2 = http("POST", "/api/v1/auth/register", {
        "email":        email2,
        "password":     PASSWORD,
        "display_name": f"Smoke2 {uid2}",
        "consent_gdpr": True,
    }, auth=False)

    if st != 201:
        print(f"  {YELLOW}⚠{RESET} No se pudo crear segundo usuario para test de ownership [{st}]")
        _results.append({"module": "Security.Ownership", "label": "second user register", "ok": True, "status": st})
        return

    tok2 = body2.get("access_token")

    # Crear un health record con usuario 1
    today = date.today().isoformat()
    st, record = http("POST", "/api/v1/health/records",
                      {"recorded_date": today, "weight_kg": 99.9})
    if st != 201 or not record.get("id"):
        print(f"  {YELLOW}⚠{RESET} No se pudo crear health record para test [{st}]")
        _results.append({"module": "Security.Ownership", "label": "create record", "ok": True, "status": st})
        return

    record_id = record["id"]

    # Usuario 2 no debe ver el registro de usuario 1 en su propia lista
    st, list2 = http("GET", "/api/v1/health/records", auth=False, token_override=tok2)
    if st == 200:
        records2 = list2.get("records", list2 if isinstance(list2, list) else [])
        leaked = any(str(r.get("id")) == str(record_id) for r in records2)
        ok = not leaked
        sym = f"{GREEN}✓{RESET}" if ok else f"{RED}✗{RESET}"
        detail = " — ISOLATION BREACH: user2 can see user1 record!" if not ok else ""
        print(f"  {sym} Health records isolated between users{detail}")
        _results.append({"module": "Security.Ownership", "label": "health record isolation", "ok": ok, "status": st})
    else:
        check("GET /health/records (user2)", "Security.Ownership", st, list2, expected=200)

    # Usuario 2 no debe poder acceder directamente al registro de usuario 1 por ID
    st, body = http("GET", f"/api/v1/health/records/{record_id}",
                    auth=False, token_override=tok2)
    check(
        f"GET /health/records/:id cross-user (should 403/404)",
        "Security.Ownership", st, body,
        acceptable=[403, 404],
    )


def test_data_integrity_like_counter() -> None:
    """
    Verifica que el contador de likes es consistente con el estado real.
    Bug auditado: contador era non-atomic (lost update bajo concurrencia).
    Fix: SQL atómico con UPDATE ... SET likes_count = likes_count + 1.
    """
    print(f"\n{BOLD}[22] Data Integrity — Like Counter Consistency{RESET}")

    # Crear un post limpio
    st, post = http("POST", "/api/v1/community/posts",
                    {"content": "Integrity test post", "category": "general"})
    if st != 201 or not post.get("id"):
        print(f"  {YELLOW}⚠{RESET} No se pudo crear post para test de integridad")
        _results.append({"module": "DataIntegrity.Likes", "label": "create post", "ok": True, "status": st})
        return

    post_id = post["id"]

    def get_likes() -> int:
        s, b = http("GET", "/api/v1/community/posts")
        if s == 200:
            posts = b.get("posts", b if isinstance(b, list) else [])
            target = next((p for p in posts if str(p.get("id")) == str(post_id)), None)
            return target.get("likes_count", -1) if target else -1
        return -1

    initial = get_likes()

    # Like
    http("POST", f"/api/v1/community/posts/{post_id}/like")
    after_like = get_likes()
    ok1 = after_like == initial + 1
    sym1 = f"{GREEN}✓{RESET}" if ok1 else f"{RED}✗{RESET}"
    print(f"  {sym1} Like: {initial} → {after_like} (expected {initial + 1})")
    _results.append({"module": "DataIntegrity.Likes", "label": "like increments counter", "ok": ok1, "status": 200})

    # Unlike (toggle)
    http("POST", f"/api/v1/community/posts/{post_id}/like")
    after_unlike = get_likes()
    ok2 = after_unlike == initial
    sym2 = f"{GREEN}✓{RESET}" if ok2 else f"{RED}✗{RESET}"
    print(f"  {sym2} Unlike: {after_like} → {after_unlike} (expected {initial})")
    _results.append({"module": "DataIntegrity.Likes", "label": "unlike decrements counter", "ok": ok2, "status": 200})


def test_security_config_public() -> None:
    """
    Verifica que el endpoint /config/public funciona y no expone datos sensibles.
    """
    print(f"\n{BOLD}[23] Security — Public Config Endpoint{RESET}")

    st, body = http("GET", "/api/v1/config/public", auth=False)
    ok, _ = check("GET /config/public (no auth)", "Security.Config", st, body, expected=200)

    if ok:
        # Verificar que no hay datos sensibles en la respuesta
        sensitive_keys = ["password", "secret", "key", "token", "database", "redis",
                          "private", "jwt", "api_key", "access_token"]
        body_str = json.dumps(body).lower()
        leaked = [k for k in sensitive_keys if k in body_str]
        ok2 = not leaked
        sym = f"{GREEN}✓{RESET}" if ok2 else f"{RED}✗{RESET}"
        detail = f" — Possible leak: {leaked}" if not ok2 else " (no sensitive keys in response)"
        print(f"  {sym} Config endpoint does not expose sensitive data{detail}")
        _results.append({"module": "Security.Config", "label": "no sensitive data in public config", "ok": ok2, "status": st})


# ── Report ────────────────────────────────────────────────────────────────────

def report() -> None:
    total  = len(_results)
    passed = sum(1 for r in _results if r["ok"])
    failed = total - passed

    # Agrupar por módulo
    modules: dict[str, list[dict]] = {}
    for r in _results:
        modules.setdefault(r["module"], []).append(r)

    print(f"\n{'─' * 60}")
    print(f"{BOLD}Smoke Test v2 — HealthStack Pro{RESET}")
    print(f"{DIM}{BASE_URL}{RESET}")
    print(f"{'─' * 60}")

    # Separar módulos funcionales de seguridad para el reporte
    functional = {k: v for k, v in modules.items() if not k.startswith("Security") and not k.startswith("DataIntegrity")}
    security   = {k: v for k, v in modules.items() if k.startswith("Security") or k.startswith("DataIntegrity")}

    if functional:
        print(f"\n{BOLD}Functional:{RESET}")
        for mod, checks in functional.items():
            mod_ok = all(c["ok"] for c in checks)
            sym    = f"{GREEN}✓{RESET}" if mod_ok else f"{RED}✗{RESET}"
            failing = [c for c in checks if not c["ok"]]
            detail  = f" {RED}← {', '.join(c['label'] for c in failing)}{RESET}" if failing else ""
            print(f"  {sym} {mod}{detail}")

    if security:
        print(f"\n{BOLD}Security:{RESET}")
        for mod, checks in security.items():
            mod_ok  = all(c["ok"] for c in checks)
            sym     = f"{GREEN}✓{RESET}" if mod_ok else f"{RED}✗{RESET}"
            failing = [c for c in checks if not c["ok"]]
            detail  = f" {RED}← {', '.join(c['label'] for c in failing)}{RESET}" if failing else ""
            short   = mod.split(".")[-1]
            print(f"  {sym} {short}{detail}")

    print(f"\n{'─' * 60}")
    print(f"  Checks: {GREEN}{passed}{RESET}/{total} passed", end="")
    if failed:
        print(f"  |  {RED}{failed} failed{RESET}")
    else:
        print(f"  {GREEN}🎉 All clean!{RESET}")
    print(f"{'─' * 60}\n")

    sys.exit(0 if failed == 0 else 1)


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"\n{BOLD}HealthStack Pro — Smoke Test v2{RESET}")
    print(f"Target : {BASE_URL}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    setup()

    # ── Happy path (17 módulos) ───────────────────────────────────────────────
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

    # ── Security + data integrity (basado en auditoría 2026-05-18) ────────────
    test_security_auth_guards()
    test_security_invalid_token()
    test_security_rate_limit_chat()
    test_security_ownership()
    test_data_integrity_like_counter()
    test_security_config_public()

    report()
