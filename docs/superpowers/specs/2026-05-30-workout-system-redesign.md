# Workout System Redesign — Spec v1.0
**Fecha:** 2026-05-30  
**Estado:** Aprobado por el usuario  
**Enfoque:** Opción B — Refactor modular completo

---

## Problema

El sistema de entrenamiento actual tiene cinco problemas principales:

1. **SFR incomprensible** — Badge técnico que el usuario no entiende. "SFR" = Stimulus-to-Fatigue Ratio (RP methodology), jerga de coach que no pertenece a la UI de usuario final.
2. **Peso sin contexto de equipamiento** — La pantalla pre-entreno muestra "kg" sin indicar si es peso por mancuerna, peso total con barra, o pila de polea.
3. **Sets incompletos al iniciar** — Exercises sin historial (workingKg = 0) generan sets de trabajo con peso 0 y sin warmup, incluso en compuestos. La inconsistencia rompe la confianza del usuario.
4. **Mega-archivos difíciles de mantener** — `views.js` (589 líneas) mezcla 5 responsabilidades. `workoutLogger.js` (563 líneas) mezcla render, lógica de sets, anatomy y PR.
5. **Sin adaptación al estado del día** — No se pregunta al usuario cómo está, no se adapta el volumen/intensidad a su recuperación real.

---

## Solución — Opción B: Refactor modular completo

### Principio de diseño
Cada módulo tiene **una sola responsabilidad**. Si falla el warmup → miras `warmup.js`. Si falla la carga → miras `session-loader.js`. Sin efectos secundarios cruzados.

---

## Arquitectura de módulos

### Estructura de ficheros resultante

```
frontend/js/workout/
  ├── state.js               (sin cambios)
  ├── timer.js               (sin cambios)
  ├── inactivity.js          (sin cambios)
  ├── summary.js             (sin cambios)
  ├── exercise-meta.js       ← NUEVO: compound/equipment lookup + defaultKg
  ├── warmup.js              ← NUEVO: generateWarmupSets() — función pura
  ├── readiness-check.js     ← NUEVO: pre-session survey + score + adaptive suggestion
  ├── session-loader.js      ← EXTRAÍDO de views.js (loadRoutineSession + _parseRestSecs)
  ├── pre-workout.js         ← EXTRAÍDO de views.js (renderPreWorkoutAdjust)
  ├── routine-picker.js      ← EXTRAÍDO de views.js (renderRoutinePicker + _saveRoutineLabel)
  ├── custom-builder.js      ← EXTRAÍDO de views.js (renderCustomRoutineBuilder)
  ├── idle.js                ← EXTRAÍDO de views.js (renderIdle)
  └── views.js               (orquestador: re-exporta + registra callbacks — ~30 líneas)

frontend/js/
  ├── workoutLogger.js       (coordinador reducido ~200 líneas — solo renderActive + wire-up)
  ├── workoutSets.js         ← EXTRAÍDO de workoutLogger.js (renderSets + inputs + PR logic)
  ├── exercises.js           (ampliar DB: +compound, +equipment, +defaultKg, +40 ejercicios)
  ├── workoutSession.js      (sin cambios)
  ├── workoutPR.js           (sin cambios)
  ├── oneRepMax.js           (sin cambios)
  ├── workoutHistory.js      (sin cambios)
  └── workoutInit.js         (sin cambios)
```

**Invariante:** ningún módulo importa de su hermano hacia arriba. El flujo de dependencias es siempre descendente: `workoutLogger → workoutSets → workout/*`.

---

## Módulo 1: exercise-meta.js

Provee metadatos enriquecidos por nombre de ejercicio. Fuente de verdad para compound/equipment.

### Interface
```js
// Devuelve { compound, equipment, barWeight, defaultKg } para un ejercicio dado
export function getExerciseMeta(exerciseName)

// Devuelve el tipo de unidad legible para mostrar en UI
export function getWeightLabel(equipment)
// 'barbell'    → 'kg total (barra 20 kg incl.)'
// 'dumbbell'   → 'kg / mancuerna'
// 'cable'      → 'kg en pila'
// 'machine'    → 'kg'
// 'bodyweight' → 'kg lastre (opc.)'

// Devuelve el step del stepper en pre-entreno
export function getWeightStep(equipment)
// barbell/cable → 2.5 | dumbbell/bodyweight → 1 | machine → 5
```

### Tabla de clasificación (muestra — completa en exercises.js)

| Ejercicio | compound | equipment | barWeight | defaultKg |
|-----------|----------|-----------|-----------|-----------|
| Press banca plano (barra) | true | barbell | 20 | 60 |
| Press inclinado mancuernas | true | dumbbell | 0 | 20 |
| Sentadilla trasera (barra) | true | barbell | 20 | 80 |
| Extensión en polea (cuerda) | false | cable | 0 | 15 |
| Curl barra recta / EZ | false | barbell | 10 | 30 |
| Face pull en polea | false | cable | 0 | 15 |
| Remo con barra (pronación) | true | barbell | 20 | 60 |
| Jalón al pecho (agarre prono) | true | cable | 0 | 50 |
| Hip thrust (barra) | true | barbell | 20 | 80 |
| Peso muerto rumano (barra) | true | barbell | 20 | 70 |

**Nota sobre barra de curl (EZ/recta):** `compound: false`, `barWeight: 10` (barra EZ estándar).

---

## Módulo 2: warmup.js

Función pura — sin side effects, fácil de testear.

### Interface
```js
export function generateWarmupSets(workingKg, equipment, compound)
// → Array<{ weightKg, reps, isWarmup: true }>
```

### Lógica
```
compound: false → []   (isolation: curl, extensión, lateral raise, etc.)
workingKg === 0 → []   (sin peso confirmado → sets vacíos, usuario rellena en vivo)

compound: true, workingKg >= 60 → 3 sets:
  [40% × 10 reps, 65% × 6 reps, 85% × 3 reps]

compound: true, workingKg 30–59 → 2 sets:
  [50% × 8 reps, 75% × 5 reps]

compound: true, workingKg 1–29 → 1 set:
  [60% × 10 reps]
```

Todos los pesos se redondean a múltiplos de 2.5 kg. Para barras, el mínimo es `barWeight` (20 kg). Para mancuernas/cables, mínimo 2.5 kg.

**Progresión inteligente de peso sugerido:**
Si el usuario completó TODOS los sets y reps en la última sesión → `suggestedKg = lastKg + step` donde `step = 2.5` (barra/cable) o `1` (mancuerna).
Si completó parcialmente → `suggestedKg = lastKg` (mantener).
Si no completó el 60% de los sets → `suggestedKg = lastKg - step` (reducir, badge warning).

---

## Módulo 3: readiness-check.js

Pantalla rápida pre-sesión (20 segundos). Se muestra después del selector de día, antes de la pantalla de ajuste de pesos.

### Preguntas (4 taps máximo)

```
1. Horas de sueño anoche:   [<6h] [6-7h] [7-8h] [8h+]
2. ¿Has comido antes de entrenar?   [Nada] [Hace +3h] [Hace 1-2h] [<1h]
3. ¿Pre-entreno hoy?   [No] [Sí]
4. ¿Cómo te sientes?   [💀 Mal] [😐 Normal] [💪 Bien] [🔥 Top]
```

**Auto-relleno desde nutrición:** Si `localStorage.hs_tdee` tiene datos de hoy y el módulo de planner tiene entradas → la pregunta 2 se pre-selecciona automáticamente.

### Score (0–100)
```
Base: 50
Sueño: 8h+ = +20 | 7-8h = +12 | 6-7h = +0 | <6h = -20
Comida: 1-2h = +15 | <1h = +5 | >3h = +0 | nada = -15
Pre-entreno: sí = +10
Feeling: top = +25 | bien = +15 | normal = 0 | mal = -25
```

### Sugerencias adaptativas

| Score | Mensaje | Acción disponible |
|-------|---------|-------------------|
| ≥ 80 | "🔥 Hoy estás al 100% — dale fuerte" | Ninguna |
| 60–79 | "💪 Día normal — sigue el plan" | Ninguna |
| 40–59 | "⚡ Energía justa — te sugiero -1 set por ejercicio" | Botón "Aplicar" |
| < 40 | "😴 Día flojo — te sugiero -20% volumen y -5% peso" | Botón "Aplicar" |

Si el usuario pulsa "Aplicar" → `session-loader.js` recibe `readinessAdj: { volumePct: 0.8, weightPct: 0.95 }` y ajusta `numSets` (mínimo 2) y `workingKg`.

El objeto de readiness se guarda en la sesión draft para correlación post-entreno: `{ sleep, food, preworkout, feeling, score, ts }`.

### Interface
```js
export function renderReadinessCheck(onComplete)
// onComplete({ score, adj, raw }) → continúa al pre-workout

export function calcReadinessScore({ sleep, food, preworkout, feeling })
// → number 0–100

export function getReadinessAdj(score)
// → { volumePct, weightPct, message, canApply }
```

---

## Módulo 4: session-loader.js

Extraído de `views.js`. Contiene la lógica de carga de rutina → draft de sesión.

### Interface
```js
export function loadRoutineSession(daySession, readinessAdj = null)
// Genera el draft, guarda en localStorage, dispara hs:workout-session-changed

export function getSuggestedWeight(exerciseKey, equipment)
// Historial → progressive overload → defaultKg fallback

function _parseRestSecs(restStr) // interno
```

### Lógica de peso (nueva)
```
1. Buscar en hs_workout_sessions_local el último completado
2. Si existe Y completó todos los reps → lastKg + step (progressive overload)
3. Si existe Y completó parcialmente → lastKg
4. Si no existe → meta.defaultKg (del exercise-meta.js)
5. El pre-workout screen puede override todo esto (_adjustedKg)
```

### Aplicación de readinessAdj
```js
if (readinessAdj?.volumePct) {
  numSets = Math.max(2, Math.round(numSets * readinessAdj.volumePct));
}
if (readinessAdj?.weightPct) {
  workingKg = round2_5(workingKg * readinessAdj.weightPct);
}
```

---

## Módulo 5: pre-workout.js

Extraído de `views.js`. Pantalla de ajuste de pesos pre-entreno.

### Cambios respecto al actual
- Label de unidad junto al input: `(kg total · barra 20kg incl.)` o `(kg/mancuerna)` según `getWeightLabel(equipment)`
- Step del stepper adaptado por `getWeightStep(equipment)`
- Si `workingKg > 0` y viene de progressive overload → badge `↑ +2.5 kg` junto al valor
- Si `workingKg = defaultKg` (primera vez) → placeholder hint `"Primera vez — ajusta tu peso estimado"`
- Campo vacío NO bloquea el inicio — el usuario puede dejarlo a 0

---

## Módulo 6: workoutSets.js

Extraído de `workoutLogger.js`. Todo lo relativo a renderizado y lógica de sets individuales.

### Responsabilidades
- `renderSets(ex)` — genera el HTML de la lista de sets de un ejercicio
- `_getPrevSet(exerciseKey, setIndex)` — lookup en historial por posición
- `_getProgressionHint(ex)` — badge ↑/↓/= vs sesión anterior
- Handlers de input (weightKg, reps), complete-set, delete-set

### Lo que queda en workoutLogger.js
- `renderActive()` — shell de la sesión (header, layout, columnas)
- `renderExercises()` — itera ejercicios y delega a workoutSets
- `addExerciseToSession()`, `initExerciseSearch()`, `initAnatomy()`
- Wire-up de módulos (callbacks circulares)
- PR toast queue

---

## SFR → Etiqueta comprensible (routineGenerator.js)

El badge "SFR" en la vista de rutinas se reemplaza:

| sfr | Badge actual | Nuevo badge | Tooltip |
|-----|-------------|-------------|---------|
| `high` | `SFR` | `★ Eficiente` | "Máximo estímulo con mínima fatiga sistémica — el ejercicio más inteligente del grupo" |
| `medium` | *(nada)* | *(nada)* | — |
| `low` | *(nada)* | `⚠ Exigente` | "Alta fatiga del sistema nervioso central — ponlo siempre al principio de la sesión" |

Además, el nombre de cada ejercicio en la vista de rutina es **editable inline** (mismo patrón que `renderRoutinePicker` ya usa para renombrar la rutina completa: click en nombre → input → blur/Enter = guardar).

---

## exercises.js — Expansión de la DB

La DB pasa de ~80 a ~120 ejercicios. Cada entrada añade:
```js
{ name, group, equipment, compound, barWeight, defaultKg }
```

### Nuevos ejercicios por grupo (+40)

**Pecho:** Press en Smith Machine (inclinado), Crossover cable neutro, Fondos en paralelas (lastre), Neck press (barra)

**Espalda:** T-Bar Row, Remo cable estrecho (agarre neutro), Meadows Row, Dominadas lastradas, Remo Kroc, Facepull cuerda alta

**Hombros:** Upright row (barra), Elevaciones laterales cable cruzado, Rear delt fly máquina, Press Arnold con barra, Push press

**Piernas:** Leg press pie estrecho, RDL mancuernas, Sissy squat, Zancada andando con barra, Sentadilla hack barra, Box squat

**Glúteos:** Cable kickback, Hiperextensión 45°, Sumo deadlift (barra), Good morning

**Bíceps:** Curl inclinado (banco), Curl invertido (barra), Zottman curl, Curl araña (spider curl), Curl predicador EZ

**Tríceps:** Overhead extension cable cuerda, Tate press, Skull crusher mancuernas, Board press

**Core:** Crunch polea alta, L-sit (paralelas), Dragon flag, Plancha lastrada, Ab wheel de pie

---

## Flujo completo de usuario (nuevo)

```
Seleccionar rutina IA / personalizada
  → Selector de día
  → [NUEVO] Readiness check (4 taps, ~20s)
  → [Si score < 60] Sugerencia adaptativa → usuario acepta/ignora
  → Pre-workout adjust (pesos con etiqueta equip. + progressive overload hint)
  → Sesión activa (warmup correcto en todos los compuestos)
  → Post-workout coach (ya existe)
```

---

## Qué NO cambia

- Backend / API — ningún cambio
- `workoutSession.js` — lógica de draft/sesión sin tocar
- `workoutPR.js`, `oneRepMax.js`, `workoutHistory.js` — sin tocar
- `timer.js`, `inactivity.js`, `state.js`, `summary.js` — sin tocar
- CSS/diseño — mínimas adiciones para readiness-check y etiquetas de equip.
- Service Worker — bump de versión al final

---

## Criterios de aceptación

1. Cualquier ejercicio de la rutina IA carga con sets pre-rellenados (peso o vacío, nunca ausente)
2. Ejercicios compound con `workingKg > 0` siempre tienen warmup escalado
3. Ejercicios isolation (`compound: false`) nunca tienen warmup
4. La pantalla pre-entreno muestra la unidad correcta según el equipamiento
5. El badge "SFR" ya no aparece — sustituido por "★ Eficiente" o "⚠ Exigente"
6. El nombre de un ejercicio en la vista de rutina es editable inline
7. El check de readiness aparece antes del pre-workout adjust
8. Si el usuario acepta la sugerencia adaptativa, los sets se ajustan correctamente
9. Cada nuevo módulo exporta únicamente funciones bien definidas (sin globals)
10. `views.js` tiene < 40 líneas (solo re-exports y registros de callback)

---

## Estimación de implementación

| Módulo | Prioridad | Complejidad |
|--------|-----------|-------------|
| exercise-meta.js | P0 | Baja — datos |
| warmup.js | P0 | Baja — función pura |
| exercises.js expansión | P0 | Media — datos + clasificación |
| workoutSets.js (extracción) | P1 | Media — refactor |
| session-loader.js (extracción) | P1 | Media — refactor |
| pre-workout.js (extracción) | P1 | Baja — refactor |
| idle.js / routine-picker.js / custom-builder.js | P1 | Baja — refactor mecánico |
| readiness-check.js | P2 | Media — UI nueva |
| SFR badge + exercise rename | P2 | Baja — UI tweak |
| Progresión inteligente de peso | P2 | Media — lógica |
