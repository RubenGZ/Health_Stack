# CycleSync V2 — Feature Specification

**Estado:** Propuesta · En backlog  
**Fecha:** 2026-05-18  
**Autor:** HealthStack Pro Team  
**Prioridad:** Alta (roadmap V2)

---

## Resumen ejecutivo

CycleSync V2 es el sistema de periodización inteligente de HealthStack Pro. Sincroniza automáticamente el plan de entrenamiento con el ciclo menstrual de la usuaria, ajustando volumen, intensidad y tipo de ejercicio según la fase hormonal. Convierte datos pasivos (ciclo) en ajustes activos (rutinas, nutrición, recuperación).

---

## Problema que resuelve

Las mujeres entrenan con planes diseñados para fisiología masculina. La variación hormonal a lo largo del ciclo afecta directamente la fuerza, la recuperación, la tolerancia al volumen y el estado de ánimo. Ignorar esto produce:

- Sobreentrenamiento en fases de baja energía (fase lútea tardía)
- Infraentrenamiento en fases de alta capacidad (fase folicular)
- Frustración al no ver progreso en periodos donde el cuerpo no puede rendir igual
- Lesiones por no ajustar intensidad a estados de mayor laxitud ligamentosa (ovulación)

CycleSync V2 da a la usuaria un plan que trabaja **con** su biología, no contra ella.

---

## Usuarios objetivo

- Mujeres en edad fértil con ciclos regulares (21–35 días)
- Mujeres con ciclos irregulares que quieran hacer seguimiento
- Usuarias en perimenopáusia que quieran adaptar su entrenamiento
- No aplica a: embarazo, menopausia confirmada, usuarias con DIU hormonal (flujo de información distinto — futuro V3)

---

## Fases del ciclo y ajustes de entrenamiento

### Fase 1 — Menstruación (días 1–5 aprox.)

**Perfil hormonal:** Estrógeno y progesterona bajos. Prostaglandinas altas (inflamación).

**Capacidad de entrenamiento:** Variable. Día 1–2: posible reducción. Día 3–5: recuperación.

**Ajustes CycleSync:**
- Volumen: −20 a −30% del volumen habitual
- Intensidad: mantener si la usuaria se siente bien, reducir RPE objetivo en 1–2 puntos
- Tipo: priorizar movilidad, yoga, caminata, natación suave
- Nutrición: aumentar hierro (+3–5 mg/día), magnesio (+50 mg/día), omega-3
- Recuperación: priorizar sueño, baños calientes, foam rolling
- Mensaje IA: empático, sin culpa por reducir carga

### Fase 2 — Folicular (días 6–13 aprox.)

**Perfil hormonal:** Estrógeno en ascenso. Testosterona leve aumento.

**Capacidad de entrenamiento:** Máxima. Mayor síntesis proteica, mejor recuperación, umbral del dolor más alto.

**Ajustes CycleSync:**
- Volumen: +10 a +20% sobre baseline
- Intensidad: sesiones de alta intensidad, PR attempts, nuevos movimientos técnicos
- Tipo: fuerza máxima, HIIT, aprendizaje motor
- Nutrición: proteína alta (≥1.8 g/kg), carbohidratos periworkout
- Recuperación: normal — el cuerpo recupera rápido esta fase
- Mensaje IA: motivador, push hacia nuevos máximos

### Fase 3 — Ovulación (días 14–16 aprox.)

**Perfil hormonal:** Pico de LH y estrógeno. Testosterona en máximo.

**Capacidad de entrenamiento:** Alta, pero con precaución en ligamentos.

**Ajustes CycleSync:**
- Volumen: alto, similar a folicular tardía
- Intensidad: alta — pero reducir ejercicios de alto impacto articular (saltos, cambios de dirección bruscos)
- Tipo: fuerza, potencia, cardio moderado-alto
- **Alerta especial:** Mayor laxitud ligamentosa (relaxina) → cuidado en sentadilla profunda, saltos de caja, sprints
- Nutrición: zinc (+2–3 mg), antioxidantes
- Mensaje IA: nota sobre laxitud ligamentosa si detecta ejercicios de alto riesgo en la rutina

### Fase 4 — Lútea temprana (días 17–22 aprox.)

**Perfil hormonal:** Progesterona en ascenso. Estrógeno moderado.

**Capacidad de entrenamiento:** Buena, ligero descenso respecto a folicular.

**Ajustes CycleSync:**
- Volumen: baseline o −10%
- Intensidad: moderada-alta, evitar records
- Tipo: fuerza con pesos moderados, cardio estable, pilates
- Nutrición: aumentar carbohidratos complejos (la progesterona sube temperatura basal → más demanda energética), magnesio
- Recuperación: el sueño puede empezar a verse afectado — protocolo de higiene del sueño

### Fase 5 — Lútea tardía / PMS (días 23–28 aprox.)

**Perfil hormonal:** Caída de estrógeno y progesterona. Serotonina baja.

**Capacidad de entrenamiento:** Reducida. Fatiga, retención de agua, irritabilidad, antojos.

**Ajustes CycleSync:**
- Volumen: −20 a −30%
- Intensidad: baja-moderada, RPE objetivo −2 puntos
- Tipo: yoga restaurativo, caminata, natación, estiramientos
- Nutrición: reducir sodio (retención hídrica), aumentar calcio y vitamina D, limitar cafeína
- Recuperación: máxima prioridad — esta semana no se construye fuerza, se consolida
- Mensaje IA: validar la experiencia de la usuaria, no minimizar síntomas PMS

---

## Arquitectura técnica

### Backend

#### Nuevo módulo: `cycle_tracking`

```
backend/app/modules/cycle_tracking/
  models.py        — CyclePeriod, CyclePhase, CycleSettings
  schemas.py       — PeriodEntry, PhaseInfo, CycleAdjustments
  repository.py    — CRUD + phase calculation
  service.py       — phase detection, adjustment engine
  router.py        — endpoints REST
```

**Tablas nuevas:**

```sql
-- Registros de período
CREATE TABLE cycle_periods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  start_date  DATE NOT NULL,
  end_date    DATE,              -- null hasta que se registra el fin
  flow_level  SMALLINT,          -- 1 (spotting) a 5 (heavy)
  symptoms    JSONB DEFAULT '[]', -- ["cramps", "headache", ...]
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Configuración del ciclo de la usuaria
CREATE TABLE cycle_settings (
  user_id            UUID PRIMARY KEY REFERENCES users(id),
  avg_cycle_length   SMALLINT DEFAULT 28,  -- días
  avg_period_length  SMALLINT DEFAULT 5,
  luteal_phase_length SMALLINT DEFAULT 14,
  tracking_enabled   BOOLEAN DEFAULT true,
  notifications      BOOLEAN DEFAULT true,
  updated_at         TIMESTAMPTZ DEFAULT now()
);

-- Cache de fases calculadas (evitar recalcular en cada request)
CREATE TABLE cycle_phase_cache (
  user_id     UUID NOT NULL REFERENCES users(id),
  date        DATE NOT NULL,
  phase       VARCHAR(20) NOT NULL,  -- menstrual|follicular|ovulation|luteal_early|luteal_late
  day_of_cycle SMALLINT,
  confidence  FLOAT,                 -- 0.0–1.0 (baja si ciclo irregular)
  PRIMARY KEY (user_id, date)
);
```

**Endpoints:**

```
POST /api/v1/cycle/period          — registrar inicio de período
PATCH /api/v1/cycle/period/{id}    — actualizar (fin, flow, síntomas)
GET  /api/v1/cycle/current         — fase actual + día del ciclo + ajustes
GET  /api/v1/cycle/forecast        — próximas 4 semanas con fases predichas
GET  /api/v1/cycle/history         — historial de períodos (paginado)
GET  /api/v1/cycle/settings        — configuración actual
PUT  /api/v1/cycle/settings        — actualizar configuración
DELETE /api/v1/cycle/period/{id}   — eliminar registro
```

**Algoritmo de detección de fase:**

```python
def get_current_phase(periods: list[CyclePeriod], settings: CycleSettings, date: date) -> PhaseInfo:
    """
    1. Encontrar el período más reciente anterior o igual a date
    2. Calcular day_of_cycle = (date - last_period.start_date).days + 1
    3. Aplicar umbrales configurados:
       - días 1..period_length        → MENSTRUAL
       - días period_length+1..13     → FOLLICULAR
       - días 14..16                  → OVULATION
       - días 17..cycle_length-luteal → LUTEAL_EARLY
       - días cycle_length-luteal+1.. → LUTEAL_LATE
    4. Si no hay períodos registrados → UNKNOWN (no mostrar ajustes)
    5. Si el ciclo es irregular (desviación > 5 días en últimos 3 ciclos):
       confidence = 0.5, añadir disclaimer en UI
    """
```

**Integración con AIRouter (chat context):**

En `chat/context.py`, `build_user_context()` debe incluir la fase actual si existe:

```python
async def build_user_context(user_id: str, db: AsyncSession) -> str | None:
    # ... existing weight/routine/XP context ...
    
    # NEW: cycle phase
    cycle_repo = CycleRepository(db)
    phase_info = await cycle_repo.get_current_phase(user_id, date.today())
    if phase_info and phase_info.phase != "UNKNOWN":
        context_parts.append(
            f"Fase ciclo: {phase_info.phase_label} (día {phase_info.day_of_cycle})"
        )
```

**Integración con Rutinas:**

`routines/service.py` debe consultar `cycle_tracking` para ajustar volumen/intensidad antes de devolver la rutina:

```python
async def get_routine_with_cycle_adjustments(
    user_id: str, routine_id: UUID, db: AsyncSession
) -> RoutineResponse:
    routine = await routine_repo.get(routine_id)
    cycle_phase = await cycle_repo.get_current_phase(user_id, date.today())
    
    if cycle_phase:
        adjustments = CycleAdjustmentEngine.compute(cycle_phase)
        routine = apply_volume_adjustments(routine, adjustments)
    
    return routine
```

#### RGPD — Datos de ciclo

Los datos menstruales son **datos de salud especiales** bajo GDPR Art. 9.

Implementar:
- Cifrar `notes` y `symptoms` con AES-256-GCM (mismo patrón que health records)
- `user_id` en `cycle_periods` referencia indirecta via `health_subject_id`
- Endpoint `DELETE /api/v1/cycle/all` — elimina todos los datos del ciclo (derecho al olvido)
- Audit log para accesos a datos de ciclo (tabla `cycle_access_log`)
- Documento de tratamiento actualizado: base legal = interés legítimo + consentimiento explícito

### Frontend

#### Nuevo módulo: `frontend/js/cycleTracker.js`

```javascript
const CycleTracker = (function() {
  'use strict';
  
  // State
  let _currentPhase = null;
  let _forecast = null;
  
  // Phase colors + labels
  const PHASE_CONFIG = {
    menstrual:    { color: '#ef4444', label: 'Menstruación',    emoji: '🌑' },
    follicular:   { color: '#22d3ee', label: 'Folicular',       emoji: '🌱' },
    ovulation:    { color: '#f59e0b', label: 'Ovulación',       emoji: '⭐' },
    luteal_early: { color: '#8b5cf6', label: 'Lútea temprana',  emoji: '🌕' },
    luteal_late:  { color: '#6b7280', label: 'Lútea tardía',    emoji: '🌘' },
    unknown:      { color: '#374151', label: 'Sin datos',        emoji: '❓' },
  };
  
  async function init() {
    const phase = await fetchCurrentPhase();
    if (phase) {
      _currentPhase = phase;
      renderPhaseWidget(phase);
      injectCycleContextIntoWorkout(phase);
    }
  }
  
  // ... renderPhaseWidget, renderForecastCalendar, logPeriodModal, etc.
  
  return { init, getPhase: () => _currentPhase };
})();
```

#### Widget de fase (sidebar o sección dedicada)

```html
<!-- En index.html — mini widget en sidebar o sección cycle -->
<div class="cycle-phase-widget" id="cycle-phase-widget">
  <div class="cycle-phase-indicator">
    <span class="cycle-emoji">🌱</span>
    <div class="cycle-info">
      <span class="cycle-phase-name">Fase Folicular</span>
      <span class="cycle-day">Día 8 de 28</span>
    </div>
  </div>
  <div class="cycle-adjustment-banner">
    💪 Esta semana: máximo rendimiento. Ideal para records.
  </div>
</div>
```

#### Ajustes visibles en WorkoutLogger

Cuando CycleSync está activo, el encabezado de la sesión muestra:

```
⚡ Fase Folicular · Día 8
Esta semana tu cuerpo está en máximo rendimiento.
Volumen recomendado: +15% — ¡buena semana para subir cargas!
```

Si es lútea tardía:
```
🌘 Lútea Tardía · Día 25
Semana de consolidación. Reduce volumen un 20% y prioriza técnica.
Tu próximo período estimado: en 3 días.
```

---

## Onboarding de CycleSync

Al activar por primera vez:

1. **Modal de consentimiento** — explicar qué datos se recogen, dónde se guardan, cómo se usan en la IA
2. **Configuración inicial:**
   - ¿Cuándo fue tu último período? (date picker)
   - ¿Cuánto dura tu ciclo habitualmente? (slider 21–35 días)
   - ¿Cuánto dura tu período? (slider 3–7 días)
3. **Confirmación:** mostrar fase actual calculada + primer forecast
4. Guardar en `cycle_settings` + crear primer `cycle_period` si la usuaria sabe la fecha

---

## Notificaciones (futuro — post-V2)

- Push notification 2 días antes del período estimado: "Tu período podría llegar en 2 días. Hemos ajustado tu plan."
- Reminder para registrar síntomas el día 1
- "¿Cómo te encuentras hoy?" — check-in diario en fase PMS

---

## Métricas de éxito

| Métrica | Objetivo |
|---------|----------|
| Usuarias que activan CycleSync | >40% de usuarias femeninas en 30 días |
| Retención 30 días (usuarias con CycleSync vs sin) | +15% lift |
| Registros de período por usuaria activa / mes | >2 (mínimo para predicción útil) |
| Sesiones completadas en fase lútea tardía | ≥sesiones sin CycleSync (no abandono por "no tengo energía") |

---

## Estimación de trabajo

| Tarea | Esfuerzo estimado |
|-------|------------------|
| Modelos DB + migración Alembic | 2h |
| Repository + service (detección de fase) | 4h |
| Endpoints REST (7 endpoints) | 3h |
| Tests integración | 3h |
| Integración chat context | 1h |
| Integración routines service | 2h |
| Frontend cycleTracker.js | 4h |
| Widget sidebar + sección dedicada | 3h |
| WorkoutLogger ajustes banner | 2h |
| Onboarding modal | 2h |
| RGPD: cifrado notas + audit log | 2h |
| **Total estimado** | **~28h** |

---

## Dependencias y riesgos

**Dependencias:**
- Alembic migration funcional en Pi
- `build_user_context()` en chat/context.py (ya implementado — Bloque E)
- Clave de cifrado MASTER_KEY existente (reutilizar patrón de health records)

**Riesgos:**
- Ciclos irregulares: el algoritmo de predicción tiene baja confianza — necesita disclaimer claro en UI
- Datos sensibles: breach de datos de ciclo es especialmente dañino — cifrado crítico desde día 1
- Privacidad: usuarias pueden no querer que la IA "sepa" su fase — hacer CycleSync completamente opt-in, desactivable sin pérdida de datos

---

## No incluido en V2 (backlog V3)

- Integración con wearables (Apple Health, Garmin, Fitbit) para detección automática por temperatura basal
- Algoritmo de ML para predicción con ciclos muy irregulares
- Soporte embarazo / posparto
- Análisis de correlación ciclo + rendimiento histórico ("tu mejor semana fue siempre la folicular")
- Export de datos a PDF para médico/ginecóloga
