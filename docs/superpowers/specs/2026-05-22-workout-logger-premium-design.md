# Workout Logger Premium — Spec
**Fecha:** 2026-05-22
**Estado:** Aprobado — listo para implementación
**Rama:** Sub-proyecto A (Hevy Parity + Disruptive Layer 1)
**Objetivo:** Superar a Hevy, Strong y FitBod en el workout logger. Ser la app de logging de fuerza #1 global.

---

## Contexto y motivación

### Estado actual
El logger de HealthStack tiene la base funcional: sets, warmups auto-generados, progressive overload, rest timer, visor anatómico 3D. Lo que falta es la capa de inteligencia y la experiencia premium que retiene usuarios.

### Análisis competitivo (audit 2026-05-22)
| Feature | Hevy | Strong | FitBod | **HealthStack post-spec** |
|---|---|---|---|---|
| PREVIOUS por set | ✅ | ✅ | ❌ | ✅ |
| PR badges live | ✅ | ✅ | ❌ | ✅ |
| Rest timer por ejercicio | ✅ | ✅ | ❌ | ✅ |
| Visor anatómico | 2D | ❌ | ❌ | **3D único** |
| Progressive overload auto | ❌ | manual | AI opaco | **✅ +2.5kg transparente** |
| Warmup auto-generado | ❌ | ❌ | ❌ | **✅ único en mercado** |
| 1RM con zonas de entrenamiento | básico | básico | ❌ | **✅ con evolución histórica** |
| Plate calculator | ❌ | ✅ | ❌ | ✅ |
| Pausa sesión | ❌ | ❌ | ❌ | **✅ único** |
| Inactividad timeout | ❌ | ❌ | ❌ | **✅ único** |
| Export datos | ❌ | CSV | ❌ | ✅ JSON |
| Precio free tier | 3 rutinas | nada | nada | **todo gratis** |

### Ventajas únicas que ningún competidor tiene
1. **Warmup auto-generado** escalado al peso de trabajo — ya construido
2. **Anatomy viewer 3D** con Three.js — ya construido
3. **Pausa con persistencia** — este spec
4. **Inactivity timeout** — este spec
5. **1RM con zonas de color** — este spec
6. **Plate calculator** — este spec

---

## Arquitectura — Approach 2: Split Modular

### Ficheros nuevos
```
frontend/js/workoutPR.js       ~120 líneas — PR detection y historial
frontend/js/oneRepMax.js       ~150 líneas — fórmulas 1RM, tabla nRM, plate calc
```

### Ficheros modificados
```
frontend/js/workoutLogger.js   — UI: PREVIOUS col, PR badges, pausa, inactividad, sets×reps badge
frontend/js/workoutSession.js  — modelo: pause/resume, pausedAt, inactivity tracking
frontend/js/workoutHistory.js  — nueva pestaña: Calculadora + Export JSON
frontend/index.html            — pestaña calculadora, estructura
frontend/sw.js                 — v41, +2 assets al cache
```

### Dependencias entre módulos
```
workoutLogger.js
  ├── import * as Session from './workoutSession.js'   (existente)
  ├── import * as PR      from './workoutPR.js'        (nuevo)
  └── import * as ORM     from './oneRepMax.js'        (nuevo)

workoutHistory.js (calculadora standalone)
  ├── import * as ORM from './oneRepMax.js'
  └── import * as PR  from './workoutPR.js'
```

---

## Módulo 1 — `workoutPR.js`

### Responsabilidad
Detectar si un set completado es récord personal y mantener el historial de PRs por ejercicio en localStorage (`hs_prs`).

### API pública

```javascript
// Obtiene el mejor PR histórico para un ejercicio
getExercisePR(exerciseKey)
// → { weightKg: number, reps: number, oneRM: number, date: string } | null

// Evalúa si un set completado es PR (llamar ANTES de saveSetPR)
detectSetPR(exerciseKey, weightKg, reps)
// → { isPR: boolean, type: 'weight' | 'oneRM' | 'volume' | null, delta: number }
// delta = diferencia vs PR anterior (ej: +3.2 kg de 1RM)

// Guarda un nuevo PR en el historial
saveSetPR(exerciseKey, weightKg, reps)
// → void

// Historial completo de PRs para gráfico de evolución
getPRHistory(exerciseKey)
// → [{ date: string, weightKg: number, reps: number, oneRM: number }, ...]
```

### Tipos de PR detectados
- **weight** — más kg absolutos que en cualquier set previo de este ejercicio
- **oneRM** — mejor 1RM estimado (puede ser más reps con menos peso: 75kg×12 puede superar 80kg×5)
- **volume** — mejor set individual por volumen (kg × reps)

Un set puede ser PR de uno, dos o los tres tipos a la vez. Se muestra el de mayor impacto.

### Persistencia
```javascript
localStorage['hs_prs'] = {
  "press_banca_plano": [
    { date: "2026-05-22T10:30:00Z", weightKg: 82.5, reps: 8, oneRM: 93.25 },
    ...
  ],
  ...
}
```
Máximo 200 entradas por ejercicio. Las más antiguas se eliminan primero.

---

## Módulo 2 — `oneRepMax.js`

### Responsabilidad
Cálculos de 1RM, tabla nRM por rango 1-12, zonas de entrenamiento, plate calculator y recuperar historial de 1RM estimados desde sesiones locales.

### API pública

```javascript
// Fórmula de Epley: peso × (1 + reps/30)
epley(weightKg, reps)  → number

// Fórmula de Brzycki (más precisa para reps bajas ≤6): peso × 36/(37-reps)
brzycki(weightKg, reps)  → number

// Promedio ponderado: usa Brzycki si reps ≤ 6, Epley si reps > 6
best1RM(weightKg, reps)  → number

// Peso para n repeticiones a partir de 1RM
nRM(oneRM, n)  → number

// Tabla completa 1RM → 12RM con zonas de entrenamiento
buildTable(weightKg, reps)
// → [{ n: 1, kg: 108, zone: 'strength_max', color: '#ef4444' }, ...]

// Historial de 1RM estimados para un ejercicio (desde localStorage)
getHistory(exerciseKey)
// → [{ date: string, weightKg: number, reps: number, oneRM: number }, ...]

// Plate calculator
plateCalc(targetKg, barKg)
// → { achievable: boolean, plates: [{ kg: number, count: number }, ...], totalKg: number }
// Placas disponibles: 25, 20, 15, 10, 5, 2.5, 1.25 (por lado)
```

### Zonas de entrenamiento
| Reps | Zona | Color |
|---|---|---|
| 1 | Fuerza máxima | `#ef4444` rojo |
| 2–3 | Fuerza | `#f97316` naranja |
| 4–5 | Fuerza-Hipertrofia | `#eab308` amarillo |
| 6–8 | Hipertrofia | `#8b5cf6` morado |
| 9–12 | Hipertrofia-Resistencia | `#3b82f6` azul |

---

## Cambios en `workoutLogger.js`

### 2.1 — Set row rediseñado

**Columnas actuales:** `Set | Cal | Peso kg | × | Reps | ✓ | ×`

**Columnas nuevas:** `Set | Anterior | Peso kg | × | Reps | 1RM | ✓ | ×`

- **Anterior:** muestra el peso×reps exacto del mismo número de set de la última sesión (set 1 → anterior set 1, no la media). Si no hay dato: `—`
- **1RM:** se rellena al completar el set. Antes de completar muestra `—`. Formato: `98 kg`
- Los sets de calentamiento (`isWarmup: true`) NO muestran columna Anterior ni 1RM — solo peso y reps
- La columna "Cal" (checkbox warmup) se elimina del header visible — el estado warmup se indica solo con el estilo visual de la fila (fondo más apagado)

**Fila de trabajo completada con PR:**
```
 1   80×8   82.5  ×  8   98kg  ✓  ×
     └──────────── borde dorado, badge "PR" en celda de peso ──────────┘
```

### 2.2 — Badge sets×reps en cabecera del ejercicio

Si el ejercicio viene de una rutina cargada, mostrar debajo del nombre:
```
Press Banca (Barra)
4×8  ·  ◷ 3 min          ← badge sets×reps + rest time
```
Si no viene de rutina, no se muestra el badge.

### 2.3 — PR Detection flow

Al pulsar ✓ en un set de trabajo:
1. Flush de DOM → `Session.updateSet()`
2. `PR.detectSetPR(key, kg, reps)` → evalúa los 3 tipos
3. Si `isPR`:
   a. `PR.saveSetPR(key, kg, reps)`
   b. Añadir clase `wl-set-pr` a la fila → borde `#f59e0b`, badge `PR`
   c. Calcular 1RM con `ORM.best1RM()` → rellenar celda 1RM
   d. Si es el primer PR del ejercicio en esta sesión: disparar toast "Nuevo Récord"
4. Si no es PR: calcular 1RM igualmente y rellenar celda

**Toast "Nuevo Récord":**
```
◉  Nuevo Récord — Press Banca
   1RM estimado: 98 kg  (+3.2 kg)
```
- Posición: bottom center, sobre la nav
- Duración: 4 segundos, fade out
- No bloquea interacción
- Máximo 1 toast activo a la vez (los siguientes hacen queue)

### 2.4 — Rest timer en cabecera de ejercicio

Debajo del nombre + badge, un indicador de cuenta atrás activo cuando el rest timer está corriendo para ese ejercicio:

```
Press Banca (Barra)
4×8  ·  ◷ 02:34  ←  cuenta regresiva activa (reemplaza "3 min" estático)
```

Cuando el timer no está activo, muestra el tiempo configurado estático (`◷ 3 min`).
Al completar un set de trabajo → el timer empieza → el header del ejercicio actualiza en tiempo real.

### 2.5 — Botón de pausa

**Posición en header:**
```
[00:47]  1.240 kg    [II]  [Finalizar]
```
`[II]` = icono pausa. Al pausar → `[▶]` = icono play.

**Comportamiento al pausar:**
1. `_pausedAt = Date.now()` guardado en el draft
2. Timer de sesión congelado (no incrementa)
3. Rest timer se pausa si estaba corriendo
4. Overlay semitransparente sobre la lista de ejercicios
5. Texto centrado: `Sesión pausada · Toca ▶ para continuar`
6. El botón Finalizar sigue visible y funcional durante la pausa

**Comportamiento al reanudar:**
1. `_totalPausedMs += (Date.now() - _pausedAt)` acumulado
2. Timer de sesión excluye el tiempo pausado
3. Overlay desaparece
4. Rest timer retoma si quedaba tiempo

**Customización (en Perfil → Preferencias de Entreno):**
- Posición del botón: `izquierda` (junto al timer) | `derecha` (junto a Finalizar) — default: izquierda
- Comportamiento: `solo timer` | `bloquea sets` — default: solo timer
  - "Bloquea sets": durante la pausa los inputs de peso/reps y el botón ✓ están deshabilitados

**Persistencia:** El estado `pausedAt` y `totalPausedMs` se guardan en el draft de localStorage. Si el usuario cierra la app durante una pausa y vuelve, la sesión sigue pausada.

### 2.6 — Gestión de inactividad

**Definición de inactividad:** ningún set completado, ningún input modificado, ningún botón pulsado dentro del logger.

**Implementación:**
- Variable `_lastActivityAt = Date.now()` actualizada en cada acción del usuario
- Check cada 60 segundos con `setInterval`
- La pausa congela el contador

**A los 10 minutos (600s) de inactividad:**
Toast persistente (no desaparece solo):
```
◷  ¿Sigues ahí?  Llevas 10 min sin registrar nada.
   [Continuar]   [Finalizar sesión]
```
- `[Continuar]` → resetea `_lastActivityAt`, elimina toast
- `[Finalizar sesión]` → ejecuta `onFinish()` normalmente

**A los 60 minutos (3600s) de inactividad:**
1. `onFinish()` se ejecuta automáticamente con los datos registrados hasta ese momento
2. La sesión se guarda con `notes: "Sesión cerrada automáticamente por inactividad"`
3. Se muestra el resumen normal

**Durante pausa:** el contador de inactividad se congela. Pausar es acción consciente.

### 2.7 — Tabla de músculos en resumen de sesión

Al finalizar, en la pantalla de resumen, después de las stat boxes:

```
Músculos trabajados
████████████████████  Pecho         4 sets
██████████████        Tríceps       3 sets
████████              Hombros       2 sets
████                  Core          1 set
```

- Solo cuenta sets de trabajo completados (no warmups, no sets sin `completedAt`)
- Datos del muscle map del anatomy viewer ya existente
- Barras de progreso relativas al máximo (el músculo más trabajado = barra 100%)
- Colores: mismo esquema del visor anatómico (`#6c63ff` primary, `#a78bfa` secondary)

---

## Calculadora 1RM Standalone

### Acceso
Nueva pestaña "Calculadora" dentro de la sección de Entrenos (junto a "Historial").

### Zona 1 — Input

```
Ejercicio
[ Press Banca (Barra)          ▾ ]
                                    ← autocomplete: tu historial primero, luego DB completa
Mejor set registrado: 80 kg × 8    ← pre-rellena con el mejor set histórico
                                       si no hay historial, campos vacíos

[ 82.5 ] kg    [ 8 ] reps          ← editables para simulación

Fórmula: ● Epley  ○ Brzycki  ○ Promedio
```

Recálculo en tiempo real al cambiar cualquier input (sin botón "Calcular").
Si se borra el ejercicio → modo genérico (tabla sin gráfico de evolución).

### Zona 2 — Tabla 1RM → 12RM con zonas

```
Tu 1RM estimado: 108.5 kg

  1 RM  →  108 kg   ██  Fuerza máxima
  2 RM  →  105 kg   ██  Fuerza máxima
  3 RM  →  102 kg   ██  Fuerza
  4 RM  →   99 kg   ██  Fuerza
  5 RM  →   96 kg   ██  Fuerza-Hipertrofia
  6 RM  →   93 kg   ██  Hipertrofia
  8 RM  →   87 kg   ██  Hipertrofia         ← zona actual (highlighted)
 10 RM  →   81 kg   ██  Hipertrofia-Resist.
 12 RM  →   76 kg   ██  Resistencia

Tu zona actual: Hipertrofia (8 reps)
```

La fila correspondiente a las reps introducidas se destaca visualmente.

### Zona 3 — Evolución histórica del 1RM

```
1RM estimado — Press Banca  (últimos 6 meses)

110 ┤                                    ●  108.5 kg
100 ┤                    ╭───────────────╯
 90 ┤          ╭─────────╯
 80 ┤  ●───────╯
    └───────────────────────────────────────────────
    Dic       Ene       Feb       Mar      Abr     Hoy

Progreso total: +28.5 kg (+35%) en 6 meses
```

- Usa Canvas API (mismo que `workoutHistory.js`)
- Cada punto = sesión donde se registró este ejercicio
- Hover/tap en punto → tooltip con fecha y valor
- Si hay menos de 2 sesiones → mensaje: *"Completa más sesiones con este ejercicio para ver tu evolución"*

### Zona 4 — Plate Calculator

```
Plate Calculator
Barra: ● Olímpica (20 kg)  ○ Estándar (15 kg)  ○ Curl (10 kg)
Peso objetivo: [ 102.5 kg ]

Cada lado:  1× 20 kg  +  1× 20 kg  +  1× 2.5 kg
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total: 102.5 kg ✓  (41.25 kg cada lado + 20 kg barra)
```

- Placas disponibles: 25, 20, 15, 10, 5, 2.5, 1.25 kg
- Si el peso no es alcanzable exactamente → muestra la opción más cercana por debajo y por encima
- El peso objetivo se pre-rellena con el valor de la tabla que el usuario toque

---

## Export JSON

### Acceso
Botón "Exportar mis datos" en la sección de Historial, parte superior.

### Formato de salida
```json
{
  "export_date": "2026-05-22T10:30:00Z",
  "app": "HealthStack Pro",
  "sessions": [
    {
      "id": 1234567890,
      "startedAt": "2026-05-21T08:00:00Z",
      "durationSecs": 3600,
      "totalVolumeKg": 7200,
      "exercises": [
        {
          "name": "Press Banca (Barra)",
          "key": "press_banca_plano",
          "sets": [
            { "setNumber": 1, "weightKg": 82.5, "reps": 8, "isWarmup": false, "completedAt": "..." }
          ]
        }
      ]
    }
  ],
  "prs": { "press_banca_plano": [...] }
}
```

- Genera el JSON desde `localStorage` (sesiones locales + PRs)
- Descarga como `healthstack-export-YYYY-MM-DD.json` vía `URL.createObjectURL`
- Cero backend necesario

---

## Cambios en `workoutSession.js`

### Campos nuevos en el draft
```javascript
{
  routineId: string | null,
  startedAt: string,           // existente
  exercises: [...],            // existente
  pausedAt: number | null,     // NEW: timestamp ms cuando se pausó, null si activo
  totalPausedMs: number,       // NEW: ms acumulados en pausa (para calcular duración real)
}
```

### Funciones nuevas
```javascript
export function pauseSession(session)   // → setea pausedAt = Date.now()
export function resumeSession(session)  // → acumula totalPausedMs, resetea pausedAt
export function getActiveDuration(session)  // → ms - totalPausedMs (duración real)
```

---

## Cambios en `sw.js`

- `CACHE_NAME` bumpeado a `healthstack-v41`
- Añadir a `STATIC_ASSETS`:
  - `/js/workoutPR.js`
  - `/js/oneRepMax.js`

---

## Ficheros a modificar en `index.html`

1. Añadir `<script type="module" src="/js/workoutPR.js">` — no necesario si se importa desde workoutLogger vía ES modules
2. Añadir pestaña "Calculadora" en la sección de Entrenos (junto a "Historial")
3. Añadir estructura HTML para la calculadora standalone

---

## Orden de implementación recomendado

El orden minimiza riesgo: cada paso es independiente y testable.

1. **`oneRepMax.js`** — solo matemáticas, cero dependencias, testable en consola
2. **`workoutPR.js`** — depende solo de localStorage, testable en consola
3. **Set row con PREVIOUS** — UI pura, no rompe nada existente
4. **PR badges + toast** — integra `workoutPR.js` en el logger
5. **1RM inline en set** — integra `oneRepMax.js` en el logger
6. **Pausa + inactividad** — modifica `workoutSession.js` + logger
7. **Sets×reps badge** — una línea, máximo impacto mínimo riesgo
8. **Tabla de músculos en resumen**
9. **Calculadora standalone** — nueva sección en historial
10. **Plate Calculator** — dentro de `oneRepMax.js`, integrado en calculadora
11. **Export JSON** — botón en historial
12. **SW v41 + cache** — último paso siempre

---

## Criterios de éxito

- Un usuario que viene de Hevy puede hacer su primer entreno completo sin echar de menos ninguna feature de Hevy
- La columna PREVIOUS muestra datos correctos en el primer entreno post-historial
- Los PRs se detectan correctamente en los 3 tipos sin falsos positivos
- La pausa persiste al recargar la página
- El inactivity timeout funciona a los 10 min y auto-cierra a los 60 min
- La calculadora 1RM se actualiza en tiempo real al cambiar inputs
- El plate calculator da el resultado correcto para pesos estándar de gym
- El export JSON descarga un fichero válido con todas las sesiones

---

## Notas de implementación

- **PR storage:** `hs_prs` en localStorage — no enviar al backend en este sprint (privacidad + simplicidad). Sincronización con backend = Sub-proyecto D futuro.
- **1RM en logger:** mostrar solo para sets de trabajo (no warmups). Si reps > 30 la fórmula de Epley se vuelve poco fiable — mostrar `—` para reps > 20.
- **PREVIOUS por posición de set:** si la última sesión tenía 3 sets y la actual tiene 4, el set 4 muestra `—`. Nunca inventar datos.
- **Plate calculator:** si el peso no es alcanzable con las placas disponibles, mostrar el alcanzable más cercano por defecto y dar opción de ver el superior.
- **Zona de entrenamiento actual:** se calcula a partir de las REPS introducidas, no del 1RM. Si introduces 8 reps, la zona es Hipertrofia aunque peses 200kg.
