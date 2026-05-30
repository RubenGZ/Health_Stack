# Workout System Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modularize the workout system into focused files with correct warmup logic, equipment-aware labels, ~160 exercises, and a pre-session readiness check.

**Architecture:** Three parallel tracks. Track A (P0) extends `exercises.js` and creates `exercise-meta.js` + `warmup.js`. Track B (P1) modularizes `views.js` + `workoutLogger.js` using Track A modules. Track C (P2–P3) adds `readiness-check.js`, SFR badge updates, backend payload, and SW bump. B3–B5 depend on A; C4 depends on A + B.

**Tech Stack:** Vanilla JS ES modules, global IIFE for `exercises.js`, FastAPI backend (Python), `localStorage` for session data.

**Spec:** `docs/superpowers/specs/2026-05-30-workout-system-redesign.md`

---

## File Map

### Created
| File | Responsibility |
|------|---------------|
| `frontend/js/workout/exercise-meta.js` | ES module wrapping `Exercises` global: `getExerciseMeta`, `getWeightLabel`, `getWeightStep` |
| `frontend/js/workout/warmup.js` | Pure function `generateWarmupSets(workingKg, equipment, compound)` |
| `frontend/js/workout/readiness-check.js` | Pre-session survey UI + score + `readinessAdj` |
| `frontend/js/workout/session-loader.js` | Extracted from `views.js`: progressive overload + warmup wiring |
| `frontend/js/workout/pre-workout.js` | Extracted from `views.js`: equipment-aware weight labels |
| `frontend/js/workout/routine-picker.js` | Extracted from `views.js`: `renderRoutinePicker` |
| `frontend/js/workout/custom-builder.js` | Extracted from `views.js`: `renderCustomRoutineBuilder` |
| `frontend/js/workout/idle.js` | Extracted from `views.js`: `renderIdle` |
| `frontend/js/workoutSets.js` | Extracted from `workoutLogger.js`: `renderSets` + set handlers |

### Modified
| File | Change |
|------|--------|
| `frontend/js/exercises.js` | Add `equipmentType`, `compound`, `barWeight`, `defaultKg`, `sfr`, `primary` to DB entries; add `getMeta()` + `getForRoutine()`; add ~80 new exercises |
| `frontend/js/workout/views.js` | Reduce to ~30-line orchestrator re-exporting from sub-modules |
| `frontend/js/workoutLogger.js` | Remove `renderSets` + set handler code (~350 lines); keep coordinator |
| `frontend/js/routineGenerator.js` | Replace `EX` object with `Exercises.getForRoutine(group, equipment)` |
| `frontend/js/anatomyLens/muscleMap.js` | Add entries for new exercises |
| `frontend/sw.js` | Bump to `healthstack-v98`; add new module paths to `STATIC_ASSETS` |
| `backend/app/modules/workout_sessions/post_workout_service.py` | Add 3 RGPD-safe readiness fields to prompt |

---

## ══════════════════════════════════════════
## TRACK A — P0: Foundation (start immediately)
## ══════════════════════════════════════════

### Task A1: Extend exercises.js with metadata + new methods + new exercises

**Depends on:** nothing  
**Files:**
- Modify: `frontend/js/exercises.js`

- [ ] **Step 1: Add getMeta() and getForRoutine() methods to the Exercises IIFE**

Find the `return {` near the bottom of `frontend/js/exercises.js` (where `getDB`, `getGroups`, etc. are exported) and add two methods before the closing `}`:

```js
// Add inside the return { ... } block, after existing methods:

getMeta(exerciseName) {
  const norm = n =>
    String(n).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const target = norm(exerciseName);
  const ex = DB.find(e => norm(e.name) === target);
  if (!ex) {
    return { compound: false, equipmentType: 'dumbbell', barWeight: 0,
             defaultKg: 20, sfr: 'medium', primary: false };
  }
  return {
    compound:      ex.compound      ?? false,
    equipmentType: ex.equipmentType ?? 'dumbbell',
    barWeight:     ex.barWeight     ?? 0,
    defaultKg:     ex.defaultKg     ?? 20,
    sfr:           ex.sfr           ?? 'medium',
    primary:       ex.primary       ?? false,
  };
},

getForRoutine(groupEn, equipmentCategory) {
  const GROUP_MAP = {
    chest:       'pecho',    back:      'espalda',  shoulders: 'hombros',
    triceps:     'triceps',  biceps:    'biceps',   quads:     'piernas',
    hamstrings:  'piernas',  glutes:    'gluteos',  calves:    'gemelos',
    core:        'core',
  };
  const EQ_MAP = {
    full_gym:     ['barbell','dumbbell','cable','machine','bodyweight'],
    free_weights: ['barbell','dumbbell','bodyweight'],
    dumbbells:    ['dumbbell','bodyweight'],
    machines:     ['cable','machine','bodyweight'],
    bodyweight:   ['bodyweight'],
  };
  const groupId   = GROUP_MAP[groupEn] ?? groupEn;
  const allowedEq = EQ_MAP[equipmentCategory]
    ?? ['barbell','dumbbell','cable','machine','bodyweight'];
  return DB.filter(e => e.group === groupId && allowedEq.includes(e.equipmentType));
},
```

- [ ] **Step 2: Add metadata fields to existing DB entries (patch pattern)**

For each existing entry, add the 6 new fields. Example patch for the first two entries:

```js
// BEFORE:
{ id: 1, name: 'Press banca plano', group: 'pecho', level: 'Intermedio', equipment: 'Barra', ...}

// AFTER — update name to match spec + add fields:
{ id: 1, name: 'Press banca plano (barra)', group: 'pecho', level: 'Intermedio', equipment: 'Barra',
  equipmentType: 'barbell', compound: true, barWeight: 20, defaultKg: 60, sfr: 'medium', primary: true,
  muscles: ['pecho_mayor', 'triceps', 'deltoides_ant'],
  desc: 'Ejercicio rey del pecho. ...',
  video_url: 'https://www.youtube.com/watch?v=rT7DgCr-3pg',
  affiliate: { ... } },

{ id: 2, name: 'Press banca inclinado (barra)', group: 'pecho', level: 'Intermedio', equipment: 'Barra',
  equipmentType: 'barbell', compound: true, barWeight: 20, defaultKg: 50, sfr: 'medium', primary: true,
  muscles: ['pecho_mayor_sup', 'deltoides_ant', 'triceps'],
  desc: 'Banco a 30-45°...', video_url: '...', affiliate: { ... } },
```

Apply this same patch to all existing entries, using the spec table (`docs/superpowers/specs/2026-05-30-workout-system-redesign.md` §Pool completo) for the correct `equipmentType`, `compound`, `barWeight`, `defaultKg`, `sfr`, `primary` values.

**Mapping guide for existing entries:**
- `equipment: 'Barra'` → `equipmentType: 'barbell'`
- `equipment: 'Mancuernas'` → `equipmentType: 'dumbbell'`
- `equipment: 'Peso corporal'` → `equipmentType: 'bodyweight'`
- `equipment: 'Máquina'` or `'Polea'` → `equipmentType: 'machine'` or `'cable'`

- [ ] **Step 3: Add all ~80 new exercises from the spec table**

Append new entries to the DB array (increment id from last existing id). Follow this pattern:

```js
// ESPALDA
{ id: 101, name: 'Remo T-bar', group: 'espalda', level: 'Intermedio', equipment: 'Barra',
  equipmentType: 'barbell', compound: true, barWeight: 20, defaultKg: 40, sfr: 'medium', primary: true,
  muscles: ['dorsal', 'romboides', 'trapecio', 'biceps'],
  desc: 'Barra T-bar o landmine. Agarre neutro. Codos al cuerpo. Gran activación del dorsal ancho.',
  video_url: '' },

{ id: 102, name: 'Remo en máquina (Hammer)', group: 'espalda', level: 'Principiante', equipment: 'Máquina',
  equipmentType: 'machine', compound: true, barWeight: 0, defaultKg: 60, sfr: 'high', primary: true,
  muscles: ['dorsal', 'romboides', 'biceps'],
  desc: 'Máquina Hammer Strength o similar. Agarre neutro. Alta activación del lat con mínima fatiga lumbar.',
  video_url: '' },

{ id: 103, name: 'Meadows Row', group: 'espalda', level: 'Avanzado', equipment: 'Barra',
  equipmentType: 'barbell', compound: true, barWeight: 20, defaultKg: 40, sfr: 'high', primary: false,
  muscles: ['dorsal', 'teres_major', 'biceps'],
  desc: 'Barra en landmine, posición de zancada, agarre prono. John Meadows row. Estiramiento profundo del lat.',
  video_url: '' },
// ... add all entries from the spec table following the same pattern
```

Add ALL exercises from the spec table (§Pool completo) for: PECHO, ESPALDA, HOMBROS, TRÍCEPS, BÍCEPS, CUÁDRICEPS, ISQUIOTIBIALES, GLÚTEOS, GEMELOS, CORE.

- [ ] **Step 4: Verify getMeta works in browser console**

Open the app in browser, open DevTools console, run:

```js
Exercises.getMeta('Press banca plano (barra)')
// Expected: { compound: true, equipmentType: 'barbell', barWeight: 20, defaultKg: 60, sfr: 'medium', primary: true }

Exercises.getMeta('ejercicio que no existe')
// Expected: { compound: false, equipmentType: 'dumbbell', barWeight: 0, defaultKg: 20, sfr: 'medium', primary: false }

Exercises.getForRoutine('chest', 'dumbbells').map(e => e.name)
// Expected: array of pecho exercises with equipmentType 'dumbbell' or 'bodyweight'
```

- [ ] **Step 5: Commit**

```bash
git add frontend/js/exercises.js
git commit -m "feat(exercises): expand pool to ~160 exercises + getMeta/getForRoutine methods"
```

---

### Task A2: Create exercise-meta.js

**Depends on:** A1  
**Files:**
- Create: `frontend/js/workout/exercise-meta.js`

- [ ] **Step 1: Create the file**

```js
// frontend/js/workout/exercise-meta.js
// Thin ES module wrapper over window.Exercises for workout modules.
// Provides metadata (compound, equipment, weight hints) without coupling
// callers to the Exercises IIFE directly.

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
    default:         return 1;   // dumbbell, bodyweight
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/js/workout/exercise-meta.js
git commit -m "feat(workout): add exercise-meta.js module"
```

---

### Task A3: Create warmup.js

**Depends on:** nothing  
**Files:**
- Create: `frontend/js/workout/warmup.js`

- [ ] **Step 1: Create the file**

```js
// frontend/js/workout/warmup.js
// Pure function — no side effects, no DOM, no imports.

const ROUND_TO = 2.5;

function _round(kg) {
  return Math.round(kg / ROUND_TO) * ROUND_TO;
}

/**
 * Generate warmup sets for an exercise.
 * @param {number}  workingKg   - target working weight (0 = no history, skip warmup)
 * @param {string}  equipmentType - 'barbell'|'dumbbell'|'cable'|'machine'|'bodyweight'
 * @param {boolean} compound    - true = multi-joint exercise (bench, squat, deadlift, etc.)
 * @param {number}  [barWeight] - minimum set weight (bar itself). Default 0.
 * @returns {Array<{weightKg:number, reps:number, isWarmup:true, setNumber:number}>}
 */
export function generateWarmupSets(workingKg, equipmentType, compound, barWeight = 0) {
  if (!compound)       return [];  // isolation: curl, extension, lateral raise → no warmup
  if (!workingKg || workingKg <= 0) return [];  // no history → user fills in live

  const min = Math.max(barWeight, 2.5);

  function ws(pct, reps) {
    return {
      weightKg:  Math.max(min, _round(workingKg * pct)),
      reps,
      isWarmup:  true,
      setNumber: 0,
    };
  }

  if (workingKg >= 60) {
    // Heavy compound (bench 60+, squat 60+, deadlift 60+)
    return [ ws(0.40, 10), ws(0.65, 6), ws(0.85, 3) ];
  }
  if (workingKg >= 30) {
    // Medium compound
    return [ ws(0.50, 8), ws(0.75, 5) ];
  }
  // Light compound (1–29 kg)
  return [ ws(0.60, 10) ];
}
```

- [ ] **Step 2: Verify in browser console**

After loading the app (or in any JS console with the module loaded):

```js
import('/js/workout/warmup.js').then(m => {
  console.log(m.generateWarmupSets(80, 'barbell', true, 20));
  // Expected: [{weightKg:32.5,reps:10,isWarmup:true,...}, {weightKg:52.5,...}, {weightKg:67.5,...}]
  console.log(m.generateWarmupSets(20, 'dumbbell', false, 0));
  // Expected: [] (isolation)
  console.log(m.generateWarmupSets(0, 'barbell', true, 20));
  // Expected: [] (no history)
  console.log(m.generateWarmupSets(40, 'barbell', true, 20));
  // Expected: [{weightKg:20,reps:8,...}, {weightKg:30,...}]
});
```

- [ ] **Step 3: Commit**

```bash
git add frontend/js/workout/warmup.js
git commit -m "feat(workout): add warmup.js pure function module"
```

---

### Task A4: Update routineGenerator.js to import from exercises.js

**Depends on:** A1  
**Files:**
- Modify: `frontend/js/routineGenerator.js` (around line 142)

- [ ] **Step 1: Find and understand the EX object**

Open `frontend/js/routineGenerator.js`. The object starts around line 142:
```js
const EX = {
  chest: { full_gym: [...], free_weights: [...], ... },
  back:  { ... },
  ...
};
```

Find all places where `EX` is referenced (search for `EX[` or `EX.`). There will be calls like `EX[group][equipment]` when building the routine day sessions.

- [ ] **Step 2: Replace EX object with Exercises.getForRoutine calls**

Delete the entire `const EX = { ... };` block. Then find where `EX[group][equipment]` (or similar) is used and replace with:

```js
// BEFORE (example usage inside routine builder):
const exercises = EX[group]?.[equipment] ?? [];

// AFTER:
const exercises = (window.Exercises?.getForRoutine(group, equipment) ?? [])
  .map(e => ({ name: e.name, sfr: e.sfr, primary: e.primary ?? false }));
```

The shape `{ name, sfr, primary }` matches what the routine builder already expects, so no other changes needed.

- [ ] **Step 3: Verify a routine generates correctly**

In the app: go to Entreno → Nueva rutina IA → complete the questionnaire → verify a routine is generated with exercise names matching the new pool.

- [ ] **Step 4: Commit**

```bash
git add frontend/js/routineGenerator.js
git commit -m "refactor(routineGenerator): remove EX object, use Exercises.getForRoutine"
```

---

## ══════════════════════════════════════════
## TRACK B — P1: views.js + workoutLogger.js modularization
## ══════════════════════════════════════════

**Note:** Tasks B1–B2 can start in parallel with Track A. Tasks B3–B5 require Track A complete.

### Task B1: Extract idle.js and routine-picker.js from views.js

**Depends on:** nothing (these functions have no dependency on Track A)  
**Files:**
- Create: `frontend/js/workout/idle.js`
- Create: `frontend/js/workout/routine-picker.js`
- Modify: `frontend/js/workout/views.js`

- [ ] **Step 1: Create idle.js**

Cut the `renderIdle()` function (currently lines 33–208 in `views.js`) and paste it into a new file:

```js
// frontend/js/workout/idle.js
import { S } from './state.js';
import * as Session from '../workoutSession.js';

export function renderIdle() {
  // --- PASTE the complete renderIdle() function body here ---
  // (everything between `export function renderIdle() {` and the closing `}`)
  // Keep all internal helpers (_fmtDuration, etc.) that renderIdle uses.
  // If _fmtDuration is used by other functions too, move it to a local helper at top.
}

function _fmtDuration(secs) {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}min`;
  return `${m}min`;
}
```

- [ ] **Step 2: Create routine-picker.js**

Cut `renderRoutinePicker()` (currently lines 209–285 in `views.js`) into a new file:

```js
// frontend/js/workout/routine-picker.js
import { S } from './state.js';
import { renderIdle } from './idle.js';

export function renderRoutinePicker(routines) {
  // --- PASTE the complete renderRoutinePicker() function body here ---
}
```

- [ ] **Step 3: In views.js, replace the cut code with imports and re-exports**

At the top of `views.js`, add:
```js
export { renderIdle } from './idle.js';
export { renderRoutinePicker } from './routine-picker.js';
```

Remove the now-empty function bodies from `views.js`.

- [ ] **Step 4: Verify no runtime errors**

Open the app → Entreno. The idle screen (historial + botones) must render correctly. Click "Nueva rutina IA" — the routine picker must open. No console errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/js/workout/idle.js frontend/js/workout/routine-picker.js frontend/js/workout/views.js
git commit -m "refactor(workout): extract idle.js + routine-picker.js from views.js"
```

---

### Task B2: Extract custom-builder.js from views.js

**Depends on:** B1  
**Files:**
- Create: `frontend/js/workout/custom-builder.js`
- Modify: `frontend/js/workout/views.js`

- [ ] **Step 1: Create custom-builder.js**

Cut `renderCustomRoutineBuilder()` (lines 366–503 in current `views.js`) into:

```js
// frontend/js/workout/custom-builder.js
import { S } from './state.js';
import { renderIdle } from './idle.js';
import * as Session from '../workoutSession.js';

export function renderCustomRoutineBuilder() {
  // --- PASTE the complete renderCustomRoutineBuilder() body here ---
  // The function uses: S.root, Exercises global, Session.saveCustomRoutine
  // The Exercises reference stays as `window.Exercises` or `typeof Exercises !== 'undefined'`
}
```

- [ ] **Step 2: Add re-export to views.js**

```js
export { renderCustomRoutineBuilder } from './custom-builder.js';
```

- [ ] **Step 3: Verify**

App → Entreno → "Mi rutina" → custom builder screen must render. Search for exercises, add sets, save. No console errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/js/workout/custom-builder.js frontend/js/workout/views.js
git commit -m "refactor(workout): extract custom-builder.js from views.js"
```

---

### Task B3: Extract pre-workout.js with equipment labels

**Depends on:** A2 (exercise-meta.js)  
**Files:**
- Create: `frontend/js/workout/pre-workout.js`
- Modify: `frontend/js/workout/views.js`

- [ ] **Step 1: Create pre-workout.js**

Cut `renderPreWorkoutAdjust()` (lines 286–365 in original `views.js`) and adapt to use equipment labels:

```js
// frontend/js/workout/pre-workout.js
import { S } from './state.js';
import { renderIdle } from './idle.js';
import { getExerciseMeta, getWeightLabel, getWeightStep } from './exercise-meta.js';

export function renderPreWorkoutAdjust(daySession, readinessAdj = null) {
  const exList = (daySession.exercises || []).filter(ex => ex.name);

  S.root.innerHTML = `
    <div class="wl-preworkout">
      <div class="wl-picker-header">
        <button class="wl-picker-back" id="wl-pre-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Volver
        </button>
        <h3 class="wl-picker-title">${daySession.day} — ${daySession.name || ''}</h3>
      </div>
      <p class="wl-pre-hint">Ajusta los pesos antes de empezar.</p>
      <div class="wl-pre-list">
        ${exList.map((ex, i) => {
          const meta    = getExerciseMeta(ex.name);
          const label   = getWeightLabel(meta.equipmentType);
          const step    = getWeightStep(meta.equipmentType);
          const planned = ex._suggestedKg ?? 0;
          const badge   = ex._progressionBadge
            ? `<span class="wl-pre-progress-badge">${ex._progressionBadge}</span>`
            : (planned === meta.defaultKg
              ? `<span class="wl-pre-hint-badge">Primera vez — ajusta tu peso</span>`
              : '');
          return `
          <div class="wl-pre-row">
            <div class="wl-pre-exname">${ex.name}${badge}</div>
            <div class="wl-pre-scheme">${ex.sets} × ${ex.reps} · ${ex.rest || '90s'}</div>
            <div class="wl-pre-weight-wrap">
              <button class="wl-pre-stepper" data-idx="${i}" data-dir="-" data-step="${step}">−</button>
              <input type="text" inputmode="decimal" pattern="[0-9]*\\.?[0-9]*"
                class="wl-pre-weight-inp" id="wl-pre-weight-${i}"
                value="${planned > 0 ? planned : ''}" placeholder=""
                style="font-size:16px">
              <span class="wl-pre-unit">${label}</span>
              <button class="wl-pre-stepper" data-idx="${i}" data-dir="+" data-step="${step}">+</button>
            </div>
          </div>`;
        }).join('')}
      </div>
      <button class="wl-pre-start-btn" id="wl-pre-start">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Empezar entreno
      </button>
    </div>`;

  S.root.querySelector('#wl-pre-back').addEventListener('click', renderIdle);

  S.root.querySelectorAll('.wl-pre-stepper').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx  = parseInt(btn.dataset.idx);
      const step = parseFloat(btn.dataset.step) || 2.5;
      const inp  = S.root.querySelector(`#wl-pre-weight-${idx}`);
      if (!inp) return;
      const cur = parseFloat(inp.value) || 0;
      inp.value = Math.max(0, btn.dataset.dir === '+' ? cur + step : cur - step);
    });
  });

  S.root.querySelectorAll('.wl-pre-weight-inp').forEach(inp => {
    inp.addEventListener('focus', () => inp.select());
    inp.addEventListener('pointerdown', () => {
      if (document.activeElement === inp) setTimeout(() => inp.select(), 0);
    });
    inp.addEventListener('input', () => {
      let v = inp.value.replace(/[^0-9.]/g, '');
      const dot = v.indexOf('.');
      if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2);
      if (inp.value !== v) inp.value = v;
    });
  });

  // Dynamically import session-loader to avoid circular dep
  S.root.querySelector('#wl-pre-start').addEventListener('click', async () => {
    const { loadRoutineSession } = await import('./session-loader.js');
    const adjusted = { ...daySession, exercises: exList.map((ex, i) => {
      const inp = S.root.querySelector(`#wl-pre-weight-${i}`);
      const kg  = inp ? (parseFloat(inp.value) || 0) : 0;
      return { ...ex, _adjustedKg: kg };
    }) };
    loadRoutineSession(adjusted);
  });
}
```

- [ ] **Step 2: Add re-export to views.js**

```js
export { renderPreWorkoutAdjust } from './pre-workout.js';
```

- [ ] **Step 3: Verify**

App → Entreno → select routine → day → pre-workout screen. Each exercise must show the correct unit label (`kg / mancuerna`, `kg total (barra incl.)`, etc.). Steppers must increment by the correct step (2.5 for barbell/cable, 1 for dumbbell).

- [ ] **Step 4: Commit**

```bash
git add frontend/js/workout/pre-workout.js frontend/js/workout/views.js
git commit -m "feat(workout): extract pre-workout.js with equipment-aware weight labels"
```

---

### Task B4: Extract session-loader.js with progressive overload + warmup

**Depends on:** A2 (exercise-meta.js), A3 (warmup.js)  
**Files:**
- Create: `frontend/js/workout/session-loader.js`
- Modify: `frontend/js/workout/views.js`

- [ ] **Step 1: Create session-loader.js**

Cut `loadRoutineSession()` (lines 504–589 in original `views.js`) and rewrite with new logic:

```js
// frontend/js/workout/session-loader.js
import { S, REST_DEFAULT } from './state.js';
import * as Session from '../workoutSession.js';
import { getExerciseMeta } from './exercise-meta.js';
import { generateWarmupSets } from './warmup.js';

export function parseRestSecs(restStr) {
  if (!restStr) return REST_DEFAULT;
  const m = String(restStr).match(/^(\d+)/);
  return m ? parseInt(m[1]) : REST_DEFAULT;
}

/**
 * Determine suggested weight and progression badge for an exercise.
 * @returns {{ suggestedKg: number, badge: string|null, hasPreviousSession: boolean }}
 */
function _calcSuggestedWeight(exerciseKey, meta, readinessAdj) {
  const step = meta.equipmentType === 'barbell' || meta.equipmentType === 'cable' ? 2.5 : 1;

  // Get last completed session for this exercise
  const sessions  = Session.getLocalSessions();
  let lastSession = null;
  for (let i = sessions.length - 1; i >= 0; i--) {
    const ex = (sessions[i].exercises || []).find(e => {
      const key = e.name?.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'_');
      return key === exerciseKey;
    });
    if (ex) { lastSession = ex; break; }
  }

  if (!lastSession) {
    // First time: use defaultKg, no readinessAdj on weight
    return { suggestedKg: meta.defaultKg, badge: null, hasPreviousSession: false };
  }

  const workingSets = (lastSession.sets || []).filter(s => !s.isWarmup);
  if (!workingSets.length) {
    return { suggestedKg: meta.defaultKg, badge: null, hasPreviousSession: false };
  }

  const lastKg = workingSets[0]?.weightKg ?? meta.defaultKg;
  const completedCount = workingSets.filter(s => s.completedAt).length;
  const completionRate = completedCount / workingSets.length;

  let suggestedKg, badge;

  if (completionRate === 1) {
    const allMadeReps = workingSets.every(s => s.completedAt && parseInt(s.reps) >= parseInt(s.targetReps ?? s.reps));
    if (allMadeReps) {
      // Full progressive overload: all sets completed with target reps
      suggestedKg = lastKg + step;
      badge = `↑ +${step} kg (progresión)`;
    } else {
      // Completed all sets but missed some reps — maintain
      suggestedKg = lastKg;
      badge = null;
    }
  } else if (completionRate < 0.6) {
    // Less than 60% sets completed — reduce
    suggestedKg = Math.max(meta.barWeight || 0, lastKg - step);
    badge = `↓ −${step} kg`;
  } else {
    // Partial completion — maintain
    suggestedKg = lastKg;
    badge = null;
  }

  // Apply readinessAdj weight reduction ONLY when there's real history
  if (readinessAdj?.weightPct) {
    suggestedKg = Math.round(suggestedKg * readinessAdj.weightPct / 2.5) * 2.5;
  }

  return { suggestedKg, badge, hasPreviousSession: true };
}

export function loadRoutineSession(daySession, readinessAdj = null) {
  const exercises = (daySession.exercises || []).filter(ex => ex.name);

  S.exercises = exercises.map(ex => {
    const key  = ex.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'_');
    const meta = getExerciseMeta(ex.name);
    const numSets = _applySetsDelta(parseInt(ex.sets) || 3, readinessAdj);

    // Determine working weight
    const adjustedKg = ex._adjustedKg;
    let workingKg;
    if (adjustedKg !== undefined && adjustedKg !== null) {
      workingKg = adjustedKg;
    } else {
      const { suggestedKg } = _calcSuggestedWeight(key, meta, readinessAdj);
      workingKg = suggestedKg;
    }

    // Generate warmup sets
    const warmupSets = generateWarmupSets(workingKg, meta.equipmentType, meta.compound, meta.barWeight);

    // Build working sets
    const workingSets = Array.from({ length: numSets }, (_, i) => ({
      setNumber: i + 1,
      weightKg:  workingKg,
      reps:      parseInt(ex.reps) || 8,
      targetReps: parseInt(ex.reps) || 8,
      isWarmup:  false,
      completedAt: null,
    }));

    const { badge } = _calcSuggestedWeight(key, meta, null); // badge without readiness to show original
    return {
      name:        ex.name,
      exerciseKey: key,
      sets:        [...warmupSets, ...workingSets],
      restSecs:    parseRestSecs(ex.rest),
      _progressionBadge: badge,
      _suggestedKg: workingKg,
    };
  });

  S.phase     = 'active';
  S.startedAt = Date.now();

  // Trigger re-render via workoutLogger coordinator
  window.dispatchEvent(new CustomEvent('hs:workout-session-loaded'));
}

function _applySetsDelta(numSets, adj) {
  if (!adj) return numSets;
  if (adj.setsDelta)  return Math.max(2, numSets + adj.setsDelta);
  if (adj.volumePct)  return Math.max(2, Math.round(numSets * adj.volumePct));
  return numSets;
}
```

- [ ] **Step 2: Update workoutLogger.js to listen for session-loaded event**

In `frontend/js/workoutLogger.js`, find where `loadRoutineSession` is currently handled (currently called inside `views.js`). Add a listener:

```js
// In workoutLogger.js init() or at module level:
window.addEventListener('hs:workout-session-loaded', () => {
  renderActive();
});
```

- [ ] **Step 3: Add re-export to views.js**

```js
export { loadRoutineSession, parseRestSecs } from './session-loader.js';
```

- [ ] **Step 4: Verify**

App → Entreno → select IA routine → pick a day → (skip readiness for now) → adjust weights → Start. The active session must:
- Show warmup sets for compound exercises (bench, squat, etc.)
- Show NO warmup sets for isolation exercises (curl, extension, etc.)
- Show correct working weight

- [ ] **Step 5: Commit**

```bash
git add frontend/js/workout/session-loader.js frontend/js/workout/views.js frontend/js/workoutLogger.js
git commit -m "feat(workout): extract session-loader.js with progressive overload + warmup wiring"
```

---

### Task B5: Reduce views.js to orchestrator

**Depends on:** B1, B2, B3, B4  
**Files:**
- Modify: `frontend/js/workout/views.js`

- [ ] **Step 1: Replace views.js content with orchestrator**

After extracting all functions, `views.js` should be a thin re-exporter:

```js
// frontend/js/workout/views.js
// Orchestrator — re-exports all workout views from their dedicated modules.
// This file must stay under 40 lines.
import { S } from './state.js';
import * as Session from '../workoutSession.js';

export { renderIdle }              from './idle.js';
export { renderRoutinePicker }     from './routine-picker.js';
export { renderCustomRoutineBuilder } from './custom-builder.js';
export { renderPreWorkoutAdjust }  from './pre-workout.js';
export { loadRoutineSession, parseRestSecs } from './session-loader.js';

let _onRenderActive = null;
export function registerRenderActive(cb) { _onRenderActive = cb; }

export function searchExercises(query) {
  const db = window.Exercises?.getDB() ?? [];
  const q  = query.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return db.filter(ex => {
    const name = ex.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return name.includes(q);
  }).slice(0, 8);
}
```

- [ ] **Step 2: Verify line count**

```bash
wc -l frontend/js/workout/views.js
# Expected: ≤ 40 lines
```

- [ ] **Step 3: Full smoke test**

Open app. Test:
1. Idle screen renders
2. Route to routine picker
3. Route to custom builder
4. Back navigation works
5. Start a session — active screen loads

- [ ] **Step 4: Commit**

```bash
git add frontend/js/workout/views.js
git commit -m "refactor(workout): reduce views.js to ~30-line orchestrator"
```

---

### Task B6: Extract workoutSets.js from workoutLogger.js

**Depends on:** nothing (can start anytime)  
**Files:**
- Create: `frontend/js/workoutSets.js`
- Modify: `frontend/js/workoutLogger.js`

- [ ] **Step 1: Create workoutSets.js**

Cut these functions from `workoutLogger.js` (lines 301–534) into `workoutSets.js`:
- `_getProgressionHint(ex)` (line 301)
- `_getPrevSet(exerciseKey, setIndex)` (line 322)
- `renderSets(ex)` (line 340)
- All event handlers for weight/reps input, complete-set, delete-set, PR badge inside renderSets

```js
// frontend/js/workoutSets.js
// Renders and manages individual sets within the active workout session.
import * as Session   from './workoutSession.js';
import * as PR        from './workoutPR.js';
import * as ORM       from './oneRepMax.js';
import { S }          from './workout/state.js';
import * as Timer     from './workout/timer.js';

export function renderSets(ex) {
  // --- PASTE the complete renderSets() function body here ---
  // Keep all internal set-completion logic, PR detection, weight/reps handlers
}

export function _getProgressionHint(ex) {
  // --- PASTE _getProgressionHint ---
}

export function _getPrevSet(exerciseKey, setIndex) {
  // --- PASTE _getPrevSet ---
}
```

- [ ] **Step 2: Update workoutLogger.js imports**

In `workoutLogger.js`, replace the three cut functions with an import:

```js
import { renderSets, _getProgressionHint, _getPrevSet } from './workoutSets.js';
```

- [ ] **Step 3: Verify**

Start a workout session. Complete a set — the set must:
- Mark as completed (check mark / green)
- Trigger rest timer
- Show PR badge if new PR detected
- Log to `S.exercises`

- [ ] **Step 4: Commit**

```bash
git add frontend/js/workoutSets.js frontend/js/workoutLogger.js
git commit -m "refactor(workout): extract workoutSets.js from workoutLogger.js"
```

---

### Task B7: Reduce workoutLogger.js to coordinator

**Depends on:** B5, B6  
**Files:**
- Modify: `frontend/js/workoutLogger.js`

- [ ] **Step 1: Verify coordinator size after extractions**

```bash
wc -l frontend/js/workoutLogger.js
# Target: ≤ 220 lines
```

- [ ] **Step 2: Clean up remaining dead code**

After B5 and B6 extractions, remove any empty function bodies, stale comments, or unreachable code. The coordinator must only contain:
- `import` statements
- `init(container)` — attaches root, wires event listeners, registers `renderActive` callback
- `renderActive()` — renders the active session: exercise list + sets via `renderSets`
- `export { init }`

- [ ] **Step 3: Full workflow test**

Complete a full workout cycle: idle → picker → pre-workout → active session → complete sets → finish → summary. No console errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/js/workoutLogger.js
git commit -m "refactor(workout): reduce workoutLogger.js to coordinator (~200 lines)"
```

---

## ══════════════════════════════════════════
## TRACK C — P2–P3: Readiness + SFR + Backend + SW
## ══════════════════════════════════════════

### Task C1: Create readiness-check.js

**Depends on:** nothing (can start immediately)  
**Files:**
- Create: `frontend/js/workout/readiness-check.js`

- [ ] **Step 1: Create the file**

```js
// frontend/js/workout/readiness-check.js
// Pre-session readiness survey. ~20 seconds, 4 questions, skippable.

const NEUTRAL_SCORE = 65;

export function calcReadinessScore({ sleep, food, preworkout, feeling }) {
  let score = 50;
  if (sleep === '8+')  score += 20;
  else if (sleep === '7-8') score += 12;
  else if (sleep === '<6')  score -= 20;

  if (food === '1-2h') score += 15;
  else if (food === '<1h') score += 5;
  else if (food === 'none') score -= 15;

  if (preworkout) score += 10;

  if (feeling === 'top')    score += 25;
  else if (feeling === 'good')   score += 15;
  else if (feeling === 'bad')    score -= 25;

  return Math.max(0, Math.min(100, score));
}

export function getReadinessAdj(score) {
  if (score >= 80) {
    return { setsDelta: null, volumePct: null, weightPct: null,
             message: '🔥 Hoy estás al 100% — dale fuerte', canApply: false };
  }
  if (score >= 60) {
    return { setsDelta: null, volumePct: null, weightPct: null,
             message: '💪 Día normal — sigue el plan', canApply: false };
  }
  if (score >= 40) {
    return { setsDelta: -1, volumePct: null, weightPct: null,
             message: '⚡ Energía justa — te sugiero −1 set en cada ejercicio', canApply: true };
  }
  return { setsDelta: null, volumePct: 0.80, weightPct: 0.95,
           message: '😴 Día flojo — te sugiero −20% volumen y −5% peso', canApply: true };
}

export function renderReadinessCheck(onComplete) {
  const container = document.createElement('div');
  container.className = 'wl-readiness';
  container.innerHTML = `
    <div class="wl-readiness-card">
      <h3 class="wl-readiness-title">Antes de empezar</h3>
      <div class="wl-readiness-q" data-q="sleep">
        <p class="wl-readiness-label">¿Cuánto dormiste anoche?</p>
        <div class="wl-readiness-opts">
          <button data-val="<6">−6h</button>
          <button data-val="6-7">6–7h</button>
          <button data-val="7-8">7–8h</button>
          <button data-val="8+">8h+</button>
        </div>
      </div>
      <div class="wl-readiness-q" data-q="food">
        <p class="wl-readiness-label">¿Has comido antes?</p>
        <div class="wl-readiness-opts">
          <button data-val="none">Nada</button>
          <button data-val="+3h">+3h</button>
          <button data-val="1-2h">1–2h</button>
          <button data-val="<1h">−1h</button>
        </div>
      </div>
      <div class="wl-readiness-q" data-q="preworkout">
        <p class="wl-readiness-label">¿Pre-entreno hoy?</p>
        <div class="wl-readiness-opts">
          <button data-val="false">No</button>
          <button data-val="true">Sí</button>
        </div>
      </div>
      <div class="wl-readiness-q" data-q="feeling">
        <p class="wl-readiness-label">¿Cómo te sientes?</p>
        <div class="wl-readiness-opts">
          <button data-val="bad">Mal</button>
          <button data-val="neutral">Normal</button>
          <button data-val="good">Bien</button>
          <button data-val="top">Top</button>
        </div>
      </div>
      <div class="wl-readiness-suggestion" id="wl-readiness-suggestion" hidden></div>
      <div class="wl-readiness-footer">
        <button class="wl-readiness-skip" id="wl-readiness-skip">Saltar</button>
        <button class="wl-readiness-continue" id="wl-readiness-continue" disabled>
          Continuar →
        </button>
      </div>
    </div>`;

  const answers = { sleep: null, food: null, preworkout: null, feeling: null };

  container.querySelectorAll('.wl-readiness-opts').forEach(group => {
    const q = group.closest('[data-q]').dataset.q;
    group.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        answers[q] = btn.dataset.val === 'true' ? true
                   : btn.dataset.val === 'false' ? false
                   : btn.dataset.val;
        _updateState();
      });
    });
  });

  function _updateState() {
    const allAnswered = Object.values(answers).every(v => v !== null);
    const continueBtn = container.querySelector('#wl-readiness-continue');
    continueBtn.disabled = !allAnswered;

    if (allAnswered) {
      const score = calcReadinessScore(answers);
      const adj   = getReadinessAdj(score);
      const box   = container.querySelector('#wl-readiness-suggestion');
      box.hidden    = false;
      box.innerHTML = `<p>${adj.message}</p>${
        adj.canApply
          ? `<button class="wl-readiness-apply" id="wl-readiness-apply">Aplicar</button>`
          : ''}`;

      let adjApplied = null;
      if (adj.canApply) {
        container.querySelector('#wl-readiness-apply')?.addEventListener('click', function() {
          adjApplied = adj;
          this.textContent = '✓ Aplicado';
          this.disabled = true;
        });
      }

      continueBtn.onclick = () => {
        _finish({ score, adj: adjApplied, raw: { ...answers }, skipped: false });
      };
    }
  }

  container.querySelector('#wl-readiness-skip').addEventListener('click', () => {
    _finish({ score: NEUTRAL_SCORE, adj: null, raw: {}, skipped: true });
  });

  function _finish(result) {
    // Persist in session draft
    try {
      const draft = JSON.parse(localStorage.getItem('hs_session_draft') || '{}');
      draft.readiness = { ...result.raw, score: result.score, skipped: result.skipped, ts: Date.now() };
      localStorage.setItem('hs_session_draft', JSON.stringify(draft));
    } catch (_) {}
    container.remove();
    onComplete(result);
  }

  return container;
}
```

- [ ] **Step 2: Wire readiness into the session flow**

In `frontend/js/workout/routine-picker.js`, when the user selects a day (currently calls `renderPreWorkoutAdjust(daySession)` directly), intercept to insert the readiness check:

```js
import { renderReadinessCheck } from './readiness-check.js';
import { renderPreWorkoutAdjust } from './pre-workout.js';

// Where the day is confirmed, REPLACE the direct call:
// renderPreWorkoutAdjust(daySession);
// WITH:

const checkEl = renderReadinessCheck(({ adj }) => {
  S.root.appendChild(checkEl); // already in DOM at this point, gets removed by _finish
  renderPreWorkoutAdjust(daySession, adj);
});
S.root.innerHTML = '';
S.root.appendChild(checkEl);
```

- [ ] **Step 3: Add CSS for readiness check**

In `frontend/css/main.css`, add at the end:

```css
/* ── Readiness Check ──────────────────────────────── */
.wl-readiness { padding: 16px; }
.wl-readiness-card {
  background: var(--hs-surface);
  border-radius: var(--hs-r-lg);
  padding: 24px;
  display: flex; flex-direction: column; gap: 20px;
}
.wl-readiness-title { font-size: 1rem; font-weight: 600; color: var(--hs-accent); margin: 0; }
.wl-readiness-label { font-size: 0.875rem; color: var(--hs-text-2); margin: 0 0 8px; }
.wl-readiness-opts  { display: flex; gap: 8px; flex-wrap: wrap; }
.wl-readiness-opts button {
  flex: 1; min-width: 56px; padding: 10px 4px;
  background: var(--hs-surface-2); border: 1px solid var(--hs-border, rgba(255,255,255,0.08));
  border-radius: var(--hs-r-md); color: var(--hs-text-2);
  font-size: 0.8rem; cursor: pointer; transition: all 150ms;
}
.wl-readiness-opts button.active {
  background: var(--hs-accent-dim); border-color: var(--hs-accent); color: var(--hs-accent);
  font-weight: 600;
}
.wl-readiness-suggestion {
  background: rgba(196,165,97,0.08); border: 1px solid rgba(196,165,97,0.2);
  border-radius: var(--hs-r-md); padding: 12px 16px; font-size: 0.875rem;
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
}
.wl-readiness-footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.wl-readiness-skip {
  background: transparent; border: none; color: var(--hs-text-3);
  font-size: 0.8rem; cursor: pointer; padding: 8px;
}
.wl-readiness-continue {
  flex: 1; padding: 12px; background: var(--hs-accent); color: #07070f;
  border: none; border-radius: var(--hs-r-md); font-weight: 600; cursor: pointer;
}
.wl-readiness-continue:disabled { opacity: 0.4; cursor: not-allowed; }
.wl-readiness-apply {
  padding: 6px 12px; background: var(--hs-accent); color: #07070f;
  border: none; border-radius: var(--hs-r-sm); font-weight: 600; cursor: pointer; font-size: 0.8rem;
}
```

- [ ] **Step 4: Verify**

App → Entreno → select routine → pick day. Readiness check must appear. Answer 4 questions → suggestion must appear. Skip must bypass to pre-workout. Applying adj must show "✓ Aplicado". Continue must proceed to pre-workout.

- [ ] **Step 5: Commit**

```bash
git add frontend/js/workout/readiness-check.js frontend/js/workout/routine-picker.js frontend/css/main.css
git commit -m "feat(workout): add readiness-check.js pre-session survey"
```

---

### Task C2: Add muscleMap.js entries for new exercises

**Depends on:** A1 (need final exercise names)  
**Files:**
- Modify: `frontend/js/anatomyLens/muscleMap.js`

- [ ] **Step 1: Add entries**

Open `frontend/js/anatomyLens/muscleMap.js`. Find the main mapping object. Add entries for each new exercise. Use normalized keys (lowercase, accents removed, spaces → underscores):

```js
// ESPALDA additions
'remo_t-bar':                     { primary: ['back_upper', 'lats'], secondary: ['biceps', 'rear_delt'] },
'remo_en_maquina_(hammer)':       { primary: ['lats', 'back_upper'], secondary: ['biceps'] },
'meadows_row':                    { primary: ['lats', 'teres_major'], secondary: ['biceps'] },
'remo_pendlay':                   { primary: ['back_upper', 'traps'], secondary: ['biceps', 'lats'] },
'straight_arm_pulldown':          { primary: ['lats'], secondary: ['teres_major'] },
'good_morning_(barra)':           { primary: ['hamstrings', 'back_lower'], secondary: ['glutes'] },

// GLÚTEOS additions
'hip_thrust_(barra)':             { primary: ['glutes'], secondary: ['hamstrings', 'quads'] },
'hip_thrust_(mancuerna)':         { primary: ['glutes'], secondary: ['hamstrings'] },
'hip_thrust_smith_machine':       { primary: ['glutes'], secondary: ['hamstrings'] },
'cable_kickback':                 { primary: ['glutes'], secondary: [] },
'cable_pull-through':             { primary: ['glutes', 'hamstrings'], secondary: ['back_lower'] },
'sumo_deadlift_(barra)':          { primary: ['glutes', 'quads'], secondary: ['hamstrings', 'adductors'] },

// ISQUIOTIBIALES additions
'peso_muerto_1_pierna_(mancuerna)': { primary: ['hamstrings', 'glutes'], secondary: ['back_lower'] },
'curl_femoral_sentado':           { primary: ['hamstrings'], secondary: [] },
'nordic_curl':                    { primary: ['hamstrings'], secondary: ['glutes'] },

// GEMELOS
'elevacion_de_talones_de_pie_(maquina)':    { primary: ['calves_gastrocnemius'], secondary: [] },
'elevacion_de_talones_sentado_(maquina)':   { primary: ['calves_soleus'], secondary: [] },
'donkey_calf_raise':              { primary: ['calves_gastrocnemius'], secondary: [] },

// CORE additions
'ab_wheel_de_pie':                { primary: ['core_rectus', 'core_obliques'], secondary: ['lats'] },
'pallof_press_(cable)':           { primary: ['core_obliques'], secondary: ['core_rectus'] },
'cable_woodchop_(alto_a_bajo)':   { primary: ['core_obliques'], secondary: ['shoulders'] },
'dragon_flag':                    { primary: ['core_rectus'], secondary: ['hip_flexors'] },
'hollow_body_hold':               { primary: ['core_rectus'], secondary: ['hip_flexors'] },
'copenhagen_plank':               { primary: ['adductors', 'core_obliques'], secondary: [] },
'hanging_leg_raise':              { primary: ['core_rectus', 'hip_flexors'], secondary: [] },
'toes_to_bar':                    { primary: ['core_rectus', 'hip_flexors'], secondary: ['lats'] },
```

Continue adding entries for all remaining new exercises following the same pattern. Use the muscle group names already present in the file (grep for existing keys to find the exact strings used: `back_upper`, `lats`, `glutes`, etc.).

- [ ] **Step 2: Commit**

```bash
git add frontend/js/anatomyLens/muscleMap.js
git commit -m "feat(anatomyLens): add muscleMap entries for new exercises"
```

---

### Task C3: Update SFR badge → Eficiente / Exigente

**Depends on:** nothing (can start immediately)  
**Files:**
- Modify: `frontend/js/routineGenerator.js`

- [ ] **Step 1: Find the SFR badge rendering code**

Search in `routineGenerator.js` for `SFR` or `sfr` in the HTML template strings (the place where exercise cards are rendered in the routine display):

```bash
grep -n "SFR\|sfr" frontend/js/routineGenerator.js
```

- [ ] **Step 2: Update the badge rendering**

Find the line rendering the SFR badge and replace:

```js
// BEFORE (typical pattern):
${ex.sfr === 'high' ? '<span class="wl-sfr-badge">SFR</span>' : ''}

// AFTER:
${ex.sfr === 'high'
  ? '<span class="wl-sfr-badge wl-sfr-high" title="Máximo estímulo muscular con mínima fatiga — el ejercicio más inteligente del grupo">★ Eficiente</span>'
  : ex.sfr === 'low'
  ? '<span class="wl-sfr-badge wl-sfr-low" title="Muy exigente para el sistema nervioso — ponlo siempre al inicio de la sesión">⚠ Exigente</span>'
  : ''}
```

- [ ] **Step 3: Add CSS for new badges**

In `frontend/css/main.css`, find the existing `.wl-sfr-badge` rule and update:

```css
.wl-sfr-badge       { font-size: 0.7rem; padding: 2px 7px; border-radius: 99px; font-weight: 600; }
.wl-sfr-badge.wl-sfr-high {
  background: rgba(196,165,97,0.15); color: var(--hs-accent); border: 1px solid rgba(196,165,97,0.3);
}
.wl-sfr-badge.wl-sfr-low {
  background: rgba(251,146,60,0.12); color: #fb923c; border: 1px solid rgba(251,146,60,0.25);
}
```

- [ ] **Step 4: Verify**

App → Entreno → generate IA routine. High-SFR exercises (cable flyes, machine rows, etc.) must show "★ Eficiente". Low-SFR exercises (deadlift, back squat) must show "⚠ Exigente". Medium SFR shows nothing. Hover on badge shows tooltip.

- [ ] **Step 5: Commit**

```bash
git add frontend/js/routineGenerator.js frontend/css/main.css
git commit -m "feat(routineGenerator): replace SFR badge with Eficiente/Exigente labels"
```

---

### Task C4: Backend payload + SW bump + final wiring

**Depends on:** C1 (readiness data), B4 (session-loader saves readiness), A1-A3 (new modules)  
**Files:**
- Modify: `backend/app/modules/workout_sessions/post_workout_service.py`
- Modify: `frontend/js/workout/summary.js`
- Modify: `frontend/sw.js`

- [ ] **Step 1: Add readiness fields to backend post-workout payload**

Open `backend/app/modules/workout_sessions/post_workout_service.py`. Find `generate_post_workout_coaching()` and the prompt building section. Add the 3 RGPD-safe fields:

In the schema (likely in `schemas.py` or inline in the service):
```python
# In PostWorkoutCoachRequest schema:
readiness_score: Optional[int] = None       # 0-100
sleep_hours_bucket: Optional[str] = None   # '<6' | '6-7' | '7-8' | '8+'
pre_workout: Optional[bool] = None
```

In the prompt builder inside `generate_post_workout_coaching()`:
```python
# Add after existing workout metrics:
if request.readiness_score is not None:
    readiness_text = (
        f"Estado pre-entreno: score {request.readiness_score}/100"
        f"{f', sueño {request.sleep_hours_bucket}h' if request.sleep_hours_bucket else ''}"
        f"{', tomó pre-entreno' if request.pre_workout else ''}"
    )
    prompt_parts.append(readiness_text)
```

- [ ] **Step 2: Update frontend summary.js to include readiness in API call**

In `frontend/js/workout/summary.js`, find the `POST /api/v1/workout/post-workout-coach` call and add the readiness fields from localStorage:

```js
// In the payload construction:
const draft = JSON.parse(localStorage.getItem('hs_session_draft') || '{}');
const readiness = draft.readiness ?? {};

const payload = {
  // ... existing fields ...
  readiness_score:    readiness.score     ?? null,
  sleep_hours_bucket: readiness.sleep     ?? null,
  pre_workout:        readiness.preworkout ?? null,
};
```

- [ ] **Step 3: Bump SW to v98 and add new module paths**

In `frontend/sw.js`:

```js
// Line 7:
const CACHE_NAME = 'healthstack-v98';

// Add to STATIC_ASSETS array:
'/js/workout/exercise-meta.js',
'/js/workout/warmup.js',
'/js/workout/readiness-check.js',
'/js/workout/session-loader.js',
'/js/workout/pre-workout.js',
'/js/workout/routine-picker.js',
'/js/workout/custom-builder.js',
'/js/workout/idle.js',
'/js/workoutSets.js',
```

- [ ] **Step 4: Verify backend receives readiness fields**

Run the backend smoke test for the post-workout-coach endpoint:

```bash
# On the Pi:
docker exec healthstack_backend python -m pytest tests/integration/test_post_workout_coach.py -v
```

Expected: all 10 existing tests pass. The new fields are optional so no tests should break.

- [ ] **Step 5: Full end-to-end test**

1. Start a workout
2. Complete readiness check (answer all 4 questions)
3. Complete the workout
4. On the summary screen, verify the AI coach card appears
5. Check backend logs: `docker exec healthstack_backend python -c "import logging; ..."` or watch Sentry — the prompt must include the readiness score line without any PII

- [ ] **Step 6: Commit**

```bash
git add frontend/sw.js frontend/js/workout/summary.js
git add backend/app/modules/workout_sessions/post_workout_service.py
git add backend/app/modules/workout_sessions/schemas.py  # if schema is separate
git commit -m "feat(workout): readiness payload to AI coach + SW v98"
```

---

## Self-Review Against Spec

**Criteria coverage check:**

| Criterion | Implemented by |
|-----------|----------------|
| 1. All exercises load with sets pre-filled | B4 session-loader.js |
| 2. Compound + workingKg > 0 → warmup | A3 warmup.js + B4 |
| 3. Isolation → no warmup | A3 warmup.js (compound=false → []) |
| 4. Pre-workout shows correct unit label | B3 pre-workout.js + A2 getWeightLabel |
| 5. SFR badge → Eficiente/Exigente | C3 |
| 6. Exercise names NOT editable | enforced by removing rename UI (never added) |
| 7. Readiness check with Skip button | C1 renderReadinessCheck() |
| 8. readinessAdj applied correctly | B4 session-loader.js + C1 |
| 9. Readiness data to post-workout coach | C4 |
| 10. Custom exercise fallback | A2 getExerciseMeta fallback |
| 11. views.js < 40 lines | B5 |
| 12. routineGenerator imports exercises.js | A4 |
| 13. New exercises in muscleMap.js | C2 |
| 14. Progressive overload definition | B4 _calcSuggestedWeight |

**All 14 criteria covered.**
