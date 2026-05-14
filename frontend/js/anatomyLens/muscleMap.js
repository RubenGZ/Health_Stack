// frontend/js/anatomyLens/muscleMap.js
// Pure data — no imports, no side effects.

// ── Bridge: DB simplified names → GLB mesh names ────────────────────────────
// Used as fallback when an exercise ID is not in MUSCLE_MAP below.
export const DB_TO_MESH = {
  'pecho_mayor':      ['pectoral_mayor_esternal', 'pectoral_mayor_clavicular'],
  'pecho_mayor_sup':  ['pectoral_mayor_clavicular'],
  'triceps':          ['triceps_cabeza_larga', 'triceps_cabeza_lateral', 'triceps_cabeza_medial'],
  'deltoides_ant':    ['deltoides_anterior'],
  'deltoides_med':    ['deltoides_medial'],
  'deltoides_post':   ['deltoides_posterior'],
  'dorsal':           ['dorsal_ancho'],
  'romboides':        ['romboides_mayor', 'romboides_menor'],
  'trapecio':         ['trapecio_superior', 'trapecio_medio'],
  'trapecio_medio':   ['trapecio_medio'],
  'biceps':           ['biceps_cabeza_larga', 'biceps_cabeza_corta'],
  'braquial':         ['braquial'],
  'braquiorradial':   ['braquiorradial'],
  'erector_espinal':  ['erector_espinal'],
  'gluteos':          ['gluteo_mayor', 'gluteo_medio'],
  'isquiotibiales':   ['biceps_femoral', 'semitendinoso', 'semimembranoso'],
  'cuadriceps':       ['recto_femoral', 'vasto_lateral', 'vasto_medial', 'vasto_intermedio'],
  'transverso':       ['transverso_abdominal'],
  'oblicuos':         ['oblicuo_externo', 'oblicuo_interno'],
  'lumbar':           ['erector_espinal', 'cuadrado_lumbar'],
  'cuadrado_lumbar':  ['cuadrado_lumbar'],
  'recto_abdominal':  ['recto_abdominal'],
  'rotadores_ext':    ['infraespinoso', 'redondo_menor'],
  'gemelos':          ['gastrocnemio_medial', 'gastrocnemio_lateral'],
  'core':             ['recto_abdominal', 'transverso_abdominal', 'oblicuo_externo'],
  'hombros':          ['deltoides_anterior', 'deltoides_medial', 'deltoides_posterior'],
  'piernas':          ['recto_femoral', 'biceps_femoral', 'gluteo_mayor'],
  'cuerpo_completo':  ['pectoral_mayor_esternal', 'recto_abdominal', 'gluteo_mayor', 'recto_femoral', 'deltoides_anterior'],
};

// ── DB numeric ID → muscleMap key ──────────────────────────────────────────
export const EXERCISE_ID_MAP = {
  1:  'press_banca_plano',
  2:  'press_banca_inclinado',
  3:  'aperturas_mancuernas',
  4:  'fondos_pecho',
  5:  'flexiones_diamante',
  6:  'dominadas_pronas',
  7:  'remo_barra',
  8:  'jalon_pecho',
  9:  'remo_mancuerna',
  10: 'peso_muerto_convencional',
  11: 'press_militar_barra',
  12: 'elevaciones_laterales',
  13: 'pajaros_mancuernas',
  14: 'face_pull',
  15: 'curl_barra',
  16: 'curl_martillo',
  17: 'extension_triceps_polea',
  18: 'press_frances',
  19: 'plancha',
  20: 'crunch',
  21: null,
  22: 'ab_wheel',
  23: 'sentadilla',
  24: 'prensa_piernas',
  25: 'extension_cuadriceps',
  26: 'curl_femoral_tumbado',
  27: 'sentadilla_bulgara',
  28: 'hip_thrust',
  29: 'kickback_cable',
  30: null,
  31: 'burpees',
  32: null,
  33: null,
};

// ── Muscle Map: exercise key → { primary[], secondary[], camera } ───────────
export const MUSCLE_MAP = {
  // PECHO
  'press_banca_plano': {
    primary: ['pectoral_mayor_esternal'],
    secondary: ['pectoral_mayor_clavicular', 'deltoides_anterior', 'triceps_cabeza_lateral', 'triceps_cabeza_medial'],
    camera: 'FRONT_UPPER',
  },
  'press_banca_inclinado': {
    primary: ['pectoral_mayor_clavicular', 'deltoides_anterior'],
    secondary: ['pectoral_mayor_esternal', 'triceps_cabeza_larga', 'triceps_cabeza_lateral'],
    camera: 'OBLIQUE_FR',
  },
  'aperturas_mancuernas': {
    primary: ['pectoral_mayor_esternal', 'pectoral_mayor_clavicular'],
    secondary: ['deltoides_anterior'],
    camera: 'FRONT_UPPER',
  },
  'fondos_pecho': {
    primary: ['pectoral_mayor_esternal'],
    secondary: ['deltoides_anterior', 'triceps_cabeza_larga', 'triceps_cabeza_lateral'],
    camera: 'OBLIQUE_FL',
  },
  'flexiones_diamante': {
    primary: ['triceps_cabeza_lateral', 'triceps_cabeza_medial'],
    secondary: ['triceps_cabeza_larga', 'pectoral_mayor_esternal'],
    camera: 'FRONT_UPPER',
  },
  // ESPALDA
  'dominadas_pronas': {
    primary: ['dorsal_ancho', 'biceps_cabeza_larga', 'biceps_cabeza_corta'],
    secondary: ['romboides_mayor', 'trapecio_medio', 'braquial'],
    camera: 'BACK_CENTER',
  },
  'remo_barra': {
    primary: ['dorsal_ancho', 'romboides_mayor', 'trapecio_medio'],
    secondary: ['biceps_cabeza_larga', 'erector_espinal', 'deltoides_posterior'],
    camera: 'BACK_CENTER',
  },
  'jalon_pecho': {
    primary: ['dorsal_ancho', 'biceps_cabeza_larga'],
    secondary: ['romboides_mayor', 'trapecio_medio', 'braquial'],
    camera: 'BACK_CENTER',
  },
  'remo_mancuerna': {
    primary: ['dorsal_ancho', 'romboides_mayor'],
    secondary: ['biceps_cabeza_larga', 'trapecio_medio', 'erector_espinal'],
    camera: 'OBLIQUE_BL',
  },
  'peso_muerto_convencional': {
    primary: ['erector_espinal', 'gluteo_mayor', 'biceps_femoral'],
    secondary: ['dorsal_ancho', 'trapecio_superior', 'vasto_lateral', 'gluteo_medio'],
    camera: 'BACK_CENTER',
  },
  // HOMBROS
  'press_militar_barra': {
    primary: ['deltoides_anterior', 'deltoides_medial'],
    secondary: ['triceps_cabeza_larga', 'triceps_cabeza_lateral', 'trapecio_superior'],
    camera: 'OBLIQUE_FR',
  },
  'elevaciones_laterales': {
    primary: ['deltoides_medial'],
    secondary: ['deltoides_anterior', 'trapecio_superior'],
    camera: 'OBLIQUE_FL',
  },
  'pajaros_mancuernas': {
    primary: ['deltoides_posterior', 'infraespinoso', 'redondo_menor'],
    secondary: ['romboides_mayor', 'trapecio_medio'],
    camera: 'BACK_UPPER',
  },
  'face_pull': {
    primary: ['deltoides_posterior', 'infraespinoso', 'redondo_menor'],
    secondary: ['trapecio_medio', 'romboides_mayor', 'biceps_cabeza_larga'],
    camera: 'BACK_UPPER',
  },
  // BÍCEPS
  'curl_barra': {
    primary: ['biceps_cabeza_larga', 'biceps_cabeza_corta'],
    secondary: ['braquial', 'braquiorradial'],
    camera: 'ARM_R',
  },
  'curl_martillo': {
    primary: ['braquiorradial', 'braquial'],
    secondary: ['biceps_cabeza_larga'],
    camera: 'ARM_R',
  },
  // TRÍCEPS
  'extension_triceps_polea': {
    primary: ['triceps_cabeza_lateral', 'triceps_cabeza_medial'],
    secondary: ['triceps_cabeza_larga'],
    camera: 'LATERAL_R',
  },
  'press_frances': {
    primary: ['triceps_cabeza_larga', 'triceps_cabeza_lateral', 'triceps_cabeza_medial'],
    secondary: [],
    camera: 'LATERAL_R',
  },
  // CORE
  'plancha': {
    primary: ['transverso_abdominal', 'recto_abdominal'],
    secondary: ['oblicuo_externo', 'erector_espinal', 'gluteo_mayor'],
    camera: 'LATERAL_L',
  },
  'crunch': {
    primary: ['recto_abdominal'],
    secondary: ['oblicuo_externo', 'transverso_abdominal'],
    camera: 'FRONT_CENTER',
  },
  'ab_wheel': {
    primary: ['recto_abdominal', 'transverso_abdominal'],
    secondary: ['oblicuo_externo', 'erector_espinal', 'dorsal_ancho'],
    camera: 'LATERAL_L',
  },
  // PIERNAS
  'sentadilla': {
    primary: ['recto_femoral', 'vasto_lateral', 'vasto_medial'],
    secondary: ['gluteo_mayor', 'biceps_femoral', 'erector_espinal'],
    camera: 'FRONT_LOWER',
  },
  'prensa_piernas': {
    primary: ['recto_femoral', 'vasto_lateral', 'vasto_medial'],
    secondary: ['gluteo_mayor'],
    camera: 'FRONT_LOWER',
  },
  'extension_cuadriceps': {
    primary: ['recto_femoral', 'vasto_lateral', 'vasto_medial'],
    secondary: [],
    camera: 'FRONT_LOWER',
  },
  'curl_femoral_tumbado': {
    primary: ['biceps_femoral', 'semitendinoso', 'semimembranoso'],
    secondary: ['gastrocnemio_medial'],
    camera: 'BACK_LOWER',
  },
  'sentadilla_bulgara': {
    primary: ['recto_femoral', 'vasto_lateral', 'vasto_medial'],
    secondary: ['gluteo_mayor', 'gluteo_medio', 'biceps_femoral'],
    camera: 'OBLIQUE_FR',
  },
  // GLÚTEOS
  'hip_thrust': {
    primary: ['gluteo_mayor'],
    secondary: ['gluteo_medio', 'biceps_femoral'],
    camera: 'BACK_LOWER',
  },
  'kickback_cable': {
    primary: ['gluteo_mayor'],
    secondary: ['biceps_femoral', 'gluteo_medio'],
    camera: 'BACK_LOWER',
  },
  // CARDIO
  'burpees': {
    primary: ['recto_abdominal', 'pectoral_mayor_esternal', 'deltoides_anterior'],
    secondary: ['gluteo_mayor', 'vasto_lateral', 'triceps_cabeza_lateral'],
    camera: 'FRONT_CENTER',
  },
};

/**
 * Resolve an exercise to { primary[], secondary[], camera }.
 * Accepts numeric DB id or string muscleMap key.
 * Falls back to DB_TO_MESH translation if not in MUSCLE_MAP.
 *
 * @param {number|string} exerciseId
 * @param {string[]} dbMuscles - muscles[] array from the exercises DB (fallback)
 * @returns {{ primary: string[], secondary: string[], camera: string }}
 */
export function resolveExercise(exerciseId, dbMuscles = []) {
  const key = typeof exerciseId === 'number'
    ? (EXERCISE_ID_MAP[exerciseId] ?? null)
    : exerciseId;

  if (key && MUSCLE_MAP[key]) return MUSCLE_MAP[key];

  // Fallback: translate DB muscles through DB_TO_MESH
  const primary = (dbMuscles[0] ? (DB_TO_MESH[dbMuscles[0]] ?? [dbMuscles[0]]) : []);
  const secondary = dbMuscles.slice(1).flatMap(m => DB_TO_MESH[m] ?? []);
  return { primary, secondary, camera: 'FULL' };
}
