// frontend/js/workout/views.js
// Vistas de reposo del workout logger: PreWorkoutAdjust, CustomRoutineBuilder,
// carga de sesión desde rutina guardada, y búsqueda de ejercicios.
// renderIdle → idle.js  |  renderRoutinePicker → routine-picker.js
import { S, REST_DEFAULT } from './state.js';
import * as Session from '../workoutSession.js';
import { renderIdle } from './idle.js';

export { renderIdle } from './idle.js';
export { renderRoutinePicker } from './routine-picker.js';

export function registerRenderActive(cb) { S.onRenderActive = cb; }

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
                value="${planned > 0 ? planned : ''}" placeholder=""
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

  S.root.querySelectorAll('.wl-pre-weight-inp').forEach(inp => {
    inp.addEventListener('focus', () => inp.select());
    inp.addEventListener('pointerdown', () => {
      if (document.activeElement === inp) setTimeout(() => inp.select(), 0);
    });
    inp.addEventListener('input', () => {
      let v = inp.value.replace(/[^0-9.]/g, '');
      const dot = v.indexOf('.');
      if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2);
      if (inp.value !== v) inp.value = v;
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

    S.root.querySelectorAll('.wl-custom-del-session').forEach(btn => {
      btn.addEventListener('click', () => {
        const si = parseInt(btn.dataset.si);
        sessions.splice(si, 1);
        if (!sessions.length) sessions.push({ day: 'Día 1', name: 'Mi sesión', exercises: [] });
        _render();
      });
    });

    S.root.querySelectorAll('.wl-custom-day-inp').forEach(inp => {
      inp.addEventListener('input', () => { sessions[parseInt(inp.dataset.si)].day = inp.value; });
    });
    S.root.querySelectorAll('.wl-custom-name-inp').forEach(inp => {
      inp.addEventListener('input', () => { sessions[parseInt(inp.dataset.si)].name = inp.value; });
    });

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

    S.root.querySelectorAll('.wl-custom-del-ex').forEach(btn => {
      btn.addEventListener('click', () => {
        const si = parseInt(btn.dataset.si), ei = parseInt(btn.dataset.ei);
        sessions[si].exercises.splice(ei, 1);
        _render();
      });
    });

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

    const suggested  = Session.getSuggestedWeight(key);
    const workingKg  = (ex._adjustedKg !== undefined ? ex._adjustedKg : null) ?? suggested ?? 0;

    const setsArr = [];

    if (workingKg >= 30) {
      const w1 = Math.max(2.5, Math.round((workingKg * 0.50) / 2.5) * 2.5);
      const w2 = Math.max(2.5, Math.round((workingKg * 0.75) / 2.5) * 2.5);
      setsArr.push({ setNumber: 0, weightKg: w1, reps: 8,  rpe: null, isWarmup: true,  completedAt: null });
      setsArr.push({ setNumber: 0, weightKg: w2, reps: 5,  rpe: null, isWarmup: true,  completedAt: null });
    } else if (workingKg >= 15) {
      const w1 = Math.max(2.5, Math.round((workingKg * 0.60) / 2.5) * 2.5);
      setsArr.push({ setNumber: 0, weightKg: w1, reps: 10, rpe: null, isWarmup: true,  completedAt: null });
    }

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
  S.onRenderActive?.();

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
