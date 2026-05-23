# Entreno 2030 — Diseño completo

**Fecha**: 2026-05-23  
**Estado**: Aprobado por usuario — listo para implementación  
**Versión target**: v30 (fases A → C → B)  
**Objetivo**: Superar a Heavy en los tres ejes: impacto visual (Cinema Mode), fluidez de uso (Liquid Steel) e inteligencia (Iron Coach).

---

## Índice

1. [Visión y principios](#1-visión-y-principios)
2. [Arquitectura de módulos](#2-arquitectura-de-módulos)
3. [Fase A — Cinema Mode](#3-fase-a--cinema-mode)
   - 3.1 [celebrations.js](#31-celebrationsjs)
   - 3.2 [muscles.js — SVG Heatmap](#32-musclesjs--svg-heatmap)
   - 3.3 [summary.js — Cinematic Summary](#33-summaryjs--cinematic-summary-extensión)
   - 3.4 [state.js — MUSCLE_MAP compartido](#34-statejs--muscle_map-compartido)
4. [Fase C — Liquid Steel](#4-fase-c--liquid-steel)
   - 4.1 [gestures.js](#41-gesturesjs)
   - 4.2 [views.js — One-thumb mode](#42-viewsjs--one-thumb-mode-extensión)
   - 4.3 [views.js — Plate Calculator](#43-viewsjs--plate-calculator-drawer)
5. [Fase B — Iron Coach](#5-fase-b--iron-coach)
   - 5.1 [coach.js](#51-coachjs)
   - 5.2 [Backend — ai_coach nuevo endpoint](#52-backend--ai_coach-nuevo-endpoint)
   - 5.3 [views.js — Pre-workout briefing](#53-viewsjs--pre-workout-briefing)
   - 5.4 [summary.js — Post-workout insight](#54-summaryjs--post-workout-insight)
6. [Eventos del sistema](#6-eventos-del-sistema)
7. [Kill-switches y preferencias de usuario](#7-kill-switches-y-preferencias-de-usuario)
8. [Dependencias externas y assets](#8-dependencias-externas-y-assets)
9. [CSS — nuevas clases por módulo](#9-css--nuevas-clases-por-módulo)
10. [Orden de implementación y criterios de aceptación](#10-orden-de-implementación-y-criterios-de-aceptación)

---

## 1. Visión y principios

### Qué es esto
Una reimaginación completa de la sección Entreno de HealthStack Pro para competir —y superar— a Heavy en el mercado de apps de gym. No es un rediseño visual ligero: es una nueva capa de experiencia construida sobre la arquitectura de módulos existente (`js/workout/`).

### Los tres pilares
| Pilar | Nombre código | Eje de victoria |
|-------|--------------|-----------------|
| Visual / emocional | Cinema Mode | "Quiero enseñárselo a mis amigos" |
| Velocidad / UX | Liquid Steel | "Es la app más rápida de usar en el gym" |
| Inteligencia | Iron Coach | "Me habla como un entrenador real" |

### Principios de diseño
- **Aditivo, no destructivo**: todo módulo nuevo se monta sobre los existentes sin modificar contratos públicos.
- **Fallback gracioso**: si cualquier feature falla (sin red, modelo no carga, IA lenta), el usuario no lo nota — el workout continúa.
- **Lazy-load**: `muscles.js`, `coach.js` y `celebrations.js` se importan dinámicamente solo al arrancar una sesión, no en page load.
- **Kill-switches**: cada pilar tiene una preferencia de usuario en `localStorage` para desactivarlo.
- **Mobile-first**: todo diseñado para una mano, en el gym, con la pantalla a 40cm de la cara.

---

## 2. Arquitectura de módulos

### Árbol de archivos completo post-implementación

```
frontend/js/workout/
├── state.js              [EXISTENTE — añadir MUSCLE_MAP y nuevos eventos]
├── timer.js              [EXISTENTE — sin cambios]
├── inactivity.js         [EXISTENTE — sin cambios]
├── views.js              [EXISTENTE — extender: one-thumb UI, plate calculator drawer, pre-workout briefing]
├── summary.js            [EXISTENTE — extender: counter animation, timeline, share, post-workout insight]
├── celebrations.js       [NUEVO — Fase A]
├── muscles.js            [NUEVO — Fase A]
├── gestures.js           [NUEVO — Fase C]
└── coach.js              [NUEVO — Fase B]

frontend/assets/
└── muscles-heatmap.svg   [NUEVO — Fase A, SVG front+back con IDs por grupo muscular]

backend/app/modules/ai_coach/
├── router.py             [EXISTENTE — añadir endpoint /set-feedback]
├── service.py            [EXISTENTE — añadir método set_feedback()]
└── schemas.py            [EXISTENTE — añadir SetFeedbackRequest / SetFeedbackResponse]
```

### Grafo de dependencias entre módulos

```
state.js  ←──────────────────────────────┐
  ↑ importado por:                        │ (MUSCLE_MAP)
  timer.js                                │
  views.js ──→ gestures.js (monta sobre DOM)
  summary.js ──→ muscles.js (MUSCLE_MAP)
  celebrations.js ──→ workoutSession.js (getSuggestedWeight)

Eventos (window CustomEvent):
  views.js        dispara  hs:set-completed   → celebrations.js, muscles.js, coach.js
  celebrations.js dispara  hs:pr-celebrated   → (analytics futuro)
  summary.js      dispara  hs:session-ended   → muscles.js (reset)
```

### Regla de imports
Todos los módulos nuevos usan ES module `import`. El coordinador principal (el script de `index.html` o `app.js`) los carga dinámicamente:

```javascript
// Solo cuando arranca una sesión:
const [{ default: Celebrations }, { default: Muscles }, { default: Coach }] =
  await Promise.all([
    import('/js/workout/celebrations.js'),
    import('/js/workout/muscles.js'),
    import('/js/workout/coach.js'),
  ]);
Celebrations.init();
Muscles.init();
Coach.init();
```

---

## 3. Fase A — Cinema Mode

### 3.1 `celebrations.js`

**Responsabilidad única**: detectar PRs en tiempo real y ejecutar la secuencia de celebración sin bloquear el workout.

#### Submódulos internos

```
celebrations.js
├── _detector          Detección client-side de PR por set
├── _canvas            Partículas físicas en Canvas 2D
├── _overlay           DOM overlay de pantalla completa
├── _shareCard         Generación de share card (Web Share API)
└── API pública        init(), destroy()
```

#### Funciones — especificación completa

```javascript
// ── API pública ────────────────────────────────────────────────────────────────
export function init()
// Registra listener en window para 'hs:set-completed'.
// Verifica kill-switch: si localStorage.hs_pref_celebrations === 'off', no registra nada.
// Crea el canvas overlay (display:none) y lo añade al body.
// NO hace fetch, NO carga assets externos.

export function destroy()
// Elimina listener y canvas del DOM. Llamar en onFinish().

// ── Submodulo _detector ────────────────────────────────────────────────────────
function _isPR(exerciseKey, weightKg, reps)
// → boolean
// Calcula Epley 1RM del set actual: weightKg * (1 + reps/30)
// Obtiene historial con Session.getLocalSessions()
// Busca el máximo 1RM histórico para ese exerciseKey en todos los working sets
// Retorna true si el 1RM actual > máximo histórico (o si no hay historial → false, no celebrar)
// Pure function, sin side effects.

function _getHistoricalMax1RM(exerciseKey)
// → number | null
// Itera getLocalSessions(), filtra por exerciseKey, calcula Epley por cada set,
// retorna el máximo. Retorna null si no hay historial.

// ── Submodulo _canvas ──────────────────────────────────────────────────────────
function _createCanvas()
// Crea <canvas> full-screen, position:fixed, z-index:9999, pointer-events:none.
// Añade al body. Retorna el elemento.

function _spawnParticles(canvas, count = 120)
// Genera `count` partículas con propiedades:
//   { x, y, vx, vy, radius, color, alpha, decay }
// Colores: ['#c4a561', '#ffffff', '#f59e0b', '#fbbf24', '#e5e7eb']
// Velocidades iniciales: aleatorias radiales desde centro-top
// Simula gravedad (vy += 0.15 por frame) y fade (alpha -= decay)
// Usa requestAnimationFrame. Para cuando todas alpha <= 0.

function _stopParticles()
// Cancela el rAF loop activo y limpia el canvas.

// ── Submodulo _overlay ─────────────────────────────────────────────────────────
function _showOverlay(exerciseKey, weightKg, reps, oneRM)
// Secuencia temporal:
//   t=0ms:    Flash dorado (body background flash, 150ms)
//             Haptic: window.haptic?.('heavy') × 3 con 80ms entre cada uno
//   t=150ms:  Mostrar overlay div con:
//               "NUEVO RÉCORD" — 72px, font-weight:900, color:#fff, text-shadow gold
//               "[exerciseName]" — 24px, color:#c4a561
//               "[weightKg]kg × [reps] reps" — 20px
//               "1RM estimado: [oneRM]kg" — 16px, color:rgba(255,255,255,0.6)
//             Animación entrada: translateY(40px → 0) + opacity(0→1), 400ms ease-out
//   t=200ms:  Iniciar _spawnParticles()
//   t=800ms:  Mostrar share card (fade-in 300ms)
//   t=3500ms: Auto-dismiss si el usuario no ha interactuado
//   tap/click: dismiss inmediato

function _hideOverlay()
// Fade-out 300ms → display:none. Llama _stopParticles().
// Dispara window.dispatchEvent(new CustomEvent('hs:pr-celebrated', { detail: { exerciseKey } }))

// ── Submodulo _shareCard ───────────────────────────────────────────────────────
function _buildShareCard(exerciseKey, weightKg, reps, oneRM)
// Retorna un <div> estilizado con:
//   Logo HealthStack (SVG inline)
//   "NUEVO RÉCORD PERSONAL"
//   Nombre del ejercicio
//   "[weightKg]kg × [reps] · 1RM: [oneRM]kg"
//   Fecha (toLocaleDateString 'es-ES')
// Sin imágenes externas. Solo CSS variables + colores inline.
// Dimensiones: 320×180px, fondo #07070f, borde gold.

function _triggerShare(exerciseKey, weightKg, reps, oneRM)
// Si navigator.share disponible:
//   navigator.share({ title: 'Nuevo PR — HealthStack', text: `${exerciseName}: ${weightKg}kg × ${reps}` })
// Si no:
//   Mostrar share card en el overlay para screenshot manual
//   Botón "Listo" para dismiss

// ── Listener principal ─────────────────────────────────────────────────────────
function _onSetCompleted(event)
// Handler del evento 'hs:set-completed'
// event.detail = { exerciseKey, weightKg, reps, isWarmup }
// Si isWarmup === true → return (no detectar PR en sets de calentamiento)
// Llama _isPR(exerciseKey, weightKg, reps)
// Si true: calcula oneRM = Math.round(weightKg * (1 + reps/30))
//           llama _showOverlay(exerciseKey, weightKg, reps, oneRM)
// Si false: si weightKg >= 50 y reps >= 5 →
//           milestone sutil: badge flotante '+2.5kg ready?' (ver _showMilestoneBadge)

function _showMilestoneBadge(exerciseKey, weightKg)
// Crea un div pequeño (posición fixed, bottom: 100px, right: 16px)
// "💪 Prueba +2.5kg el próximo set"
// Auto-dismiss 3s. Sin bloquear interacción.
```

#### Estados y ciclo de vida

```
IDLE ──[hs:set-completed + isPR=true]──→ CELEBRATING ──[3.5s o tap]──→ IDLE
                                                        ──[share tap]──→ SHARING ──[dismiss]──→ IDLE
```

---

### 3.2 `muscles.js` — SVG Heatmap

**Responsabilidad única**: mantener y renderizar el estado de activación muscular de la sesión en curso como un SVG heatmap.

#### Submodulos internos

```
muscles.js
├── _state        Mapa ejercicioKey → volumen acumulado por grupo muscular
├── _svg          Carga y manipulación del SVG
├── _renderer     Actualización de colores por grupo muscular
└── API pública   init(), update(exerciseKey, setsCompleted), reset(), mount(containerEl), getHTML()
```

#### Funciones

```javascript
// ── API pública ────────────────────────────────────────────────────────────────
export function init()
// Verifica kill-switch: localStorage.hs_pref_heatmap
// Carga /assets/muscles-heatmap.svg vía fetch (una sola vez, cachea en variable módulo)
// Registra listener 'hs:set-completed' → _onSetCompleted()
// Registra listener 'hs:session-ended' → reset()

export function update(exerciseKey, setsCompleted)
// Obtiene grupos musculares de MUSCLE_MAP[exerciseKey] (importado de state.js)
// Para cada grupo: _state.volume[group] += setsCompleted
// Llama _renderer.refresh()

export function reset()
// _state.volume = {}. Llama _renderer.refresh() → todos los grupos en color base.

export function mount(containerEl)
// Inserta el SVG en containerEl. Si ya está montado, no duplica.
// Añade clase 'wl-muscle-svg-container' al contenedor.

export function getHTML()
// Retorna string HTML del SVG con colores actuales (para incrustar en summary).

export function destroy()
// Elimina listeners. Limpia referencias DOM.

// ── Submodulo _state ────────────────────────────────────────────────────────────
// Estructura interna:
const _state = {
  volume: {},     // { 'Pecho': 6, 'Tríceps': 4, ... }
  maxVolume: 0,   // recalculado en cada update para normalizar colores
  svgDocument: null,  // SVG parseado (Document)
  mounted: [],    // array de containerEl donde está montado
}

// ── Submodulo _svg ──────────────────────────────────────────────────────────────
async function _loadSVG()
// fetch('/assets/muscles-heatmap.svg')
// Parsea con DOMParser().parseFromString(text, 'image/svg+xml')
// Guarda en _state.svgDocument
// Si falla: _state.svgDocument = null (fallback a 2D bars en summary)

function _getGroupElement(muscleGroup)
// Busca en _state.svgDocument el elemento con data-muscle="${muscleGroup}"
// Retorna el elemento SVG o null

// ── Submodulo _renderer ─────────────────────────────────────────────────────────
function _volumeToColor(volume, maxVolume)
// → string CSS color
// Escala: 0 → rgba(255,255,255,0.08) [base oscuro]
//         0–33% → rgba(59,130,246,0.5) [azul frío]
//         33–66% → rgba(245,158,11,0.7) [naranja]
//         66–100% → rgba(239,68,68,0.9) [rojo intenso]
// Interpolación lineal dentro de cada rango.

function _refresh()
// Para cada grupo en MUSCLE_MAP values (únicos):
//   obtiene el elemento SVG con _getGroupElement(group)
//   calcula color con _volumeToColor(_state.volume[group] || 0, _state.maxVolume)
//   aplica: element.style.fill = color
//           element.style.filter = volume > 0 ? 'drop-shadow(0 0 4px currentColor)' : 'none'
// Actualiza todos los containerEl montados (clonar SVG serializado o manipular en vivo)

// ── Listener ────────────────────────────────────────────────────────────────────
function _onSetCompleted(event)
// { exerciseKey, reps, isWarmup }
// Si isWarmup → return
// update(exerciseKey, 1)
```

#### El SVG `muscles-heatmap.svg`

Estructura requerida del archivo SVG:
```svg
<svg viewBox="0 0 200 400" xmlns="...">
  <!-- Vista frontal -->
  <g id="front">
    <path data-muscle="Pecho"    id="muscle-pecho"    d="..." fill="rgba(255,255,255,0.08)"/>
    <path data-muscle="Hombros"  id="muscle-hombros"  d="..." fill="rgba(255,255,255,0.08)"/>
    <path data-muscle="Bíceps"   id="muscle-biceps"   d="..." fill="rgba(255,255,255,0.08)"/>
    <path data-muscle="Tríceps"  id="muscle-triceps"  d="..." fill="rgba(255,255,255,0.08)"/>
    <path data-muscle="Core"     id="muscle-core"     d="..." fill="rgba(255,255,255,0.08)"/>
    <path data-muscle="Piernas"  id="muscle-piernas"  d="..." fill="rgba(255,255,255,0.08)"/>
    <path data-muscle="Glúteos"  id="muscle-gluteos"  d="..." fill="rgba(255,255,255,0.08)"/>
  </g>
  <!-- Vista trasera -->
  <g id="back">
    <path data-muscle="Espalda"  id="muscle-espalda"  d="..." fill="rgba(255,255,255,0.08)"/>
    <path data-muscle="Isquios"  id="muscle-isquios"  d="..." fill="rgba(255,255,255,0.08)"/>
  </g>
</svg>
```
Estilo visual: silueta humana esquemática, fondo transparente, trazo blanco al 15%, grupos como paths rellenos. Dimensiones: 200×400px viewBox, 2 vistas (front/back) lado a lado.

---

### 3.3 `summary.js` — Cinematic Summary (extensión)

**Cambios sobre el archivo existente** — no es reescritura completa.

#### Nuevas funciones a añadir

```javascript
// ── Counter animation ──────────────────────────────────────────────────────────
function _animateCounter(el, targetValue, duration = 800, suffix = '')
// Anima el número en `el` desde 0 hasta targetValue en `duration` ms
// easing: t => 1 - Math.pow(1 - t, 3)  (ease-out cubic)
// Actualiza el.textContent en cada frame con rAF
// suffix: ' kg', 's', '' según el stat

// ── Timeline del workout ────────────────────────────────────────────────────────
function _buildWorkoutTimeline(session)
// session = S.session (objeto completo con exercises[])
// Calcula duración por ejercicio:
//   Para cada exercise: tiempo = (primer set completado del siguiente) - (primer set completado de este)
//   Si no hay timestamps → usar distribución uniforme del total
// Retorna HTML: barra horizontal proporcional, cada bloque coloreado por grupo muscular
// Cada bloque: tooltip con nombre + duración al hacer hover/tap

// ── Share ───────────────────────────────────────────────────────────────────────
function _buildShareSummary(durationSecs, volume, exerciseCount, setCount)
// Retorna <div class="wl-share-card"> con:
//   Logo HealthStack SVG inline
//   Fecha larga
//   4 stats en grid (duración, volumen, ejercicios, sets)
//   "Entrenado con HealthStack Pro"
// Sin assets externos. Solo CSS inline.

function _triggerShareSummary()
// Si navigator.share disponible:
//   Construye texto plano con los stats
//   navigator.share({ title: 'Mi sesión — HealthStack', text: ... })
// Si no: muestra la share card en pantalla para screenshot

// ── Muscle heatmap en summary ───────────────────────────────────────────────────
async function _injectMuscleMap()
// Importa muscles.js si no está ya cargado (lazy)
// Llama muscles.getHTML() → inserta en el contenedor '.wl-summary-muscles'
// Si muscles no disponible → el contenedor ya muestra el buildMuscleBreakdown() existente (2D bars)

// ── Modificación a renderSummary() existente ────────────────────────────────────
// 1. Tras establecer S.root.innerHTML, llamar _animateCounter() en cada .wl-stat-box-val
// 2. Añadir sección '.wl-summary-muscles' (para heatmap o fallback 2D)
// 3. Añadir sección '.wl-summary-timeline' → _buildWorkoutTimeline(S.session)
// 4. Añadir botón "Compartir sesión" → _triggerShareSummary()
// 5. Añadir sección '.wl-summary-coach-insight' (vacía inicialmente, rellenada por coach.js)
```

---

### 3.4 `state.js` — MUSCLE_MAP compartido

**Cambio**: mover `MUSCLE_MAP` desde `summary.js` (donde es `const` local) a `state.js` como exportación nombrada.

```javascript
// Añadir a state.js:
export const MUSCLE_MAP = {
  press_banca_plano:       ['Pecho', 'Tríceps'],
  press_banca_inclinado:   ['Pecho', 'Hombros'],
  fondos_pecho:            ['Pecho', 'Tríceps'],
  aperturas_mancuernas:    ['Pecho'],
  press_militar_barra:     ['Hombros', 'Tríceps'],
  elevaciones_laterales:   ['Hombros'],
  dominadas_pronas:        ['Espalda', 'Bíceps'],
  remo_barra:              ['Espalda'],
  remo_mancuerna:          ['Espalda', 'Bíceps'],
  jalon_pecho:             ['Espalda', 'Bíceps'],
  peso_muerto_convencional:['Espalda', 'Piernas'],
  curl_barra:              ['Bíceps'],
  curl_martillo:           ['Bíceps'],
  extension_triceps_polea: ['Tríceps'],
  press_frances:           ['Tríceps'],
  sentadilla:              ['Piernas', 'Glúteos'],
  prensa_piernas:          ['Piernas'],
  extension_cuadriceps:    ['Piernas'],
  curl_femoral_tumbado:    ['Isquios'],
  hip_thrust:              ['Glúteos'],
  sentadilla_bulgara:      ['Piernas', 'Glúteos'],
  plancha:                 ['Core'],
  crunch:                  ['Core'],
  ab_wheel:                ['Core'],
};

// En summary.js: eliminar la const MUSCLE_MAP local, añadir:
// import { MUSCLE_MAP } from './state.js';
```

---

## 4. Fase C — Liquid Steel

### 4.1 `gestures.js`

**Responsabilidad única**: interceptar gestos táctiles sobre las filas de set activas y traducirlos a acciones del workout (completar / editar).

#### Submodulos internos

```
gestures.js
├── _touch         Detección de swipe con PointerEvent API
├── _actions       Acciones que se ejecutan tras el gesto
├── _longPress     Long-press para stepper rápido de peso
└── API pública    mount(setRowEl, exerciseKey, setIndex), unmount(setRowEl)
```

#### Funciones

```javascript
// ── API pública ────────────────────────────────────────────────────────────────
export function mount(setRowEl, exerciseKey, setIndex)
// Registra PointerEvent listeners en `setRowEl`:
//   pointerdown → _touch.start()
//   pointermove → _touch.move()
//   pointerup   → _touch.end()
// También registra long-press (pointerdown > 500ms sin move > 8px) → _longPress.show()
// Guarda referencia en WeakMap para limpieza posterior.

export function unmount(setRowEl)
// Elimina todos los listeners del elemento vía removeEventListener.
// Limpia WeakMap entry.

export function unmountAll()
// Desmonta todos los elementos registrados. Llamar en transiciones de vista.

// ── Submodulo _touch ────────────────────────────────────────────────────────────
function _start(event)
// Guarda: startX, startY, startTime = Date.now()
// event.setPointerCapture(event.pointerId) para tracking fuera del elemento

function _move(event)
// Calcula deltaX = event.clientX - startX
// Calcula deltaY = event.clientY - startY
// Si abs(deltaY) > abs(deltaX) * 0.5 → probable scroll → no interceptar
// Si abs(deltaX) > 20px → mostrar preview visual de la acción:
//   deltaX > 0: background verde al X% de opacidad + icono check
//   deltaX < 0: background azul + icono lápiz

function _end(event)
// Si el gesto fue interrumpido (scroll detectado en _move) → restaurar y return
// Si abs(deltaX) >= 60 y tiempo < 600ms:
//   deltaX > 0 → _actions.completeSet(exerciseKey, setIndex)
//   deltaX < 0 → _actions.editSet(exerciseKey, setIndex)
// Si abs(deltaX) < 60 → restaurar posición (spring-back animation 150ms)

// ── Submodulo _actions ──────────────────────────────────────────────────────────
function completeSet(exerciseKey, setIndex)
// Llama a la función existente de completar set (referencia inyectada en mount)
// Feedback: haptic medium + animación check dorado en la fila

function editSet(exerciseKey, setIndex)
// Abre el editor inline: reemplaza los valores de peso/reps por inputs en la misma fila
// NO abre un modal. Los inputs son inline dentro de la fila.
// Al perder focus o presionar Enter → guarda y cierra

// ── Submodulo _longPress ────────────────────────────────────────────────────────
function _showWeightStepper(setRowEl, exerciseKey, setIndex)
// Crea un div flotante sobre la fila con 4 chips:
//   [−5] [−2.5] [+2.5] [+5]
// Cada chip: actualiza weightKg del set + re-render del valor en la fila
// Auto-dismiss al tocar fuera (document click una vez)
// Posición: centrado horizontalmente sobre la fila, arriba del thumb zone

// ── Configuración ───────────────────────────────────────────────────────────────
const CONFIG = {
  SWIPE_THRESHOLD_PX: 60,     // mínimo para activar acción
  SWIPE_MAX_TIME_MS:  600,    // tiempo máximo del gesto
  ANGLE_TOLERANCE:    0.5,    // ratio deltaY/deltaX para cancelar (scroll)
  LONG_PRESS_MS:      500,    // tiempo para activar long-press
  LONG_PRESS_MOVE_PX: 8,      // movimiento máximo permitido durante long-press
};
```

#### Zona de activación de swipe
- **Solo en filas de set del ejercicio activo**: el set que está en turno ahora.
- Las filas de sets completados NO tienen gestures (ya están done).
- Las filas de ejercicios no activos → scroll normal.

---

### 4.2 `views.js` — One-thumb mode (extensión)

**Cambios en `renderActive()`** (función que renderiza la vista de entreno activo):

```javascript
// ── Layout one-thumb ────────────────────────────────────────────────────────────
// El botón "Completar set" pasa de estar en el centro a estar en la zona
// thumb-friendly: bottom: max(20px, env(safe-area-inset-bottom) + 20px)
// Tamaño mínimo: 56px height, ancho 100% - 32px padding lateral
// Clase CSS: .wl-complete-btn--thumb

// ── Preview del siguiente ejercicio ────────────────────────────────────────────
function _renderNextExercisePreview(session, currentExIdx)
// Muestra en la barra superior (fixed, debajo del timer):
//   "A continuación: [nombre ejercicio] — [N sets × R reps]"
// Si es el último ejercicio: "Último ejercicio 💪"
// Si session.exercises solo tiene 1 → no mostrar

// ── Peso con steppers laterales ────────────────────────────────────────────────
// El input de peso en la fila de set activo:
//   [−2.5] [80 kg] [+2.5]
// Los botones − y + tienen min 44×44px touch target
// El número central (80) tiene font-size: 32px para legibilidad en gym
```

---

### 4.3 `views.js` — Plate Calculator Drawer

```javascript
// ── Función nueva ───────────────────────────────────────────────────────────────
export function openPlateCalculator(targetKg)
// Abre un drawer desde abajo (slide-up, 300ms ease-out)
// Contenido:
//   Input numérico "Peso objetivo" prellenado con targetKg
//   Visualización de la barra:
//     - Barra central (rect gris, 200px × 12px)
//     - Discos a cada lado calculados con _calcPlates(targetKg)
//     - Cada disco: círculo coloreado con su peso dentro
//   Pesos de la barra: 20kg (olímpica) o 7.5kg (corta) — selector radio
//   Actualización en tiempo real al cambiar el input
// Botón "Cerrar" o tap fuera → drawer se desliza hacia abajo

function _calcPlates(targetKg, barWeightKg = 20)
// → array de { weightKg, color, count } ordenado de mayor a menor
// Pesos disponibles: [25, 20, 15, 10, 5, 2.5, 1.25]
// Colores: { 25:'#ef4444', 20:'#3b82f6', 15:'#eab308', 10:'#22c55e',
//             5:'#ffffff', 2.5:'#ef4444'(pequeño), 1.25:'#9ca3af' }
// Algoritmo greedy: (targetKg - barWeightKg) / 2 = pesoUnLado
//                   restar el mayor disco que quepa, repetir
// Si la diferencia es negativa (target < barWeight) → return [] con aviso

function _renderPlateBar(plates, barWeightKg)
// Retorna HTML con la barra y los discos como divs/spans
// Escala visual: cada kg de disco = 2px de radio (visual logarítmico)
// Texto del peso total en el centro de la barra

// ── Trigger desde views.js ──────────────────────────────────────────────────────
// En renderPreWorkoutAdjust(): botón [⚖️ Discos] junto al input de peso de cada ejercicio
// En la vista activa del ejercicio: botón pequeño junto al peso actual
```

---

## 5. Fase B — Iron Coach

### 5.1 `coach.js`

**Responsabilidad única**: generar feedback de IA después de cada set completado y mostrar insights pre/post workout.

#### Submodulos internos

```
coach.js
├── _api           Comunicación con backend /ai-coach/set-feedback
├── _cache         Cache local de respuestas (evitar llamadas repetidas para mismo ejercicio/peso)
├── _ui            Mostrar/ocultar el toast de feedback
└── API pública    init(), preWorkoutBriefing(daySession), postWorkoutInsight(sessionData), destroy()
```

#### Funciones

```javascript
// ── API pública ────────────────────────────────────────────────────────────────
export function init()
// Verifica kill-switch: localStorage.hs_pref_coach
// Registra listener 'hs:set-completed' → _onSetCompleted() (debounced 800ms)
// Inicializa _cache = new Map()

export async function preWorkoutBriefing(daySession)
// → void (actualiza DOM directamente)
// Construye payload: ejercicios del día + últimas 3 sesiones de esa rutina del historial local
// Llama _api.getFeedback('pre_workout', payload)
// Si responde en < 2s: muestra en '.wl-pre-briefing' (contenedor en renderPreWorkoutAdjust)
// Si tarda o falla: contenedor permanece oculto (display:none)

export async function postWorkoutInsight(sessionData)
// → void (actualiza DOM directamente)
// Payload: ejercicios completados, volumen, PRs detectados, historial de 5 sesiones
// Llama _api.getFeedback('post_workout', payload)
// Aparece en '.wl-summary-coach-insight' con fade-in cuando llega (asíncrono, no bloquea)

export function destroy()
// Cancela cualquier petición pendiente (AbortController). Elimina listeners.

// ── Submodulo _api ──────────────────────────────────────────────────────────────
const _api = {
  controller: null,   // AbortController activo

  async getFeedback(type, payload)
  // → { message: string } | null
  // Obtiene token: localStorage.getItem('hs_access_token')
  // Si no hay token → return null (usuario no logueado)
  // this.controller = new AbortController()
  // fetch('/api/v1/ai-coach/set-feedback', {
  //   method: 'POST',
  //   headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ type, ...payload }),
  //   signal: this.controller.signal,
  // })
  // Timeout implícito de 1500ms para set-feedback, 3000ms para pre/post workout
  // Si falla/timeout → return null (SIEMPRE, nunca throw al caller)

  cancel()
  // this.controller?.abort()
}

// ── Submodulo _cache ────────────────────────────────────────────────────────────
// _cache: Map<string, { message: string, ts: number }>
// Key: `${exerciseKey}_${Math.round(weightKg/5)*5}_${reps}` (granularidad 5kg)
// TTL: 30 minutos (no repetir el mismo feedback en la misma sesión)

function _getCached(exerciseKey, weightKg, reps)
// → string | null

function _setCached(exerciseKey, weightKg, reps, message)
// Guarda en _cache. Limpia entradas con ts > 30min.

// ── Submodulo _ui ───────────────────────────────────────────────────────────────
function _showCoachToast(message)
// Crea un div con clase 'wl-coach-toast':
//   Icono 🤖 + texto del mensaje (máx 120 chars, truncar con "...")
//   Posición: fixed, top: 72px (debajo del header), centrado
//   Animación: slide-down + fade-in 250ms
//   Auto-dismiss: 4 segundos
//   Tap para dismiss inmediato
// Si hay un toast activo → lo reemplaza (no apilar)

// ── Listener principal ──────────────────────────────────────────────────────────
// (debounced 800ms)
async function _onSetCompleted(event)
// { exerciseKey, weightKg, reps, isWarmup }
// Si isWarmup → return
// Si no hay token → return
// Buscar en _cache → si hit → _showCoachToast(cached)
// Si no hay cache → llamar _api.getFeedback('set', { exerciseKey, weightKg, reps, history })
//   donde history = últimos 3 sets del mismo ejercicio del historial local
// Si respuesta → _setCached() + _showCoachToast()
```

---

### 5.2 Backend — `ai_coach` nuevo endpoint

**Archivo**: `backend/app/modules/ai_coach/router.py`

```python
# Nuevo endpoint a añadir:
@router.post("/set-feedback", response_model=SetFeedbackResponse)
async def get_set_feedback(
    request: SetFeedbackRequest,
    current_user = Depends(get_current_user),
    service: AICoachService = Depends(get_ai_coach_service),
):
    """
    Feedback inline después de un set. Prompt corto, respuesta máx 2 frases.
    Latencia objetivo: < 800ms (modelo rápido, contexto mínimo).
    """
```

**Schema** `backend/app/modules/ai_coach/schemas.py`:

```python
class SetFeedbackRequest(BaseModel):
    type: Literal['set', 'pre_workout', 'post_workout']
    exercise_key: str
    weight_kg: float
    reps: int
    history: list[dict]   # últimos 3 sets del mismo ejercicio: [{weight_kg, reps, date}]
    # Para pre_workout / post_workout:
    session_summary: dict | None = None

class SetFeedbackResponse(BaseModel):
    message: str           # máx 120 caracteres
    message_type: Literal['progress', 'warning', 'encouragement', 'neutral']
```

**Prompt template** (en `service.py`):

```python
SET_FEEDBACK_PROMPT = """
Eres el coach de {user_display_name}. Responde en español. Máximo 2 frases cortas.
Ejercicio: {exercise_name}
Set completado: {weight_kg}kg × {reps} reps
Historial reciente: {history_str}
Responde con feedback concreto y útil. Sin saludos. Sin "¡".
"""
```

Modelo: `llama-3.3-70b-versatile` (ya configurado). Temperature: 0.3 (respuestas consistentes).

---

### 5.3 `views.js` — Pre-workout briefing

```javascript
// Añadir en renderPreWorkoutAdjust(), justo antes del botón "Empezar":
// <div class="wl-pre-briefing" style="display:none">
//   <div class="wl-pre-briefing-icon">🤖</div>
//   <div class="wl-pre-briefing-text">Analizando tu historial...</div>
// </div>

// Después de renderizar el HTML:
// import('/js/workout/coach.js').then(m => m.preWorkoutBriefing(daySession))
//   .catch(() => {}) // silencioso si no disponible
```

---

### 5.4 `summary.js` — Post-workout insight

```javascript
// Añadir en renderSummary(), después de buildMuscleBreakdown():
// <div class="wl-summary-coach-insight" style="display:none">
//   <span class="wl-coach-insight-icon">🤖</span>
//   <span class="wl-coach-insight-text"></span>
// </div>

// Después de renderizar:
// import('/js/workout/coach.js').then(m => {
//   m.postWorkoutInsight({ exercises: S.session.exercises, startedAt: S.session.startedAt })
//     .then(msg => {
//       if (!msg) return;
//       const el = S.root.querySelector('.wl-summary-coach-insight');
//       if (el) {
//         el.querySelector('.wl-coach-insight-text').textContent = msg;
//         el.style.display = '';
//         el.animate([{opacity:0},{opacity:1}], {duration:400,fill:'forwards'});
//       }
//     });
// }).catch(() => {});
```

---

## 6. Eventos del sistema

Nuevo contrato de eventos CustomEvent que los módulos usan para comunicarse:

| Evento | Disparado por | Escuchado por | `detail` |
|--------|--------------|--------------|---------|
| `hs:set-completed` | `views.js` (al marcar set done) | `celebrations.js`, `muscles.js`, `coach.js` | `{ exerciseKey, weightKg, reps, isWarmup, setIndex }` |
| `hs:pr-celebrated` | `celebrations.js` | analytics (futuro) | `{ exerciseKey, weightKg, reps, oneRM }` |
| `hs:session-ended` | `summary.js` (onFinish) | `muscles.js` (reset), `coach.js` (destroy) | `{ sessionData }` |
| `hs:workout-session-changed` | existente | existente | — |
| `hs:section-changed` | existente | existente | — |

**Importante**: `hs:set-completed` es **NUEVO** — actualmente `views.js` no lo dispara. Añadirlo es parte de Fase A.

---

## 7. Kill-switches y preferencias de usuario

Todos en `localStorage`. Leídos en `init()` de cada módulo. Si la key no existe → feature activado por defecto.

| Key localStorage | Módulo afectado | Valor para desactivar |
|-----------------|----------------|----------------------|
| `hs_pref_celebrations` | `celebrations.js` | `'off'` |
| `hs_pref_heatmap` | `muscles.js` | `'off'` |
| `hs_pref_coach` | `coach.js` | `'off'` |
| `hs_pref_gestures` | `gestures.js` | `'off'` |
| `hs_pref_plate_calc` | `views.js` (drawer) | `'off'` |

**UI para gestionar preferencias**: añadir en la sección Perfil una nueva tarjeta "Preferencias de entreno" con toggles para cada feature. Esto es post-Fase-B.

---

## 8. Dependencias externas y assets

### Nuevas dependencias
| Asset / lib | Tamaño | Carga | Uso |
|-------------|--------|-------|-----|
| `muscles-heatmap.svg` | ~15KB | lazy (fetch en init) | Heatmap muscular |
| Web Share API | nativo | — | Share card (fallback: screenshot manual) |
| Canvas 2D API | nativo | — | Partículas PR celebration |
| PointerEvent API | nativo | — | Swipe gestures |

### NO se añade ninguna librería nueva
- `html2canvas` descartado (CORS issues) → Web Share API nativa
- Three.js para el modelo 3D muscular → **Fase A v2** (post-lanzamiento). Fase A v1 usa SVG.
- No se necesita ningún CDN adicional.

### Backend — nueva dependencia Python
Ninguna. El endpoint nuevo usa Groq que ya está configurado.

---

## 9. CSS — nuevas clases por módulo

### Fase A — Cinema Mode
```css
/* celebrations.js */
.wl-celebration-overlay     /* pantalla completa, fixed, z-index:9999 */
.wl-celebration-title       /* "NUEVO RÉCORD", 72px, font-weight:900 */
.wl-celebration-exercise    /* nombre ejercicio, 24px, color:#c4a561 */
.wl-celebration-stats       /* peso × reps + 1RM */
.wl-celebration-share       /* botón compartir dentro del overlay */
.wl-milestone-badge         /* badge flotante "+2.5kg ready?" */
.wl-flash-gold              /* keyframe flash dorado en body */

/* muscles.js */
.wl-muscle-svg-container    /* contenedor del SVG heatmap (120×180 colapsable) */
.wl-muscle-svg-container--expanded  /* media pantalla */

/* summary.js */
.wl-summary-muscles         /* contenedor heatmap en summary */
.wl-summary-timeline        /* barra horizontal de timeline */
.wl-timeline-block          /* cada bloque de ejercicio en la timeline */
.wl-share-card              /* card de compartir */
.wl-summary-coach-insight   /* bloque de insight de IA */
```

### Fase C — Liquid Steel
```css
/* gestures.js */
.wl-set-row--swiping-right  /* preview swipe derecha (fondo verde) */
.wl-set-row--swiping-left   /* preview swipe izquierda (fondo azul) */
.wl-weight-stepper-popup    /* popup long-press con chips ±2.5/±5 */

/* views.js */
.wl-complete-btn--thumb     /* botón completar set en thumb zone */
.wl-next-exercise-preview   /* barra preview siguiente ejercicio */
.wl-plate-drawer            /* drawer del calculador de discos */
.wl-plate-bar-visual        /* barra + discos */
.wl-plate-disc              /* cada disco individual */
```

### Fase B — Iron Coach
```css
/* coach.js */
.wl-coach-toast             /* toast de feedback post-set */
.wl-coach-toast--entering   /* animación entrada */
.wl-coach-toast--exiting    /* animación salida */

/* views.js / summary.js */
.wl-pre-briefing            /* bloque pre-workout en renderPreWorkoutAdjust */
```

---

## 10. Orden de implementación y criterios de aceptación

### Fase A — Cinema Mode

**Orden de tareas**:
1. Mover `MUSCLE_MAP` a `state.js` y actualizar imports en `summary.js`
2. Crear `muscles-heatmap.svg` (silueta con 9 grupos musculares, IDs correctos)
3. Crear `muscles.js` con SVG heatmap
4. Añadir dispatch de `hs:set-completed` en `views.js` al marcar set done
5. Crear `celebrations.js` con detección client-side de PR
6. Extender `summary.js`: counter animation + timeline + share + muscle map
7. Añadir CSS de Fase A a `main.css`
8. Añadir al SW `healthstack-v61`: `muscles-heatmap.svg` + nuevos JS
9. Tests manuales: completar un set con PR, verificar overlay; completar sesión, verificar summary

**Criterios de aceptación Fase A**:
- [ ] Completar un set que supera el 1RM histórico → aparece overlay de celebración en < 200ms
- [ ] El overlay auto-dismiss en 3.5s
- [ ] El botón "Compartir" invoca `navigator.share` o muestra card para screenshot
- [ ] El heatmap SVG se actualiza visualmente después de cada set
- [ ] La summary screen anima los números desde 0
- [ ] La timeline muestra los ejercicios proporcionalmente
- [ ] Si `hs_pref_celebrations = 'off'` → ninguna animación, solo vibración
- [ ] Si `muscles-heatmap.svg` falla → fallback a barras 2D existentes

### Fase C — Liquid Steel

**Orden de tareas**:
1. Crear `gestures.js` con swipe threshold 60px
2. Montar `gestures.js` en las filas de set activo en `views.js`
3. Añadir plate calculator drawer en `views.js`
4. Reorganizar layout one-thumb en la vista activa (botón completar → thumb zone)
5. Añadir CSS de Fase C a `main.css`

**Criterios de aceptación Fase C**:
- [ ] Swipe derecha en fila de set → completa el set (sin tap en botón)
- [ ] Swipe izquierda en fila de set → abre editor inline peso/reps
- [ ] Long-press en peso → popup con chips ±2.5/±5
- [ ] El swipe NO interfiere con el scroll vertical de la lista
- [ ] El botón "Completar set" está en la zona inferior (thumb zone) en móvil
- [ ] El calculador de discos muestra los discos correctos para cualquier peso entre 20-200kg
- [ ] Si `hs_pref_gestures = 'off'` → sin gestures, UI normal

### Fase B — Iron Coach

**Orden de tareas**:
1. Backend: añadir `SetFeedbackRequest/Response` schemas
2. Backend: añadir `set_feedback()` en `AICoachService`
3. Backend: añadir endpoint `POST /ai-coach/set-feedback` en router
4. Crear `coach.js` frontend
5. Añadir pre-workout briefing en `renderPreWorkoutAdjust`
6. Añadir post-workout insight en `renderSummary`
7. CSS de Fase B

**Criterios de aceptación Fase B**:
- [ ] Completar un set de ejercicio con historial → toast de coach en < 1.5s
- [ ] Si la API tarda > 1.5s → silencio total, workout no se bloquea
- [ ] No se repite el mismo feedback para mismo ejercicio/peso en < 30min (caché)
- [ ] El pre-workout briefing aparece si hay historial de esa rutina; no aparece si no hay
- [ ] El post-workout insight aparece con fade-in asíncrono en la summary
- [ ] Si `hs_pref_coach = 'off'` → sin toasts, sin briefing, sin insight
- [ ] Usuario no logueado → todo el coach silencioso (no bloquea nada)

---

*Spec generada: 2026-05-23 | HealthStack Pro v30 — Entreno 2030*
