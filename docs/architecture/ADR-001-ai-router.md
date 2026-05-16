# ADR-001: Capa de abstracción multi-provider AIRouter

**Status:** Accepted  
**Date:** 2026-05-16  
**Deciders:** Rubén (tech lead + product)

---

## Context

HealthStack Pro tenía 5 endpoints de IA que llamaban directamente a Groq vía httpx:

| Endpoint | Archivo | Timeout |
|---|---|---|
| `POST /api/v1/chat/message` | `modules/chat/router.py` | 30s |
| `POST /api/v1/ai-coach/set-feedback` | `modules/ai_coach/service.py` | 8s |
| `GET /api/v1/ai-insights/narrative` | `modules/ai_insights/service.py` | 10s |
| `GET /api/v1/ai-insights/injury-risk` | `modules/ai_insights/service.py` | 10s |
| `GET /api/v1/ai-insights/weekly-goals` | `modules/ai_insights/service.py` | 10s |

**Problemas con ese diseño:**

1. **Single point of failure** — si Groq cae, las 5 IAs caen a la vez. Sin fallback.
2. **Un modelo para todo** — `llama-3.3-70b-versatile` es competente pero no óptimo para todos los casos. El coach necesita <1s; los insights necesitan razonamiento largo; el chat público escala mal con rate limits compartidos.
3. **Sin visión** — bloquea food-photo analysis (roadmap Q3).
4. **Acoplamiento duro** — cambiar un proveedor requiere tocar código en 3 archivos distintos.
5. **Sin observabilidad** — no hay registro de qué proveedor respondió, en cuánto tiempo, ni si hubo fallback.

**Restricciones:**
- Raspberry Pi con RAM limitada → sin Redis, sin caché de capa de datos en esta PR.
- Free tiers de los 3 proveedores → sin compromisos de SLA, de ahí la importancia del fallback.
- RGPD Art. 9 — datos de salud no pueden loguearse en texto plano.
- Los contratos JSON de los 5 endpoints con el frontend NO pueden cambiar.

---

## Decision

Crear `app/services/ai_router/` — una capa de abstracción que:

1. **Centraliza** todas las llamadas a IA en un único `AIRouter`.
2. **Enruta** cada `AIUseCase` al proveedor óptimo según una `RoutingRule` configurable.
3. **Hace fallback** automático a Groq si el proveedor primario falla (errores retriables).
4. **Normaliza** requests y responses con schemas Pydantic (`AIRequest` / `AIResponse`).
5. **Loguea** metadata estructurada sin datos de salud (RGPD).

Los 5 endpoints mantienen su contrato público intacto — solo cambia la llamada interna.

---

## Options Considered

### Option A: AIRouter centralizado (elegida) ✅

| Dimensión | Assessment |
|---|---|
| Complejidad | Med — nueva capa, pero patrón de Strategy clásico |
| Coste operativo | Bajo — free tiers de 3 proveedores |
| Escalabilidad | Alta — añadir proveedor = 1 archivo + 1 entrada en config |
| Familiaridad del equipo | Alta — httpx + Pydantic ya usados en el proyecto |
| Riesgo de regresión | Bajo — los endpoints no cambian su contrato |

**Pros:**
- Un único punto de cambio para rotar proveedores.
- Fallback automático: si Gemini cae, Groq responde.
- Observabilidad: cada llamada loguea proveedor, latencia, tokens y fallback flag.
- Preparado para visión (Gemini soporta multimodal — necesario para food-photo Q3).
- Tests unitarios puros sin llamadas reales (respx + mocks).

**Cons:**
- Capa adicional de indirección.
- Cerebras SDK síncrono requiere `asyncio.to_thread` (menor complejidad operativa).
- Free tiers pueden tener rate limits distintos por proveedor.

---

### Option B: SDK OpenAI oficial para todos los proveedores

| Dimensión | Assessment |
|---|---|
| Complejidad | Med — una dependencia, pero más magia |
| Coste operativo | Bajo |
| Escalabilidad | Media — atado a lo que el SDK soporta |
| Familiaridad | Media — SDK no estaba en el proyecto |

**Pros:** Una sola dependencia, abstracciones de alto nivel.

**Cons:**
- El SDK OpenAI no soporta Cerebras directamente.
- Más difícil de mockear en tests (el SDK hace su propia gestión de httpx).
- Añade ~15MB de dependencia para funcionalidad que ya tenemos con httpx.
- **Descartada** — httpx directo es más simple, más testeable y ya está instalado.

---

### Option C: Sin router — duplicar lógica de fallback en cada endpoint

| Dimensión | Assessment |
|---|---|
| Complejidad | Alta — código duplicado en 5 sitios |
| Coste operativo | Bajo |
| Escalabilidad | Muy baja — cambiar proveedor = 5 archivos |
| Riesgo de regresión | Alto — 5 puntos de fallo independientes |

**Descartada** — viola DRY y hace la migración futura de proveedores muy costosa.

---

## Trade-off Analysis

### httpx directo vs SDK OpenAI para Gemini
Groq ya usaba httpx directo. Gemini expone un endpoint 100% compatible con la API de OpenAI en `https://generativelanguage.googleapis.com/v1beta/openai/`. Usar httpx directamente significa **cero dependencias nuevas** para Gemini, mismo patrón de código que Groq, y mocking con `respx` igual que el resto. El SDK OpenAI habría añadido complejidad sin beneficio real.

### asyncio.to_thread para Cerebras
El SDK oficial de Cerebras (`cerebras-cloud-sdk`) usa `requests` internamente — es síncrono. La alternativa sería reimplementar la autenticación de Cerebras sobre httpx. `asyncio.to_thread` es el patrón estándar de Python para integrar código síncrono en aplicaciones async sin bloquear el event loop. Overhead mínimo (~1 thread del pool por request, Cerebras responde en <500ms con su hardware wafer-scale).

### AIInvalidRequestError no hace fallback
Un 4xx ≠ 429 de Gemini (contexto demasiado largo, mensaje malformado) sería el mismo error en Groq — el request es inválido, no el proveedor. Hacer fallback en ese caso desperdiciaría una llamada y enmascaría un bug en nuestro código. El router distingue explícitamente entre errores del proveedor (retriables) y errores del request (no retriables).

### Groq como fallback universal
Groq es el único proveedor ya operativo y probado en producción. Usarlo como fallback garantiza que si cualquier proveedor nuevo falla, el sistema se degrada al estado anterior (nunca peor que antes de esta PR). En el futuro, cuando Gemini o Cerebras tengan más historial, se puede rotar el fallback.

---

## Consequences

**Lo que se hace más fácil:**
- Añadir un proveedor nuevo (Mistral, Anthropic, OpenAI) = 1 archivo en `providers/` + 1 entrada en `config.py`. Sin tocar endpoints.
- Cambiar el modelo de un use_case = 1 línea en `config.py`.
- Observar qué proveedor responde y a qué latencia en producción.
- Testear la lógica de IA sin API keys (todo mockeado).
- Preparar food-photo analysis: `GeminiProvider.supports_vision = True` ya está.

**Lo que se hace más difícil:**
- Debugging de un error puntual: hay un nivel más de indirección (endpoint → router → provider).
- Cerebras añade una dependencia externa (`cerebras-cloud-sdk`) que hay que mantener.

**Lo que habrá que revisar (deuda técnica documentada):**
- **TODO P0-RGPD** en `config.py`: `INSIGHTS_NARRATIVE`, `INJURY_RISK` y `WEEKLY_GOALS` envían datos de salud (peso, rutinas, XP) al free tier de Gemini/Groq, que puede usarlos para entrenar modelos. Antes de producción con usuarios reales: migrar a Vertex AI o tier de pago con DPA.
- **Caché de respuestas IA** — los insights semanales son caros y cambian poco. Siguiente PR: tabla `ai_insights_cache` en PostgreSQL.
- **Circuit breaker** — si un proveedor falla sistemáticamente, el router lo sigue intentando en cada request. Siguiente PR: circuit breaker con ventana de 60s.

---

## Action Items

- [x] Crear `app/services/ai_router/schemas.py` — tipos Pydantic
- [x] Crear `app/services/ai_router/base.py` — interface + excepciones
- [x] Crear `app/services/ai_router/config.py` — settings + routing rules
- [x] Crear `app/services/ai_router/providers/groq.py`
- [x] Crear `app/services/ai_router/providers/gemini.py`
- [x] Crear `app/services/ai_router/providers/cerebras.py`
- [x] Crear `app/services/ai_router/router.py`
- [x] Tests unitarios: schemas, providers, router
- [ ] Bloque D: migrar los 5 endpoints al router
- [ ] Tests de integración de endpoints
- [ ] PRIVACY.md + README.md del módulo
- [ ] Deploy en Pi y verificar con logs reales
