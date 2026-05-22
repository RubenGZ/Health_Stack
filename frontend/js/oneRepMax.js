// oneRepMax.js — Fórmulas 1RM, tabla nRM, zonas de entrenamiento, plate calculator
// Sin dependencias externas. Todas las funciones son puras salvo getHistory().

// ── Fórmulas ──────────────────────────────────────────────────────────────────

/** Epley: precisa para reps > 6 */
export function epley(weightKg, reps) {
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** Brzycki: más precisa para reps ≤ 6 */
export function brzycki(weightKg, reps) {
  if (reps === 1) return weightKg;
  if (reps >= 37) return weightKg; // evitar división por cero o negativo
  return weightKg * (36 / (37 - reps));
}

/** Promedio ponderado: usa Brzycki si reps ≤ 6, Epley si reps > 6.
 *  Para reps > 20 la precisión cae — devuelve null como señal. */
export function best1RM(weightKg, reps) {
  if (!weightKg || weightKg <= 0 || !reps || reps <= 0) return null;
  if (reps > 20) return null;
  if (reps <= 6) return Math.round(brzycki(weightKg, reps) * 10) / 10;
  const e = epley(weightKg, reps);
  const b = brzycki(weightKg, reps);
  return Math.round(((e + b) / 2) * 10) / 10;
}

/** Peso para n repeticiones dado un 1RM.
 *  Inversa de Epley: nRM = 1RM / (1 + n/30) */
export function nRM(oneRM, n) {
  if (n === 1) return oneRM;
  return Math.round((oneRM / (1 + n / 30)) * 10) / 10;
}

// ── Zonas de entrenamiento ─────────────────────────────────────────────────────

const ZONES = [
  { maxReps: 1,  key: 'strength_max',  label: 'Fuerza máxima',        color: '#ef4444' },
  { maxReps: 3,  key: 'strength',      label: 'Fuerza',               color: '#f97316' },
  { maxReps: 5,  key: 'strength_hyp',  label: 'Fuerza-Hipertrofia',   color: '#eab308' },
  { maxReps: 8,  key: 'hypertrophy',   label: 'Hipertrofia',          color: '#c4a561' },
  { maxReps: 12, key: 'hyp_endurance', label: 'Hipertrofia-Resistencia', color: '#3b82f6' },
  { maxReps: 999,key: 'endurance',     label: 'Resistencia',          color: '#22d3ee' },
];

export function getZone(reps) {
  return ZONES.find(z => reps <= z.maxReps) || ZONES[ZONES.length - 1];
}

// ── Tabla 1RM → 12RM ──────────────────────────────────────────────────────────

/** Construye la tabla 1→12 RM a partir de un set (peso × reps).
 *  Devuelve array de { n, kg, zone, isCurrent } */
export function buildTable(weightKg, reps) {
  const oneRM = best1RM(weightKg, reps);
  if (!oneRM) return [];
  return [1, 2, 3, 4, 5, 6, 8, 10, 12].map(n => ({
    n,
    kg:        nRM(oneRM, n),
    zone:      getZone(n),
    isCurrent: n === reps,
  }));
}

// ── Historial de 1RM estimados ────────────────────────────────────────────────

/** Lee el historial de sesiones locales y extrae el mejor set por sesión
 *  para construir la curva de evolución del 1RM estimado. */
export function getHistory(exerciseKey) {
  let sessions = [];
  try { sessions = JSON.parse(localStorage.getItem('hs_workout_sessions_local') || '[]'); } catch {}

  return sessions
    .filter(s => s.exercises && s.exercises.some(e => e.key === exerciseKey))
    .map(s => {
      const ex = s.exercises.find(e => e.key === exerciseKey);
      const workingSets = (ex.sets || []).filter(set => !set.isWarmup && set.weightKg > 0 && set.reps > 0);
      if (!workingSets.length) return null;
      // mejor 1RM de esa sesión (no necesariamente el set más pesado)
      let best = null;
      workingSets.forEach(set => {
        const orm = best1RM(set.weightKg, set.reps);
        if (orm && (!best || orm > best.oneRM)) {
          best = { date: s.startedAt, weightKg: set.weightKg, reps: set.reps, oneRM: orm };
        }
      });
      return best;
    })
    .filter(Boolean)
    .reverse(); // cronológico ascendente
}

// ── Plate Calculator ──────────────────────────────────────────────────────────

/** Placas disponibles (por lado), de mayor a menor */
const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

/** Dado un peso objetivo y el peso de la barra, calcula las placas por lado.
 *  @returns { achievable, plates: [{kg, count}], totalKg, perSideKg } */
export function plateCalc(targetKg, barKg = 20) {
  const perSide = (targetKg - barKg) / 2;
  if (perSide < 0) return { achievable: false, plates: [], totalKg: barKg, perSideKg: 0 };
  if (perSide === 0) return { achievable: true, plates: [], totalKg: barKg, perSideKg: 0 };

  let remaining = Math.round(perSide * 100) / 100; // evitar float drift
  const plates = [];

  for (const plate of PLATES) {
    if (remaining <= 0) break;
    const count = Math.floor(Math.round(remaining / plate * 100) / 100);
    if (count > 0) {
      plates.push({ kg: plate, count });
      remaining = Math.round((remaining - plate * count) * 100) / 100;
    }
  }

  const achievable = Math.abs(remaining) < 0.01;
  const perSideActual = plates.reduce((s, p) => s + p.kg * p.count, 0);
  const totalKg = Math.round((barKg + perSideActual * 2) * 100) / 100;

  return { achievable, plates, totalKg, perSideKg: perSideActual };
}

/** Encuentra el peso alcanzable más cercano por debajo y por encima */
export function plateCalcNearest(targetKg, barKg = 20) {
  const exact = plateCalc(targetKg, barKg);
  if (exact.achievable) return { below: exact, above: exact };

  // buscar por debajo (reducir en pasos de 1.25 × 2)
  let below = null;
  for (let t = targetKg - 1.25; t >= barKg; t = Math.round((t - 1.25) * 100) / 100) {
    const r = plateCalc(t, barKg);
    if (r.achievable) { below = r; break; }
  }

  // buscar por encima
  let above = null;
  for (let t = targetKg + 1.25; t <= targetKg + 10; t = Math.round((t + 1.25) * 100) / 100) {
    const r = plateCalc(t, barKg);
    if (r.achievable) { above = r; break; }
  }

  return { below, above };
}
