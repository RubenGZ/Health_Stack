# HealthStack Elite — Features 2050
**Fecha:** 2026-05-30
**Estado:** Ideas post-brainstorming. Roadmap post-MVP-beta.
**Contexto:** Ninguna app del mercado (Hevy, WHOOP, Caliber, RP Strength) combina estas tres capacidades.

---

## Landscape — Brecha de mercado

| App | Fortaleza | Lo que NO tiene |
|-----|-----------|-----------------|
| Hevy | Logging limpio, social, API | Cero IA real, cero biométrica, cero cámara |
| WHOOP | HRV/recovery granular | Sin workout logging, sin periodización |
| Caliber | Coaching humano 1:1 | Costoso, no escalable |
| RP Strength | Volume landmarks científico | Solo planificación, sin logging en tiempo real |
| Future.coach | Coach humano asignado | $150/mes, humanos limitados |
| Apple Fitness+ | Guided workouts bonitos | Sin progresión de carga, sin periodización |

**Brecha clave:** nadie combina (1) cámara/pose, (2) gemelo digital predictivo, (3) biométrica wearable + adaptación en tiempo real.

---

## APPROACH A — Camera Intelligence (👁️ El Gym te Ve)
**El más disruptivo. Hevy nunca lo hará.**

**Effort:** XL (6–8 semanas)  
**Tech:** TensorFlow.js + MoveNet/BlazePose (browser, no servidor), WebWorker para no bloquear UI

### Features
- **Auto rep counter** — detecta movimiento de press/curl/squat, cuenta reps automáticamente. El set se registra solo al acabar.
- **Range of motion badge** — mide si el usuario llega a profundidad completa. Badge verde/amarillo/rojo por rep.
- **Bar path overlay** — para bench/squat, dibuja trayectoria real de la barra en AR sobre el vídeo. Compara con sesión anterior.
- **Bilateral asymmetry alert** — detecta si un hombro sube más que el otro, sugiere causa (movilidad, debilidad).

### Flujo
```
[Iniciar set] → [Apuntar cámara al espejo] → [Entrena] →
[App cuenta reps, graba ROM] → [Set completado automáticamente]
```

### Trade-offs
- Requiere soporte/trípode de móvil
- Privacidad: no guardar vídeo, solo keypoints (comunicar explícitamente)
- Difícil en gym oscuro o ropa oscura
- Reusa: `workoutSets.js`, `session-loader.js`, anatomy viewer 3D

---

## APPROACH B — Digital Twin (🧬 Gemelo Digital)
**El más inteligente. Ninguna app lo tiene.**

**Effort:** M (2–3 semanas)  
**Tech:** Modelo Epley 1RM + RP Volume Landmarks + curva adaptación exponencial. 100% JS, sin servidor.

### Features
```
Panel "Simula tu progresión" (sección nueva bajo gamificación):

Escenario actual:
  Bench 80kg → Simulado a 12 semanas: 87–92 kg
  Sentadilla 100kg → Simulado a 12 semanas: 110–118 kg

Compara escenarios:
  [ ] +2 sets espalda/semana → +4% en 1RM
  [ ] Deload cada 4 semanas → +6% vs. sin deload
  [ ] Aumentar proteína a 2g/kg → +2.3% (con lectura de TDEE)
```

### Modelo de progresión
```js
// Adapted dose-response curve (Krieger 2017)
function predictStrength(currentRM, weeklyVolume, weeks, recoveryQuality) {
  const weeklyGainRate = (weeklyVolume / MEV_OPTIMAL) * 0.008; // ~0.8%/semana óptimo
  return currentRM * Math.pow(1 + weeklyGainRate * recoveryQuality, weeks);
}
```

### Trade-offs
- No requiere hardware externo, funciona offline desde el día 1
- Muy motivador: el usuario "ve" su futuro, genera engagement diario
- Modelo simplificado puede ser impreciso — comunicar que es orientativo
- Requiere mínimo 2–3 semanas de datos para calibrar
- Reusa: `oneRepMax.js`, historial workout sessions, `macroCalc.js`

---

## APPROACH C — HRV + Adaptación en Tiempo Real (🫀 Biométrica)
**El más conectado. Cierra el loop biometría → entreno.**

**Effort:** L (3–4 semanas)  
**Tech v1 (sin wearable):** Motor de inferencia HRV basado en datos que ya tenemos.  
**Tech v2 (con wearable):** Google Fit REST API (OAuth) / Apple Health URL scheme.

### Motor de inferencia HRV (sin wearable)
```js
HRV_estimado = base_score
  - (sesiones_sin_descanso × 8)
  + (sueño_promedio_3d - 7) × 12
  + (reps_completados/reps_target - 1) × 15

// Si HRV < 40: Auto-deload sugerido
// Si HRV > 75: PR window prediction activa
```

### PR Window Prediction (feature viral)
```
🎯 Ventana de PR detectada
   Basado en tu patrón de los últimos 6 semanas:
   → Tienes 78% de probabilidad de hacer PR en Bench esta semana
   → Semana óptima para test de máximos: Jueves
```

### Trade-offs
- Funciona sin wearable (v1 con datos que ya tenemos)
- PR prediction es viral — la gente la comparte en redes
- Modelo inferido puede estar equivocado sin biométrica real
- Requiere 4–5 semanas de datos mínimo
- Reusa: `readiness-check.js`, `post-workout-coach`, `gamification`

---

## Roadmap recomendado post-MVP

**Prioridad B → A → C**

1. **Gemelo Digital (B)** — primero. Cero dependencias de hardware, funcional desde día 1. 2 semanas de desarrollo. Diferenciador brutal para el pitch.
2. **Camera Intelligence (A)** — después del gemelo. 6 semanas, empezar solo con rep counting.
3. **HRV inferido (C)** — lanzar v1 sin wearable en paralelo a A. Añadir integración wearable real post-beta pública.

---

## Notas técnicas PWA

- TF.js MoveNet corre a ~30fps en iPhone 12+ desde el browser (testado)
- WebWorker evita que pose estimation bloquee el UI thread
- getUserMedia() disponible en PWA con HTTPS (Cloudflare tunnel ya lo da)
- Privacidad RGPD: keypoints numéricos, nunca vídeo almacenado, procesamiento local 100%
