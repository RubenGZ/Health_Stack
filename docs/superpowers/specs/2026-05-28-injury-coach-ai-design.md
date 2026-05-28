# Injury-Aware Routine Generator + Post-Workout AI Coach
**Spec Date:** 2026-05-28  
**Status:** Approved for implementation  
**Scope:** Two related modules — chronic injury management integrated with AI-driven progressive overload

---

## Overview

Two new capabilities extending the existing workout ecosystem:

**Módulo A — Injury-Aware Routine Generator:** The user registers chronic injuries (permanent conditions they manage long-term, not acute injuries in recovery). The AI routine generator incorporates these constraints and generates training plans that avoid aggravating known conditions while still producing effective progressive overload.

**Módulo B — Post-Workout AI Coach:** After finishing a workout, an AI analysis (Groq llama-3.3-70b-versatile) reviews the session data and the user's workout notes, then generates a concrete plan for the next training session: specific weights, sets, and reps per exercise, with a brief explanation. The plan is pre-loaded when the user starts their next workout. The AI also predicts deload needs and routes specific complaints (pain mentions in notes) to the rehab module.

These two modules are designed to interlock: chronic injuries registered in Módulo A are passed as context to the Módulo B AI analysis, so the post-workout coach understands the user's permanent constraints.

---

## Context: Existing System

### What already exists
- `workout_sessions` module: `WorkoutSession` table with `notes` field (Text), `SessionExercise`, `ExerciseSet`; endpoints for create/list/detail/history; Epley 1RM calculation
- `routines` module: `POST /api/v1/routines/ai-generate` using Groq via AIRouter; `AIRoutineRequest` schema (goal, level, days_per_week, equipment)
- `ai_coach` module: intra-session set feedback via AIRouter; established pattern for Groq calls with graceful fallback
- `rehab` module: acute rehab protocols with `BodyArea` and `InjuryType` Literals — these types will be reused
- `autoDeload.js`: frontend deload signal detector reading localStorage (readiness + load drop + 1RM plateau signals)
- `workoutSession.js`: draft session in localStorage, history management

### Key design constraints
- AIRouter pattern (not direct Groq calls) — always use `app.state.ai_router`
- RGPD: never send PII (user_id, email, display_name) to external AI — use anonymous context like `ai_insights` does
- Graceful fallback: if AI call fails, always return a usable static response
- Rate limiting: use global rate limit (no `@limiter.limit()` with `Depends()`)
- Architecture: Router → Service → Repository → Model, one module per feature area

---

## Módulo A — Injury-Aware Routine Generator

### A.1 Data Model

**New table: `user_chronic_injuries`**

```
user_chronic_injuries
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
  body_area      VARCHAR(30) NOT NULL   -- reuses BodyArea values from rehab module
  injury_label   VARCHAR(100) NOT NULL  -- user-friendly name: "Menisco derecho", "Hombro izquierdo"
  severity       VARCHAR(10) NOT NULL   -- 'mild' | 'moderate' | 'severe'
  notes          TEXT                   -- optional: "surgery 2021, avoid overhead"
  is_active      BOOLEAN DEFAULT TRUE   -- soft delete
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT now()
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT now()
  
  INDEX on (user_id, is_active)
```

`body_area` reuses the same `BodyArea` Literal from `rehab/schemas.py`: shoulder, elbow, wrist, lower_back, hip, knee, ankle, neck, thoracic.

`severity` drives how aggressively exercises are excluded or modified:
- `mild`: avoid high-load variants, substitute with joint-friendly alternatives
- `moderate`: exclude all direct stress on that joint, include rehab-compatible exercises
- `severe`: complete avoidance of the affected kinetic chain

### A.2 API Endpoints

All under prefix `/api/v1/routines`, extending the existing router.

**`GET /api/v1/routines/injuries`**  
Returns the user's list of active chronic injuries.  
Response: `list[ChronicInjuryOut]`

**`POST /api/v1/routines/injuries`**  
Register a new chronic injury.  
Body: `ChronicInjuryCreate(body_area, injury_label, severity, notes)`  
Response: `ChronicInjuryOut` (201)

**`DELETE /api/v1/routines/injuries/{injury_id}`**  
Soft-deletes (sets `is_active=False`). Hard delete not exposed to prevent accidental data loss.  
Response: 204

**`POST /api/v1/routines/ai-generate-injury-aware`**  
Generates an injury-aware routine. Extends the existing `ai-generate` endpoint by fetching the user's chronic injuries from DB and injecting them into the AI prompt.  
Body: same as `AIRoutineRequest` (goal, level, days_per_week, equipment)  
Response: `AIRoutineResponse` (same schema as existing, fully compatible)

This endpoint fetches injuries internally — the client does not need to pass them explicitly. This prevents stale client-side injury data from being used.

### A.3 AI Prompt Design (Injury-Aware Generation)

The injury context is appended to the existing routine generation prompt:

```
RESTRICCIONES POR LESIONES CRÓNICAS DEL USUARIO:
- Rodilla (severidad: moderada): evitar sentadilla profunda (>90°), leg press con rango completo, 
  lunges con impacto. Sustituir por: prensa con rango limitado (0-70°), sentadilla goblet suave, 
  step-ups controlados, extensión de cuádriceps en rango corto.
- Hombro izquierdo (severidad: leve): evitar press overhead con barra. Usar mancuernas con rango 
  reducido, priorizar face pulls y rotaciones externas.

REGLA IMPORTANTE: Para cada ejercicio que involucre una zona lesionada, incluye en el campo 
"notes" del ejercicio la modificación aplicada y el motivo.
```

The service builds this block from the injury records. If no injuries, the block is omitted and the request routes to the existing `generate_ai_routine` logic unchanged.

### A.4 Frontend Integration

**`frontend/js/routineGenerator.js`** (existing file) gains a new section:

- "Mis lesiones crónicas" card in the routine generator wizard, shown before the AI generate button
- Chips for each registered injury (color-coded by severity: gold=mild, amber=moderate, red=severe)
- "Añadir lesión" button opens a compact form: body area selector (reuses rehab module's `BODY_AREAS` list), free-text label, severity picker
- When injuries are registered, the "Generar rutina" button switches to "Generar rutina adaptada" and calls `ai-generate-injury-aware` instead of `ai-generate`
- Injuries persist in the backend (not localStorage) — fetched fresh on mount

**No new JS file required.** The injury CRUD and display logic lives inside the existing `routineGenerator.js` module as a new `InjuryManager` sub-object.

---

## Módulo B — Post-Workout AI Coach

### B.1 Data Model

**New table: `workout_ai_plans`**

```
workout_ai_plans
  id               INTEGER PRIMARY KEY AUTOINCREMENT
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
  source_session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT now()
  expires_at       TIMESTAMP WITH TIME ZONE              -- set to created_at + 7 days
  plan_json        JSONB NOT NULL                        -- the AI-generated plan
  coach_notes      TEXT                                  -- AI explanation for the user
  deload_signal    BOOLEAN DEFAULT FALSE                 -- AI flagged deload needed
  used             BOOLEAN DEFAULT FALSE                 -- set to true when applied to next session
  
  INDEX on (user_id, used, expires_at)
  UNIQUE(source_session_id)  -- one plan per session
```

`plan_json` structure:

```json
{
  "exercises": [
    {
      "exercise_key": "press_banca_plano",
      "exercise_name": "Press banca plano",
      "sets": [
        {"set_number": 1, "weight_kg": 80.0, "reps": 5, "is_warmup": true},
        {"set_number": 2, "weight_kg": 90.0, "reps": 4},
        {"set_number": 3, "weight_kg": 90.0, "reps": 4},
        {"set_number": 4, "weight_kg": 90.0, "reps": 3}
      ],
      "notes": "Sube 2.5kg del press banca. RPE objetivo: 8/10."
    }
  ]
}
```

### B.2 API Endpoints

All under prefix `/api/v1/workout`.

**`POST /api/v1/workout/sessions/{session_id}/post-workout-analysis`**  
Triggers the AI analysis for a completed session.  
- Fetches the full session (exercises + sets + notes) from DB
- Fetches the user's last 5 sessions for context (for trend detection)
- Fetches the user's chronic injuries (if the injury module exists)
- Calls Groq via AIRouter; graceful fallback to a simple "maintain current weights" plan
- Persists result to `workout_ai_plans`
- Returns the plan immediately (sync, not async background job)  

Response: `PostWorkoutPlanOut`  
Rate limit: governed by global rate limit (10 calls/minute per user max via global limiter)

**`GET /api/v1/workout/next-session-plan`**  
Returns the latest unused, non-expired AI plan for the current user.  
Used by the frontend when the user starts a new workout — pre-populates weights.  
Response: `PostWorkoutPlanOut | null` (200 with `null` body if no plan available)

**`POST /api/v1/workout/next-session-plan/apply`**  
Marks the current unused plan as `used=True`.  
Called when the user begins a workout and the plan has been loaded.  
Response: 204

### B.3 AI Analysis Design

**Input context sent to Groq (RGPD-safe — no PII):**

```
Análisis post-entrenamiento. Calcula los sets y pesos para la próxima sesión.

SESIÓN COMPLETADA (ID anónimo):
- Duración: 68 min
- Volumen total: 4,820 kg
- Notas del atleta: "buenas sensaciones en press banca, leve molestia en codo derecho 
  haciendo curl martillo"

EJERCICIOS DE HOY:
- Press banca plano: 4 series → 85kg×5, 87.5kg×4, 87.5kg×4, 87.5kg×3 (RPE último set: 9)
- Curl martillo: 3 series → 18kg×10, 18kg×9, 18kg×8

HISTORIAL RECIENTE (últimas 4 sesiones):
- Press banca: 82.5kg, 85kg, 85kg, 87.5kg (tendencia: +1.25kg/semana)
- Curl martillo: 16kg, 17kg, 18kg, 18kg (plateau 2 semanas)

LESIONES CRÓNICAS:
- Codo derecho (leve): tendinopatía. Evitar extensiones de codo con agarre cerrado bajo carga.

REGLAS DE SOBRECARGA PROGRESIVA:
1. Si el último set se completó con RPE ≤ 8 y las reps objetivo se lograron: sube 2.5kg.
2. Si RPE 9-10 o reps cortas (>1 rep por debajo del objetivo): mantén peso.
3. Si las notas mencionan dolor en una zona: reduce 10% ese ejercicio y añade una nota de 
   precaución. Si el dolor persiste más de 2 sesiones consecutivas, señala rehab.
4. Si detectas plateau (mismo peso 3+ sesiones): propón variación de reps (-2 reps, +5kg) 
   o técnica avanzada (drop set, pausa, tempo).
5. Si el volumen total cayó >20% respecto a la sesión anterior: considera señal de deload.

Responde con JSON válido siguiendo exactamente este formato: [...]
```

**Deload signal integration:** If the AI sets `deload_signal=True` in its response, the frontend `autoDeload.js` is notified via a custom event `hs:ai-deload-signal`. The existing deload UI incorporates this as a fourth signal alongside the three existing algorithmic signals.

**Pain routing:** If workout notes contain keywords associated with pain or discomfort, the AI includes a `rehab_suggestion` field in the response:

```json
{
  "rehab_suggestion": {
    "body_area": "elbow",
    "message": "Leve molestia en codo derecho detectada 2 sesiones seguidas. Considera el módulo de rehabilitación para epicondilitis lateral."
  }
}
```

The frontend shows this as a non-blocking toast notification with a direct link to open `RehabLogger` pre-filled with the affected area.

### B.4 Frontend Integration

**`frontend/js/workout/` directory (existing)** — two new files:

**`frontend/js/workout/postWorkoutCoach.js`**  
- Called from `workoutLogger.js` immediately after `POST /workout/sessions` succeeds
- Fires `POST /workout/sessions/{id}/post-workout-analysis` in the background (non-blocking)
- Shows a subtle "Analizando tu entreno..." indicator in the finish screen
- On completion: shows a collapsible "Plan para el próximo día" card with:
  - Per-exercise weight/reps targets (gold accent for increases, neutral for maintain, amber for reductions)
  - AI coach_notes text (short paragraph)
  - If `deload_signal`: shows a deload warning card (styled like existing AutoDeload UI)
  - If `rehab_suggestion`: shows a toast with "Tienes una recomendación de rehab" + link

**`frontend/js/workout/nextSessionPreloader.js`**  
- Called on workout init (when user starts a new session)
- Calls `GET /workout/next-session-plan`
- If a plan exists: pre-populates the weight input fields in the workout logger with the AI-suggested values
- Each pre-populated field shows a small gold "AI" badge indicating the value is AI-suggested (not manual)
- Calls `POST /workout/next-session-plan/apply` once the session is confirmed started
- If no plan exists: silent, no UI change

### B.5 Notes Field Enhancement

The existing `WorkoutSession.notes` field (TEXT, 1000 chars in schema) already exists and is passed through `SessionCreateRequest`. No schema changes needed for note input.

The frontend workout logger (`workoutLogger.js`) should display a notes textarea at the end of the session (before the "Finalizar" button). This field is already plumbed in the backend — it just needs a UI entry point in the finish flow.

---

## Cross-Module Integration: Injuries → Post-Workout Coach

The `post-workout-analysis` service fetches the user's chronic injuries from `user_chronic_injuries` and includes them in the Groq prompt context. This creates a closed loop:

1. User registers knee injury in Módulo A
2. Routine generator avoids deep squats
3. After workout, post-workout coach sees the knee injury context and does not suggest increasing leg press load beyond the safe range
4. If notes say "molestia en rodilla", the coach routes to rehab module

This cross-module query is a direct DB read (no HTTP between modules). The `workout_sessions` service imports from `routines.repository` to fetch injuries, following the existing pattern where `workout_sessions/router.py` already imports `gamification.service`.

---

## Alembic Migration

One migration covers both modules:

```
Migration: add_injury_coach_tables
  - CREATE TABLE user_chronic_injuries (...)
  - CREATE TABLE workout_ai_plans (...)
  - CREATE INDEX ix_user_chronic_injuries_user_active ON user_chronic_injuries(user_id, is_active)
  - CREATE INDEX ix_workout_ai_plans_user_unused ON workout_ai_plans(user_id, used, expires_at)
```

---

## Test Plan

**Backend unit tests:**
- `test_injury_aware_routine.py` (5 tests): injury CRUD, prompt injection with injuries, prompt injection without injuries (fallback to standard), severity-to-constraint mapping, AI response parsing
- `test_post_workout_coach.py` (7 tests): analysis trigger, plan persistence, next-plan retrieval (present/absent), plan apply, pain keyword detection → rehab_suggestion, deload signal propagation, injury context injection

**Frontend tests:** manual QA checklist (no unit test framework currently used for JS modules)

---

## RGPD Compliance

Both modules follow the established anonymization pattern from `ai_insights`:
- `user_id` is never included in AI prompt context
- Only aggregate/behavioral data sent to Groq: volumes, weights, reps, RPE, duration
- Session notes sent verbatim (user chose to write them for AI use) — this is informed consent
- Injury labels sent as body area codes (e.g., "knee") not user-entered free text for the constraint rules; the user-written `injury_label` field stays in DB only
- `workout_ai_plans` table stores AI output only (no PII), retention 7 days via `expires_at`

---

## Scope and Estimated Implementation Effort

| Component | Effort | Notes |
|-----------|--------|-------|
| DB tables + Alembic migration | Small | 2 tables, straightforward |
| Módulo A: injury CRUD endpoints (3 endpoints) | Small | Standard CRUD pattern |
| Módulo A: `ai-generate-injury-aware` endpoint | Medium | Extends existing service |
| Módulo A: frontend InjuryManager in routineGenerator.js | Medium | New UI section, chips, form |
| Módulo B: `post-workout-analysis` endpoint | Medium | Most complex — multi-table reads, prompt build, JSON parse |
| Módulo B: `next-session-plan` endpoints (2 endpoints) | Small | Simple read + update |
| Módulo B: `postWorkoutCoach.js` frontend | Medium | UI cards, toast, deload integration |
| Módulo B: `nextSessionPreloader.js` frontend | Small | Pre-populate inputs |
| Notes textarea in workout finish flow | Trivial | Field exists in backend already |
| Tests (12 backend tests total) | Medium | Follow existing test patterns |

**Total estimate:** 3-4 days of focused implementation (can be split into 2 independent PRs: one per module)

---

## Out of Scope for This Spec

- Voice input for workout notes
- Push notifications for the next-session plan
- Sharing injury profiles between users
- Integration with external injury databases or medical records
- Automated exercise video substitutions (just text notes in exercises)
- Analytics dashboard for chronic injury management
