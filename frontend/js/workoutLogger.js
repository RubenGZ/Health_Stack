// frontend/js/workoutLogger.js — Hevy-style workout logger
// UX: exercise search sheet, per-set ✓ complete, rest timer, live volume, delete.
import * as Session from './workoutSession.js';

const REST_DEFAULT = 90; // segundos de descanso por defecto

let _root = null;
let _session = null;
let _timerInterval = null;
let _restInterval = null;
let _restRemaining = 0;

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
  const total = REST_DEFAULT;
  const pct = Math.max(0, (_restRemaining / total) * 100);
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
  _root.innerHTML = `
    <div class="wl-idle">
      <div class="wl-idle-body">
        <div class="wl-idle-icon">🏋️</div>
        <h3 class="wl-idle-title">¿Listo para entrenar?</h3>
        <p class="wl-idle-sub">Registra tus series, sigue tu progresión y bate tus récords.</p>
        <button class="btn wl-start-btn" id="wl-start">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Iniciar sesión
        </button>
      </div>
    </div>`;
  _root.querySelector('#wl-start').addEventListener('click', () => {
    _session = Session.startSession();
    renderActive();
  });
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
      <button class="btn wl-finish-btn" id="wl-finish">Finalizar</button>
    </div>

    <!-- Columnas: ejercicios | anat -->
    <div class="wl-layout">
      <div class="wl-exercises-col">
        <div id="wl-exercises" class="wl-exercises"></div>

        <!-- Añadir ejercicio -->
        <div class="wl-add-exercise-panel" id="wl-add-ex-panel">
          <div class="wl-ex-search-wrap">
            <input type="text" id="wl-ex-input"
              placeholder="🔍 Buscar ejercicio..."
              class="wl-input" autocomplete="off" />
          </div>
          <div class="wl-ex-results" id="wl-ex-results"></div>
          <button class="btn-ghost wl-add-custom-btn" id="wl-add-custom">
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

  _root.querySelector('#wl-finish').addEventListener('click', onFinish);
  _root.querySelector('#wl-rest-skip').addEventListener('click', stopRestTimer);
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
        addExerciseToSession(btn.dataset.name);
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

function addExerciseToSession(name) {
  Session.addExercise(_session, name);
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

// ─── Timer ─────────────────────────────────────────────────────────────────────
function startTimer() {
  const start = new Date(_session.startedAt);
  clearInterval(_timerInterval);
  _timerInterval = setInterval(() => {
    const el = _root?.querySelector('#wl-timer');
    if (!el) return;
    const secs = Math.floor((Date.now() - start) / 1000);
    el.textContent = fmtTime(secs);
  }, 1000);
}

function updateVolLabel() {
  const el = _root?.querySelector('#wl-vol-live');
  if (el) el.textContent = `${liveVolume().toLocaleString('es-ES')} kg`;
}

// ─── Render exercises list ──────────────────────────────────────────────────────
function renderExercises() {
  const container = _root?.querySelector('#wl-exercises');
  if (!container) return;
  container.innerHTML = '';

  _session.exercises.forEach(ex => {
    const prev = Session.getPrevSessionSummary(ex.key);
    const completedSets = ex.sets.filter(s => s.completedAt).length;
    const totalSets = ex.sets.length;

    const card = document.createElement('div');
    card.className = 'wl-ex-card';
    card.dataset.exKey = ex.key;

    card.innerHTML = `
      <div class="wl-ex-card-header">
        <div class="wl-ex-info">
          <button class="wl-ex-name-btn" data-key="${ex.key}">${ex.name}</button>
          ${prev ? `<span class="wl-ex-prev">Anterior (${prev.date}): ${prev.setsStr}</span>` : ''}
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
        <span>Set</span><span></span><span>kg</span><span></span><span>Reps</span><span></span>
      </div>

      <div class="wl-sets-list" id="wl-sets-${CSS.escape(ex.key)}"></div>

      <button class="btn-ghost wl-add-set-btn" data-key="${ex.key}">+ Añadir set</button>`;

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

// ─── Render sets for one exercise ──────────────────────────────────────────────
function renderSets(ex) {
  const container = _root?.querySelector(`#wl-sets-${CSS.escape(ex.key)}`);
  if (!container) return;
  container.innerHTML = '';

  ex.sets.forEach((s, idx) => {
    const isDone = !!s.completedAt;
    const row = document.createElement('div');
    row.className = `wl-set-row${s.isWarmup ? ' wl-set-warmup' : ''}${isDone ? ' wl-set-done' : ''}`;

    row.innerHTML = `
      <span class="wl-set-num">${s.isWarmup ? 'Cal' : s.setNumber}</span>

      <label class="wl-warmup-chk" title="Calentamiento">
        <input type="checkbox" ${s.isWarmup ? 'checked' : ''} data-field="isWarmup" data-idx="${idx}" data-key="${ex.key}" />
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2a9.96 9.96 0 0 1 2.73.38C11.41 4.56 9 8.04 9 12c0 3.96 2.41 7.44 5.73 9.62A10 10 0 1 1 12 2z"/></svg>
      </label>

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
    const event = inp.type === 'checkbox' ? 'change' : 'change';
    inp.addEventListener(event, e => {
      const { key, idx, field } = e.target.dataset;
      const val = field === 'isWarmup' ? e.target.checked
                : field === 'weightKg' ? (parseFloat(e.target.value) || 0)
                : (parseInt(e.target.value) || 0);
      Session.updateSet(_session, key, +idx, { [field]: val });
      if (field === 'isWarmup') {
        const ex2 = _session.exercises.find(e2 => e2.key === key);
        if (ex2) renderSets(ex2);
      }
    });
  });

  // Complete set button
  container.querySelectorAll('.wl-set-check').forEach(btn => {
    btn.addEventListener('click', e => {
      const { key, idx } = btn.dataset;
      const ex2 = _session.exercises.find(e2 => e2.key === key);
      if (!ex2) return;
      const s = ex2.sets[+idx];
      if (!s) return;
      const wasDone = !!s.completedAt;
      Session.updateSet(_session, key, +idx, {
        completedAt: wasDone ? null : new Date().toISOString(),
      });
      if (!wasDone && !s.isWarmup) {
        startRestTimer(REST_DEFAULT);
        showRestBar();
      }
      renderSets(ex2);
      updateVolLabel();
      // Update progress badge on card
      const card = _root?.querySelector(`[data-ex-key="${key}"]`);
      const done2 = ex2.sets.filter(s2 => s2.completedAt).length;
      const total2 = ex2.sets.length;
      const prog = card?.querySelector('.wl-ex-progress');
      if (prog) prog.textContent = `${done2}/${total2}`;
    });
  });

  // Delete set
  container.querySelectorAll('.wl-set-del').forEach(btn => {
    btn.addEventListener('click', e => {
      const { key, idx } = btn.dataset;
      const ex2 = _session.exercises.find(e2 => e2.key === key);
      if (!ex2) return;
      ex2.sets.splice(+idx, 1);
      ex2.sets.forEach((s, i) => { if (!s.isWarmup) s.setNumber = ex2.sets.filter((ss, ii) => ii <= i && !ss.isWarmup).length; });
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
  renderSummary(result);
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
        <div class="wl-summary-emoji">💪</div>
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
          ${prs.map(pr => `<div class="wl-pr-item">🏆 PR — ${pr.exercise_key.replace(/_/g,' ')}: ${pr.value} kg 1RM</div>`).join('')}
        </div>` : ''}

      <button class="btn wl-done-btn" id="wl-done">Cerrar</button>
    </div>`;

  _root.querySelector('#wl-done').addEventListener('click', () => {
    _session = null; _wlViewer = null;
    renderIdle();
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────────
export function init(container) {
  _root = container;
  _wlViewer = null;
  const draft = Session.getDraft();
  if (draft) { _session = draft; renderActive(); } else { renderIdle(); }
}
