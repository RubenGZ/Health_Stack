# 🐞 BUGS — Memoria viva de bugs reportados (HealthStack Pro)

> **Esta es la fuente de verdad de los bugs pendientes.** Reglas de uso obligatorias.

## Protocolo de autolimpieza

1. **Un bug NO se borra de aquí hasta que Ruben lo verifica arreglado en su iPhone.**
   - Arreglar el código ≠ bug resuelto. Solo `VERIFICADO` se borra.
2. **Estados posibles:**
   - `🔴 ABIERTO` — reportado, sin tocar.
   - `🟡 EN CURSO` — se está trabajando ahora mismo.
   - `🟢 FIX-SIN-VERIFICAR` — código arreglado y desplegado, pendiente de que Ruben confirme en dispositivo.
   - `✅ VERIFICADO` — Ruben confirmó que funciona → **se elimina de este archivo** en el siguiente commit.
3. **Al empezar cada sesión**: leer este archivo ANTES de tocar nada nuevo. Trabajar los `🔴` por prioridad.
4. **Al cerrar trabajo en un bug**: actualizar su estado + el campo `Verificar`.
5. **Cuando Ruben diga "X ya funciona"**: mover a `✅` y borrar la entrada en el commit de limpieza.
6. **No inventar bugs nuevos aquí** — solo los reportados por Ruben o confirmados con repro. Los hallazgos de auditoría de código van a `CLAUDE.md → Pendientes`, no aquí.

**Leyenda de prioridad**: `P0` bloquea uso · `P1` rompe flujo · `P2` molesto · `P3` pulido.

---

## 🔴 ABIERTOS

### BUG-01 · Rutina IA carga vacía (todos los días "Descanso activo")  · P0
- **Reportado**: QA iPhone (tanda pendiente).
- **Síntoma**: al generar una rutina con IA, todos los días salen como "Descanso activo"; la rutina no trae ejercicios.
- **Sospecha**: `frontend/js/routineGenerator.js` y/o `frontend/js/workout/routine-picker.js` — parsing de la respuesta IA o mapeo de días.
- **Verificar**: generar rutina IA nueva → cada día de entreno trae ejercicios reales, no "Descanso activo".

### BUG-02 · Botón "Nueva sesión" feo + sin opción "cerrar y guardar entreno" · P1
- **Reportado**: [12:51].
- **Síntoma**: el botón de nueva sesión es de baja calidad visual; en una sesión activa no hay forma de "cerrar y guardar" el entreno en curso.
- **Ubicación**: vista de sesión activa en `frontend/js/workout/` (views.js / workoutLogger.js).
- **Verificar**: en sesión activa existe botón claro "Guardar y salir"; el botón "Nueva sesión" se ve premium.

### BUG-03 · No hay auto-guardado tras inactividad · P1
- **Reportado**: [12:52] "Si pasa 5m desde esta ventana sin tocar que se guarde automático la sesión".
- **Síntoma**: si pasan ~5 min sin interacción en la ventana de sesión, la sesión NO se guarda sola.
- **Ubicación**: `frontend/js/workout/inactivity.js` (hoy: aviso a 10 min, auto-finalizar a 60 min; falta auto-guardado a 5 min).
- **Verificar**: dejar la sesión 5 min sin tocar → se guarda automáticamente sin perder datos.

### BUG-04 · Al elegir ejercicio no se abre pantalla con visor + info relevante · P1
- **Reportado**: [12:53]/[12:55].
- **Síntoma**: al seleccionar un ejercicio debería abrirse otra pantalla con el visor anatómico e información relevante (qué tener en cuenta, técnica) de ese ejercicio. Hoy no ocurre.
- **Ubicación**: flujo de selección de ejercicio en `frontend/js/workout/`.
- **Verificar**: tocar un ejercicio → pantalla de detalle con visor anatómico arriba + info de seguridad/técnica.

### BUG-05 · Detalle de ejercicio: hay que scrollear mucho para ver el visor · P2
- **Reportado**: [12:56].
- **Síntoma**: el visor anatómico queda muy abajo; obliga a hacer scroll largo.
- **Relación**: ligado a BUG-04 (misma pantalla).
- **Verificar**: el visor es lo primero visible (above the fold) en el detalle del ejercicio.

### BUG-06 · Session Replay confuso — no se entiende cómo funciona · P2
- **Reportado**: [12:57].
- **Síntoma**: el usuario no entiende qué hace ni cómo se usa el "session replay".
- **Ubicación**: `frontend/js/sessionReplay.js`.
- **Verificar**: el replay tiene explicación/onboarding claro o rediseño que se entiende sin instrucciones.

### BUG-07 · Rehab: protocolo "Pro" no implementado/funcional · P1
- **Reportado**: [12:58] "Protocolo estándar pero no está implementado y funcional el Pro. Diseñar y hacer que sea funcional el Pro".
- **Síntoma**: el protocolo de rehabilitación estándar existe; el "Pro" no es funcional.
- **Ubicación**: módulo de rehab/lesiones (frontend + posible endpoint backend en la Pi + Groq).
- **Verificar**: el protocolo Pro de rehab genera un plan real y funcional.

### BUG-08 · Suplementos: timing/columnas usan colores fuera de marca · P3
- **Reportado**: derivado de [13:01] pulido visual.
- **Síntoma**: `renderTimingInfo` usa cian (#00d2ff) en títulos — ajeno al sistema dorado.
- **Ubicación**: `frontend/js/supplements.js` línea de `timing.post` title color.
- **Verificar**: timing de nutrientes sin cian; acento dorado coherente.

### BUG-09 · Horario óptimo no es dinámico ni reactivo · P1
- **Reportado**: [13:02] "Actualizar y adaptar el módulo de horario óptimo. Para que sea dinámico y reactivo (diseñar la lógica)".
- **Síntoma**: el módulo de horario óptimo es estático; debería reaccionar a los datos del usuario.
- **Ubicación**: `frontend/js/timingPlanner.js`.
- **Verificar**: el horario óptimo cambia según datos reales del usuario (entrenos, comidas, objetivo).

### BUG-10 · Progressive overload no auto-sube el peso · P1
- **Reportado**: QA iPhone (tanda pendiente).
- **Síntoma**: no hay protocolo que sugiera/auto-suba el peso con una nota explicativa entre sesiones.
- **Ubicación**: `frontend/js/workout/session-loader.js` (núcleo — cuidado con regresiones de carga de sets).
- **Verificar**: al repetir un ejercicio, sugiere peso mayor con nota del porqué.

### BUG-11 · Reps: falta selector de rango (reps vs rango) · P2
- **Reportado**: QA iPhone (tanda pendiente).
- **Síntoma**: solo se puede meter un nº de reps; falta opción de rango (ej. 8-12) en desplegable.
- **Ubicación**: `frontend/js/workout/workoutSets.js`.
- **Verificar**: cada set permite elegir rango de reps además de valor único.

### BUG-12 · Historial sin estructura (año/mes/semana/día) · P2
- **Reportado**: QA iPhone (tanda pendiente).
- **Síntoma**: el historial es plano; se pide navegación jerárquica año → mes → semana → día.
- **Ubicación**: `frontend/js/workoutHistory.js`.
- **Verificar**: historial navegable por año/mes/semana/día.

### BUG-13 · Pre-workout / readiness no es popup tipo chat · P2
- **Reportado**: QA iPhone (tanda pendiente).
- **Síntoma**: pre-workout y readiness deberían presentarse como popup estilo chat.
- **Ubicación**: `frontend/js/workout/pre-workout.js`, `frontend/js/readiness.js`.
- **Verificar**: readiness aparece como popup conversacional.

### BUG-14 · Rutinas: no se pueden expandir/renombrar días · P2
- **Reportado**: QA iPhone (tanda pendiente).
- **Síntoma**: en la vista semanal de Rutinas no se puede expandir ni renombrar cada día.
- **Ubicación**: `frontend/js/routineGenerator.js` / vista de rutinas.
- **Verificar**: cada día se puede expandir y renombrar.

---

## 🟢 FIX-SIN-VERIFICAR (esperando confirmación de Ruben en iPhone)

### BUG-V01 · Planner cambiaba de día al deslizar lateralmente · P1
- **Reportado**: [13:00]. **Arreglado**: Tanda 5 (commit `75304ac`).
- **Fix**: desactivado el swipe lateral en `frontend/js/planner.js` (`_initSwipe` no-op). El día solo cambia al tocarlo.
- **Verificar**: deslizar lateral en Planner NO cambia de día; tocar el día SÍ.

### BUG-V02 · Suplementos sin filtro por evidencia + feo · P3
- **Reportado**: [13:01]. **Arreglado**: Tanda 6 (commit `f3fc7a8`).
- **Fix**: barra de filtro por nivel de evidencia (Todos/Alta/Media/Baja) con contador + pulido visual de chips.
- **Verificar**: en Suplementos hay chips de filtro que funcionan y se ven premium.

### BUG-V03 · Botón resumen recortado ("eva sesi") · P2
- **Arreglado**: Tanda 5 (commit `75304ac`).
- **Fix**: `.wl-summary-actions` flex-wrap + `.wl-done-btn` full width.
- **Verificar**: en el resumen, el botón "Nueva sesión" se ve completo.

---

## ✅ VERIFICADOS — (vacío; al verificarse se eliminan, no se acumulan aquí)
