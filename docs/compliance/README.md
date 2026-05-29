# HealthStack Pro — Dossier de Cumplimiento RGPD/AEPD

> **Carpeta de auditoría.** Toda la documentación técnica de privacidad y seguridad
> necesaria para responder a una inspección de la AEPD, un pentest externo o
> una due diligence de inversores.

---

## Índice de documentos

| Archivo | Contenido | Audiencia |
|---------|-----------|-----------|
| `01-architecture-security.md` | Diagrama del sistema, decisiones de diseño, modelo de amenazas | CTO, auditor técnico |
| `02-aes256gcm-encryption.md` | Especificación del cifrado AES-256-GCM con evidencias de código | Auditor AEPD, DPO |
| `03-pseudonymization-aepd.md` | Arquitectura de pseudonimización (DataLink), flujo completo | Auditor AEPD |
| `04-ai-gdpr-safety.md` | Garantías de privacidad en prompts IA (SHA-256, sin PII) | DPO, auditor IA |
| `05-gdpr-compliance-matrix.md` | Artículo por artículo RGPD con evidencia técnica | AEPD, abogados |
| `06-data-retention-policy.md` | TTLs, expiración de tokens, logs, derecho al olvido | DPO, legal |
| `07-breach-response-procedure.md` | Protocolo ante brecha de datos (Art. 33/34 RGPD) | DPO, CEO |
| `08-master-key-procedures.md` | Gestión de HEALTH_LINK_MASTER_KEY, rotación, backup | CTO, ops |
| `09-security-audit-log.md` | Registro de auditorías realizadas y hallazgos | Auditor, CTO |
| `10-third-party-processors.md` | Listado de subencargados (Groq, Sentry, etc.) Art. 28 | DPO, legal |

---

## Estado del cumplimiento (actualizado 2026-05-29)

| Área | Estado | Notas |
|------|--------|-------|
| AES-256-GCM datos de salud | ✅ Production | HKDF subkey derivation desde v2.1 |
| Pseudonimización AEPD | ✅ Production | DataLink + CryptoService |
| SHA-256 en logs IA | ✅ Production | AIRouter._hash_user_id() |
| Filtro PII en Sentry | ✅ Production | before_send() en main.py |
| Consentimiento RGPD Art. 7 | ✅ Production | consent_gdpr required en registro |
| Derecho al olvido Art. 17 | ✅ Production | DELETE /health/records |
| CSP header | ✅ Production | Añadido 2026-05-29 |
| Rate limiting por IP real | ✅ Production | CF-Connecting-IP fix 2026-05-29 |
| Reset token en URL segura | ✅ Production | Fragmento # (no query param) |
| Credenciales admin sin defaults | ✅ Production | Config limpio 2026-05-29 |
| Notas usuario fuera del prompt IA | ✅ Production | Fix RGPD Art. 9 2026-05-29 |
| CORS restringido | ⚠️ Pendiente | Configurar ALLOWED_ORIGINS con URL estable |
| Named Tunnel Cloudflare | ⚠️ Pendiente | Quick Tunnel activo en beta |
| Integrations OAuth2 tests | ❌ Pendiente | 0 tests, no en producción |

---

## Contacto del responsable de tratamiento

- **Responsable:** HealthStack Pro (Ruben G.)
- **DPO:** Pendiente de nombramiento formal (no obligatorio hasta >250 empleados)
- **Email de privacidad:** privacy@healthstack.pro (pendiente de activar)

---

*Este dossier se actualiza con cada cambio significativo de arquitectura de seguridad.*
*Última actualización: 2026-05-29 · Auditoría interna red-team completada.*
