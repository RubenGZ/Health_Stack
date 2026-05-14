// frontend/js/anatomyLens/index.js
// Public API — the ONLY file exercises.js needs to import.
// Four async functions: init, highlight, reset, destroy.
// All functions are safe — they never throw, errors are handled internally.

import { getState, transition, resetState, canHighlight, STATES } from './state.js';
import { initScene, startLoop, stopLoop, disposeScene } from './scene.js';
import { loadModel, disposeModel, resetAllMaterials } from './model.js';
import { tweenToAngle, tweenToMeshes, snapToAngle, cancelTween } from './camera.js';
import { applyHighlight, clearHighlight } from './highlighter.js';
import { renderLegend, clearLegend } from './legend.js';
import { resolveExercise } from './muscleMap.js';
import { isWebGLAvailable, activateSVGFallback } from './fallback.js';
import { safeExec, safeOp } from './errorBoundary.js';

let _progressBar = null;
let _loadingEl = null;
let _pendingHighlight = null;  // queued highlight during LOADING

/**
 * Mount AnatomyLens in containerElement and start loading the GLB model.
 * @param {HTMLElement} container - .anatomy-lens-container div
 * @returns {Promise<void>}
 */
async function init(container) {
  if (getState() !== STATES.UNINITIALIZED) return;

  // WebGL check
  if (!isWebGLAvailable()) {
    activateSVGFallback();
    return;
  }

  transition(STATES.LOADING);

  // Inject loading UI
  _loadingEl = document.createElement('div');
  _loadingEl.className = 'anatomy-lens-loading';
  _loadingEl.innerHTML = `
    <span class="anatomy-lens-loading-text">Cargando visor...</span>
    <div class="anatomy-lens-progress">
      <div class="anatomy-lens-progress-bar"></div>
    </div>
  `;
  container.appendChild(_loadingEl);
  _progressBar = _loadingEl.querySelector('.anatomy-lens-progress-bar');

  await safeExec(async () => {
    // Init scene (creates canvas + lights)
    initScene(container, () => {
      // FPS critical callback
      activateSVGFallback();
    });
    startLoop();

    // Load GLB
    await loadModel((pct) => {
      if (_progressBar) _progressBar.style.width = pct + '%';
    });

    // Fade out loading overlay
    if (_loadingEl) {
      _loadingEl.classList.add('al-hidden');
      setTimeout(() => _loadingEl?.remove(), 400);
    }

    snapToAngle('FULL');
    transition(STATES.READY);

    // Execute pending highlight if user clicked during load
    if (_pendingHighlight) {
      const { id, muscles } = _pendingHighlight;
      _pendingHighlight = null;
      await highlight(id, muscles);
    }
  }, 'init');
}

/**
 * Highlight muscles for an exercise.
 * @param {number|string} exerciseId - DB numeric id or muscleMap string key
 * @param {string[]} dbMuscles - muscles[] from exercises DB (fallback)
 * @returns {Promise<void>}
 */
async function highlight(exerciseId, dbMuscles = []) {
  if (getState() === STATES.SVG_FALLBACK) return;

  // Queue if still loading
  if (getState() === STATES.LOADING) {
    _pendingHighlight = { id: exerciseId, muscles: dbMuscles };
    return;
  }

  if (!canHighlight()) return;

  await safeOp(async () => {
    const { primary, secondary, camera } = resolveExercise(exerciseId, dbMuscles);

    transition(STATES.TRANSITIONING_CAMERA);
    clearHighlight();

    // Apply highlight first (sync) — returns primary meshes for dynamic zoom
    const primaryMeshes = applyHighlight(primary, secondary);

    // Dynamic zoom: frame the actual muscle bounding box in world space.
    // Falls back to tweenToAngle(camera) if no meshes found in registry yet
    // (e.g. GLB not loaded or mesh name mismatch).
    await tweenToMeshes(primaryMeshes, camera);

    transition(STATES.HIGHLIGHTING);
    renderLegend(primary, secondary);
  }, 'highlight');
}

/**
 * Reset all highlights and camera to default position.
 * @returns {Promise<void>}
 */
async function reset() {
  if (getState() === STATES.SVG_FALLBACK) return;
  cancelTween();
  clearHighlight();
  clearLegend();
  resetAllMaterials();
  await safeOp(() => tweenToAngle('FULL'), 'reset');
  const s = getState();
  if (s === STATES.HIGHLIGHTING || s === STATES.TRANSITIONING_CAMERA) transition(STATES.READY);
}

/**
 * Destroy the viewer and release GPU memory.
 * Call when navigating away from the exercises section.
 */
async function destroy() {
  cancelTween();
  clearHighlight();
  clearLegend();
  stopLoop();
  disposeModel();
  disposeScene();
  resetState();
  _pendingHighlight = null;
}

// ── Debug API (development only) ─────────────────────────────
if (typeof window !== 'undefined') {
  window.__anatomyLens = {
    getState,
    getMeshRegistry: () => { try { return window.__anatomyLensRegistry; } catch { return null; } },
    getFPS: () => '(check scene.js FPS monitor)',
    forceFallback: activateSVGFallback,
  };
}

export default { init, highlight, reset, destroy };
