// frontend/js/workout/custom-builder.js
import { S } from './state.js';
import { renderIdle } from './idle.js';

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
