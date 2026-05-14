# AnatomyLens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat SVG muscle viewer in the Exercises section with a professional 3D anatomical viewer that auto-animates camera to the optimal viewing angle when a user selects an exercise, with transparent SVG fallback on any failure.

**Architecture:** Self-contained module at `frontend/js/anatomyLens/` (10 files). exercises.js loads it via dynamic `import()` — no conversion to ES module needed. Three.js reuses the existing importmap CDN. SVG stays in DOM and activates automatically on WebGL failure. Legend renders into the existing `#anatomy-legend` div.

**Tech Stack:** Three.js 0.158.0 (importmap CDN already in index.html), GLTFLoader + DRACOLoader (same CDN), vanilla JS ES modules, no build step.

---

## ⚠️ Prerequisite — Task 0 blocks Task 6

Task 0 (sourcing the GLB model) must be complete before Task 6 (model.js) can be implemented. All other tasks can proceed without the GLB.

---

## File Map

### New files created in this plan
| File | Responsibility |
|------|---------------|
| `frontend/js/anatomyLens/state.js` | State machine — single source of truth for lifecycle |
| `frontend/js/anatomyLens/muscleMap.js` | Pure data: exercise ID → meshes + camera angle. DB_TO_MESH bridge. |
| `frontend/js/anatomyLens/scene.js` | Three.js renderer, scene, lights, platform, render loop, FPS monitor |
| `frontend/js/anatomyLens/model.js` | GLB loader, mesh registry, base material cloning |
| `frontend/js/anatomyLens/camera.js` | 15 camera angle presets + 800ms lerp tween |
| `frontend/js/anatomyLens/highlighter.js` | Emissive material animation — pulsing primary, steady secondary |
| `frontend/js/anatomyLens/legend.js` | DOM legend component with fade-in after camera arrives |
| `frontend/js/anatomyLens/fallback.js` | Toggle SVG ↔ canvas visibility |
| `frontend/js/anatomyLens/errorBoundary.js` | Catch errors, route to recover or fallback |
| `frontend/js/anatomyLens/index.js` | Public API: init(), highlight(), reset(), destroy() |
| `frontend/css/anatomy-lens.css` | Styles — prefix `al-` where main.css collides |

### Files modified
| File | Change summary |
|------|---------------|
| `frontend/index.html` | Add `.anatomy-lens-container` div, add `anatomy-svg-hidden-by-default` class, link CSS |
| `frontend/js/exercises.js` | Dynamic import, async selectExercise, AnatomyLens.highlight() + SVG fallback |

---

## Task 0: Source and prepare the anatomical GLB model

**MANUAL — Ruben must complete this before Task 6.**

**Files:**
- Create: `frontend/models/anatomy_lens.glb`

- [ ] **Step 1: Find a suitable base model**

  Options (in order of preference):
  1. **Sketchfab** — search `"low poly human anatomy muscles"` → filter by CC-BY license → look for models where muscles are separate objects (not merged into one mesh)
  2. **Blend Swap** (blendswap.com) — search `"muscle anatomy"` → download .blend file
  3. **Commission on Fiverr** — search `"3D muscle anatomy blender"` → request model with separated muscle meshes named per convention → budget ~$30–50

  The model must have:
  - Individual mesh per muscle group (not one fused body)
  - ~5k–15k total polygons (low-poly, stylized is fine)
  - ~1.8m height in Blender units
  - Y-up, origin at feet

- [ ] **Step 2: Open in Blender and separate/rename meshes**

  For each muscle region, select the mesh and rename it in the Outliner panel to match the convention:
  ```
  mesh_pectoral_mayor_esternal        (no _l/_r — AnatomyLens auto-mirrors)
  mesh_pectoral_mayor_clavicular
  mesh_deltoides_anterior
  mesh_deltoides_medial
  mesh_deltoides_posterior
  mesh_biceps_cabeza_larga
  mesh_biceps_cabeza_corta
  mesh_braquial
  mesh_braquiorradial
  mesh_triceps_cabeza_larga
  mesh_triceps_cabeza_lateral
  mesh_triceps_cabeza_medial
  mesh_dorsal_ancho
  mesh_trapecio_superior
  mesh_trapecio_medio
  mesh_romboides_mayor
  mesh_erector_espinal
  mesh_recto_abdominal
  mesh_oblicuo_externo
  mesh_transverso_abdominal
  mesh_gluteo_mayor
  mesh_gluteo_medio
  mesh_recto_femoral
  mesh_vasto_lateral
  mesh_vasto_medial
  mesh_biceps_femoral
  mesh_semitendinoso
  mesh_gastrocnemio_medial
  mesh_gastrocnemio_lateral
  mesh_soleo
  ```
  Any unlisted muscles: name them `mesh_[name]` — AnatomyLens will skip gracefully if not in muscleMap.

- [ ] **Step 3: Apply a uniform base material**

  Select all meshes → assign single material: `MeshStandardMaterial` color `#1a1a2e`. This gets overridden at runtime by the highlighter.

- [ ] **Step 4: Export as GLB with DRACO**

  File → Export → glTF 2.0 (.glb):
  - ✅ Compression: DRACO
  - ✅ Include: Selected Objects (or All)
  - ❌ Animations: off
  - Target file size: < 4MB

- [ ] **Step 5: Place file**

  ```
  cp anatomy_lens.glb "C:\Users\Ruben\Desktop\Health Stack\frontend\models\anatomy_lens.glb"
  ```

- [ ] **Step 6: Quick sanity check**

  Open `https://gltf-viewer.donmccurdy.com/`, drag the GLB in.
  Verify: muscles visible as separate selectable objects, Y-up, no giant scale issue.

---

## Task 1: CSS — anatomy-lens.css

**Files:**
- Create: `frontend/css/anatomy-lens.css`

- [ ] **Step 1: Create the file**

  ```css
  /* anatomy-lens.css
   * Prefijo al- en clases que colisionan con main.css (.legend-dot ya existe)
   * Variables heredadas de main.css: --radius, --radius-lg, --bg-surface, etc.
   */

  /* ── Contenedor principal del canvas 3D ── */
  .anatomy-lens-container {
    position: relative;
    width: 100%;
    aspect-ratio: 9 / 16;
    max-height: 480px;
    background: var(--bg-surface, #07070f);
    border-radius: var(--radius-lg, 16px);
    overflow: hidden;
    margin-bottom: 12px;
  }

  /* SVG original: oculto cuando el 3D está activo, visible en fallback */
  .anatomy-svg-hidden-by-default {
    display: none;
  }
  .anatomy-svg-hidden-by-default.al-fallback-active {
    display: block;
  }

  /* ── Canvas Three.js ── */
  .anatomy-lens-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  /* ── Loading state: shimmer + progreso ── */
  .anatomy-lens-loading {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: var(--bg-surface, #07070f);
    transition: opacity 0.4s ease;
  }

  .anatomy-lens-loading.al-hidden {
    opacity: 0;
    pointer-events: none;
  }

  .anatomy-lens-loading-text {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    letter-spacing: 0.05em;
  }

  .anatomy-lens-progress {
    width: 120px;
    height: 2px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 1px;
    overflow: hidden;
  }

  .anatomy-lens-progress-bar {
    height: 100%;
    width: 0%;
    background: #6c63ff;
    transition: width 0.3s ease;
  }

  /* ── Leyenda 3D (prefijo al- para no colisionar con .legend-dot de main.css) ── */
  .anatomy-legend-3d {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 0;
    opacity: 0;
    transition: opacity 0.4s ease;
  }

  .anatomy-legend-3d.al-visible {
    opacity: 1;
  }

  .al-legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 4px;
    flex-shrink: 0;
  }

  .al-legend-dot.primary {
    background: #6c63ff;
    box-shadow: 0 0 6px #6c63ff;
  }

  .al-legend-dot.secondary {
    background: #00d2ff;
  }

  .al-legend-group {
    display: flex;
    align-items: center;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
  }
  ```

- [ ] **Step 2: Verify no existing anatomy-lens.css**

  ```bash
  ls frontend/css/
  ```
  Expected: no `anatomy-lens.css` — this is a new file.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/css/anatomy-lens.css
  git commit -m "feat(anatomylens): add CSS — al- prefix, no collision with main.css"
  ```

---

## Task 2: HTML structure changes

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Find the anatomy panel in index.html**

  ```bash
  grep -n "anatomy-svg-wrap\|anatomy-panel\|anatomy-hint" frontend/index.html | head -20
  ```

- [ ] **Step 2: Add the CSS link**

  Find the line with `<link rel="stylesheet" href="css/main.css">` (or similar) and add after it:

  ```html
  <link rel="stylesheet" href="css/anatomy-lens.css">
  ```

- [ ] **Step 3: Add the 3D container and update SVG wrapper class**

  Find the anatomy panel content. It currently looks like:
  ```html
  <div id="anatomy-svg-wrap">...</div>
  <div id="anatomy-legend"></div>
  ```

  Replace with:
  ```html
  <!-- AnatomyLens 3D container — canvas mounted here by index.js -->
  <div class="anatomy-lens-container">
    <!-- Three.js canvas injected here -->
  </div>

  <!-- SVG 2D fallback — hidden by default, shown if WebGL fails -->
  <div id="anatomy-svg-wrap" class="anatomy-svg-hidden-by-default">
    <!-- existing SVG content stays exactly as-is -->
  </div>
  <div id="anatomy-legend"></div>
  ```

  **Important:** Keep every character inside `#anatomy-svg-wrap` exactly as before. Only change the outer div's class.

- [ ] **Step 4: Verify the existing anatomy-hint element stays**

  ```bash
  grep -n "anatomy-hint" frontend/index.html
  ```
  The `#anatomy-hint` element should remain unchanged — exercises.js already hides it on selection.

- [ ] **Step 5: Open the exercises page in browser**

  Verify visually:
  - The `.anatomy-lens-container` div is visible (empty, dark background)
  - The SVG is NOT visible (display: none)
  - No console errors

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/index.html
  git commit -m "feat(anatomylens): add 3D container to anatomy panel, preserve SVG fallback"
  ```

---

## Task 3: state.js — lifecycle state machine

**Files:**
- Create: `frontend/js/anatomyLens/state.js`

- [ ] **Step 1: Create the directory**

  ```bash
  mkdir -p frontend/js/anatomyLens
  ```

- [ ] **Step 2: Write the file**

  ```javascript
  // frontend/js/anatomyLens/state.js
  // Pure state machine — no DOM, no Three.js, no side effects.

  export const STATES = Object.freeze({
    UNINITIALIZED:       'UNINITIALIZED',
    LOADING:             'LOADING',
    READY:               'READY',
    TRANSITIONING_CAMERA:'TRANSITIONING_CAMERA',
    HIGHLIGHTING:        'HIGHLIGHTING',
    SVG_FALLBACK:        'SVG_FALLBACK',  // terminal
  });

  // Valid transitions: state → allowed next states
  const TRANSITIONS = {
    [STATES.UNINITIALIZED]:        [STATES.LOADING],
    [STATES.LOADING]:              [STATES.READY, STATES.SVG_FALLBACK],
    [STATES.READY]:                [STATES.TRANSITIONING_CAMERA, STATES.SVG_FALLBACK],
    [STATES.TRANSITIONING_CAMERA]: [STATES.HIGHLIGHTING, STATES.TRANSITIONING_CAMERA, STATES.SVG_FALLBACK],
    [STATES.HIGHLIGHTING]:         [STATES.TRANSITIONING_CAMERA, STATES.READY, STATES.SVG_FALLBACK],
    [STATES.SVG_FALLBACK]:         [],
  };

  let _current = STATES.UNINITIALIZED;

  /** Return current state string */
  export function getState() {
    return _current;
  }

  /**
   * Attempt a state transition.
   * Returns true if successful, false if transition is invalid (logs warning).
   */
  export function transition(next) {
    const allowed = TRANSITIONS[_current] ?? [];
    if (!allowed.includes(next)) {
      console.warn(`[AnatomyLens/state] Invalid transition: ${_current} → ${next}`);
      return false;
    }
    _current = next;
    return true;
  }

  /** Reset to initial state (for destroy + re-init cycles) */
  export function resetState() {
    _current = STATES.UNINITIALIZED;
  }

  /** Returns true if the viewer is in a state where highlight() can proceed */
  export function canHighlight() {
    return _current === STATES.READY || _current === STATES.HIGHLIGHTING || _current === STATES.TRANSITIONING_CAMERA;
  }

  /** Returns true if the viewer is fully operational (not loading, not fallback) */
  export function is3DActive() {
    return _current !== STATES.UNINITIALIZED && _current !== STATES.SVG_FALLBACK;
  }
  ```

- [ ] **Step 3: Verify with browser console test**

  Open the HTML page in browser, open DevTools console, run:
  ```javascript
  const { getState, transition, resetState, STATES } = await import('/js/anatomyLens/state.js');
  console.assert(getState() === 'UNINITIALIZED', 'initial state');
  console.assert(transition('LOADING') === true, 'UNINITIALIZED → LOADING ok');
  console.assert(getState() === 'LOADING', 'now LOADING');
  console.assert(transition('UNINITIALIZED') === false, 'invalid transition');
  console.assert(getState() === 'LOADING', 'state unchanged after invalid');
  console.assert(transition('SVG_FALLBACK') === true, 'LOADING → SVG_FALLBACK ok');
  console.assert(transition('READY') === false, 'SVG_FALLBACK is terminal');
  resetState();
  console.assert(getState() === 'UNINITIALIZED', 'reset works');
  console.log('✅ state.js all assertions passed');
  ```
  Expected: `✅ state.js all assertions passed` with no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/js/anatomyLens/state.js
  git commit -m "feat(anatomylens): state machine — 6 states, validated transitions"
  ```

---

## Task 4: muscleMap.js — exercise data

**Files:**
- Create: `frontend/js/anatomyLens/muscleMap.js`

- [ ] **Step 1: Write the file**

  This file is pure data + one resolver function. Names in `primary[]` and `secondary[]` match GLB mesh names WITHOUT the `mesh_` prefix and WITHOUT `_l`/`_r` suffixes — the highlighter adds those automatically.

  ```javascript
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
    21: null,  // plancha lateral — no muscleMap entry, uses DB_TO_MESH fallback
    22: 'ab_wheel',
    23: 'sentadilla',
    24: 'prensa_piernas',
    25: 'extension_cuadriceps',
    26: 'curl_femoral_tumbado',
    27: 'sentadilla_bulgara',
    28: 'hip_thrust',
    29: 'kickback_cable',
    30: null,  // puente glúteos — uses DB_TO_MESH fallback
    31: 'burpees',
    32: null,  // jump rope — uses DB_TO_MESH fallback
    33: null,  // remo máquina — uses DB_TO_MESH fallback
  };

  // ── Muscle Map: exercise key → { primary[], secondary[], camera } ───────────
  // primary: muscle meshes that pulse purple
  // secondary: muscle meshes that glow cyan steady
  // camera: key from CAMERA_ANGLES in camera.js
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
  ```

- [ ] **Step 2: Console verification**

  In browser DevTools:
  ```javascript
  const { resolveExercise, EXERCISE_ID_MAP, MUSCLE_MAP } = await import('/js/anatomyLens/muscleMap.js');

  // Test known exercise by numeric ID
  const r1 = resolveExercise(1, ['pecho_mayor', 'triceps', 'deltoides_ant']);
  console.assert(r1.camera === 'FRONT_UPPER', 'press banca camera');
  console.assert(r1.primary.includes('pectoral_mayor_esternal'), 'primary mesh');

  // Test unknown exercise — DB fallback
  const r2 = resolveExercise(21, ['oblicuos', 'cuadrado_lumbar']);
  console.assert(r2.primary.includes('oblicuo_externo'), 'DB_TO_MESH bridge');
  console.assert(r2.camera === 'FULL', 'fallback camera');

  // Test cuerpo_completo
  const r3 = resolveExercise(31, ['cuerpo_completo']);
  console.assert(r3.primary.length > 0, 'cuerpo_completo resolves');

  console.log('✅ muscleMap.js all assertions passed');
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/js/anatomyLens/muscleMap.js
  git commit -m "feat(anatomylens): muscleMap — 33 exercises, DB_TO_MESH bridge, resolveExercise()"
  ```

---

## Task 5: scene.js — Three.js renderer and render loop

**Files:**
- Create: `frontend/js/anatomyLens/scene.js`

- [ ] **Step 1: Write the file**

  ```javascript
  // frontend/js/anatomyLens/scene.js
  // Three.js: renderer, scene, camera, lights, platform, render loop, FPS monitor.
  // Lighting matches athleteViewer.js for visual consistency.

  import * as THREE from 'three';

  let renderer, scene, camera, rafId;
  let _container = null;
  const _updateCallbacks = [];
  let _onFPSCritical = null;

  // FPS monitor state
  let _frameCount = 0;
  let _lastFPSCheck = 0;
  let _lowFPSTimer = 0;
  const FPS_THRESHOLD = 20;
  const FPS_WINDOW_MS = 1000;
  const LOW_FPS_GRACE_MS = 3000;

  /**
   * Initialize Three.js scene inside containerElement.
   * @param {HTMLElement} container
   * @param {Function} onFPSCritical - called when FPS stays below 20 for 3s
   * @returns {HTMLCanvasElement} the canvas element
   */
  export function initScene(container, onFPSCritical = null) {
    _container = container;
    _onFPSCritical = onFPSCritical;

    // ── Renderer ─────────────────────────────────────────────────
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.domElement.className = 'anatomy-lens-canvas';
    container.appendChild(renderer.domElement);

    // ── Scene ────────────────────────────────────────────────────
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07070f);
    scene.fog = new THREE.Fog(0x07070f, 8, 22);

    // ── Camera ───────────────────────────────────────────────────
    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 50);
    camera.position.set(0, 1.8, 5.5);  // FULL default
    camera.lookAt(0, 1.2, 0);

    // ── Lights (same palette as athleteViewer.js) ────────────────
    // Key light — dramatic orange from upper-right
    const keyLight = new THREE.SpotLight(0xff6a00, 22);
    keyLight.position.set(3.0, 6.5, 3.8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 15;
    scene.add(keyLight);

    // Rim light — cyan from rear-left
    const rimLight = new THREE.SpotLight(0x00cfff, 16);
    rimLight.position.set(-3.5, 5.5, -3.0);
    scene.add(rimLight);

    // Fill — dark blue to preserve volume
    const fillLight = new THREE.DirectionalLight(0x112244, 3.5);
    fillLight.position.set(0, 3, -2);
    scene.add(fillLight);

    // Kick — purple from below
    const kickLight = new THREE.PointLight(0x7766ff, 6);
    kickLight.position.set(0, -0.5, 1.5);
    scene.add(kickLight);

    // Ambient — minimal, let dramatic lights do the work
    scene.add(new THREE.AmbientLight(0x111122, 0.8));

    // ── Platform ─────────────────────────────────────────────────
    const discGeo = new THREE.CylinderGeometry(1.4, 1.4, 0.06, 64);
    const discMat = new THREE.MeshStandardMaterial({ color: 0x151520, roughness: 0.4, metalness: 0.7 });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.y = -0.03;
    disc.receiveShadow = true;
    scene.add(disc);

    const ringGeo = new THREE.TorusGeometry(1.38, 0.02, 8, 64);
    scene.add(Object.assign(new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0xff6a00, emissive: 0xff6a00, emissiveIntensity: 1.2, roughness: 0.3 })), { position: { x:0, y:0, z:0 } }));
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.015, 8, 64), new THREE.MeshStandardMaterial({ color: 0x00cfff, emissive: 0x00cfff, emissiveIntensity: 0.8, roughness: 0.3 }));
    scene.add(ring2);

    // ── Resize observer ──────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      if (!_container) return;
      renderer.setSize(_container.clientWidth, _container.clientHeight);
      camera.aspect = _container.clientWidth / _container.clientHeight;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    // ── Handle context lost ───────────────────────────────────────
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('[AnatomyLens] WebGL context lost');
      stopLoop();
    });

    return renderer.domElement;
  }

  /** Register a per-frame update callback */
  export function registerUpdate(fn) {
    _updateCallbacks.push(fn);
  }

  /** Remove a previously registered update callback */
  export function unregisterUpdate(fn) {
    const idx = _updateCallbacks.indexOf(fn);
    if (idx !== -1) _updateCallbacks.splice(idx, 1);
  }

  /** Start the render loop */
  export function startLoop() {
    if (rafId != null) return;
    _lastFPSCheck = performance.now();
    _frameCount = 0;
    _lowFPSTimer = 0;
    loop();
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    const now = performance.now();

    // FPS monitor
    _frameCount++;
    const elapsed = now - _lastFPSCheck;
    if (elapsed >= FPS_WINDOW_MS) {
      const fps = (_frameCount / elapsed) * 1000;
      _frameCount = 0;
      _lastFPSCheck = now;
      if (fps < FPS_THRESHOLD) {
        _lowFPSTimer += elapsed;
        if (_lowFPSTimer >= LOW_FPS_GRACE_MS) {
          if (renderer.getPixelRatio() > 0.75) {
            // First attempt: reduce pixel ratio
            renderer.setPixelRatio(0.75);
            _lowFPSTimer = 0;
            console.warn('[AnatomyLens] FPS low — reducing pixel ratio to 0.75');
          } else {
            // Still bad: trigger fallback
            _onFPSCritical?.();
          }
        }
      } else {
        _lowFPSTimer = 0;
      }
    }

    _updateCallbacks.forEach(fn => fn(now));
    if (scene && camera) renderer.render(scene, camera);
  }

  /** Stop the render loop */
  export function stopLoop() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  /** Expose camera for camera.js tweening */
  export function getCamera() { return camera; }

  /** Expose scene for model.js to add objects */
  export function getScene() { return scene; }

  /** Expose renderer for pixel ratio manipulation */
  export function getRenderer() { return renderer; }

  /** Release all GPU resources */
  export function disposeScene() {
    stopLoop();
    _updateCallbacks.length = 0;
    if (renderer) {
      renderer.dispose();
      renderer.domElement.remove();
      renderer = null;
    }
    scene = null;
    camera = null;
    _container = null;
  }
  ```

- [ ] **Step 2: Verify**

  Open the page in browser, open DevTools, run:
  ```javascript
  const scene = await import('/js/anatomyLens/scene.js');
  const container = document.querySelector('.anatomy-lens-container');
  const canvas = scene.initScene(container, () => console.log('FPS critical'));
  scene.startLoop();
  console.assert(canvas instanceof HTMLCanvasElement, 'canvas created');
  console.assert(document.querySelector('.anatomy-lens-canvas') !== null, 'canvas in DOM');
  console.log('✅ scene.js — dark 3D canvas visible, orange/cyan rings on platform');
  ```
  Visually confirm: dark canvas appears in the anatomy panel with platform + lights.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/js/anatomyLens/scene.js
  git commit -m "feat(anatomylens): scene.js — renderer, lights, platform, FPS monitor"
  ```

---

## Task 6: model.js — GLB loader and mesh registry

**⚠️ Requires Task 0 (GLB file at `frontend/models/anatomy_lens.glb`) to be complete.**

**Files:**
- Create: `frontend/js/anatomyLens/model.js`

- [ ] **Step 1: Write the file**

  ```javascript
  // frontend/js/anatomyLens/model.js
  // Loads anatomy_lens.glb, builds mesh registry, clones base material per mesh.

  import * as THREE from 'three';
  import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
  import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
  import { getScene } from './scene.js';

  const MODEL_URL = '/models/anatomy_lens.glb';
  const LOAD_TIMEOUT_MS = 10_000;

  // Base material shared reference — cloned per mesh for independent highlighting
  const BASE_MATERIAL = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x1a1a2e),
    roughness: 0.65,
    metalness: 0.08,
  });

  /** Map<string, THREE.Mesh[]> — meshName → all meshes with that name (both sides) */
  let _registry = new Map();
  let _modelRoot = null;

  /**
   * Load the GLB and populate the mesh registry.
   * @param {Function} onProgress - called with (percent: number)
   * @returns {Promise<void>}
   */
  export async function loadModel(onProgress) {
    return new Promise((resolve, reject) => {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/libs/draco/');

      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);

      // Timeout guard
      const timeoutId = setTimeout(() => {
        reject(new Error(`GLB load timeout after ${LOAD_TIMEOUT_MS}ms`));
      }, LOAD_TIMEOUT_MS);

      loader.load(
        MODEL_URL,
        (gltf) => {
          clearTimeout(timeoutId);
          _modelRoot = gltf.scene;
          _registry = new Map();

          gltf.scene.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh)) return;
            obj.castShadow = true;
            obj.receiveShadow = true;

            // Clone base material so each mesh can highlight independently
            obj.material = BASE_MATERIAL.clone();

            // Parse name: "mesh_pectoral_mayor_esternal" → key "pectoral_mayor_esternal"
            const rawName = obj.name ?? '';
            const key = rawName.replace(/^mesh_/, '').replace(/_[lr]$/, '');
            if (!key) return;

            if (!_registry.has(key)) _registry.set(key, []);
            _registry.get(key).push(obj);
          });

          getScene().add(gltf.scene);
          console.log(`[AnatomyLens] model loaded — ${_registry.size} muscle groups registered`);
          resolve();
        },
        (xhr) => {
          if (xhr.total > 0) {
            onProgress?.(Math.round((xhr.loaded / xhr.total) * 100));
          }
        },
        (err) => {
          clearTimeout(timeoutId);
          reject(err);
        }
      );
    });
  }

  /**
   * Get all mesh objects for a muscle name.
   * Tries exact match, then with _l and _r suffixes.
   * Returns empty array if not found (caller skips gracefully).
   * @param {string} muscleName - e.g. "pectoral_mayor_esternal"
   * @returns {THREE.Mesh[]}
   */
  export function getMeshes(muscleName) {
    if (_registry.has(muscleName)) return _registry.get(muscleName);
    // Try both sides
    const result = [
      ...(_registry.get(`${muscleName}_l`) ?? []),
      ...(_registry.get(`${muscleName}_r`) ?? []),
    ];
    if (result.length === 0) {
      console.warn(`[AnatomyLens] mesh not found: ${muscleName}`);
    }
    return result;
  }

  /** Get the entire registry (for debug API) */
  export function getRegistry() { return _registry; }

  /** Reset all mesh materials to base (no highlights) */
  export function resetAllMaterials() {
    _registry.forEach((meshes) => {
      meshes.forEach((mesh) => {
        mesh.material.emissive.set(0x000000);
        mesh.material.emissiveIntensity = 0;
      });
    });
  }

  /** Remove model from scene and clear registry */
  export function disposeModel() {
    if (_modelRoot) {
      getScene()?.remove(_modelRoot);
      _modelRoot.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          obj.material.dispose();
        }
      });
      _modelRoot = null;
    }
    _registry.clear();
  }
  ```

- [ ] **Step 2: Smoke-test in browser (requires GLB from Task 0)**

  ```javascript
  // In DevTools console — after scene.js is initialized:
  const scene = await import('/js/anatomyLens/scene.js');
  const model = await import('/js/anatomyLens/model.js');

  const container = document.querySelector('.anatomy-lens-container');
  scene.initScene(container);
  scene.startLoop();

  await model.loadModel(p => console.log('progress:', p + '%'));
  console.log('registry size:', model.getRegistry().size);
  console.assert(model.getRegistry().size > 0, 'meshes registered');
  const pec = model.getMeshes('pectoral_mayor_esternal');
  console.log('pectoral_mayor_esternal meshes:', pec.length);
  console.log('✅ model.js — anatomical figure visible in scene');
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/js/anatomyLens/model.js
  git commit -m "feat(anatomylens): model.js — GLTFLoader, DRACO, mesh registry, 10s timeout"
  ```

---

## Task 7: camera.js — angle presets and 800ms tween

**Files:**
- Create: `frontend/js/anatomyLens/camera.js`

- [ ] **Step 1: Write the file**

  ```javascript
  // frontend/js/anatomyLens/camera.js
  // Camera angle database + smooth lerp tween.
  // Uses Three.js Vector3.lerpVectors — no external animation library.

  import * as THREE from 'three';
  import { getCamera } from './scene.js';

  const TWEEN_DURATION_MS = 800;

  // Ease in-out quad
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

  export const CAMERA_ANGLES = {
    FULL:           { pos: new THREE.Vector3(0, 1.8, 5.5),   target: new THREE.Vector3(0, 1.2, 0) },
    FRONT_UPPER:    { pos: new THREE.Vector3(0, 2.2, 3.8),   target: new THREE.Vector3(0, 1.5, 0) },
    FRONT_CENTER:   { pos: new THREE.Vector3(0, 1.5, 4.0),   target: new THREE.Vector3(0, 1.2, 0) },
    FRONT_LOWER:    { pos: new THREE.Vector3(0, 0.4, 3.5),   target: new THREE.Vector3(0, 0.7, 0) },
    BACK_UPPER:     { pos: new THREE.Vector3(0, 2.2, -3.8),  target: new THREE.Vector3(0, 1.5, 0) },
    BACK_CENTER:    { pos: new THREE.Vector3(0, 1.5, -4.0),  target: new THREE.Vector3(0, 1.2, 0) },
    BACK_LOWER:     { pos: new THREE.Vector3(0, 0.3, -3.5),  target: new THREE.Vector3(0, 0.6, 0) },
    LATERAL_L:      { pos: new THREE.Vector3(-4.0, 1.6, 0),  target: new THREE.Vector3(0, 1.2, 0) },
    LATERAL_R:      { pos: new THREE.Vector3(4.0, 1.6, 0),   target: new THREE.Vector3(0, 1.2, 0) },
    OBLIQUE_FL:     { pos: new THREE.Vector3(-2.5, 2.0, 3.0),target: new THREE.Vector3(0, 1.3, 0) },
    OBLIQUE_FR:     { pos: new THREE.Vector3(2.5, 2.0, 3.0), target: new THREE.Vector3(0, 1.3, 0) },
    OBLIQUE_BL:     { pos: new THREE.Vector3(-2.5, 1.5,-3.0),target: new THREE.Vector3(0, 1.1, 0) },
    ARM_L:          { pos: new THREE.Vector3(-4.5, 1.8, 1.0),target: new THREE.Vector3(-1.0, 1.5, 0) },
    ARM_R:          { pos: new THREE.Vector3(4.5, 1.8, 1.0), target: new THREE.Vector3(1.0, 1.5, 0) },
    CALF:           { pos: new THREE.Vector3(0, -0.5, 3.5),  target: new THREE.Vector3(0, 0.2, 0) },
  };

  let _currentTweenId = null;
  const _lookAtTarget = new THREE.Vector3(0, 1.2, 0);  // camera tracks this

  /**
   * Animate camera to named angle.
   * If a tween is in progress, cancels it and starts from current position.
   * @param {string} angleKey - key from CAMERA_ANGLES
   * @returns {Promise<void>} resolves when animation completes
   */
  export function tweenToAngle(angleKey) {
    const angle = CAMERA_ANGLES[angleKey] ?? CAMERA_ANGLES.FULL;
    const cam = getCamera();
    if (!cam) return Promise.resolve();

    // Cancel in-flight tween
    if (_currentTweenId != null) {
      cancelAnimationFrame(_currentTweenId);
      _currentTweenId = null;
    }

    const startPos = cam.position.clone();
    const startTarget = _lookAtTarget.clone();
    const startTime = performance.now();

    return new Promise((resolve) => {
      function tick() {
        const elapsed = performance.now() - startTime;
        const t = easeInOut(Math.min(elapsed / TWEEN_DURATION_MS, 1));

        cam.position.lerpVectors(startPos, angle.pos, t);
        _lookAtTarget.lerpVectors(startTarget, angle.target, t);
        cam.lookAt(_lookAtTarget);

        if (t < 1) {
          _currentTweenId = requestAnimationFrame(tick);
        } else {
          _currentTweenId = null;
          resolve();
        }
      }
      _currentTweenId = requestAnimationFrame(tick);
    });
  }

  /** Immediately snap camera to angle (no animation — used for init) */
  export function snapToAngle(angleKey) {
    const angle = CAMERA_ANGLES[angleKey] ?? CAMERA_ANGLES.FULL;
    const cam = getCamera();
    if (!cam) return;
    cam.position.copy(angle.pos);
    _lookAtTarget.copy(angle.target);
    cam.lookAt(_lookAtTarget);
  }

  /** Cancel any in-progress tween */
  export function cancelTween() {
    if (_currentTweenId != null) {
      cancelAnimationFrame(_currentTweenId);
      _currentTweenId = null;
    }
  }
  ```

- [ ] **Step 2: Console verification (with scene.js initialized)**

  ```javascript
  const cam = await import('/js/anatomyLens/camera.js');
  cam.snapToAngle('FULL');
  // Visually: camera at default position
  await cam.tweenToAngle('BACK_CENTER');
  // Visually: smooth 800ms pan to show the model's back
  await cam.tweenToAngle('ARM_R');
  // Visually: smooth pan to show right arm
  console.log('✅ camera.js — tween works, cancel works');
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/js/anatomyLens/camera.js
  git commit -m "feat(anatomylens): camera.js — 15 angle presets, 800ms ease-in-out tween"
  ```

---

## Task 8: highlighter.js — emissive material animation

**Files:**
- Create: `frontend/js/anatomyLens/highlighter.js`

- [ ] **Step 1: Write the file**

  ```javascript
  // frontend/js/anatomyLens/highlighter.js
  // Applies emissive highlight materials to meshes.
  // Primary: purple pulse. Secondary: cyan steady.
  // Uses scene.js registerUpdate() to drive pulse animation each frame.

  import * as THREE from 'three';
  import { getMeshes, resetAllMaterials } from './model.js';
  import { registerUpdate, unregisterUpdate } from './scene.js';

  const COLOR_PRIMARY   = new THREE.Color(0x6c63ff);
  const COLOR_SECONDARY = new THREE.Color(0x00d2ff);
  const COLOR_BASE      = new THREE.Color(0x000000);

  let _activePrimary = [];
  let _activeSecondary = [];
  let _pulseCallback = null;

  /**
   * Highlight muscles for an exercise.
   * Clears previous highlights first.
   * @param {string[]} primary - mesh names to pulse purple
   * @param {string[]} secondary - mesh names to glow cyan
   */
  export function applyHighlight(primary, secondary) {
    clearHighlight();

    // Apply primary — pulsing purple
    _activePrimary = primary.flatMap(name => getMeshes(name));
    _activePrimary.forEach(mesh => {
      mesh.material.emissive.copy(COLOR_PRIMARY);
      mesh.material.emissiveIntensity = 0.8;
    });

    // Apply secondary — steady cyan
    _activeSecondary = secondary.flatMap(name => getMeshes(name));
    _activeSecondary.forEach(mesh => {
      mesh.material.emissive.copy(COLOR_SECONDARY);
      mesh.material.emissiveIntensity = 0.35;
    });

    // Register pulse animation (Math.sin wave on primary meshes)
    _pulseCallback = (now) => {
      const intensity = Math.sin((now / 1000) * 1.2 * Math.PI * 2) * 0.3 + 0.8;
      // Range: 0.5 → 1.1, period ~833ms
      _activePrimary.forEach(mesh => {
        mesh.material.emissiveIntensity = Math.max(0.5, Math.min(1.1, intensity));
      });
    };
    registerUpdate(_pulseCallback);
  }

  /** Remove all highlights and stop pulse */
  export function clearHighlight() {
    if (_pulseCallback) {
      unregisterUpdate(_pulseCallback);
      _pulseCallback = null;
    }
    resetAllMaterials();
    _activePrimary = [];
    _activeSecondary = [];
  }
  ```

- [ ] **Step 2: Verify (requires model.js loaded with GLB)**

  ```javascript
  const hl = await import('/js/anatomyLens/highlighter.js');
  hl.applyHighlight(['pectoral_mayor_esternal'], ['deltoides_anterior', 'triceps_cabeza_lateral']);
  // Visually: pectoral pulses purple, deltoid and triceps glow cyan steady
  // Wait 2s then:
  hl.clearHighlight();
  // Visually: all muscles return to dark base color
  console.log('✅ highlighter.js — pulse and clear work');
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/js/anatomyLens/highlighter.js
  git commit -m "feat(anatomylens): highlighter.js — purple pulse primary, cyan steady secondary"
  ```

---

## Task 9: legend.js — DOM legend component

**Files:**
- Create: `frontend/js/anatomyLens/legend.js`

- [ ] **Step 1: Write the file**

  ```javascript
  // frontend/js/anatomyLens/legend.js
  // Renders a legend in #anatomy-legend showing primary (purple) and secondary (cyan) muscles.
  // Uses al- prefixed classes to avoid collision with main.css .legend-dot.

  // Display name mapping: mesh key → human-readable Spanish name
  const MUSCLE_LABELS = {
    'pectoral_mayor_esternal':    'Pecho mayor (esternal)',
    'pectoral_mayor_clavicular':  'Pecho mayor (clavicular)',
    'deltoides_anterior':         'Deltoides anterior',
    'deltoides_medial':           'Deltoides medial',
    'deltoides_posterior':        'Deltoides posterior',
    'biceps_cabeza_larga':        'Bíceps',
    'biceps_cabeza_corta':        'Bíceps (cabeza corta)',
    'braquial':                   'Braquial',
    'braquiorradial':             'Braquiorradial',
    'triceps_cabeza_larga':       'Tríceps (larga)',
    'triceps_cabeza_lateral':     'Tríceps (lateral)',
    'triceps_cabeza_medial':      'Tríceps (medial)',
    'dorsal_ancho':               'Dorsal ancho',
    'trapecio_superior':          'Trapecio',
    'trapecio_medio':             'Trapecio medio',
    'romboides_mayor':            'Romboides',
    'erector_espinal':            'Erector espinal',
    'recto_abdominal':            'Recto abdominal',
    'oblicuo_externo':            'Oblicuos',
    'transverso_abdominal':       'Transverso abdominal',
    'gluteo_mayor':               'Glúteo mayor',
    'gluteo_medio':               'Glúteo medio',
    'recto_femoral':              'Cuádriceps',
    'vasto_lateral':              'Vasto lateral',
    'vasto_medial':               'Vasto medial',
    'biceps_femoral':             'Isquiotibiales',
    'semitendinoso':              'Semitendinoso',
    'semimembranoso':             'Semimembranoso',
    'gastrocnemio_medial':        'Gemelo medial',
    'gastrocnemio_lateral':       'Gemelo lateral',
    'soleo':                      'Sóleo',
    'infraespinoso':              'Infraespinoso',
    'redondo_menor':              'Redondo menor',
  };

  function label(key) { return MUSCLE_LABELS[key] ?? key.replace(/_/g, ' '); }

  function dedupe(arr) { return [...new Set(arr)]; }

  /**
   * Render legend into #anatomy-legend with fade-in.
   * @param {string[]} primary - muscle names (display names shown)
   * @param {string[]} secondary
   */
  export function renderLegend(primary, secondary) {
    const el = document.getElementById('anatomy-legend');
    if (!el) return;

    const primaryLabels = dedupe(primary.map(label));
    const secondaryLabels = dedupe(secondary.map(label));

    el.innerHTML = `
      <div class="anatomy-legend-3d">
        ${primaryLabels.length ? `
          <div class="al-legend-group">
            <span class="al-legend-dot primary"></span>
            <span>${primaryLabels.join(' · ')}</span>
          </div>
        ` : ''}
        ${secondaryLabels.length ? `
          <div class="al-legend-group">
            <span class="al-legend-dot secondary"></span>
            <span>${secondaryLabels.join(' · ')}</span>
          </div>
        ` : ''}
      </div>
    `;

    // Fade in after paint
    requestAnimationFrame(() => {
      el.querySelector('.anatomy-legend-3d')?.classList.add('al-visible');
    });
  }

  /** Clear the legend */
  export function clearLegend() {
    const el = document.getElementById('anatomy-legend');
    if (el) el.innerHTML = '';
  }
  ```

- [ ] **Step 2: Verify in browser console**

  ```javascript
  const leg = await import('/js/anatomyLens/legend.js');
  leg.renderLegend(['pectoral_mayor_esternal'], ['deltoides_anterior', 'triceps_cabeza_lateral']);
  // Visual: anatomy-legend shows "Pecho mayor (esternal)" in purple dot, secondary in cyan dot
  leg.clearLegend();
  // Visual: legend clears
  console.log('✅ legend.js');
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/js/anatomyLens/legend.js
  git commit -m "feat(anatomylens): legend.js — DOM badges with al- prefix, fade-in"
  ```

---

## Task 10: fallback.js + errorBoundary.js

**Files:**
- Create: `frontend/js/anatomyLens/fallback.js`
- Create: `frontend/js/anatomyLens/errorBoundary.js`

- [ ] **Step 1: Write fallback.js**

  ```javascript
  // frontend/js/anatomyLens/fallback.js
  // Toggles between 3D canvas and 2D SVG by manipulating display/class.

  import { transition, STATES } from './state.js';
  import { clearLegend } from './legend.js';

  /** Activate SVG fallback — hide canvas container, show SVG */
  export function activateSVGFallback() {
    transition(STATES.SVG_FALLBACK);

    const container = document.querySelector('.anatomy-lens-container');
    if (container) container.style.display = 'none';

    const svg = document.getElementById('anatomy-svg-wrap');
    if (svg) svg.classList.add('al-fallback-active');

    clearLegend();
    console.info('[AnatomyLens] SVG fallback activated');
  }

  /**
   * Check WebGL availability before even trying to init.
   * @returns {boolean}
   */
  export function isWebGLAvailable() {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
      return false;
    }
  }
  ```

- [ ] **Step 2: Write errorBoundary.js**

  ```javascript
  // frontend/js/anatomyLens/errorBoundary.js
  // Wraps risky operations and decides: recover or fallback.

  import { activateSVGFallback } from './fallback.js';

  /**
   * Execute fn safely. On error: log + trigger SVG fallback.
   * @param {Function} fn - async function to execute
   * @param {string} context - label for logging
   * @returns {Promise<any>}
   */
  export async function safeExec(fn, context = 'unknown') {
    try {
      return await fn();
    } catch (err) {
      console.error(`[AnatomyLens/${context}]`, err);
      activateSVGFallback();
      return null;
    }
  }

  /**
   * Wrap a highlight/camera operation that should NOT trigger full fallback on failure.
   * Logs and skips — the 3D viewer stays active, just this operation failed.
   * @param {Function} fn
   * @param {string} context
   */
  export async function safeOp(fn, context = 'op') {
    try {
      return await fn();
    } catch (err) {
      console.warn(`[AnatomyLens/${context}] skipped:`, err.message);
      return null;
    }
  }
  ```

- [ ] **Step 3: Verify in browser**

  ```javascript
  const fb = await import('/js/anatomyLens/fallback.js');
  console.assert(fb.isWebGLAvailable() === true, 'WebGL available in Chrome');
  fb.activateSVGFallback();
  // Visual: 3D container hidden, SVG visible
  console.log('✅ fallback.js');
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/js/anatomyLens/fallback.js frontend/js/anatomyLens/errorBoundary.js
  git commit -m "feat(anatomylens): fallback.js + errorBoundary.js — safe wrappers, SVG toggle"
  ```

---

## Task 11: index.js — public API

**Files:**
- Create: `frontend/js/anatomyLens/index.js`

- [ ] **Step 1: Write the file**

  ```javascript
  // frontend/js/anatomyLens/index.js
  // Public API — the ONLY file exercises.js needs to import.
  // Four async functions: init, highlight, reset, destroy.
  // All functions are safe — they never throw, errors are handled internally.

  import { getState, transition, resetState, canHighlight, STATES } from './state.js';
  import { initScene, startLoop, stopLoop, disposeScene } from './scene.js';
  import { loadModel, disposeModel, resetAllMaterials } from './model.js';
  import { tweenToAngle, snapToAngle, cancelTween } from './camera.js';
  import { applyHighlight, clearHighlight } from './highlighter.js';
  import { renderLegend, clearLegend } from './legend.js';
  import { resolveExercise } from './muscleMap.js';
  import { isWebGLAvailable, activateSVGFallback } from './fallback.js';
  import { safeExec, safeOp } from './errorBoundary.js';

  let _progressBar = null;
  let _loadingEl = null;
  let _pendingHighlight = null;  // queued highlight during LOADING

  /**
   * Mount AnatomyLens in containerElement and start loading the GLB model.
   * @param {HTMLElement} container - .anatomy-lens-container div
   * @returns {Promise<void>}
   */
  async function init(container) {
    if (getState() !== STATES.UNINITIALIZED) return;

    // WebGL check
    if (!isWebGLAvailable()) {
      activateSVGFallback();
      return;
    }

    transition(STATES.LOADING);

    // Inject loading UI
    _loadingEl = document.createElement('div');
    _loadingEl.className = 'anatomy-lens-loading';
    _loadingEl.innerHTML = `
      <span class="anatomy-lens-loading-text">Cargando visor...</span>
      <div class="anatomy-lens-progress">
        <div class="anatomy-lens-progress-bar"></div>
      </div>
    `;
    container.appendChild(_loadingEl);
    _progressBar = _loadingEl.querySelector('.anatomy-lens-progress-bar');

    await safeExec(async () => {
      // Init scene (creates canvas + lights)
      initScene(container, () => {
        // FPS critical callback
        activateSVGFallback();
      });
      startLoop();

      // Load GLB
      await loadModel((pct) => {
        if (_progressBar) _progressBar.style.width = pct + '%';
      });

      // Fade out loading overlay
      if (_loadingEl) {
        _loadingEl.classList.add('al-hidden');
        setTimeout(() => _loadingEl?.remove(), 400);
      }

      snapToAngle('FULL');
      transition(STATES.READY);

      // Execute pending highlight if user clicked during load
      if (_pendingHighlight) {
        const { id, muscles } = _pendingHighlight;
        _pendingHighlight = null;
        await highlight(id, muscles);
      }
    }, 'init');
  }

  /**
   * Highlight muscles for an exercise.
   * @param {number|string} exerciseId - DB numeric id or muscleMap string key
   * @param {string[]} dbMuscles - muscles[] from exercises DB (fallback)
   * @returns {Promise<void>}
   */
  async function highlight(exerciseId, dbMuscles = []) {
    if (getState() === STATES.SVG_FALLBACK) return;

    // Queue if still loading
    if (getState() === STATES.LOADING) {
      _pendingHighlight = { id: exerciseId, muscles: dbMuscles };
      return;
    }

    if (!canHighlight()) return;

    await safeOp(async () => {
      const { primary, secondary, camera } = resolveExercise(exerciseId, dbMuscles);

      transition(STATES.TRANSITIONING_CAMERA);
      clearHighlight();

      // Start camera tween and highlight in parallel
      const [,] = await Promise.all([
        tweenToAngle(camera),
        Promise.resolve().then(() => applyHighlight(primary, secondary)),
      ]);

      transition(STATES.HIGHLIGHTING);
      renderLegend(primary, secondary);
    }, 'highlight');
  }

  /**
   * Reset all highlights and camera to default position.
   * @returns {Promise<void>}
   */
  async function reset() {
    if (getState() === STATES.SVG_FALLBACK) return;
    cancelTween();
    clearHighlight();
    clearLegend();
    resetAllMaterials();
    await safeOp(() => tweenToAngle('FULL'), 'reset');
    if (canHighlight()) transition(STATES.READY);
  }

  /**
   * Destroy the viewer and release GPU memory.
   * Call when navigating away from the exercises section.
   */
  async function destroy() {
    cancelTween();
    clearHighlight();
    clearLegend();
    stopLoop();
    disposeModel();
    disposeScene();
    resetState();
    _pendingHighlight = null;
  }

  // ── Debug API (development only) ─────────────────────────────
  if (typeof window !== 'undefined') {
    window.__anatomyLens = {
      getState,
      getMeshRegistry: () => { try { return window.__anatomyLensRegistry; } catch { return null; } },
      getFPS: () => '(not tracked externally — check scene.js FPS monitor)',
      forceFallback: activateSVGFallback,
    };
  }

  export default { init, highlight, reset, destroy };
  ```

- [ ] **Step 2: End-to-end test in browser (requires GLB)**

  ```javascript
  const { default: AnatomyLens } = await import('/js/anatomyLens/index.js');
  const container = document.querySelector('.anatomy-lens-container');

  // 1. Init
  await AnatomyLens.init(container);
  console.assert(window.__anatomyLens.getState() === 'READY', 'state READY after init');

  // 2. Highlight press banca plano (id=1)
  await AnatomyLens.highlight(1, ['pecho_mayor', 'triceps', 'deltoides_ant']);
  // Visual: camera pans to FRONT_UPPER, pectoral pulses purple, deltoid/triceps cyan
  // Legend shows muscle names below

  // 3. Another exercise
  await AnatomyLens.highlight(6, ['dorsal', 'biceps', 'romboides']);
  // Visual: camera pans to BACK_CENTER

  // 4. Reset
  await AnatomyLens.reset();
  // Visual: camera returns to FULL, all muscles dark

  // 5. Fallback test
  window.__anatomyLens.forceFallback();
  // Visual: canvas hidden, SVG appears

  console.log('✅ index.js — full API works end to end');
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/js/anatomyLens/index.js
  git commit -m "feat(anatomylens): index.js — public API, pending queue, debug API"
  ```

---

## Task 12: exercises.js integration

**Files:**
- Modify: `frontend/js/exercises.js`

- [ ] **Step 1: Read the current selectExercise function location**

  ```bash
  grep -n "function selectExercise\|highlightMuscles\|resetAnatomy\|renderLegend" frontend/js/exercises.js
  ```

- [ ] **Step 2: Add lazy AnatomyLens loader at the top of the IIFE**

  Open `frontend/js/exercises.js`. Find the start of the module IIFE (look for `(function` or the opening of the exercises block). Add these lines immediately inside, before any function definitions:

  ```javascript
  // ── AnatomyLens 3D loader (lazy, first click triggers load) ──────────────
  let _lens = null;
  async function getLens() {
    if (_lens !== null) return _lens;
    try {
      const mod = await import('./anatomyLens/index.js');
      _lens = mod.default;
      const container = document.querySelector('.anatomy-lens-container');
      if (container) await _lens.init(container);
    } catch (e) {
      console.warn('[Exercises] AnatomyLens load failed, SVG only:', e);
      _lens = false;  // false = permanently use SVG
    }
    return _lens;
  }
  ```

- [ ] **Step 3: Replace selectExercise with async version**

  Find the existing `function selectExercise(id)` (around line 367) and replace it entirely:

  ```javascript
  // ── Seleccionar ejercicio → visor anatómico ───────────────
  async function selectExercise(id) {
    activeExId = (activeExId === id) ? null : id;
    renderGrid();

    if (!activeExId) {
      const lens = await getLens();
      if (lens) lens.reset();
      else resetAnatomy();
      return;
    }

    const ex = DB.find(e => e.id === id);
    if (!ex) return;

    renderAffiliate(ex);

    const hint = document.getElementById('anatomy-hint');
    if (hint) hint.style.display = 'none';

    const lens = await getLens();
    if (lens) {
      try {
        await lens.highlight(ex.id, ex.muscles);
        return;  // AnatomyLens handled legend too
      } catch (err) {
        console.warn('[Exercises] AnatomyLens highlight failed, using SVG:', err);
      }
    }

    // SVG fallback path (always available)
    highlightMuscles(ex.muscles);
    renderLegend(ex.muscles);
  }
  ```

  **Note:** `renderAffiliate` stays here — it's not part of AnatomyLens.

- [ ] **Step 4: Trigger getLens() on DOMContentLoaded to preload**

  Find the `Exercises.init()` function call or the `init` function body. Add preloading at the end:

  ```javascript
  // Preload AnatomyLens on page load (don't block)
  getLens().catch(() => {});
  ```

- [ ] **Step 5: Test in browser — full interaction**

  1. Open the exercises page
  2. Click "Press banca plano" → camera pans to chest view, muscles highlight
  3. Click another exercise → camera transitions
  4. Click same exercise again (toggle) → camera returns to FULL, legend clears
  5. Open DevTools → No errors in console

- [ ] **Step 6: Test SVG fallback path**

  1. Open DevTools → Console
  2. Run: `window.__anatomyLens.forceFallback()`
  3. Click any exercise
  4. Expected: SVG highlights work correctly, no errors

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/js/exercises.js
  git commit -m "feat(anatomylens): wire exercises.js — dynamic import, async selectExercise, SVG fallback"
  ```

---

## Task 13: Manual testing — all failure scenarios

**No code changes — verification only.**

- [ ] **Test 1: WebGL disabled**

  1. Chrome → Settings → `chrome://flags/#disable-webgl` → enable "Disable WebGL"
  2. Reload exercises page
  3. Expected: SVG visible immediately, no canvas, no errors in console
  4. Re-enable WebGL flag

- [ ] **Test 2: GLB file 404**

  1. Temporarily rename `frontend/models/anatomy_lens.glb` to `anatomy_lens.glb.bak`
  2. Reload exercises page, click any exercise
  3. Expected: loading overlay appears, after 10s canvas hides and SVG shows
  4. Console: `[AnatomyLens/init] Error: GLB load timeout after 10000ms`
  5. Rename file back

- [ ] **Test 3: Missing mesh in registry**

  1. In DevTools console: `const m = await import('/js/anatomyLens/model.js')`
  2. `m.getMeshes('nonexistent_muscle')`
  3. Expected: returns `[]`, console warns `[AnatomyLens] mesh not found: nonexistent_muscle`
  4. No crash

- [ ] **Test 4: Rapid exercise clicking**

  1. Click "Press banca plano", immediately click "Dominadas", immediately click "Sentadilla"
  2. Expected: each new click cancels the previous camera tween, final position is Sentadilla's camera angle
  3. No visible flash or stuck state

- [ ] **Test 5: Mobile responsive**

  1. DevTools → Toggle device toolbar → iPhone 12 Pro (390px wide)
  2. Expected: `aspect-ratio: 9/16` constrains height, canvas fits without overflow
  3. Exercise click works, highlights visible

- [ ] **Step 6: Final commit**

  ```bash
  git add -A
  git commit -m "test(anatomylens): manual test scenarios documented and verified"
  ```

---

## Self-Review

### Spec coverage check

| Spec section | Covered by task |
|-------------|----------------|
| §2 9-file module architecture | Tasks 3–11 |
| §3 Public API (4 functions) | Task 11 |
| §4 State machine | Task 3 |
| §5 Resilience: WebGL unavailable | Task 10 + Task 11 |
| §5 Resilience: GLB timeout | Task 6 (10s timeout) + Task 13 test 2 |
| §5 Resilience: mesh not found | Task 6 getMeshes() + Task 13 test 3 |
| §5 Resilience: context lost | Task 5 webglcontextlost handler |
| §5 Resilience: FPS < 20 | Task 5 FPS monitor + pixel ratio reduction |
| §5 Resilience: exercise not in map | Task 4 resolveExercise() fallback |
| §6 Lighting system | Task 5 (SpotLight × 2, DirectionalLight, PointLight) |
| §6 Primary pulse animation | Task 8 (Math.sin wave) |
| §6 Secondary steady glow | Task 8 (0.35 fixed) |
| §6 Camera tween 800ms | Task 7 (ease-in-out quad) |
| §6 Legend DOM component | Task 9 |
| §6 Loading progress bar | Task 11 (GLTFLoader xhr callback) |
| §7 15 camera angles | Task 7 |
| §8.1 Muscle inventory | Task 4 (DB_TO_MESH) + Task 0 (GLB naming) |
| §8.2 Exercise muscle map | Task 4 (MUSCLE_MAP + resolveExercise) |
| §9 GLB spec | Task 0 |
| §10 exercises.js integration | Task 12 |
| §11 HTML structure | Task 2 |
| §11 CSS | Task 1 |
| §12 Debug API | Task 11 (window.__anatomyLens) |
| §14.1 DB_TO_MESH bridge | Task 4 |
| §14.2 Numeric ID support | Task 4 (EXERCISE_ID_MAP) + Task 11 |
| §14.5 Tween implementation | Task 7 |

### Known gaps (acceptable)
- **SLERP**: Used lerp for simplicity — SLERP over quaternions would be more mathematically correct for arc paths but lerp on Vector3 is visually indistinguishable for these camera distances and is far simpler to maintain.
- **app.js**: No changes needed — exercises.js handles init/destroy internally via dynamic import.
- **Mesh registry in debug API**: `window.__anatomyLens.getMeshRegistry()` returns null because model.js doesn't expose registry through window. If needed during debug, import model.js directly in console: `const m = await import('/js/anatomyLens/model.js'); m.getRegistry()`.
