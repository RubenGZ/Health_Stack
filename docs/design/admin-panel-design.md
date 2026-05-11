# Admin Panel — Design Spec
**Date:** 2026-05-08  
**Project:** HealthStack Pro  
**Status:** Approved — post-audit v2  

---

## 1. Objetivo

Crear un panel de administración en `/admin` visible y accesible **exclusivamente para usuarios con `role=admin`**. El panel provee al equipo de software una vista unificada de métricas de negocio (usuarios, planes, actividad) y métricas técnicas (page views, errores, endpoints más usados), con acciones básicas de gestión de usuarios.

---

## 2. Decisiones clave

| Decisión | Elección | Razón |
|----------|----------|-------|
| Ubicación | Página separada `/admin` | Separación de concerns, protección nginx, sin contaminar `index.html` |
| Analytics de visitas | Tabla `page_views` propia en PostgreSQL | Sin servicios externos, RGPD controlado, visible en panel admin |
| Métricas técnicas | Prometheus parseado en backend + `page_views` | Prometheus ya instalado; nginx bloquea `/metrics` externamente — el backend lo parsea y expone JSON limpio |
| Acceso a BD | Lectura + acciones básicas | Seguro: no expone campos cifrados, no permite CRUD libre |
| KPIs | Panel unificado negocio + técnico | Equipo pequeño hace ambos roles |
| Gráficas | Chart.js v4 servido localmente | CDN bloqueado por CSP `script-src 'self'` del nginx existente |
| Telemetría de visitas | Endpoint público `/api/v1/telemetry/page-view` | No puede estar bajo `/admin/` — los usuarios normales necesitan llamarlo |
| Enfoque de construcción | Incremental por fases | Cada fase entregable, errores acotados |

---

## 3. Arquitectura

### 3.1 Estructura de ficheros nuevos

```
frontend/
  admin.html
  js/
    admin/
      admin.js          ← bootstrap, auth check, SPA routing interno
      adminApi.js       ← wrapper fetch con JWT para todos los endpoints admin
      adminStats.js     ← KPIs cards + gráficas Chart.js
      adminUsers.js     ← tabla usuarios + modal acciones
      adminTables.js    ← explorador tablas BD
      adminMetrics.js   ← sección técnica (page_views, Prometheus JSON)
    vendor/
      chart.umd.min.js  ← Chart.js v4 servido localmente (no CDN — CSP bloquearía jsdelivr)
  css/
    admin.css           ← estilos admin (hereda tokens teal del proyecto)

backend/app/modules/
  admin/
    __init__.py
    router.py           ← endpoints /api/v1/admin/*
    service.py          ← lógica de negocio admin
    repository.py       ← queries SQLAlchemy
    schemas.py          ← Pydantic in/out
  telemetry/
    __init__.py
    router.py           ← POST /api/v1/telemetry/page-view (público con rate limit)
    models.py           ← modelo PageView

backend/alembic/versions/
  XXXX_add_plan_to_users.py           ← columna plan VARCHAR(10) DEFAULT 'free'
  XXXX_add_page_views_table.py        ← tabla page_views con campo is_admin
```

### 3.2 Protección en capas (triple barrera)

| Capa | Mecanismo | Detalle |
|------|-----------|---------|
| nginx | `location /admin` sirve `admin.html` estático | La página HTML carga pero sin JWT válido no hay datos |
| Backend | `require_role("admin")` en todos los endpoints `/api/v1/admin/*` | 403 para cualquier token sin `role=admin` |
| Frontend | `admin.js` verifica JWT al cargar, redirige a `/` si no es admin o no hay token | Experiencia de usuario limpia |

**Nota importante:** La protección real es la capa backend. Las capas nginx y frontend son UX, no security boundaries. Un atacante sin JWT válido `role=admin` no puede obtener ningún dato aunque acceda a `admin.html`.

### 3.3 Módulo backend `admin` — patrón existente

Sigue el patrón `Router → Service → Repository → Model` del proyecto.  
Los endpoints actuales `GET /api/v1/auth/admin/users` y `PATCH /api/v1/auth/admin/users/{id}` se **migran** al nuevo módulo con redirect 301 temporal desde las URLs antiguas (eliminado en Fase 5).

### 3.4 Propagación del campo `plan` al frontend

**Problema:** `plan.js` lee el plan de `localStorage` key `hs_plan`. Si el admin cambia el plan desde el panel, el usuario no lo verá reflejado hasta el próximo login.

**Fix:** Añadir `plan` al payload JWT y al response de `/auth/me`. El login y el refresh token escriben `hs_plan` en localStorage desde el JWT, no desde valores hardcodeados. `plan.js` no cambia su interfaz.

---

## 4. Endpoints nuevos

### 4.1 Módulo `admin` (todos requieren JWT `role=admin`)

```
GET  /api/v1/admin/stats/overview        KPIs principales
GET  /api/v1/admin/stats/timeseries      Registros diarios (param: days=30)
GET  /api/v1/admin/stats/modules         Actividad por módulo
GET  /api/v1/admin/db/tables             Lista tablas + row counts (via pg_stat_user_tables)
GET  /api/v1/admin/db/tables/{name}      Datos paginados — whitelist + max limit=100
GET  /api/v1/admin/metrics/technical     page_views + Prometheus JSON + errores
GET  /api/v1/admin/metrics/prometheus    Parsea /metrics interno y devuelve JSON limpio
GET  /api/v1/admin/users                 Lista usuarios paginada (migrado)
PATCH /api/v1/admin/users/{id}           Cambiar rol/plan/estado (migrado + extendido)
```

### 4.2 Módulo `telemetry` (público con rate limiting)

```
POST /api/v1/telemetry/page-view         Registrar visita (usuarios normales + anónimos)
```

Rate limit: `10/min` por IP (slowapi). No requiere JWT. Si hay JWT, extrae `role` para marcar `is_admin=true` y filtrar del analytics.

### 4.3 Reglas de negocio en `PATCH /api/v1/admin/users/{id}`

- **Auto-modificación bloqueada:** si `user_id` del JWT == `id` del path → 403 con mensaje claro
- **Último admin protegido:** si `body.role == "user"` y el target es el único admin activo → 409 Conflict
- **`plan` validado:** solo `'free' | 'pro' | 'elite'` — 422 si valor inválido
- **`role` validado:** solo `'user' | 'admin'` — 422 si valor inválido

---

## 5. Migraciones de BD

### 5.1 Columna `plan` en tabla `users`
```sql
ALTER TABLE public.users 
ADD COLUMN plan VARCHAR(10) NOT NULL DEFAULT 'free'
CONSTRAINT users_plan_check CHECK (plan IN ('free', 'pro', 'elite'));
```

También actualizar `UserPublicResponse` schema en `identity/schemas.py` para incluir `plan`, y actualizar los tests existentes de `test_auth.py`.

### 5.2 Tabla `page_views`
```sql
CREATE TABLE public.page_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page        VARCHAR(100) NOT NULL,
  country     VARCHAR(2),              -- ISO código país (de geo-pricing, nunca IP)
  user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_auth     BOOLEAN NOT NULL DEFAULT false,
  is_admin    BOOLEAN NOT NULL DEFAULT false,  -- filtrar tráfico admin del analytics
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_page_views_created_at ON public.page_views(created_at);
CREATE INDEX idx_page_views_page       ON public.page_views(page);
CREATE INDEX idx_page_views_analytics  ON public.page_views(created_at, is_admin)
  WHERE is_admin = false;              -- índice parcial para queries de analytics
```

### 5.3 Retención automática de `page_views`

Job en APScheduler (ya existe en el proyecto en `ai_insights/scheduler.py`) que se ejecuta semanalmente:
```python
DELETE FROM public.page_views 
WHERE created_at < now() - interval '90 days';
```
El intervalo es configurable via env var `PAGE_VIEWS_RETENTION_DAYS` (default: 90).

---

## 6. Whitelist de tablas en el explorador de BD

Solo estas tablas son accesibles vía `/api/v1/admin/db/tables/{name}`:

```python
ALLOWED_TABLES = {
    "users",
    "health_records",
    "routines",
    "community_posts",
    "gamification_profiles",
    "page_views",
}
# Excluidas explícitamente:
# - refresh_tokens  → JTIs activos, no necesarios para soporte
# - data_links      → material criptográfico, no aporta valor en el panel
```

El endpoint devuelve 404 si `{name}` no está en `ALLOWED_TABLES`. **Nunca** interpolar el nombre de tabla directamente en SQL — usar `text()` de SQLAlchemy con el nombre validado.

Columnas enmascaradas en todas las tablas:
- `password_hash` → `"[HASH]"`
- `health_uuid_enc` → `"[ENCRYPTED]"`

---

## 7. Row counts eficientes

Para la lista de tablas con conteo de filas, usar la vista del sistema en lugar de `COUNT(*)`:

```sql
SELECT relname AS table_name, n_live_tup AS approx_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname = ANY(:allowed_tables)
ORDER BY relname;
```

`n_live_tup` es una estimación del autovacuum — actualizada continuamente, respuesta en <1ms independientemente del tamaño de la tabla.

---

## 8. Prometheus — integración

nginx bloquea `/metrics` externamente (correcto). El backend puede leerlo internamente:

```python
# backend/app/modules/admin/service.py
import httpx

async def get_prometheus_summary() -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.get("http://localhost:8000/metrics", timeout=5.0)
    # Parsear texto Prometheus → dict con métricas relevantes
    return _parse_prometheus_text(r.text)
```

El endpoint `GET /api/v1/admin/metrics/prometheus` devuelve JSON con:
- RPS por endpoint (top 10)
- Latencia p50/p95 por endpoint
- Tasa de errores 4xx/5xx

---

## 9. nginx — actualización requerida

Añadir en ambos configs (`nginx.conf` y `nginx.pi.conf`):

```nginx
# Rate limit específico para endpoints admin
limit_req_zone $binary_remote_addr zone=admin:10m rate=30r/m;

location /api/v1/admin/ {
    limit_req zone=admin burst=10 nodelay;
    proxy_pass         http://backend;
    proxy_http_version 1.1;
    proxy_set_header   Connection        "";
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
}

# Servir panel admin (HTML estático — la protección real es el backend)
location /admin {
    try_files /admin.html =404;
}
```

**CSP update** — añadir `'nonce-{random}'` para scripts inline si es necesario. Chart.js se sirve desde `'self'` (está en `frontend/js/vendor/`) por lo que no requiere cambios en CSP.

---

## 10. Diseño UI

### 10.1 Layout

```
┌─────────────────────────────────────────────────────┐
│  TOPBAR: Logo HealthStack Admin  |  usuario | logout │
├──────────────┬──────────────────────────────────────┤
│   SIDEBAR    │         CONTENIDO PRINCIPAL           │
│              │                                       │
│  ● Overview  │  [sección activa]                     │
│  ● Usuarios  │                                       │
│  ● Tablas BD │                                       │
│  ● Métricas  │                                       │
└──────────────┴──────────────────────────────────────┘
```

Estilo: tokens teal del proyecto, mismo `glass-card` pattern, `admin.css` solo sobre variables existentes.

### 10.2 Sección Overview

**KPI cards (fila):**
- Total usuarios registrados
- Usuarios activos últimos 30 días
- Nuevos registros hoy
- Número de admins

**Gráficas:**
- Línea: registros por día (últimos 30 días)
- Donut: distribución de planes (free / pro / elite)
- Barras: actividad por módulo (health, routines, community, gamification, ai_coach)

### 10.3 Sección Usuarios

Tabla paginada (20/página). Columnas: ID, Email, Nombre, Rol, Plan, Activo, Último login, Acciones.

**Acciones por fila:**
- `[Suspender / Activar]` — toggle `is_active` (bloqueado si es el propio usuario)
- `[→ Admin / → User]` — toggle `role` (bloqueado si es el propio usuario o último admin)
- `[Cambiar plan]` — abre modal con selector free / pro / elite

**Modal cambiar plan:**
```
┌─────────────────────────────┐
│  Cambiar plan — user@...    │
│  Plan actual: free          │
│  ○ free  ● pro  ○ elite     │
│  [Cancelar]  [Confirmar]    │
└─────────────────────────────┘
```

Filtros: búsqueda por email, filtro por rol, filtro por estado.

**UX de seguridad:** Los botones de acción sobre el propio usuario del admin logueado aparecen deshabilitados con tooltip "No puedes modificar tu propia cuenta".

### 10.4 Sección Tablas BD

- Lista de tablas (solo las de la whitelist) con row count aproximado
- Al seleccionar: tabla paginada, máx. 100 filas por página
- Columnas sensibles enmascaradas: `password_hash` → `[HASH]`, `health_uuid_enc` → `[ENCRYPTED]`
- Solo lectura

### 10.5 Sección Métricas técnicas

**KPI cards:**
- Page views hoy (excluye tráfico admin)
- Page views últimos 7 días (excluye tráfico admin)
- Errores HTTP 5xx últimas 24h (desde Prometheus JSON)
- Uptime API (ping a `/health`)

**Gráficas:**
- Línea: visitas por página/día (últimos 7 días, `WHERE is_admin = false`)
- Barras horizontales: top 10 endpoints por RPS (desde Prometheus JSON)

---

## 11. Fases de implementación

| Fase | Contenido | Entregable |
|------|-----------|------------|
| 1 | `admin.html` + sidebar + auth check + `adminApi.js` + nginx `/admin` location + Chart.js local | Panel vacío protegido y navegable |
| 2 | Endpoints stats/overview + stats/timeseries + KPI cards | 4 números reales + gráfica de línea |
| 3 | Endpoint stats/modules + gráficas donut y barras | Overview completo |
| 4 | Migración plan→JWT + migración endpoints admin + tabla usuarios + modal acciones + migración Alembic `plan` | Gestión de usuarios operativa |
| 5 | Whitelist tablas BD + endpoint db/tables + explorador + enmascarado | Visibilidad de datos segura |
| 6 | Módulo telemetry + tabla page_views + APScheduler retención + Prometheus cableado + sección métricas | Panel técnico completo |

---

## 12. Testing

- `tests/integration/test_admin.py` — tests para todos los endpoints admin
- `tests/integration/test_telemetry.py` — tests para `POST /telemetry/page-view`
- Tests de autorización: token `role=user` → 403 en TODOS los endpoints `/admin/*`
- Test de auto-modificación bloqueada: admin no puede patchear su propio ID
- Test de último admin: degradar al único admin → 409 Conflict
- Test de whitelist: `GET /admin/db/tables/refresh_tokens` → 404
- Test de enmascarado: `GET /admin/db/tables/users` no devuelve `password_hash` en claro
- Test de cap de paginación: `limit=999` → responde con máx. 100 filas
- Migraciones Alembic probadas en BD de test existente (`healthstack_test`)

---

## 13. Consideraciones RGPD

- Tablas BD: `health_uuid_enc` nunca se desencripta — admins ven `[ENCRYPTED]`
- `page_views` no almacena IPs — solo país derivado por geo-pricing
- Retención automática de `page_views` a 90 días (configurable)
- Acceso admin queda en logs de Sentry para auditoría
- Degradación de rol no invalida JWT activo inmediatamente (comportamiento inherente a JWT stateless, ventana máxima de 15 min). Para revocación inmediata: el admin puede invalidar el refresh token del usuario desde el panel en una iteración futura.

---

## 14. Audit trail — problemas resueltos en v2

| # | Problema | Fix aplicado |
|---|----------|--------------|
| 1 | Chart.js CDN bloqueado por CSP | Servir localmente en `frontend/js/vendor/` |
| 2 | `/metrics` bloqueado por nginx | Backend parsea internamente, expone JSON via `/admin/metrics/prometheus` |
| 3 | `POST page-view` bajo ruta admin | Movido a módulo `telemetry` — `/api/v1/telemetry/page-view` |
| 4 | `plan` solo en localStorage | Añadido al JWT payload y `/auth/me` response |
| 5 | SQL injection en `/db/tables/{name}` | Whitelist estricta + `text()` con nombre validado |
| 6 | Admin se suspende a sí mismo | Backend bloquea auto-modificación → 403 |
| 7 | Último admin degradable | Backend verifica al menos 1 admin activo queda → 409 |
| 8 | JWT rol stale tras degradación | Documentado como comportamiento conocido + opción revocación refresh token |
| 9 | Sin rate limit en endpoints admin | Zona nginx `admin:30r/m` dedicada |
| 10 | `refresh_tokens` y `data_links` expuestos | Excluidos de la whitelist del explorador |
| 11 | `COUNT(*)` lento en tablas grandes | Reemplazado por `pg_stat_user_tables.n_live_tup` |
| 12 | `UserPublicResponse` sin `plan` | Actualización de schema + tests en Fase 4 |
| 13 | `page_views` sin retención | APScheduler job semanal con `PAGE_VIEWS_RETENTION_DAYS` |
| 14 | Tráfico admin en analytics | Campo `is_admin` + índice parcial + filtro en todas las queries |
| 15 | Paginación sin límite máximo | Cap duro `limit <= 100` en el endpoint |
