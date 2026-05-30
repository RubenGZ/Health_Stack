// frontend/js/workout/pre-workout.js
import { S } from './state.js';
import * as Session from '../workoutSession.js';
import { renderIdle } from './idle.js';
import { getExerciseMeta, getWeightLabel, getWeightStep } from './exercise-meta.js';

export function renderPreWorkoutAdjust(daySession) {
  const exList = (daySession.exercises || []).filter(ex => ex.name);

  // Pre-compute meta per exercise for labels and step values
  const exMeta = exList.map(ex => getExerciseMeta(ex.name));

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
          const meta    = exMeta[i];
          const step    = getWeightStep(meta.equipmentType);
          const unit    = getWeightLabel(meta.equipmentType);
          return `
          <div class="wl-pre-row">
            <div class="wl-pre-exname">${ex.name}</div>
            <div class="wl-pre-scheme">${ex.sets} × ${ex.reps} · ${ex.rest || '90s'}</div>
            <div class="wl-pre-weight-wrap">
              <button class="wl-pre-stepper" data-idx="${i}" data-step="${step}" data-dir="-">−</button>
              <input type="text" inputmode="decimal" pattern="[0-9]*\.?[0-9]*"
                class="wl-pre-weight-inp" id="wl-pre-weight-${i}"
                value="${planned > 0 ? planned : ''}" placeholder=""
                style="font-size:16px">
              <span class="wl-pre-unit">${unit}</span>
              <button class="wl-pre-stepper" data-idx="${i}" data-step="${step}" data-dir="+">+</button>
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
      const idx  = parseInt(btn.dataset.idx);
      const step = parseFloat(btn.dataset.step) || 2.5;
      const inp  = S.root.querySelector(`#wl-pre-weight-${idx}`);
      if (!inp) return;
      const cur = parseFloat(inp.value) || 0;
      inp.value = Math.max(0, btn.dataset.dir === '+' ? cur + step : cur - step);
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
    // Dynamic import to avoid circular dep (loadRoutineSession still in views.js)
    import('./views.js').then(m => m.loadRoutineSession(adjusted));
  });
}
