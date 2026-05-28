# Database Improvements — HealthStack Pro
**Spec date:** 2026-05-28  
**Status:** Approved  
**Scope:** Enfoque A — Quick wins + MVP sólido  
**Target:** PostgreSQL (Raspberry Pi 3B, Docker) + Redis

---

## 1. Contexto y motivación

La base de datos de HealthStack Pro tiene 28 tablas, 2 schemas PostgreSQL (`public` + `health`) y 73 índices definidos. Durante la auditoría QA del 2026-05-28 se detectaron cinco categorías de problemas que afectan rendimiento, mantenimiento y escalabilidad sin que ninguno requiera cambios de infraestructura.

**Estado actual (live en Pi):**
- `users`: 12 filas vivas, **11 dead tuples** — casi 1:1 basura/dato
- `gamification_states`: 5 filas vivas, **17 dead tuples** — más basura que datos
- 4 tablas con **índices B-tree duplicados** → doble escritura en cada INSERT/UPDATE sin beneficio
- Redis disponible en el stack pero **solo usado para rate limiting**
- `routine_json` almacenado como `TEXT` → sin queries JSON nativas ni índices GIN
- Tablas de log (`refresh_tokens`, `gamification_events`, `page_views`) sin estrategia de retención

---

## 2. Arquitectura del cambio

El plan se divide en 5 partes independientes, ordenadas de mayor a menor urgencia. Cada parte se entrega como una migración Alembic separada (o script, si no toca schema) para poder desplegar y revertir de forma granular.

```
┌─────────────────────────────────────────────────────────────┐
│  Parte 1: Limpieza         │  Parte 2: Partial indexes      │
│  - DROP 4 índices dup.     │  - refresh_tokens (activos)    │
│  - VACUUM users / gamif.   │  - password_reset_tokens       │
├─────────────────────────────────────────────────────────────┤
│  Parte 3: Schema           │  Parte 4: Redis cache          │
│  - routine_json → JSONB    │  - Decorador @redis_cache      │
│  - ix_workout_user_started │  - supplements / ingredients   │
│  - ix_session_exercise_key │  - ai_insights L1              │
├─────────────────────────────────────────────────────────────┤
│  Parte 5: Retención        │                                │
│  - cleanup_tokens.py       │                                │
│  - cleanup_events.py       │                                │
│  - cron Pi / APScheduler   │                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Parte 1 — Limpieza de índices duplicados + VACUUM

### 3.1 Índices a eliminar

| Tabla | Índice a eliminar | Índice que lo duplica (se queda) |
|---|---|---|
| `public.gamification_states` | `ix_gamification_states_user_id` | `gamification_states_user_id_key` (UNIQUE) |
| `public.refresh_tokens` | `uq_refresh_tokens_jti` | `ix_refresh_tokens_jti` (UNIQUE) |
| `health.health_records` | `ix_health_health_records_health_subject_id` | `ix_health_records_health_subject_id` |
| `public.user_recipes` | `ix_public_user_recipes_user_local_id` | `ix_user_recipes_user_local_id` |

**Impacto:** Cada INSERT/UPDATE en estas tablas actualmente escribe a dos estructuras B-tree idénticas. Eliminar el duplicado reduce la escritura a la mitad para esas tablas, sin ningún impacto en lecturas.

### 3.2 VACUUM urgente

```sql
VACUUM ANALYZE public.users;
VACUUM ANALYZE public.gamification_states;
VACUUM ANALYZE public.ai_insights_cache;
VACUUM ANALYZE public.community_posts;
```

`users` tiene 11 dead tuples de 12 vivas (91% basura). PostgreSQL no puede reutilizar esas páginas hasta que VACUUM las libere. El autovacuum en la Pi no está siendo suficientemente agresivo para tablas pequeñas muy activas.

**Ajuste de autovacuum para tablas calientes:**
```sql
ALTER TABLE public.users 
  SET (autovacuum_vacuum_scale_factor = 0.05,  -- vaciar cuando hay 5% dead tuples (default: 20%)
       autovacuum_analyze_scale_factor = 0.02);

ALTER TABLE public.gamification_states 
  SET (autovacuum_vacuum_scale_factor = 0.05,
       autovacuum_analyze_scale_factor = 0.02);
```

**Deliverable:** Migración Alembic `0012_cleanup_duplicate_indexes.py` (solo DDL, sin datos).

---

## 4. Parte 2 — Partial indexes para tokens

### Motivación

Los tokens revocados/usados **nunca vuelven a ser consultados** por la lógica de negocio. Sin embargo, los índices B-tree actuales incluyen todas las filas. A medida que la tabla crece, los lookups de tokens activos escanean páginas de índice que nunca producirán resultados.

### Nuevos índices parciales

```sql
-- Solo tokens de refresco no revocados (los únicos que importan)
CREATE INDEX ix_refresh_tokens_active 
  ON public.refresh_tokens(user_id) 
  WHERE revoked_at IS NULL;

-- Solo tokens de reset no consumidos
CREATE INDEX ix_password_reset_active 
  ON public.password_reset_tokens(token_hash) 
  WHERE used_at IS NULL;
```

### Consultas que benefician

```python
# Backend: verificar token activo → usa ix_refresh_tokens_active
WHERE jti = :jti AND revoked_at IS NULL

# Backend: validar token de reset → usa ix_password_reset_active  
WHERE token_hash = :hash AND used_at IS NULL AND expires_at > NOW()
```

**Deliverable:** Migración Alembic `0013_partial_indexes_tokens.py`.

---

## 5. Parte 3 — Schema: JSONB + índices de workout progress

### 5.1 `routine_json` TEXT → JSONB

**Tabla:** `public.saved_routines`  
**Columna actual:** `routine_json TEXT NOT NULL`  
**Nueva columna:** `routine_json JSONB NOT NULL`

**Por qué JSONB sobre JSON:**
- JSONB almacena datos en formato binario descompuesto (JSON es texto raw)
- Permite operadores `->`, `->>`, `@>` (containment) en queries SQL
- Soporta índice GIN para búsquedas por campo interno (útil si en el futuro se quiere buscar rutinas por ejercicio)
- Valida estructura JSON al insertar (detecta JSON malformado antes de persistir)

**Migración sin pérdida de datos:**
```sql
ALTER TABLE public.saved_routines 
  ALTER COLUMN routine_json TYPE JSONB 
  USING routine_json::jsonb;
```

PostgreSQL convierte TEXT→JSONB in-place. Si hay registros con JSON malformado, la migración falla y protege la integridad.

**Cambio en modelo SQLAlchemy:**
```python
# Antes
routine_json: Mapped[str] = mapped_column(Text, nullable=False)

# Después
from sqlalchemy.dialects.postgresql import JSONB
routine_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
```

### 5.2 Índices para gráficos de progreso de ejercicio

El flujo de query para "progreso de Bench Press a lo largo del tiempo" es:
```
workout_sessions (user_id) 
  → session_exercises (session_id, exercise_key)
    → exercise_sets (session_exercise_id, weight_kg, reps)
```

**Índice 1: sesiones por usuario y fecha** (para ordenar cronológicamente)
```sql
CREATE INDEX ix_workout_sessions_user_started 
  ON public.workout_sessions(user_id, started_at DESC);
```

**Índice 2: ejercicio por clave** (para filtrar por ejercicio específico)
```sql
CREATE INDEX ix_session_exercises_exercise_key 
  ON public.session_exercises(exercise_key);
```

Con estos dos índices, una query de progreso por ejercicio puede ejecutarse en ~2ms en lugar de sequential scan sobre todas las sesiones del usuario.

**Deliverable:** Migración Alembic `0014_jsonb_routines_workout_indexes.py`.

---

## 6. Parte 4 — Redis caching (cache-aside pattern)

### 6.1 Decorador `@redis_cache`

Un decorador reutilizable que implementa el patrón **cache-aside** (read-through, write-invalidate):

```python
# app/shared/cache.py
def redis_cache(key_fn: Callable, ttl: int | None = None):
    """
    Decorador cache-aside para métodos de servicio.
    
    - Lee de Redis primero.
    - Si miss → ejecuta función → escribe en Redis.
    - ttl=None → sin expiración (invalidar manualmente en deploy).
    - Serialización: JSON (no pickle — seguro y debuggeable).
    """
```

### 6.2 Patrones de caching

| Endpoint | Clave Redis | TTL | Invalidación |
|---|---|---|---|
| `GET /nutrition/supplements` | `catalog:supplements:all` | Sin TTL | Al deploy / admin update |
| `GET /nutrition/ingredients?limit&offset` | `catalog:ingredients:{limit}:{offset}` | Sin TTL | Al deploy |
| `GET /ai-insights/{type}` | `insights:{user_id}:{insight_type}` | 24h | Al recalcular insight |

**Por qué sin TTL para catálogos:** Los suplementos e ingredientes son datos curados que solo cambian cuando un admin los modifica (raramente). Un TTL forzaría cache misses innecesarios. La invalidación explícita en cada deploy (o admin action) es más precisa.

### 6.3 Implementación en servicios

```python
# app/modules/nutrition/service.py
@redis_cache(key_fn=lambda limit, offset: f"catalog:ingredients:{limit}:{offset}")
async def get_ingredients(limit: int, offset: int) -> list[Ingredient]:
    # Solo se ejecuta si no hay cache
    return await NutritionRepository.list_ingredients(db, limit, offset)
```

**Deliverable:** `app/shared/cache.py` + modificaciones en `nutrition/service.py` y `ai_insights/service.py`.

---

## 7. Parte 5 — Estrategia de retención de datos

### 7.1 Política de retención

| Tabla | Política | Razón |
|---|---|---|
| `refresh_tokens` | Borrar tokens revocados con más de 30 días | Nunca se volverán a usar; la rotación garantiza que los activos son recientes |
| `gamification_events` | Borrar eventos con más de 90 días | `gamification_states` ya tiene los contadores acumulados; el log histórico pierde utilidad operativa |
| `page_views` | Borrar registros con más de 30 días | Telemetría de corto plazo; no hay analytics histórico implementado aún |

### 7.2 Script de limpieza

```python
# scripts/db_cleanup.py
"""
Limpieza periódica de datos obsoletos.
Uso: python scripts/db_cleanup.py [--dry-run]
"""

CLEANUP_POLICIES = [
    CleanupPolicy(
        table="public.refresh_tokens",
        condition="revoked_at < NOW() - INTERVAL '30 days'",
        description="Refresh tokens revocados > 30 días",
    ),
    CleanupPolicy(
        table="public.gamification_events", 
        condition="created_at < NOW() - INTERVAL '90 days'",
        description="Eventos de gamificación > 90 días",
    ),
    CleanupPolicy(
        table="public.page_views",
        condition="created_at < NOW() - INTERVAL '30 days'",
        description="Page views > 30 días",
    ),
]
```

### 7.3 Ejecución periódica

**Opción A (recomendada para Pi):** Cron job en la Pi
```bash
# crontab -e
0 3 * * * docker exec healthstack_backend python scripts/db_cleanup.py >> /var/log/healthstack-cleanup.log 2>&1
```

**Opción B (integrada):** APScheduler dentro del backend FastAPI (startup event), ejecuta cada 24h. Más portable pero añade dependencia al proceso principal.

**Deliverable:** `scripts/db_cleanup.py` + documentación de cron en `OPERATIONS.md`.

---

## 8. Migraciones Alembic — orden de ejecución

```
0012_cleanup_duplicate_indexes.py   ← Sin dependencias, ejecutar primero
0013_partial_indexes_tokens.py      ← Sin dependencias
0014_jsonb_routines_workout_indexes ← Requiere que no haya JSON malformado en saved_routines
```

Todas las migraciones son **reversibles** (tienen `downgrade()`). El cambio TEXT→JSONB en downgrade convierte JSONB→TEXT con `::text`.

---

## 9. Testing

- **Migración 0012:** Verificar con `pg_indexes` que los 4 duplicados desaparecen. Comprobar que VACUUM reduce dead tuples a 0.
- **Migración 0013:** Ejecutar `EXPLAIN (ANALYZE, BUFFERS)` en queries de tokens activos — deben mostrar "Index Scan using ix_refresh_tokens_active".
- **Migración 0014:** Insertar una rutina guardada, recuperarla, verificar que el JSON es navegable. Query de progreso de ejercicio con EXPLAIN — debe usar los nuevos índices.
- **Redis cache:** Test que el 2º call a `/nutrition/supplements` no genera query a BD (verificable con logs de SQLAlchemy en DEBUG).
- **Cleanup script:** Probar con `--dry-run` en Pi antes del primer cron real.

---

## 10. Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| JSON malformado en `saved_routines` al migrar TEXT→JSONB | Baja (el frontend siempre envía JSON válido) | Ejecutar `SELECT id FROM saved_routines WHERE routine_json::jsonb IS NULL` antes de migrar |
| Redis no disponible → cache miss en producción | Media (Pi puede reiniciar Redis) | El decorador debe tener fallback graceful: si Redis falla, ejecutar la query a BD normalmente |
| Eliminar índice equivocado | Muy baja | Cada DROP INDEX está en su propia transacción; downgrade lo recrea |
| Cleanup borra datos activos | Muy baja | `--dry-run` obligatorio en primera ejecución; las condiciones usan timestamps conservadores |

---

## 11. Fuera de alcance (Enfoque B — futuro)

- Migrar `WorkoutSession.id` de `Integer` a `UUID`
- Particionado de `page_views` por mes (`PARTITION BY RANGE (created_at)`)
- Índice GIN + `tsvector` en `community_posts.content`
- Read replica en segunda máquina
- Audit log table para eventos de seguridad (login, password reset)
