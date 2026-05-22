# Gym Servers — Hacer el módulo vendible
**Fecha:** 2026-05-22  
**Prioridad:** Alta (primer camino a ingresos reales)  
**Dependencia:** MVP consumer beta primero (semanas 1-4)

---

## Objetivo

Convertir el módulo `gym_servers` (actualmente WIP) en algo que un dueño de gym independiente pueda usar y pagar $20-50/mes. No es un rediseño — es completar lo que ya está construido.

## Estado actual (bugs conocidos del CLAUDE.md)

| Problema | Impacto | Fichero |
|----------|---------|---------|
| Sin endpoint para descubrir gyms públicos | Un gym no puede ser encontrado sin que alguien tenga el invite_code | `router.py` |
| Sin endpoint para abandonar un gym | Un usuario atrapado en un gym = mala UX, imposible de vender | `router.py` |
| `contribution` en retos nunca se actualiza | Los retos aparecen pero el progreso es siempre 0. Inútil para el gym admin | `service.py` + hook en `workout_sessions` |
| 5 de 7 endpoints sin `response_model` | No aparecen en OpenAPI, dificulta el debugging y el frontend | `router.py` |
| `GymChampionBadge` tabla huérfana | Sin endpoints ni lógica que la use | `router.py` + `service.py` |

## Lo que falta construir

### Backend — 4 endpoints nuevos

```
GET  /api/v1/gym-servers/public          → listar gyms públicos (filtrar por ciudad)
DELETE /api/v1/gym-servers/{gym_id}/leave → abandonar un gym
POST /api/v1/gym-servers/{gym_id}/challenges/{id}/progress → registrar progreso manual
GET  /api/v1/gym-servers/{gym_id}/season-standings → clasificación de temporada
```

### Backend — hook de progreso automático

Cuando se registra una `workout_session`, el sistema debe:
1. Buscar retos activos del usuario en sus gyms
2. Si el `target_type` del reto es `sessions`, incrementar `contribution += 1`
3. Si es `volume` o `exercises`, calcular según la sesión

Implementar en `workout_sessions/service.py` al crear sesión, llamando a `gym_servers/service.py`.

### Frontend — 3 pantallas nuevas

1. **Discover** — listado de gyms públicos con buscador por ciudad. Tarjeta: nombre, ciudad, miembros, botón "Unirse"
2. **Panel admin del gym** — solo visible para role `admin/owner`. Crear reto, ver miembros, ver clasificación de temporada
3. **Vista de retos** — progreso real con barra de porcentaje. Actualmente muestra retos pero contribution = 0 siempre

### Experiencia mínima vendible para un gym

Un dueño de gym debe poder hacer esto en 5 minutos:
1. Crear su gym server con nombre, ciudad, descripción
2. Copiar el `invite_code` y mandarlo a sus clientes por WhatsApp
3. Ver quién se ha unido
4. Crear un reto semanal ("Quien más sesiones haga esta semana")
5. Ver el leaderboard al final de la semana

Todo esto existe o está a 1-2 endpoints de distancia.

## Modelo de monetización B2B

- **Free:** hasta 10 miembros en el gym server
- **Básico ($20/mes):** hasta 50 miembros + retos ilimitados + leaderboard de temporada
- **Pro ($50/mes):** miembros ilimitados + badge verificado + estadísticas del gym + branding personalizado

No activar el paywall hasta tener el primer gym usando la versión free. El límite de 10 miembros free hace que la venta sea natural ("tienes 11 miembros, para crecer necesitas Básico").

## Estimación de trabajo

| Tarea | Tiempo estimado |
|-------|----------------|
| 4 endpoints backend nuevos | 1 día |
| Hook de progreso automático en workout_sessions | 0.5 días |
| Response models en endpoints existentes | 2 horas |
| Frontend: discover + admin panel + retos con progreso | 2-3 días |
| **Total** | **~5 días** |

## Cuándo arrancarlo

Después de que la beta consumer (amigos) confirme Day-3 retention >40%. No antes. Si el producto base no retiene, Gym Servers tampoco va a funcionar.

---

## Decisiones abiertas

1. ¿El progreso de retos es solo `sessions` (más simple) o también `volume`/`exercises` en v1?
2. ¿Los límites de plan del gym se gestionan en backend (restricción real) o son solo honor system en v1?
3. ¿Integración con Ranked? (un gym podría tener su propio mini-leaderboard de LP)
