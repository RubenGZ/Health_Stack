/* ============================================================
   sw.js — Service Worker HealthStack Pro
   Estrategia: Cache-first para assets estáticos,
               Network-first para CDN externos
   ============================================================ */

const CACHE_NAME    = 'healthstack-v102';
const CDN_CACHE     = 'healthstack-cdn-v2';

// Assets locales a pre-cachear en install
// NOTA: index.html y / se sirven siempre desde la red (network-first)
// para que los cambios en los script-tags sean efectivos de inmediato.
const STATIC_ASSETS = [
  '/css/main.css',
  '/css/themes.css',
  '/css/landing.css',
  '/js/heroScene.js',
  '/js/athleteViewer.js',
  '/models/athlete.glb',
  '/js/i18n.js',
  '/js/config.js',
  '/js/api.js',
  '/js/background3d.js',
  '/js/weightTracker.js',
  '/js/macroCalc.js',
  '/js/exercises.js',
  '/js/routineGenerator.js',
  '/js/planner.js',
  '/js/chatbot.js',
  '/js/gamification.js',
  '/js/mobileNav.js',
  '/js/onboarding.js',
  '/js/supplements.js',
  '/js/myRecipes.js',
  '/js/timingPlanner.js',
  '/js/readiness.js',
  '/js/records.js',
  '/js/plan.js',
  '/js/restTimer.js',
  '/js/athleteReceipt.js',
  '/js/macroAutopilot.js',
  '/js/plateauRadar.js',
  '/js/fatigueHeatmap.js',
  '/js/sessionReplay.js',
  '/js/bodyCompForecast.js',
  '/js/autoDeload.js',
  '/js/toast.js',
  '/js/celebrations.js',
  '/js/chartDefaults.js',
  '/js/themeManager.js',
  '/js/dashboard/index.js',
  '/js/pwa/index.js',
  '/js/pwa/transitions.js',
  '/js/components/feedbackWidget.js',
  '/js/app.js',
  '/js/workout/state.js',
  '/js/workout/timer.js',
  '/js/workout/inactivity.js',
  '/js/workout/views.js',
  '/js/workout/idle.js',
  '/js/workout/routine-picker.js',
  '/js/workout/custom-builder.js',
  '/js/workout/pre-workout.js',
  '/js/workout/session-loader.js',
  '/js/workout/workoutSets.js',
  '/js/workout/exercise-meta.js',
  '/js/workout/warmup.js',
  '/js/workout/summary.js',
  '/js/workoutLogger.js',
  '/js/workoutSession.js',
  '/js/workoutHistory.js',
  '/js/workoutInit.js',
  '/js/oneRepMax.js',
  '/js/workoutPR.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/logo-icon-white.svg',
  '/icons/logo-long-white.svg',
];

// ── Install: pre-cachear assets locales ──────────────────────
// Usamos Promise.allSettled (no addAll) para que un 404 aislado
// no aborte el install.
// IMPORTANTE: NO llamamos skipWaiting() aquí. El nuevo SW queda
// en estado "waiting" hasta que el usuario confirme la actualización
// via el banner en pwa/index.js → mensaje SKIP_WAITING.
// Esto evita el bug de activación mid-session (SW nuevo + JS viejo).
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        STATIC_ASSETS.map(url =>
          fetch(url, { cache: 'reload' })
            .then(r => { if (r.ok) cache.put(url, r); })
            .catch(() => { /* asset no disponible — ignorar */ })
        )
      )
    ).then(() => self.skipWaiting())
    // skipWaiting en install: el nuevo SW toma control inmediatamente
    // sin esperar a que el usuario cierre todas las pestañas.
    // Esto evita que el SW viejo sirva JS obsoleto con HTML nuevo,
    // lo que causaría que secciones redeseñadas aparecieran vacías.
  );
});

// ── Activate: limpiar caches viejas ──────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== CDN_CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: estrategia por tipo de recurso ─────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Solo interceptar GET
  if (event.request.method !== 'GET') return;

  // Rutas de API y OAuth → NUNCA interceptar (el browser gestiona redirects y cookies)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/health')) return;

  // CDN externos (Three.js, Chart.js) → Stale-While-Revalidate
  if (url.origin === 'https://cdn.jsdelivr.net') {
    event.respondWith(staleWhileRevalidate(event.request, CDN_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    // index.html y raíz → Network-first siempre
    if (url.pathname === '/' || url.pathname === '/index.html') {
      event.respondWith(networkFirst(event.request));
      return;
    }
    // Admin panel: SIEMPRE network-first — es una ruta protegida que
    // debe recibir siempre los últimos scripts sin importar el cache.
    // Esto evita que admin.html sirva versiones viejas de admin.js/adminSecurity.js.
    if (url.pathname === '/admin' || url.pathname === '/admin.html' ||
        url.pathname.startsWith('/js/admin/')) {
      event.respondWith(networkFirst(event.request));
      return;
    }
    // Resto de assets locales → Cache-first
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
    return;
  }

  // Todo lo demás → Network-first
  event.respondWith(networkFirst(event.request));
});

// ── Estrategias de cache ──────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Sin red y sin cache → offline fallback
    return offlineFallback();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}

async function networkFirst(request, timeoutMs = 5000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(new Request(request, { signal: controller.signal }));
    clearTimeout(timer);
    return response;
  } catch {
    // Timeout o sin red → servir desde caché si existe
    const cached = await caches.match(request);
    return cached || offlineFallback();
  }
}

function offlineFallback() {
  return new Response(
    `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Sin conexión — HealthStack Pro</title>
    <style>body{font-family:sans-serif;background:#07070f;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px}
    h1{color:#c4a561}p{color:#94a3b8;text-align:center;max-width:340px}</style></head>
    <body><h1>📡 Sin conexión</h1>
    <p>HealthStack Pro está funcionando sin red. Tus datos guardados localmente siguen disponibles. Vuelve a intentarlo cuando tengas conexión.</p>
    <button onclick="location.reload()" style="background:#c4a561;color:white;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:1rem">Reintentar</button>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// ── Mensaje de versión (para debugging) ───────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION')  event.ports[0]?.postMessage({ version: CACHE_NAME });
});

