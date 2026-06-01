/* ============================================================
   api.js — Cliente HTTP para el backend HealthStack Pro
   v2.0 — Cubre: Auth, Health, Routines, Community, Gamification

   ESTRATEGIA OFFLINE-FIRST:
   - Si el backend no responde → fallback transparente a localStorage
   - Los módulos JS no necesitan cambiar — API.health.*, API.routines.*, etc.
     devuelven promesas que se resuelven con los datos correctos en ambos casos.
   - isOnline() detecta si el backend está disponible (ping cada 60s)
   ============================================================ */

const API = (function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────
  const IS_PROD    = location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
  const BASE_URL   = IS_PROD
    ? `https://${location.hostname}/api/v1`
    : 'http://localhost:8000/api/v1';

  const TOKEN_KEY   = 'hs_access_token';
  const REFRESH_KEY = 'hs_refresh_token';
  const USER_KEY    = 'hs_user';

  let _backendOnline  = false;   // se actualiza con checkBackend()
  let _checkInterval  = null;
  let _refreshPromise = null;   // mutex: solo un refresh en vuelo a la vez
  let _proactiveTimer = null;   // timer para refresh proactivo antes de expirar

  // ── JWT helpers ────────────────────────────────────────────
  function _decodeExp(token) {
    try { return JSON.parse(atob(token.split('.')[1])).exp || 0; }
    catch { return 0; }
  }
  function _isTokenExpired(token) {
    const exp = _decodeExp(token);
    return exp > 0 && Date.now() / 1000 >= exp;
  }
  // Programa un refresh 60 s antes de que expire el access token
  function _scheduleProactiveRefresh(token) {
    if (_proactiveTimer) clearTimeout(_proactiveTimer);
    if (!token) return;
    const exp = _decodeExp(token);
    if (!exp) return;
    const msLeft = exp * 1000 - Date.now() - 60_000; // 60 s de margen
    if (msLeft <= 0) { _doRefreshOnce(); return; }
    _proactiveTimer = setTimeout(_doRefreshOnce, msLeft);
  }
  async function _doRefreshOnce() {
    if (!getRefresh()) return;
    const result = await _acquireRefresh();
    if (result === 'ok') {
      _scheduleProactiveRefresh(getToken()); // reprogramar para el nuevo token
    } else if (result === 'invalid') {
      clearAuth();
      window.dispatchEvent(new Event('hs:logout'));
    } else {
      // 'network' — sin conexión: no cerrar sesión, reintento en 30 s
      // (más corto que el timer proactivo de 60 s para recuperar antes)
      if (_proactiveTimer) clearTimeout(_proactiveTimer);
      _proactiveTimer = setTimeout(_doRefreshOnce, 30_000);
    }
  }

  // Comprueba el estado del token al retomar el foco (iOS resume, bfcache).
  // iOS puede matar setTimeout mientras la app está en background.
  function _checkTokenOnResume() {
    const token = getToken();
    if (!token && getRefresh()) { _doRefreshOnce(); return; }
    if (token && _isTokenExpired(token)) { _doRefreshOnce(); return; }
    _scheduleProactiveRefresh(token); // reprogramar por si el timer murió en background
  }
  // Mutex: devuelve la promesa en curso si ya hay un refresh activo
  function _acquireRefresh() {
    if (_refreshPromise) return _refreshPromise;
    _refreshPromise = tryRefresh().finally(() => { _refreshPromise = null; });
    return _refreshPromise;
  }

  // ── Token helpers ──────────────────────────────────────────
  function getToken()   { return localStorage.getItem(TOKEN_KEY); }
  function getRefresh() { return localStorage.getItem(REFRESH_KEY); }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch { return null; }
  }

  function saveAuth(data) {
    try {
      localStorage.setItem(TOKEN_KEY,   data.access_token);
      localStorage.setItem(REFRESH_KEY, data.refresh_token);
      localStorage.setItem(USER_KEY,    JSON.stringify(data.user));
    } catch (e) {
      // QuotaExceededError — storage lleno (puede ocurrir en iOS en modo incógnito)
      console.warn('[API] saveAuth: localStorage quota exceeded, auth no persistida', e);
    }
    _applyPlanFromUser(data.user);
    _scheduleProactiveRefresh(data.access_token); // renovar 60 s antes de que expire
    window.dispatchEvent(new Event('hs:login'));
    // Datos de usuario frescos del servidor (register/login) ya disponibles.
    // hs:user-loaded es la señal autoritativa para gates como SmartOnboarding v2.
    _dispatchUserLoaded(data.user);
  }

  // Señal: los datos del usuario provienen del servidor y están en hs_user.
  // Lo consumen gates que dependen de campos como onboarding_v2_completed.
  function _dispatchUserLoaded(user) {
    window.dispatchEvent(new CustomEvent('hs:user-loaded', { detail: { user: user || getUser() } }));
  }

  // Refresca hs_user desde GET /auth/me y emite hs:user-loaded con datos
  // autoritativos. Se usa en arranque en frío (PWA cold start) donde hs_user
  // puede estar obsoleto (p.ej. onboarding completado en otro dispositivo).
  async function refreshUser() {
    try {
      const fresh = await me();
      if (fresh && fresh.id) {
        const current = getUser() || {};
        const merged  = { ...current, ...fresh };
        localStorage.setItem(USER_KEY, JSON.stringify(merged));
        _dispatchUserLoaded(merged);
        return merged;
      }
    } catch { /* offline / 401 — no bloquear; gates usan hs_user en cache */ }
    // Aun sin red, emitir con lo que haya en cache para que los gates corran.
    _dispatchUserLoaded(getUser());
    return getUser();
  }

  function _applyPlanFromUser(user) {
    if (!user) return;
    if (typeof Plan === 'undefined') return;
    // Plan from DB (via JWT) takes precedence; fallback to role-based derivation
    var targetPlan = user.plan || 'free';
    if (!targetPlan || targetPlan === 'free') {
      var role = user.role || 'user';
      if (role === 'admin') targetPlan = 'elite';
    }
    localStorage.setItem('hs_plan', targetPlan);
    if (targetPlan !== 'free') {
      Plan.set(targetPlan);
      Plan.updateBadge();
      Plan.applyNavLocks();
      Plan.applyFeatureLocks();
    }
  }

  // ── Plan upgrade celebration ──────────────────────────────
  const _PLAN_RANK = { free: 0, pro: 1, elite: 2 };

  function _isPlanUpgrade(oldPlan, newPlan) {
    return (_PLAN_RANK[newPlan] || 0) > (_PLAN_RANK[oldPlan] || 0);
  }

  function _showPlanUpgradeModal(newPlan) {
    if (document.getElementById('hs-plan-upgrade-modal')) return; // ya visible

    const isPro   = newPlan === 'pro';
    const isElite = newPlan === 'elite';
    const label   = isElite ? 'ELITE' : 'PRO';
    const color   = isElite ? '#e8c97a' : '#c4a561';

    const TITLES = {
      pro:   '¡Bienvenido a Pro!',
      elite: '¡Bienvenido a Elite!',
    };
    const SUBTITLES = {
      pro:   'Tu cuenta ha sido actualizada. Tienes acceso completo a todas las funciones.',
      elite: 'Máximo nivel desbloqueado. Disfruta de la experiencia premium completa.',
    };
    const PERKS = {
      pro: [
        'Rutinas personalizadas con IA',
        'Coach de entreno post-sesión',
        'Análisis de fatiga y plateau',
        'Historial ilimitado',
      ],
      elite: [
        'Todo lo de Pro incluido',
        'Protocolos de rehabilitación IA',
        'Previsión de composición corporal',
        'Session replay y análisis avanzado',
      ],
    };

    const perksHtml = (PERKS[newPlan] || []).map(p =>
      `<li class="hpu-perk">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
        ${p}
      </li>`
    ).join('');

    // Partículas SVG (estrellas decorativas, sin emojis)
    const starsHtml = [
      { x: 18, y: 12, s: 1.0 }, { x: 80, y: 8, s: 0.7 },
      { x: 50, y: 6, s: 0.6 },  { x: 92, y: 20, s: 0.5 },
      { x: 8,  y: 28, s: 0.5 },
    ].map(({ x, y, s }, i) =>
      `<svg class="hpu-star hpu-star--${i}" style="left:${x}%;top:${y}%;transform:scale(${s})"
           width="12" height="12" viewBox="0 0 24 24" fill="${color}" aria-hidden="true">
         <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
       </svg>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.id = 'hs-plan-upgrade-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', TITLES[newPlan] || 'Plan actualizado');
    overlay.innerHTML = `
      <div class="hpu-backdrop"></div>
      <div class="hpu-card">
        ${starsHtml}
        <button class="hpu-close" aria-label="Cerrar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        <div class="hpu-badge-wrap">
          <span class="hpu-plan-badge">${label}</span>
        </div>

        <h2 class="hpu-title">${TITLES[newPlan] || '¡Plan actualizado!'}</h2>
        <p class="hpu-subtitle">${SUBTITLES[newPlan] || ''}</p>

        <ul class="hpu-perks">${perksHtml}</ul>

        <button class="hpu-cta">Explorar ${label}</button>
      </div>`;

    // Inyectar estilos una vez
    if (!document.getElementById('hs-plan-upgrade-styles')) {
      const style = document.createElement('style');
      style.id = 'hs-plan-upgrade-styles';
      style.textContent = `
        #hs-plan-upgrade-modal {
          position: fixed; inset: 0; z-index: 100000;
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
        }
        .hpu-backdrop {
          position: absolute; inset: 0;
          background: rgba(7,7,15,0.85);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .hpu-card {
          position: relative; z-index: 1;
          background: #0f0f1a;
          border: 1px solid rgba(196,165,97,0.3);
          border-top: 2px solid #c4a561;
          border-radius: 20px;
          padding: 32px 28px 28px;
          max-width: 360px; width: 100%;
          text-align: center;
          box-shadow: 0 0 0 1px rgba(196,165,97,0.08),
                      0 32px 64px rgba(0,0,0,0.6),
                      0 0 80px rgba(196,165,97,0.08);
          overflow: hidden;
          animation: hpu-enter 380ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes hpu-enter {
          from { opacity: 0; transform: scale(0.88) translateY(16px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .hpu-close {
          position: absolute; top: 14px; right: 14px;
          background: rgba(255,255,255,0.06); border: none;
          border-radius: 50%; width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: rgba(255,255,255,0.45);
          transition: background 150ms, color 150ms;
          -webkit-tap-highlight-color: transparent;
        }
        .hpu-close:hover { background: rgba(255,255,255,0.12); color: #e2e8f0; }
        .hpu-badge-wrap { margin-bottom: 16px; }
        .hpu-plan-badge {
          display: inline-block;
          padding: 4px 14px;
          background: rgba(196,165,97,0.12);
          border: 1px solid rgba(196,165,97,0.4);
          border-radius: 99px;
          color: #c4a561;
          font-size: 0.72rem; font-weight: 800;
          letter-spacing: 0.12em;
          background: linear-gradient(135deg, rgba(196,165,97,0.18), rgba(232,201,122,0.08));
          animation: hpu-badge-shimmer 2.4s ease-in-out infinite;
          background-size: 200% 100%;
        }
        @keyframes hpu-badge-shimmer {
          0%   { background-position: -100% 0; }
          100% { background-position: 300% 0; }
        }
        .hpu-title {
          color: #e2e8f0; font-size: 1.35rem; font-weight: 700;
          letter-spacing: -0.03em; margin: 0 0 8px;
          line-height: 1.2;
        }
        .hpu-subtitle {
          color: rgba(255,255,255,0.45); font-size: 0.875rem;
          line-height: 1.5; margin: 0 0 20px;
        }
        .hpu-perks {
          list-style: none; margin: 0 0 24px; padding: 0;
          text-align: left;
          display: flex; flex-direction: column; gap: 10px;
        }
        .hpu-perk {
          display: flex; align-items: center; gap: 10px;
          color: #e2e8f0; font-size: 0.82rem;
        }
        .hpu-perk svg { color: #c4a561; flex-shrink: 0; }
        .hpu-cta {
          width: 100%;
          padding: 13px 20px;
          background: linear-gradient(135deg, #c4a561, #e8c97a);
          color: #07070f; font-weight: 700; font-size: 0.9rem;
          border: none; border-radius: 12px; cursor: pointer;
          box-shadow: 0 4px 20px rgba(196,165,97,0.35);
          transition: transform 150ms, box-shadow 150ms;
          -webkit-tap-highlight-color: transparent;
          font-family: inherit;
        }
        .hpu-cta:active { transform: scale(0.97); box-shadow: 0 2px 10px rgba(196,165,97,0.2); }
        .hpu-cta:hover  { box-shadow: 0 6px 28px rgba(196,165,97,0.45); }
        /* Estrellas decorativas */
        .hpu-star {
          position: absolute; pointer-events: none;
          animation: hpu-twinkle 2s ease-in-out infinite;
        }
        .hpu-star--0 { animation-delay: 0s;    }
        .hpu-star--1 { animation-delay: 0.4s;  }
        .hpu-star--2 { animation-delay: 0.8s;  }
        .hpu-star--3 { animation-delay: 1.2s;  }
        .hpu-star--4 { animation-delay: 1.6s;  }
        @keyframes hpu-twinkle {
          0%, 100% { opacity: 0.25; transform: scale(var(--s,1)); }
          50%       { opacity: 0.9;  transform: scale(calc(var(--s,1) * 1.3)); }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(overlay);

    // Cerrar al hacer click fuera o en botones
    const close = () => {
      overlay.style.animation = 'none';
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 200ms ease';
      overlay.querySelector('.hpu-card').style.animation = 'none';
      overlay.querySelector('.hpu-card').style.transition = 'transform 200ms ease, opacity 200ms ease';
      overlay.querySelector('.hpu-card').style.transform = 'scale(0.95) translateY(8px)';
      overlay.querySelector('.hpu-card').style.opacity = '0';
      setTimeout(() => overlay.remove(), 200);
    };

    overlay.querySelector('.hpu-close').addEventListener('click', close);
    overlay.querySelector('.hpu-cta').addEventListener('click', close);
    overlay.querySelector('.hpu-backdrop').addEventListener('click', close);
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function isLoggedIn()  { return !!getToken(); }
  function isOnline()    { return _backendOnline; }

  // ── Backend availability check ────────────────────────────
  async function checkBackend() {
    try {
      const res = await fetch(`${BASE_URL.replace('/api/v1', '')}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      _backendOnline = res.ok;
    } catch {
      _backendOnline = false;
    }
    return _backendOnline;
  }

  async function startOnlineMonitor() {
    await checkBackend();
    _checkInterval = setInterval(checkBackend, 60_000);
  }

  // ── Fetch wrapper ─────────────────────────────────────────
  async function request(path, options = {}) {
    const url     = `${BASE_URL}${path}`;
    let   token   = getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };

    // Pre-check: si el token ya expiró, refrescar ANTES de hacer el request
    // evita la vuelta extra de 401 y el parpadeo de UI
    if (token && _isTokenExpired(token) && getRefresh()) {
      const pre = await _acquireRefresh();
      if (pre === 'invalid') {
        clearAuth();
        window.dispatchEvent(new Event('hs:logout'));
        return null;
      } else if (pre === 'network') {
        throw new Error('Sin conexión — inténtalo de nuevo');
      }
      token = getToken(); // actualizar con el nuevo token
    }

    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(8000) });

    // 401 reactivo (race condition o clock skew) → reintentar con mutex
    if (res.status === 401 && getRefresh()) {
      const refreshResult = await _acquireRefresh(); // mutex: si ya hay refresh, espera
      if (refreshResult === 'ok') {
        headers['Authorization'] = `Bearer ${getToken()}`;
        res = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(8000) });
      } else if (refreshResult === 'invalid') {
        // El servidor rechazó explícitamente el refresh — sesión caducada
        clearAuth();
        window.dispatchEvent(new Event('hs:logout'));
        return null;
      } else {
        // 'network' — sin conexión; preservar sesión, dejar que el request falle
        throw new Error('Sin conexión — inténtalo de nuevo');
      }
    }

    if (!res.ok) {
      // 503 con cabecera de mantenimiento → la pantalla del gato ya está activa.
      // Devolver null silenciosamente para que los módulos no actualicen la UI con errores.
      if (res.status === 503 && res.headers.get('X-Maintenance') === 'true') {
        return null;
      }
      const err = await res.json().catch(() => ({ detail: `Error ${res.status}` }));
      let message;
      if (Array.isArray(err.detail)) {
        message = err.detail.map(e => e.msg || String(e)).join('. ');
      } else {
        message = err.detail || err.error || `HTTP ${res.status}`;
      }
      throw new Error(message);
    }

    return res.status === 204 ? null : res.json();
  }

  // Returns: 'ok' | 'invalid' | 'network'
  // Only 'invalid' (explicit 4xx from server) should log the user out.
  // 'network' (timeout, offline) should preserve the session.
  async function tryRefresh() {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refresh_token: getRefresh() }),
        signal:  AbortSignal.timeout(5000),
      });
      if (res.status === 401 || res.status === 403) return 'invalid';
      if (!res.ok) return 'network'; // 5xx or other transient
      const data = await res.json();
      localStorage.setItem(TOKEN_KEY, data.access_token);
      if (data.refresh_token) {
        localStorage.setItem(REFRESH_KEY, data.refresh_token); // rotación de tokens
      }
      // Decodificar el nuevo JWT para propagar plan y role actualizados.
      // El admin puede cambiar el plan/rol en cualquier momento; el próximo refresh
      // (proactivo o al retomar foco) propaga el cambio sin que el usuario salga.
      try {
        const raw     = data.access_token.split('.')[1];
        const payload = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/')));
        const current = getUser() || {};
        const updated = {
          ...current,
          plan: payload.plan || current.plan || 'free',
          role: payload.role || current.role || 'user',
        };
        localStorage.setItem(USER_KEY, JSON.stringify(updated));
        // Detectar upgrade de plan para mostrar popup de felicitación
        const oldPlan = current.plan || 'free';
        const newPlan = updated.plan;
        if (_isPlanUpgrade(oldPlan, newPlan)) {
          setTimeout(() => _showPlanUpgradeModal(newPlan), 600);
        }
        _applyPlanFromUser(updated);
      } catch { /* token mal formado — no bloquear el flujo */ }
      _scheduleProactiveRefresh(data.access_token); // reprogramar para el nuevo token
      return 'ok';
    } catch {
      return 'network'; // timeout or offline
    }
  }

  // ── Auth ──────────────────────────────────────────────────
  async function register(email, password, displayName, consentGdpr) {
    const data = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name: displayName || null, consent_gdpr: consentGdpr }),
    });
    if (data) saveAuth(data);
    return data;
  }

  async function login(email, password) {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data) saveAuth(data);
    return data;
  }

  function logout() { clearAuth(); window.dispatchEvent(new Event('hs:logout')); }

  async function me() { return request('/auth/me'); }

  async function updateMe(data) {
    return request('/auth/me', { method: 'PATCH', body: JSON.stringify(data) });
  }

  // ─────────────────────────────────────────────────────────
  // HEALTH (peso y biométricas)
  // Fallback: WeightTracker localStorage cuando backend offline
  // ─────────────────────────────────────────────────────────
  const health = {
    /**
     * Lista registros de peso del usuario autenticado.
     * @param {number} limit
     * @returns {Promise<{records: Array, total: number}>}
     */
    async list(limit = 90) {
      if (!_backendOnline || !isLoggedIn()) {
        // Fallback localStorage
        const entries = typeof WeightTracker !== 'undefined' ? WeightTracker.getAll() : [];
        return { records: entries, total: entries.length, _source: 'local' };
      }
      return request(`/health/records?limit=${limit}`);
    },

    /**
     * Crea o actualiza un registro de peso.
     * @param {Object} data - { recorded_date, weight_kg, notes?, ... }
     */
    async save(data) {
      if (!_backendOnline || !isLoggedIn()) {
        // Fallback: ya lo maneja WeightTracker internamente
        return { _source: 'local', ...data };
      }
      // El backend distingue create vs update por fecha (PATCH si ya existe)
      try {
        return await request('/health/records', {
          method: 'POST',
          body: JSON.stringify(data),
        });
      } catch (e) {
        if (e.message.includes('409')) {
          // Ya existe para esta fecha → PATCH (necesitamos el id)
          // En este flujo simplificado hacemos list y buscamos el id
          const list = await health.list();
          const existing = list.records?.find(r => r.recorded_date === data.recorded_date);
          if (existing?.id) return health.update(existing.id, data);
        }
        throw e;
      }
    },

    async update(recordId, data) {
      if (!_backendOnline || !isLoggedIn()) return { _source: 'local', ...data };
      return request(`/health/records/${recordId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async delete(recordId) {
      if (!_backendOnline || !isLoggedIn()) return;
      return request(`/health/records/${recordId}`, { method: 'DELETE' });
    },

    /**
     * Sincronizar localStorage → backend (llamar al hacer login).
     * Envía todos los registros locales que no estén en el backend.
     */
    async syncToBackend() {
      if (!_backendOnline || !isLoggedIn()) return;
      const local = typeof WeightTracker !== 'undefined' ? WeightTracker.getAll() : [];
      if (!local.length) return;
      try {
        const remote = await health.list(365);
        const remoteDates = new Set((remote.records || []).map(r => r.recorded_date));
        const toSync = local.filter(e => !remoteDates.has(e.date));
        for (const entry of toSync) {
          await health.save({
            recorded_date: entry.date,
            weight_kg: entry.weight,
            notes: entry.notes || null,
          }).catch(() => {});
        }
        console.log(`[API] Sincronizados ${toSync.length} registros de peso.`);
      } catch (e) {
        console.warn('[API] sync health failed:', e.message);
      }
    },
  };

  // ─────────────────────────────────────────────────────────
  // ROUTINES
  // ─────────────────────────────────────────────────────────
  const routines = {
    async list() {
      if (!_backendOnline || !isLoggedIn()) {
        try {
          const h = JSON.parse(localStorage.getItem('hs_routine_history') || '[]');
          return { routines: h, total: h.length, _source: 'local' };
        } catch { return { routines: [], total: 0, _source: 'local' }; }
      }
      return request('/routines/');
    },

    async save(label, routineObj) {
      if (!_backendOnline || !isLoggedIn()) {
        // Ya lo persiste routineGenerator.js en localStorage
        return { _source: 'local', label };
      }
      return request('/routines/', {
        method: 'POST',
        body: JSON.stringify({ label, routine_json: JSON.stringify(routineObj) }),
      });
    },

    async delete(routineId) {
      if (!_backendOnline || !isLoggedIn()) return;
      return request(`/routines/${routineId}`, { method: 'DELETE' });
    },
  };

  // ─────────────────────────────────────────────────────────
  // COMMUNITY
  // ─────────────────────────────────────────────────────────
  const community = {
    async getPosts(limit = 20, offset = 0) {
      if (!_backendOnline) {
        // Fallback: datos del módulo Community localStorage
        return { posts: [], total: 0, _source: 'local' };
      }
      return request(`/community/posts?limit=${limit}&offset=${offset}`);
    },

    async createPost(content) {
      if (!_backendOnline || !isLoggedIn()) return null;
      return request('/community/posts', {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
    },

    async likePost(postId) {
      if (!_backendOnline || !isLoggedIn()) return null;
      return request(`/community/posts/${postId}/like`, { method: 'POST' });
    },
  };

  // ─────────────────────────────────────────────────────────
  // GAMIFICATION
  // ─────────────────────────────────────────────────────────
  const gamification = {
    async getState() {
      if (!_backendOnline || !isLoggedIn()) {
        const s = typeof Gamification !== 'undefined' ? Gamification.getState() : {};
        return { ...s, _source: 'local' };
      }
      return request('/gamification/state');
    },

    async addXP(action) {
      if (!_backendOnline || !isLoggedIn()) return;
      return request('/gamification/action', {
        method: 'POST',
        body: JSON.stringify({ action }),
      }).catch(() => {});  // non-critical — silenciar errores
    },

    /**
     * Sincronizar estado local de gamificación al backend tras login.
     */
    async syncToBackend() {
      if (!_backendOnline || !isLoggedIn()) return;
      if (typeof Gamification === 'undefined') return;
      try {
        const local = Gamification.getState();
        // Enviar acciones acumuladas como bulk (simple: una por contador)
        const actions = [];
        if (local.weightCount)  for (let i = 0; i < Math.min(local.weightCount, 50); i++) actions.push('weight');
        if (local.tdeeCalc)     actions.push('tdee');
        if (local.routineCount) for (let i = 0; i < Math.min(local.routineCount, 10); i++) actions.push('routine');
        if (local.postCount)    for (let i = 0; i < Math.min(local.postCount, 20); i++) actions.push('post');
        // Enviar en lote (máx 20 para no saturar)
        for (const action of actions.slice(0, 20)) {
          await gamification.addXP(action);
        }
        console.log(`[API] Gamificación sincronizada (${actions.length} acciones).`);
      } catch (e) {
        console.warn('[API] sync gamification failed:', e.message);
      }
    },
  };

  // ─────────────────────────────────────────────────────────
  // NUTRITION (suplementos e ingredientes desde el backend)
  // ─────────────────────────────────────────────────────────
  const nutrition = {
    async getSupplements() {
      if (!_backendOnline) return null;
      return request('/nutrition/supplements').catch(() => null);
    },

    async getIngredients() {
      if (!_backendOnline) return null;
      return request('/nutrition/ingredients').catch(() => null);
    },
  };

  // ─────────────────────────────────────────────────────────
  // INIT — llamar desde app.js tras inicializar módulos
  // ─────────────────────────────────────────────────────────
  async function init() {
    await startOnlineMonitor();

    // Si el usuario ya está logueado al cargar (token en localStorage),
    // aplicar el plan correcto y programar el refresh proactivo.
    if (isLoggedIn()) {
      _applyPlanFromUser(getUser());
      _scheduleProactiveRefresh(getToken()); // renovar si el token está próximo a expirar
      // Arranque en frío: refrescar hs_user desde el servidor y emitir
      // hs:user-loaded con el valor autoritativo de onboarding_v2_completed.
      // No bloquea el render — corre en background.
      refreshUser();
    } else if (getRefresh()) {
      // Access token ausente o expirado, pero el refresh token sigue ahí.
      // auth-gate.js ya no lo borra — intentar renovar silenciosamente
      // antes de que el usuario vea el modal de login.
      // Si tiene éxito, dispara hs:login y auth.js cerrará el modal solo.
      _doRefreshOnce();
    }

    // ── iOS/Chrome resume: reprogramar timer si murió en background ────────
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') _checkTokenOnResume();
    });
    // bfcache restore (navegadores modernos que serializan la página)
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) _checkTokenOnResume();
    });
    // Offline → Online: puede que el token haya expirado sin red
    window.addEventListener('online', async () => {
      await checkBackend();
      if (_backendOnline) {
        const token = getToken();
        if (!token && getRefresh()) { _doRefreshOnce(); }
        else if (token && _isTokenExpired(token)) { _doRefreshOnce(); }
        else { _scheduleProactiveRefresh(token); } // reiniciar timer
      }
    });

    // Resetear plan a 'free' al cerrar sesión
    window.addEventListener('hs:logout', () => {
      if (typeof Plan !== 'undefined') {
        Plan.set('free');
        Plan.updateBadge();
        Plan.applyNavLocks();
        Plan.applyFeatureLocks();
      }
    });

    if (_backendOnline) {
      console.log('[API] Backend disponible en', BASE_URL);

      if (isLoggedIn()) {
        setTimeout(async () => {
          await health.syncToBackend();
          await gamification.syncToBackend();
        }, 2000);
      }
    } else {
      console.log('[API] Backend no disponible — modo offline (localStorage).');
    }

    window.addEventListener('hs:login', () => {
      // Re-aplicar plan por si el evento llega antes de que Plan esté listo
      setTimeout(() => _applyPlanFromUser(getUser()), 100);
      setTimeout(async () => {
        if (await checkBackend()) {
          await health.syncToBackend();
          await gamification.syncToBackend();
        }
      }, 500);
    });
  }

  // ── Public API ────────────────────────────────────────────
  return {
    // Estado
    isLoggedIn,
    isOnline,
    getUser,
    getToken,
    saveAuth,
    clearAuth,
    refreshUser,
    request,
    init,

    // Auth
    register,
    login,
    logout,
    me,
    updateMe,

    // Módulos
    health,
    routines,
    community,
    gamification,
    nutrition,
  };
})();
