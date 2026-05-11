# HealthStack Pro — Arquitectura del Backend

> **Versión 2.0** · FastAPI + SQLAlchemy 2.0 async + PostgreSQL 17  
> **Estado**: 52/52 tests pasando · Cumplimiento AEPD/RGPD

---

## Tabla de contenidos

1. [Visión general](#1-visión-general)
2. [Estructura de carpetas](#2-estructura-de-carpetas)
3. [Capas de la aplicación](#3-capas-de-la-aplicación)
4. [Módulos de dominio](#4-módulos-de-dominio)
5. [Seguridad y seudonimización AEPD](#5-seguridad-y-seudonimización-aepd)
6. [Base de datos](#6-base-de-datos)
7. [Ciclo de vida de una petición HTTP](#7-ciclo-de-vida-de-una-petición-http)
8. [Tests](#8-tests)
9. [Configuración y despliegue](#9-configuración-y-despliegue)

---

## 1. Visión general

HealthStack Pro es una API REST para una plataforma de fitness y salud. Su diseño central es la **separación criptográfica** entre identidad del usuario y datos biométricos, cumpliendo el Art. 25 RGPD (Privacy by Design) y las guías de la AEPD sobre seudonimización.

```
Cliente (React/JS)
        │ HTTPS + JWT RS256
        ▼
┌─────────────────────────────────────────────────────┐
│                  FastAPI (ASGI / uvicorn)            │
│                                                     │
│  ┌─────────┐ ┌────────┐ ┌────────┐ ┌────────────┐  │
│  │ Identity│ │ Health │ │Routine │ │ Community  │  │
│  │ Module  │ │ Module │ │ Module │ │   Module   │  │
│  └────┬────┘ └───┬────┘ └───┬────┘ └─────┬──────┘  │
│       │          │          │             │          │
│  ┌────▼──────────▼──────────▼─────────────▼──────┐  │
│  │            SQLAlchemy 2.0 async               │  │
│  └────────────────────────┬──────────────────────┘  │
│                           │ asyncpg                  │
└───────────────────────────┼─────────────────────────┘
                            │
                ┌───────────▼───────────┐
                │    PostgreSQL 17       │
                │  schema: public        │
                │  schema: health        │
                └───────────────────────┘
```

### Principios de diseño

| Principio | Implementación |
|-----------|---------------|
| Privacy by Design | Datos de identidad y de salud en schemas separados, vinculados solo por ciphertext AES-256-GCM |
| Fail-fast | La app no arranca si falta `HEALTH_LINK_MASTER_KEY` |
| Separación de capas | Router → Service → Repository → Model (sin saltar capas) |
| Sin magia ORM | Las consultas críticas usan SQL explícito para auditabilidad |
| Async-first | Todo el stack es 100% asíncrono (asyncio + asyncpg) |

---

## 2. Estructura de carpetas

```
backend/
├── app/
│   ├── main.py                  # Punto de entrada: FastAPI, middlewares, routers
│   ├── session.py               # Fábrica de sesiones SQLAlchemy
│   ├── core/
│   │   ├── config.py            # Settings desde variables de entorno (pydantic-settings)
│   │   └── security/
│   │       ├── cryptoservice.py # AES-256-GCM para la llave de cruce
│   │       ├── dependencies.py  # FastAPI Depends: CurrentUser, get_current_user
│   │       ├── hashing.py       # Argon2id para contraseñas
│   │       └── jwt_handler.py   # RS256: create_access_token, decode_token
│   ├── modules/
│   │   ├── identity/            # Auth: registro, login, JWT
│   │   ├── health/              # Registros biométricos cifrados
│   │   ├── routines/            # Rutinas de entrenamiento guardadas
│   │   ├── community/           # Posts y likes públicos
│   │   ├── gamification/        # XP, niveles, streaks
│   │   └── nutrition/           # Suplementos, ingredientes, recetas
│   └── shared/
│       ├── base_model.py        # Base, UUIDPrimaryKeyMixin, TimestampMixin
│       └── exceptions.py        # Excepciones de dominio (→ HTTP codes en main.py)
├── tests/
│   ├── conftest.py              # Fixtures compartidos: engine, session, client
│   ├── unit/
│   │   └── test_security.py     # JWT + hashing (sin BD)
│   └── integration/
│       ├── test_auth.py
│       ├── test_health.py
│       ├── test_routines.py
│       ├── test_community.py
│       ├── test_gamification.py
│       └── test_nutrition.py
├── alembic/                     # Migraciones de BD
├── Dockerfile
├── requirements.txt
└── pytest.ini
```

Cada módulo en `app/modules/` tiene la misma estructura interna:

```
módulo/
├── models.py       # SQLAlchemy ORM (tablas)
├── schemas.py      # Pydantic v2 (validación entrada/salida)
├── repository.py   # Acceso a BD (solo SQL, sin lógica)
├── service.py      # Lógica de negocio
└── router.py       # Endpoints HTTP (solo HTTP, sin lógica)
```

---

## 3. Capas de la aplicación

### 3.1 Router (capa HTTP)

- Recibe la petición HTTP, extrae parámetros y body
- Valida el body contra el schema Pydantic (automático por FastAPI)
- Llama al servicio correspondiente
- Devuelve la respuesta HTTP

```python
@router.post("/records", response_model=HealthRecordResponse, status_code=201)
async def create_record(body: HealthRecordCreate, db: DBSession, current_user: CurrentUser, crypto: CryptoDep):
    return await HealthService.create_record(db=db, user_id=current_user["user_id"], data=body, crypto=crypto)
```

El router **no contiene lógica de negocio**. Si la respuesta requiere transformación, eso ocurre en el servicio.

### 3.2 Service (capa de negocio)

- Orquesta los repositorios
- Aplica reglas de negocio (unicidad por fecha, validación semántica)
- Cifra/descifra datos sensibles usando `CryptoService`
- Lanza excepciones de dominio (no excepciones HTTP)

```python
class HealthService:
    @staticmethod
    async def create_record(db, user_id, data, crypto):
        subject_id = await crypto.resolve_health_subject_id(user_id, db)  # seudonimización
        existing = await HealthRepository.get_by_date(db, subject_id, data.recorded_date)
        if existing:
            raise DuplicateHealthRecordError(...)  # dominio, no HTTP
        # ...
```

### 3.3 Repository (capa de acceso a datos)

- Solo SQL/ORM, sin lógica de negocio
- Recibe y devuelve objetos del modelo ORM
- Maneja `flush()` y `commit()` cuando es necesario

```python
class HealthRepository:
    @staticmethod
    async def create(db, health_subject_id, recorded_date, **kwargs):
        record = HealthRecord(health_subject_id=health_subject_id, recorded_date=recorded_date, **kwargs)
        db.add(record)
        await db.flush()
        return record
```

### 3.4 Excepciones de dominio → HTTP

Las excepciones de dominio se mapean a códigos HTTP en `main.py`:

```python
@app.exception_handler(UserAlreadyExistsError)
async def handler(request, exc):
    return JSONResponse(status_code=409, content={"detail": exc.message})
```

Esto mantiene los servicios desacoplados de HTTP, lo que facilita el testing.

---

## 4. Módulos de dominio

### 4.1 Identity (Autenticación)

**Endpoints**: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/refresh`

**Tablas**: `public.users`, `public.data_links`

**Flujo de registro**:
```
1. Validar email único
2. Hash de contraseña con Argon2id
3. Crear usuario en public.users
4. Generar health_subject_id (UUID aleatorio, NO relacionado con user.id)
5. Cifrar health_subject_id con AES-256-GCM → guardar en public.data_links
6. Emitir access_token (15 min) + refresh_token (7 días) RS256
```

**Flujo de login**:
```
1. Buscar usuario por email
2. Verificar contraseña con Argon2id (timing-safe)
3. Emitir tokens JWT
4. Actualizar last_login_at
```

**Seguridad**:
- Rate limit: 3 registros/hora por IP, 5 logins/minuto por IP
- Mensaje de error genérico en login (evita user enumeration)
- JWT RS256: clave privada firma, clave pública verifica

### 4.2 Health (Registros biométricos)

**Endpoints**: `GET/POST /api/v1/health/records`, `GET/PATCH/DELETE /api/v1/health/records/{id}`

**Tabla**: `health.health_records`

**Campos biométricos**: `weight_kg`, `height_cm`, `body_fat_pct`, `muscle_mass_kg`, `waist_cm`, `resting_heart_rate`, `sleep_hours`

**Cifrado de notas**: Las notas personales se cifran con AES-256-GCM antes de persistir y se descifran al leer. El campo en BD es `notes_encrypted`, nunca se expone al cliente. La clave es `HEALTH_LINK_MASTER_KEY`.

**Seudonimización**: Los registros se vinculan al usuario mediante `health_subject_id` (un UUID opaco sin relación con `user.id`). El vínculo real está en `data_links` cifrado. Incluso con acceso directo a la BD de salud, no es posible identificar al propietario sin la `MASTER_KEY`.

**Unicidad por fecha**: Solo puede existir un registro por `(health_subject_id, recorded_date)`. Intentar crear un segundo registro para la misma fecha devuelve 409 — el cliente debe hacer PATCH.

### 4.3 Routines (Rutinas de entrenamiento)

**Endpoints**: `GET/POST /api/v1/routines`, `DELETE /api/v1/routines/{id}`

**Tabla**: `public.saved_routines`

Permite guardar rutinas de entrenamiento predefinidas del catálogo del frontend. Cada rutina pertenece a un usuario (FK a `users.id`). Sin datos de salud — tabla en schema `public`.

### 4.4 Community (Red social fitness)

**Endpoints**: `GET /api/v1/community/posts` (público), `POST /api/v1/community/posts` (auth), `POST /api/v1/community/posts/{id}/like` (auth)

**Tablas**: `public.community_posts`, `public.community_likes`

- El listado de posts es **público** (sin JWT) pero detecta los likes del usuario si hay token
- El toggle like es idempotente: POST dos veces quita el like
- El response incluye `liked_by_me: bool` calculado en la consulta

### 4.5 Gamification (XP y niveles)

**Endpoints**: `GET /api/v1/gamification/state`, `POST /api/v1/gamification/action`

**Tabla**: `public.gamification_states`

**Acciones válidas**: `weight`, `tdee`, `routine`, `post`, `recipe`, `streak`

Cada acción otorga XP según una tabla fija. El nivel se calcula en función del XP total (100 XP por nivel, ajustable). El response incluye `xp_total`, `level`, `xp_to_next_level`, `level_progress_pct` y contadores individuales por tipo de acción.

Las acciones inválidas se rechazan con 422 (validación Pydantic con `Literal`).

### 4.6 Nutrition (Nutrición)

**Endpoints**: 
- `GET /api/v1/nutrition/supplements` (público)
- `GET /api/v1/nutrition/ingredients` (público)
- `POST /api/v1/nutrition/recipes` (anónimo — por `user_local_id`)
- `GET /api/v1/nutrition/recipes?local_id=X` (anónimo)

**Tablas**: `public.supplements`, `public.ingredients`, `public.user_recipes`

**Diseño especial**: Las recetas NO usan JWT — se identifican por un UUID de localStorage del cliente (`user_local_id`). Esto permite guardar recetas sin cuenta. El cálculo de macros totales se hace en el servidor validando cada ingrediente contra el catálogo.

---

## 5. Seguridad y seudonimización AEPD

### 5.1 Modelo de seudonimización

```
┌────────────────┐         ┌─────────────────────────────┐
│  public.users  │         │     public.data_links        │
│                │         │                              │
│  id (UUID)     │──(1:1)──│  user_id → users.id          │
│  email         │         │  health_uuid_enc             │
│  password_hash │         │    = AES-256-GCM(            │
│  display_name  │         │        health_subject_id     │
└────────────────┘         │      )                       │
         Identidad         └──────────────────────────────┘
                                      │ decrypt (MASTER_KEY)
                                      ▼
                           ┌──────────────────────────────┐
                           │   health.health_records       │
                           │                              │
                           │  health_subject_id (UUID)    │
                           │  weight_kg, height_cm...     │
                           │  notes_encrypted             │
                           └──────────────────────────────┘
                                      Biometría
```

**Escenarios de ataque mitigados**:
- Exfiltración de `health_records` → solo UUIDs sin contexto
- Exfiltración de `data_links` → ciphertext sin la MASTER_KEY
- Necesita: BD + MASTER_KEY (que no está en BD, solo en entorno)

### 5.2 CryptoService

`app/core/security/cryptoservice.py` es el **único componente** que puede resolver la vinculación usuario↔datos de salud.

```python
# Cifrado de la llave de cruce
nonce = os.urandom(12)  # 96 bits aleatorios — único por operación
ct_with_tag = aesgcm.encrypt(nonce, health_subject_id.encode(), associated_data=AAD)
stored = f"{nonce.hex()}:{tag.hex()}:{ct.hex()}"

# Descifrado
plaintext = aesgcm.decrypt(nonce, ct + tag, associated_data=AAD)
```

- **Algoritmo**: AES-256-GCM (NIST SP 800-38D)
- **AAD**: `b"healthstack.health_link.v1"` — vincula el ciphertext a su contexto
- **Formato**: `"<nonce_hex>:<tag_hex>:<ct_hex>"` — legible para auditoría forense

### 5.3 JWT RS256

- **Access token**: 15 minutos, claims: `sub`, `email`, `role`, `jti`, `type: access`
- **Refresh token**: 7 días, claims: `sub`, `jti`, `type: refresh`
- **Clave privada**: `RSA_PRIVATE_KEY` (PEM en variable de entorno)
- **Clave pública**: `RSA_PUBLIC_KEY` (PEM en variable de entorno)

La asimetría RS256 permite verificar tokens en servicios externos sin exponer la clave de firma.

### 5.4 Argon2id

Hashing de contraseñas con Argon2id (ganador PHC 2015):
- Resistente a ataques de hardware (GPU/ASIC) por su uso de memoria
- Parámetros por defecto de `argon2-cffi`: time_cost=2, memory_cost=65536, parallelism=2
- El hash incluye salt embebido (`$argon2id$v=19$...`)

### 5.5 Rate Limiting

Usando `slowapi` (wrapper de `limits` para FastAPI):
- `POST /register`: 3/hora por IP (anti-spam)
- `POST /login`: 5/minuto por IP (anti-fuerza-bruta, OWASP A07)
- Superado el límite → HTTP 429 con cabecera `Retry-After`
- En producción configurar `storage_uri="redis://..."` para estado compartido entre workers

---

## 6. Base de datos

### 6.1 Schemas PostgreSQL

| Schema | Propósito | Tablas |
|--------|-----------|--------|
| `public` | Datos de identidad y funcionales | `users`, `data_links`, `saved_routines`, `community_posts`, `community_likes`, `gamification_states`, `supplements`, `ingredients`, `user_recipes` |
| `health` | Datos biométricos (Art. 9 RGPD) | `health_records` |

La separación en schemas permite aplicar políticas de acceso diferenciadas a nivel de BD (roles PostgreSQL).

### 6.2 Modelos clave

```sql
-- public.users: solo identidad
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name VARCHAR(100),
    role VARCHAR(20) DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    consent_gdpr BOOLEAN NOT NULL DEFAULT false,
    consent_date TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- public.data_links: llave de cruce cifrada
CREATE TABLE public.data_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    health_uuid_enc TEXT NOT NULL,  -- AES-256-GCM payload
    rotated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- health.health_records: datos biométricos seudonimizados
CREATE TABLE health.health_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    health_subject_id UUID NOT NULL,  -- NO FK a users (seudonimización)
    recorded_date DATE NOT NULL,
    weight_kg NUMERIC(5,2),
    height_cm NUMERIC(5,1),
    body_fat_pct NUMERIC(4,1),
    muscle_mass_kg NUMERIC(5,2),
    waist_cm NUMERIC(5,1),
    resting_heart_rate INTEGER,
    sleep_hours NUMERIC(4,2),
    notes_encrypted TEXT,             -- AES-256-GCM de notas personales
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(health_subject_id, recorded_date)  -- un registro por día
);
```

### 6.3 Sesión SQLAlchemy

`app/session.py` define:
- `AsyncEngine`: instancia global del motor asyncpg
- `AsyncSessionLocal`: fábrica de sesiones
- `get_db()`: generador async para FastAPI `Depends()`
- `DBSession = Annotated[AsyncSession, Depends(get_db)]`: tipo reutilizable

```python
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
```

### 6.4 Migraciones (Alembic)

Las migraciones en `alembic/versions/` son el único lugar donde se modifica el esquema de BD. En Docker, el comando de arranque ejecuta `alembic upgrade head` antes de lanzar uvicorn.

---

## 7. Ciclo de vida de una petición HTTP

Ejemplo: `POST /api/v1/health/records`

```
1. Cliente envía: POST /api/v1/health/records
   Headers: Authorization: Bearer <access_token>
   Body: {"recorded_date": "2026-04-20", "weight_kg": 75.5, "notes": "Peso en ayunas"}

2. SlowAPIMiddleware: verifica rate limit global (200/min)

3. CORSMiddleware: valida origin (solo dev)

4. FastAPI routing: match → create_record()

5. Dependency injection:
   - DBSession: abre sesión SQLAlchemy
   - CurrentUser: decode JWT → {"user_id": "abc-123", "email": "...", "role": "user"}
   - CryptoDep: instancia CryptoService con MASTER_KEY

6. Pydantic valida body → HealthRecordCreate(recorded_date=date(2026,4,20), weight_kg=75.5, notes="...")

7. HealthService.create_record():
   a. crypto.resolve_health_subject_id(user_id, db)
      → DataLinkRepository.get_by_user_id(db, user_id)
      → AES-256-GCM decrypt(health_uuid_enc) → health_subject_id = "xyz-789"
   b. HealthRepository.get_by_date(db, "xyz-789", date(2026,4,20))
      → None (no existe)
   c. _encrypt_notes("Peso en ayunas") → "nonce:tag:ct" (AES-256-GCM)
   d. HealthRepository.create(db, health_subject_id="xyz-789", recorded_date=..., weight_kg=75.5, notes_encrypted="nonce:tag:ct")
      → db.flush() → registro en BD con id="def-456"
   e. return HealthRecordResponse(id="def-456", weight_kg=75.5, notes="Peso en ayunas", ...)

8. FastAPI serializa response con Pydantic → JSON

9. HTTP 201 Created
   Body: {"id": "def-456", "recorded_date": "2026-04-20", "weight_kg": 75.5, "notes": "Peso en ayunas", ...}
```

---

## 8. Tests

### 8.1 Arquitectura de tests

```
pytest (asyncio_mode=auto, session-scoped event loop)
    │
    ├── conftest.py
    │   ├── test_engine (session) → PostgreSQL healthstack_test
    │   ├── db_session (function) → TRUNCATE antes de cada test
    │   ├── reset_rate_limiter (autouse) → limpia slowapi storage
    │   ├── client (function) → AsyncClient + dependency override
    │   ├── registered_user → POST /register
    │   ├── auth_headers → Bearer token
    │   └── seed_ingredients (session) → 2 ingredientes de referencia
    │
    ├── tests/unit/
    │   └── test_security.py (9 tests, sin BD)
    │       ├── TestJWT: create/decode, JTI único, token inválido, token manipulado
    │       └── TestHashing: verify, wrong pass, hash format, salt único
    │
    └── tests/integration/ (43 tests, con BD)
        ├── test_auth.py     (10) — registro, login, /me, refresh
        ├── test_health.py    (9) — CRUD biométrico + cifrado de notas
        ├── test_routines.py  (6) — CRUD rutinas + auth guard
        ├── test_community.py (6) — posts públicos + likes toggle
        ├── test_gamification.py (7) — XP, niveles, acciones válidas/inválidas
        └── test_nutrition.py (5) — suplementos, ingredientes, recetas
```

### 8.2 Aislamiento entre tests

- **TRUNCATE CASCADE** antes de cada test (en setup del fixture `db_session`)
- Las tablas de referencia (`ingredients`, `supplements`) no se truncan
- El rate limiter se resetea antes de cada test (`limiter._storage.reset()`)
- Cada test tiene su propio `db_session` → sin contaminación entre tests

### 8.3 Configuración clave (`pytest.ini`)

```ini
asyncio_mode = auto
asyncio_default_fixture_loop_scope = session  # fixtures en el loop de sesión
asyncio_default_test_loop_scope = session     # tests también en el loop de sesión
```

El uso de `session` scope para ambos evita el error `"Future attached to a different loop"` que ocurre con asyncpg cuando fixtures de sesión y tests de función usan event loops distintos.

### 8.4 Ejecutar tests

```bash
# Desde backend/
pytest tests/ -v                    # Todos (52 tests)
pytest tests/unit/ -v               # Solo unitarios (sin BD)
pytest tests/integration/ -v        # Solo integración
pytest tests/ -k "auth" -v          # Solo tests de auth
pytest tests/ --tb=short -q         # Salida compacta
```

---

## 9. Configuración y despliegue

### 9.1 Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `DATABASE_URL` | Sí | `postgresql+asyncpg://user:pass@host:5432/db` |
| `HEALTH_LINK_MASTER_KEY` | Sí | 64 chars hex (32 bytes AES-256). Generar: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `RSA_PRIVATE_KEY` | Sí | PEM de clave privada RSA para firmar JWT |
| `RSA_PUBLIC_KEY` | Sí | PEM de clave pública RSA para verificar JWT |
| `APP_ENV` | No | `development` (default) / `production` |
| `DEBUG` | No | `true` activa `/docs` y `/openapi.json` |
| `SENTRY_DSN` | No | DSN de Sentry para monitorización de errores |

### 9.2 Docker

```bash
# Desarrollo completo (PostgreSQL + API)
docker compose up --build

# Solo BD (para desarrollo local con venv)
docker compose up db

# Migraciones manuales
cd backend && alembic upgrade head

# Seed de datos de prueba
PYTHONIOENCODING=utf-8 python seed_nutrition.py
```

El `docker-compose.yml` en la raíz del proyecto define:
- `db`: PostgreSQL 17 Alpine con healthcheck
- `backend`: imagen Python 3.12-slim, ejecuta `alembic upgrade head && uvicorn ...`

### 9.3 Makefile

```bash
make dev      # docker compose up --build -d
make stop     # docker compose down
make test     # pytest tests/ -v
make migrate  # alembic upgrade head
make seed     # seed de datos de nutrición
make logs     # docker compose logs -f backend
```

### 9.4 Flujo de arranque

```
1. Python carga app/main.py
2. get_settings() lee variables de entorno (.env o sistema)
3. Limiter() crea el rate limiter en memoria
4. Si SENTRY_DSN configurado → sentry_sdk.init()
5. FastAPI app = FastAPI(...)
6. Se añaden middlewares: CORS, SlowAPI
7. Se registran exception handlers (dominio → HTTP)
8. Se importan y registran los 6 routers de módulos
9. CryptoService se instancia en primer request (lazy, falla si no hay MASTER_KEY)
10. La app está lista para recibir peticiones
```

---

## Decisiones de diseño notables

### ¿Por qué RS256 en lugar de HS256?

RS256 usa criptografía asimétrica. La clave privada (solo en el servidor) firma los tokens, y cualquier servicio con la clave pública puede verificarlos sin necesidad de compartir el secreto. Esto permite arquitecturas de microservicios donde múltiples servicios verifican tokens sin poder emitirlos.

### ¿Por qué dos schemas PostgreSQL?

Art. 9 RGPD clasifica los datos de salud como categoría especial con protecciones reforzadas. Al separar físicamente los datos de salud en `schema: health`, es posible aplicar políticas de acceso PostgreSQL diferenciadas (rol `health_reader` solo puede leer `health.*`), facilitar auditorías y cumplir con requisitos de localización de datos.

### ¿Por qué `health_subject_id` y no simplemente `user_id` en `health_records`?

Si `health_records` usara `user_id` directamente, cualquier exfiltración de la tabla revelaría qué usuario tiene qué datos de salud. Con `health_subject_id` (un UUID aleatorio sin relación con `user_id`), el atacante necesita también la `MASTER_KEY` para correlacionar. La MASTER_KEY no está en la BD, sino en el entorno del servidor.

### ¿Por qué AsyncSession en lugar de sesión síncrona?

FastAPI está construido sobre Starlette/anyio y es completamente asíncrono. Usar SQLAlchemy async + asyncpg permite atender múltiples peticiones simultáneamente con un solo proceso, sin bloquear el event loop durante las consultas a BD. Esto es crítico para la escalabilidad horizontal.
