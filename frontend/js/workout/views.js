// frontend/js/workout/views.js
// Vistas de reposo del workout logger: Idle, RoutinePicker, PreWorkoutAdjust,
// CustomRoutineBuilder, y carga de sesión desde rutina guardada.
import { S, REST_DEFAULT } from './state.js';
import * as Session from '../workoutSession.js';

// Callback inyectado por el coordinador para transitar a la vista activa
let _onRenderActive = null;
export function registerRenderActive(cb) { _onRenderActive = cb; }

// ─── Búsqueda de ejercicios ────────────────────────────────────────────────────
export function searchExercises(query) {
  const db = (typeof Exercises !== 'undefined' && Exercises.getDB)
    ? Exercises.getDB()
    : [];
  const q = query.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return db.filter(ex => {
    const name = ex.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return name.includes(q);
  }).slice(0, 8);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function _fmtDuration(secs) {
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
    _onRenderActive?.();
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

// ─── Guardar nombre de rutina en localStorage ──────────────────────────────────
function _saveRoutineLabel(r, newLabel) {
  r.label = newLabel;
  r.name  = newLabel;
  try {
    const history = JSON.parse(localStorage.getItem('hs_routine_history') || '[]');
    const i = r.ts ? history.findIndex(h => h.ts === r.ts) : -1;
    if (i >= 0) {
      history[i].label = newLabel;
      localStorage.setItem('hs_routine_history', JSON.stringify(history));
      return;
    }
  } catch {}
  try {
    const custom = JSON.parse(localStorage.getItem('hs_custom_routine') || 'null');
    if (custom) {
      custom.name = newLabel; custom.label = newLabel;
      localStorage.setItem('hs_custom_routine', JSON.stringify(custom));
    }
  } catch {}
}

// ─── Selector de rutinas guardadas ─────────────────────────────────────────────
export function renderRoutinePicker(routines) {
  S.root.innerHTML = `
    <div class="wl-routine-picker">
      <div class="wl-picker-header">
        <button class="wl-picker-back" id="wl-picker-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Volver
        </button>
        <h3 class="wl-picker-title">Elige una rutina</h3>
      </div>
      <div class="wl-picker-list">
        ${routines.map((r, ridx) => {
          const activeDays = (r.routine?.sessions || []).filter(s => s.exercises && s.exercises.length > 0);
          return `
          <div class="wl-picker-item">
            <div class="wl-picker-name-wrap" data-ridx="${ridx}">
              <span class="wl-picker-name">${r.label || r.name || 'Rutina sin nombre'}</span>
              <button class="wl-picker-name-edit" title="Renombrar">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>
            <div class="wl-picker-meta">${activeDays.length} día${activeDays.length !== 1 ? 's' : ''} de entrenamiento${r.ts ? ' · ' + new Date(r.ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : ''}</div>
            <div class="wl-picker-days">
              ${activeDays.map((s, sidx) => `
                <button class="wl-picker-day" data-ridx="${ridx}" data-sidx="${sidx}">
                  <span class="wpd-day">${s.day}</span>
                  <span class="wpd-name">${s.name}</span>
                  <span class="wpd-count">${s.exercises.length} ejercicios</span>
                </button>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;

  S.root.querySelector('#wl-picker-back').addEventListener('click', renderIdle);

  // Edición inline del nombre de rutina (delegación en la lista)
  S.root.querySelector('.wl-picker-list').addEventListener('click', e => {
    const editBtn = e.target.closest('.wl-picker-name-edit');
    if (!editBtn) return;
    e.stopPropagation();
    const wrap = editBtn.closest('.wl-picker-name-wrap');
    const ridx = parseInt(wrap.dataset.ridx);
    const r = routines[ridx];
    const currentName = r.label || r.name || 'Rutina sin nombre';
    const _esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    wrap.innerHTML = `<input class="wl-picker-name-inp" value="${_esc(currentName)}" maxlength="60" style="font-size:16px">`;
    const inp = wrap.querySelector('.wl-picker-name-inp');
    inp.focus(); inp.select();

    function _commit() {
      const newName = inp.value.trim() || currentName;
      _saveRoutineLabel(r, newName);
      wrap.innerHTML = `
        <span class="wl-picker-name">${_esc(newName)}</span>
        <button class="wl-picker-name-edit" title="Renombrar">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>`;
    }
    inp.addEventListener('blur', _commit);
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') inp.blur(); if (ev.key === 'Escape') { inp.value = currentName; inp.blur(); } });
  });

  S.root.querySelectorAll('.wl-picker-day').forEach(btn => {
    btn.addEventListener('click', () => {
      const ridx = parseInt(btn.dataset.ridx);
      const sidx = parseInt(btn.dataset.sidx);
      const activeDays = (routines[ridx]?.routine?.sessions || []).filter(s => s.exercises && s.exercises.length > 0);
      const daySession = activeDays[sidx];
      if (daySession) renderPreWorkoutAdjust(daySession);
    });
  });
}

// ─── Pantalla de ajuste de pesos pre-entreno ──────────────────────────────────
export function renderPreWorkoutAdjust(daySession) {
  const exList = (daySession.exercises || []).filter(ex => ex.name);

  S.root.innerHTML = `
    <div class="wl-preworkout">
      <div class="wl-picker-header">
        <button class="wl-picker-back" id="wl-pre-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Volver
        </button>
        <h3 class="wl-picker-title">${daySession.day} — ${daySession.name || ''}</h3>
      </div>
      <p class="wl-pre-hint">Ajusta los pesos antes de empezar. Los sets de calentamiento se generan automáticamente.</p>
      <div class="wl-pre-list">
        ${exList.map((ex, i) => {
          const suggested = Session.getSuggestedWeight(
            ex.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'_')
          );
          const planned = suggested ?? 0;
          return `
          <div class="wl-pre-row">
            <div class="wl-pre-exname">${ex.name}</div>
            <div class="wl-pre-scheme">${ex.sets} × ${ex.reps} · ${ex.rest || '90s'}</div>
            <div class="wl-pre-weight-wrap">
              <button class="wl-pre-stepper" data-idx="${i}" data-dir="-">−</button>
              <input type="text" inputmode="decimal" pattern="[0-9]*\.?[0-9]*"
                class="wl-pre-weight-inp" id="wl-pre-weight-${i}"
                value="${planned > 0 ? planned : ''}" placeholder="0"
                style="font-size:16px">
              <span class="wl-pre-unit">kg</span>
              <button class="wl-pre-stepper" data-idx="${i}" data-dir="+">+</button>
            </div>
          </div>`;
        }).join('')}
      </div>
      <button class="wl-pre-start-btn" id="wl-pre-start">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Empezar entreno
      </button>
    </div>`;

  S.root.querySelector('#wl-pre-back').addEventListener('click', renderIdle);

  S.root.querySelectorAll('.wl-pre-stepper').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const inp = S.root.querySelector(`#wl-pre-weight-${idx}`);
      if (!inp) return;
      const step = 2.5;
      const cur  = parseFloat(inp.value) || 0;
      inp.value  = Math.max(0, btn.dataset.dir === '+' ? cur + step : cur - step);
    });
  });

  // Select-all al tocar — el placeholder desaparece, se escribe directo
  S.root.querySelectorAll('.wl-pre-weight-inp').forEach(inp => {
    inp.addEventListener('focus', () => inp.select());
    inp.addEventListener('pointerdown', () => {
      if (document.activeElement === inp) setTimeout(() => inp.select(), 0);
    });
  });

  S.root.querySelector('#wl-pre-start').addEventListener('click', () => {
    const adjusted = { ...daySession, exercises: exList.map((ex, i) => {
      const inp = S.root.querySelector(`#wl-pre-weight-${i}`);
      const kg  = inp ? (parseFloat(inp.value) || 0) : 0;
      return { ...ex, _adjustedKg: kg };
    }) };
    loadRoutineSession(adjusted);
  });
}

// ─── Constructor de rutina personalizada ──────────────────────────────────────
export function renderCustomRoutineBuilder() {
  const db = (typeof Exercises !== 'undefined' && Exercises.getDB) ? Exercises.getDB() : [];

  let sessions = [{ day: 'Día 1', name: 'Mi sesión', exercises: [] }];

  function _render() {
    S.root.innerHTML = `
      <div class="wl-custom-builder">
        <div class="wl-picker-header">
          <button class="wl-picker-back" id="wl-custom-back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            Volver
          </button>
          <h3 class="wl-picker-title">Mi rutina</h3>
        </div>
        <div class="wl-custom-sessions">
          ${sessions.map((s, si) => `
            <div class="wl-custom-session" data-si="${si}">
              <div class="wl-custom-session-header">
                <input class="wl-custom-day-inp" data-si="${si}" value="${s.day}" placeholder="Ej: Lunes" style="font-size:16px">
                <input class="wl-custom-name-inp" data-si="${si}" value="${s.name}" placeholder="Nombre sesión" style="font-size:16px">
                <button class="wl-custom-del-session" data-si="${si}" title="Eliminar sesión">✕</button>
              </div>
              <div class="wl-custom-exlist">
                ${s.exercises.map((ex, ei) => `
                  <div class="wl-custom-ex-row">
                    <span class="wl-custom-ex-name">${ex.name}</span>
                    <input type="number" class="wl-custom-sets-inp" data-si="${si}" data-ei="${ei}" value="${ex.sets || 3}" min="1" max="10" placeholder="sets" style="width:44px;font-size:16px">
                    <span>×</span>
                    <input type="number" class="wl-custom-reps-inp" data-si="${si}" data-ei="${ei}" value="${ex.reps || 8}" min="1" max="30" placeholder="reps" style="width:44px;font-size:16px">
                    <button class="wl-custom-del-ex" data-si="${si}" data-ei="${ei}">✕</button>
                  </div>`).join('')}
              </div>
              <div class="wl-custom-add-wrap">
                <input type="text" class="wl-custom-ex-search" data-si="${si}" placeholder="Buscar ejercicio..." autocomplete="off" style="font-size:16px">
                <div class="wl-custom-ex-results" data-si="${si}" style="display:none;position:absolute;left:0;right:0;background:var(--bg-surface);border:1px solid var(--glass-border);border-radius:8px;z-index:200;overflow:hidden"></div>
              </div>
            </div>`).join('')}
        </div>
        <button class="wl-custom-add-session-btn" id="wl-custom-add-session">+ Añadir día</button>
        <button class="wl-custom-save-btn" id="wl-custom-save">Guardar mi rutina</button>
      </div>`;

    S.root.querySelector('#wl-custom-back').addEventListener('click', renderIdle);
    S.root.querySelector('#wl-custom-add-session').addEventListener('click', () => {
      sessions.push({ day: `Día ${sessions.length + 1}`, name: 'Nueva sesión', exercises: [] });
      _render();
    });

    // Borrar sesión
    S.root.querySelectorAll('.wl-custom-del-session').forEach(btn => {
      btn.addEventListener('click', () => {
        const si = parseInt(btn.dataset.si);
        sessions.splice(si, 1);
        if (!sessions.length) sessions.push({ day: 'Día 1', name: 'Mi sesión', exercises: [] });
        _render();
      });
    });

    // Actualizar nombre de día/sesión
    S.root.querySelectorAll('.wl-custom-day-inp').forEach(inp => {
      inp.addEventListener('input', () => { sessions[parseInt(inp.dataset.si)].day = inp.value; });
    });
    S.root.querySelectorAll('.wl-custom-name-inp').forEach(inp => {
      inp.addEventListener('input', () => { sessions[parseInt(inp.dataset.si)].name = inp.value; });
    });

    // Actualizar sets/reps
    S.root.querySelectorAll('.wl-custom-sets-inp').forEach(inp => {
      inp.addEventListener('input', () => {
        sessions[parseInt(inp.dataset.si)].exercises[parseInt(inp.dataset.ei)].sets = parseInt(inp.value) || 3;
      });
    });
    S.root.querySelectorAll('.wl-custom-reps-inp').forEach(inp => {
      inp.addEventListener('input', () => {
        sessions[parseInt(inp.dataset.si)].exercises[parseInt(inp.dataset.ei)].reps = parseInt(inp.value) || 8;
      });
    });

    // Borrar ejercicio
    S.root.querySelectorAll('.wl-custom-del-ex').forEach(btn => {
      btn.addEventListener('click', () => {
        const si = parseInt(btn.dataset.si), ei = parseInt(btn.dataset.ei);
        sessions[si].exercises.splice(ei, 1);
        _render();
      });
    });

    // Búsqueda de ejercicios por sesión
    S.root.querySelectorAll('.wl-custom-ex-search').forEach(inp => {
      const si = parseInt(inp.dataset.si);
      const resultsEl = S.root.querySelector(`.wl-custom-ex-results[data-si="${si}"]`);
      inp.addEventListener('input', () => {
        const q = inp.value.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g,'');
        if (!q) { resultsEl.style.display = 'none'; return; }
        const hits = db.filter(ex => ex.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').includes(q)).slice(0,6);
        resultsEl.style.display = hits.length ? '' : 'none';
        resultsEl.innerHTML = hits.map(ex =>
          `<button style="display:block;width:100%;text-align:left;padding:9px 14px;background:none;border:none;border-bottom:1px solid var(--glass-border);color:var(--text-primary);font-size:.9rem;cursor:pointer"
            data-name="${ex.name}" data-group="${ex.group}">${ex.name} <span style="font-size:.75rem;color:var(--text-muted)">${ex.group}</span></button>`
        ).join('');
        resultsEl.querySelectorAll('button').forEach(btn => {
          btn.addEventListener('click', () => {
            sessions[si].exercises.push({ name: btn.dataset.name, sets: 3, reps: 8, rest: '90s' });
            inp.value = '';
            resultsEl.style.display = 'none';
            _render();
          });
        });
      });
    });

    // Guardar rutina personalizada
    S.root.querySelector('#wl-custom-save').addEventListener('click', () => {
      const routine = { sessions, ts: Date.now() };
      localStorage.setItem('hs_custom_routine', JSON.stringify(routine));
      renderIdle();
    });
  }

  _render();
}

// ─── Parsear string de descanso → segundos ─────────────────────────────────────
function _parseRestSecs(restStr) {
  if (!restStr) return REST_DEFAULT;
  const ms = restStr.match(/(\d+)\s*s(?:eg|ecs?)?/i);
  if (ms) return parseInt(ms[1], 10);
  const mm = restStr.match(/(\d+)\s*min/i);
  if (mm) return parseInt(mm[1], 10) * 60;
  const mn = restStr.match(/(\d+)/);
  if (mn) return parseInt(mn[1], 10);
  return REST_DEFAULT;
}

// ─── Cargar día de rutina como draft y arrancar sesión ─────────────────────────
// Mejor que Hevy: pre-rellena peso de sesiones anteriores + genera calentamiento
// automático escalado al peso de trabajo.
export function loadRoutineSession(daySession) {
  function _toKey(name) {
    return name.toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
  }

  const exercises = daySession.exercises.map((ex, i) => {
    const numSets  = parseInt(ex.sets) || 3;
    const targetR  = parseInt(ex.reps) || 8;
    const key      = _toKey(ex.name);
    const restSecs = _parseRestSecs(ex.rest);

    // Peso pre-ajustado desde pantalla pre-entreno (tiene prioridad), luego historial, luego 0
    const suggested  = Session.getSuggestedWeight(key);
    const workingKg  = (ex._adjustedKg !== undefined ? ex._adjustedKg : null) ?? suggested ?? 0;

    const setsArr = [];

    // Auto-calentamiento escalado al peso de trabajo
    if (workingKg >= 30) {
      // Ejercicio pesado (≥ 30 kg): 2 sets de calentamiento
      const w1 = Math.max(2.5, Math.round((workingKg * 0.50) / 2.5) * 2.5);
      const w2 = Math.max(2.5, Math.round((workingKg * 0.75) / 2.5) * 2.5);
      setsArr.push({ setNumber: 0, weightKg: w1, reps: 8,  rpe: null, isWarmup: true,  completedAt: null });
      setsArr.push({ setNumber: 0, weightKg: w2, reps: 5,  rpe: null, isWarmup: true,  completedAt: null });
    } else if (workingKg >= 15) {
      // Ejercicio medio (15-29 kg): 1 set de calentamiento al 60 %
      const w1 = Math.max(2.5, Math.round((workingKg * 0.60) / 2.5) * 2.5);
      setsArr.push({ setNumber: 0, weightKg: w1, reps: 10, rpe: null, isWarmup: true,  completedAt: null });
    }
    // < 15 kg o sin historial → sin calentamiento automático

    for (let s = 0; s < numSets; s++) {
      setsArr.push({ setNumber: s + 1, weightKg: workingKg, reps: targetR, rpe: null, isWarmup: false, completedAt: null });
    }

    const dbRef = (typeof Exercises !== 'undefined' && Exercises.getDB)
      ? Exercises.getDB().find(e => e.name.toLowerCase() === ex.name.toLowerCase())
      : null;

    return {
      key,
      name:       ex.name,
      group:      dbRef?.group || ex.group || '',
      orderIndex: i,
      sets:       setsArr,
      restSecs,
      note:       ex.rest ? 'Descanso: ' + ex.rest : '',
    };
  });

  const draft = {
    routineId:   daySession.day  || null,
    routineName: daySession.name || null,
    startedAt:   new Date().toISOString(),
    exercises,
  };
  Session.saveDraft(draft);
  S.session = draft;
  window.dispatchEvent(new CustomEvent('hs:workout-session-changed'));
  _onRenderActive?.();

  // Toast informativo si hay historial (peso pre-rellenado)
  const hasHistory = exercises.some(ex => ex.sets.some(s => !s.isWarmup && s.weightKg > 0));
  if (hasHistory) {
    const warmupCount = exercises.reduce((n, ex) => n + ex.sets.filter(s => s.isWarmup).length, 0);
    const msg = warmupCount > 0
      ? `Peso de tu última sesión + ${warmupCount} set${warmupCount > 1 ? 's' : ''} de calentamiento generados`
      : 'Peso pre-rellenado desde tu última sesión';
    _showRoutineToast(msg);
  }
}

function _showRoutineToast(msg) {
  const existing = document.getElementById('wl-routine-toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.id = 'wl-routine-toast';
  t.style.cssText = 'position:fixed;top:72px;left:50%;transform:translateX(-50%);' +
    'background:#1e1b4b;border:1px solid #4f46e5;color:#c7d2fe;padding:8px 16px;' +
    'border-radius:8px;font-size:.8rem;z-index:9990;box-shadow:0 4px 16px rgba(0,0,0,.4);' +
    'pointer-events:none;white-space:nowrap;';
  t.textContent = '⚡ ' + msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
