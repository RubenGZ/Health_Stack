# HealthStack Pro — Beta Launch Checklist

> Generado: 2026-06-03 · Target: viernes 6 de junio 2026 · 5-10 betatesters (España, círculo cercano)
> Estado del producto: SW v122 · 18 migraciones · ~244 tests · backend en Raspberry Pi

---

## Resumen ejecutivo

El **código y la UX están listos**. El camino crítico a la beta es **infraestructura + QA**, no desarrollo.
Quedan 3 acciones manuales de infra (todas en la Pi / Cloudflare) y una pasada de QA end-to-end.

---

## 1. Estado real de cada feature

### Núcleo (production-ready — el corazón de la beta)

| Feature | Estado | Notas |
|---------|--------|-------|
| Registro / login JWT RS256 | ✅ hecho | Rate limit 3/h registro, 5/min login. Mensaje 429 user-friendly. |
| Onboarding v1 (objetivo → TDEE) | ✅ hecho | 5 pasos, calcula TDEE + macros, siembra peso inicial. |
| Onboarding v2 (NEAT + IA Groq) | ✅ hecho | 7 pasos, consentimiento Art.9 visible y revocable, fallback Mifflin. |
| Workout logger (PRs + 1RM Epley) | ✅ hecho | Detección de PR, volumen, historial. |
| Dashboard (stats, racha, proyección) | ✅ hecho | Racha = entrenos/WAU (alineado con North Star). |
| Gamificación XP / niveles / streak | ⚠️ parcial | Frontend y backend llevan XP por separado **sin sincronizar** (XP_ACTIONS vs XP_TABLE). El número visible es local. No rompe nada, pero diverge entre dispositivos. |
| AI Coach + AI Insights (RGPD-safe) | ✅ hecho | Anonimizado antes de Groq. XSS escapado. |
| Post-Workout AI Coach | ✅ hecho | Idempotente por session_id, TTL 48h. Auto-fire en primer entreno. |
| Injury-Aware routines | ✅ hecho | Rutinas IA conscientes de lesiones crónicas. |
| Nutrición (TDEE, macros, recetas) | ✅ hecho | UUID localStorage. Auth guard añadido en recetas (audit 06-03). |
| Feature gating / phases (plan.js) | ✅ hecho | Beta mode = acceso completo. Phase 3 oculta features avanzadas hasta hitos. |

### PWA / infra de cliente

| Feature | Estado | Notas |
|---------|--------|-------|
| Service Worker / offline | ✅ hecho | v122. Offline banner + cola offline. |
| First-run banner + quick-start checklist | ✅ hecho | 3 pasos: entreno (1º), peso, TDEE. |
| Bug report (WhatsApp + ring buffer JS errors) | ✅ hecho | feedbackWidget.js, auto-adjunta errores. |
| Toast bienvenida beta | ✅ hecho | |
| Manifest icons / screenshots / standalone | ⚠️ verificar | Stub de screenshots. **Falta verificar Add-to-Home-Screen en iOS/Android real.** |
| Portrait-only orientation lock | ✅ hecho | |

### WIP — NO listo para beta (no prometer)

| Feature | Estado | Riesgo |
|---------|--------|--------|
| Ranked (leaderboards) | ⚠️ parcial | Season dinámica OK; scopes city/national comparten implementación (faltan `country_code/city`). |
| gym_servers | ⚠️ parcial | Discover + leave OK; GymChampionBadge huérfano, contribution de retos no se registra. |
| Integrations (Garmin/Strava/Fitbit/Google Fit) | ❌ falta | 0 tests, OAuth cableado pero ningún E2E. **La landing anuncia "Activo" — promesa incumplida.** |
| Sueño / ingesta pasiva wearables | ❌ falta | No existe. |
| Pasarela de pago (Stripe) / paywall | ❌ falta | Por diseño: beta = todo Free. |

---

## 2. Los 5 riesgos más importantes para la beta

1. **URL inestable (Quick Tunnel)** — `healthstack_tunnel_quick` genera URL aleatoria que cambia en cada reinicio. Si la Pi reinicia durante la beta, los testers pierden acceso y la PWA instalada apunta a una URL muerta. **Mitigación: Named Tunnel (Blocker #1) antes del viernes.**
2. **CORS abierto** — `ALLOWED_ORIGINS` permite cualquier origen. Riesgo de seguridad + tokens expuestos. **Mitigación: fijar la URL estable (Blocker #2).**
3. **PWA install no verificado en hardware real** — iOS Safari es notoriamente quisquilloso con standalone / service worker / splash. Si Add-to-Home-Screen falla, la propuesta "app nativa" se cae. **Mitigación: probar en iPhone + Android reales (Día 3 QA).**
4. **Promesas incumplidas en la landing** — anuncia integraciones "Activo" que no funcionan E2E. Un tester que las intente perderá confianza. **Mitigación: cambiar a "Próximamente" antes de invitar.**
5. **Persistencia de sesión tras cerrar la PWA** — el flujo refresh-token + onboarding gating es complejo (v1/v2, localStorage vs server flags). Si la sesión no persiste al reabrir, el tester ve el wizard otra vez o un login. **Mitigación: test explícito de cerrar/reabrir en QA.**

---

## 3. Las 3 métricas a trackear la primera semana

> Telemetría ya instrumentada vía `POST /api/v1/telemetry/event` (fire-and-forget, log-only).

1. **North Star — entrenos por usuario activo semanal (entrenos/WAU).** Es la métrica del producto (Master Strategy §G). Eventos: `primera_sesion_guardada`, sesiones subsiguientes. Objetivo semana 1: ≥10 entrenos registrados en total, ≥5 testers con ≥1 entreno.
2. **Activación / TTFV (time-to-first-value).** Delta entre `registro_completado` y `primera_sesion_guardada`. Mide si el onboarding lleva al primer entreno sin fricción. Objetivo: la mayoría registra ≥1 entreno en su primera sesión.
3. **Crashes JS reportados.** Ring buffer `hs_js_errors` + `window.onerror` → telemetría + bug report. Objetivo: **0 críticos**. Cualquier crash que rompa navegación es P0.

---

## 4. Definition of Done — beta exitosa (fin de semana 1)

La beta se considera exitosa si **todo** lo siguiente es cierto:

- [ ] URL estable (Named Tunnel) sirviendo HTTPS, sobrevive a un reinicio de la Pi sin cambiar.
- [ ] CORS restringido a la URL de beta (no abierto).
- [ ] Smoke test pasa al 100% desde un dispositivo externo a la Pi.
- [ ] ≥5 betatesters instalaron la PWA (Add-to-Home-Screen) en iOS y/o Android.
- [ ] Login funciona en iOS Safari y la sesión **persiste** tras cerrar y reabrir la app.
- [ ] ≥10 entrenos registrados en total durante la semana.
- [ ] **0 crashes JS críticos** reportados (los que rompen navegación).
- [ ] Al menos 1 tester recibió un AI Insight / Post-Workout Coach (el "momento mágico").
- [ ] Monitoreo activo: `docker logs healthstack_backend -f` + Sentry sin error-spike sostenido.

> Si los 8 primeros puntos se cumplen, la beta cumple su objetivo: validar estabilidad, install y el loop entreno→insight con usuarios reales.

---

## Apéndice — comandos clave (ejecutar en la Pi)

```bash
# Deploy
bash ~/healthstack-pi-server/scripts/update.sh

# Migración
docker exec healthstack_backend alembic upgrade head   # HEAD: f2a3b4c5d6e7

# Tests
docker exec healthstack_backend python -m pytest -v --tb=short

# Smoke test (desde dispositivo externo)
python3 scripts/smoke_test.py https://URL-ESTABLE

# Monitoreo durante la beta
docker logs healthstack_backend -f
```
