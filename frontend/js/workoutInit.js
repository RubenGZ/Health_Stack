// frontend/js/workoutInit.js
// Expone WorkoutLogger y WorkoutHistory como globals para app.js (no-module).
import { init as initLogger } from './workoutLogger.js';
import { init as initHistory } from './workoutHistory.js';

window.WorkoutLogger = { init: initLogger };
window.WorkoutHistory = { init: initHistory };
