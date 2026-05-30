// frontend/js/workout/routine-picker.js
import { S } from './state.js';
import { renderIdle } from './idle.js';

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
      if (!daySession) return;

      // Readiness check → pre-workout adjust
      import('./readiness-check.js').then(({ renderReadinessCheck }) => {
        S.root.innerHTML = '<div id="wl-readiness-mount" style="padding:16px"></div>';
        const mount = S.root.querySelector('#wl-readiness-mount');
        renderReadinessCheck(mount, ({ adj }) => {
          // Pasar adj al session-loader vía daySession
          daySession._readinessAdj = adj;
          import('./views.js').then(m => m.renderPreWorkoutAdjust(daySession));
        });
      });
    });
  });
}
