# Matriz de Cumplimiento RGPD

**Versión:** 1.1 · **Fecha:** 2026-05-29 · **Jurisdicción:** UE / España (AEPD)

---

## Artículos del RGPD — Evidencias técnicas

| Artículo | Requisito | Implementación | Archivo | Estado |
|----------|-----------|----------------|---------|--------|
| **Art. 5(1)(a)** | Licitud, lealtad y transparencia | Consentimiento explícito en registro (`consent_gdpr=True` obligatorio) | `identity/schemas.py:consent_must_be_true` | ✅ |
| **Art. 5(1)(b)** | Limitación de finalidad | Telemetría no vincula navegación a user_id real (hash truncado) | `telemetry/repository.py` | ⚠️ Pendiente hash |
| **Art. 5(1)(c)** | Minimización de datos | Prompts IA: solo métricas numéricas, sin PII ni texto libre | `ai_insights/service.py:_build_anonymous_ai_context` | ✅ |
| **Art. 5(1)(e)** | Limitación del plazo de conservación | Password reset tokens: 1h. Refresh tokens: 7 días. Ver `06-data-retention-policy.md` | `identity/repository.py` | ✅ |
| **Art. 5(1)(f)** | Integridad y confidencialidad | AES-256-GCM con AEAD + HKDF subkey derivation | `cryptoservice.py`, `health/service.py` | ✅ |
| **Art. 7** | Condiciones del consentimiento | Campo `consent_gdpr` requerido, fecha guardada, no pre-marcado | `identity/schemas.py`, `identity/models.py` | ✅ |
| **Art. 9** | Categorías especiales (datos de salud) | Cifrado AES-256-GCM + pseudonimización. Prompts IA excluyen notas libres | `cryptoservice.py`, `post_workout_service.py` | ✅ |
| **Art. 17** | Derecho de supresión (al olvido) | `DELETE /api/v1/health/records/{id}` — elimina el registro biométrico | `health/router.py`, `health/service.py` | ✅ Parcial |
| **Art. 25** | Privacidad por diseño | Arquitectura 3 tablas (identity/datalink/biometría), separación por defecto | `03-pseudonymization-aepd.md` | ✅ |
| **Art. 28** | Responsable del tratamiento / encargados | Sentry con filtro PII before_send(). Groq/Gemini sin PII en prompts | `main.py:_sentry_before_send`, `04-ai-gdpr-safety.md` | ✅ |
| **Art. 32** | Seguridad del tratamiento | AEAD (auth tag detecta manipulación). Argon2id para passwords. RS256 JWT | `cryptoservice.py`, `hashing.py`, `jwt_handler.py` | ✅ |
| **Art. 33** | Notificación de brechas (72h) | Procedimiento documentado | `07-breach-response-procedure.md` | ✅ Doc |
| **Art. 34** | Comunicación a interesados | Procedimiento incluido en breach response | `07-breach-response-procedure.md` | ✅ Doc |

---

## Guía AEPD — "Orientaciones para tratamientos de datos de salud"

| Recomendación AEPD | Implementación | Estado |
|-------------------|----------------|--------|
| Pseudonimización con tabla de cruce cifrada | DataLink + AES-256-GCM | ✅ |
| Clave de cruce en entorno separado de la BD | HEALTH_LINK_MASTER_KEY en .env, nunca en BD | ✅ |
| UUID aleatorio como identificador pseudónimo | `CryptoService.generate_health_subject_id()` usa UUID v4 | ✅ |
| Separación entre identidad y biometría | Tablas `users`, `data_links`, `health_records` en schemas distintos | ✅ |
| Log de accesos a datos de categoría especial | Logs sanitizados en CryptoService (`user_id[:8]`) | ✅ Parcial |
| Evaluación de Impacto (EIPD) | No requerida hasta >250 empleados o tratamiento a gran escala | ⚠️ Pendiente GA |

---

## Registro de Actividades de Tratamiento (Art. 30)

| Actividad | Base legal | Categoría de datos | Retención | Subencargados |
|-----------|------------|-------------------|-----------|---------------|
| Registro de usuario | Contrato (Art. 6.1.b) | Email, nombre, fecha creación | Hasta baja | — |
| Datos biométricos | Consentimiento (Art. 9.2.a) | Peso, altura, % grasa, sueño | Hasta baja | — |
| Notas de salud | Consentimiento (Art. 9.2.a) | Texto libre cifrado AES-256 | Hasta baja | — |
| Telemetría de uso | Interés legítimo (Art. 6.1.f) | Páginas visitadas, país | 90 días | — |
| Coaching IA | Contrato (Art. 6.1.b) | Métricas anónimas (sin PII) | 48h TTL | Groq, Gemini |
| Logs de errores | Interés legítimo (Art. 6.1.f) | Stacktraces (sin PII) | 30 días | Sentry |
| Tokens de sesión | Contrato (Art. 6.1.b) | JTI, user_id, expiración | 7 días | — |

---

## Derechos del interesado — Mecanismos disponibles

| Derecho | Mecanismo | Estado |
|---------|-----------|--------|
| Acceso (Art. 15) | `GET /api/v1/health/records` + `GET /api/v1/auth/me` | ✅ |
| Rectificación (Art. 16) | `PATCH /api/v1/auth/me` + `PATCH /api/v1/health/records/{id}` | ✅ |
| Supresión (Art. 17) | `DELETE /api/v1/health/records/{id}` | ✅ Parcial |
| Portabilidad (Art. 20) | Export JSON — pendiente implementar | ❌ Pendiente |
| Oposición (Art. 21) | Baja de cuenta — pendiente implementar | ❌ Pendiente |
| Retirada de consentimiento (Art. 7.3) | Pendiente endpoint de baja | ❌ Pendiente |

---

*Próxima revisión: antes del lanzamiento GA o si hay cambios de arquitectura significativos.*
