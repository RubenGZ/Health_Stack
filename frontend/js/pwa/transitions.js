// frontend/js/pwa/transitions.js
// Pantallas de transición: actualizaciones SW, mantenimiento, cargas largas, etc.

const FRASES_UPDATE = [
  'Actualizando HealthStack… espera un momento',
  'Cargando mejoras… ya casi',
  'Instalando nueva versión… aguanta',
  'Preparando la siguiente sesión… ya viene',
];

const FRASES_MAINTENANCE = [
  'Servidor en mantenimiento… volvemos enseguida',
  'Recargando el servidor… un momento',
  'Aplicando actualizaciones en el servidor…',
  'El servidor está calentando… como tú antes de entrenar',
];

const _CAT_SVG = `
<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" class="hs-transition-cat">
  <!-- Sombra suelo -->
  <ellipse cx="100" cy="210" rx="55" ry="8" fill="rgba(0,0,0,0.35)"/>

  <!-- Piernas -->
  <rect x="74" y="168" width="20" height="32" rx="10" fill="#2d2b52"/>
  <rect x="106" y="168" width="20" height="32" rx="10" fill="#2d2b52"/>
  <!-- Pies -->
  <ellipse cx="84" cy="200" rx="14" ry="9" fill="#242244"/>
  <ellipse cx="116" cy="200" rx="14" ry="9" fill="#242244"/>

  <!-- Cuerpo (torso musculado) -->
  <ellipse cx="100" cy="148" rx="46" ry="38" fill="#2d2b52"/>
  <!-- Pecho destacado -->
  <ellipse cx="88" cy="138" rx="18" ry="14" fill="#353264" opacity="0.7"/>
  <ellipse cx="112" cy="138" rx="18" ry="14" fill="#353264" opacity="0.7"/>

  <!-- Brazo izquierdo (levantando) -->
  <ellipse cx="44" cy="128" rx="16" ry="22" fill="#2d2b52" transform="rotate(-30 44 128)"/>
  <!-- Bícep izquierdo bump -->
  <ellipse cx="38" cy="116" rx="13" ry="10" fill="#353264" transform="rotate(-20 38 116)"/>
  <!-- Antebrazo izquierdo -->
  <rect x="18" y="100" width="36" height="16" rx="8" fill="#2d2b52" transform="rotate(10 36 108)"/>

  <!-- Brazo derecho (levantando) -->
  <ellipse cx="156" cy="128" rx="16" ry="22" fill="#2d2b52" transform="rotate(30 156 128)"/>
  <!-- Bícep derecho bump -->
  <ellipse cx="162" cy="116" rx="13" ry="10" fill="#353264" transform="rotate(20 162 116)"/>
  <!-- Antebrazo derecho -->
  <rect x="146" y="100" width="36" height="16" rx="8" fill="#2d2b52" transform="rotate(-10 164 108)"/>

  <!-- Barra de la mancuerna -->
  <rect x="10" y="104" width="180" height="10" rx="5" fill="#c4a561"/>
  <!-- Collar izquierdo -->
  <rect x="28" y="100" width="8" height="18" rx="3" fill="#9a7d3f"/>
  <!-- Collar derecho -->
  <rect x="164" y="100" width="8" height="18" rx="3" fill="#9a7d3f"/>
  <!-- Disco izquierdo externo -->
  <ellipse cx="18" cy="109" rx="13" ry="20" fill="#c4a561"/>
  <ellipse cx="18" cy="109" rx="8" ry="14" fill="#9a7d3f"/>
  <ellipse cx="18" cy="109" rx="3" ry="5" fill="#c4a561"/>
  <!-- Disco izquierdo interno -->
  <ellipse cx="32" cy="109" rx="10" ry="16" fill="#b8953a"/>
  <!-- Disco derecho externo -->
  <ellipse cx="182" cy="109" rx="13" ry="20" fill="#c4a561"/>
  <ellipse cx="182" cy="109" rx="8" ry="14" fill="#9a7d3f"/>
  <ellipse cx="182" cy="109" rx="3" ry="5" fill="#c4a561"/>
  <!-- Disco derecho interno -->
  <ellipse cx="168" cy="109" rx="10" ry="16" fill="#b8953a"/>

  <!-- Cuello -->
  <rect x="88" y="102" width="24" height="18" rx="8" fill="#2d2b52"/>

  <!-- Cabeza -->
  <ellipse cx="100" cy="80" rx="40" ry="36" fill="#3a3870"/>

  <!-- Orejas -->
  <polygon points="64,58 72,32 88,56" fill="#3a3870"/>
  <polygon points="136,58 128,32 112,56" fill="#3a3870"/>
  <!-- Interior orejas -->
  <polygon points="68,56 74,38 85,54" fill="rgba(196,165,97,0.4)"/>
  <polygon points="132,56 126,38 115,54" fill="rgba(196,165,97,0.4)"/>

  <!-- Ojos (determinados, entrecerrados) -->
  <ellipse cx="86" cy="75" rx="9" ry="7" fill="white"/>
  <ellipse cx="114" cy="75" rx="9" ry="7" fill="white"/>
  <ellipse cx="87" cy="76" rx="6" ry="5" fill="#1a1830"/>
  <ellipse cx="115" cy="76" rx="6" ry="5" fill="#1a1830"/>
  <!-- Brillo ojos -->
  <circle cx="90" cy="73" r="2" fill="white"/>
  <circle cx="118" cy="73" r="2" fill="white"/>
  <!-- Línea de concentración (cejas) -->
  <path d="M78,66 Q86,62 93,66" stroke="#c4a561" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M107,66 Q114,62 122,66" stroke="#c4a561" stroke-width="2.5" fill="none" stroke-linecap="round"/>

  <!-- Nariz -->
  <polygon points="100,85 96,90 104,90" fill="#f9a8d4"/>
  <!-- Boca (sonrisa determinada) -->
  <path d="M93,90 Q100,95 107,90" stroke="#e879a0" stroke-width="1.8" fill="none" stroke-linecap="round"/>

  <!-- Bigotes izquierda -->
  <line x1="56" y1="84" x2="88" y2="86" stroke="rgba(196,165,97,0.6)" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="54" y1="90" x2="88" y2="90" stroke="rgba(196,165,97,0.6)" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Bigotes derecha -->
  <line x1="144" y1="84" x2="112" y2="86" stroke="rgba(196,165,97,0.6)" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="146" y1="90" x2="112" y2="90" stroke="rgba(196,165,97,0.6)" stroke-width="1.5" stroke-linecap="round"/>

  <!-- Gota de sudor -->
  <path d="M148,42 Q151,34 154,42 Q154,50 151,51 Q148,50 148,42" fill="#60a5fa" opacity="0.85"/>

  <!-- Líneas de esfuerzo (velocidad) -->
  <line x1="0" y1="95" x2="16" y2="95" stroke="rgba(196,165,97,0.4)" stroke-width="2" stroke-linecap="round"/>
  <line x1="0" y1="103" x2="12" y2="103" stroke="rgba(196,165,97,0.25)" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="184" y1="95" x2="200" y2="95" stroke="rgba(196,165,97,0.4)" stroke-width="2" stroke-linecap="round"/>
  <line x1="188" y1="103" x2="200" y2="103" stroke="rgba(196,165,97,0.25)" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

// ─── Update Loader (gatito musculado) ────────────────────────────────────────
export function showUpdateLoader(onDone, countdownMs = 3200) {
  if (document.getElementById('hs-transition-overlay')) return;

  const frase = FRASES_UPDATE[Math.floor(Math.random() * FRASES_UPDATE.length)];

  const overlay = document.createElement('div');
  overlay.id = 'hs-transition-overlay';
  overlay.className = 'hs-transition-overlay';
  overlay.innerHTML = `
    <div class="hs-transition-card">
      <div class="hs-transition-cat-wrap">
        ${_CAT_SVG}
      </div>
      <p class="hs-transition-msg">${frase}</p>
      <div class="hs-transition-bar-wrap">
        <div class="hs-transition-bar" id="hs-transition-bar"></div>
      </div>
      <p class="hs-transition-hint">La app estará lista en un momento</p>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('hs-transition-overlay--visible')));

  const bar = overlay.querySelector('#hs-transition-bar');
  const start = performance.now();

  function tick(now) {
    const pct = Math.min(1, (now - start) / countdownMs);
    bar.style.width = (pct * 100) + '%';
    if (pct < 1) {
      requestAnimationFrame(tick);
    } else {
      onDone?.();
    }
  }
  requestAnimationFrame(tick);
}

// ─── Generic page loader ──────────────────────────────────────────────────────
export function showPageLoader(message = 'Cargando…') {
  if (document.getElementById('hs-page-loader')) return;
  const el = document.createElement('div');
  el.id = 'hs-page-loader';
  el.className = 'hs-page-loader';
  el.innerHTML = `<div class="hs-page-loader-inner">
    <div class="hs-page-loader-spinner"></div>
    <p class="hs-page-loader-msg">${message}</p>
  </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('hs-page-loader--visible')));
}

export function hidePageLoader() {
  const el = document.getElementById('hs-page-loader');
  if (!el) return;
  el.classList.remove('hs-page-loader--visible');
  setTimeout(() => el.remove(), 300);
}

// ─── Maintenance / 502 screen ─────────────────────────────────────────────────
let _maintenanceShown = false;
let _maintenancePoll  = null;   // referencia al interval para poder cancelarlo externamente

export function showMaintenanceScreen() {
  if (_maintenanceShown) return;
  if (document.getElementById('hs-maintenance-overlay')) return;
  _maintenanceShown = true;

  const frase = FRASES_MAINTENANCE[Math.floor(Math.random() * FRASES_MAINTENANCE.length)];

  const overlay = document.createElement('div');
  overlay.id = 'hs-maintenance-overlay';
  overlay.className = 'hs-transition-overlay';
  overlay.innerHTML = `
    <div class="hs-transition-card">
      <div class="hs-transition-cat-wrap">
        ${_CAT_SVG}
      </div>
      <p class="hs-transition-msg">${frase}</p>
      <div class="hs-maintenance-dots">
        <span></span><span></span><span></span>
      </div>
      <p class="hs-transition-hint">Reintentando automáticamente…</p>
    </div>`;

  document.body.appendChild(overlay);
  // Forzar reflow ANTES del rAF para que la transición CSS arranque en el mismo frame
  // — evita el flash de 2 frames donde la página muestra errores antes de ocultarse.
  void overlay.offsetHeight;
  requestAnimationFrame(() => overlay.classList.add('hs-transition-overlay--visible'));

  // Polling: _nativeFetch para no pasar por el interceptor y no crear bucle infinito
  _maintenancePoll = setInterval(async () => {
    try {
      const r = await _nativeFetch('/health', { cache: 'no-store' });
      if (r.ok) {
        clearInterval(_maintenancePoll);
        _maintenancePoll = null;
        overlay.classList.remove('hs-transition-overlay--visible');
        setTimeout(() => { overlay.remove(); _maintenanceShown = false; window.location.reload(); }, 500);
      }
    } catch {}
  }, 5000);
}

export function hideMaintenanceScreen() {
  const el = document.getElementById('hs-maintenance-overlay');
  if (!el) return;
  // Cancelar el polling activo antes de quitar la pantalla
  if (_maintenancePoll) { clearInterval(_maintenancePoll); _maintenancePoll = null; }
  _maintenanceShown = false;
  el.classList.remove('hs-transition-overlay--visible');
  setTimeout(() => el.remove(), 400);
}

// ─── Fetch interceptor global ─────────────────────────────────────────────────
// Guardamos la referencia ANTES de sobrescribir para usarla en el polling
const _nativeFetch = window.fetch.bind(window);

(function _installMaintenanceDetector() {
  window.fetch = async function (...args) {
    const url = String(args[0] instanceof Request ? args[0].url : args[0]);
    // No interceptar /health ni rutas admin (para que el admin pueda desactivar)
    const isApi    = url.includes('/api/') && !url.includes('/api/v1/admin');
    // No mostrar pantalla de mantenimiento si el usuario ESTÁ en el panel de admin
    const isAdminPage = window.location.pathname.startsWith('/admin');
    try {
      const res = await _nativeFetch(...args);
      if ((res.status === 502 || res.status === 503) && isApi && !isAdminPage) {
        // Leer header para distinguir mantenimiento activo de 502 real
        const isMaintenance = res.headers.get('X-Maintenance') === 'true' || res.status === 503;
        if (isMaintenance) showMaintenanceScreen();
      } else if (res.ok && isApi && _maintenanceShown) {
        // Solo ocultar cuando una llamada API real vuelve OK —
        // no cuando un asset estático (font, CSS) se sirve desde caché con 200.
        hideMaintenanceScreen();
      }
      return res;
    } catch (err) {
      if (isApi && !isAdminPage) showMaintenanceScreen();
      throw err;
    }
  };
})();
