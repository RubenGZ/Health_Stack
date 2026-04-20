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

  let _backendOnline = false;   // se actualiza con checkBackend()
  let _checkInterval = null;

  // ── Token helpers ──────────────────────────────────────────
  function getToken()   { return localStorage.getItem(TOKEN_KEY); }
  function getRefresh() { return localStorage.getItem(REFRESH_KEY); }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch { return null; }
  }

  function saveAuth(data) {
    localStorage.setItem(TOKEN_KEY,   data.access_token);
    localStorage.setItem(REFRESH_KEY, data.refresh_token);
    localStorage.setItem(USER_KEY,    JSON.stringify(data.user));
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
    const token   = getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(8000) });

    // Token expirado → renovar una vez
    if (res.status === 401 && getRefresh()) {
      const renewed = await tryRefresh();
      if (renewed) {
        headers['Authorization'] = `Bearer ${getToken()}`;
        res = await fetch(url, { ...options, headers });
      } else {
        clearAuth();
        window.dispatchEvent(new Event('hs:logout'));
        return null;
      }
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `Error ${res.status}` }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    return res.status === 204 ? null : res.json();
  }

  async function tryRefresh() {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refresh_token: getRefresh() }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      localStorage.setItem(TOKEN_KEY, data.access_token);
      return true;
    } catch {
      return false;
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

    if (_backendOnline) {
      console.log('[API] Backend disponible en', BASE_URL);

      // Si el usuario está logueado, sincronizar datos localStorage → backend
      if (isLoggedIn()) {
        // Sync en segundo plano — no bloquear la UI
        setTimeout(async () => {
          await health.syncToBackend();
          await gamification.syncToBackend();
        }, 2000);
      }
    } else {
      console.log('[API] Backend no disponible — modo offline (localStorage).');
    }

    // Escuchar login para sincronizar inmediatamente
    window.addEventListener('hs:login', () => {
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
    request,
    init,

    // Auth
    register,
    login,
    logout,
    me,

    // Módulos
    health,
    routines,
    community,
    gamification,
    nutrition,
  };
})();
