// frontend/js/workout/session-loader.js
import { S, REST_DEFAULT } from './state.js';
import * as Session from '../workoutSession.js';
import { getExerciseMeta } from './exercise-meta.js';
import { generateWarmupSets } from './warmup.js';

function _toKey(name) {
  return name.toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
}

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

export function loadRoutineSession(daySession) {
  const exercises = daySession.exercises.map((ex, i) => {
    const numSets  = parseInt(ex.sets) || 3;
    const targetR  = parseInt(ex.reps) || 8;
    const key      = _toKey(ex.name);
    const restSecs = _parseRestSecs(ex.rest);

    const suggested = Session.getSuggestedWeight(key);
    const workingKg = (ex._adjustedKg !== undefined ? ex._adjustedKg : null) ?? suggested ?? 0;

    const meta       = getExerciseMeta(ex.name);
    const warmupSets = generateWarmupSets(workingKg, meta.equipmentType, meta.compound, meta.barWeight);

    const setsArr = [
      ...warmupSets.map(ws => ({
        setNumber:   0,
        weightKg:    ws.weightKg,
        reps:        ws.reps,
        rpe:         null,
        isWarmup:    true,
        completedAt: null,
      })),
      ...Array.from({ length: numSets }, (_, s) => ({
        setNumber:   s + 1,
        weightKg:    workingKg,
        reps:        targetR,
        rpe:         null,
        isWarmup:    false,
        completedAt: null,
      })),
    ];

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
    routineId:   daySession.day  || null,
    routineName: daySession.name || null,
    startedAt:   new Date().toISOString(),
    exercises,
  };
  Session.saveDraft(draft);
  S.session = draft;
  window.dispatchEvent(new CustomEvent('hs:workout-session-changed'));
  S.onRenderActive?.();

  const hasHistory = exercises.some(ex => ex.sets.some(s => !s.isWarmup && s.weightKg > 0));
  if (hasHistory) {
    const warmupCount = exercises.reduce((n, ex) => n + ex.sets.filter(s => s.isWarmup).length, 0);
    const msg = warmupCount > 0
      ? `Peso de tu última sesión + ${warmupCount} set${warmupCount > 1 ? 's' : ''} de calentamiento generados`
      : 'Peso pre-rellenado desde tu última sesión';
    _showRoutineToast(msg);
  }
}
