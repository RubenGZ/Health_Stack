# HealthStack Pro — Code Audit

Realiza una auditoría completa de seguridad, integridad y calidad del código de HealthStack Pro.
Cubre backend (FastAPI) y frontend (vanilla JS SPA).

## Scope

Sin argumentos: auditoría completa de todos los módulos.
Con argumento (`/project:audit chat`): auditoría enfocada en ese módulo o archivo.

## Metodología

### 1. Seguridad — Backend

**Auth guards:**
- Todos los endpoints protegidos usan `Depends(get_current_user)` o `Depends(get_admin_user)`
- Ningún endpoint devuelve datos de otro usuario sin verificar `user_id == current_user.id`
- Tokens JWT no se loguean ni se incluyen en responses de error

**Inyección y validación:**
- Campos `str` en Pydantic tienen `max_length` definido
- No hay f-strings con input del usuario en queries SQL — usar SQLAlchemy ORM o parámetros
- No hay `eval()`, `exec()`, ni `subprocess` con input no sanitizado
- Archivos subidos: validar tamaño ANTES de leer completo (`file.read(MAX+1)` pattern)

**Race conditions — operaciones atómicas:**
- Contadores (likes, XP, LP) se incrementan con SQL atómico:
  `UPDATE SET col = col + 1` — NUNCA `obj.col += 1` en Python
- Buscar patrones: `getattr` + suma + `setattr` en repository/service layers

**Rate limiting:**
- Endpoints públicos caros (chat, AI) tienen rate limit específico más estricto que el global
- El límite de chat distingue usuarios anónimos (más estricto) vs autenticados
- Patrón: sliding window con `defaultdict(list)` + `time.monotonic()` + pruning

**CORS / headers:**
- `ALLOWED_ORIGINS` no contiene `*` en producción
- Endpoints que devuelven datos sensibles no tienen `Cache-Control: public`

**RGPD:**
- Datos biométricos reales NO se envían a proveedores IA externos sin anonimizar
- Health records usan `health_subject_id` (UUID cifrado), no `user_id` directo
- Logs no contienen peso, historial médico, ni datos personales identificables

### 2. Seguridad — Frontend (JS)

**XSS:**
- Buscar todos los `.innerHTML =` — verificar que el contenido es HTML controlado o escapado
- Inputs de usuario → usar `.textContent` o escape manual antes de insertar en DOM
- URLs de contacto/external: validar con `/^https?:\/\//i` antes de renderizar como `<a href>`
- `showModal(title, html)` — el `html` que viene de API debe sanitizarse

**Auth y tokens:**
- `tryRefresh()` devuelve tri-estado: `'ok' | 'invalid' | 'network'`
- Solo `'invalid'` limpia auth (clearAuth + redirect login)
- `'network'` lanza error "Sin conexión" sin tocar tokens
- Tokens no se pasan en query params de URLs

**localStorage:**
- Writes críticos tienen manejo de `QuotaExceededError`
- Patrón: try/catch → prune history → retry → dispatch `hs:storage-full`

**Concurrencia de navegación:**
- Módulos con llamadas async en init usan flags de loading (`_isLoading`, `_rankLoading`)
- Sin flag: navegación rápida dispara N llamadas paralelas al mismo endpoint

**Idempotencia — XP/gamificación:**
- Acciones `once: true` verifican flag antes de sumar XP
- Login diario: guard `state.lastLogin === today` dentro de `addXP('login')`
- Rutinas, TDEE: guards análogos

### 3. Calidad — Backend

**Contratos de API:**
- Todos los endpoints tienen `response_model` definido (aparecen en OpenAPI)
- Errores devuelven `{"detail": "..."}` — nunca stack traces en producción
- Paginación en endpoints list: `limit` y `offset` con valores por defecto y máximos

**Tests:**
- Módulos production-ready tienen tests de integración completos
- Mocks no apuntan a implementaciones obsoletas (ej: httpx directo vs AIRouter)
- Fixtures usan TRUNCATE en setup (no teardown) para aislamiento correcto

**Código muerto:**
- Variables/constantes definidas pero nunca usadas (ej: `MAX_LP_PER_WEEK`, `lp_week`)
- Tablas ORM sin endpoints correspondientes (ej: `GymChampionBadge`)
- Flags hardcodeados que deberían ser dinámicos (ej: `season = 1`)

### 4. Calidad — Frontend (JS)

**Event listeners:**
- Inputs numéricos usan `input` (no `change`) para capturar cada pulsación
- Antes de completar una acción, leer valores del DOM síncronamente
- Sin listeners duplicados en re-renders (usar `replaceWith` o `cloneNode`)

**i18n:**
- Texto estático en HTML usa `data-i18n` attributes
- Módulos JS que renderizan strings los sacan de `I18n.t('key')`
- Añadir nuevos strings en los 5 locales: es, en, fr, de, it

**Onboarding:**
- El servidor es autoritario: `onboarding_completed` del JWT/user object tiene prioridad
- Si el servidor dice `false`, limpiar localStorage y forzar wizard
- `syncToServer()` es fire-and-forget (catch vacío), nunca bloquea la UI

### 5. Output esperado

Para cada hallazgo:

```
[CRÍTICO/ALTO/MEDIO/BAJO] Módulo/Archivo:Línea
Descripción concisa del problema
Código problemático (si aplica)
Fix sugerido (código concreto)
```

Al final, resumen:
```
Críticos: N  |  Altos: N  |  Medios: N  |  Bajos: N
Fixes inmediatos: [lista]
Deuda técnica: [lista]
```

## Archivos clave para revisar

```
backend/app/modules/*/router.py      — auth guards, response_model, rate limits
backend/app/modules/*/repository.py  — operaciones atómicas, N+1 queries
backend/app/modules/*/service.py     — lógica de negocio, datos enviados a IA
frontend/js/api.js                   — tryRefresh tri-state, clearAuth logic
frontend/js/gamification.js          — XP guards, idempotencia
frontend/js/ranked.js                — XSS en contact URLs, loading flags
frontend/js/workoutSession.js        — QuotaExceededError, event types
frontend/js/workoutLogger.js         — input vs change, DOM flush
frontend/js/onboarding.js            — server flag handling
frontend/js/app.js                   — RehabLogger mount, Onboarding init
```

## Issues conocidos (ya registrados en CLAUDE.md, no volver a reportar)

- `streak_days: 0` hardcodeado en workout_sessions
- `season = 1` hardcodeado en ranked
- Leaderboard city/national/global devuelven [] vacío
- Usernames en leaderboard muestran UUIDs
- `GymChampionBadge` tabla huérfana
- ai_insights envía datos biométricos sin anonimizar (RGPD P0 — conocido)
- gym_servers sin `response_model` en 5 endpoints
