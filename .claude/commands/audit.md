# HealthStack Pro — Code Audit & Auto-Fix

Auditoría sistemática del codebase con **corrección automática verificada** de los problemas encontrados. Cubre backend (FastAPI/SQLAlchemy) y frontend (vanilla JS SPA).

**Filosofía:** SCAN exhaustivo → CLASIFICAR por severidad → FIX en orden seguro → VERIFICAR cada batch. Nunca lees-y-fixeas a la vez (un fix puede invalidar lo que viste hace 5 archivos).

---

## Modo de uso

- `/project:audit` → auditoría completa.
- `/project:audit <módulo>` → solo ese módulo o ruta concreta.
- `/project:audit --dry-run` → solo escanea y reporta, no edita.

---

## FASE 0 — Preparación

### 0.1 Leer contexto

Lee `CLAUDE.md` completo. Extrae mentalmente:
- Módulos production-ready vs WIP (no aplicar fixes en WIP que rompan trabajo en curso del usuario)
- Lista completa de "Issues conocidos" — **estos se SALTAN siempre**, no se reportan ni se intentan arreglar
- Patrones específicos: AIRouter multi-provider, `health_subject_id` cifrado, auth-gate flow, i18n 5 locales, atomic SQL counters

### 0.2 Issues conocidos — SALTAR SIEMPRE

```
- streak_days: 0 hardcodeado en workout_sessions (TODO real, no bug)
- season = 1 hardcodeado en ranked (WIP, no tocar)
- Leaderboard city/national/global vacíos (WIP, conocido)
- Usernames en leaderboard muestran UUIDs (WIP)
- GymChampionBadge tabla huérfana (WIP)
- MAX_LP_PER_WEEK / lp_week código muerto en ranked (decisión pendiente)
- ai_insights envía datos biométricos sin anonimizar (RGPD P0 — decisión de diseño)
- gym_servers sin response_model en 5 endpoints (WIP)
- test_notifications.py referencia módulo inexistente (ignorar)
```

### 0.3 Checkpoint git

Antes de cualquier edición, ejecuta:

```bash
git status --porcelain
```

- Si hay cambios sin commit → **PARA** y avisa al usuario. La auditoría requiere working tree limpio para que el diff final sea legible.
- Si está limpio → continúa.

---

## FASE 1 — SCAN (sin editar nada todavía)

**Objetivo:** acumular un *findings list* completo antes de tocar ningún archivo. Usa sub-agentes Explore para no quemar el contexto del agente principal.

### 1.1 Descubrimiento

Glob estos patrones:

```
backend/app/modules/*/router.py
backend/app/modules/*/service.py
backend/app/modules/*/repository.py
backend/app/modules/*/schemas.py
backend/app/modules/*/models.py
backend/app/core/**/*.py
backend/app/services/**/*.py
frontend/js/*.js
frontend/js/components/*.js
frontend/index.html
frontend/sw.js
```

### 1.2 Dispatch paralelo de sub-agentes Explore

Lanza **4 sub-agentes Explore en paralelo** (una sola llamada Agent con multiple tool_use), cada uno con un slice del codebase y la sección correspondiente del checklist (Fase 2). Cada sub-agente debe devolver un JSON estructurado con findings — nada más.

**Sub-agente 1 — Backend Security:**
- Files: todos los `router.py` + `core/security/*.py`
- Checks: §2.1 (auth guards, response_model, rate limits, paginación, tokens en logs, CORS)

**Sub-agente 2 — Backend Logic:**
- Files: todos los `service.py` + `repository.py` + `services/ai_router/*.py`
- Checks: §2.2 (atomic ops, N+1, async correcto, datos a IA, idempotencia)

**Sub-agente 3 — Frontend Crítico:**
- Files: `api.js`, `auth-gate.js`, `auth.js`, `gamification.js`, `ranked.js`, `chatbot.js`, `app.js`
- Checks: §3.1, §3.2, §3.3, §3.7, §3.10 (XSS, auth tri-state, localStorage, idempotencia, auth-gate)

**Sub-agente 4 — Frontend Resto + Cross-cutting:**
- Files: resto de `frontend/js/*.js` + `index.html` + `sw.js` + `frontend/js/components/*.js`
- Checks: §3.4, §3.5, §3.6, §3.8, §3.9, §3.11, §3.12, §4 completo

**Formato obligatorio de respuesta de cada sub-agente:**

```json
[
  {
    "severity": "CRITICAL|HIGH|MEDIUM|LOW",
    "category": "xss|auth|atomic_op|n1_query|i18n|listener_leak|...",
    "file": "frontend/js/ranked.js",
    "line": 142,
    "issue": "Descripción breve (1 línea)",
    "current_code": "líneas relevantes literalmente",
    "fix_strategy": "AUTO_FIX|AUTO_FIX_VERIFY|REPORT_ONLY",
    "fix_code": "código exacto para reemplazar (si AUTO_FIX)",
    "depends_on": ["otro finding que debe aplicarse antes (o null)"]
  }
]
```

### 1.3 Clasificación

El agente principal recibe los 4 JSONs y los **funde en una sola lista**. Luego clasifica:

**AUTO_FIX** (aplicar sin preguntar):
- XSS con `.innerHTML` → cambio mecánico a `.textContent`
- `data-i18n` faltante en strings traducibles
- `max_length` faltante en Pydantic `str`
- Imports no usados
- `addEventListener` sin cleanup
- `change` → `input` en numéricos
- `console.log` con datos sensibles
- Async sin `await`
- Tokens en query params
- `localStorage.setItem` sin try/catch en writes críticos

**AUTO_FIX_VERIFY** (aplicar y luego correr verificación):
- Cambios en `models.py` (puede requerir migración Alembic)
- Cambios en signatures de servicios (puede romper tests)
- Cambios en queries SQL (atomic counters)
- Cambios que tocan `response_model` (cambia el contrato OpenAPI)

**REPORT_ONLY** (no auto-fix, listar al final):
- Decisiones de diseño (qué datos enviar a IA)
- Cambios que requieren contexto de producto (renombrar endpoint)
- Refactors arquitecturales (separar service en submódulos)
- Trade-offs de performance (cache vs simplicidad)
- Cualquier cosa marcada en CLAUDE.md como issue conocido → SKIP, ni reportar

### 1.4 Ordenar por dependencias

Si un finding tiene `depends_on`, asegúrate de aplicar primero el padre. Ejemplo típico: añadir clave i18n nueva en `i18n.js` antes de usarla en `index.html`.

Orden de aplicación dentro de cada severity:
1. Backend `schemas.py` (validación primero)
2. Backend `models.py` (estructura)
3. Backend `repository.py` (queries)
4. Backend `service.py` (lógica)
5. Backend `router.py` (endpoints)
6. Frontend `api.js` (capa de datos)
7. Frontend `i18n.js` (keys necesarias antes de usarlas)
8. Frontend `index.html` (markup)
9. Frontend resto de JS

---

## FASE 2 — Checklist Backend

### 2.1 router.py

| Check | Detección | Fix |
|---|---|---|
| **Auth guard faltante** | Endpoint sin `Depends(get_current_user)` que toca datos de usuario | Añadir `current_user: User = Depends(get_current_user)` al signature |
| **Ownership check** | `db.query(X).filter(X.id == id)` sin filtrar por `user_id` | Añadir `.filter(X.user_id == current_user.id)` |
| **response_model faltante** | `@router.get(...)` sin `response_model=` | Añadir `response_model=NombreSchemaOut` del módulo |
| **Rate limit faltante** | Endpoint público o caro (chat, AI, auth) sin `@limiter.limit()` | Añadir decorador con límite apropiado |
| **Paginación** | Endpoint que devuelve `List[X]` sin `limit`/`offset` | Añadir `limit: int = Query(20, le=100), offset: int = Query(0, ge=0)` |
| **Token en log** | `logger.info(f"...{token}...")` o similar con datos sensibles | Eliminar o redactar |
| **HTTPException sin detail** | `raise HTTPException(404)` sin string | Añadir `detail="Mensaje descriptivo"` |
| **CORS wildcard** | En `main.py`: `allow_origins=["*"]` para producción | Reportar (decisión config) |

### 2.2 service.py

| Check | Detección | Fix |
|---|---|---|
| **Race condition contador** | `obj.likes += 1` o `setattr(obj, 'xp', obj.xp + N)` | Reescribir con `update(Model).where(...).values(likes=Model.likes + 1)` |
| **Datos biométricos a IA** | Pasar `weight`, `body_fat`, `birthdate` real a AIRouter | **REPORT_ONLY** + comentario `# TODO RGPD` |
| **Idempotencia** | `addXP('login')` sin guard de fecha o flag | Añadir `if state.lastLogin == today: return` |
| **AIRouter pattern** | `import httpx` + llamada directa en service de AI | Reescribir usando `app.state.ai_router.complete(...)` |
| **datetime.utcnow()** | Uso de `datetime.utcnow()` (deprecated Python 3.12+) | Reemplazar por `datetime.now(timezone.utc)` |

### 2.3 repository.py

| Check | Detección | Fix |
|---|---|---|
| **N+1 query** | Loop con `await db.execute(select(...))` dentro | Reescribir con `selectinload(Model.relation)` o JOIN |
| **Await olvidado** | `result = db.execute(stmt)` sin `await` | Añadir `await` |
| **f-string en SQL** | `text(f"SELECT * WHERE id = {user_id}")` | Cambiar a `text("...:user_id").bindparams(user_id=user_id)` |
| **Falta `.scalars()`** | Asignar resultado de `select()` sin `.scalars().all()` o `.scalar_one_or_none()` | Añadir el método apropiado |

### 2.4 schemas.py

| Check | Detección | Fix |
|---|---|---|
| **str sin max_length** | `field: str` o `field: Optional[str]` sin `max_length=` | Añadir `Field(..., max_length=N)` apropiado al uso |
| **EmailStr faltante** | Campo `email: str` | Cambiar a `email: EmailStr` |
| **Optional sin default** | `field: Optional[X]` sin ` = None` | Añadir `= None` |
| **UUID vs int** | `Optional[int]` cuando el ORM es UUID | Cambiar a `Optional[uuid.UUID]` |
| **Mutable default** | `tags: list = []` | Cambiar a `tags: list = Field(default_factory=list)` |

### 2.5 models.py

| Check | Detección | Fix |
|---|---|---|
| **Índice faltante** | Columna usada en WHERE/JOIN frecuente sin `index=True` | Añadir `index=True` y crear migración Alembic (REPORT) |
| **FK sin cascade** | `relationship()` que debería borrar hijos | Añadir `cascade="all, delete-orphan"` |
| **String mutable default** | `Column(JSON, default={})` | Cambiar a `default=dict` (callable) |

---

## FASE 3 — Checklist Frontend

### 3.1 XSS — innerHTML con contenido externo

**Detección:** Cualquier `.innerHTML =` cuyo lado derecho contenga `${...}` con datos de API o user input.

**Fix templates:**

```js
// Texto puro:
el.innerHTML = data.content  →  el.textContent = data.content

// HTML controlado por API pero con campos dinámicos:
el.innerHTML = `<a href="${u}">${name}</a>`
// → escapar:
function esc(s) { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
el.innerHTML = `<a href="${esc(u)}">${esc(name)}</a>`

// URL renderizada:
const safe = /^https?:\/\//i.test(url) ? url : '#';
el.innerHTML = `<a href="${esc(safe)}" rel="noopener noreferrer">${esc(label)}</a>`
```

### 3.2 Auth — tryRefresh tri-state

Verifica que `frontend/js/api.js` tiene exactamente este patrón:

```js
async function tryRefresh() {
  try {
    const res = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (res.ok) { /* save new token */ return 'ok'; }
    if (res.status === 401) return 'invalid';
    return 'network';
  } catch (e) {
    return 'network';
  }
}

// Y luego:
const r = await tryRefresh();
if (r === 'invalid') { clearAuth(); redirectToLogin(); }
if (r === 'network') throw new Error('Sin conexión');
```

Si falta alguno de los tres estados o se llama `clearAuth()` en `'network'` → **FIX**.

### 3.3 localStorage con QuotaExceededError

Wrap writes críticos (gamification, workout drafts, weight entries):

```js
function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      // prune oldest entries — específico al tipo de dato
      pruneHistory(key);
      try { localStorage.setItem(key, value); } catch { /* give up silently */ }
      document.dispatchEvent(new CustomEvent('hs:storage-full', { detail: { key } }));
    }
  }
}
```

### 3.4 Loading flags — concurrencia

Cualquier módulo con `async function init()` que haga fetch necesita guard:

```js
const Module = (function() {
  let _loading = false, _initialized = false;
  async function init(root) {
    if (_loading || _initialized) return;
    _loading = true;
    try {
      const data = await fetch(...);
      // render
      _initialized = true;
    } finally { _loading = false; }
  }
  return { init };
})();
```

### 3.5 Event listeners — leak prevention

Patrón seguro para re-renders:

```js
// MAL:
function render() { btn.addEventListener('click', h); }

// BIEN — clonar para limpiar:
function render() {
  const fresh = btn.cloneNode(true);
  btn.replaceWith(fresh);
  fresh.addEventListener('click', h);
}

// O usar delegation en el contenedor padre (una vez):
container.addEventListener('click', e => {
  if (e.target.matches('.btn-action')) handler(e);
});
```

### 3.6 i18n — completitud

**Tres checks separados:**

**A) Strings hardcodeados en JS:**
Buscar literales `'texto en español'` o `"text in english"` asignados a `textContent`, `innerHTML`, `placeholder`, `title`, `aria-label`. Si la clave existe en `i18n.js` → reemplazar por `t('key')`. Si no existe → crear la clave en los 5 locales y luego reemplazar.

**B) Texto sin `data-i18n` en HTML:**
Cualquier `<span>`, `<button>`, `<h*>`, `<p>`, `<label>` con texto visible y sin atributo `data-i18n`. Añadir el atributo apuntando a una clave existente o creada nueva.

**C) Consistencia entre locales en `i18n.js`:**
Listar todas las claves del locale `es`. Verificar que cada una existe en `en`, `fr`, `de`, `it`. Para claves faltantes:
- Si es un nombre propio o número → copiar literal
- Si es texto → traducir y añadir
- Nunca dejar una clave con valor en un solo idioma

### 3.7 Idempotencia gamificación

`frontend/js/gamification.js` debe tener guards:

```js
function addXP(action) {
  const state = loadState();
  const cfg = ACTIONS[action];
  if (cfg.once && state.actions?.[action]?.completed) return;
  if (action === 'login' && state.lastLogin === today()) return;
  // ... apply XP
}
```

### 3.8 Inputs numéricos — `input` no `change`

Buscar en archivos de logger/calculadora (`workoutLogger.js`, `macroCalc.js`, etc.):

```js
input.addEventListener('change', ...) → input.addEventListener('input', ...)
```

`change` solo dispara al hacer blur; `input` captura cada pulsación.

### 3.9 Código muerto

- `const x = ...` declarado y nunca leído → eliminar
- `function foo()` definida y nunca llamada → eliminar (verificar que no se exporta a `window`)
- `// TODO:` con fecha > 6 meses sin issue asociado → reportar para limpieza
- `console.log(token)`, `console.log(user.password)` → eliminar

### 3.10 auth-gate.js

Verificar:
- La whitelist de paths públicos incluye `?action=register`, `?action=login`, `?action=reset-password`
- No hay redirect loop (`if (location.pathname === '/login') return;`)
- Lee tokens de `localStorage` antes de decidir, no de cookies
- Coexiste con `mobile-redirect.js` sin conflicto (mobile-redirect debe ejecutarse ANTES o después de forma determinista)

### 3.11 Service Worker

`frontend/sw.js`:
- Versión de cache actualizada cuando se cambia algo en assets versionados
- No cachea `/api/*` (debe llegar siempre al backend)
- `skipWaiting()` + `clients.claim()` para forzar update inmediato
- Si encuentras un bump pendiente → aplicarlo

### 3.12 Accesibilidad mínima

- `<button>` sin texto visible → debe tener `aria-label`
- `<img>` → debe tener `alt` (si decorativo, `alt=""`)
- `<input>` → debe tener `<label for="...">` asociado o `aria-label`
- Iconos SVG interactivos → `aria-hidden="true"` o `role="img" + aria-label`

---

## FASE 4 — Cross-cutting

### 4.1 Consistencia entre módulos similares

- Todos los routers AI usan `request.app.state.ai_router` — nunca `httpx` directo
- Todos los routers con auth usan el MISMO import: `from app.core.security.jwt_handler import get_current_user`
- Todos los services siguen el patrón 4-capas (router → service → repo → model)

### 4.2 Tests obsoletos

`tests/integration/test_ai_*.py`: si tienen `with respx.mock:` o `httpx_mock` apuntando al endpoint final del proveedor → obsoleto.
**Fix:** sustituir por `fastapi_app.state.ai_router = FakeAIRouter(...)`.

### 4.3 Hardcoded URLs

Buscar literales `'http://localhost:8000'` o `'https://...'` en JS.
**Fix:** usar `CONFIG.API_BASE` o ruta relativa `/api/v1/...`.

### 4.4 Mensajes de error mezclados es/en

Si un módulo tiene 80% mensajes en español y de repente uno en inglés (o viceversa), normalizar al idioma dominante del módulo. Reportar inconsistencias si no es obvio.

---

## FASE 5 — Aplicación de fixes

Procesa la lista clasificada **estrictamente en este orden**:

1. **AUTO_FIX críticos primero** (todos los XSS, todos los auth gaps, todos los race conditions) — en orden de archivo de la §1.4
2. **AUTO_FIX altos**
3. **AUTO_FIX medios**
4. **AUTO_FIX_VERIFY** — uno a uno, con verificación entre cada uno

Para cada fix:
1. Usa `Edit` con `old_string` y `new_string` exactos (no aproximados)
2. Si `Edit` falla por unicidad, amplía el contexto del `old_string`
3. Marca el TODO del archivo como `done` cuando termines todos sus fixes

---

## FASE 6 — Verificación

### 6.1 Sintaxis Python

Para cada archivo Python editado, validar:

```bash
docker exec healthstack_backend python -m py_compile <ruta>
```

Si falla → revertir el fix de ese archivo con `git checkout -- <file>` y mover ese finding a REPORT_ONLY.

### 6.2 Sintaxis JS

Para cada archivo JS editado, validación rápida:

```bash
node --check <ruta>
```

Si falla → revertir y mover a REPORT_ONLY.

### 6.3 Tests (solo si AUTO_FIX_VERIFY tocó módulo con tests)

Si el fix tocó `backend/app/modules/<X>/`, ejecutar:

```bash
docker exec healthstack_backend python -m pytest tests/integration/test_<X>.py -x --tb=short
```

Si pasa el filtro de "infrastructure check" en CLAUDE.md (tests corren en el Pi, no local), avisa al usuario que corra `bash ~/healthstack-pi-server/scripts/update.sh` antes de validar.

---

## FASE 7 — Resumen + sincronización CLAUDE.md

Reporte final con este formato:

```
═══════════════════════════════════════════════════════
HEALTHSTACK AUDIT COMPLETE
═══════════════════════════════════════════════════════
Duración:           ~N min
Archivos escaneados: N
Findings totales:    N
Fixes aplicados:     N   (verificados: M)
Reportados (no fix): N
Saltados (conocidos): N

✅ CRITICAL aplicados:
  • XSS innerHTML — ranked.js:142 → escape function
  • Race condition — community/service.py:67 → UPDATE atómico
  ...

✅ HIGH aplicados:
  • Falta data-i18n × N strings — index.html
  • Falta max_length en X schemas Pydantic
  ...

✅ MEDIUM aplicados:
  • Listeners sin cleanup × N — workoutLogger.js
  ...

✅ LOW aplicados:
  • Imports no usados × N
  • console.log con datos sensibles × N

⚠️ Requieren decisión humana:
  • [archivo:línea] — descripción + por qué no auto-fix

❌ Reverts por fallo de verificación:
  • [archivo:línea] — motivo del revert
═══════════════════════════════════════════════════════
```

### 7.1 Sincronizar CLAUDE.md

- En la sección **"Bugs resueltos"** añadir filas para fixes verificados de impacto (no para limpiezas menores)
- En la sección **"Pendientes prioritarios"** añadir los findings REPORT_ONLY que no estaban ya listados
- No tocar nada más de CLAUDE.md

### 7.2 Commit sugerido

Imprime al final el comando de commit listo para copiar:

```bash
git add -A && git commit -m "chore: auto-audit fixes — N critical, M high, K medium"
```

No hagas el commit tú — siempre lo aprueba el usuario.

---

## Referencia rápida de patrones del proyecto

```
AIRouter:        request.app.state.ai_router.complete(prompt, ...)
Auth current:    current_user: User = Depends(get_current_user)
Auth admin:      admin: User = Depends(get_admin_user)
Health subject:  health_subject_id (cifrado AES-256-GCM, NUNCA user_id directo)
Atomic counter:  await db.execute(update(M).where(...).values(c=M.c+1))
Rate limit:      @limiter.limit("10/minute")
i18n use:        t('module.key')  // window.t global
i18n locales:    es, en, fr, de, it (5 obligatorios)
SW version:      bump en sw.js al cambiar assets
Storage event:   document.dispatchEvent(new CustomEvent('hs:storage-full'))
Section change:  window.dispatchEvent(new CustomEvent('hs:section-changed', ...))
Lang change:     document.addEventListener('languagechange', ...)
```
