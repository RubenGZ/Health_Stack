// workoutPR.js — Detección y gestión de Personal Records por ejercicio
// Persiste en localStorage['hs_prs']. Sin dependencias externas.
import { best1RM } from './oneRepMax.js';

const PR_KEY     = 'hs_prs';
const MAX_HIST   = 200; // entradas por ejercicio

// ── Persistencia ──────────────────────────────────────────────────────────────

function _load() {
  try { return JSON.parse(localStorage.getItem(PR_KEY) || '{}'); } catch { return {}; }
}

function _save(data) {
  try { localStorage.setItem(PR_KEY, JSON.stringify(data)); } catch {}
}

// ── API pública ───────────────────────────────────────────────────────────────

/** Mejor PR histórico para un ejercicio.
 *  @returns {{ weightKg, reps, oneRM, date }} | null */
export function getExercisePR(exerciseKey) {
  const all = _load();
  const history = all[exerciseKey];
  if (!history || !history.length) return null;
  // El mejor es el de mayor oneRM
  return history.reduce((best, entry) =>
    entry.oneRM > (best?.oneRM ?? 0) ? entry : best, null);
}

/** Detecta si un set completado es PR (ANTES de guardar).
 *  @returns {{ isPR: boolean, type: 'weight'|'oneRM'|'volume'|null, delta: number }} */
export function detectSetPR(exerciseKey, weightKg, reps) {
  if (!weightKg || weightKg <= 0 || !reps || reps <= 0) {
    return { isPR: false, type: null, delta: 0 };
  }

  const all    = _load();
  const history = all[exerciseKey] || [];

  if (!history.length) {
    // Primer registro de este ejercicio → siempre es PR
    const oneRM = best1RM(weightKg, reps) ?? 0;
    return { isPR: true, type: 'oneRM', delta: oneRM };
  }

  const newOneRM   = best1RM(weightKg, reps) ?? 0;
  const newVolume  = weightKg * reps;

  const bestWeight = Math.max(...history.map(e => e.weightKg));
  const bestOneRM  = Math.max(...history.map(e => e.oneRM ?? 0));
  const bestVolume = Math.max(...history.map(e => (e.weightKg * e.reps)));

  const isWeightPR = weightKg > bestWeight;
  const isOneRMPR  = newOneRM > 0 && newOneRM > bestOneRM;
  const isVolumePR = newVolume > bestVolume;

  // Prioridad: oneRM > weight > volume (el de mayor impacto)
  if (isOneRMPR) {
    return { isPR: true, type: 'oneRM',  delta: Math.round((newOneRM - bestOneRM) * 10) / 10 };
  }
  if (isWeightPR) {
    return { isPR: true, type: 'weight', delta: Math.round((weightKg - bestWeight) * 10) / 10 };
  }
  if (isVolumePR) {
    return { isPR: true, type: 'volume', delta: Math.round((newVolume - bestVolume) * 10) / 10 };
  }

  return { isPR: false, type: null, delta: 0 };
}

/** Guarda un nuevo PR en el historial (llamar solo si detectSetPR devuelve isPR: true).
 *  Mantiene máximo MAX_HIST entradas por ejercicio. */
export function saveSetPR(exerciseKey, weightKg, reps) {
  const all     = _load();
  const history = all[exerciseKey] || [];
  const oneRM   = best1RM(weightKg, reps) ?? 0;

  history.unshift({ date: new Date().toISOString(), weightKg, reps, oneRM });
  if (history.length > MAX_HIST) history.length = MAX_HIST;

  all[exerciseKey] = history;
  _save(all);
}

/** Historial completo de PRs para un ejercicio (orden cronológico ascendente). */
export function getPRHistory(exerciseKey) {
  const all = _load();
  return ([...(all[exerciseKey] || [])]).reverse();
}

/** Label legible del tipo de PR para mostrar en el toast. */
export function prLabel(type, delta, oneRM) {
  switch (type) {
    case 'oneRM':   return `1RM estimado: ${oneRM} kg${delta > 0 ? `  (+${delta} kg)` : ''}`;
    case 'weight':  return `Nuevo máximo: +${delta} kg`;
    case 'volume':  return `Mejor set: ${delta} kg·reps`;
    default:        return 'Nuevo Récord';
  }
}
