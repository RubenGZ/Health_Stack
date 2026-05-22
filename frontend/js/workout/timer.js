// frontend/js/workout/timer.js
// Gestión del temporizador de sesión, rest timer, pausa y overlay de pausa.
import { S, REST_DEFAULT } from './state.js';
import * as Session from '../workoutSession.js';

// Callback inyectado por el coordinador para resetear inactividad al reanudar
let _onResetInactivity = null;
export function registerResetInactivity(cb) { _onResetInactivity = cb; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function fmtTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function liveVolume() {
  if (!S.session) return 0;
  return S.session.exercises.reduce((total, ex) => {
    return total + ex.sets
      .filter(s => !s.isWarmup && s.completedAt)
      .reduce((sum, s) => sum + (s.weightKg || 0) * (s.reps || 0), 0);
  }, 0);
}

export function updateVolLabel() {
  const el = S.root?.querySelector('#wl-vol-live');
  if (el) el.textContent = `${liveVolume().toLocaleString('es-ES')} kg`;
}

// ─── Timer de sesión ──────────────────────────────────────────────────────────
export function startTimer() {
  clearInterval(S.timerInterval);
  S.timerInterval = setInterval(() => {
    if (S.session?.pausedAt) return; // congelado en pausa
    const el = S.root?.querySelector('#wl-timer');
    if (!el) return;
    const ms = Session.getActiveDurationMs(S.session);
    el.textContent = fmtTime(Math.floor(ms / 1000));
  }, 1000);
}

// ─── Rest timer ────────────────────────────────────────────────────────────────
export function startRestTimer(secs = REST_DEFAULT) {
  clearInterval(S.restInterval);
  S.restRemaining = secs;
  S.restTotal = secs;
  updateRestUI();

  S.restInterval = setInterval(() => {
    S.restRemaining--;
    updateRestUI();
    if (S.restRemaining <= 0) {
      clearInterval(S.restInterval);
      hideRestTimer();
    }
  }, 1000);
}

export function stopRestTimer() {
  clearInterval(S.restInterval);
  hideRestTimer();
}

export function updateRestUI() {
  const bar = S.root?.querySelector('#wl-rest-bar');
  if (!bar) return;
  bar.querySelector('.wl-rest-time').textContent = fmtTime(S.restRemaining);
  const pct = Math.max(0, (S.restRemaining / S.restTotal) * 100);
  bar.querySelector('.wl-rest-progress-fill').style.width = `${pct}%`;
}

export function showRestBar() {
  const bar = S.root?.querySelector('#wl-rest-bar');
  if (bar) bar.classList.add('wl-rest-bar--visible');
}

export function hideRestTimer() {
  const bar = S.root?.querySelector('#wl-rest-bar');
  if (bar) bar.classList.remove('wl-rest-bar--visible');
}

// ─── Rest countdown en cabecera de ejercicio ──────────────────────────────────
export function updateExerciseRestHeader(exerciseKey) {
  if (!exerciseKey) return;
  const card = S.root?.querySelector(`[data-ex-key="${exerciseKey}"]`);
  if (!card) return;
  const restEl = card.querySelector('.wl-ex-rest-countdown');
  if (!restEl) return;
  if (S.restRemaining > 0 && S.restExKey === exerciseKey) {
    restEl.textContent = `◷ ${fmtTime(S.restRemaining)}`;
    restEl.classList.add('wl-ex-rest-countdown--active');
  } else {
    const ex = S.session?.exercises.find(e => e.key === exerciseKey);
    const secs = ex?.restSecs || REST_DEFAULT;
    restEl.textContent = `◷ ${fmtTime(secs)}`;
    restEl.classList.remove('wl-ex-rest-countdown--active');
  }
}

// ─── Pausa / Reanudar ──────────────────────────────────────────────────────────
export function togglePause() {
  if (!S.session) return;
  if (S.session.pausedAt) {
    // Reanudar
    Session.resumeSession(S.session);
    if (S.restRemaining > 0) {
      // Reanudar rest timer si quedaba tiempo
      S.restInterval = setInterval(() => {
        S.restRemaining--;
        updateRestUI();
        updateExerciseRestHeader(S.restExKey);
        if (S.restRemaining <= 0) {
          clearInterval(S.restInterval);
          hideRestTimer();
          updateExerciseRestHeader(S.restExKey);
        }
      }, 1000);
    }
    removePauseOverlay();
    updatePauseBtn(false);
    _onResetInactivity?.();
  } else {
    // Pausar
    Session.pauseSession(S.session);
    clearInterval(S.restInterval); // pausar rest timer
    showPauseOverlay();
    updatePauseBtn(true);
  }
}

export function updatePauseBtn(isPaused) {
  const btn = S.root?.querySelector('#wl-pause-btn');
  if (!btn) return;
  btn.innerHTML = isPaused
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Reanudar'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pausar';
  btn.classList.toggle('wl-pause-btn--paused', isPaused);
}

export function showPauseOverlay() {
  const existing = S.root?.querySelector('#wl-pause-overlay');
  if (existing) return;
  const overlay = document.createElement('div');
  overlay.id = 'wl-pause-overlay';
  overlay.className = 'wl-pause-overlay';
  overlay.innerHTML = '<span class="wl-pause-overlay-text">Sesión pausada · Toca ▶ Reanudar para continuar</span>';
  S.root?.querySelector('.wl-exercises-col')?.prepend(overlay);
}

export function removePauseOverlay() {
  S.root?.querySelector('#wl-pause-overlay')?.remove();
}
