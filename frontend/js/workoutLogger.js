// frontend/js/workoutLogger.js
// UI de registro de sesión: IDLE / ACTIVE / SUMMARY.
import * as Session from './workoutSession.js';

let _root = null;
let _session = null;
let _timerInterval = null;

export function init(container) {
  _root = container;
  const draft = Session.getDraft();
  if (draft) { _session = draft; renderActive(); } else { renderIdle(); }
}

function renderIdle() {
  _root.innerHTML = `
    <div class="wl-idle">
      <p class="wl-idle-hint">¿Listo para entrenar?</p>
      <button class="btn-primary wl-start-btn" id="wl-start">Iniciar sesión</button>
    </div>`;
  _root.querySelector('#wl-start').addEventListener('click', () => {
    _session = Session.startSession();
    renderActive();
  });
}

function renderActive() {
  _root.innerHTML = `
    <div class="wl-active">
      <div class="wl-header">
        <span class="wl-timer" id="wl-timer">00:00</span>
        <button class="btn-danger wl-finish-btn" id="wl-finish">Finalizar sesión</button>
      </div>
      <div id="wl-exercises" class="wl-exercises"></div>
      <div class="wl-add-exercise">
        <input type="text" id="wl-ex-input" placeholder="Añadir ejercicio..." class="wl-input" autocomplete="off" />
        <button class="btn-secondary" id="wl-add-ex">+ Añadir</button>
      </div>
    </div>`;
  startTimer();
  renderExercises();
  _root.querySelector('#wl-finish').addEventListener('click', onFinish);
  _root.querySelector('#wl-add-ex').addEventListener('click', onAddExercise);
  _root.querySelector('#wl-ex-input').addEventListener('keydown', e => { if (e.key === 'Enter') onAddExercise(); });
}

function startTimer() {
  const start = new Date(_session.startedAt);
  clearInterval(_timerInterval);
  _timerInterval = setInterval(() => {
    const el = _root.querySelector('#wl-timer');
    if (!el) return;
    const secs = Math.floor((Date.now() - start) / 1000);
    el.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  }, 1000);
}

function renderExercises() {
  const container = _root.querySelector('#wl-exercises');
  if (!container) return;
  container.innerHTML = '';
  _session.exercises.forEach(ex => {
    const prev = Session.getPrevSessionSummary(ex.key);
    const div = document.createElement('div');
    div.className = 'wl-exercise';
    div.innerHTML = `
      <div class="wl-ex-header">
        <span class="wl-ex-name">${ex.name}</span>
        ${prev ? `<span class="wl-ex-prev">Última vez (${prev.date}): ${prev.setsStr}</span>` : ''}
      </div>
      <div class="wl-sets" id="wl-sets-${CSS.escape(ex.key)}"></div>
      <button class="btn-ghost wl-add-set" data-key="${ex.key}">+ Añadir set</button>`;
    container.appendChild(div);
    renderSets(ex);
    div.querySelector('.wl-add-set').addEventListener('click', () => {
      Session.addSet(_session, ex.key);
      renderSets(ex);
    });
  });
}

function renderSets(ex) {
  const container = _root.querySelector(`#wl-sets-${CSS.escape(ex.key)}`);
  if (!container) return;
  container.innerHTML = '';
  ex.sets.forEach((s, idx) => {
    const suggested = idx === 0 && !s.weightKg ? Session.getSuggestedWeight(ex.key) : null;
    const row = document.createElement('div');
    row.className = `wl-set-row${s.isWarmup ? ' wl-warmup' : ''}`;
    row.innerHTML = `
      <label class="wl-set-num">Set ${s.setNumber}</label>
      <label class="wl-warmup-toggle">
        <input type="checkbox" ${s.isWarmup ? 'checked' : ''} data-idx="${idx}" data-key="${ex.key}" class="wl-is-warmup" />
        <span>Cal.</span>
      </label>
      <input type="number" class="wl-weight" value="${s.weightKg || ''}" placeholder="${suggested ? suggested : 'kg'}" min="0" step="0.5" data-idx="${idx}" data-key="${ex.key}" />
      <span class="wl-x">×</span>
      <input type="number" class="wl-reps" value="${s.reps || ''}" placeholder="reps" min="0" data-idx="${idx}" data-key="${ex.key}" />`;
    container.appendChild(row);
  });
  container.querySelectorAll('.wl-weight').forEach(inp => {
    inp.addEventListener('change', e => {
      Session.updateSet(_session, e.target.dataset.key, +e.target.dataset.idx, { weightKg: parseFloat(e.target.value) || 0 });
    });
  });
  container.querySelectorAll('.wl-reps').forEach(inp => {
    inp.addEventListener('change', e => {
      Session.updateSet(_session, e.target.dataset.key, +e.target.dataset.idx, { reps: parseInt(e.target.value) || 0 });
    });
  });
  container.querySelectorAll('.wl-is-warmup').forEach(inp => {
    inp.addEventListener('change', e => {
      Session.updateSet(_session, e.target.dataset.key, +e.target.dataset.idx, { isWarmup: e.target.checked });
      renderSets(ex);
    });
  });
}

function onAddExercise() {
  const input = _root.querySelector('#wl-ex-input');
  const name = input?.value?.trim();
  if (!name) return;
  Session.addExercise(_session, name);
  input.value = '';
  renderExercises();
}

async function onFinish() {
  clearInterval(_timerInterval);
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

function renderSummary(result) {
  const volume = result?.total_volume_kg ? `${result.total_volume_kg.toLocaleString('es-ES')} kg` : '—';
  const xp = result?.xp_awarded ? `+${result.xp_awarded} XP` : '';
  const prs = result?.prs?.length
    ? `<ul class="wl-prs">${result.prs.map(pr => `<li>🏆 PR ${pr.exercise_key.replace(/_/g, ' ')}: ${pr.value} kg 1RM</li>`).join('')}</ul>`
    : '';
  _root.innerHTML = `
    <div class="wl-summary">
      <h3 class="wl-summary-title">¡Sesión completada! 💪</h3>
      <div class="wl-summary-stats">
        <div class="wl-stat"><span class="wl-stat-val">${volume}</span><span class="wl-stat-lbl">Volumen total</span></div>
        ${xp ? `<div class="wl-stat"><span class="wl-stat-val">${xp}</span><span class="wl-stat-lbl">Gamificación</span></div>` : ''}
      </div>
      ${prs}
      <button class="btn-secondary" id="wl-done">Cerrar</button>
    </div>`;
  _root.querySelector('#wl-done').addEventListener('click', () => { _session = null; renderIdle(); });
}
