// frontend/js/workout/workoutSets.js
import { S, REST_DEFAULT } from './state.js';
import * as Session    from '../workoutSession.js';
import * as PR         from '../workoutPR.js';
import * as ORM        from '../oneRepMax.js';
import * as Timer      from './timer.js';
import * as Inactivity from './inactivity.js';

const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ─── PR toast queue ─────────────────────────────────────────────────────────────
function _flushPRToast() {
  if (!S.prToastQueue.length) { S.prToastActive = false; return; }
  S.prToastActive = true;
  const { exerciseName, type, delta, oneRM } = S.prToastQueue.shift();
  const label = PR.prLabel(type, delta, oneRM);
  const t = document.createElement('div');
  t.className = 'wl-pr-toast';
  t.innerHTML = `<span class="wl-pr-toast-dot"></span>
    <div class="wl-pr-toast-body">
      <span class="wl-pr-toast-title">Nuevo Récord — ${_esc(exerciseName)}</span>
      <span class="wl-pr-toast-sub">${_esc(label)}</span>
    </div>`;
  document.body.appendChild(t);
  setTimeout(() => {
    t.classList.add('wl-pr-toast--hide');
    setTimeout(() => { t.remove(); _flushPRToast(); }, 400);
  }, 4000);
}

export function enqueuePRToast(exerciseName, type, delta, oneRM) {
  S.prToastQueue.push({ exerciseName, type, delta, oneRM });
  if (!S.prToastActive) _flushPRToast();
}

// ─── Progression hint (vs última sesión) ────────────────────────────────────────
export function getProgressionHint(ex) {
  let sessions = [];
  try { sessions = JSON.parse(localStorage.getItem('hs_workout_sessions_local') || '[]'); } catch {}
  const prev = sessions.find(s => s.exercises?.some(e => e.key === ex.key));
  if (!prev) return null;
  const prevEx = prev.exercises.find(e => e.key === ex.key);
  if (!prevEx) return null;
  const prevWorking = (prevEx.sets || []).filter(s => !s.isWarmup && s.weightKg > 0);
  if (!prevWorking.length) return null;
  const prevMax = Math.max(...prevWorking.map(s => s.weightKg));
  const curWorking = ex.sets.filter(s => !s.isWarmup);
  if (!curWorking.length) return null;
  const curWeight = curWorking[0]?.weightKg ?? 0;
  if (!curWeight) return null;
  const diff = Math.round((curWeight - prevMax) * 10) / 10;
  if (diff > 0) return { label: `↑ +${diff} kg`, cls: 'up' };
  if (diff < 0) return { label: `↓ ${Math.abs(diff)} kg`, cls: 'down' };
  return { label: '= igual', cls: 'same' };
}

// ─── Previous set by position ───────────────────────────────────────────────────
export function getPrevSet(exerciseKey, setIndex) {
  let sessions = [];
  try { sessions = JSON.parse(localStorage.getItem('hs_workout_sessions_local') || '[]'); } catch {}
  const prev = sessions.find(s => s.exercises?.some(e => e.key === exerciseKey));
  if (!prev) return null;
  const prevEx = prev.exercises.find(e => e.key === exerciseKey);
  if (!prevEx) return null;
  const prevWorking     = (prevEx.sets || []).filter(s => !s.isWarmup);
  const currentEx       = S.session?.exercises.find(e => e.key === exerciseKey);
  if (!currentEx) return null;
  const currentWorkingIdx = currentEx.sets
    .slice(0, setIndex + 1)
    .filter(s => !s.isWarmup).length - 1;
  const match = prevWorking[currentWorkingIdx];
  return match ? `${match.weightKg}×${match.reps}` : null;
}

// ─── Render sets for one exercise ───────────────────────────────────────────────
export function renderSets(ex) {
  const container = S.root?.querySelector(`#wl-sets-${CSS.escape(ex.key)}`);
  if (!container) return;
  container.innerHTML = '';

  const hasWarmups = ex.sets.some(s => s.isWarmup);

  if (hasWarmups) {
    const wl = document.createElement('div');
    wl.className = 'wl-sets-section-label wl-sets-section-label--warm';
    wl.innerHTML = '<span>Calentamiento</span>';
    container.appendChild(wl);
  }

  let _workLabelInserted = false;

  ex.sets.forEach((s, idx) => {
    if (!s.isWarmup && !_workLabelInserted && hasWarmups) {
      const wl = document.createElement('div');
      wl.className = 'wl-sets-section-label wl-sets-section-label--work';
      wl.innerHTML = '<span>Trabajo</span>';
      container.appendChild(wl);
      _workLabelInserted = true;
    }
    const isDone  = !!s.completedAt;
    const isPRSet = !!s._isPR;
    const prevStr = s.isWarmup ? null : getPrevSet(ex.key, idx);

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
      <span class="wl-set-num">${s.isWarmup ? '<span class="wl-warmup-badge">W</span>' : s.setNumber}${isPRSet ? '<span class="wl-pr-badge">PR</span>' : ''}</span>
      <span class="wl-set-prev">${prevStr ?? '—'}</span>
      <input type="text" inputmode="decimal" pattern="[0-9]*\.?[0-9]*"
        class="wl-input-num wl-weight"
        value="${s.weightKg > 0 ? s.weightKg : ''}"
        placeholder=""
        data-field="weightKg" data-idx="${idx}" data-key="${ex.key}"
        ${isDone ? 'readonly' : ''} />
      <span class="wl-x">×</span>
      <input type="text" inputmode="numeric" pattern="[0-9]*"
        class="wl-input-num wl-reps"
        value="${s.reps > 0 ? s.reps : ''}" placeholder="0"
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

  function _sanitizeWeight(v) {
    v = v.replace(/[^0-9.]/g, '');
    const dot = v.indexOf('.');
    if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    return v;
  }

  container.querySelectorAll('[data-field]').forEach(inp => {
    const event = inp.type === 'checkbox' ? 'change' : 'input';
    inp.addEventListener(event, e => {
      Inactivity.resetInactivity();
      const { key, idx, field } = e.target.dataset;
      if (field === 'weightKg') {
        const clean = _sanitizeWeight(e.target.value);
        if (e.target.value !== clean) { e.target.value = clean; }
      }
      const val = field === 'weightKg' ? (parseFloat(e.target.value) || 0)
                                       : (parseInt(e.target.value) || 0);
      Session.updateSet(S.session, key, +idx, { [field]: val });
    });
  });

  container.querySelectorAll('.wl-input-num:not([readonly])').forEach(inp => {
    inp.addEventListener('focus', () => { inp.select(); });
    inp.addEventListener('pointerdown', () => {
      if (document.activeElement === inp) setTimeout(() => inp.select(), 0);
    });
  });

  container.querySelectorAll('.wl-set-check').forEach(btn => {
    btn.addEventListener('click', () => {
      Inactivity.resetInactivity();
      const { key, idx } = btn.dataset;
      const ex2 = S.session.exercises.find(e2 => e2.key === key);
      if (!ex2) return;
      const s = ex2.sets[+idx];
      if (!s) return;
      const wasDone = !!s.completedAt;

      if (!wasDone) {
        const row = btn.closest('.wl-set-row');
        const weightInp = row?.querySelector('[data-field="weightKg"]');
        const repsInp   = row?.querySelector('[data-field="reps"]');
        if (weightInp) Session.updateSet(S.session, key, +idx, { weightKg: parseFloat(weightInp.value) || 0 });
        if (repsInp)   Session.updateSet(S.session, key, +idx, { reps: parseInt(repsInp.value) || 0 });
      }

      Session.updateSet(S.session, key, +idx, {
        completedAt: wasDone ? null : new Date().toISOString(),
      });

      if (!wasDone && !s.isWarmup) {
        const setNow = ex2.sets[+idx];
        const prResult = PR.detectSetPR(key, setNow.weightKg, setNow.reps);
        if (prResult.isPR) {
          PR.saveSetPR(key, setNow.weightKg, setNow.reps);
          setNow._isPR = true;
          const orm = ORM.best1RM(setNow.weightKg, setNow.reps);
          enqueuePRToast(ex2.name, prResult.type, prResult.delta, orm);
          window.haptic?.pr();
          window.dispatchEvent(new CustomEvent('hs:pr-achieved', { detail: { exerciseKey: key } }));
        } else {
          window.haptic?.light();
          window.dispatchEvent(new CustomEvent('hs:set-completed'));
        }

        S.restExKey = key;
        const restSecs = ex2.restSecs || REST_DEFAULT;
        Timer.startRestTimer(restSecs);
        Timer.showRestBar();
        Timer.updateExerciseRestHeader(key);
      }

      if (wasDone) s._isPR = false;

      renderSets(ex2);
      Timer.updateVolLabel();

      const card  = S.root?.querySelector(`[data-ex-key="${key}"]`);
      const done2  = ex2.sets.filter(s2 => s2.completedAt).length;
      const total2 = ex2.sets.length;
      const prog   = card?.querySelector('.wl-ex-progress');
      if (prog) prog.textContent = `${done2}/${total2}`;
    });
  });

  container.querySelectorAll('.wl-set-del').forEach(btn => {
    btn.addEventListener('click', () => {
      Inactivity.resetInactivity();
      const { key, idx } = btn.dataset;
      const ex2 = S.session.exercises.find(e2 => e2.key === key);
      if (!ex2) return;
      ex2.sets.splice(+idx, 1);
      ex2.sets.forEach((s, i) => {
        if (!s.isWarmup) s.setNumber = ex2.sets.filter((ss, ii) => ii <= i && !ss.isWarmup).length;
      });
      Session.saveDraft(S.session);
      renderSets(ex2);
      Timer.updateVolLabel();
    });
  });
}
