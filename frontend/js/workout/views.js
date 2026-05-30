// frontend/js/workout/views.js
// Vistas de reposo del workout logger: PreWorkoutAdjust, CustomRoutineBuilder,
// carga de sesión desde rutina guardada, y búsqueda de ejercicios.
// renderIdle → idle.js  |  renderRoutinePicker → routine-picker.js
import { S } from './state.js';
export { renderIdle } from './idle.js';
export { renderRoutinePicker } from './routine-picker.js';
export { renderCustomRoutineBuilder } from './custom-builder.js';
export { renderPreWorkoutAdjust } from './pre-workout.js';
export { loadRoutineSession } from './session-loader.js';

export function registerRenderActive(cb) { S.onRenderActive = cb; }

// ─── Búsqueda de ejercicios ────────────────────────────────────────────────────
export function searchExercises(query) {
  const db = (typeof Exercises !== 'undefined' && Exercises.getDB)
    ? Exercises.getDB()
    : [];
  const q = query.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return db.filter(ex => {
    const name = ex.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return name.includes(q);
  }).slice(0, 8);
}

