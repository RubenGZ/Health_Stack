# Workout Logger — Design Spec

> **Para agentes:** implementar con `superpowers:subagent-driven-development`.
> Plan en `docs/superpowers/plans/2026-05-15-workout-logger.md`

**Objetivo:** Módulo de registro de sesiones de entrenamiento estilo Hevy: log de sets/reps/peso,
referencia de sesión anterior, carry-forward de peso dentro de la sesión, historial con gráfico
de progresión. Integración con gamificación, anatomía (Phase B bridge), fatigueHeatmap y autoDeload.

**Stack:** Vanilla JS ES modules, FastAPI + SQLAlchemy 2.0 async, PostgreSQL 17.

---

## 1. Arquitectura general

### Flujo de datos

```
[UI workoutLogger.js]
  ├─ sesión activa → localStorage draft  (hs_workout_active)
  ├─ referencia sesión anterior ← localStorage history (hs_workout_sessions_local)
  └─ al finalizar → POST /api/workout/sessions  →  backend
                                                    ├─ INSERT WorkoutSession + exercises + sets
                                                    ├─ award gamification XP ('workout', 30 XP)
                                                    └─ return { id, total_volume_kg, prs[] }

[workoutSession.js] — modelo de datos en memoria
  ├─ carry-forward: al añadir set nuevo, copia el peso del set anterior del mismo ejercicio
  ├─ progression: sugiere peso_anterior + 2.5 kg para la primera serie de un ejercicio
  └─ resolveExerciseKey(name) → snake_case para muscleMap / anatomyService bridge

[workoutHistory.js] — historial + chart
  ├─ lee hs_workout_sessions_local (cache local)
  └─ GET /api/workout/sessions → paginado, 20 por página

[Phase A Bridge] — fatigueHeatmap + autoDeload
  └─ leen hs_workout_sessions_local para calcular fatiga sin anatomyService
```

### Offline-first

El draft de la sesión activa vive en `localStorage['hs_workout_active']`. Si el usuario
cierra el navegador y vuelve, el draft se restaura automáticamente. El POST al backend
solo ocurre al pulsar "Finalizar sesión" (bulk POST, un solo request).

---

## 2. Modelo de datos (backend)

### WorkoutSession

```python
# backend/app/modules/workout_sessions/models.py
class WorkoutSession(Base):
    __tablename__ = 'workout_sessions'
    id            = Column(Integer, primary_key=True, autoincrement=True)
    user_id       = Column(UUID(as_uuid=True), ForeignKey('public.users.id', ondelete='CASCADE'), nullable=False, index=True)
    routine_id    = Column(Integer, ForeignKey('public.saved_routines.id'), nullable=True)
    started_at    = Column(DateTime(timezone=True), nullable=False)
    finished_at   = Column(DateTime(timezone=True), nullable=True)
    duration_secs = Column(Integer, nullable=True)
    notes         = Column(Text, nullable=True)
    total_volume_kg = Column(Float, nullable=True)   # sum(weight_kg * reps) working sets
```

### SessionExercise

```python
class SessionExercise(Base):
    __tablename__ = 'session_exercises'
    id            = Column(Integer, primary_key=True, autoincrement=True)
    session_id    = Column(Integer, ForeignKey('public.workout_sessions.id', ondelete='CASCADE'), nullable=False, index=True)
    exercise_key  = Column(String(80), nullable=False)   # snake_case muscleMap key
    exercise_name = Column(String(120), nullable=False)  # nombre legible
    order_index   = Column(Integer, nullable=False)
```

Índice: `(session_id, order_index)`.

### ExerciseSet

```python
class ExerciseSet(Base):
    __tablename__ = 'exercise_sets'
    id                  = Column(Integer, primary_key=True, autoincrement=True)
    session_exercise_id = Column(Integer, ForeignKey('public.session_exercises.id', ondelete='CASCADE'), nullable=False, index=True)
    set_number   = Column(Integer, nullable=False)
    weight_kg    = Column(Float, nullable=False)
    reps         = Column(Integer, nullable=False)
    rpe          = Column(Float, nullable=True)    # 6.0–10.0, opcional
    is_warmup    = Column(Boolean, default=False, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
```

**CRÍTICO — user_id es UUID, no Integer.** El campo `users.id` es `UUID(as_uuid=True)`.
Todas las FKs hacia users.id deben usar `Column(UUID(as_uuid=True), ...)`.

---

## 3. API backend

### POST /api/workout/sessions

Bulk-insert de la sesión completa. Requiere JWT.

**Request body:**
```json
{
  "routine_id": 3,
  "started_at": "2026-05-15T10:00:00Z",
  "finished_at": "2026-05-15T11:15:00Z",
  "notes": "Buen día, PR en press banca",
  "exercises": [
    {
      "exercise_key": "press_banca_plano",
      "exercise_name": "Press banca plano",
      "order_index": 0,
      "sets": [
        { "set_number": 1, "weight_kg": 80, "reps": 8, "is_warmup": false, "rpe": 7.5 },
        { "set_number": 2, "weight_kg": 82.5, "reps": 6, "is_warmup": false }
      ]
    }
  ]
}
```

**Response 201:**
```json
{
  "session_id": 42,
  "total_volume_kg": 1620.0,
  "duration_secs": 4500,
  "prs": [
    { "exercise_key": "press_banca_plano", "type": "1rm_estimated", "value": 103.2, "prev": 98.5 }
  ],
  "xp_awarded": 30
}
```

### GET /api/workout/sessions

Paginado, 20 por página. Requiere JWT.

Query params: `?page=1&per_page=20&exercise_key=press_banca_plano`

**Response 200:**
```json
{
  "sessions": [
    {
      "id": 42,
      "started_at": "2026-05-15T10:00:00Z",
      "duration_secs": 4500,
      "total_volume_kg": 1620.0,
      "exercises": ["press_banca_plano", "dominadas_pronas"]
    }
  ],
  "total": 15,
  "page": 1
}
```

### GET /api/workout/sessions/{id}

Detalle completo de una sesión con todos los exercises y sets.

### GET /api/workout/history/{exercise_key}

Historial de un ejercicio específico: máximo peso, 1RM estimado, por sesión.
Usado por workoutHistory.js para el gráfico de progresión.

**Response 200:**
```json
{
  "exercise_key": "press_banca_plano",
  "sessions": [
    { "date": "2026-05-15", "max_weight_kg": 82.5, "max_reps": 8, "estimated_1rm": 103.2, "total_volume_kg": 1320.0 }
  ]
}
```

---

## 4. Lógica de negocio (backend service)

### Cálculo de 1RM estimado (Epley)

```python
def epley_1rm(weight_kg: float, reps: int) -> float:
    if reps == 1:
        return weight_kg
    return weight_kg * (1 + reps / 30)
```

Se calcula solo para sets de trabajo (`is_warmup = False`). El mayor 1RM de la sesión
se compara con el histórico del usuario para detectar PRs.

### Detección de PR

Un PR se registra cuando el 1RM estimado supera el máximo histórico del usuario
para ese `exercise_key`. Los PRs se devuelven en el response del POST.

### Gamificación — acción 'workout'

Al guardar una sesión se llama al servicio de gamificación con `action='workout'`.

**Fix necesario en `gamification/models.py`:**

```python
# Añadir a XP_TABLE:
XP_TABLE: dict[str, int] = {
    "weight":   10,
    "tdee":     15,
    "routine":  20,
    "post":      5,
    "recipe":   10,
    "streak":   25,
    "workout":  30,   # ← NUEVO — sesión de entrenamiento completada
}
```

El campo `action` en `GamificationEvent` tiene `String(30)` — 'workout' cabe sin problema.
Sin embargo, el `Literal[...]` del schema de request de gamificación también debe actualizarse:

```python
# En gamification/schemas.py, ActionRequest:
action: Literal['weight', 'tdee', 'routine', 'post', 'recipe', 'streak', 'workout']
```

---

## 5. Frontend — workoutSession.js (modelo de datos)

Gestiona el estado de la sesión activa en memoria y localStorage.

### Estructura del draft en localStorage

```js
// localStorage['hs_workout_active']
{
  "routineId": 3,
  "startedAt": "2026-05-15T10:00:00.000Z",
  "exercises": [
    {
      "key": "press_banca_plano",
      "name": "Press banca plano",
      "orderIndex": 0,
      "sets": [
        { "setNumber": 1, "weightKg": 80, "reps": 8, "rpe": null, "isWarmup": false, "completedAt": "..." }
      ]
    }
  ]
}
```

### Carry-forward de peso

Cuando el usuario pulsa "Añadir set" en un ejercicio, el nuevo set copia el `weightKg`
del set inmediatamente anterior del mismo ejercicio (no del último completado globalmente).

```js
function addSet(exerciseKey) {
  const ex = session.exercises.find(e => e.key === exerciseKey);
  const lastSet = ex.sets[ex.sets.length - 1];
  const newSet = {
    setNumber:   lastSet ? lastSet.setNumber + 1 : 1,
    weightKg:    lastSet ? lastSet.weightKg : 0,   // ← carry-forward
    reps:        lastSet ? lastSet.reps : 8,
    rpe:         null,
    isWarmup:    false,
    completedAt: null,
  };
  ex.sets.push(newSet);
  savedraft();
}
```

### Peso sugerido de progresión

Al cargar el ejercicio en la sesión activa, se compara con la sesión anterior (leída de
`hs_workout_sessions_local`). Si en la sesión anterior todos los sets de trabajo alcanzaron
el número objetivo de reps con el peso máximo, se sugiere `peso_anterior + 2.5 kg`.

```js
function getSuggestedWeight(exerciseKey) {
  const history = getLocalSessions();
  const prevSession = history.find(s =>
    s.exercises.some(e => e.key === exerciseKey)
  );
  if (!prevSession) return null;

  const prevEx = prevSession.exercises.find(e => e.key === exerciseKey);
  const workingSets = prevEx.sets.filter(s => !s.isWarmup);
  const maxWeight = Math.max(...workingSets.map(s => s.weightKg));
  const allHitTarget = workingSets.every(s => s.reps >= TARGET_REPS);

  return allHitTarget ? maxWeight + 2.5 : maxWeight;
}
```

La sugerencia se muestra como placeholder en el input de peso del primer set. `TARGET_REPS`
se configura globalmente (default: 8).

### resolveExerciseKey(name)

Normaliza el nombre del ejercicio (que viene del objeto rutina o del input libre del usuario)
a una clave snake_case compatible con `muscleMap.js`:

```js
const EXERCISE_NAME_MAP = {
  'press banca plano':         'press_banca_plano',
  'press banca':               'press_banca_plano',
  'press inclinado':           'press_banca_inclinado',
  'aperturas':                 'aperturas_mancuernas',
  'fondos':                    'fondos_pecho',
  'dominadas':                 'dominadas_pronas',
  'remo barra':                'remo_barra',
  'jalón':                     'jalon_pecho',
  'remo mancuerna':            'remo_mancuerna',
  'peso muerto':               'peso_muerto_convencional',
  'press militar':             'press_militar_barra',
  'elevaciones laterales':     'elevaciones_laterales',
  'pájaros':                   'pajaros_mancuernas',
  'face pull':                 'face_pull',
  'curl barra':                'curl_barra',
  'curl martillo':             'curl_martillo',
  'extensión tríceps':         'extension_triceps_polea',
  'press francés':             'press_frances',
  'plancha':                   'plancha',
  'crunch':                    'crunch',
  'ab wheel':                  'ab_wheel',
  'sentadilla':                'sentadilla',
  'prensa':                    'prensa_piernas',
  'extensión cuádriceps':      'extension_cuadriceps',
  'curl femoral':              'curl_femoral_tumbado',
  'sentadilla búlgara':        'sentadilla_bulgara',
  'hip thrust':                'hip_thrust',
  'kickback':                  'kickback_cable',
  'puente glúteos':            'puente_gluteos',
};

export function resolveExerciseKey(name) {
  const normalized = name.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');   // quita tildes
  return EXERCISE_NAME_MAP[normalized]
    ?? normalized.replace(/\s+/g, '_');   // fallback: snake_case
}
```

---

## 6. Frontend — workoutLogger.js (UI)

### Estados de la UI

```
IDLE     → botón "Iniciar sesión" visible
ACTIVE   → cronómetro + lista de ejercicios + sets editables
SUMMARY  → resumen post-sesión: volumen, duración, PRs, XP ganada
```

### Flujo

1. **IDLE → ACTIVE**: usuario pulsa "Iniciar sesión" o "Continuar sesión" (si hay draft).
2. **ACTIVE**: usuario añade ejercicios (dropdown con ejercicios de la rutina + buscador libre),
   añade sets, edita peso/reps, marca sets como completados.
3. **ACTIVE → SUMMARY**: usuario pulsa "Finalizar". Se calcula duración, se llama al backend,
   se muestra el resumen. Se borra el draft de localStorage.
4. **SUMMARY → IDLE**: usuario cierra el resumen.

### Referencia de sesión anterior

En el panel de cada ejercicio, debajo del nombre, aparece:
```
Última vez (12 mayo): 80 kg × 8 | 82.5 kg × 6
```

Los datos se leen de `hs_workout_sessions_local` antes de que el POST llegue al backend.

### Formato del ejercicio en la UI

```
[Ejercicio: Press banca plano]              [Anterior: 80×8]
Set 1  [Calentamiento]  □ kg: [60]  reps: [10]  ✓
Set 2                   □ kg: [80]  reps: [8]   ✓
Set 3                   □ kg: [80]  reps: [8]   (sugerido: 82.5)
[+ Añadir set]
```

### Sección en index.html

```html
<!-- Sección entrenos — nueva en el dashboard -->
<section id="workout-section" class="health-card">
  <h2 class="section-title">Entrenos</h2>
  <div id="workout-logger-root"></div>
  <div id="workout-history-root"></div>
</section>
```

---

## 7. Frontend — workoutHistory.js

Muestra el historial de sesiones y un gráfico de progresión por ejercicio.

### Lista de sesiones

Tarjetas compactas: fecha, duración, ejercicios principales, volumen total.
Paginado localmente (primero lee `hs_workout_sessions_local`, luego complementa con
GET /api/workout/sessions si hay más).

### Gráfico de progresión

Selector de ejercicio → gráfico de línea con `1RM estimado` a lo largo del tiempo.
Usa `canvas` nativo con línea simple (sin librería externa). Datos de GET /api/workout/history/{key}.

---

## 8. Phase A Bridge — fatigueHeatmap y autoDeload

fatigueHeatmap.js actualmente lee `hs_pr_records` para inferir cuándo se entrenó
cada músculo. Con este módulo, el bridge cambia a `hs_workout_sessions_local`:

### Formato de hs_workout_sessions_local

```js
// localStorage['hs_workout_sessions_local']
[
  {
    id: 42,           // session_id del backend (o timestamp si no llegó aún)
    startedAt: "2026-05-15T10:00:00.000Z",
    durationSecs: 4500,
    totalVolumeKg: 1620.0,
    exercises: [
      { key: "press_banca_plano", name: "Press banca plano", sets: [...] }
    ]
  }
]
// Máximo 90 sesiones guardadas (FIFO). Sobrescribe las más antiguas.
```

### Fix en fatigueHeatmap.js

`getLastTrained()` debe leer también `hs_workout_sessions_local`:

```js
function getLastTrained() {
  var lastTrained = {};

  // Fuente 1: sesiones del workout logger (nueva, prioritaria)
  try {
    var sessions = JSON.parse(localStorage.getItem('hs_workout_sessions_local') || '[]');
    sessions.forEach(function(session) {
      var date = new Date(session.startedAt);
      (session.exercises || []).forEach(function(ex) {
        Object.keys(MUSCLE_MAP).forEach(function(muscle) {
          var keywords = MUSCLE_MAP[muscle];
          var matches = keywords.some(function(kw) {
            return ex.name.toLowerCase().indexOf(kw.toLowerCase()) !== -1;
          });
          if (matches && (!lastTrained[muscle] || date > lastTrained[muscle])) {
            lastTrained[muscle] = date;
          }
        });
      });
    });
  } catch(e) {}

  // Fuente 2: hs_pr_records legacy (fallback para usuarios que no han loggeado sesiones)
  try {
    var prs = JSON.parse(localStorage.getItem('hs_pr_records') || '{}');
    // ... lógica existente, solo aplica si lastTrained[muscle] no está ya poblado
  } catch(e) {}

  return lastTrained;
}
```

---

## 9. Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `backend/app/modules/workout_sessions/models.py` | Nuevo — WorkoutSession, SessionExercise, ExerciseSet |
| `backend/app/modules/workout_sessions/schemas.py` | Nuevo — Pydantic in/out |
| `backend/app/modules/workout_sessions/repository.py` | Nuevo — queries async |
| `backend/app/modules/workout_sessions/service.py` | Nuevo — Epley, PR detection, gamif. |
| `backend/app/modules/workout_sessions/router.py` | Nuevo — POST /api/workout/sessions, GET endpoints |
| `backend/app/modules/gamification/models.py` | Añadir 'workout': 30 a XP_TABLE |
| `backend/app/modules/gamification/schemas.py` | Añadir 'workout' al Literal de ActionRequest |
| `backend/app/main.py` | Registrar router de workout_sessions |
| `alembic/versions/` | Nueva migración para 3 tablas |
| `frontend/js/workoutSession.js` | Nuevo — modelo draft, carry-forward, resolveExerciseKey, getSuggestedWeight |
| `frontend/js/workoutLogger.js` | Nuevo — UI states IDLE/ACTIVE/SUMMARY |
| `frontend/js/workoutHistory.js` | Nuevo — historial + canvas chart |
| `frontend/js/fatigueHeatmap.js` | Fix getLastTrained() para leer hs_workout_sessions_local |
| `frontend/index.html` | Añadir sección #workout-section |
| `frontend/css/main.css` | Estilos para workout logger (integrar en estilos existentes) |
| `tests/integration/test_workout_sessions.py` | Tests de integración |
