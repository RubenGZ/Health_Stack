# Gestión de HEALTH_LINK_MASTER_KEY

**CRÍTICO: Esta clave protege todos los datos biométricos. Su pérdida o compromiso
es una brecha de seguridad de máxima severidad.**

---

## Qué protege

La `HEALTH_LINK_MASTER_KEY` es la raíz de la que se derivan dos subclaves:

1. **SubKey_DataLinks** (HKDF info=`healthstack.health_link.v1`)
   → Cifra `data_links.health_uuid_enc` — el vínculo identidad↔salud
   
2. **SubKey_Notes** (HKDF info=`healthstack.health_notes.v1`)
   → Cifra `health_records.notes_encrypted` — notas de salud libres

Si esta clave se pierde: los datos biométricos quedan inaccesibles permanentemente.
Si esta clave se compromete: hay que rotarla + notificar AEPD.

---

## Generación de una clave nueva

```bash
# En cualquier máquina con Python 3.10+
python -c "import secrets; print(secrets.token_hex(32))"
# Output: 64 chars hex = 256 bits
# Ejemplo: a3f8e2b1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1
```

**Requisitos:**
- Exactamente 64 caracteres hexadecimales (32 bytes = 256 bits)
- Generada con CSPRNG del sistema (Python `secrets` lo garantiza)
- NUNCA compartirla por email, Slack, WhatsApp o cualquier canal digital
- NUNCA commitear al repositorio Git

---

## Almacenamiento actual

| Copia | Ubicación | Acceso | Estado |
|-------|-----------|--------|--------|
| Principal | `~/.env.pi` en la Raspberry Pi | Solo Ruben (SSH) | ✅ Activo |
| Backup | ??? | ??? | ⚠️ **Pendiente de documentar** |

**ACCIÓN URGENTE:** Guardar una copia offline encriptada (KeePass, 1Password,
papel en lugar físico seguro). Sin backup, la pérdida del Pi = pérdida de todos
los datos de salud de los usuarios.

---

## Rotación de la clave (si está comprometida)

**ADVERTENCIA: Rotar la clave sin re-cifrar primero = todos los datos quedan inaccesibles.**

### Paso 1: Re-cifrar data_links con la nueva clave

```python
# scripts/reencrypt_data_links.py
# Ejecutar ANTES de actualizar .env con la nueva clave

import asyncio
import os
from app.core.security.cryptoservice import CryptoService

OLD_KEY = "la_clave_anterior_en_hex"
NEW_KEY = "la_nueva_clave_en_hex"

async def reencrypt():
    old_crypto = CryptoService(master_key_hex=OLD_KEY)
    new_crypto = CryptoService(master_key_hex=NEW_KEY)
    
    # Para cada fila en data_links:
    # 1. Descifrar con old_crypto
    # 2. Cifrar con new_crypto
    # 3. UPDATE data_links SET health_uuid_enc = nuevo_ciphertext WHERE user_id = x
    # 4. Verificar que el re-cifrado fue correcto
    pass  # TODO: implementar

asyncio.run(reencrypt())
```

### Paso 2: Re-cifrar health_records.notes_encrypted

Similar al paso anterior pero para las notas de salud.
(Nota: los registros sin notas no requieren re-cifrado.)

### Paso 3: Actualizar .env

```bash
# En la Pi
nano ~/.env.pi
# Cambiar HEALTH_LINK_MASTER_KEY=nueva_clave
docker compose -f docker-compose.pi.yml --env-file .env.pi up -d --build backend
```

### Paso 4: Verificar

```bash
# Comprobar que un usuario puede acceder a sus datos biométricos
curl -H "Authorization: Bearer <token>" https://URL/api/v1/health/records
```

---

## Variables de entorno relacionadas

```bash
# .env.pi (NUNCA commitear)
HEALTH_LINK_MASTER_KEY=64_chars_hex_aqui
JWT_PRIVATE_KEY_PEM="-----BEGIN RSA PRIVATE KEY-----\n..."
JWT_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\n..."
```

**JWT keys:** independientes de la MASTER_KEY. Rotar las JWT keys no afecta
a los datos cifrados — solo invalida los tokens de sesión activos.

---

## Señales de compromiso de la clave

- `InvalidTag` errors frecuentes en Sentry (manipulación de data_links)
- Acceso SSH no autorizado a la Pi
- .env.pi visible en repositorio Git o log de commits
- Tercero con acceso al servidor reporta haber visto la clave
