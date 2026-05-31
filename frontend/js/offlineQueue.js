// frontend/js/offlineQueue.js
// Cola de sincronización offline para HealthStack Pro PWA.
//
// Cuando el usuario está sin conexión, las acciones críticas (guardar entreno,
// registrar peso, guardar receta) se encolan en localStorage.
// Al recuperar conexión, se reproducen automáticamente y se notifica al usuario.
//
// Acciones que se encolan:
//   - POST /api/v1/workout          (guardar sesión de entreno)
//   - POST /api/v1/health           (registrar peso/biometría)
//   - PATCH /api/v1/auth/me         (actualizar perfil)
//   - POST /api/v1/nutrition/recipes (guardar receta)
//
// Acciones que NO se encolan (no tiene sentido offline):
//   - GET (lecturas) — la app usa caché del SW
//   - POST /api/v1/telemetry — fire-and-forget, se pierde sin problema
//   - POST /api/v1/ai-* — requieren servidor, no tienen sentido sin conexión

(function () {
  'use strict';

  var QUEUE_KEY    = 'hs_offline_queue';
  var MAX_QUEUE    = 50;       // máximo de acciones encoladas
  var MAX_AGE_MS   = 7 * 24 * 60 * 60 * 1000; // 7 días — después se descartan

  // Endpoints que se encolan cuando hay fallo de red
  var QUEUEABLE_PATTERNS = [
    /\/api\/v1\/workout(\?.*)?$/,
    /\/api\/v1\/health(\?.*)?$/,
    /\/api\/v1\/auth\/me$/,
    /\/api\/v1\/nutrition\/recipes(\?.*)?$/,
    /\/api\/v1\/gamification/,
  ];

  // ── Helpers de cola ──────────────────────────────────────────────────────────

  function _getQueue() {
    try {
      var raw = localStorage.getItem(QUEUE_KEY);
      var items = raw ? JSON.parse(raw) : [];
      // Descartar items muy antiguos
      var now = Date.now();
      return items.filter(function (i) { return now - i.ts < MAX_AGE_MS; });
    } catch { return []; }
  }

  function _saveQueue(queue) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(0, MAX_QUEUE)));
    } catch { /* quota — no bloquear */ }
  }

  function _isQueueable(url, method) {
    if (!method || method.toUpperCase() === 'GET') return false;
    return QUEUEABLE_PATTERNS.some(function (pat) { return pat.test(url); });
  }

  function _authHeaders() {
    var token = localStorage.getItem('hs_access_token') ||
                sessionStorage.getItem('hs_access_token');
    return token ? { 'Content-Type': 'application/json',
                     'Authorization': 'Bearer ' + token } : {};
  }

  // ── Encolar acción ────────────────────────────────────────────────────────────

  function enqueue(url, method, body, headers) {
    var queue = _getQueue();
    queue.push({
      id:      (typeof crypto !== 'undefined' && crypto.randomUUID)
               ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      url:     url,
      method:  method || 'POST',
      body:    typeof body === 'string' ? body : JSON.stringify(body),
      headers: headers || _authHeaders(),
      ts:      Date.now(),
    });
    _saveQueue(queue);
    _showOfflineNotice();
    console.info('[OfflineQueue] Enqueued:', method, url, '— queue size:', queue.length);
  }

  // ── Reproducir cola ───────────────────────────────────────────────────────────

  async function replay() {
    var queue = _getQueue();
    if (!queue.length) return;

    var succeeded = [];
    var remaining = [];

    for (var i = 0; i < queue.length; i++) {
      var item = queue[i];
      try {
        var resp = await fetch(item.url, {
          method:  item.method,
          headers: Object.assign({}, item.headers, _authHeaders()), // refresh token
          body:    item.body,
        });
        if (resp.ok || resp.status === 409) {
          // 409 Conflict = ya existe (idempotente) → también se considera éxito
          succeeded.push(item.id);
        } else if (resp.status >= 400 && resp.status < 500) {
          // 4xx = error del cliente, no vale la pena reintentar
          succeeded.push(item.id); // descartar
          console.warn('[OfflineQueue] Discarding 4xx item:', item.url, resp.status);
        } else {
          remaining.push(item); // 5xx → reintentar después
        }
      } catch (e) {
        remaining.push(item); // sin red todavía
      }
    }

    _saveQueue(remaining);

    if (succeeded.length > 0 && typeof showToast === 'function') {
      showToast(
        '📶 ' + succeeded.length + ' acción' + (succeeded.length > 1 ? 'es' : '') +
        ' sincronizada' + (succeeded.length > 1 ? 's' : '') + ' correctamente',
        'success'
      );
    }

    _hideOfflineNotice();
    console.info('[OfflineQueue] Replay: ' + succeeded.length + ' ok, ' + remaining.length + ' pending');
  }

  // ── Banner offline ────────────────────────────────────────────────────────────

  function _showOfflineNotice() {
    var existing = document.getElementById('hs-offline-queue-notice');
    if (existing) return;
    var el = document.createElement('div');
    el.id = 'hs-offline-queue-notice';
    el.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:9998;' +
      'background:rgba(245,158,11,0.95);color:#07070f;' +
      'padding:8px 16px;font-size:0.78rem;font-weight:600;text-align:center;' +
      'display:flex;align-items:center;justify-content:center;gap:8px;' +
      'backdrop-filter:blur(8px);';
    el.innerHTML = '📴 Sin conexión — tus datos se guardarán cuando vuelva la red';
    document.body.appendChild(el);
  }

  function _hideOfflineNotice() {
    var el = document.getElementById('hs-offline-queue-notice');
    if (el) {
      el.style.transition = 'opacity 0.4s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 400);
    }
  }

  // ── Interceptar fetch para encolar automáticamente ────────────────────────────
  // Solo intercepta si la llamada falla por error de red (TypeError: Failed to fetch)
  // No intercepta errores HTTP (4xx/5xx) — esos son errores del servidor, no de red.

  var _origFetch = window.fetch;

  window.fetch = function (input, init) {
    var url    = typeof input === 'string' ? input : (input && input.url) || '';
    var method = (init && init.method) || (input && input.method) || 'GET';

    return _origFetch.call(window, input, init).catch(function (err) {
      // Solo encolar si es fallo de red (offline) y el endpoint es crítico
      if (err instanceof TypeError && _isQueueable(url, method)) {
        var body = init && init.body;
        var hdrs = init && init.headers;
        enqueue(url, method, body, hdrs);
        // Devolver una respuesta sintética para que el UI no se rompa
        return new Response(JSON.stringify({ queued: true, offline: true }), {
          status: 202,
          headers: { 'Content-Type': 'application/json', 'X-Offline-Queued': '1' },
        });
      }
      throw err; // re-lanzar si no es encolable
    });
  };

  // ── Eventos de red ────────────────────────────────────────────────────────────

  window.addEventListener('online', function () {
    console.info('[OfflineQueue] Back online — replaying queue');
    setTimeout(replay, 800); // pequeño delay para que la red se estabilice
  });

  window.addEventListener('offline', function () {
    _showOfflineNotice();
  });

  // Al cargar, si hay cola pendiente y hay red → reproducir
  if (navigator.onLine) {
    var pending = _getQueue();
    if (pending.length > 0) {
      console.info('[OfflineQueue] Found', pending.length, 'pending items on load — replaying');
      setTimeout(replay, 2000); // esperar a que la app se inicialice
    }
  } else {
    _showOfflineNotice();
  }

  // ── API pública ───────────────────────────────────────────────────────────────

  window.OfflineQueue = {
    enqueue:  enqueue,
    replay:   replay,
    getQueue: _getQueue,
    size:     function () { return _getQueue().length; },
  };

})();
