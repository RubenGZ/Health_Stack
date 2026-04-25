# HealthStack Pro — Project Memory

> Este archivo se carga automáticamente en cada sesión de Claude Code.
> Actualízalo cuando cambien decisiones importantes o el estado del proyecto.

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

**6 módulos implementados:**
| Módulo        | Descripción                        | Auth          |
|---------------|------------------------------------|---------------|
| identity      | Registro, login, refresh, perfil   | JWT RS256     |
| health        | Registros biométricos cifrados     | JWT + AES-256 |
| nutrition     | Recetas, ingredientes, suplementos | UUID local    |
| routines      | Rutinas de ejercicio               | JWT           |
| community     | Posts + likes                      | JWT           |
| gamification  | XP, niveles, racha                 | JWT           |

**IMPORTANTE — Nutrición usa localStorage UUID, no JWT.**
Las recetas se identifican por `user_local_id` (query param), no por token.

---

## RGPD / Pseudonimización (AEPD)

Los registros de salud NO se guardan con `user_id` directo.
Flujo: `user_id` → cifrado AES-256-GCM → `health_subject_id` → registros de salud.
Esto está en `identity/models.py` (campo `health_uuid_enc`) y `cryptoservice.py`.

Si se rota la MASTER_KEY hay que re-cifrar todos los `health_uuid_enc`. (TODO pendiente en `identity/models.py`)

---

## Tests — Estado actual

**52/52 pasando.** Última ejecución: 2026-04-21, 35s.

```
tests/unit/                    9 tests  (JWT, hashing)
tests/integration/
  test_auth.py                10 tests
  test_health.py               9 tests
  test_routines.py             6 tests
  test_community.py            6 tests
  test_gamification.py         7 tests
  test_nutrition.py            5 tests
```

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

---

## Infraestructura — Estado (2026-04-21)

| Item | Estado | Prioridad |
|------|--------|-----------|
| Docker dev (`docker-compose.yml`) | ✅ Funcionando | — |
| Docker prod (`docker-compose.prod.yml`) | ⚠️ Definido | — |
| `nginx/nginx.conf` | ❌ FALTA | CRÍTICO — prod no arranca sin él |
| CI/CD (GitHub Actions) | ❌ FALTA | CRÍTICO — cero automatización |
| Prometheus en `main.py` | ❌ No cableado | Alto — 3 líneas de trabajo |
| Sentry en `main.py` | ✅ Cableado | — |
| Alembic migraciones | ✅ 3 migraciones | — |
| Redis (rate limiting prod) | ⚠️ Configurado no activo | Medio |

**Contenedor PostgreSQL:** `healthstack_db`
**Crear BD test:** `docker exec healthstack_db psql -U postgres -c "CREATE DATABASE healthstack_test;"`

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

### Google AdSense ⚠️ ACCIÓN REQUERIDA ANTES DE PRODUCCIÓN
Integrado en `frontend/index.html`. Dos placements:
1. **Dashboard banner** — `#sponsor-banner` debajo de quick-actions, formato horizontal 100%×90px
2. **Footer ad** — `.footer-right`, tamaño 300×50px

**IMPORTANTE:** Antes de hacer deploy hay que reemplazar en `frontend/index.html`:
- `ca-pub-XXXXXXXXXXXXXXXX` (3 apariciones: 1 en `<script>` del `<head>` + 2 en `data-ad-client`) → Publisher ID real de AdSense
- `data-ad-slot="0987654321"` → Ad Unit ID del banner dashboard
- `data-ad-slot="1234567890"` → Ad Unit ID del footer
- Los ads NO se ven en localhost. Solo funcionan en el dominio aprobado por AdSense.

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

1. **GitHub Actions CI** — `.github/workflows/ci.yml` que corra los 52 tests en cada push
2. **Prometheus** — 3 líneas en `backend/app/main.py`:
   ```python
   from prometheus_fastapi_instrumentator import Instrumentator
   Instrumentator().instrument(app).expose(app)
   ```
3. **ruff + mypy** — añadir a `requirements.txt`, configurar en `pyproject.toml`
4. **Rotación de MASTER_KEY** — documentar procedimiento y automatizarlo
5. **TODO en `identity/router.py`** — revisar la nota de Fase 2 seguridad
6. **AdSense IDs** — reemplazar placeholders antes de producción (ver sección Monetización)

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
  alembic/versions/                ← 3 migraciones
  requirements.txt                 ← pytest-asyncio==1.3.0 (no bajar de esta versión)
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
