# Mapa de Secretos — HealthStack Pro

> Referencia completa de todos los secretos del proyecto.
> Este archivo SÍ está en git. Los archivos de claves reales en esta carpeta NO.
> Si pones aquí un `.env` o un `.pem`, git lo ignorará automáticamente.

---

## Estado actual

| Secret | Estado | Dónde vive |
|--------|--------|------------|
| `JWT_PRIVATE_KEY_PEM` | ✅ GitHub Actions | `backend/.env.production.local` |
| `JWT_PUBLIC_KEY_PEM` | ✅ GitHub Actions | `backend/.env.production.local` |
| `HEALTH_LINK_MASTER_KEY` | ✅ GitHub Actions | `backend/.env.production.local` |
| `DATABASE_URL` | ⚠️ Pendiente (placeholder) | `backend/.env.production.local` |
| `ALLOWED_ORIGINS` | ⚠️ Pendiente (placeholder) | `backend/.env.production.local` |
| `GROK_API_KEY` | ⚠️ Opcional (AI Coach/Insights) | `backend/.env.production.local` |
| `REDIS_PASSWORD` | ⚠️ Pendiente | `healthstack-pi-server/.env` (crear) |
| `SENTRY_DSN` | ⚠️ Opcional | `backend/.env.production.local` |
| `GOOGLE_CLIENT_ID/SECRET` | ⚠️ Opcional (OAuth Google) | `backend/.env.production.local` |
| AdSense IDs | ❌ Descartado (all-free) | — |

---

## Detalle por secreto

### JWT_PRIVATE_KEY_PEM / JWT_PUBLIC_KEY_PEM
**Qué es:** Par de claves RSA 2048 para firmar y verificar tokens JWT (RS256).

**Dónde se usa en el código:**
```
backend/app/core/security/jwt_handler.py
  → sign_jwt()    usa JWT_PRIVATE_KEY_PEM
  → decode_jwt()  usa JWT_PUBLIC_KEY_PEM
```

**Dónde está almacenado:**
- Local Pi:   `backend/.env.production.local` (líneas JWT_PRIVATE_KEY_PEM / JWT_PUBLIC_KEY_PEM)
- CI/CD:      GitHub Actions Secrets → Settings → Secrets → Actions
- Esta carpeta: puedes guardar aquí una copia de `jwt_private.pem` y `jwt_public.pem`

**⚠️ NUNCA rotar sin actualizar los dos sitios a la vez.** Un token firmado con la clave
antigua será inválido con la nueva clave pública.

---

### HEALTH_LINK_MASTER_KEY
**Qué es:** Clave AES-256-GCM de 32 bytes (hex) para cifrar los health_uuid de los usuarios.
Cumplimiento RGPD Art. 32 — los datos de salud nunca se guardan con user_id directo.

**Dónde se usa en el código:**
```
backend/app/core/security/cryptoservice.py
  → encrypt_health_uuid()   cifra user_id → health_subject_id
  → decrypt_health_uuid()   descifra al leer registros de salud

backend/app/modules/health/service.py
  → usa health_subject_id para todos los queries de salud

backend/app/modules/identity/models.py
  → campo health_uuid_enc (el UUID cifrado almacenado en BD)
```

**⚠️ CRÍTICO: NO cambiar esta clave nunca** una vez que hay datos en producción.
Si se cambia, todos los `health_uuid_enc` de la BD quedan irrecuperables.
Procedimiento de rotación (si fuera necesario): re-cifrar cada fila antes de cambiar la clave.

**Dónde está almacenado:**
- Local Pi:   `backend/.env.production.local` → HEALTH_LINK_MASTER_KEY
- CI/CD:      GitHub Actions Secrets
- Esta carpeta: puedes guardar aquí una copia en `master_key.txt`

---

### DATABASE_URL
**Qué es:** Conexión a PostgreSQL. Tiene dos variantes — async (asyncpg) y sync (alembic).

**Dónde se usa en el código:**
```
backend/app/session.py
  → create_async_engine(DATABASE_URL)   ← para toda la app

backend/alembic/env.py
  → DATABASE_SYNC_URL                   ← solo para migraciones
```

**Valor actual (placeholder — cambiar):**
```
DATABASE_URL=postgresql+asyncpg://postgres:CAMBIAR_PASSWORD@postgres:5432/healthstack
DATABASE_SYNC_URL=postgresql://postgres:CAMBIAR_PASSWORD@postgres:5432/healthstack
```

La password real del Postgres de la Pi está en `healthstack-pi-server/.env` → `POSTGRES_PASSWORD`.

---

### ALLOWED_ORIGINS
**Qué es:** Lista de dominios permitidos en CORS. Si no está configurado, la SPA no puede
llamar a la API desde el navegador.

**Dónde se usa en el código:**
```
backend/app/main.py
  → CORSMiddleware(allow_origins=settings.ALLOWED_ORIGINS.split(","))
  → startup check: si está en producción y ALLOWED_ORIGINS es el placeholder, levanta error
```

**Valor a poner:** La URL de tu Cloudflare Tunnel o dominio real.
Ejemplo: `https://healthstack.pro,https://www.healthstack.pro`

---

### GROK_API_KEY
**Qué es:** API key de Groq (proveedor de LLM). Prefijo `gsk_...`.
Modelo usado: `llama-3.3-70b-versatile`.

**Dónde se usa en el código:**
```
backend/app/modules/ai_coach/service.py    → chat con el coach
backend/app/modules/ai_insights/service.py → narrativa, riesgo lesión, metas semanales
backend/app/core/ai/router.py              → AIRouter — fallback graceful si key=None
```

Si no está configurada, los endpoints devuelven respuestas de fallback sin error 500.

---

### REDIS_PASSWORD
**Qué es:** Contraseña del contenedor Redis en la Pi. Sin ella, el healthcheck falla
y Redis queda "unhealthy" (la app sigue funcionando con rate limiting in-memory).

**Dónde se usa en el código:**
```
healthstack-pi-server/docker-compose.pi.yml
  → redis: command: --requirepass ${REDIS_PASSWORD}
  → backend: REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/0

backend/app/core/config.py
  → settings.REDIS_URL → slowapi storage_uri (si está disponible)
```

**Para activarlo:** Crear `healthstack-pi-server/.env` con:
```
REDIS_PASSWORD=elige_una_password_segura
```
Luego `bash ~/healthstack-pi-server/scripts/update.sh` en la Pi.

---

### SENTRY_DSN (opcional)
**Qué es:** URL de Sentry para captura de errores en producción.

**Dónde se usa en el código:**
```
backend/app/main.py
  → sentry_sdk.init(dsn=settings.SENTRY_DSN)
  → Filtro PII activo: scrub_sensitive_data() elimina emails/UUIDs de los eventos
```

Si está vacío, Sentry no inicializa (no hay error).

---

### GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (opcional)
**Qué es:** Credenciales OAuth2 de Google para login social.

**Dónde se usa en el código:**
```
backend/app/modules/integrations/service.py
  → OAuth2 flow: authorization_url() + callback()
  → CSRF protegido con HMAC (corregido 2026-05-17)
```

Si no están configurados, el botón "Login con Google" no aparece en la SPA.

---

## Cómo subir secrets a GitHub Actions (para el CI/CD)

```powershell
# Desde C:\Users\Ruben\Desktop\Health Stack
gh auth login
powershell -ExecutionPolicy Bypass -File scripts\upload-secrets-to-github.ps1
```

El script sube automáticamente JWT_PRIVATE_KEY_PEM, JWT_PUBLIC_KEY_PEM y HEALTH_LINK_MASTER_KEY
desde `backend/.env.production.local`.

Para subir el resto manualmente:
```powershell
gh secret set NOMBRE_SECRET --repo RubenGZ/Health_Stack
# te pedirá el valor de forma segura (no queda en el historial)
```

---

## Archivos locales que puedes guardar en esta carpeta

Git los ignorará todos automáticamente:

| Archivo sugerido | Contenido |
|-----------------|-----------|
| `env.production.local` | Copia de `backend/.env.production.local` |
| `jwt_private.pem` | Clave privada RSA extraída del .env |
| `jwt_public.pem` | Clave pública RSA extraída del .env |
| `master_key.txt` | Valor de HEALTH_LINK_MASTER_KEY |
| `pi_env.txt` | Variables del Pi (postgres pw, redis pw) |
