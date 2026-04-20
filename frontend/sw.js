/* ============================================================
   sw.js — Service Worker HealthStack Pro
   Estrategia: Cache-first para assets estáticos,
               Network-first para CDN externos
   ============================================================ */

const CACHE_NAME    = 'healthstack-v11';
const CDN_CACHE     = 'healthstack-cdn-v2';

// Assets locales a pre-cachear en install
// NOTA: index.html y / se sirven siempre desde la red (network-first)
// para que los cambios en los script-tags sean efectivos de inmediato.
const STATIC_ASSETS = [
  '/css/main.css',
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
  '/js/community.js',
  '/js/onboarding.js',
  '/js/supplements.js',
  '/js/myRecipes.js',
  '/js/timingPlanner.js',
  '/js/app.js',
  '/manifest.json',
];

// ── Install: pre-cachear assets locales ──────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Error en pre-cache:', err))
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

  // CDN externos (Three.js, Chart.js) → Stale-While-Revalidate
  if (url.origin === 'https://cdn.jsdelivr.net') {
    event.respondWith(staleWhileRevalidate(event.request, CDN_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    // index.html y raíz → Network-first siempre (cambios de script-tags efectivos de inmediato)
    if (url.pathname === '/' || url.pathname === '/index.html') {
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

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineFallback();
  }
}

function offlineFallback() {
  return new Response(
    `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Sin conexión — HealthStack Pro</title>
    <style>body{font-family:sans-serif;background:#07070f;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px}
    h1{color:#6c63ff}p{color:#94a3b8;text-align:center;max-width:340px}</style></head>
    <body><h1>📡 Sin conexión</h1>
    <p>HealthStack Pro está funcionando sin red. Tus datos guardados localmente siguen disponibles. Vuelve a intentarlo cuando tengas conexión.</p>
    <button onclick="location.reload()" style="background:#6c63ff;color:white;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:1rem">Reintentar</button>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// ── Mensaje de versión (para debugging) ───────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION')  event.ports[0]?.postMessage({ version: CACHE_NAME });
});
