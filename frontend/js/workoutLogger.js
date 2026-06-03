// frontend/js/workoutLogger.js — Coordinador del workout logger (Fase 6)
// Contiene la vista activa y la lógica de sets/ejercicios.
// Las vistas de reposo, el timer, la inactividad y el resumen viven en ./workout/.
import * as Session  from './workoutSession.js';
import * as PR       from './workoutPR.js';
import * as ORM      from './oneRepMax.js';
import { S, REST_DEFAULT } from './workout/state.js';
import * as Timer    from './workout/timer.js';
import * as Inactivity from './workout/inactivity.js';
import * as Views    from './workout/views.js';
import * as Summary  from './workout/summary.js';
import { renderSets, getProgressionHint, enqueuePRToast } from './workout/workoutSets.js';

// ─── Wire up inter-module callbacks (resuelve dependencias circulares) ─────────
// Las declaraciones de función son hoisted, por lo que renderActive está disponible aquí.
Views.registerRenderActive(renderActive);
Inactivity.registerOnFinish(Summary.onFinish);
Summary.registerRenderIdle(Views.renderIdle);
Timer.registerResetInactivity(Inactivity.resetInactivity);

// ─── Escape helper (XSS prevention) ───────────────────────────────────────────
const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ─── Vista activa (sesión en curso) ───────────────────────────────────────────
function renderActive() {
  S.root.innerHTML = `
    <!-- Rest timer bar (oculta hasta que se completa un set) -->
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

  Timer.startTimer();
  renderExercises();
  initExerciseSearch();
  initAnatomy();
  Inactivity.resetInactivity();
  Inactivity.startInactivityWatch();

  S.root.querySelector('#wl-finish').addEventListener('click', Summary.onFinish);
  S.root.querySelector('#wl-rest-skip').addEventListener('click', Timer.stopRestTimer);
  S.root.querySelector('#wl-pause-btn').addEventListener('click', Timer.togglePause);

  // Si la sesión se restauró pausada, aplicar estado visual
  if (S.session?.pausedAt) {
    Timer.showPauseOverlay();
    Timer.updatePauseBtn(true);
  }
}

// ─── Exercise search / autocomplete ───────────────────────────────────────────
function initExerciseSearch() {
  const input    = S.root.querySelector('#wl-ex-input');
  const results  = S.root.querySelector('#wl-ex-results');
  const customBtn = S.root.querySelector('#wl-add-custom');

  if (!input || !results) return;

  input.addEventListener('input', () => {
    const q    = input.value.trim();
    const hits = q.length >= 1 ? Views.searchExercises(q) : [];
    if (!hits.length && q.length >= 1) {
      results.innerHTML = '<p class="wl-no-results">Sin resultados — usa "Añadir personalizado"</p>';
    } else {
      results.innerHTML = hits.map(ex => `
        <button class="wl-ex-result-item" data-name="${_esc(ex.name)}" data-group="${_esc(ex.group || '')}">
          <span class="wl-res-name">${_esc(ex.name)}</span>
          <span class="wl-res-group">${_esc(ex.group || '')}</span>
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
      const name = input.value.trim();
      if (name) {
        addExerciseToSession(name);
        input.value = '';
        results.innerHTML = '';
      } else {
        input.focus();
      }
    });
  }
}

function addExerciseToSession(name, group) {
  const ex = Session.addExercise(S.session, name);
  if (ex && group) ex.group = group;
  Session.saveDraft(S.session);
  renderExercises();
  Timer.updateVolLabel();
}

// ─── Anatomy mini viewer dentro de la sesión ───────────────────────────────────
async function initAnatomy() {
  const container = S.root?.querySelector('#wl-anatomy-container');
  if (!container) return;
  try {
    const mod = await import('./anatomyLens/index.js');
    S.wlViewer = mod.createViewer();
    await S.wlViewer.init(container);
  } catch (e) {
    console.warn('[WorkoutLogger] anatomy viewer failed:', e);
    S.wlViewer = null;
  }
}

function highlightAnatomy(exerciseKey) {
  if (!S.wlViewer) return;
  try {
    import('./anatomyLens/muscleMap.js').then(mod => {
      const { primary, secondary } = mod.resolveExercise(exerciseKey, []);
      S.wlViewer.highlight(primary, secondary);
      const legend = S.root?.querySelector('#wl-anatomy-legend');
      if (legend) {
        legend.innerHTML = [
          ...primary.map(m => `<span class="al-legend-group"><span class="al-legend-dot primary"></span>${m.replace(/_/g,' ')}</span>`),
          ...secondary.map(m => `<span class="al-legend-group"><span class="al-legend-dot secondary"></span>${m.replace(/_/g,' ')}</span>`),
        ].join('');
      }
    }).catch(e => console.warn('[WorkoutLogger] anatomy highlight failed:', e?.message));
  } catch (e) { console.warn('[WorkoutLogger] anatomy viewer error:', e?.message); }
}

// ─── Render exercises list ──────────────────────────────────────────────────────
function renderExercises() {
  const container = S.root?.querySelector('#wl-exercises');
  if (!container) return;
  container.innerHTML = '';

  S.session.exercises.forEach(ex => {
    const completedSets = ex.sets.filter(s => s.completedAt).length;
    const workingSets   = ex.sets.filter(s => !s.isWarmup);
    const totalSets     = ex.sets.length;

    const numWorking  = workingSets.length;
    const targetReps  = workingSets[0]?.reps || null;
    const setsRepsBadge = (numWorking > 0 && targetReps)
      ? `<span class="wl-ex-scheme">${numWorking}×${targetReps}</span>` : '';

    const restSecs  = ex.restSecs || REST_DEFAULT;
    const restLabel = `<span class="wl-ex-rest-countdown" data-key="${ex.key}">◷ ${Timer.fmtTime(restSecs)}</span>`;

    const card = document.createElement('div');
    card.className = 'wl-ex-card';
    card.dataset.exKey = ex.key;

    const GROUP_LABELS = { pecho:'Pecho', espalda:'Espalda', piernas:'Piernas', hombros:'Hombros', brazos:'Brazos', core:'Core', gluteos:'Glúteos', cardio:'Cardio' };
    const GROUP_KEYS   = { pecho:'chest', espalda:'back', piernas:'legs', hombros:'shoulders', brazos:'arms', core:'core', gluteos:'glutes', cardio:'cardio' };
    const groupLabel = (ex.group && GROUP_LABELS[ex.group]) ? GROUP_LABELS[ex.group] : (ex.group || '');
    const groupKey   = (ex.group && GROUP_KEYS[ex.group]) || 'other';
    const groupChip  = groupLabel
      ? `<span class="wl-ex-group-chip" data-group="${groupKey}">${groupLabel}</span>` : '';

    const progHint = getProgressionHint(ex);
    const progChip = progHint
      ? `<span class="wl-ex-prog-hint wl-ex-prog-hint--${progHint.cls}">${progHint.label}</span>` : '';

    card.innerHTML = `
      <div class="wl-ex-card-header">
        <div class="wl-ex-info">
          <div class="wl-ex-name-row" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <button class="wl-ex-name-btn" data-key="${_esc(ex.key)}">${_esc(ex.name)}</button>
            ${groupChip}
          </div>
          <div class="wl-ex-meta-row">${setsRepsBadge}${restLabel}${progChip}</div>
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
        <span>#</span><span>Ant.</span><span>kg</span><span></span><span>Reps</span><span>1RM</span><span></span><span></span>
      </div>

      <div class="wl-sets-list" id="wl-sets-${ex.key}"></div>

      <button class="wl-add-set-btn" data-key="${ex.key}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Añadir set
      </button>`;

    container.appendChild(card);
    renderSets(ex);

    card.querySelector('.wl-ex-delete').addEventListener('click', () => {
      S.session.exercises = S.session.exercises.filter(e => e.key !== ex.key);
      Session.saveDraft(S.session);
      renderExercises();
    });

    card.querySelector('.wl-ex-name-btn').addEventListener('click', () => {
      highlightAnatomy(ex.key);
    });

    card.querySelector('.wl-add-set-btn').addEventListener('click', () => {
      Session.addSet(S.session, ex.key);
      renderSets(ex);
    });
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────────
let _storageFullListenerAdded = false;

export function init(container) {
  // Limpiar timers anteriores para evitar múltiples intervals corriendo en paralelo
  clearInterval(S.timerInterval);
  clearInterval(S.restInterval);
  S.timerInterval = null;
  S.restInterval  = null;

  S.root     = container;
  S.wlViewer = null;

  const draft = Session.getDraft();
  if (draft) { S.session = draft; renderActive(); } else { Views.renderIdle(); }

  // Banner persistente cuando localStorage está lleno (añadir listener solo una vez)
  if (!_storageFullListenerAdded) {
    _storageFullListenerAdded = true;
    document.addEventListener('hs:storage-full', () => {
      const banner = S.root?.querySelector('#wl-storage-warn');
      if (!banner) {
        const b = document.createElement('div');
        b.id = 'wl-storage-warn';
        b.style.cssText = 'background:#ef4444;color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;margin-bottom:8px;text-align:center';
        b.textContent = 'Almacenamiento lleno — el progreso de esta sesión puede no guardarse. Libera espacio o finaliza la sesión.';
        S.root?.prepend(b);
      }
    });
  }
}
