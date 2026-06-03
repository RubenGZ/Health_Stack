// frontend/js/workout/exercise-meta.js
// Thin ES module wrapper over window.Exercises for workout modules.

// Infiere el tipo de equipamiento a partir del nombre del ejercicio
// (fallback cuando window.Exercises.getMeta no encuentra el ejercicio).
function _inferEquipmentFromName(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('mancuerna')) return 'dumbbell';
  if (n.includes('barra'))     return 'barbell';
  if (n.includes('polea') || n.includes('cable')) return 'cable';
  if (n.includes('máquina') || n.includes('maquina') || n.includes('prensa') || n.includes('jalón') || n.includes('jalon')) return 'machine';
  if (n.includes('dominada') || n.includes('fondos') || n.includes('flexion') || n.includes('plancha') || n.includes('peso corporal')) return 'bodyweight';
  return 'machine'; // neutro → etiqueta "Peso", nunca "mancuerna" por defecto
}

export function getExerciseMeta(exerciseName) {
  const meta = window.Exercises?.getMeta(exerciseName);
  if (meta) return meta;
  return {
    compound: false,
    equipmentType: _inferEquipmentFromName(exerciseName),
    barWeight: 0, defaultKg: 20, sfr: 'medium', primary: false,
  };
}

export function getWeightLabel(equipmentType) {
  switch (equipmentType) {
    case 'dumbbell':   return 'kg / mancuerna';
    case 'bodyweight': return 'kg lastre (opc.)';
    case 'barbell':
    case 'cable':
    case 'machine':
    default:           return 'Peso';
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
