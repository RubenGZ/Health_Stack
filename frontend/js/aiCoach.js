/**
 * aiCoach.js — Coach adaptativo intra-sesión
 * Escucha clicks en .rex-log-btn, muestra formulario de set,
 * y llama a POST /api/v1/ai-coach/set-feedback para coaching en tiempo real.
 */

(function () {
  'use strict';

  const API_URL = '/api/v1/ai-coach/set-feedback';

  // Sets registrados en la sesión actual
  const sessionSets = [];

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getToken() {
    return localStorage.getItem('access_token') || '';
  }

  function createLogForm(exName, plannedReps) {
    const form = document.createElement('div');
    form.className = 'rex-log-form';
    form.innerHTML = `
      <div class="rex-log-fields">
        <label class="rex-log-label">
          <span>Peso (kg)</span>
          <input type="number" class="rex-log-input" id="rlf-weight" min="0" max="500" step="0.5" placeholder="60" />
        </label>
        <label class="rex-log-label">
          <span>Reps</span>
          <input type="number" class="rex-log-input" id="rlf-reps" min="1" max="100" step="1" placeholder="${plannedReps || 8}" />
        </label>
        <label class="rex-log-label">
          <span>RPE <small>(1-10)</small></span>
          <input type="number" class="rex-log-input" id="rlf-rpe" min="1" max="10" step="1" placeholder="7" />
        </label>
      </div>
      <div class="rex-log-actions">
        <button class="rex-log-submit" type="button">Registrar set</button>
        <button class="rex-log-cancel" type="button">Cancelar</button>
      </div>
      <div class="rex-coach-feedback" style="display:none"></div>
    `;
    return form;
  }

  function showToast(msg, type = 'info') {
    const existing = document.getElementById('coach-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'coach-toast';
    toast.className = `coach-toast coach-toast--${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('coach-toast--visible'));
    setTimeout(() => {
      toast.classList.remove('coach-toast--visible');
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  function renderFeedback(container, data) {
    const iconMap = {
      increase_weight: '⬆️',
      decrease_weight: '⬇️',
      maintain:        '✅',
      rest:            '😴',
      good_form:       '🎯',
    };
    container.style.display = '';
    container.innerHTML = `
      <div class="rex-coach-msg">
        <span class="rex-coach-icon">${iconMap[data.suggestion] || '💬'}</span>
        <span class="rex-coach-text">${data.coaching}</span>
      </div>`;
  }

  async function fetchCoachFeedback(exName, weightKg, reps, rpe, plannedReps) {
    const token = getToken();
    const body = {
      exercise:          exName,
      weight_kg:         weightKg,
      reps:              reps,
      rpe:               rpe || null,
      session_sets:      sessionSets.slice(),
      planned_weight_kg: null,
      planned_reps:      plannedReps ? parseInt(plannedReps, 10) : null,
    };

    const res = await fetch(API_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // ── Core logic ─────────────────────────────────────────────────────────────

  function handleLogSubmit(exEl, form) {
    const exName     = exEl.dataset.exercise || 'Ejercicio';
    const plannedReps = exEl.dataset.plannedReps || null;
    const weightInput = form.querySelector('#rlf-weight');
    const repsInput   = form.querySelector('#rlf-reps');
    const rpeInput    = form.querySelector('#rlf-rpe');
    const feedback    = form.querySelector('.rex-coach-feedback');
    const submitBtn   = form.querySelector('.rex-log-submit');

    const weightKg = parseFloat(weightInput.value);
    const reps     = parseInt(repsInput.value, 10);
    const rpe      = rpeInput.value ? parseInt(rpeInput.value, 10) : null;

    if (!weightKg || weightKg <= 0) {
      weightInput.focus();
      weightInput.classList.add('rex-log-input--error');
      return;
    }
    if (!reps || reps <= 0) {
      repsInput.focus();
      repsInput.classList.add('rex-log-input--error');
      return;
    }

    // Registrar en sesión
    sessionSets.push({ exercise: exName, weight_kg: weightKg, reps, rpe });

    submitBtn.disabled = true;
    submitBtn.textContent = 'Analizando...';
    feedback.style.display = 'none';

    fetchCoachFeedback(exName, weightKg, reps, rpe, plannedReps)
      .then(data => {
        renderFeedback(feedback, data);
        submitBtn.textContent = '✓ Registrado';
      })
      .catch(err => {
        console.warn('[aiCoach] error:', err);
        feedback.style.display = '';
        feedback.innerHTML = `<div class="rex-coach-msg"><span class="rex-coach-icon">💪</span><span class="rex-coach-text">¡Buen set! Sigue así.</span></div>`;
        submitBtn.textContent = '✓ Registrado';
      });
  }

  function attachFormEvents(exEl, form) {
    const plannedReps = exEl.dataset.plannedReps || null;
    const submitBtn   = form.querySelector('.rex-log-submit');
    const cancelBtn   = form.querySelector('.rex-log-cancel');

    // Remove error class on input
    form.querySelectorAll('.rex-log-input').forEach(inp => {
      inp.addEventListener('input', () => inp.classList.remove('rex-log-input--error'));
    });

    // Enter key submits
    form.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitBtn.click();
      if (e.key === 'Escape') cancelBtn.click();
    });

    submitBtn.addEventListener('click', () => handleLogSubmit(exEl, form));
    cancelBtn.addEventListener('click', () => {
      form.remove();
      exEl.querySelector('.rex-log-btn').disabled = false;
    });

    // Focus first input
    setTimeout(() => form.querySelector('#rlf-weight').focus(), 50);
  }

  // ── Event delegation ───────────────────────────────────────────────────────

  function init() {
    const week = document.getElementById('routine-week');
    if (!week) return;

    week.addEventListener('click', e => {
      const btn = e.target.closest('.rex-log-btn');
      if (!btn) return;

      const exEl = btn.closest('.routine-ex');
      if (!exEl) return;

      // Toggle: si ya hay formulario abierto en este ejercicio, cerrarlo
      const existing = exEl.querySelector('.rex-log-form');
      if (existing) {
        existing.remove();
        btn.disabled = false;
        return;
      }

      // Cerrar cualquier otro formulario abierto
      week.querySelectorAll('.rex-log-form').forEach(f => {
        const parentEx = f.closest('.routine-ex');
        if (parentEx) {
          const b = parentEx.querySelector('.rex-log-btn');
          if (b) b.disabled = false;
        }
        f.remove();
      });

      btn.disabled = true;
      const exName     = exEl.dataset.exercise || 'Ejercicio';
      const plannedReps = exEl.dataset.plannedReps || null;
      const form = createLogForm(exName, plannedReps);
      exEl.appendChild(form);
      attachFormEvents(exEl, form);
    });

    // Limpiar sesión al generar nueva rutina
    document.addEventListener('routineGenerated', () => {
      sessionSets.length = 0;
    });
  }

  // Esperar a que el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exponer para debug
  window.aiCoach = { sessionSets };
})();
