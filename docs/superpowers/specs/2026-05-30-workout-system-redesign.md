# Workout System Redesign — Spec v2.0
**Fecha:** 2026-05-30
**Estado:** Aprobado por el usuario (v2 post-auditoría)
**Enfoque:** Opción B — Refactor modular completo

---

## Cambios v1 → v2

- ~~Exercise rename~~ **eliminado** — los nombres de ejercicio son inmutables, solo modificables por devs
- `exercises.js` como única fuente de verdad (elimina doble pool en `routineGenerator.js`)
- `displayName` separado de `key` eliminado (innecesario sin rename)
- Skip button en readiness check
- muscleMap.js entries para todos los ejercicios nuevos
- readinessAdj solo aplica a ejercicios con historial real
- Readiness data llega al post-workout coach
- Fallback para ejercicios custom sin metadata
- Definición exacta de "completó todos los reps"
- Pool de ejercicios ampliado de ~80 a ~160

---

## Problemas que resuelve

1. **SFR incomprensible** — Jerga técnica que el usuario final no entiende
2. **Peso sin contexto de equipamiento** — Sin indicar si es kg/mancuerna, total con barra o pila de polea
3. **Sets incompletos al iniciar** — Ejercicios sin historial generan sets vacíos sin warmup, incluso compuestos
4. **Mega-archivos difíciles de mantener** — `views.js` 589 líneas, `workoutLogger.js` 563 líneas con múltiples responsabilidades
5. **Sin adaptación al estado del día** — No hay ajuste de volumen/intensidad basado en recuperación real
6. **Dos fuentes de verdad** — `routineGenerator.js` tiene su propio pool `EX` desincronizado de `exercises.js`

---

## Arquitectura de módulos

```
frontend/js/workout/
  ├── state.js               (sin cambios)
  ├── timer.js               (sin cambios)
  ├── inactivity.js          (sin cambios)
  ├── summary.js             (sin cambios)
  ├── exercise-meta.js       ← NUEVO: compound/equipment/defaultKg + fallback custom
  ├── warmup.js              ← NUEVO: generateWarmupSets() función pura testeable
  ├── readiness-check.js     ← NUEVO: survey pre-sesión + score + sugerencia adaptativa
  ├── session-loader.js      ← EXTRAÍDO de views.js (loadRoutineSession + parseRestSecs)
  ├── pre-workout.js         ← EXTRAÍDO de views.js (renderPreWorkoutAdjust)
  ├── routine-picker.js      ← EXTRAÍDO de views.js (renderRoutinePicker)
  ├── custom-builder.js      ← EXTRAÍDO de views.js (renderCustomRoutineBuilder)
  ├── idle.js                ← EXTRAÍDO de views.js (renderIdle)
  └── views.js               (orquestador ~30 líneas: re-exporta + registra callbacks)

frontend/js/
  ├── workoutLogger.js       (coordinador ~200 líneas — renderActive + wire-up)
  ├── workoutSets.js         ← EXTRAÍDO de workoutLogger.js (renderSets + sets logic)
  ├── exercises.js           (única fuente de verdad: ~160 ejercicios con metadatos completos)
  ├── workoutSession.js      (sin cambios)
  ├── workoutPR.js           (sin cambios)
  ├── oneRepMax.js           (sin cambios)
  ├── workoutHistory.js      (sin cambios)
  └── workoutInit.js         (sin cambios)

frontend/js/anatomyLens/
  └── muscleMap.js           (añadir entradas para los ~80 ejercicios nuevos)
```

**Invariante:** flujo de dependencias siempre descendente.
`workoutLogger → workoutSets → workout/*`
`routineGenerator → exercises.js` (elimina `EX` interno)

---

## Módulo 1: exercises.js — Única fuente de verdad

### Estructura de cada ejercicio

```js
{
  name:      'Press banca plano (barra)',  // inmutable — solo devs
  group:     'chest',                      // grupo muscular principal
  equipment: 'barbell',                    // 'barbell'|'dumbbell'|'cable'|'machine'|'bodyweight'
  compound:  true,                         // true = calentamiento automático
  barWeight: 20,                           // kg de la barra (0 si no aplica)
  defaultKg: 60,                           // sugerencia primera vez
  sfr:       'medium',                     // 'high'|'medium'|'low' (usado por routineGenerator)
  primary:   true,                         // ejercicio estrella del grupo (routineGenerator)
}
```

`routineGenerator.js` importa desde `exercises.js` y filtra por `group` + `equipment` + `sfr` + `primary`, eliminando el objeto `EX` hardcodeado.

### Pool completo (~160 ejercicios)

#### PECHO
| Nombre | equipment | compound | barWeight | defaultKg | sfr | primary |
|--------|-----------|----------|-----------|-----------|-----|---------|
| Press banca plano (barra) | barbell | true | 20 | 60 | medium | true |
| Press banca inclinado (barra) | barbell | true | 20 | 50 | medium | true |
| Press banca declinado (barra) | barbell | true | 20 | 65 | medium | false |
| Press inclinado mancuernas | dumbbell | true | 0 | 22 | high | true |
| Press mancuernas plano | dumbbell | true | 0 | 24 | high | true |
| Press mancuernas declinado | dumbbell | true | 0 | 24 | high | false |
| Press en máquina (pecho) | machine | true | 0 | 60 | high | true |
| Press cable inclinado | cable | true | 0 | 20 | high | true |
| Cruce poleas bajo a alto | cable | false | 0 | 15 | high | false |
| Cruce poleas alto a bajo | cable | false | 0 | 15 | high | false |
| Pec-Deck (máquina) | machine | false | 0 | 40 | high | false |
| Aperturas mancuernas plano | dumbbell | false | 0 | 12 | high | false |
| Aperturas mancuernas inclinado | dumbbell | false | 0 | 10 | high | false |
| Fondos en paralelas (pecho) | bodyweight | true | 0 | 0 | medium | false |
| Fondos lastrados (pecho) | bodyweight | true | 0 | 10 | medium | false |
| Pull-over con mancuerna | dumbbell | false | 0 | 18 | medium | false |
| Neck press (barra) | barbell | true | 20 | 50 | medium | false |
| Press Smith Machine inclinado | machine | true | 0 | 60 | medium | false |
| Flexiones | bodyweight | true | 0 | 0 | medium | true |
| Flexiones inclinadas (pies alto) | bodyweight | true | 0 | 0 | medium | false |
| Archer push-up | bodyweight | true | 0 | 0 | medium | false |

#### ESPALDA
| Nombre | equipment | compound | barWeight | defaultKg | sfr | primary |
|--------|-----------|----------|-----------|-----------|-----|---------|
| Remo con barra (pronación) | barbell | true | 20 | 60 | medium | true |
| Remo Pendlay | barbell | true | 20 | 60 | medium | false |
| Remo T-bar | barbell | true | 20 | 40 | medium | true |
| Peso muerto (barra) | barbell | true | 20 | 100 | low | true |
| Dominadas (agarre prono) | bodyweight | true | 0 | 0 | medium | true |
| Dominadas lastradas | bodyweight | true | 0 | 10 | medium | false |
| Chin-up (agarre supino) | bodyweight | true | 0 | 0 | medium | true |
| Jalón al pecho (agarre prono) | cable | true | 0 | 50 | high | true |
| Pulldown agarre neutro | cable | true | 0 | 50 | high | false |
| Remo en polea baja (agarre neutro) | cable | true | 0 | 45 | high | true |
| Remo cable estrecho (neutro) | cable | true | 0 | 40 | high | false |
| Remo mancuerna (1 brazo) | dumbbell | true | 0 | 30 | high | true |
| Remo Kroc | dumbbell | true | 0 | 40 | medium | false |
| Meadows Row | barbell | true | 20 | 40 | high | false |
| Remo en máquina (Hammer) | machine | true | 0 | 60 | high | true |
| Pull-over en máquina | machine | false | 0 | 40 | medium | false |
| Face pull en polea | cable | false | 0 | 15 | high | false |
| Facepull cuerda alta | cable | false | 0 | 15 | high | false |
| Straight arm pulldown | cable | false | 0 | 20 | high | false |
| Hiperextensión (espalda baja) | bodyweight | false | 0 | 0 | medium | false |
| Remo invertido (bajo barra) | bodyweight | true | 0 | 0 | high | false |
| Good morning (barra) | barbell | true | 20 | 40 | medium | false |

#### HOMBROS
| Nombre | equipment | compound | barWeight | defaultKg | sfr | primary |
|--------|-----------|----------|-----------|-----------|-----|---------|
| Press militar (barra) | barbell | true | 20 | 50 | medium | true |
| Press Arnold (mancuernas) | dumbbell | true | 0 | 16 | high | true |
| Press mancuernas sentado | dumbbell | true | 0 | 18 | high | true |
| Press en máquina (hombros) | machine | true | 0 | 50 | high | true |
| Push press (barra) | barbell | true | 20 | 55 | medium | false |
| Upright row (barra) | barbell | false | 20 | 40 | medium | false |
| Elevaciones laterales (mancuerna) | dumbbell | false | 0 | 8 | medium | true |
| Elevaciones laterales (cable) | cable | false | 0 | 8 | high | true |
| Elevaciones laterales cable cruzado | cable | false | 0 | 6 | high | false |
| Elevaciones frontales (mancuerna) | dumbbell | false | 0 | 8 | medium | false |
| Pájaro posterior (mancuernas) | dumbbell | false | 0 | 8 | medium | false |
| Rear delt fly máquina | machine | false | 0 | 30 | high | false |
| Face pull en polea | cable | false | 0 | 15 | high | false |
| Pike push-up | bodyweight | true | 0 | 0 | medium | true |
| Handstand push-up | bodyweight | true | 0 | 0 | medium | false |

#### TRÍCEPS
| Nombre | equipment | compound | barWeight | defaultKg | sfr | primary |
|--------|-----------|----------|-----------|-----------|-----|---------|
| Press banca agarre cerrado | barbell | true | 20 | 50 | medium | true |
| Extensión en polea (barra o cuerda) | cable | false | 0 | 20 | high | true |
| Extensión en polea (cuerda) | cable | false | 0 | 18 | high | true |
| Extensión por encima en polea | cable | false | 0 | 15 | high | false |
| Overhead extension cable cuerda | cable | false | 0 | 15 | high | false |
| Press francés (barra EZ) | barbell | false | 10 | 30 | high | false |
| Skull crusher mancuernas | dumbbell | false | 0 | 12 | high | false |
| Tate press | dumbbell | false | 0 | 14 | high | false |
| Extensión mancuerna por encima | dumbbell | false | 0 | 14 | medium | false |
| Press francés con mancuernas | dumbbell | false | 0 | 12 | high | true |
| Fondos tríceps (banco) | bodyweight | false | 0 | 0 | medium | false |
| Fondos en paralelas (tríceps) | bodyweight | true | 0 | 0 | medium | true |
| Diamond push-up | bodyweight | false | 0 | 0 | medium | false |
| Kickback con mancuerna | dumbbell | false | 0 | 8 | medium | false |

#### BÍCEPS
| Nombre | equipment | compound | barWeight | defaultKg | sfr | primary |
|--------|-----------|----------|-----------|-----------|-----|---------|
| Curl barra recta / EZ | barbell | false | 10 | 30 | medium | true |
| Curl mancuernas alterno | dumbbell | false | 0 | 12 | high | true |
| Curl mancuernas sentado (supino) | dumbbell | false | 0 | 12 | high | true |
| Curl inclinado (banco) | dumbbell | false | 0 | 10 | high | false |
| Curl araña (spider curl) | dumbbell | false | 0 | 10 | high | false |
| Curl concentrado | dumbbell | false | 0 | 10 | high | false |
| Curl predicador (máquina) | machine | false | 0 | 30 | high | true |
| Curl predicador EZ | barbell | false | 10 | 25 | high | false |
| Curl predicador con mancuerna | dumbbell | false | 0 | 10 | high | false |
| Curl polea baja (cable) | cable | false | 0 | 15 | high | true |
| Curl martillo (mancuernas) | dumbbell | false | 0 | 12 | medium | false |
| Curl invertido (barra) | barbell | false | 10 | 20 | medium | false |
| Curl invertido (cable) | cable | false | 0 | 12 | medium | false |
| Zottman curl | dumbbell | false | 0 | 10 | medium | false |
| Drag curl | barbell | false | 10 | 25 | high | false |
| Chin-up (dominadas supinas) | bodyweight | true | 0 | 0 | medium | true |

#### CUÁDRICEPS
| Nombre | equipment | compound | barWeight | defaultKg | sfr | primary |
|--------|-----------|----------|-----------|-----------|-----|---------|
| Sentadilla trasera (barra) | barbell | true | 20 | 80 | low | true |
| Sentadilla frontal (barra) | barbell | true | 20 | 60 | medium | true |
| Sentadilla goblet (mancuerna) | dumbbell | true | 0 | 24 | medium | true |
| Sentadilla sumo (mancuerna) | dumbbell | true | 0 | 28 | medium | false |
| Box squat (barra) | barbell | true | 20 | 70 | medium | false |
| Safety bar squat | barbell | true | 25 | 70 | medium | false |
| Hack squat (máquina) | machine | true | 0 | 80 | high | true |
| Prensa de piernas | machine | true | 0 | 100 | high | true |
| Prensa de piernas pie estrecho | machine | true | 0 | 90 | high | false |
| Leg press 1 pierna | machine | true | 0 | 60 | high | false |
| Extensión de cuádriceps | machine | false | 0 | 40 | high | false |
| Zancada búlgara (mancuernas) | dumbbell | true | 0 | 16 | high | true |
| Zancada búlgara (barra) | barbell | true | 20 | 40 | high | false |
| Zancada andando (mancuernas) | dumbbell | true | 0 | 14 | medium | false |
| Zancada andando (barra) | barbell | true | 20 | 40 | medium | false |
| Reverse lunge (mancuernas) | dumbbell | true | 0 | 14 | medium | false |
| Step-up con mancuernas | dumbbell | true | 0 | 14 | medium | false |
| Step-up con barra | barbell | true | 20 | 40 | medium | false |
| Sissy squat | bodyweight | false | 0 | 0 | high | false |
| Pistol squat (1 pierna) | bodyweight | true | 0 | 0 | medium | false |
| Sentadilla (peso corporal) | bodyweight | true | 0 | 0 | low | true |

#### ISQUIOTIBIALES
| Nombre | equipment | compound | barWeight | defaultKg | sfr | primary |
|--------|-----------|----------|-----------|-----------|-----|---------|
| Peso muerto rumano (barra) | barbell | true | 20 | 70 | medium | true |
| Peso muerto rumano (mancuernas) | dumbbell | true | 0 | 24 | medium | true |
| Peso muerto 1 pierna (mancuerna) | dumbbell | true | 0 | 18 | high | false |
| Curl femoral tumbado | machine | false | 0 | 30 | high | true |
| Curl femoral sentado | machine | false | 0 | 30 | high | true |
| Leg curl en polea baja | cable | false | 0 | 20 | high | false |
| Nordic curl | bodyweight | false | 0 | 0 | high | true |
| Good morning (barra) | barbell | true | 20 | 40 | medium | false |

#### GLÚTEOS
| Nombre | equipment | compound | barWeight | defaultKg | sfr | primary |
|--------|-----------|----------|-----------|-----------|-----|---------|
| Hip thrust (barra) | barbell | true | 20 | 80 | high | true |
| Hip thrust (mancuerna) | dumbbell | true | 0 | 30 | high | true |
| Hip thrust en máquina | machine | true | 0 | 80 | high | false |
| Hip thrust Smith Machine | machine | true | 0 | 70 | high | false |
| Sentadilla profunda (barra) | barbell | true | 20 | 70 | medium | true |
| Patada trasera en polea | cable | false | 0 | 10 | high | false |
| Cable kickback | cable | false | 0 | 10 | high | false |
| Abducción de cadera (máquina) | machine | false | 0 | 30 | high | false |
| Cable pull-through | cable | true | 0 | 20 | high | false |
| Hiperextensión 45° (glúteos) | bodyweight | false | 0 | 0 | medium | false |
| Hiperextensión 45° lastrada | bodyweight | false | 0 | 10 | medium | false |
| Sumo deadlift (barra) | barbell | true | 20 | 90 | medium | false |
| Sumo deadlift (mancuerna) | dumbbell | true | 0 | 30 | medium | false |
| Zancada búlgara (mancuernas) | dumbbell | true | 0 | 16 | high | false |
| Prensa a 45° (pies altos) | machine | true | 0 | 90 | high | false |
| Hip thrust peso corporal | bodyweight | true | 0 | 0 | medium | true |
| Puente de glúteos unilateral | bodyweight | false | 0 | 0 | medium | false |

#### GEMELOS
| Nombre | equipment | compound | barWeight | defaultKg | sfr | primary |
|--------|-----------|----------|-----------|-----------|-----|---------|
| Elevación de talones de pie (máquina) | machine | false | 0 | 60 | high | true |
| Elevación de talones sentado (máquina) | machine | false | 0 | 40 | high | true |
| Elevación de talones con barra | barbell | false | 20 | 60 | medium | false |
| Elevación de talones (mancuerna) | dumbbell | false | 0 | 20 | medium | false |
| Elevación de talones Smith Machine | machine | false | 0 | 60 | medium | false |
| Donkey calf raise | machine | false | 0 | 80 | high | false |
| Elevación de talones peso corporal | bodyweight | false | 0 | 0 | medium | false |

#### CORE
| Nombre | equipment | compound | barWeight | defaultKg | sfr | primary |
|--------|-----------|----------|-----------|-----------|-----|---------|
| Plancha frontal (60-90 s) | bodyweight | false | 0 | 0 | medium | true |
| Plancha lateral (30-45 s) | bodyweight | false | 0 | 0 | medium | false |
| Plancha lastrada | bodyweight | false | 0 | 10 | medium | false |
| Rueda abdominal (ab wheel) | bodyweight | false | 0 | 0 | high | false |
| Ab wheel de pie | bodyweight | false | 0 | 0 | high | false |
| Crunch en polea (cable) | cable | false | 0 | 20 | high | true |
| Crunch en máquina | machine | false | 0 | 40 | high | true |
| Crunch polea alta | cable | false | 0 | 15 | high | false |
| Hanging leg raise | bodyweight | false | 0 | 0 | high | false |
| Toes to bar | bodyweight | false | 0 | 0 | high | false |
| Pallof press (cable) | cable | false | 0 | 10 | high | false |
| Cable woodchop (alto a bajo) | cable | false | 0 | 12 | high | false |
| L-sit (paralelas) | bodyweight | false | 0 | 0 | high | false |
| Dragon flag | bodyweight | false | 0 | 0 | high | false |
| Dead bug | bodyweight | false | 0 | 0 | medium | false |
| Russian twist (lastre) | dumbbell | false | 0 | 6 | medium | false |
| Hollow body hold | bodyweight | false | 0 | 0 | high | false |
| Mountain climbers | bodyweight | false | 0 | 0 | medium | false |
| Copenhagen plank | bodyweight | false | 0 | 0 | medium | false |
| Farmer walk (mancuernas) | dumbbell | false | 0 | 24 | medium | false |
| Suitcase carry | dumbbell | false | 0 | 20 | medium | false |

---

## Módulo 2: exercise-meta.js

Proveedor de metadatos — única dependencia de `exercises.js`.

### Interface
```js
export function getExerciseMeta(exerciseName)
// Busca por nombre exacto (case-insensitive, normalized)
// Fallback si no encuentra: { compound: false, equipment: 'dumbbell', barWeight: 0, defaultKg: 20 }

export function getWeightLabel(equipment)
// 'barbell'    → 'kg total (barra incl.)'
// 'dumbbell'   → 'kg / mancuerna'
// 'cable'      → 'kg en pila'
// 'machine'    → 'kg'
// 'bodyweight' → 'kg lastre (opc.)'

export function getWeightStep(equipment)
// barbell | cable → 2.5 | dumbbell | bodyweight → 1 | machine → 5
```

**Fallback para ejercicios custom** (no en DB):
```js
{ compound: false, equipment: 'dumbbell', barWeight: 0, defaultKg: 20, sfr: 'medium', primary: false }
```

---

## Módulo 3: warmup.js

Función pura — sin side effects, completamente testeable.

### Interface
```js
export function generateWarmupSets(workingKg, equipment, compound)
// → Array<{ weightKg, reps, isWarmup: true, setNumber: 0 }>
```

### Lógica
```
compound === false → []     (curl, extensión, laterales, etc. → sin warmup)
workingKg === 0   → []     (sin peso → sets de trabajo vacíos, usuario rellena en vivo)

compound + workingKg >= 60 → 3 sets:
  [ 40% × 10 reps,  65% × 6 reps,  85% × 3 reps ]

compound + workingKg 30–59 → 2 sets:
  [ 50% × 8 reps,  75% × 5 reps ]

compound + workingKg 1–29 → 1 set:
  [ 60% × 10 reps ]
```

Redondeo a múltiplos de 2.5 kg.
Mínimo = `barWeight` para barras (20 kg olímpica, 10 kg EZ), 2.5 kg para el resto.

---

## Módulo 4: readiness-check.js

Pantalla pre-sesión de ~20 segundos. Aparece entre selector de día y pantalla de ajuste de pesos.

### UX

```
┌─────────────────────────────────────┐
│  Antes de empezar — 4 preguntas     │
│                                     │
│  ¿Cuánto dormiste anoche?           │
│  [<6h]  [6-7h]  [7-8h]  [8h+]     │
│                                     │
│  ¿Has comido antes?                 │
│  [Nada] [+3h] [1-2h] [<1h]        │
│                                     │
│  ¿Pre-entreno hoy?                  │
│  [No]  [Sí]                         │
│                                     │
│  ¿Cómo te sientes?                  │
│  [💀 Mal] [😐 Normal] [💪 Bien] [🔥 Top] │
│                                     │
│  [Continuar →]      [Saltar]        │
└─────────────────────────────────────┘
```

**Botón "Saltar"** (pequeño, texto, sin estilo primario): omite el check, establece score = 65 (neutro), no hay sugerencia adaptativa.

**Auto-relleno:** si hay datos de comida de hoy en el planner local (`hs_tdee` timestamp reciente), pregunta 2 se pre-selecciona.

### Score (0–100)
```
Base: 50
Sueño  : 8h+  = +20 | 7-8h = +12 | 6-7h = 0  | <6h   = -20
Comida : 1-2h = +15 | <1h  = +5  | +3h  = 0  | nada  = -15
PreWO  : sí   = +10
Feeling: top  = +25 | bien = +15 | normal = 0 | mal  = -25
Rango: clamp(0, 100)
```

### Sugerencias adaptativas
| Score | Mensaje | Botón |
|-------|---------|-------|
| ≥ 80 | "🔥 Hoy estás al 100% — dale fuerte" | — |
| 60–79 | "💪 Día normal — sigue el plan" | — |
| 40–59 | "⚡ Energía justa — te sugiero −1 set en cada ejercicio" | Aplicar |
| < 40 | "😴 Día flojo — te sugiero −20% volumen y −5% peso" | Aplicar |

### readinessAdj
```js
// Score 40-59:
{ volumePct: null, setsDelta: -1, weightPct: null }

// Score < 40:
{ volumePct: 0.80, setsDelta: null, weightPct: 0.95 }
```

**Restricción importante:** `readinessAdj.weightPct` solo se aplica a ejercicios con historial real (`hasPreviousSession: true`). No se reduce el `defaultKg` de primera vez.

### Persistencia
```js
// Guardado en el draft de sesión
session.readiness = { sleep, food, preworkout, feeling, score, skipped, ts }
```

Y enviado al post-workout coach en el payload:
```js
// POST /api/v1/workout/post-workout-coach
{
  ...existingPayload,
  readiness_score: number,     // 0-100, RGPD-safe (sin PII)
  sleep_hours_bucket: string,  // '<6'|'6-7'|'7-8'|'8+'
  pre_workout: boolean,
}
```

### Interface
```js
export function renderReadinessCheck(onComplete)
// onComplete({ score, adj, raw, skipped })

export function calcReadinessScore({ sleep, food, preworkout, feeling })
// → number 0–100

export function getReadinessAdj(score)
// → { setsDelta, volumePct, weightPct, message, canApply }
```

---

## Módulo 5: session-loader.js

Lógica de carga de rutina → draft. Extraído de `views.js`.

### Lógica de peso sugerido (nueva)

```
1. Buscar última sesión completada con ese exerciseKey
   → completada = algún set tiene completedAt != null

2a. Si existe Y TODOS los sets de trabajo tienen:
    (completedAt != null) AND (reps >= targetReps)
    → suggestedKg = lastKg + step  [progressive overload]
    → badge: "↑ +2.5 kg (progresión)"

2b. Si existe Y algún set completado pero no todos o reps < targetReps:
    → suggestedKg = lastKg  [mantener]
    → badge: ninguno

2c. Si existe Y menos del 60% de sets completados:
    → suggestedKg = max(barWeight, lastKg - step)  [reducir]
    → badge: "↓ −2.5 kg"

3. Si no existe historial:
    → suggestedKg = meta.defaultKg  [primera vez]
    → hint: "Primera vez — ajusta tu peso estimado"

4. _adjustedKg del pre-workout screen hace override de todo lo anterior
```

`step = 2.5` para barbell/cable, `step = 1` para dumbbell/bodyweight/machine.

### Aplicación de readinessAdj

```js
// setsDelta solo se aplica si el adj viene aceptado por el usuario
if (readinessAdj?.setsDelta) {
  numSets = Math.max(2, numSets + readinessAdj.setsDelta);
}
if (readinessAdj?.volumePct) {
  numSets = Math.max(2, Math.round(numSets * readinessAdj.volumePct));
}
// weightPct SOLO para ejercicios con historial real
if (readinessAdj?.weightPct && hasPreviousSession) {
  workingKg = round2_5(workingKg * readinessAdj.weightPct);
}
```

---

## Módulo 6: pre-workout.js

Extraído de `views.js`. Cambios respecto al actual:

- Label de unidad: `getWeightLabel(equipment)` → `"kg / mancuerna"`, `"kg total (barra incl.)"`, etc.
- Step del stepper: `getWeightStep(equipment)` → 1, 2.5 o 5 según tipo
- Badge de progresión junto al valor si viene de overload: `↑ +2.5 kg`
- Hint "Primera vez — ajusta tu peso estimado" si viene de `defaultKg`
- Campo vacío permitido (no bloquea el inicio)

---

## Módulo 7: workoutSets.js

Extraído de `workoutLogger.js`. Responsabilidad única: renderizar y gestionar sets individuales.

- `renderSets(ex)` — HTML de lista de sets
- `_getPrevSet(exerciseKey, setIndex)` — lookup historial
- `_getProgressionHint(ex)` — badge ↑/↓/= vs sesión anterior
- Handlers: input weight/reps, complete-set, delete-set, PR detection

---

## SFR → Etiqueta comprensible

En `routineGenerator.js` (vista de rutinas):

| sfr | Badge actual | Nuevo badge | Tooltip |
|-----|-------------|-------------|---------|
| `high` | `SFR` | `★ Eficiente` | "Máximo estímulo muscular con mínima fatiga — el ejercicio más inteligente del grupo" |
| `medium` | — | — | — |
| `low` | — | `⚠ Exigente` | "Muy exigente para el sistema nervioso — ponlo siempre al inicio de la sesión" |

**Los nombres de ejercicio son inmutables.** Solo modificables por devs en `exercises.js`. No hay rename de usuario.

---

## muscleMap.js — Entradas para nuevos ejercicios

Cada ejercicio nuevo que tenga grupo muscular definido necesita una entrada en `anatomyLens/muscleMap.js`:

```js
'peso_muerto_barra':            { primary: ['back_lower', 'glutes', 'hamstrings'], secondary: ['back_upper', 'quads'] },
'sentadilla_frontal_barra':     { primary: ['quads'], secondary: ['glutes', 'core'] },
'remo_t-bar':                   { primary: ['back_upper', 'lats'], secondary: ['biceps', 'rear_delt'] },
'hip_thrust_smith_machine':     { primary: ['glutes'], secondary: ['hamstrings'] },
// ... (una entrada por ejercicio nuevo)
```

---

## Flujo completo de usuario (nuevo)

```
[Idle] Elegir modo
  → Selector de rutina (IA / personalizada)
  → Selector de día
  → [NUEVO] Readiness check (4 taps, ~20s, skippable)
  → [Si score < 60 y usuario acepta] → readinessAdj aplicado
  → Pre-workout adjust (pesos con etiqueta equip + progressive overload hint)
  → [Empezar entreno]
  → Sesión activa (warmup correcto: compound sí, isolation no)
  → Finalizar
  → Post-workout coach (recibe readiness_score + sleep + pre_workout)
```

---

## Qué NO cambia

- Backend excepto payload post-workout-coach (añadir 3 campos RGPD-safe)
- `workoutSession.js`, `workoutPR.js`, `oneRepMax.js`, `workoutHistory.js`
- `timer.js`, `inactivity.js`, `state.js`, `summary.js`
- CSS — solo adiciones para readiness-check y labels de equipamiento

---

## Criterios de aceptación

1. Todo ejercicio de rutina IA carga con sets pre-rellenados (peso o vacío, nunca ausente)
2. Ejercicios compound + workingKg > 0 → siempre tienen warmup escalado
3. Ejercicios isolation → nunca tienen warmup
4. Pantalla pre-entreno muestra unidad correcta según equipamiento
5. Badge "SFR" eliminado → sustituido por "★ Eficiente" o "⚠ Exigente"
6. Los nombres de ejercicio NO son editables por el usuario
7. Readiness check aparece antes del pre-workout adjust, con botón Skip
8. readinessAdj accepted → sets ajustados correctamente, weightPct solo con historial
9. Readiness data llega al post-workout coach (3 campos numéricos, sin PII)
10. Fallback: ejercicio custom sin metadata → compound: false, dumbbell, defaultKg: 20
11. `views.js` < 40 líneas tras la extracción
12. `routineGenerator.js` importa de `exercises.js`, sin objeto `EX` interno
13. Nuevos ejercicios tienen entradas en `muscleMap.js`
14. Progressive overload definido: +step solo si TODOS los sets completados con reps ≥ targetReps

---

## Prioridades de implementación

| Módulo / tarea | Prioridad | Complejidad | Subagente |
|----------------|-----------|-------------|-----------|
| exercises.js expansión + metadatos | P0 | Alta — ~160 entradas | A |
| exercise-meta.js | P0 | Baja — lookups | A |
| warmup.js | P0 | Baja — función pura | A |
| routineGenerator.js → importar exercises.js | P0 | Media | A |
| session-loader.js extracción + nueva lógica peso | P1 | Media | B |
| workoutSets.js extracción | P1 | Media | B |
| pre-workout.js extracción + labels equip | P1 | Baja | B |
| idle.js + routine-picker.js + custom-builder.js extracción | P1 | Baja | B |
| workoutLogger.js reducción | P1 | Media | B |
| views.js como orquestador | P1 | Baja | B |
| readiness-check.js (UI + score + adj) | P2 | Media | C |
| muscleMap.js entradas nuevos ejercicios | P2 | Baja | C |
| SFR badge → Eficiente/Exigente | P2 | Baja | C |
| post-workout coach payload (backend) | P2 | Baja | C |
| SW bump + smoke test | P3 | Baja | C |
