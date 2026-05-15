// frontend/js/workoutSession.js
// Modelo de datos para la sesión activa en localStorage.

const DRAFT_KEY = 'hs_workout_active';
const HISTORY_KEY = 'hs_workout_sessions_local';
const MAX_HISTORY = 90;
const TARGET_REPS = 8;

// ── resolveExerciseKey ────────────────────────────────────────────────────────
const EXERCISE_NAME_MAP = {
  'press banca plano': 'press_banca_plano', 'press banca': 'press_banca_plano',
  'press inclinado': 'press_banca_inclinado', 'aperturas': 'aperturas_mancuernas',
  'fondos': 'fondos_pecho', 'fondos pecho': 'fondos_pecho',
  'flexiones diamante': 'flexiones_diamante', 'dominadas': 'dominadas_pronas',
  'remo barra': 'remo_barra', 'jalon': 'jalon_pecho', 'jalon': 'jalon_pecho',
  'remo mancuerna': 'remo_mancuerna', 'peso muerto': 'peso_muerto_convencional',
  'press militar': 'press_militar_barra', 'elevaciones laterales': 'elevaciones_laterales',
  'pajaros': 'pajaros_mancuernas', 'pajaros': 'pajaros_mancuernas',
  'face pull': 'face_pull', 'curl barra': 'curl_barra', 'curl martillo': 'curl_martillo',
  'extension triceps': 'extension_triceps_polea', 'extension triceps': 'extension_triceps_polea',
  'press frances': 'press_frances', 'press frances': 'press_frances',
  'plancha': 'plancha', 'crunch': 'crunch', 'ab wheel': 'ab_wheel',
  'plancha lateral': 'plancha_lateral', 'sentadilla': 'sentadilla',
  'prensa': 'prensa_piernas', 'extension cuadriceps': 'extension_cuadriceps',
  'extension cuadriceps': 'extension_cuadriceps', 'curl femoral': 'curl_femoral_tumbado',
  'sentadilla bulgara': 'sentadilla_bulgara', 'sentadilla bulgara': 'sentadilla_bulgara',
  'hip thrust': 'hip_thrust', 'kickback': 'kickback_cable',
  'puente gluteos': 'puente_gluteos', 'puente gluteos': 'puente_gluteos',
  'burpees': 'burpees', 'comba': 'jump_rope', 'remo maquina': 'remo_maquina',
};

export function resolveExerciseKey(name) {
  const normalized = name.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  return EXERCISE_NAME_MAP[normalized] ?? normalized.replace(/\s+/g, '_');
}

// ── Draft ─────────────────────────────────────────────────────────────────────
export function getDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; }
}
export function saveDraft(session) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(session)); } catch {}
}
export function clearDraft() { localStorage.removeItem(DRAFT_KEY); }

export function startSession(routineId = null) {
  const draft = { routineId, startedAt: new Date().toISOString(), exercises: [] };
  saveDraft(draft);
  return draft;
}

export function addExercise(session, name) {
  const key = resolveExerciseKey(name);
  const ex = { key, name, orderIndex: session.exercises.length, sets: [] };
  session.exercises.push(ex);
  saveDraft(session);
  return ex;
}

export function addSet(session, exerciseKey) {
  const ex = session.exercises.find(e => e.key === exerciseKey);
  if (!ex) return null;
  const last = ex.sets[ex.sets.length - 1];
  const suggested = getSuggestedWeight(exerciseKey);
  const newSet = {
    setNumber: last ? last.setNumber + 1 : 1,
    weightKg:  last ? last.weightKg : (suggested ?? 0),
    reps:      last ? last.reps : TARGET_REPS,
    rpe: null, isWarmup: false, completedAt: null,
  };
  ex.sets.push(newSet);
  saveDraft(session);
  return newSet;
}

export function updateSet(session, exerciseKey, setIndex, patch) {
  const ex = session.exercises.find(e => e.key === exerciseKey);
  if (!ex || !ex.sets[setIndex]) return;
  Object.assign(ex.sets[setIndex], patch);
  saveDraft(session);
}

// ── Historial local ───────────────────────────────────────────────────────────
export function getLocalSessions() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

export function saveToLocalHistory(sessionData) {
  const history = getLocalSessions();
  history.unshift(sessionData);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
}

// ── Progresión ────────────────────────────────────────────────────────────────
export function getSuggestedWeight(exerciseKey) {
  const history = getLocalSessions();
  const prev = history.find(s => s.exercises && s.exercises.some(e => e.key === exerciseKey));
  if (!prev) return null;
  const prevEx = prev.exercises.find(e => e.key === exerciseKey);
  const working = (prevEx.sets || []).filter(s => !s.isWarmup);
  if (!working.length) return null;
  const maxWeight = Math.max(...working.map(s => s.weightKg));
  const allHitTarget = working.every(s => s.reps >= TARGET_REPS);
  return allHitTarget ? maxWeight + 2.5 : maxWeight;
}

export function getPrevSessionSummary(exerciseKey) {
  const history = getLocalSessions();
  const prev = history.find(s => s.exercises && s.exercises.some(e => e.key === exerciseKey));
  if (!prev) return null;
  const prevEx = prev.exercises.find(e => e.key === exerciseKey);
  const date = new Date(prev.startedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const setsStr = (prevEx.sets || []).filter(s => !s.isWarmup).map(s => `${s.weightKg}×${s.reps}`).join(' | ');
  return { date, setsStr };
}
