# Subencargados del Tratamiento (Art. 28 RGPD)

Todo proveedor externo que trate datos personales en nombre de HealthStack Pro
es un **encargado del tratamiento** y requiere un DPA (Data Processing Agreement).

---

## Listado de subencargados activos

| Proveedor | Servicio | Datos transferidos | DPA | Localización |
|-----------|----------|--------------------|-----|--------------|
| **Groq Inc.** | LLM API (coach IA) | Métricas anónimas (sin PII) | ⚠️ Pendiente formalizar | EE.UU. (SCCs requeridas) |
| **Google (Gemini)** | LLM API (fallback IA) | Métricas anónimas (sin PII) | ⚠️ Pendiente formalizar | EE.UU. (SCCs requeridas) |
| **Sentry** | Error monitoring | Stacktraces filtrados (sin PII) | ✅ [DPA en sentry.io/legal] | EE.UU. (SCCs) |
| **Cloudflare** | Tunnel / CDN | IPs de clientes (transit) | ✅ [cloudflare.com/privacypolicy] | EE.UU. (SCCs) |
| **Resend** | Email transaccional | Email del usuario (reset password) | ⚠️ Pendiente verificar | EE.UU. (SCCs) |

---

## Garantías técnicas por proveedor

### Groq / Gemini (proveedores IA)

**Garantía implementada en código:**
```python
# ai_insights/service.py — _build_anonymous_ai_context()
# NUNCA se envía: user_id, email, display_name, health_subject_id,
# notas de texto libre, health_uuid_enc, ni ningún campo de texto libre.
# Se envía: valores numéricos (peso, XP, conteos), nombres de ejercicios fitness.

# post_workout_service.py — _build_prompt()
# notes_block = ""  # Notas excluidas desde 2026-05-29 — RGPD Art. 9
```

**Riesgo residual:** Los nombres de ejercicios ("press banca", "sentadilla") no
son PII pero podrían ser pseudoPII en combinación con otros datos. Aceptable por
el nivel de abstracción (terminología fitness genérica).

**Transferencia internacional:** EE.UU. — requiere Standard Contractual Clauses
(SCCs) de la Comisión Europea. Pendiente de formalizar antes del lanzamiento con
usuarios de pago.

### Sentry

**Configuración activa:**
```python
# main.py
sentry_sdk.init(
    send_default_pii=False,      # PII desactivada por defecto
    before_send=_sentry_before_send,  # Filtro adicional — ver comentarios
)
```

**Campos filtrados antes de enviar a Sentry:**
- email, password, display_name, access_token, refresh_token, token
- user_id, health_subject_id, health_uuid_enc
- weight_kg, body_fat_pct, notes, notes_encrypted
- injury_type, body_area, pain_level
- IPs → solo primer octeto (x.x.x.x)
- Cabeceras Authorization, Cookie, Set-Cookie

### Resend (email)

El email del usuario se envía a Resend únicamente para:
- Email de restablecimiento de contraseña (único tipo de email actual)

La URL de reset usa fragmento `#` desde 2026-05-29 — no aparece en logs de Resend.

---

## Transferencias internacionales (Art. 46 RGPD)

Todos los proveedores USA requieren **Standard Contractual Clauses (SCCs)**
aprobadas por la Comisión Europea (Decisión 2021/914).

**Estado:** Pendiente de formalizar antes del lanzamiento con usuarios de pago.
Para beta (5-10 usuarios de confianza), aceptable dado el volumen mínimo.

---

## Acciones pendientes

1. Firmar DPA con Groq (https://groq.com/dpa)
2. Firmar DPA con Google Cloud (Gemini) en Google Cloud Console
3. Verificar DPA vigente con Resend
4. Revisar SCCs para transferencia EE.UU.-UE con cada proveedor
5. Evaluar alternativas europeas (Mistral AI con servidores EU) para Q3
