// frontend/js/workoutLogger.js — Premium workout logger
// Features: PREVIOUS por set, PR badges, 1RM live, pausa, inactividad,
//           rest timer en cabecera, tabla de músculos, plate calc, export.
import * as Session from './workoutSession.js';
import * as PR      from './workoutPR.js';
import * as ORM     from './oneRepMax.js';

const REST_DEFAULT = 90; // segundos de descanso por defecto

let _root            = null;
let _session         = null;
let _timerInterval   = null;
let _restInterval    = null;
let _restRemaining   = 0;
let _restTotal       = REST_DEFAULT;
let _restExKey       = null;   // ejercicio cuyo rest timer está corriendo
let _prToastQueue    = [];     // cola de toasts PR
let _prToastActive   = false;
let _lastActivityAt  = Date.now();
let _inactivityTimer = null;
let _inactivityToast = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function liveVolume() {
  if (!_session) return 0;
  return _session.exercises.reduce((total, ex) => {
    return total + ex.sets
      .filter(s => !s.isWarmup && s.completedAt)
      .reduce((sum, s) => sum + (s.weightKg || 0) * (s.reps || 0), 0);
  }, 0);
}

// ─── Exercise search (usa Exercises.getDB si está disponible) ─────────────────
function searchExercises(query) {
  const db = (typeof Exercises !== 'undefined' && Exercises.getDB)
    ? Exercises.getDB()
    : [];
  const q = query.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return db.filter(ex => {
    const name = ex.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return name.includes(q);
  }).slice(0, 8);
}

// ─── REST TIMER ────────────────────────────────────────────────────────────────
function startRestTimer(secs = REST_DEFAULT) {
  clearInterval(_restInterval);
  _restRemaining = secs;
  _restTotal = secs;
  updateRestUI();

  _restInterval = setInterval(() => {
    _restRemaining--;
    updateRestUI();
    if (_restRemaining <= 0) {
      clearInterval(_restInterval);
      hideRestTimer();
    }
  }, 1000);
}

function stopRestTimer() {
  clearInterval(_restInterval);
  hideRestTimer();
}

function updateRestUI() {
  const bar = _root?.querySelector('#wl-rest-bar');
  if (!bar) return;
  bar.querySelector('.wl-rest-time').textContent = fmtTime(_restRemaining);
  const pct = Math.max(0, (_restRemaining / _restTotal) * 100);
  bar.querySelector('.wl-rest-progress-fill').style.width = `${pct}%`;
}

function showRestBar() {
  const bar = _root?.querySelector('#wl-rest-bar');
  if (bar) bar.classList.add('wl-rest-bar--visible');
}

function hideRestTimer() {
  const bar = _root?.querySelector('#wl-rest-bar');
  if (bar) bar.classList.remove('wl-rest-bar--visible');
}

// ─── IDLE ──────────────────────────────────────────────────────────────────────
function renderIdle() {
  // Última sesión para mostrar vista previa
  const history = Session.getLocalSessions();
  const lastSession = history[0];
  let lastHtml = '';
  if (lastSession) {
    const d = new Date(lastSession.startedAt);
    const dateStr = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
    const exNames = (lastSession.exercises || []).slice(0, 3).map(e => e.name).join(', ');
    const more = (lastSession.exercises || []).length > 3 ? ` +${(lastSession.exercises||[]).length - 3}` : '';
    lastHtml = `
      <div class="wl-last-session">
        <div class="wl-last-label">Última sesión</div>
        <div class="wl-last-date">${dateStr}</div>
        <div class="wl-last-exercises">${exNames}${more}</div>
      </div>`;
  }

  // Rutina IA guardada (slot único — tier gratuito)
  let iaRoutines = [];
  try { iaRoutines = JSON.parse(localStorage.getItem('hs_routine_history') || '[]'); } catch {}
  try {
    const activeRaw = JSON.parse(localStorage.getItem('hs_routine') || 'null');
    if (activeRaw?.routine?.sessions) {
      const alreadyIn = iaRoutines.some(r => r.ts === activeRaw.ts);
      if (!alreadyIn) {
        iaRoutines = [
          { ts: activeRaw.ts || Date.now(), label: 'Última rutina generada', routine: activeRaw.routine },
          ...iaRoutines,
        ];
      }
    }
  } catch { /* ignorar */ }

  // Rutina personalizada del usuario (slot separado)
  let customRoutine = null;
  try { customRoutine = JSON.parse(localStorage.getItem('hs_custom_routine') || 'null'); } catch {}

  const hasIA     = iaRoutines.length > 0;
  const hasCustom = customRoutine?.sessions?.length > 0;

  _root.innerHTML = `
    <div class="wl-idle">
      <div class="wl-idle-body">
        <h3 class="wl-idle-title">¿Cómo quieres entrenar?</h3>
        ${lastHtml}
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
      </div>
    </div>`;

  _root.querySelector('#wl-mode-free').addEventListener('click', () => {
    _session = Session.startSession();
    window.dispatchEvent(new CustomEvent('hs:workout-session-changed'));
    renderActive();
  });

  _root.querySelector('#wl-mode-build')?.addEventListener('click', () => {
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

  _root.querySelector('#wl-mode-custom')?.addEventListener('click', () => {
    if (hasCustom) {
      renderRoutinePicker([{ label: 'Mi rutina', routine: customRoutine, ts: customRoutine.ts || 0 }]);
    } else {
      renderCustomRoutineBuilder();
    }
  });
}

// ─── Selector de rutinas guardadas ─────────────────────────────────────────────
function renderRoutinePicker(routines) {
  _root.innerHTML = `
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
            <div class="wl-picker-name">${r.label || r.name || 'Rutina sin nombre'}</div>
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

  _root.querySelector('#wl-picker-back').addEventListener('click', renderIdle);

  _root.querySelectorAll('.wl-picker-day').forEach(btn => {
    btn.addEventListener('click', () => {
      const ridx = parseInt(btn.dataset.ridx);
      const sidx = parseInt(btn.dataset.sidx);
      const activeDays = (routines[ridx]?.routine?.sessions || []).filter(s => s.exercises && s.exercises.length > 0);
      const daySession = activeDays[sidx];
      if (daySession) renderPreWorkoutAdjust(daySession);
    });
  });
}

// ─── Pantalla de ajuste de pesos pre-entreno ───────────────────────────────────
// Permite revisar y modificar los pesos planificados antes de empezar
function renderPreWorkoutAdjust(daySession) {
  const exList = (daySession.exercises || []).filter(ex => ex.name);

  _root.innerHTML = `
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
              <input type="number" class="wl-pre-weight-inp" id="wl-pre-weight-${i}"
                value="${planned}" min="0" step="2.5" style="font-size:16px">
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

  _root.querySelector('#wl-pre-back').addEventListener('click', renderIdle);

  // Steppers +/−
  _root.querySelectorAll('.wl-pre-stepper').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const inp = _root.querySelector(`#wl-pre-weight-${idx}`);
      if (!inp) return;
      const step = 2.5;
      const cur  = parseFloat(inp.value) || 0;
      inp.value  = Math.max(0, btn.dataset.dir === '+' ? cur + step : cur - step);
    });
  });

  _root.querySelector('#wl-pre-start').addEventListener('click', () => {
    // Aplicar pesos ajustados al daySession antes de cargarlo
    const adjusted = { ...daySession, exercises: exList.map((ex, i) => {
      const inp = _root.querySelector(`#wl-pre-weight-${i}`);
      const kg  = inp ? (parseFloat(inp.value) || 0) : 0;
      return { ...ex, _adjustedKg: kg };
    }) };
    _loadRoutineSession(adjusted);
  });
}

// ─── Constructor de rutina personalizada ──────────────────────────────────────
function renderCustomRoutineBuilder() {
  const db = (typeof Exercises !== 'undefined' && Exercises.getDB) ? Exercises.getDB() : [];
  const days = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

  // Estado temporal
  let sessions = [{ day: 'Día 1', name: 'Mi sesión', exercises: [] }];

  function _render() {
    _root.innerHTML = `
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

    _root.querySelector('#wl-custom-back').addEventListener('click', renderIdle);
    _root.querySelector('#wl-custom-add-session').addEventListener('click', () => {
      sessions.push({ day: `Día ${sessions.length + 1}`, name: 'Nueva sesión', exercises: [] });
      _render();
    });

    // Borrar sesión
    _root.querySelectorAll('.wl-custom-del-session').forEach(btn => {
      btn.addEventListener('click', () => {
        const si = parseInt(btn.dataset.si);
        sessions.splice(si, 1);
        if (!sessions.length) sessions.push({ day: 'Día 1', name: 'Mi sesión', exercises: [] });
        _render();
      });
    });

    // Actualizar nombre de día/sesión
    _root.querySelectorAll('.wl-custom-day-inp').forEach(inp => {
      inp.addEventListener('input', () => { sessions[parseInt(inp.dataset.si)].day = inp.value; });
    });
    _root.querySelectorAll('.wl-custom-name-inp').forEach(inp => {
      inp.addEventListener('input', () => { sessions[parseInt(inp.dataset.si)].name = inp.value; });
    });

    // Actualizar sets/reps
    _root.querySelectorAll('.wl-custom-sets-inp').forEach(inp => {
      inp.addEventListener('change', () => {
        sessions[parseInt(inp.dataset.si)].exercises[parseInt(inp.dataset.ei)].sets = parseInt(inp.value) || 3;
      });
    });
    _root.querySelectorAll('.wl-custom-reps-inp').forEach(inp => {
      inp.addEventListener('change', () => {
        sessions[parseInt(inp.dataset.si)].exercises[parseInt(inp.dataset.ei)].reps = parseInt(inp.value) || 8;
      });
    });

    // Borrar ejercicio
    _root.querySelectorAll('.wl-custom-del-ex').forEach(btn => {
      btn.addEventListener('click', () => {
        const si = parseInt(btn.dataset.si), ei = parseInt(btn.dataset.ei);
        sessions[si].exercises.splice(ei, 1);
        _render();
      });
    });

    // Búsqueda de ejercicios por sesión
    _root.querySelectorAll('.wl-custom-ex-search').forEach(inp => {
      const si = parseInt(inp.dataset.si);
      const resultsEl = _root.querySelector(`.wl-custom-ex-results[data-si="${si}"]`);
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
    _root.querySelector('#wl-custom-save').addEventListener('click', () => {
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
// automático escalado al peso de trabajo. Sin historia → todo a 0, el usuario rellena.
function _loadRoutineSession(daySession) {
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

    // Sets de trabajo con peso pre-rellenado
    for (let s = 0; s < numSets; s++) {
      setsArr.push({ setNumber: s + 1, weightKg: workingKg, reps: targetR, rpe: null, isWarmup: false, completedAt: null });
    }

    // Buscar grupo muscular en la DB de ejercicios
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
    routineId:  daySession.day || null,
    startedAt:  new Date().toISOString(),
    exercises,
  };
  Session.saveDraft(draft);
  _session = draft;
  window.dispatchEvent(new CustomEvent('hs:workout-session-changed'));
  renderActive();

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

// ─── ACTIVE ────────────────────────────────────────────────────────────────────
function renderActive() {
  _root.innerHTML = `
    <!-- Rest timer bar (hidden until a set is completed) -->
    <div id="wl-rest-bar" class="wl-rest-bar">
      <div class="wl-rest-left">
        <span class="wl-rest-label">Descanso</span>
        <span class="wl-rest-time">01:30</span>
      </div>
      <div class="wl-rest-progress"><div class="wl-rest-progress-fill"></div></div>
      <button class="wl-rest-skip" id="wl-rest-skip">Saltar</button>
    </div>

    <!-- Header sesión -->
    <div class="wl-session-header">
      <div class="wl-session-meta">
        <span class="wl-timer" id="wl-timer">00:00</span>
        <span class="wl-vol-live" id="wl-vol-live">0 kg</span>
      </div>
      <div class="wl-session-actions">
        <button class="wl-pause-btn" id="wl-pause-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          Pausar
        </button>
        <button class="wl-finish-btn" id="wl-finish">Finalizar</button>
      </div>
    </div>

    <!-- Columnas: ejercicios | anat -->
    <div class="wl-layout">
      <div class="wl-exercises-col">
        <div id="wl-exercises" class="wl-exercises"></div>

        <!-- Añadir ejercicio -->
        <div class="wl-add-exercise-panel" id="wl-add-ex-panel">
          <div class="wl-ex-search-wrap">
            <input type="text" id="wl-ex-input"
              placeholder="Buscar ejercicio..."
              class="wl-input" autocomplete="off" />
          </div>
          <div class="wl-ex-results" id="wl-ex-results"></div>
          <button class="btn--ghost wl-add-custom-btn" id="wl-add-custom">
            + Añadir personalizado
          </button>
        </div>
      </div>

      <!-- Visor anatómico de la sesión -->
      <div class="wl-anatomy-col" id="wl-anatomy-col">
        <div class="wl-anatomy-wrap anatomy-lens-container" id="wl-anatomy-container"></div>
        <div class="wl-anatomy-legend" id="wl-anatomy-legend"></div>
      </div>
    </div>`;

  startTimer();
  renderExercises();
  initExerciseSearch();
  initAnatomy();
  _resetInactivity();
  _startInactivityWatch();

  _root.querySelector('#wl-finish').addEventListener('click', onFinish);
  _root.querySelector('#wl-rest-skip').addEventListener('click', stopRestTimer);
  _root.querySelector('#wl-pause-btn').addEventListener('click', togglePause);

  // Si la sesión se restauró pausada, aplicar estado visual
  if (_session?.pausedAt) {
    _showPauseOverlay();
    _updatePauseBtn(true);
  }
}

// ─── Exercise search/autocomplete ──────────────────────────────────────────────
function initExerciseSearch() {
  const input = _root.querySelector('#wl-ex-input');
  const results = _root.querySelector('#wl-ex-results');
  const customBtn = _root.querySelector('#wl-add-custom');

  if (!input || !results) return;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    const hits = q.length >= 1 ? searchExercises(q) : [];
    if (!hits.length && q.length >= 1) {
      results.innerHTML = '<p class="wl-no-results">Sin resultados — usa "Añadir personalizado"</p>';
    } else {
      results.innerHTML = hits.map(ex => `
        <button class="wl-ex-result-item" data-name="${ex.name}" data-group="${ex.group || ''}">
          <span class="wl-res-name">${ex.name}</span>
          <span class="wl-res-group">${ex.group || ''}</span>
        </button>`).join('');
    }
    results.querySelectorAll('.wl-ex-result-item').forEach(btn => {
      btn.addEventListener('click', () => {
        addExerciseToSession(btn.dataset.name, btn.dataset.group);
        input.value = '';
        results.innerHTML = '';
      });
    });
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const first = results.querySelector('.wl-ex-result-item');
      if (first) first.click();
      else if (input.value.trim()) {
        addExerciseToSession(input.value.trim());
        input.value = '';
        results.innerHTML = '';
      }
    }
  });

  if (customBtn) {
    customBtn.addEventListener('click', () => {
      const name = input.value.trim() || prompt('Nombre del ejercicio:');
      if (name) {
        addExerciseToSession(name);
        input.value = '';
        results.innerHTML = '';
      }
    });
  }
}

function addExerciseToSession(name, group) {
  const ex = Session.addExercise(_session, name);
  if (ex && group) ex.group = group;
  Session.saveDraft(_session);
  renderExercises();
  updateVolLabel();
}

// ─── Anatomy mini viewer dentro de la sesión ───────────────────────────────────
let _wlViewer = null;

async function initAnatomy() {
  const container = _root?.querySelector('#wl-anatomy-container');
  if (!container) return;
  try {
    const mod = await import('./anatomyLens/index.js');
    _wlViewer = mod.createViewer();
    await _wlViewer.init(container);
  } catch (e) {
    console.warn('[WorkoutLogger] anatomy viewer failed:', e);
    _wlViewer = null;
  }
}

function highlightAnatomy(exerciseKey) {
  if (!_wlViewer) return;
  try {
    const { resolveExercise } = window.__anatomyLensUtils || {};
    // Fallback: usar muscleMap desde el módulo ya importado
    import('./anatomyLens/muscleMap.js').then(mod => {
      const { primary, secondary } = mod.resolveExercise(exerciseKey, []);
      _wlViewer.highlight(primary, secondary);
      const legend = _root?.querySelector('#wl-anatomy-legend');
      if (legend) {
        legend.innerHTML = [
          ...primary.map(m => `<span class="al-legend-group"><span class="al-legend-dot primary"></span>${m.replace(/_/g,' ')}</span>`),
          ...secondary.map(m => `<span class="al-legend-group"><span class="al-legend-dot secondary"></span>${m.replace(/_/g,' ')}</span>`),
        ].join('');
      }
    }).catch(() => {});
  } catch (e) {}
}

// ─── Timer (usa duración activa, excluye tiempo pausado) ──────────────────────
function startTimer() {
  clearInterval(_timerInterval);
  _timerInterval = setInterval(() => {
    if (_session?.pausedAt) return; // congelado en pausa
    const el = _root?.querySelector('#wl-timer');
    if (!el) return;
    const ms   = Session.getActiveDurationMs(_session);
    el.textContent = fmtTime(Math.floor(ms / 1000));
  }, 1000);
}

// ─── Pausa / Reanudar ──────────────────────────────────────────────────────────
function togglePause() {
  if (!_session) return;
  if (_session.pausedAt) {
    // Reanudar
    Session.resumeSession(_session);
    if (_restRemaining > 0) {
      // reanudar rest timer si quedaba tiempo
      _restInterval = setInterval(() => {
        _restRemaining--;
        updateRestUI();
        _updateExerciseRestHeader(_restExKey);
        if (_restRemaining <= 0) {
          clearInterval(_restInterval);
          hideRestTimer();
          _updateExerciseRestHeader(_restExKey);
        }
      }, 1000);
    }
    _removePauseOverlay();
    _updatePauseBtn(false);
    _resetInactivity();
  } else {
    // Pausar
    Session.pauseSession(_session);
    clearInterval(_restInterval); // pausa rest timer
    _showPauseOverlay();
    _updatePauseBtn(true);
  }
}

function _updatePauseBtn(isPaused) {
  const btn = _root?.querySelector('#wl-pause-btn');
  if (!btn) return;
  btn.innerHTML = isPaused
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Reanudar'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pausar';
  btn.classList.toggle('wl-pause-btn--paused', isPaused);
}

function _showPauseOverlay() {
  const existing = _root?.querySelector('#wl-pause-overlay');
  if (existing) return;
  const overlay = document.createElement('div');
  overlay.id = 'wl-pause-overlay';
  overlay.className = 'wl-pause-overlay';
  overlay.innerHTML = '<span class="wl-pause-overlay-text">Sesión pausada · Toca ▶ Reanudar para continuar</span>';
  _root?.querySelector('.wl-exercises-col')?.prepend(overlay);
}

function _removePauseOverlay() {
  _root?.querySelector('#wl-pause-overlay')?.remove();
}

// ─── Inactividad ───────────────────────────────────────────────────────────────
function _resetInactivity() {
  _lastActivityAt = Date.now();
}

function _startInactivityWatch() {
  clearInterval(_inactivityTimer);
  _inactivityTimer = setInterval(() => {
    if (_session?.pausedAt) return; // no contar inactividad durante pausa
    const idleMs = Date.now() - _lastActivityAt;
    if (idleMs >= 3600000) { // 60 min → auto-close
      clearInterval(_inactivityTimer);
      _inactivityToast?.remove();
      onFinish();
    } else if (idleMs >= 600000 && !_inactivityToast) { // 10 min → aviso
      _showInactivityToast();
    }
  }, 30000); // check cada 30s
}

function _showInactivityToast() {
  if (_inactivityToast) return;
  _inactivityToast = document.createElement('div');
  _inactivityToast.className = 'wl-inactivity-toast';
  _inactivityToast.innerHTML = `
    <span class="wl-inact-icon">◷</span>
    <span class="wl-inact-msg">¿Sigues ahí? Llevas más de 10 min sin registrar nada.</span>
    <div class="wl-inact-actions">
      <button class="wl-inact-continue">Continuar</button>
      <button class="wl-inact-finish">Finalizar sesión</button>
    </div>`;
  document.body.appendChild(_inactivityToast);
  _inactivityToast.querySelector('.wl-inact-continue').addEventListener('click', () => {
    _resetInactivity();
    _inactivityToast?.remove();
    _inactivityToast = null;
  });
  _inactivityToast.querySelector('.wl-inact-finish').addEventListener('click', () => {
    _inactivityToast?.remove();
    _inactivityToast = null;
    onFinish();
  });
}

function updateVolLabel() {
  const el = _root?.querySelector('#wl-vol-live');
  if (el) el.textContent = `${liveVolume().toLocaleString('es-ES')} kg`;
}

// ─── Rest timer en cabecera del ejercicio ──────────────────────────────────────
function _updateExerciseRestHeader(exerciseKey) {
  if (!exerciseKey) return;
  const card = _root?.querySelector(`[data-ex-key="${exerciseKey}"]`);
  if (!card) return;
  const restEl = card.querySelector('.wl-ex-rest-countdown');
  if (!restEl) return;
  if (_restRemaining > 0 && _restExKey === exerciseKey) {
    restEl.textContent = `◷ ${fmtTime(_restRemaining)}`;
    restEl.classList.add('wl-ex-rest-countdown--active');
  } else {
    const ex = _session?.exercises.find(e => e.key === exerciseKey);
    const secs = ex?.restSecs || REST_DEFAULT;
    restEl.textContent = `◷ ${fmtTime(secs)}`;
    restEl.classList.remove('wl-ex-rest-countdown--active');
  }
}

// ─── PR toast queue ────────────────────────────────────────────────────────────
function _enqueuePRToast(exerciseName, type, delta, oneRM) {
  _prToastQueue.push({ exerciseName, type, delta, oneRM });
  if (!_prToastActive) _flushPRToast();
}

function _flushPRToast() {
  if (!_prToastQueue.length) { _prToastActive = false; return; }
  _prToastActive = true;
  const { exerciseName, type, delta, oneRM } = _prToastQueue.shift();
  const label = PR.prLabel(type, delta, oneRM);
  const t = document.createElement('div');
  t.className = 'wl-pr-toast';
  t.innerHTML = `<span class="wl-pr-toast-dot"></span>
    <div class="wl-pr-toast-body">
      <span class="wl-pr-toast-title">Nuevo Récord — ${exerciseName}</span>
      <span class="wl-pr-toast-sub">${label}</span>
    </div>`;
  document.body.appendChild(t);
  setTimeout(() => {
    t.classList.add('wl-pr-toast--hide');
    setTimeout(() => { t.remove(); _flushPRToast(); }, 400);
  }, 4000);
}

// ─── Render exercises list ──────────────────────────────────────────────────────
function renderExercises() {
  const container = _root?.querySelector('#wl-exercises');
  if (!container) return;
  container.innerHTML = '';

  _session.exercises.forEach(ex => {
    const completedSets = ex.sets.filter(s => s.completedAt).length;
    const workingSets   = ex.sets.filter(s => !s.isWarmup);
    const totalSets     = ex.sets.length;

    // Badge sets×reps (solo si viene de rutina con datos)
    const numWorking = workingSets.length;
    const targetReps = workingSets[0]?.reps || null;
    const setsRepsBadge = (numWorking > 0 && targetReps)
      ? `<span class="wl-ex-scheme">${numWorking}×${targetReps}</span>` : '';

    // Rest time en cabecera
    const restSecs   = ex.restSecs || REST_DEFAULT;
    const restLabel  = `<span class="wl-ex-rest-countdown" data-key="${ex.key}">◷ ${fmtTime(restSecs)}</span>`;

    const card = document.createElement('div');
    card.className = 'wl-ex-card';
    card.dataset.exKey = ex.key;

    // Chip de grupo muscular
    const GROUP_LABELS = { pecho:'Pecho', espalda:'Espalda', piernas:'Piernas', hombros:'Hombros', brazos:'Brazos', core:'Core', gluteos:'Glúteos', cardio:'Cardio' };
    const GROUP_KEYS   = { pecho:'chest', espalda:'back', piernas:'legs', hombros:'shoulders', brazos:'arms', core:'core', gluteos:'glutes', cardio:'cardio' };
    const groupLabel = (ex.group && GROUP_LABELS[ex.group]) ? GROUP_LABELS[ex.group] : (ex.group || '');
    const groupKey   = (ex.group && GROUP_KEYS[ex.group]) || 'other';
    const groupChip  = groupLabel
      ? `<span class="wl-ex-group-chip" data-group="${groupKey}">${groupLabel}</span>` : '';

    card.innerHTML = `
      <div class="wl-ex-card-header">
        <div class="wl-ex-info">
          <div class="wl-ex-name-row" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <button class="wl-ex-name-btn" data-key="${ex.key}">${ex.name}</button>
            ${groupChip}
          </div>
          <div class="wl-ex-meta-row">${setsRepsBadge}${restLabel}</div>
        </div>
        <div class="wl-ex-card-actions">
          ${totalSets ? `<span class="wl-ex-progress">${completedSets}/${totalSets}</span>` : ''}
          <button class="wl-ex-delete" data-key="${ex.key}" title="Eliminar ejercicio">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Cabecera de columnas -->
      <div class="wl-sets-header">
        <span>Set</span><span>Anterior</span><span>Peso kg</span><span></span><span>Reps</span><span>1RM</span><span>✓</span><span></span>
      </div>

      <div class="wl-sets-list" id="wl-sets-${CSS.escape(ex.key)}"></div>

      <button class="wl-add-set-btn" data-key="${ex.key}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Añadir set
      </button>`;

    container.appendChild(card);
    renderSets(ex);

    // Delete exercise
    card.querySelector('.wl-ex-delete').addEventListener('click', () => {
      _session.exercises = _session.exercises.filter(e => e.key !== ex.key);
      Session.saveDraft(_session);
      renderExercises();
    });

    // Highlight anatomy on click
    card.querySelector('.wl-ex-name-btn').addEventListener('click', () => {
      highlightAnatomy(ex.key);
    });

    // Add set
    card.querySelector('.wl-add-set-btn').addEventListener('click', () => {
      Session.addSet(_session, ex.key);
      renderSets(ex);
    });
  });
}

// ─── PREVIOUS por posición de set ─────────────────────────────────────────────
function _getPrevSet(exerciseKey, setIndex) {
  // setIndex es el índice en ex.sets (incluyendo warmups). Solo buscamos en working sets.
  let sessions = [];
  try { sessions = JSON.parse(localStorage.getItem('hs_workout_sessions_local') || '[]'); } catch {}
  const prev = sessions.find(s => s.exercises?.some(e => e.key === exerciseKey));
  if (!prev) return null;
  const prevEx = prev.exercises.find(e => e.key === exerciseKey);
  if (!prevEx) return null;
  // Filtramos solo los working sets de la sesión anterior
  const prevWorking = (prevEx.sets || []).filter(s => !s.isWarmup);
  // setIndex entre los working sets de la sesión actual
  const currentEx   = _session?.exercises.find(e => e.key === exerciseKey);
  if (!currentEx) return null;
  const currentWorkingIdx = currentEx.sets
    .slice(0, setIndex + 1)
    .filter(s => !s.isWarmup).length - 1;
  const match = prevWorking[currentWorkingIdx];
  return match ? `${match.weightKg}×${match.reps}` : null;
}

// ─── Render sets for one exercise ──────────────────────────────────────────────
function renderSets(ex) {
  const container = _root?.querySelector(`#wl-sets-${CSS.escape(ex.key)}`);
  if (!container) return;
  container.innerHTML = '';

  ex.sets.forEach((s, idx) => {
    const isDone  = !!s.completedAt;
    const isPRSet = !!s._isPR; // marcado al completar
    const prevStr = s.isWarmup ? null : _getPrevSet(ex.key, idx);

    // 1RM: solo mostrar si está completado y no es warmup
    let ormStr = '—';
    if (isDone && !s.isWarmup && s.weightKg > 0 && s.reps > 0) {
      const orm = ORM.best1RM(s.weightKg, s.reps);
      if (orm) ormStr = `${orm} kg`;
    }

    const row = document.createElement('div');
    row.className = [
      'wl-set-row',
      s.isWarmup ? 'wl-set-warmup' : '',
      isDone     ? 'wl-set-done'   : '',
      isPRSet    ? 'wl-set-pr'     : '',
    ].filter(Boolean).join(' ');

    row.innerHTML = `
      <span class="wl-set-num">${s.isWarmup ? '🔥' : s.setNumber}${isPRSet ? '<span class="wl-pr-badge">PR</span>' : ''}</span>

      <span class="wl-set-prev">${prevStr ?? '—'}</span>

      <input type="number" class="wl-input-num wl-weight"
        value="${s.weightKg || ''}"
        placeholder="${Session.getSuggestedWeight(ex.key) ?? '0'}"
        min="0" step="0.5"
        data-field="weightKg" data-idx="${idx}" data-key="${ex.key}"
        ${isDone ? 'readonly' : ''} />

      <span class="wl-x">×</span>

      <input type="number" class="wl-input-num wl-reps"
        value="${s.reps || ''}" placeholder="0"
        min="0"
        data-field="reps" data-idx="${idx}" data-key="${ex.key}"
        ${isDone ? 'readonly' : ''} />

      ${s.isWarmup ? '<span class="wl-set-orm-empty"></span>' : `<span class="wl-set-orm">${ormStr}</span>`}

      <button class="wl-set-check${isDone ? ' wl-set-check--done' : ''}"
        data-idx="${idx}" data-key="${ex.key}" title="${isDone ? 'Deshacer' : 'Completar set'}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </button>

      <button class="wl-set-del" data-idx="${idx}" data-key="${ex.key}" title="Eliminar">×</button>`;

    container.appendChild(row);
  });

  // Bind inputs
  container.querySelectorAll('[data-field]').forEach(inp => {
    const event = inp.type === 'checkbox' ? 'change' : 'input';
    inp.addEventListener(event, e => {
      _resetInactivity();
      const { key, idx, field } = e.target.dataset;
      const val = field === 'weightKg' ? (parseFloat(e.target.value) || 0)
                                       : (parseInt(e.target.value) || 0);
      Session.updateSet(_session, key, +idx, { [field]: val });
    });
  });

  // Complete set button
  container.querySelectorAll('.wl-set-check').forEach(btn => {
    btn.addEventListener('click', () => {
      _resetInactivity();
      const { key, idx } = btn.dataset;
      const ex2 = _session.exercises.find(e2 => e2.key === key);
      if (!ex2) return;
      const s = ex2.sets[+idx];
      if (!s) return;
      const wasDone = !!s.completedAt;

      // Flush DOM values antes de completar
      if (!wasDone) {
        const row = btn.closest('.wl-set-row');
        const weightInp = row?.querySelector('[data-field="weightKg"]');
        const repsInp   = row?.querySelector('[data-field="reps"]');
        if (weightInp) Session.updateSet(_session, key, +idx, { weightKg: parseFloat(weightInp.value) || 0 });
        if (repsInp)   Session.updateSet(_session, key, +idx, { reps: parseInt(repsInp.value) || 0 });
      }

      Session.updateSet(_session, key, +idx, {
        completedAt: wasDone ? null : new Date().toISOString(),
      });

      if (!wasDone && !s.isWarmup) {
        // PR detection
        const setNow = ex2.sets[+idx];
        const prResult = PR.detectSetPR(key, setNow.weightKg, setNow.reps);
        if (prResult.isPR) {
          PR.saveSetPR(key, setNow.weightKg, setNow.reps);
          setNow._isPR = true;
          const orm = ORM.best1RM(setNow.weightKg, setNow.reps);
          _enqueuePRToast(ex2.name, prResult.type, prResult.delta, orm);
          // Haptic PR — patrón distintivo
          window.haptic?.pr();
          window.dispatchEvent(new CustomEvent('hs:pr-achieved', { detail: { exerciseKey: key } }));
        } else {
          // Haptic set completado — ligero
          window.haptic?.light();
          window.dispatchEvent(new CustomEvent('hs:set-completed'));
        }

        // Rest timer con tiempo del ejercicio
        _restExKey = key;
        const restSecs = ex2.restSecs || REST_DEFAULT;
        startRestTimer(restSecs);
        showRestBar();
        _updateExerciseRestHeader(key);
      }

      if (wasDone) s._isPR = false; // deshacer quita el badge

      renderSets(ex2);
      updateVolLabel();

      // Actualizar progreso en cabecera
      const card = _root?.querySelector(`[data-ex-key="${key}"]`);
      const done2  = ex2.sets.filter(s2 => s2.completedAt).length;
      const total2 = ex2.sets.length;
      const prog   = card?.querySelector('.wl-ex-progress');
      if (prog) prog.textContent = `${done2}/${total2}`;
    });
  });

  // Delete set
  container.querySelectorAll('.wl-set-del').forEach(btn => {
    btn.addEventListener('click', () => {
      _resetInactivity();
      const { key, idx } = btn.dataset;
      const ex2 = _session.exercises.find(e2 => e2.key === key);
      if (!ex2) return;
      ex2.sets.splice(+idx, 1);
      ex2.sets.forEach((s, i) => {
        if (!s.isWarmup) s.setNumber = ex2.sets.filter((ss, ii) => ii <= i && !ss.isWarmup).length;
      });
      Session.saveDraft(_session);
      renderSets(ex2);
      updateVolLabel();
    });
  });
}

// ─── Finish session ─────────────────────────────────────────────────────────────
async function onFinish() {
  clearInterval(_timerInterval);
  clearInterval(_restInterval);
  clearInterval(_inactivityTimer);
  _inactivityToast?.remove();
  _inactivityToast = null;

  const finishedAt = new Date().toISOString();
  const payload = {
    routine_id: _session.routineId ?? null,
    started_at: _session.startedAt,
    finished_at: finishedAt,
    notes: null,
    exercises: _session.exercises.map(ex => ({
      exercise_key: ex.key, exercise_name: ex.name, order_index: ex.orderIndex,
      sets: ex.sets.map(s => ({
        set_number: s.setNumber, weight_kg: s.weightKg, reps: s.reps,
        rpe: s.rpe ?? null, is_warmup: s.isWarmup,
      })),
    })),
  };

  let result = null;
  try {
    const token = localStorage.getItem('hs_access_token') || sessionStorage.getItem('hs_access_token') || '';
    const resp = await fetch('/api/v1/workout/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
    });
    if (resp.ok) result = await resp.json();
  } catch {}

  Session.saveToLocalHistory({
    id: result?.session_id ?? Date.now(),
    startedAt: _session.startedAt,
    durationSecs: result?.duration_secs ?? null,
    totalVolumeKg: result?.total_volume_kg ?? null,
    exercises: _session.exercises,
  });
  Session.clearDraft();
  // Increment consistency counter for unlock milestones
  if (typeof Plan !== 'undefined' && typeof Plan.incrementSessionCount === 'function') {
    Plan.incrementSessionCount();
  }
  window.dispatchEvent(new CustomEvent('hs:workout-session-changed'));
  renderSummary(result);
}

// ─── Muscle breakdown para el resumen ─────────────────────────────────────────
function _buildMuscleBreakdown() {
  // Mapeo simplificado: exercise key → músculos primarios
  const MUSCLE_MAP = {
    press_banca_plano:      ['Pecho', 'Tríceps'], press_banca_inclinado: ['Pecho', 'Hombros'],
    fondos_pecho:           ['Pecho', 'Tríceps'], aperturas_mancuernas:  ['Pecho'],
    press_militar_barra:    ['Hombros', 'Tríceps'], elevaciones_laterales: ['Hombros'],
    dominadas_pronas:       ['Espalda', 'Bíceps'], remo_barra:            ['Espalda'],
    remo_mancuerna:         ['Espalda', 'Bíceps'], jalon_pecho:           ['Espalda', 'Bíceps'],
    peso_muerto_convencional:['Espalda', 'Piernas'], curl_barra:           ['Bíceps'],
    curl_martillo:          ['Bíceps'], extension_triceps_polea: ['Tríceps'],
    press_frances:          ['Tríceps'], sentadilla:              ['Piernas', 'Glúteos'],
    prensa_piernas:         ['Piernas'], extension_cuadriceps:    ['Piernas'],
    curl_femoral_tumbado:   ['Isquios'], hip_thrust:              ['Glúteos'],
    sentadilla_bulgara:     ['Piernas', 'Glúteos'], plancha:               ['Core'],
    crunch:                 ['Core'],  ab_wheel:                 ['Core'],
  };

  const counts = {};
  _session.exercises.forEach(ex => {
    const completedWorking = ex.sets.filter(s => !s.isWarmup && s.completedAt).length;
    if (!completedWorking) return;
    const muscles = MUSCLE_MAP[ex.key];
    if (!muscles) {
      counts['Otros'] = (counts['Otros'] || 0) + completedWorking;
      return;
    }
    muscles.forEach(m => { counts[m] = (counts[m] || 0) + completedWorking; });
  });

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return '';

  const max = entries[0][1];
  const bars = entries.map(([muscle, n]) => {
    const pct = Math.round((n / max) * 100);
    return `<div class="wl-muscle-row">
      <span class="wl-muscle-name">${muscle}</span>
      <div class="wl-muscle-bar-wrap">
        <div class="wl-muscle-bar-fill" style="width:${pct}%"></div>
      </div>
      <span class="wl-muscle-count">${n}</span>
    </div>`;
  }).join('');

  return `<div class="wl-muscle-breakdown">
    <h4 class="wl-muscle-title">Músculos trabajados</h4>
    ${bars}
  </div>`;
}

// ─── Summary ────────────────────────────────────────────────────────────────────
function renderSummary(result) {
  const startTime = new Date(_session.startedAt);
  const durationSecs = result?.duration_secs ?? Math.floor((Date.now() - startTime) / 1000);
  const volume = result?.total_volume_kg ?? liveVolume();
  const exerciseCount = _session.exercises.length;
  const setCount = _session.exercises.reduce((n, ex) => n + ex.sets.filter(s => !s.isWarmup && s.completedAt).length, 0);
  const xp = result?.xp_awarded;
  const prs = result?.prs || [];

  _root.innerHTML = `
    <div class="wl-summary">
      <div class="wl-summary-header">
        <div class="wl-summary-emoji"></div>
        <h2 class="wl-summary-title">¡Sesión completada!</h2>
        <p class="wl-summary-date">${startTime.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' })}</p>
      </div>

      <div class="wl-summary-stats">
        <div class="wl-stat-box">
          <span class="wl-stat-box-val">${fmtTime(durationSecs)}</span>
          <span class="wl-stat-box-lbl">Duración</span>
        </div>
        <div class="wl-stat-box">
          <span class="wl-stat-box-val">${volume ? volume.toLocaleString('es-ES') + ' kg' : '—'}</span>
          <span class="wl-stat-box-lbl">Volumen total</span>
        </div>
        <div class="wl-stat-box">
          <span class="wl-stat-box-val">${exerciseCount}</span>
          <span class="wl-stat-box-lbl">Ejercicios</span>
        </div>
        <div class="wl-stat-box">
          <span class="wl-stat-box-val">${setCount}</span>
          <span class="wl-stat-box-lbl">Sets completados</span>
        </div>
      </div>

      ${xp ? `<div class="wl-summary-xp">+${xp} XP <span class="wl-xp-label">Gamificación</span></div>` : ''}

      ${prs.length ? `
        <div class="wl-summary-prs">
          ${prs.map(pr => `<div class="wl-pr-item">PR — ${pr.exercise_key.replace(/_/g,' ')}: ${pr.value} kg 1RM</div>`).join('')}
        </div>` : ''}

      ${_buildMuscleBreakdown()}

      <button class="wl-done-btn btn" id="wl-done">Nueva sesión</button>
    </div>`;

  _root.querySelector('#wl-done').addEventListener('click', () => {
    _session = null; _wlViewer = null;
    renderIdle();
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────────
let _storageFullListenerAdded = false;

export function init(container) {
  // Limpiar timers anteriores para evitar múltiples intervals corriendo en paralelo
  clearInterval(_timerInterval);
  clearInterval(_restInterval);
  _timerInterval = null;
  _restInterval  = null;

  _root = container;
  _wlViewer = null;
  const draft = Session.getDraft();
  if (draft) { _session = draft; renderActive(); } else { renderIdle(); }

  // Show a persistent in-UI banner when localStorage is full (solo añadir listener una vez)
  if (!_storageFullListenerAdded) {
    _storageFullListenerAdded = true;
    document.addEventListener('hs:storage-full', () => {
      const banner = _root?.querySelector('#wl-storage-warn');
      if (!banner) {
        const b = document.createElement('div');
        b.id = 'wl-storage-warn';
        b.style.cssText = 'background:#ef4444;color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;margin-bottom:8px;text-align:center';
        b.textContent = 'Almacenamiento lleno — el progreso de esta sesión puede no guardarse. Libera espacio o finaliza la sesión.';
        _root?.prepend(b);
      }
    });
  }
}
