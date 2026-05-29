# Registro de Auditorías de Seguridad

---

## Auditoría #1 — Red Team Interno (2026-05-29)

**Realizada por:** Claude Sonnet 4.7 (adversarial review)
**Alcance:** Backend completo — cryptoservice, identity, health, ai_coach, ai_insights, post_workout, telemetry, main.py
**Método:** Revisión estática de código con perspectiva adversarial

### Hallazgos y resolución

| ID | Severidad | Descripción | Estado |
|----|-----------|-------------|--------|
| C1 | 🔴 CRÍTICO | Key reuse: misma MASTER_KEY para data_links y notes | ✅ Resuelto — HKDF subkey derivation |
| C2 | 🔴 CRÍTICO | Notas de usuario (texto libre) en prompts IA externos | ✅ Resuelto — notes_block = "" |
| H1 | 🟠 ALTO | admin_initial_password hardcodeado en config.py | ✅ Resuelto — sin default |
| H2 | 🟠 ALTO | Rate limiter usa IP de nginx, no IP real del cliente | ✅ Resuelto — _get_real_client_ip() |
| H3 | 🟠 ALTO | Reset token en query param (aparece en logs) | ✅ Resuelto — fragmento URL (#) |
| H4 | 🟠 ALTO | Google OAuth no verifica id_token criptográficamente | ⚠️ Documentado, fix en Q3 |
| H5 | 🟠 ALTO | user_id en texto plano en telemetría | ⚠️ Pendiente hash SHA-256 |
| M1 | 🟡 MEDIO | EventCreate.data sin límite de tamaño ni filtro PII | ✅ Resuelto — validator + sanitización |
| M2 | 🟡 MEDIO | /telemetry/event sin rate limit | ✅ Resuelto — 30/minute |
| M3 | 🟡 MEDIO | Content-Security-Policy header ausente | ✅ Resuelto — CSP añadido |
| L1 | 🔵 BAJO | PKCE no implementado en OAuth server-side | 📋 Backlog Q3 |
| L2 | 🔵 BAJO | Refresh token en body JSON (no HttpOnly cookie) | 📋 Documentado, por diseño PWA |
| L3 | 🔵 BAJO | app_env sin Literal validator | 📋 Backlog |
| L4 | 🔵 BAJO | Refresh tokens expirados sin cleanup automático | 📋 Verificar db_cleanup.py |

### Archivos modificados

```
backend/app/modules/health/service.py          C1: HKDF subkey derivation
backend/app/modules/workout_sessions/          C2: notas excluidas del prompt
  post_workout_service.py
backend/app/core/config.py                     H1: sin admin defaults
backend/app/main.py                            H2: _get_real_client_ip() + CSP
backend/app/modules/identity/router.py         H3: reset_url con fragmento #
backend/app/modules/telemetry/schemas.py       M1: EventCreate sanitización
backend/app/modules/telemetry/router.py        M2: rate limit 30/min
```

### Commit de referencia

```
fix(security): red-team audit — HKDF key derivation, notes PII, rate limiter IP, CSP
```

---

## Próxima auditoría programada

- **Tipo:** Test de penetración externo
- **Fecha objetivo:** Q3 2026 (antes del lanzamiento GA con usuarios de pago)
- **Alcance sugerido:** Autenticación, endpoints de salud, OAuth flows, rate limits

---

## Checklist pre-auditoría externa

- [ ] ALLOWED_ORIGINS configurado (no wildcard)
- [ ] Named Tunnel Cloudflare activo (URL estable)
- [ ] admin_email y admin_initial_password en .env.pi
- [ ] Backup de HEALTH_LINK_MASTER_KEY documentado
- [ ] CORS cerrado a dominios específicos
- [ ] Sentry con alertas activas
- [ ] Logs con retención configurada (90 días max)
- [ ] Google OAuth id_token verification implementado
