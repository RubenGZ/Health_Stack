// frontend/js/workout/summary.js
// Finalización de sesión: POST al backend, persistencia local, y pantalla de resumen.
import { S } from './state.js';
import * as Session from '../workoutSession.js';
import { fmtTime, liveVolume } from './timer.js';

// Callback inyectado por el coordinador para volver a la vista idle tras "Nueva sesión"
let _onRenderIdle = null;
export function registerRenderIdle(cb) { _onRenderIdle = cb; }

// ─── Finish session ─────────────────────────────────────────────────────────────
export async function onFinish() {
  clearInterval(S.timerInterval);
  clearInterval(S.restInterval);
  clearInterval(S.inactivityTimer);
  S.inactivityToast?.remove();
  S.inactivityToast = null;

  const finishedAt = new Date().toISOString();
  const payload = {
    routine_id: S.session.routineId ?? null,
    started_at: S.session.startedAt,
    finished_at: finishedAt,
    notes: null,
    exercises: S.session.exercises.map(ex => ({
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
    id:           result?.session_id ?? Date.now(),
    startedAt:    S.session.startedAt,
    durationSecs: result?.duration_secs ?? Math.floor((Date.now() - new Date(S.session.startedAt)) / 1000),
    totalVolumeKg: result?.total_volume_kg ?? null,
    routineId:    S.session.routineId   ?? null,
    routineName:  S.session.routineName ?? null,
    exercises:    S.session.exercises,
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
export function buildMuscleBreakdown() {
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
    crunch:                 ['Core'],   ab_wheel:                 ['Core'],
  };

  const counts = {};
  S.session.exercises.forEach(ex => {
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

// ─── Summary screen ────────────────────────────────────────────────────────────
export function renderSummary(result) {
  const startTime = new Date(S.session.startedAt);
  const durationSecs = result?.duration_secs ?? Math.floor((Date.now() - startTime) / 1000);
  const volume = result?.total_volume_kg ?? liveVolume();
  const exerciseCount = S.session.exercises.length;
  const setCount = S.session.exercises.reduce((n, ex) => n + ex.sets.filter(s => !s.isWarmup && s.completedAt).length, 0);
  const xp  = result?.xp_awarded;
  const prs = result?.prs || [];

  // ── Confetti ────────────────────────────────────────────────
  if (typeof Celebrations !== 'undefined') {
    if (prs.length) {
      Celebrations.firePR();
      setTimeout(() => Celebrations.fireWorkoutDone(), 600);
    } else {
      Celebrations.fireWorkoutDone();
    }
  }

  // ── Haptic ──────────────────────────────────────────────────
  if (typeof haptic === 'function') haptic('heavy');

  // ── Share text ──────────────────────────────────────────────
  const _shareText = () => {
    const mins = Math.floor(durationSecs / 60);
    const vStr = volume ? ` · ${volume.toLocaleString('es-ES')} kg` : '';
    const prStr = prs.length ? ` · 🏆 ${prs.length} PR${prs.length > 1 ? 's' : ''}` : '';
    return `💪 Entreno completado — ${mins} min${vStr} · ${exerciseCount} ejercicios · ${setCount} sets${prStr}`;
  };

  S.root.innerHTML = `
    <div class="wl-summary">
      <div class="wl-summary-header">
        <div class="wl-summary-emoji"></div>
        <h2 class="wl-summary-title">¡Sesión completada!</h2>
        <p class="wl-summary-date">${startTime.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' })}</p>
      </div>

      <div class="wl-summary-stats">
        <div class="wl-stat-box">
          <span class="wl-stat-box-val" data-countup-time="${durationSecs}">${fmtTime(durationSecs)}</span>
          <span class="wl-stat-box-lbl">Duración</span>
        </div>
        <div class="wl-stat-box">
          <span class="wl-stat-box-val" data-countup-vol="${volume || 0}">${volume ? volume.toLocaleString('es-ES') + ' kg' : '—'}</span>
          <span class="wl-stat-box-lbl">Volumen total</span>
        </div>
        <div class="wl-stat-box">
          <span class="wl-stat-box-val" data-countup="${exerciseCount}">0</span>
          <span class="wl-stat-box-lbl">Ejercicios</span>
        </div>
        <div class="wl-stat-box">
          <span class="wl-stat-box-val" data-countup="${setCount}">0</span>
          <span class="wl-stat-box-lbl">Sets completados</span>
        </div>
      </div>

      ${xp ? `<div class="wl-summary-xp" data-countup-xp="${xp}">+0 XP <span class="wl-xp-label">Gamificación</span></div>` : ''}

      ${prs.length ? `
        <div class="wl-summary-prs">
          ${prs.map(pr => `<div class="wl-pr-item">🏆 PR — ${pr.exercise_key.replace(/_/g,' ')}: ${pr.value} kg 1RM</div>`).join('')}
        </div>` : ''}

      ${buildMuscleBreakdown()}

      <div class="wl-summary-actions">
        <button class="wl-done-btn btn btn--ghost" id="wl-done">Nueva sesión</button>
        ${typeof navigator !== 'undefined' && navigator.share ? `
          <button class="wl-share-btn btn btn--primary" id="wl-share">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Compartir
          </button>` : ''}
      </div>
    </div>`;

  // ── Count-up animation ──────────────────────────────────────
  _animateCounters(S.root);

  // ── Buttons ─────────────────────────────────────────────────
  S.root.querySelector('#wl-done').addEventListener('click', () => {
    S.session   = null;
    S.wlViewer  = null;
    _onRenderIdle?.();
  });

  const shareBtn = S.root.querySelector('#wl-share');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      try {
        await navigator.share({ title: 'HealthStack Pro', text: _shareText(), url: location.origin });
      } catch { /* user dismissed — no-op */ }
    });
  }
}

// ─── Count-up helper ───────────────────────────────────────────────────────────
function _animateCounters(root) {
  const DURATION = 900; // ms
  const start = performance.now();

  // Inline numbers (exercises, sets)
  const nums = root.querySelectorAll('[data-countup]');
  // Volume with unit
  const volEl = root.querySelector('[data-countup-vol]');
  // XP
  const xpEl  = root.querySelector('[data-countup-xp]');

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function tick(now) {
    const t = Math.min(1, (now - start) / DURATION);
    const e = easeOut(t);

    nums.forEach(el => {
      const target = parseInt(el.dataset.countup, 10);
      el.textContent = Math.round(target * e);
    });

    if (volEl) {
      const target = parseFloat(volEl.dataset.countupVol);
      if (target > 0) {
        volEl.textContent = (target * e).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' kg';
      }
    }

    if (xpEl) {
      const target = parseInt(xpEl.dataset.countupXp, 10);
      xpEl.innerHTML = `+${Math.round(target * e)} XP <span class="wl-xp-label">Gamificación</span>`;
    }

    if (t < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
