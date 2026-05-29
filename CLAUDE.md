# HealthStack Pro — Project Memory

> Este archivo se carga automáticamente en cada sesión de Claude Code.
> Actualízalo cuando cambien decisiones importantes o el estado del proyecto.

---

## HealthStack Frontend Design Agent

Skill dedicado para mejoras visuales del frontend. Cargado en `.claude/skills/healthstack-frontend/SKILL.md`.

**Cuándo usarlo**: cualquier tarea de UI/UX, CSS, componentes visuales, PWA polish, skeleton loaders, tipografía, spacing, animaciones.

**Para invocarlo**: el agente lee el skill file directamente con Read antes de cualquier cambio CSS.

**Token de diseño clave**: dark premium, gold `#c4a561` como ÚNICO acento, Inter font, base 4px spacing.

**Estado del sistema de diseño**:
- CSS v7 en `frontend/css/main.css` — SW **v79** — última actualización 2026-05-29
- **Fase 1** ✅ completada: brand consistency (161 refs cyan→gold), skeleton system, stat upgrades, card polish, safe-area iOS
- **Fase 2** ✅ completada: toast.js (showToast/showConfirm), chartDefaults.js, 10 módulos migrados de alert/confirm nativos, empty states, skeleton loaders JS, form input error/success states (setFieldState global)
- **Fase 3** ✅ completada: stat-change pill coloreado, XP bar gold shimmer animado, level badge glow pulsante, achievement badge hover, wl-ex-group-chip por grupo muscular, PR badge shimmer, exercise cards con chip de color y badge "última vez"
- **Fase 4** ✅ completada (parcial): window.haptic API + vibración en PR/set, offline indicator banner premium, Apple splash screens iOS
- **Pendiente Fase 4**: splash PNG files (requieren generación de imágenes), Badging API para workout activo
- **Fase 5** ✅ completada (2026-05-23): Modularización app.js → `js/dashboard/index.js` (window.Dashboard) + `js/pwa/index.js` (window.PWAManager). XSS fixes en adminUsers.js y planner.js. Chart update in-place. SW v56. Developer portal en `docs/dev/frontend.html`.
- **Fase 6** ✅ completada (2026-05-23): Phase 6 workout submodules QA pasado. Theme picker en Perfil (3 temas: Forge/Midnight/Aurora). SW v58.
- **Fase 7** ✅ completada (2026-05-23): Sección Entreno mejorada — dedup robusto de rutinas IA, `routineName` guardado en historial, historial compacto con filas expandibles (nombre·día·duración, click=detalles). SW v59.
- **Fase 8** ✅ completada (2026-05-29): Módulo A — InjuryManager en routineGenerator.js (lesiones crónicas, rutinas IA injury-aware). Módulo B — postWorkoutCoach.js + nextSessionPreloader.js (análisis post-entreno con IA, TTL 48h). SW v74.
- **MVP Beta Polish** ✅ completada (2026-05-29): feedbackWidget cargado + badge "beta", JS error ring buffer → localStorage + WhatsApp attachment, manifest icons/screenshots, dashboard first-run banner, Rutinas empty state, PATCH /api/v1/auth/me endpoint, display_name editable en Perfil, stats row (días + entrenos), toast bienvenida beta, avatar iniciales en Config, gamification hint para nuevos usuarios. SW v79.

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
- Rate limiting: slowapi + limits (in-memory Pi, Redis activo en Pi desde 2026-05-29)
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

**19 módulos — 11 production-ready, 4 WIP, 4 auxiliares:**

| Módulo            | Prefijo API                         | Auth          | Estado            | Tests |
|-------------------|-------------------------------------|---------------|-------------------|-------|
| identity          | `/api/v1/auth`                      | JWT RS256     | ✅ Production     | 17    |
| health            | `/api/v1/health`                    | JWT + AES-256 | ✅ Production     | 9     |
| nutrition         | `/api/v1/nutrition`                 | UUID local    | ✅ Production     | 9     |
| routines          | `/api/v1/routines`                  | JWT           | ✅ Production     | 6     |
| routines (injury) | `/api/v1/routines/injuries`         | JWT           | ✅ Production     | 5     |
| community         | `/api/v1/community`                 | JWT           | ✅ Production     | 6     |
| gamification      | `/api/v1/gamification`              | JWT           | ✅ Production     | 7     |
| ai_coach          | `/api/v1/ai-coach`                  | JWT + Groq    | ✅ Production     | 9     |
| ai_insights       | `/api/v1/ai-insights`               | JWT + Groq    | ✅ Production     | 10    |
| chat              | `/api/v1/chat`                      | Público       | ✅ Production     | 27    |
| telemetry         | `/api/v1/telemetry`                 | Público       | ✅ Production     | 6     |
| admin             | `/api/v1/admin`                     | JWT + admin   | ✅ Production     | 21    |
| geopricing        | `/api/geo-price`                    | Público       | ✅ Production     | —     |
| workout_sessions  | `/api/v1/workout`                   | JWT           | ✅ Production     | 17†   |
| post_workout_coach| `/api/v1/workout/post-workout-coach`| JWT + Groq    | ✅ Production     | 10    |
| ranked            | `/api/v1/ranked`                    | JWT           | ⚠️ WIP           | 3     |
| gym_servers       | `/api/v1/gym-servers`               | JWT           | ⚠️ WIP           | 4     |
| integrations      | `/api/v1/integrations`              | JWT           | ⚠️ WIP           | 0     |

†workout_sessions: 7 tests originales + 10 nuevos post-workout-coach = 17 tests.

**Issues conocidos por módulo WIP:**

`ranked`:
- `season = 1` hardcodeado (tabla RankedSeason existe pero nunca se consulta)
- `scope` city/national/global comparten implementación (todos llaman a `get_global_leaderboard`)
- `MAX_LP_PER_WEEK = 60` y `lp_week` nunca se aplican (código muerto)
- ✅ Usernames en leaderboard muestran `display_name` (resuelto 2026-05-18)

`gym_servers`:
- Sin `response_model` en 5 de 7 endpoints (no aparecen en OpenAPI)
- `GymChampionBadge` tabla huérfana (sin endpoints)
- Sin endpoint para descubrir gyms públicos ni para abandonar un gym
- Progreso de retos no se registra (`GymChallenge.contribution` nunca se actualiza)
- ✅ Sparring list devuelve `display_name` (resuelto 2026-05-18)

`integrations`:
- CSRF OAuth2 callback CORREGIDO 2026-05-17
- File size check en CSV CORREGIDO 2026-05-17
- Sin tests de ningún tipo
- Plataformas OAuth requieren client_id/secret en `.env` para funcionar

**IMPORTANTE — Nutrición usa localStorage UUID, no JWT.**
Las recetas se identifican por `user_local_id` (query param), no por token.

**IMPORTANTE — ai_coach + ai_insights + post_workout_coach usan `grok_api_key` (Groq, no xAI).**
Key `gsk_...` en `backend/.env`. Modelo: `llama-3.3-70b-versatile`.
Todos los endpoints tienen fallback graceful si la key no está configurada.
`@limiter.limit()` NO se puede usar con `Depends()` en FastAPI — usar rate limit global.

**RGPD — ai_insights + post_workout_coach ✅ RESUELTO:**
- `_build_anonymous_ai_context()` en ai_insights (3 endpoints)
- post_workout_coach: prompt NUNCA incluye user_id UUID, session_id UUID, email, ni display_name. Solo métricas numéricas y día de la semana.
- AIRouter hashea `user_id` con SHA-256 antes de loguearlo.

---

## RGPD / Pseudonimización (AEPD)

Los registros de salud NO se guardan con `user_id` directo.
Flujo: `user_id` → cifrado AES-256-GCM → `health_subject_id` → registros de salud.
Esto está en `identity/models.py` (campo `health_uuid_enc`) y `cryptoservice.py`.

Si se rota la MASTER_KEY hay que re-cifrar todos los `health_uuid_enc`. (TODO pendiente en `identity/models.py`)

---

## Tests — Estado actual

**172 tests totales** (auditados 2026-05-29).

```
tests/unit/                   21 tests
  test_security.py             9 tests  (JWT sign/decode, Argon2, tokens)
  test_scheduler.py            7 tests  (APScheduler jobs, lifecycle)
  test_ranked_service.py       5 tests  (tier index, LP boundaries)
  test_workout_service.py      5 tests  (Epley 1RM, PR detection, volumen)

tests/integration/
  test_auth.py                17 tests  ✅ completo
  test_admin.py               21 tests  ✅ completo
  test_health.py               9 tests  ✅ completo
  test_community.py            6 tests  ✅ completo
  test_gamification.py         7 tests  ✅ completo
  test_nutrition.py            9 tests  ✅ completo
  test_ai_coach.py             9 tests  ✅ completo
  test_ai_insights.py         10 tests  ✅ todos con RecorderAIRouter
  test_chat.py                27 tests  ✅ completo
  test_telemetry.py            6 tests  ✅ completo
  test_workout_sessions.py     7 tests  ✅ core cubierto
  test_injury_aware_routine.py 5 tests  ✅ nuevo (2026-05-29)
  test_post_workout_coach.py  10 tests  ✅ nuevo (2026-05-29) — incluye RGPD UUID check
  test_ranked.py               3 tests  ⚠️ mínimo
  test_gym_servers.py          4 tests  ⚠️ mínimo
  test_notifications.py        —        ❌ módulo no implementado — IGNORAR
  test_integrations.py         —        ❌ cero tests para OAuth2/sync/CSV
```

**Configuración crítica en `pytest.ini`:**
```ini
asyncio_mode = auto
asyncio_default_fixture_loop_scope = session
asyncio_default_test_loop_scope = session   ← sin esto asyncpg explota
```

**TRUNCATE_TABLES en conftest.py** incluye: `public.workout_ai_plans`, `public.user_chronic_injuries`.

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
| OAuth2 callback → ValueError siempre | `uuid.UUID(state)` con HMAC hex | `_verify_state()` real en service.py |
| CSV Apple Health OOM | `file.read()` completo antes de validar tamaño | `file.read(_MAX_CSV + 1)` |
| `routine_id: Optional[int]` en workout schema | ORM usa UUID, schema usaba int | Cambiado a `Optional[uuid.UUID]` |
| Bucle infinito landing → app | `auth-gate.js` no whitelistaba `?action=register` | Whitelist añadida + SW v15 |
| RGPD P0: ai_insights enviaba PII a IA | `get_weekly_goals` sin anonimización | `_build_anonymous_ai_context()` + test |
| Ranked leaderboard mostraba UUID | Sin JOIN con User | JOIN + `display_name` + regression test |
| Sparring list filtraba UUIDs | `get_sparrings` devolvía `user_id` raw | `display_name`; XSS escape frontend |
| 500 en móvil | nginx `map $is_mobile` + redirect a `/mobile/` inexistente | Eliminado `map`, `if`, `location /mobile/` de 3 configs |
| Cambio de idioma requería hard reload | `applyTranslations()` no actualiza JS-rendered | `setTimeout(() => location.reload(), 120)` |
| **502 crash loop en Pi** | Migración 0012 hacía `DROP INDEX` sobre UNIQUE CONSTRAINT | `ALTER TABLE DROP CONSTRAINT IF EXISTS uq_refresh_tokens_jti` (2026-05-29) |
| **Migration schema mismatch** | `source_session_id INTEGER NOT NULL FK` vs ORM `UUID nullable` | `UUID UNIQUE` nullable en migración 0015 (2026-05-29) |
| **Redis unhealthy en Pi** | `REDIS_PASSWORD` no definida en `.env.pi` | Variable añadida; Redis ✅ healthy (2026-05-29) |
| **AssertionError FastAPI 0.111** | `status_code=204` con response class → assert falla | `return Response(status_code=204)` en body, sin status en decorator (2026-05-29) |

---

## Infraestructura — Estado (2026-05-29)

| Item | Estado | Notas |
|------|--------|-------|
| Docker dev (`docker-compose.yml`) | ✅ Funcionando | — |
| Docker Pi (`docker-compose.pi.yml`) | ✅ Funcionando | Pi usa healthstack-pi-server version con Redis |
| Docker prod (`docker-compose.prod.yml`) | ⚠️ Definido | Sin dominio final configurado |
| `nginx/nginx.cloudflare.conf` | ✅ Activo en Pi | Sirve SPA + proxy al backend |
| CI/CD (GitHub Actions) | ✅ `.github/workflows/ci.yml` | tests + security scan + push a GHCR |
| Prometheus | ✅ Cableado en `main.py` | `/metrics` expuesto |
| Sentry | ✅ Cableado | Filtro PII activo (RGPD Art. 28) |
| Alembic migraciones | ✅ **6 migraciones** | HEAD: `c9d0e1f2a3b4` (injury_coach_tables) |
| Redis en Pi | ✅ **Healthy desde 2026-05-29** | `REDIS_PASSWORD` fijada en `.env.pi` |
| Service Worker | ✅ `healthstack-v80` | v80: MVP beta polish + quickstart + workout empty state (2026-05-29) |
| Cloudflare Tunnel | ✅ Quick Tunnel activo | URL aleatoria — necesita Named Tunnel para beta |

**Contenedores Pi activos (2026-05-29):**
- `healthstack_backend` — Up ✅
- `healthstack_postgres` — Up (healthy) ✅
- `healthstack_redis` — Up (healthy) ✅
- `healthstack_nginx` — Up ✅
- `healthstack_tunnel_quick` — Up ✅

**Crear BD test:** `docker exec healthstack_postgres psql -U postgres -c "CREATE DATABASE healthstack_test;"`

## ⚠️ INFRAESTRUCTURA — LEER ANTES DE CUALQUIER COMANDO

**El backend corre en una Raspberry Pi**, no en local. NUNCA pedir al usuario que ejecute migraciones, tests o comandos de servidor en su máquina Windows local.

### 🚀 DEPLOY — COMANDOS ACTUALES

```bash
# Deploy estándar (git pull + rebuild + up)
cd ~/health-stack
git pull
docker compose -f docker-compose.pi.yml --env-file .env.pi up -d --build backend

# Solo code change (sin cambios de deps — más rápido, ~9s vs ~500s)
git pull && docker compose -f docker-compose.pi.yml --env-file .env.pi up -d --build backend

# Migración manual
docker exec healthstack_backend alembic upgrade head

# Tests
docker exec healthstack_backend python -m pytest -v --tb=short

# Crear/elevar admin
docker exec healthstack_backend python -m scripts.create_admin
```

**Máquina local de Ruben (Windows)** = solo para editar código con Claude Code.

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
- La landing (`landing/src/hooks/useGeoPrice.ts`) consume el endpoint

---

## Planes de precios — Tier Free

**Decisión (2026-04-25):** Todas las funcionalidades actuales son **Free**.
En `landing/src/components/demo.tsx` → `PLAN_OK[0]` = todas `true`.

---

## Pendientes prioritarios

### 🔴 Acciones manuales (Ruben debe hacer esto — bloqueantes para beta)
1. **Cloudflare Named Tunnel** — sustituir Quick Tunnel por Named Tunnel con URL estable. Requiere token en `.env.pi` como `CLOUDFLARE_TUNNEL_TOKEN`.
2. **ALLOWED_ORIGINS** — añadir la URL estable de beta a `ALLOWED_ORIGINS` en `backend/.env` de la Pi. Ahora mismo permite cualquier origen (CORS abierto).
3. **Subir GitHub Secrets** — ejecutar `scripts\upload-secrets-to-github.ps1` tras `gh auth login`
4. **AdSense IDs** — rellenar `frontend/.env.adsense` con IDs reales antes de launch público

### 🟡 Trabajo de código (ordenado por impacto para beta)
5. **Tests integrations**: 0 tests para OAuth2/sync/CSV
6. **Ranked — temporadas reales**: `season = 1` hardcodeado
7. **Rotación de MASTER_KEY** — documentar procedimiento de re-cifrado
8. **gym_servers**: sin endpoint para descubrir gyms públicos

### ✅ Ya hecho (actualizado 2026-05-29)
- Módulo A: Injury-Aware Routine Generator ✅ (2026-05-29)
  - `user_chronic_injuries` tabla + 4 endpoints + InjuryManager frontend
  - AI routing injury-aware con fallback graceful
- Módulo B: Post-Workout AI Coach ✅ (2026-05-29)
  - `workout_ai_plans` tabla + 3 endpoints + postWorkoutCoach.js + nextSessionPreloader.js
  - Idempotente por session_id, TTL 48h, RGPD-safe
- Fix migration crash loop (uq_refresh_tokens_jti CONSTRAINT) ✅ (2026-05-29)
- Fix FastAPI 0.111 AssertionError en endpoint 204 ✅ (2026-05-29)
- Redis healthy en Pi ✅ (2026-05-29)
- CI/CD, Prometheus, ruff+mypy, Redis rate limiter ✅
- RGPD completo: ai_insights + post_workout_coach ✅
- Frontend Fases 1-8 ✅ SW v74
- **MVP Beta Polish** ✅ SW v80 (2026-05-29):
  - feedbackWidget.js cargado + badge "beta"
  - JS error ring buffer `hs_js_errors` → WhatsApp bug reports auto-attach
  - `window.onerror` + `onunhandledrejection` → `/api/v1/telemetry` via localStorage
  - PWA manifest: icons con purpose correcto + screenshots stub
  - Dashboard first-run banner (detect 0 weights + 0 TDEE → CTA)
  - Empty state Rutinas (`hs:routine-generated` → self-remove)
  - **PATCH `/api/v1/auth/me`** — editar display_name (schema + repo + router + 4 tests)
  - `API.updateMe()` en api.js
  - Perfil: display_name editable inline (pencil btn + form)
  - Perfil: stats row (días en app, total entrenos desde API)
  - Toast bienvenida "¡Bienvenido a HealthStack Pro Beta! 🎉" en registro
  - Avatar iniciales en Config Cuenta (`#config-account-avatar`)
  - Gamification hint card para usuarios con XP=0 (`.gami-hint-card`)
  - Workout logger: empty history hint (`.wl-history-empty`)
  - Dashboard: quick-start checklist 3 pasos (`#hs-quickstart`, `hs_workout_sessions_local` key)

### 🗒️ Smoke test (ejecutar en Pi)
```bash
cd ~/health-stack
python3 scripts/smoke_test.py https://TU-URL.trycloudflare.com
```

---

## 🗺️ Roadmap MVP Beta — Semana 2 Jun 2026

**Objetivo**: PWA estable con URL fija, lista para 5-10 betatesters el viernes 6 de junio.

### Día 1 — Lunes 2 Jun · Infraestructura estable

**Bloqueante #1: URL estable**
- [ ] Registrar Cloudflare Named Tunnel en Zero Trust dashboard
- [ ] Añadir `CLOUDFLARE_TUNNEL_TOKEN` a `.env.pi` en la Pi
- [ ] Cambiar perfil Docker de `quick` a `cloudflare` en el deploy
- [ ] Verificar que la URL no cambia al reiniciar el tunnel

**Bloqueante #2: CORS configurado**
- [ ] Añadir URL estable a `ALLOWED_ORIGINS` en `backend/.env`
- [ ] Reiniciar backend y verificar que login funciona desde la URL definitiva

**Bloqueante #3: PWA install verificado**
- [ ] Probar Add to Home Screen en iOS Safari (debe servir HTTPS — Cloudflare lo da)
- [ ] Probar install en Android Chrome
- [ ] Verificar que la app arranca en modo standalone sin barra de navegación

### Día 2 — Martes 3 Jun · Onboarding y first-run UX

- [x] **Pantalla de bienvenida first-run**: Dashboard first-run banner + gamification hint ✅
- [x] **Empty state Dashboard mejorado**: first-run banner con CTA ✅
- [x] **Empty state Entreno / Rutinas**: empty states con `window.createEmptyState()` ✅
- [x] **Perfil: campo avatar/alias visible**: display_name editable + avatar iniciales ✅

### Día 3 — Miércoles 4 Jun · QA end-to-end

- [ ] **Smoke test completo** con la URL definitiva: `python3 scripts/smoke_test.py https://URL-ESTABLE`
- [ ] **Test iOS Safari**: login, Add to Home Screen, abrir en standalone, registrar un entreno, cerrar app, reabrir (verificar sesión persistente)
- [ ] **Test Android Chrome**: mismo flujo
- [ ] **Test red lenta / offline**: desconectar WiFi, verificar que el offline banner aparece y la app no rompe
- [ ] **Fix de cualquier bug crítico** encontrado en los tests

### Día 4 — Jueves 5 Jun · Feedback loop y pulido

- [x] **Botón "Reportar bug"** en el menú de Perfil: feedbackWidget.js cargado, abre WhatsApp con contexto auto-adjunto ✅
- [x] **Logging de errores JS**: `window.onerror` + ring buffer localStorage → feedbackWidget auto-attach ✅
- [x] **Mensaje de bienvenida** en la primera sesión tras registro: toast "¡Bienvenido a HealthStack Pro Beta! 🎉" ✅
- [x] **Revisar PWA manifest**: icons purpose separado (any/maskable), screenshots stub añadido ✅

### Día 5 — Viernes 6 Jun · Launch beta

- [ ] **Smoke test final** desde un dispositivo externo (no la Pi)
- [ ] **Preparar invite**: email o mensaje con la URL, instrucciones de install (iOS/Android), y enlace al form de feedback
- [ ] **Invitar 5-10 betatesters** — empezar con gente de confianza que den feedback real
- [ ] **Monitoreo activo 24h**: `docker logs healthstack_backend -f` + alertas Sentry

### Métricas de éxito beta (fin de semana 1)

| Métrica | Objetivo |
|---------|----------|
| Betatesters instalaron la PWA | ≥ 5 |
| Entrenos registrados | ≥ 10 |
| Crashes JS reportados | 0 críticos |
| Login funciona en iOS | ✅ |
| Sesión persiste tras cerrar app | ✅ |

### Lo que NO es MVP beta (para después)

- Ranked / gym_servers completos
- Integrations OAuth2 (Garmin, Apple Health)
- AdSense activo
- Dominio propio (*.trycloudflare.com es suficiente para beta)
- Tests de integrations
- Visor anatómico rediseñado

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
    modules/routines/models.py     ← UserChronicInjury (añadido 2026-05-29)
    modules/workout_sessions/
      models.py                    ← WorkoutAIPlan (añadido 2026-05-29)
      post_workout_service.py      ← generate_post_workout_coaching
      post_workout_repository.py   ← PostWorkoutRepository
  tests/
    conftest.py                    ← Fixtures críticas
    pytest.ini                     ← asyncio_default_test_loop_scope = session
  alembic/versions/                ← 6 migraciones (HEAD: c9d0e1f2a3b4)
  requirements.txt                 ← pytest-asyncio==1.3.0 (no bajar de esta versión)
scripts/
  smoke_test.py                    ← Smoke test 17 módulos, sin deps, solo stdlib
frontend/                          ← SPA vanilla JS
  js/
    routineGenerator.js            ← InjuryManager integrado
    workout/
      postWorkoutCoach.js          ← Módulo B coach card
      nextSessionPreloader.js      ← Precarga plan tras workout
  sw.js                            ← SW v74
landing/                           ← React + Vite + Tailwind
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
