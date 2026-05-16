# PRIVACY.md — AIRouter y RGPD

Este documento detalla qué datos de usuario viajan a cada proveedor de IA,
los riesgos asociados al uso de free tiers, y las acciones requeridas
antes de poner en producción con usuarios reales.

---

## Tabla de datos por use_case

| Use case | Datos enviados | ¿Contiene PII/salud? | Provider primario | Riesgo RGPD |
|---|---|---|---|---|
| `public_chat` | Mensajes del chat (genéricos) | ✗ No directo | Gemini free | Bajo |
| `realtime_coach` | Peso, reps, RPE de la serie actual | ✗ Sin identificador | Cerebras free | Bajo |
| `insights_narrative` | Peso histórico 30 días, nº entrenamientos, nivel/racha | ⚠️ Datos biométricos | Gemini free | **Alto** |
| `injury_risk` | Nombres de ejercicios, frecuencia semanal | ⚠️ Datos de entrenamiento | Gemini free | **Alto** |
| `weekly_goals` | Nivel, XP total, racha, peso reciente | ⚠️ Datos biométricos | Gemini free | **Alto** |
| `food_vision` | Imagen de comida (futuro) | ⚠️ Potencialmente identificable | Gemini free | **Alto** |

---

## Riesgo del free tier

**Google AI Studio (Gemini free tier)**  
Según los TOS de Google AI Studio vigentes a la fecha de esta PR (mayo 2026),
los prompts enviados en el free tier **pueden usarse para mejorar los modelos de Google**.
Esto significa que datos de peso, entrenamientos y salud de tus usuarios
podrían incorporarse al entrenamiento de modelos de terceros.

**Groq (free tier)**  
Mismo riesgo potencial. Revisar TOS actuales en https://groq.com/terms

**Cerebras (free tier)**  
Mismo riesgo potencial. Revisar TOS actuales en https://cloud.cerebras.ai/terms

---

## TODO: P0-RGPD — Acciones requeridas antes de producción

Los siguientes use_cases están marcados con `# TODO: P0-RGPD` en `config.py`:

### `INSIGHTS_NARRATIVE`
- **Qué envía:** peso inicial, peso actual, delta, número de entrenamientos, nivel, racha.
- **Acción requerida:** migrar a Google Vertex AI (con DPA firmado) o Mistral EU (GDPR-compliant) antes de tener usuarios reales.

### `INJURY_RISK`
- **Qué envía:** nombres de ejercicios de la rutina, frecuencia de entrenamientos semanales.
- **Acción requerida:** ídem. Alternativamente, anonimizar los nombres de ejercicios (sustituir por categorías genéricas: "ejercicio de empuje", "tirón", etc.).

### `WEEKLY_GOALS`
- **Qué envía:** nivel, XP total, racha, peso reciente.
- **Acción requerida:** ídem. El peso reciente es el dato más sensible — valorar enviarlo redondeado a ±2kg.

---

## Use_cases sin riesgo P0

**`PUBLIC_CHAT`** — El chat es genérico (nutrición, fitness, preguntas generales). No incluye identificadores ni datos biométricos directos del usuario en el prompt. Riesgo bajo.

**`REALTIME_COACH`** — Solo envía los datos de la serie actual (peso en kg, reps, RPE). Sin user_id, sin historial, sin datos de salud longitudinales. Riesgo bajo.

---

## Pseudonimización en curso

Los registros de salud en la BD ya están pseudonimizados:
- `user_id` → cifrado AES-256-GCM → `health_subject_id` → registros de salud.
- Esto protege los datos *en reposo* (RGPD Art. 32).

Lo que **no** está protegido aún: los datos que salen de la BD y se envían a APIs externas en texto plano como parte del prompt. Eso es lo que cubren los TODOs P0-RGPD.

---

## Base legal actual

Durante el período de desarrollo/beta sin usuarios reales:
- Artículo 6(1)(f) RGPD — interés legítimo para desarrollo del producto.
- No aplica Art. 9 (datos de salud especiales) porque no hay usuarios reales.

Antes del lanzamiento público:
- Requiere DPA (Data Processing Agreement) con el proveedor de IA.
- O migración a proveedores con sede en la UE / Vertex AI con región EU.
- O anonimización suficiente de los prompts (que los datos no sean re-identificables).
