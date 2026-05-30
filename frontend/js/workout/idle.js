// frontend/js/workout/idle.js
import { S } from './state.js';
import * as Session from '../workoutSession.js';
import { renderRoutinePicker } from './routine-picker.js';
import { renderCustomRoutineBuilder } from './custom-builder.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────
export function _fmtDuration(secs) {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}min`;
  return `${m}min`;
}

// ─── IDLE ──────────────────────────────────────────────────────────────────────
export function renderIdle() {
  // ── Historial compacto ────────────────────────────────────────────────────
  const history = Session.getLocalSessions();
  let histHtml = '';
  if (history.length > 0) {
    const rows = history.map((sess, idx) => {
      const d = new Date(sess.startedAt);
      const dateStr = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
      const dur = _fmtDuration(sess.durationSecs);
      const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      let routineLabel;
      if (sess.routineName) {
        routineLabel = sess.routineId
          ? `${_esc(sess.routineId)} · ${_esc(sess.routineName)}`
          : _esc(sess.routineName);
      } else {
        routineLabel = _esc(sess.routineId ?? '') || 'Sesión libre';
      }
      const detailRows = (sess.exercises || []).map(ex => {
        const ws = (ex.sets || []).filter(s => !s.isWarmup && s.completedAt);
        if (!ws.length) return '';
        return `<div class="wl-hist-ex">
          <span class="wl-hist-ex-name">${_esc(ex.name)}</span>
          <span class="wl-hist-ex-sets">${ws.map(s => `${parseFloat(s.weightKg)}×${parseInt(s.reps)}`).join(' · ')}</span>
        </div>`;
      }).filter(Boolean).join('');
      return `
        <div class="wl-hist-row" data-hidx="${idx}">
          <div class="wl-hist-row-main">
            <span class="wl-hist-name">${routineLabel}</span>
            <span class="wl-hist-date">${dateStr}</span>
            <span class="wl-hist-dur">${dur}</span>
            ${detailRows ? `<svg class="wl-hist-chevron" aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>` : ''}
          </div>
          ${detailRows ? `<div class="wl-hist-detail">${detailRows}</div>` : ''}
        </div>`;
    }).join('');
    histHtml = `
      <div class="wl-history-section">
        <h4 class="wl-hist-title">Historial</h4>
        <div class="wl-history-list">${rows}</div>
      </div>`;
  } else {
    histHtml = `
      <div class="wl-history-empty">
        <span class="wl-history-empty-icon">🏋️</span>
        <span class="wl-history-empty-text">Completa tu primer entreno para ver tu historial aquí</span>
      </div>`;
  }

  // ── Rutina IA guardada — dedup robusto ────────────────────────────────────
  let iaRoutines = [];
  try { iaRoutines = JSON.parse(localStorage.getItem('hs_routine_history') || '[]'); } catch {}
  try {
    const activeRaw = JSON.parse(localStorage.getItem('hs_routine') || 'null');
    if (activeRaw?.routine?.sessions) {
      const activeExStr = JSON.stringify(
        (activeRaw.routine.sessions).map(s => (s.exercises || []).map(e => e.name))
      );
      const alreadyIn = iaRoutines.some(r => {
        if (r.ts && activeRaw.ts && r.ts === activeRaw.ts) return true;
        return JSON.stringify((r.routine?.sessions || []).map(s => (s.exercises || []).map(e => e.name))) === activeExStr;
      });
      if (!alreadyIn) {
        iaRoutines = [
          { ts: activeRaw.ts || Date.now(), label: 'Última rutina generada', routine: activeRaw.routine },
          ...iaRoutines,
        ];
      }
    }
  } catch { /* ignorar */ }

  // Dedup iaRoutines por contenido (por si hs_routine_history tiene entradas repetidas)
  const _seenContent = new Set();
  iaRoutines = iaRoutines.filter(r => {
    const key = JSON.stringify((r.routine?.sessions || []).map(s => (s.exercises || []).map(e => e.name)));
    if (_seenContent.has(key)) return false;
    _seenContent.add(key);
    return true;
  });

  // Rutina personalizada del usuario
  let customRoutine = null;
  try { customRoutine = JSON.parse(localStorage.getItem('hs_custom_routine') || 'null'); } catch {}

  const hasIA     = iaRoutines.length > 0;
  const hasCustom = customRoutine?.sessions?.length > 0;

  S.root.innerHTML = `
    <div class="wl-idle">
      <div class="wl-idle-body">
        <h3 class="wl-idle-title">¿Cómo quieres entrenar?</h3>
        <div class="wl-mode-grid">
          <button class="wl-mode-card" id="wl-mode-free">
            <svg class="wl-mode-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            <span class="wl-mode-title">Ejercicios libres</span>
            <span class="wl-mode-sub">Añade ejercicios sobre la marcha</span>
          </button>
          <button class="wl-mode-card" id="wl-mode-build">
            <svg class="wl-mode-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            <span class="wl-mode-title">Rutina IA</span>
            <span class="wl-mode-sub">${hasIA ? 'Cargar plan generado' : 'Genera tu plan inteligente'}</span>
          </button>
          <button class="wl-mode-card${hasCustom ? ' wl-mode-card--accent' : ''}" id="wl-mode-custom">
            <svg class="wl-mode-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            <span class="wl-mode-title">Mi rutina</span>
            <span class="wl-mode-sub">${hasCustom ? `${customRoutine.sessions.length} días configurados` : 'Crea tu propia rutina'}</span>
          </button>
        </div>
        ${histHtml}
      </div>
    </div>`;

  // ── Historial: expand/collapse filas ─────────────────────────────────────
  S.root.querySelectorAll('.wl-hist-row').forEach(row => {
    const detail = row.querySelector('.wl-hist-detail');
    if (!detail) return;
    const mainRow = row.querySelector('.wl-hist-row-main');
    mainRow.addEventListener('click', () => {
      const isOpen = detail.style.display !== 'none';
      detail.style.display = isOpen ? 'none' : 'block';
      row.classList.toggle('wl-hist-row--open', !isOpen);
    });
  });

  S.root.querySelector('#wl-mode-free').addEventListener('click', () => {
    S.session = Session.startSession();
    window.dispatchEvent(new CustomEvent('hs:workout-session-changed'));
    S.onRenderActive?.();
  });

  S.root.querySelector('#wl-mode-build')?.addEventListener('click', () => {
    if (hasIA) {
      renderRoutinePicker(iaRoutines);
    } else {
      if (typeof window.navigateTo === 'function') {
        window.navigateTo('rutinas');
      } else {
        const nav = document.querySelector('[data-section="rutinas"]');
        if (nav) nav.click();
      }
    }
  });

  S.root.querySelector('#wl-mode-custom')?.addEventListener('click', () => {
    if (hasCustom) {
      renderRoutinePicker([{ label: 'Mi rutina', routine: customRoutine, ts: customRoutine.ts || 0 }]);
    } else {
      renderCustomRoutineBuilder();
    }
  });
}
