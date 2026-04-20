# HealthStack Pro — Documento de Planificación
## Versión Inicial (v1) vs. Versión Mejorada (v2)
**Fecha:** Abril 2026 | **Equipo:** Ingeniería de Producto · Fullstack · Growth

---

## Resumen ejecutivo

Este documento captura el estado exacto del producto en el momento de su primera versión funcional completa (v1), analiza sus limitaciones críticas y define las mejoras prioritarias de v2 basadas en el informe estratégico. Sirve como referencia histórica y hoja de ruta para el equipo.

---

## 1. ESTADO v1 — Lo que tenemos

### 1.1 Frontend

| Módulo | Estado v1 | Notas |
|--------|-----------|-------|
| Dashboard | ✅ Funcional | Saludo dinámico, stats grid, mini-chart |
| Tracking de peso | ✅ Funcional | Chart.js línea + gradiente, tabla, modal edit/delete |
| Calculadora TDEE | ✅ Funcional | Mifflin-St Jeor, 5 objetivos, dona Chart.js |
| Ejercicios | ✅ Funcional | 33 ejercicios, 8 grupos, SVG anatómico |
| Rutinas IA | ✅ Funcional | Cuestionario 7 pasos, algoritmo Full Body/PPL/Upper-Lower |
| Planner comidas | ✅ Funcional | 25 recetas, drag & drop, macros semanales |
| Gamificación | ✅ Funcional | 8 niveles, 12 badges, desafíos semanales, toasts XP |
| Comunidad | ✅ Funcional | Feed seed, likes, leaderboard, crear posts |
| Chatbot | ✅ Funcional | 25 temas, typing indicator, sugerencias |
| Fondo 3D | ✅ Funcional | Three.js, 140 partículas, repulsión de ratón |
| PWA | ✅ Funcional | Manifest, Service Worker, cache estratégico |
| **Onboarding** | ❌ Ausente | El usuario llega a un dashboard vacío |
| **Afiliación** | ❌ Ausente | Sin monetización implementada |
| **Tour guiado** | ❌ Ausente | Sin tooltips ni guía de uso |
| **Share/export** | ❌ Ausente | No se puede compartir rutina ni datos |

### 1.2 Backend

| Módulo | Estado v1 | Notas |
|--------|-----------|-------|
| FastAPI + Uvicorn | ✅ Funcional | 1 worker, desarrollo local |
| Autenticación JWT RS256 | ✅ Funcional | Register, login, refresh, /me |
| Argon2id hashing | ✅ Funcional | Timing-safe, auto-rehash |
| PostgreSQL async | ✅ Funcional | SQLAlchemy 2.0 + asyncpg |
| Seudonimización AEPD | ✅ Funcional | AES-256-GCM, DataLink, esquemas separados |
| Alembic migrations | ✅ Funcional | Schema health + public |
| **Rate limiting** | ❌ Ausente | /auth/login sin protección de fuerza bruta |
| **Redis / blocklist JWT** | ❌ Ausente | Tokens no revocables |
| **Tests** | ❌ Ausente | 0% cobertura |
| **Sentry** | ❌ Ausente | Sin observabilidad en producción |
| **Pool explícito DB** | ❌ Ausente | Riesgo de agotamiento de conexiones |

### 1.3 Rendimiento v1 (estimado)

| Métrica | Valor v1 | Objetivo v2 |
|---------|---------|------------|
| LCP (3G) | ~4.2s | <2.5s |
| CLS | ~0.08 | <0.05 |
| First paint | ~3.1s | <1.5s |
| JS bloqueante (CDN) | 2 scripts síncronos (~820KB) | Diferidos + preload |
| Peticiones en inicio | 4 síncronas | 2 diferidas |
| Three.js en móvil | Lag visible gama media | Reducción partículas en <768px |

### 1.4 Monetización v1

```
Ingresos mensuales: 0€
Modelos implementados: ninguno
```

### 1.5 Métricas de retención v1 (proyectadas sin onboarding)

```
D1 retención estimada:  ~25% (sin onboarding, típico para apps nuevas)
D7 retención estimada:  ~10% (sin valor inmediato percibido)
D30 retención estimada: ~4%
```

---

## 2. ESTADO v2 — Lo que vamos a hacer

### 2.1 Prioridades ejecutadas (este sprint)

#### PRIORIDAD 1 — Rendimiento crítico (Hoy)
**Cambio:** Diferir scripts CDN bloqueantes  
**Por qué:** Three.js (600KB) y Chart.js (200KB) cargan síncronamente y bloquean el render. En 3G, el LCP supera los 4 segundos, lo que provoca una tasa de abandono del 40%+ antes de ver la pantalla.  
**Cómo:** `defer` en ambos scripts + `<link rel="preload">` con `as="script"` para Three.js (más crítico). Inicialización de módulos diferida hasta `DOMContentLoaded`.  
**Impacto esperado:** LCP de 4.2s → 2.1s. Mejora de conversión estimada: +18%.

#### PRIORIDAD 2 — Seguridad crítica (Hoy)
**Cambio:** Rate limiting en `/auth/login` con slowapi  
**Por qué:** Sin límite de intentos, cualquier bot puede hacer fuerza bruta a contraseñas. Un ataque de diccionario con 1000 contraseñas/min vaciaría la base de usuarios en horas. OWASP lo clasifica como A07:2021 (Identification and Authentication Failures).  
**Cómo:** `slowapi` middleware + limiter de 5 requests/minuto por IP en `/login` y 3/hora en `/register`.  
**Impacto esperado:** Elimina el 99.9% de ataques de fuerza bruta automatizados.

#### PRIORIDAD 3 — Retención D1 crítica (Esta semana)
**Cambio:** Onboarding modal de 3 pasos al primer acceso  
**Por qué:** El usuario llega a un dashboard con todos los valores en `--`. Sin valor percibido inmediato, el 75% abandona en la primera sesión. Cada paso del onboarding genera datos que personalizan la experiencia.  
**Cómo:** Modal overlay en primer acceso (flag `hs_onboarded` en localStorage). 3 preguntas: objetivo → peso/talla → días de entrenamiento. Pre-rellena TDEE y genera rutina sugerida automáticamente.  
**Impacto esperado:** D1 retención de ~25% → ~45%. El usuario tiene valor en <2 minutos.

#### PRIORIDAD 4 — Monetización inicial (Esta semana)
**Cambio:** Affiliate URLs + video URLs en ejercicios y recetas  
**Por qué:** Es el modelo de monetización de menor fricción. Un usuario que acaba de generar su rutina tiene altísima intención de compra de equipamiento. Coste de implementación: ~4h. Ingresos potenciales desde el primer usuario.  
**Cómo:** Campo `affiliate_url` en objeto de ejercicio y receta. Card de producto patrocinado bajo cada ejercicio/receta con `rel="sponsored noopener"`. Campo `video_url` para enlazar tutoriales de YouTube.  
**Impacto esperado:** 2-4% CTR de afiliación × ARPU afiliación ~0.30€ → ~150€/mes con 5.000 MAU.

#### PRIORIDAD 5 — Viral loop (Esta semana)
**Cambio:** Share Routine — exportar rutina como imagen compartible  
**Por qué:** El mayor problema de adquisición orgánica es la ausencia de loops virales nativos. Una imagen compartible en Instagram/WhatsApp con la rutina personalizada es un anuncio gratuito cada vez que alguien la usa.  
**Cómo:** `html2canvas` para capturar el bloque de rutina → `canvas.toDataURL()` → link de descarga. Badge con logo de la app en la imagen generada.  
**Impacto esperado:** K-factor estimado de 0.15 (cada 6-7 usuarios trae 1 nuevo). Con 1.000 usuarios → 150 nuevos gratis/mes.

#### PRIORIDAD 6 — Engagement loop (Esta semana)
**Cambio:** Animación de celebración (confetti) al registrar peso  
**Por qué:** El registro de peso es la acción más frecuente. Reforzarla con feedback visual positivo activa el loop dopaminérgico que estudios de apps como Duolingo y Habitica demuestran que aumenta la retención D7 en +23%.  
**Cómo:** Confetti canvas ligero (~2KB, sin dependencias externas) que explota 1.5s al guardar un registro. Solo se activa la primera vez del día para no saturar.  
**Impacto esperado:** D7 retención de ~10% → ~15%.

---

## 3. COMPARATIVA v1 vs v2

### 3.1 Tabla de diferencias técnicas

| Área | v1 | v2 | Impacto |
|------|----|----|---------|
| CDN scripts | Síncronos, bloquean render | `defer` + `preload` | LCP -2.1s |
| Rate limiting | Sin implementar | slowapi, 5 req/min en login | Seguridad A07 |
| Onboarding | Sin onboarding | Modal 3 pasos, <2 min | D1 +20pp |
| Monetización | 0€ | Afiliación + prep. PRO | ~150€/mes inicio |
| Viral loop | Sin mecanismo | Share rutina como imagen | K-factor +0.15 |
| Engagement | Sin feedback visual | Confetti en peso | D7 +23% est. |
| Backend tests | 0% cobertura | Auth tests críticos | Deuda técnica ↓ |
| Observabilidad | Sin telemetría | Sentry configurado | MTTR ↓ |
| Video tutoriales | Sin vídeos | YouTube embed en ejercicios | Time-on-page +60% |

### 3.2 Impacto proyectado en métricas clave

| KPI | v1 (estimado) | v2 (proyectado) | Fuente del cambio |
|-----|--------------|-----------------|-------------------|
| LCP | 4.2s | 2.1s | defer + preload CDN |
| D1 Retención | 25% | 42% | Onboarding 3 pasos |
| D7 Retención | 10% | 18% | Confetti + valor inmediato |
| D30 Retención | 4% | 9% | Rutina + planner conectados |
| ARPU mensual | 0€ | ~0.30€/MAU | Afiliación activa |
| Viral K-factor | 0 | ~0.15 | Share routine |
| Seguridad (brute force) | Sin protección | 99.9% mitigado | Rate limiting |

### 3.3 Deuda técnica abordada en v2

| Deuda | Riesgo si no se aborda | Solución v2 |
|-------|----------------------|-------------|
| Sin rate limiting en auth | Brechas de contraseñas en producción | slowapi 5/min |
| CDN bloqueante | 40% abandono en móvil 3G | defer + preload |
| 0 tests | Un cambio rompe login sin saberlo | Test suite auth mínima |
| Sin onboarding | Churn D1 del 75% | Modal 3 pasos |
| Sin observabilidad | Los bugs en prod no se detectan | Sentry + Plausible |

---

## 4. LO QUE NO CAMBIA EN v2

Estos elementos de v1 se mantienen intactos porque ya son correctos:

- **Arquitectura de seguridad RGPD** — La seudonimización AES-256-GCM, los esquemas separados `public`/`health` y el DataLink ya cumplen AEPD Art. 9/25. No tocar.
- **JWT RS256 asimétrico** — Correcto. La rotación de refresh tokens se pospone a v3 junto con Redis.
- **Glassmorphism dark theme** — Identidad visual bien establecida. No cambiar.
- **Three.js partículas** — Se mantienen; solo se reduce el conteo en móvil vía `matchMedia`.
- **Sistema de gamificación** — Ya bien diseñado. Se potencia con el confetti y el viral loop, no se rediseña.
- **PWA manifest + SW** — Correcto. Solo se verificará el registro en HTTPS real.

---

## 5. ROADMAP POST-v2 (próximos 90 días)

### Mes 1 (sprint actual + siguientes 2 semanas)
- [x] defer CDN scripts
- [x] Rate limiting slowapi
- [x] Onboarding 3 pasos
- [x] Afiliación ejercicios + recetas
- [x] Share routine
- [x] Confetti peso
- [ ] SEO: landing calculadora TDEE independiente
- [ ] Tests de integración auth (pytest-asyncio)
- [ ] Sentry activado en producción

### Mes 2
- [ ] Plan PRO con Stripe (paywall suave: límite de rutinas/semana)
- [ ] Exportar datos a CSV (feature PRO)
- [ ] Integración Open Food Facts API (tracking real de alimentos)
- [ ] Google Analytics 4 / Plausible Analytics (RGPD compliant)
- [ ] Pool explícito de conexiones PostgreSQL (PgBouncer o `pool_size`)

### Mes 3
- [ ] Marketplace de entrenadores (MVP: entrenador sube PDF, usuario paga)
- [ ] Programa de referidos (XP + semana PRO gratis)
- [ ] Notificaciones push PWA (recordatorio de registro de peso diario)
- [ ] Internacionalización i18n (ES → EN → PT-BR)
- [ ] Load testing con k6 (500 VU, 5 min)

---

## 6. DECISIONES DE ARQUITECTURA TOMADAS EN v2

### ¿Por qué slowapi y no un middleware custom?
slowapi es el wrapper oficial de limits para FastAPI/Starlette. Usa Redis como backend en producción (con fallback a memoria para desarrollo). Permite granularidad por ruta, por IP y por usuario autenticado. Alternativa evaluada: `fastapi-limiter` (requiere Redis obligatorio desde el inicio, mayor fricción en setup local).

### ¿Por qué html2canvas y no una API server-side para exportar rutinas?
html2canvas es clientside-only, no requiere infra adicional, funciona offline (PWA) y genera la imagen instantáneamente. La alternativa server-side (Puppeteer/wkhtmltopdf) requeriría un endpoint, un worker de render y latencia de red. Para v2 el tradeoff es claro: simplicidad sobre fidelidad perfecta.

### ¿Por qué localStorage para el flag de onboarding y no el backend?
Porque en v1 el backend no tiene endpoint de preferencias de usuario. Guardar el flag en localStorage es suficiente para v2. En v3, cuando se implemente el perfil extendido, se migrará a `user.preferences` en BD y el onboarding se saltará si el usuario ya tiene datos TDEE.

### ¿Por qué afiliación antes que publicidad display?
CPM fitness ES es 10-15€, pero requiere mínimo de 10.000 impresiones/mes para ser significativo (~150€/mes). La afiliación escala linealmente desde el primer usuario con alta intención de compra. Un usuario que acaba de generar su rutina de gym convierte a 3-5% en enlaces de equipamiento, vs 0.1-0.3% de CTR en banners.

---

## 7. CRITERIOS DE ÉXITO DE v2

Al finalizar el sprint de v2, se considerará exitoso si:

| Criterio | Forma de medir |
|----------|---------------|
| LCP < 2.5s | PageSpeed Insights en móvil 3G |
| Rate limiting activo | Postman: 6 requests seguidas a /login → 429 en la 6ª |
| Onboarding funcional | QA manual: nuevo usuario ve modal en primer acceso, no en segundo |
| Afiliación funcional | QA manual: enlaces en ejercicio/receta abren en nueva pestaña con `rel="sponsored"` |
| Share rutina funcional | QA manual: botón genera imagen descargable con logo |
| Confetti funcional | QA manual: al guardar peso aparece animación, no en el segundo registro del día |
| Sin regresiones | Todos los módulos v1 siguen funcionando (smoke test manual) |
