# TODOS — HealthStack Pro (deuda técnica post-beta)

## 🔴 P1 — Antes del lanzamiento comercial / público

### RGPD — Cifrado de eating_style y sport_activities
**Contexto:** Actualmente `eating_style` y `sport_activities` están en texto plano en `public.users`.
Según RGPD Art.9, los hábitos alimentarios y el historial deportivo pueden considerarse
datos de salud dependiendo del contexto. Para el lanzamiento comercial, evaluar cifrarlos
en `health.user_health_profiles` o aplicar pseudonimización adicional.
**Archivo:** `backend/app/modules/identity/models.py` + migración nueva.

### Groq/Meta DPA — Verificación Art.28
**Contexto:** El endpoint `/onboarding-v2` envía métricas numéricas anónimas a Groq (Meta llama-3.3).
Antes de lanzamiento comercial, verificar que el DPA de Groq cubre el tratamiento de datos
de salud como encargado del tratamiento (Art.28 RGPD). Si no cubre datos Art.9,
migrar a Vertex AI (Google Cloud) o AWS Bedrock que sí tienen BAA/DPA adecuados.
**Ref:** D10 del plan eng-review 2026-06-01.

---

## 🟡 P2 — Post-beta (no bloquea MVP)

### Re-survey automático 90 días
**Contexto:** Los usuarios que completaron onboarding v2 deben recibir un banner a los 90 días
invitándoles a actualizar su perfil (cambios en composición corporal, actividad, etc.).
**Implementación:** Cronjob o check en login `(now() - ai_profile_generated_at) > 90 días`.
**Archivo:** `frontend/js/smartOnboarding.js` + nuevo endpoint PATCH o reutilizar `/onboarding-v2`.

### Rate limit por user_id en /onboarding-v2
**Contexto:** Actualmente el rate limit de `/onboarding-v2` es por IP (5/hour).
El plan original (D13) especificaba por `user_id` con `key_func` en slowapi.
Implementar cuando slowapi soporte `key_func` con `Depends()` en FastAPI 0.111.
**Archivo:** `backend/app/modules/identity/router.py`

### GymChampionBadge — Tabla huérfana
**Contexto:** La tabla `public.gym_champion_badges` existe en BD pero no tiene endpoints ni lógica.
**Archivo:** `backend/app/modules/gym_servers/`

### GymChallenge.contribution — Progreso de retos
**Contexto:** `GymChallenge.contribution` no se registra. Los retos de gym no tienen progreso real.
**Archivo:** `backend/app/modules/gym_servers/service.py`

### User.country_code/city — Para ranked city/national scopes
**Contexto:** Los scopes de ranked `get_national_leaderboard()` / `get_city_leaderboard()`
están como puntos de extensión pero requieren `User.country_code` y `User.city`.
**Implementación:** Migración nueva + UI en Perfil para editar país/ciudad.

### Rotación de MASTER_KEY — Procedimiento documentado
**Contexto:** Si la MASTER_KEY se rota, se debe re-cifrar todos los `health_uuid_enc`
en `data_links` Y todos los campos cifrados en `health.user_health_profiles`.
**Implementación:** Script `scripts/rotate_master_key.py` con dry-run + transacción atómica.
**Archivo:** `backend/app/core/security/cryptoservice.py` (hay un TODO comment inline).

### Tests de integrations (OAuth2/CSV)
**Contexto:** El módulo `integrations` tiene 0 tests. OAuth2 y CSV import son código crítico sin cobertura.
**Archivo:** `backend/tests/integration/test_integrations.py` (crear desde cero).

---

## ✅ Completado (no retomar)

- [x] Módulo A: Injury-Aware Routine Generator (2026-05-29)
- [x] Módulo B: Post-Workout AI Coach (2026-05-29)
- [x] MVP Beta Polish — feedbackWidget, display_name editable, gamification hints (2026-05-29)
- [x] Smart Onboarding v2 — wizard 7 pasos + análisis metabólico Groq (2026-06-01)
