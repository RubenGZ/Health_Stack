// frontend/js/workout/warmup.js
// Pure function — no side effects, no DOM, no imports.

const ROUND_TO = 2.5;

function _round(kg) {
  return Math.round(kg / ROUND_TO) * ROUND_TO;
}

/**
 * Generate warmup sets for an exercise.
 * @param {number}  workingKg     - target working weight (0 = no history, skip warmup)
 * @param {string}  equipmentType - 'barbell'|'dumbbell'|'cable'|'machine'|'bodyweight'
 * @param {boolean} compound      - true = multi-joint exercise
 * @param {number}  [barWeight]   - minimum set weight (bar itself). Default 0.
 * @returns {Array<{weightKg:number, reps:number, isWarmup:true, setNumber:number}>}
 */
export function generateWarmupSets(workingKg, equipmentType, compound, barWeight = 0) {
  if (!compound)                    return [];  // isolation: no warmup
  if (!workingKg || workingKg <= 0) return [];  // no history yet

  const min = Math.max(barWeight, 2.5);

  function ws(pct, reps) {
    return {
      weightKg:  Math.max(min, _round(workingKg * pct)),
      reps,
      isWarmup:  true,
      setNumber: 0,
    };
  }

  if (workingKg >= 60) return [ ws(0.40, 10), ws(0.65, 6), ws(0.85, 3) ];
  if (workingKg >= 30) return [ ws(0.50, 8),  ws(0.75, 5) ];
  return                       [ ws(0.60, 10) ];
}
