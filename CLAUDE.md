# HealthStack Pro — Project Memory

> Este archivo se carga automáticamente en cada sesión de Claude Code.
> Actualízalo cuando cambien decisiones importantes o el estado del proyecto.

---

## gstack

Instalado en `~/.claude/skills/gstack` (v1.33.2.0). Usa los skills de gstack para todas las tareas de ingeniería.

- Para navegación web usa siempre `/browse` — nunca usar `mcp__claude-in-chrome__*` directamente.
- Skills disponibles: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`

---

## Qué es esto

App de salud personal. Backend FastAPI + PostgreSQL. Dos frontends: una SPA en vanilla JS
(`frontend/`) y una landing en React/Vite (`landing/`).

**Stack:**
- Backend: FastAPI 0.111, SQLAlchemy 2.0 async, asyncpg, PostgreSQL 17
- Auth: JWT RS256 asimétrico (python-jose), Argon2 para passwords
- Cifrado: AES-256-GCM (cryptography) para notas de salud — cumple RGPD Art. 32
- Tests: pytest 8.3.1 + pytest-asyncio 1.3.0 (session-scoped event loop)
- Rate limiting: slowapi + limits (in-memory dev, Redis en prod)
- Observabilidad: Sentry (wired) + Prometheus (instalado, SIN cablear)

---

## Arquitectura — 4 capas por módulo

```
Router → Service → Repository → Model
```

Cada módulo en `backend/app/modules/<nombre>/`:
- `router.py` — endpoints FastAPI
- `service.py` — lógica de negocio
- `repository.py` — queries SQLAlchemy
- `models.py` — tablas ORM
- `schemas.py` — Pydantic in/out

**17 módulos — 10 production-ready, 4 WIP, 3 auxiliares:**

| Módulo            | Prefijo API              | Auth          | Estado            | Tests |
|-------------------|--------------------------|---------------|-------------------|-------|
| identity          | `/api/v1/auth`           | JWT RS256     | ✅ Production     | 17    |
| health            | `/api/v1/health`         | JWT + AES-256 | ✅ Production     | 9     |
| nutrition         | `/api/v1/nutrition`      | UUID local    | ✅ Production     | 9     |
| routines          | `/api/v1/routines`       | JWT           | ✅ Production     | 6     |
| community         | `/api/v1/community`      | JWT           | ✅ Production     | 6     |
| gamification      | `/api/v1/gamification`   | JWT           | ✅ Production     | 7     |
| ai_coach          | `/api/v1/ai-coach`       | JWT + Groq    | ✅ Production     | 9     |
| ai_insights       | `/api/v1/ai-insights`    | JWT + Groq    | ✅ Production*    | 10    |
| chat              | `/api/v1/chat`           | Público       | ✅ Production     | 27    |
| telemetry         | `/api/v1/telemetry`      | Público       | ✅ Production     | 6     |
| admin             | `/api/v1/admin`          | JWT + admin   | ✅ Production     | 21    |
| geopricing        | `/api/geo-price`         | Público       | ✅ Production     | —     |
| workout_sessions  | `/api/v1/workout`        | JWT           | ⚠️ WIP           | 7†    |
| ranked            | `/api/v1/ranked`         | JWT           | ⚠️ WIP           | 3     |
| gym_servers       | `/api/v1/gym-servers`    | JWT           | ⚠️ WIP           | 4     |
| integrations      | `/api/v1/integrations`   | JWT           | ⚠️ WIP           | 0     |

*ai_insights: 2 tests con mocks muertos (httpx en lugar de AIRouter) — validan fallback, no el path real.
†workout_sessions: `routine_id` era `Optional[int]` en schema vs `UUID` en ORM — corregido 2026-05-17.

**Issues conocidos por módulo WIP:**

`workout_sessions`:
- `streak_days: 0` hardcodeado → ranked LP bonus por racha nunca se activa
- `get_exercise_history`: Epley calcula sobre max_weight y max_reps por separado (can give wrong 1RM)

`ranked`:
- `season = 1` hardcodeado (tabla RankedSeason existe pero nunca se consulta)
- Leaderboard solo funciona con `scope=gym`; city/national/global devuelven [] vacío silencioso
- Usernames en leaderboard muestran fragmentos UUID, no `display_name`
- `MAX_LP_PER_WEEK = 60` y `lp_week` nunca se aplican (código muerto)

`gym_servers`:
- Sin `response_model` en 5 de 7 endpoints (no aparecen en OpenAPI)
- `GymChampionBadge` tabla huérfana (sin endpoints)
- Sin endpoint para descubrir gyms públicos ni para abandonar un gym
- Progreso de retos no se registra (`GymChallenge.contribution` nunca se actualiza)

`integrations`:
- CSRF OAuth2 callback CORREGIDO 2026-05-17 (antes hacía `uuid.UUID(state)` con un HMAC hex → siempre ValueError)
- File size check en CSV CORREGIDO 2026-05-17 (antes leía el fichero entero antes de validar → OOM)
- Sin tests de ningún tipo
- Plataformas OAuth requieren client_id/secret en `.env` para funcionar

**IMPORTANTE — Nutrición usa localStorage UUID, no JWT.**
Las recetas se identifican por `user_local_id` (query param), no por token.

**IMPORTANTE — ai_coach + ai_insights usan `grok_api_key` (Groq, no xAI).**
Key `gsk_...` en `backend/.env`. Modelo: `llama-3.3-70b-versatile`.
Todos los endpoints tienen fallback graceful si la key no está configurada.
`@limiter.limit()` NO se puede usar con `Depends()` en FastAPI — usar rate limit global.

**RGPD P0 pendiente — ai_insights:**
Datos biométricos reales (peso, fechas, composición corporal) se envían a proveedores
de IA free-tier sin anonimizar. Resolver antes de producción con usuarios reales: añadir
paso de anonimización en `ai_insights/service.py` antes de llamar a AIRouter.

---

## RGPD / Pseudonimización (AEPD)

Los registros de salud NO se guardan con `user_id` directo.
Flujo: `user_id` → cifrado AES-256-GCM → `health_subject_id` → registros de salud.
Esto está en `identity/models.py` (campo `health_uuid_enc`) y `cryptoservice.py`.

Si se rota la MASTER_KEY hay que re-cifrar todos los `health_uuid_enc`. (TODO pendiente en `identity/models.py`)

---

## Tests — Estado actual

**152 tests totales** (auditados 2026-05-17). Última ejecución conocida en Pi: 90 pasando + 27 chat nuevos.
Test suite completa incluye módulos WIP (ranked, gym, workout) con cobertura básica.

```
tests/unit/                   21 tests
  test_security.py             9 tests  (JWT sign/decode, Argon2, tokens)
  test_scheduler.py            7 tests  (APScheduler jobs, lifecycle)
  test_ranked_service.py       5 tests  (tier index, LP boundaries)
  test_workout_service.py      5 tests  (Epley 1RM, PR detection, volumen)

tests/integration/
  test_auth.py                17 tests  ✅ completo (register, login, refresh rotation, logout)
  test_admin.py               21 tests  ✅ completo (auth, stats, db explorer, users CRUD)
  test_health.py               9 tests  ✅ completo (CRUD, isolation, cifrado at rest)
  test_community.py            6 tests  ✅ completo (list, create, like toggle)
  test_gamification.py         7 tests  ✅ completo (state, actions, XP, 422 inválido)
  test_nutrition.py            9 tests  ✅ completo (ingredients, recipes, claim anon)
  test_ai_coach.py             9 tests  ✅ completo (fallback, mocked router, history)
  test_ai_insights.py         10 tests  ⚠️ 2 tests con mocks httpx muertos (no interceptan AIRouter)
  test_chat.py                27 tests  ✅ completo (contratos + 20 escenarios parametrizados)
  test_telemetry.py            6 tests  ✅ completo (anon, auth, admin, validación)
  test_workout_sessions.py     7 tests  ✅ core cubierto (create, PR, list, detail, history)
  test_ranked.py               3 tests  ⚠️ mínimo (profile, events, auth guard)
  test_gym_servers.py          4 tests  ⚠️ mínimo (create, list, join, auth guard)
  test_notifications.py        — tests  ❌ módulo notifications no implementado — IGNORAR
  test_integrations.py         — FALTA  ❌ cero tests para OAuth2, sync, CSV import
```

**Nota sobre `test_notifications.py`:** referencia un módulo que no existe. Los tests fallan con `OSError`. Ignorar hasta que el módulo se implemente.

**Configuración crítica en `pytest.ini`:**
```ini
asyncio_mode = auto
asyncio_default_fixture_loop_scope = session
asyncio_default_test_loop_scope = session   ← sin esto asyncpg explota
```

**Patrón de fixtures en `conftest.py`:**
- `event_loop` — scope session (compartido por fixtures Y tests)
- `test_engine` — scope session (una BD por suite)
- `db_session` — scope function (TRUNCATE en SETUP, no teardown)
- `client` — scope function (override get_db)
- `seed_ingredients` — scope session (inserta 1 vez)
- `reset_rate_limiter` — autouse (limpia slowapi entre tests)

**BD de test:** `postgresql+asyncpg://postgres:P%40ssw0rd@localhost:5432/healthstack_test`

---

## Bugs resueltos (no volver a estos)

| Bug | Causa | Fix |
|-----|-------|-----|
| `module 'app' has no attribute 'dependency_overrides'` | `import app.modules.*` sobreescribe variable `app` | `from app.main import app as fastapi_app` |
| `AESGCM.encrypt() got unexpected keyword 'aad'` | cryptography usa `associated_data` no `aad` | Cambiado en cryptoservice.py y health/service.py |
| `Future attached to a different loop` | pytest-asyncio 0.23.7 crea loops distintos | Upgrade a 1.3.0 + `asyncio_default_test_loop_scope = session` |
| Rate limit 429 entre tests | slowapi persiste contadores | `limiter._storage.reset()` en fixture autouse |
| GET /health/records/{id} → 405 | Endpoint no existía | Añadido en router.py + service.py |
| Gamification acción inválida → 200 | Service ignoraba acciones desconocidas | `Literal[...]` en `ActionRequest.action` |
| OAuth2 callback → ValueError siempre | `uuid.UUID(state)` con HMAC hex (64 chars, no UUID) | `_verify_state()` real en service.py; router usa `_verify_state` |
| CSV Apple Health OOM en archivos grandes | `file.read()` completo antes de validar tamaño | `file.read(_MAX_CSV + 1)` — lee máximo lo necesario |
| `routine_id: Optional[int]` en workout schema | ORM usa UUID, schema usaba int → insert fallaba | Cambiado a `Optional[uuid.UUID]` en schemas.py |
| Bucle infinito landing → app | `auth-gate.js` no whitelistaba `?action=register` | Whitelist añadida + `?v=2` cache-bust + SW bumped a v15 |

---

## Infraestructura — Estado (2026-05-17)

| Item | Estado | Notas |
|------|--------|-------|
| Docker dev (`docker-compose.yml`) | ✅ Funcionando | — |
| Docker Pi (`docker-compose.pi.yml`) | ✅ Funcionando | Frontend bind-mount (sin rebuild) |
| Docker prod (`docker-compose.prod.yml`) | ⚠️ Definido | Sin dominio final configurado |
| `nginx/nginx.conf` | ✅ Existe | Sirve SPA + proxy al backend |
| CI/CD (GitHub Actions) | ✅ `.github/workflows/ci.yml` | tests + security scan + push a GHCR |
| Prometheus | ✅ Cableado en `main.py` | `/metrics` expuesto |
| Sentry | ✅ Cableado | Filtro PII activo (RGPD Art. 28) |
| Alembic migraciones | ✅ 4 migraciones | Última: `ai_insights_cache` (d4e5f6a7b8c0) |
| Redis (rate limiting prod) | ⚠️ Configurado no activo | En Pi usa in-memory (Redis unhealthy en Pi) |
| Service Worker | ✅ `healthstack-v15` | Bumped para limpiar cache de auth-gate.js roto |

**Contenedor PostgreSQL:** `healthstack_db`
**Crear BD test:** `docker exec healthstack_db psql -U postgres -c "CREATE DATABASE healthstack_test;"`

## ⚠️ INFRAESTRUCTURA — LEER ANTES DE CUALQUIER COMANDO

**El backend corre en una Raspberry Pi**, no en local. NUNCA pedir al usuario que ejecute migraciones, tests o comandos de servidor en su máquina Windows local.

### 🚀 DEPLOY — SIEMPRE USAR ESTE COMANDO (nunca docker compose up suelto)

```bash
bash ~/healthstack-pi-server/scripts/update.sh
```

**Comandos puntuales en el Pi** (vía SSH o docker exec):
```bash
# Migración
docker exec healthstack_backend alembic upgrade head

# Tests
docker exec healthstack_backend python -m pytest -v --tb=short

# Crear/elevar admin
docker exec healthstack_backend python -m scripts.create_admin
```

**Máquina local de Ruben (Windows)** = solo para editar código con Claude Code. No tiene PostgreSQL ni venv funcional para el proyecto.

---

## Launcher de tests

```
TESTS.bat          ← doble clic en Windows
test_launcher.py   ← el script Python

# CLI rápido:
python test_launcher.py all
python test_launcher.py auth | health | nutrition | ...
python test_launcher.py failed
python test_launcher.py status
```

---

## Monetización — Estado (2026-04-25)

### Google AdSense ⚠️ CONFIGURAR ANTES DE PRODUCCIÓN
IDs reales en `frontend/.env.adsense` (gitignored). Para aplicar:
- `scripts/apply-adsense.ps1` — parchea index.html con IDs reales
- `scripts/revert-adsense.ps1` — revierte a placeholders antes de git commit

### Geo-pricing — `/api/geo-price` ✅
Módulo en `backend/app/modules/geopricing/router.py`. Endpoint público (sin JWT).
- Detecta país por IP → devuelve moneda + precios localizados
- Cache en memoria 10 min, max 5000 IPs
- Monedas: CHF, GBP, PLN, AUD, EUR (default)
- La landing (`landing/src/hooks/useGeoPrice.ts`) consume el endpoint y muestra precios dinámicos

---

## Planes de precios — Tier Free

**Decisión (2026-04-25):** Todas las funcionalidades actuales son **Free**.
En `landing/src/components/demo.tsx` → `PLAN_OK[0]` = todas `true`.
Si se añaden features premium futuras, se agregan como índice 4+ en PLAN_OK.

---

## Pendientes prioritarios

### 🔴 Acciones manuales pendientes (Ruben debe hacer esto)
1. **Subir GitHub Secrets** — ejecutar `scripts\upload-secrets-to-github.ps1` tras `gh auth login`
2. **AdSense IDs** — rellenar `frontend/.env.adsense` con Publisher ID + Ad Unit IDs reales de Google AdSense, luego `scripts\apply-adsense.ps1` antes de cada deploy
3. **Rellenar `.env.production.local`** — `DATABASE_URL` con password real + `ALLOWED_ORIGINS` con dominio de prod
4. **Redis en Pi** — contenedor `healthstack_redis` unhealthy (ver logs para diagnóstico)

### 🟡 Trabajo de código pendiente (ordenado por impacto)
5. **RGPD P0 — ai_insights**: anonimizar datos biométricos antes de enviar a IA free-tier
6. **Tests integrations**: 0 tests para OAuth2/sync/CSV — módulo completamente sin cobertura
7. **Ranked — leaderboard completo**: city/national/global devuelven [] vacío (solo gym funciona)
8. **Ranked — temporadas reales**: `season = 1` hardcodeado, `RankedSeason` inerte
9. **workout_sessions — streak real**: conectar racha de gamification para LP ranked
10. **ai_insights tests**: migrar 2 mocks httpx muertos a `app.state.ai_router` (como hace ai_coach)
11. **Rotación de MASTER_KEY** — documentar procedimiento de re-cifrado
12. **Visor anatómico** — rediseño disruptivo y profesional (brainstorming pendiente)
13. **Fórmula IMC mejorada** — mejorar cálculo y visualización en la interfaz

### ✅ Ya hecho (actualizado 2026-05-17)
- CI/CD: `.github/workflows/ci.yml` con tests + security scan + push a GHCR ✅
- Prometheus: cableado en `main.py` ✅
- ruff + mypy: configurados en `pyproject.toml` ✅
- Redis rate limiter: `storage_uri` condicional por URL ✅
- CSRF Google OAuth: cookie httpOnly + compare_digest ✅
- ALLOWED_ORIGINS guard en startup ✅
- RSA 2048 + MASTER_KEY generadas en `backend/.env.production.local` ✅
- Chat Bloque E: context injection + auth gate SPA + 27 tests ✅
- AI Insights cache DB: tabla `ai_insights_cache`, TTL 6h/24h, +1 test caché ✅
- Auth-gate bridge fix: whitelist `?action=register|login` + SW v15 cache-bust ✅
- workout_sessions `routine_id` type bug corregido: `int` → `UUID` ✅
- Integrations OAuth2 CSRF callback corregido: `_verify_state()` real ✅
- Integrations CSV OOM fix: `file.read(_MAX_CSV + 1)` ✅
- Smoke test script: `scripts/smoke_test.py` — cubre 17 módulos, sin deps externas ✅

### 🗒️ Smoke test (ejecutar en Pi)
```bash
cd ~/health-stack
python3 scripts/smoke_test.py https://TU-URL.trycloudflare.com
```

---

## Rutas clave

```
backend/
  app/
    main.py                        ← FastAPI app, routers, middleware, Sentry
    session.py                     ← get_db dependency
    core/
      config.py                    ← Settings (pydantic-settings)
      security/
        cryptoservice.py           ← AES-256-GCM, associated_data (no aad)
        jwt_handler.py             ← RS256 sign/verify
        hashing.py                 ← Argon2
    modules/<modulo>/
      router.py / service.py / repository.py / models.py / schemas.py
  tests/
    conftest.py                    ← Fixtures críticas
    pytest.ini                     ← asyncio_default_test_loop_scope = session
  alembic/versions/                ← 4 migraciones (última: ai_insights_cache)
  requirements.txt                 ← pytest-asyncio==1.3.0 (no bajar de esta versión)
scripts/
  smoke_test.py                    ← Smoke test 17 módulos, sin deps, solo stdlib
frontend/                          ← SPA vanilla JS (puerto 3000)
landing/                           ← React + Vite + Tailwind (puerto 5174)
ARCHITECTURE.md                    ← Documentación high-level completa
TESTS.bat                          ← Launcher Windows
```

---

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.

Key routing rules:
- Bugs, errores, "por qué falla" → invoke `gstack:investigate`
- Deploy, push, crear PR → invoke `gstack:ship`
- QA, probar la app → invoke `gstack:qa`
- Code review → invoke `gstack:review`
- Diseño visual → invoke `gstack:design-review`
- Arquitectura → invoke `engineering:architecture`
- Estado general del código → invoke `gstack:health`
- Retrospectiva → invoke `gstack:retro`
- Planificación → invoke `gstack:investigate` o `engineering:system-design`
