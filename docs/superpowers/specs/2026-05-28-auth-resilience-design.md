# Auth Resilience — Sesión Silenciosa Total

**Fecha:** 2026-05-28  
**Scope:** Frontend PWA (vanilla JS SPA)  
**Objetivo:** El usuario nunca es forzado a hacer login manual después de la primera vez, incluso tras días sin usar la app, suspensión iOS, o cortes de red.

---

## Contexto y estado actual

Ya implementado en `api.js` v71:
- Mutex refresh (`_refreshPromise`) — evita races de refresh paralelos
- Refresh proactivo 60s antes de expirar (`_scheduleProactiveRefresh`)
- Soporte de rotación de refresh token (`if (data.refresh_token)`)
- Pre-check en `request()`: si el token expiró antes del fetch, refrescar primero
- Retry reactivo 401 con mutex

**Bug crítico pendiente:** `auth-gate.js` borra el `refresh_token` de localStorage cuando el access token expira, forzando un login manual innecesario aunque el refresh token fuera completamente válido.

**Edge cases no cubiertos:**
- iOS PWA: los timers JS mueren cuando la app se suspende en background
- Offline → Online: el timer proactivo no se reinicia al reconectar
- Fallo de red en refresh proactivo: no hay retry programado

---

## Cambios — 3 ficheros, todos quirúrgicos

### 1. `frontend/js/auth-gate.js`

**Problema:** Al detectar access token expirado, el gate borra también `REFRESH_KEY` y `USER_KEY`, destruyendo la capacidad de renovación silenciosa.

**Fix:** Solo borrar el access token expirado. El refresh token y los datos de usuario quedan intactos para que `api.js` init() pueda renovar silenciosamente.

```diff
- localStorage.removeItem(TOKEN_KEY);
- localStorage.removeItem(REFRESH_KEY);
- localStorage.removeItem(USER_KEY);
+ localStorage.removeItem(TOKEN_KEY); // solo el expirado
+ // REFRESH_KEY y USER_KEY se conservan — api.js los usará para renovar silenciosamente
  window.location.replace('/?action=register');
```

**Invariante de seguridad:** El gate sigue redirigiendo al modal de login. Si el silent refresh falla (refresh token inválido o expirado), el modal permanece visible y el usuario hace login normalmente. No se expone contenido sin autenticación.

---

### 2. `frontend/js/api.js`

#### 2a. Silent refresh en boot (init)

Cuando la app arranca con refresh token disponible pero sin access token (o expirado), renovar antes de que el usuario interactúe:

```js
async function init() {
  await startOnlineMonitor();

  if (isLoggedIn()) {
    _applyPlanFromUser(getUser());
    _scheduleProactiveRefresh(getToken());
  } else if (getRefresh()) {
    // Access token ausente/expirado pero refresh disponible → renovar en silencio
    _doRefreshOnce(); // dispara hs:login si tiene éxito
  }
  // ...resto sin cambios
}
```

#### 2b. iOS resume + bfcache (visibilitychange / pageshow)

iOS PWA puede suspender timers cuando la app va al background. Al retomar el foco, verificar y reprogramar:

```js
function _checkTokenOnResume() {
  const token = getToken();
  if (!token && getRefresh()) { _doRefreshOnce(); return; }
  if (token && _isTokenExpired(token)) { _doRefreshOnce(); return; }
  _scheduleProactiveRefresh(token); // reprogramar: el timer puede haber muerto
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') _checkTokenOnResume();
});

window.addEventListener('pageshow', (e) => {
  if (e.persisted) _checkTokenOnResume(); // bfcache restore
});
```

#### 2c. Offline → Online (evento 'online')

Cuando el dispositivo reconecta, el token puede haber expirado sin que ningún timer se disparara:

```js
window.addEventListener('online', async () => {
  await checkBackend();
  if (_backendOnline) {
    const token = getToken();
    if (!token && getRefresh()) { _doRefreshOnce(); }
    else if (token && _isTokenExpired(token)) { _doRefreshOnce(); }
    else { _scheduleProactiveRefresh(token); } // reiniciar timer
  }
});
```

#### 2d. Retry en fallo de red (_doRefreshOnce)

Si el refresh proactivo falla por red, reprogramar un reintento en 30 segundos en lugar de quedarse sin timer:

```js
async function _doRefreshOnce() {
  if (!getRefresh()) return;
  const result = await _acquireRefresh();
  if (result === 'ok') {
    _scheduleProactiveRefresh(getToken());
  } else if (result === 'invalid') {
    clearAuth();
    window.dispatchEvent(new Event('hs:logout'));
  } else { // 'network' — sin conexión
    if (_proactiveTimer) clearTimeout(_proactiveTimer);
    _proactiveTimer = setTimeout(_doRefreshOnce, 30_000); // reintento en 30s
  }
}
```

---

### 3. `frontend/js/auth.js`

**Añadir listener `hs:login` en init()** para cerrar automáticamente el modal si un silent refresh tiene éxito mientras está visible (escenario: usuario abre app con token expirado, modal aparece brevemente y se cierra solo):

```diff
  window.addEventListener('hs:login',  () => updateUserChip());
+ window.addEventListener('hs:login',  () => closeModal());
  window.addEventListener('hs:logout', () => updateUserChip());
```

*(O fusionar en un solo listener que llame a ambas)*

---

## Flujos cubiertos

| Escenario | Antes | Después |
|-----------|-------|---------|
| Token expirado, app en background 2h | Fuerza login (refresh borrado) | Silent refresh automático |
| iOS PWA suspendida 30 min | Timer muerto, 401 en primer request | `visibilitychange` reactiva el token al retomar |
| Sin red 10 min, luego reconecta | Token expirado, necesita manual | `online` event dispara refresh inmediato |
| Refresh proactivo falla por red | Sin timer, 401 en próximo request | Retry en 30s |
| Dos tabs abiertas, ambas hacen 401 | Race condition, segunda falla | Mutex: la segunda espera a la primera |

---

## Lo que NO cambia

- El access token sigue siendo validado en cada request
- El logout manual sigue siendo explícito (el usuario lo pide)
- Si el refresh token está inválido o expirado, el usuario ve el modal de login (comportamiento correcto)
- La arquitectura offline-first (fallback localStorage) no se toca

---

## Service Worker

Bumpar `CACHE_NAME` a `healthstack-v72` en `sw.js` después de aplicar los cambios para que los usuarios en iOS/Android reciban los nuevos ficheros JS en la próxima visita.

---

## Orden de implementación

1. Fix `auth-gate.js` (1 línea: quitar `removeItem(REFRESH_KEY)` y `removeItem(USER_KEY)`)
2. Actualizar `_doRefreshOnce` en `api.js` (retry 30s)
3. Añadir `init()` branch `else if (getRefresh())`
4. Añadir `_checkTokenOnResume` + listeners `visibilitychange`, `pageshow`, `online`
5. Añadir `hs:login → closeModal()` en `auth.js`
6. Bump SW a v72

Cada cambio es independiente y puede hacer commit por separado.
