# HealthStack Pro — MVP Launch Strategy & Disruptive Features
**Fecha:** 2026-05-22  
**Branch:** movil-PWA  
**Sesión:** Office Hours — Estrategia de lanzamiento

---

## Resumen ejecutivo

HealthStack Pro tiene 17 módulos construidos, 10 production-ready. El problema no es falta de features — es demasiadas para un primer lanzamiento. Esta spec define:

1. **MVP Fase 1** — 7 módulos, core loop, lanzamiento real
2. **Idea 1: Desbloqueo por consistencia** — features premium ganadas por entrenamiento continuado
3. **Idea 2: Fantasy Fitness League** — ligas privadas de amigos por temporadas
4. **Idea 3: Gym Servers** — plataforma B2B2C para gimnasios independientes

---

## Target user

**Perfil A — "El Serio sin Premium"** (dinero principal)  
Lleva 1-3 años entrenando. Ya usa 2-3 apps distintas. Paga $8-15/mes por alguna y lo odia. Quiere todo en un sitio, datos reales, sin muros de pago arbitrarios. Cambia si le das lo mismo gratis o mejor.

**Perfil B — "El Competidor Casual"** (retención y viralidad)  
Le motiva compararse con amigos. No le importa el peso absoluto — le importa ganar la liga semanal. El elemento social convierte usuarios individuales en grupos.

---

## Parte 1: MVP Core — Los 7 módulos del lanzamiento

### Criterio de inclusión
¿Puede un usuario nuevo crear hábito con esto en la primera semana?

### Módulos MVP (visibles en nav desde el día 1)

| Módulo | Engagement | Razón |
|--------|-----------|-------|
| Dashboard | Siempre | Punto de entrada, estado diario |
| Peso | Diario | Hábito mínimo, victoria rápida |
| Nutrición | 3x/día | Más sticky que cualquier otra feature |
| Workout/Entreno | 3-4x/semana | Sin esto no hay fitness app |
| Rutinas | Setup 1x → uso continuo | El wizard activa el entreno |
| Ejercicios | Lookup | Necesario para Rutinas y Entreno |
| Gamificación | Pasiva | XP + racha diaria = razón para volver mañana |

### Módulos ocultos en Fase 1 (en nav pero no visibles)
```
Rehab, Records, Deload, Planner, Suplementos, Timing,
Body Comp Forecast, Fatigue Heatmap, Plateau Radar,
Session Replay, Athlete Receipt, Ranked, Gym Servers
```

### Dashboard "útil desde el día 1"
Si no hay datos, mostrar CTAs activos — no pantalla vacía:
- "Registra tu peso de hoy" → abre Peso
- "¿Qué has comido?" → abre Nutrición
- "¿Entrenas hoy?" → abre Entreno con rutina activa

### Onboarding obligatorio
El usuario nuevo pasa por el wizard de rutinas antes de llegar al dashboard. Sin rutina activa, la app no tiene sentido de entrada. Flujo: `registro → wizard rutinas (5 preguntas) → dashboard con rutina lista`.

---

## Parte 2: Desbloqueo por Consistencia (Idea 1)

### Concepto
Las features avanzadas no se pagan con dinero — se ganan con constancia. Cada milestone de entrenamiento desbloquea una feature permanentemente para ese usuario.

### El arco narrativo de los hitos
```
1 mes  → "Mira lo que has hecho"        → Session Replay
6 meses → "Mira hacia dónde vas"         → Body Comp Forecast  
1 año   → "Mira en quién te has convertido" → Athlete Receipt
```

### Definición de "consistencia"
No es tiempo transcurrido — es días entrenados:

| Hito | Condición | Feature desbloqueada |
|------|-----------|---------------------|
| **Nivel 1** | 20 sesiones de entreno registradas en los últimos 60 días | **Session Replay** — revive y analiza tus últimas sesiones |
| **Nivel 2** | 80 sesiones en los últimos 180 días (~4-5x/semana) | **Body Comp Forecast** — proyección de composición corporal |
| **Nivel 3** | 180 sesiones en el último año (~3-4x/semana sostenido) | **Athlete Receipt** — certificado anual exclusivo y compartible |

> Nota: los números exactos son ajustables. La lógica es: 1 mes real de entrenamiento 4x/semana, 6 meses real, 1 año real. No se puede hacer trampa registrando sesiones vacías — la validación debe requerir duración mínima o sets registrados.

### Integración con Ranked Normal
El sistema ranked ya tiene la cola "normal" que mide consistencia (novato → leyenda). Los milestones de desbloqueo se mapean a tiers:

| Tier Ranked Normal | Hito |
|--------------------|------|
| `comprometido` (tier 4/8) | Nivel 1 — Session Replay |
| `forjado` (tier 6/8) | Nivel 2 — Body Comp Forecast |
| `leyenda` (tier 8/8) | Nivel 3 — Athlete Receipt |

Esto reutiliza lógica existente sin duplicar contadores.

### UX del desbloqueo
- Notificación en-app: *"¡Has alcanzado el nivel Comprometido! Session Replay desbloqueado."*
- Animación de unlock (similar a logro de gamificación)
- El módulo aparece en el nav con badge "NUEVO" durante 7 días
- Compartible: imagen generada automáticamente "Llevo X sesiones en HealthStack"

### Implementación técnica requerida
1. Campo `unlocked_features: JSONB` en tabla `users` o nueva tabla `user_feature_unlocks`
2. Función `check_consistency_unlocks(user_id)` llamada después de cada `workout_session` registrada
3. Hook en `gamification/service.py` o `ranked/service.py` al subir de tier normal
4. Frontend: `Plan.can()` consulta `unlocked_features` además del tier de plan

---

## Parte 3: Fantasy Fitness League (Idea 2)

### Concepto
Ligas privadas de amigos que compiten por consistencia, no por rendimiento. Temporadas de 4 semanas. Puntuación por aparecer, no por levantar más.

### Estado actual del backend
El módulo `ranked` tiene el 80% construido:
- LP engine completo con dos colas (normal + competitivo)
- `RankedSeason` table existe pero `season = 1` hardcodeado
- `lp_week` y `MAX_LP_PER_WEEK = 60` calculados pero nunca aplicados
- No hay ligas privadas — solo leaderboard global

### Gaps a completar

**Backend:**
1. **Temporadas automáticas** — `RankedSeason` debe tener fechas reales y rotar cada 4 semanas. Activar `season` dinámico leyendo la tabla.
2. **Ligas privadas** — nueva tabla `RankedLeague` (nombre, invite_code, season, members). Un grupo de amigos crea una liga y compiten entre ellos.
3. **Aplicar `lp_week`** — el cap semanal ya está modelado pero nunca se ejecuta. Añadir validación en `apply_lp_delta()`.
4. **LP por entrenamiento** — conectar `workout_sessions` a `apply_lp_delta()` para la cola normal. Actualmente los LP se dan manualmente.

**Frontend:**
1. Sección `Ranked` ya existe — añadir tab "Mi Liga" junto al leaderboard global
2. Pantalla de creación/unión a liga (invite code)
3. Leaderboard de liga con fotos de perfil, tiers visuales, posiciones semanales
4. Cuenta regresiva al fin de temporada

### Sistema de puntuación de la liga

| Acción | LP ganados |
|--------|-----------|
| Registrar sesión de entreno | +10 LP |
| Completar macros del día (±10% objetivo) | +5 LP |
| Racha de 7 días | +20 LP bonus |
| PR en cualquier ejercicio | +15 LP |
| Día sin registro | 0 (no se penaliza) |

> Principio clave: la puntuación recompensa aparecer, no ser el más fuerte. Un principiante que entrena 4 veces por semana puede ganar a un avanzado que entrena 2.

### Mecánica de temporadas
- Temporada = 4 semanas
- Al final: campeón de liga, clasificación final guardada como `RankedEvent`
- `GymChampionBadge` ya tiene `season` y `position` — reutilizar para ligas privadas
- Los últimos 2 de la liga "descienden" (baja su tier visual, sin consecuencias reales)

---

## Parte 4: Gym Servers — Plataforma B2B2C (Idea 3)

### Concepto
Cada gimnasio independiente tiene su "servidor" — una comunidad digital solo para sus miembros. El gym lo gestiona, sus usuarios lo usan gratis. HealthStack es la infraestructura.

### Estado actual del backend
El módulo `gym_servers` tiene el 70% construido:
- `GymServer` con invite_code, roles, verificación
- `GymMembership` con roles (member/admin/owner)
- `GymChampionBadge` con season, city_league_eligible
- `GymChallenge` con fechas, target, participantes
- Endpoints: crear, unirse, mis-gyms, sparring, actualizar perfil, crear reto, unirse a reto

### Gaps a completar

**Backend (pendientes del CLAUDE.md):**
1. **Descubrir gyms públicos** — `GET /gym-servers/public?city=Madrid` — sin este endpoint no hay discovery orgánico
2. **Abandonar un gym** — `DELETE /gym-servers/{gym_id}/leave` 
3. **Progreso de retos** — `contribution` en `GymChallengeParticipant` nunca se actualiza. Necesita hook en `workout_sessions` que detecte si el user tiene retos activos y actualiza `contribution`
4. **Response models** — 5 de 7 endpoints sin `response_model` (no aparecen en OpenAPI)

**Frontend:**
1. Pantalla de discovery de gyms (`GET /public`)
2. Vista de retos del gym con barra de progreso real
3. Leaderboard del gym (usa `GymChampionBadge` por temporada)
4. Panel de admin del gym (crear retos, ver miembros, anunciar)

### Go-to-market para Idea 3
No marketing a usuarios individuales — ir a gimnasios pequeños directamente:
- 10-20 gyms independientes en España
- Propuesta: "Te damos la app de comunidad de tu gym, gratis. Tus clientes la usan."
- Monetización futura: $20-50/mes por gym por panel de administración branded
- Cada gym trae 50-200 usuarios → distribución sin publicidad

---

## Plan de acción — 8 semanas

### Semana 1-2: Pre-launch
- [ ] Implementar ocultado de módulos no-MVP (flag `PHASE` en nav)
- [ ] Onboarding obligatorio (wizard antes de dashboard)
- [ ] Dashboard con CTAs si no hay datos
- [ ] Feedback button en-app (aunque sea un mailto)

### Semana 3-4: Beta cerrada
- [ ] 5-10 amigos con acceso, instrucciones claras: "Úsala 7 días, registra peso y macros cada día"
- [ ] Métrica clave: Day-3 retention. Si <50% vuelve al día 3, el onboarding está roto
- [ ] No explicar cómo funciona — observar dónde se pierden

### Semana 5-6: Iteración + Fase 2 modules
- [ ] Fix de fricción más reportada en beta
- [ ] Activar Records y Planner (usuarios ya tienen datos)
- [ ] Implementar sistema de desbloqueo por consistencia (Idea 1) — backend + UX
- [ ] Activar `lp_week` en ranked (anti-spam ya modelado)

### Semana 7: Fantasy League beta
- [ ] Temporadas reales en ranked (conectar `RankedSeason`)
- [ ] Liga privada básica (invite_code, leaderboard de grupo)
- [ ] LP automáticos desde workout_sessions
- [ ] Probar con el grupo de beta testers

### Semana 8: Soft launch público
- [ ] Gym Servers: endpoint discover + leave + progress tracking
- [ ] Post en Reddit: r/leangains, r/naturalbodybuilding — "Hice una app de fitness gratis, busco feedback honesto"
- [ ] Cada módulo nuevo que active = un post. El Ranked con ligas es el primer "lanzamiento" real

---

## Métrica única — primeras 4 semanas

**Day-3 retention**: de 10 usuarios que se registran, ¿cuántos vuelven al día 3?

| Resultado | Diagnóstico |
|-----------|------------|
| < 30% | Onboarding roto o propuesta de valor poco clara |
| 30-50% | Normal para fitness apps. Mejorable. |
| > 50% | Hay algo real. Escalar. |

No mirar DAU, MAU ni descargas hasta tener esta métrica sólida.

---

## Pitch en una frase

> "La única app de fitness que te regala sus features más avanzadas si eres consistente — sin suscripción. Entrena un año y desbloqueas todo."

---

## Decisiones abiertas

1. ¿Los hitos de consistencia son por días de entreno (propuesta actual) o por tier ranked (más elegante pero más opaco para el usuario)?
2. ¿La Fantasy League compite dentro de un Gym Server o es independiente?
3. ¿Hay monetización desde el día 1 (donaciones, cosmetics) o primero usuarios y luego modelo?
