// frontend/js/workout/exercise-meta.js
// Thin ES module wrapper over window.Exercises for workout modules.

export function getExerciseMeta(exerciseName) {
  return window.Exercises?.getMeta(exerciseName)
    ?? { compound: false, equipmentType: 'dumbbell', barWeight: 0,
         defaultKg: 20, sfr: 'medium', primary: false };
}

export function getWeightLabel(equipmentType) {
  switch (equipmentType) {
    case 'barbell':    return 'kg total (barra incl.)';
    case 'dumbbell':   return 'kg / mancuerna';
    case 'cable':      return 'kg en pila';
    case 'machine':    return 'kg';
    case 'bodyweight': return 'kg lastre (opc.)';
    default:           return 'kg';
  }
}

export function getWeightStep(equipmentType) {
  switch (equipmentType) {
    case 'barbell':
    case 'cable':    return 2.5;
    case 'machine':  return 5;
    default:         return 1;
  }
}
