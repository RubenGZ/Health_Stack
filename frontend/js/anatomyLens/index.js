// frontend/js/anatomyLens/index.js
// API pública — el único archivo que exercises.js necesita importar.
// Visor anatómico SVG estilo Hevy: front + back, body-muscles library.
// Expone createViewer para instancias adicionales (fatigueHeatmap, autoDeload).

import { resolveExercise } from './muscleMap.js';
import { renderLegend, clearLegend } from './legend.js';
import { createViewer as _createViewer } from './svgViewer.js';

// Re-export para módulos externos que necesiten instancias propias
export { _createViewer as createViewer };

// ── Singleton para exercises.js (retrocompatibilidad total) ─────────────────
let _initPromise      = null;
let _initialized      = false;
let _pendingHighlight = null;
let _viewer           = null;

async function init(container) {
  if (_initPromise) return _initPromise;
  if (_initialized) return;
  _initPromise = _doInit(container);
  try {
    await _initPromise;
  } finally {
    _initPromise = null;
  }
}

async function _doInit(container) {
  try {
    _viewer = _createViewer();
    await _viewer.init(container);
    _initialized = true;

    // Cargar sexo biológico del perfil (endpoint /api/v1/auth/me)
    // Permite personalizar el modelo anatómico sin preguntar al usuario
    _fetchAndSetSex().catch(() => {/* silencioso si no hay token */});

    if (_pendingHighlight) {
      const { id, muscles } = _pendingHighlight;
      _pendingHighlight = null;
      await highlight(id, muscles);
    }
  } catch (err) {
    console.error('[AnatomyLens] SVG init failed:', err);
    _initialized = false;
    throw err;
  }
}

async function _fetchAndSetSex() {
  // Usar la API global si existe (retrocompatible con auth.js / api.js)
  const token = (typeof API !== 'undefined' && API.getToken?.())
    || localStorage.getItem('hs_access_token')
    || localStorage.getItem('access_token');
  if (!token) return;

  // Primero intentar leer del cache local (reduce llamadas API)
  const cached = localStorage.getItem('al_sex');
  if (cached === 'male' || cached === 'female') {
    _viewer?.setSex(cached);
    return;
  }

  try {
    const BASE = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) || '/api/v1';
    const res  = await fetch(`${BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const user = await res.json();
    if (user.biological_sex === 'male' || user.biological_sex === 'female') {
      _viewer?.setSex(user.biological_sex);
    }
  } catch (_) { /* sin conectividad o sin onboarding completado */ }
}

async function highlight(exerciseId, dbMuscles = []) {
  if (!_initialized) {
    _pendingHighlight = { id: exerciseId, muscles: dbMuscles };
    return;
  }
  try {
    const { primary, secondary } = resolveExercise(exerciseId, dbMuscles);
    _viewer.highlight(primary, secondary);
    renderLegend(primary, secondary);
  } catch (err) {
    console.warn('[AnatomyLens] highlight skipped:', err.message);
  }
}

async function reset() {
  if (_viewer) _viewer.reset();
  clearLegend();
  const hint = document.getElementById('anatomy-hint');
  if (hint) hint.style.display = '';
}

async function destroy() {
  clearLegend();
  if (_viewer) { _viewer.destroy(); _viewer = null; }
  _initialized      = false;
  _initPromise      = null;
  _pendingHighlight = null;
}

// ── Debug API ───────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.__anatomyLens = {
    highlight: (id) => highlight(id, []),
    reset,
    getState: () => _initialized ? 'READY' : (_initPromise ? 'LOADING' : 'UNINITIALIZED'),
  };
}

export default { init, highlight, reset, destroy };
