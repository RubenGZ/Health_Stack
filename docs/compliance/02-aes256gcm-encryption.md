# AES-256-GCM — Especificación Técnica de Cifrado

**Versión:** 2.1 · **Fecha:** 2026-05-29 · **Estado:** Production

---

## Resumen ejecutivo

HealthStack Pro cifra todos los datos de salud del usuario usando AES-256-GCM
(Galois/Counter Mode), el estándar recomendado por NIST SP 800-38D para datos
sensibles. A partir de la versión 2.1, cada contexto de cifrado usa una subclave
derivada independiente vía HKDF, eliminando el riesgo de key reuse.

---

## Primitivas criptográficas

| Parámetro | Valor | Referencia normativa |
|-----------|-------|---------------------|
| Algoritmo | AES-256-GCM | NIST SP 800-38D |
| Longitud de clave | 256 bits (32 bytes) | NIST SP 800-57 |
| Nonce/IV | 96 bits (12 bytes), aleatorio | NIST SP 800-38D §5.2.1.1 |
| Auth tag | 128 bits (16 bytes) | NIST SP 800-38D §5.2.1.2 |
| KDF | HKDF-SHA256 (RFC 5869) | Para derivación de subclaves |
| AAD | Contexto semántico por propósito | Previene downgrade attacks |

---

## Arquitectura de claves (v2.1 — post HKDF fix)

```
HEALTH_LINK_MASTER_KEY (256 bits, en .env, nunca en BD)
         │
         ├─ HKDF(info=b"healthstack.health_link.v1")
         │        └─> SubKey_DataLinks (256 bits)
         │                 └─> Cifra health_uuid_enc en data_links
         │
         └─ HKDF(info=b"healthstack.health_notes.v1")
                  └─> SubKey_Notes (256 bits)
                           └─> Cifra notes_encrypted en health_records
```

**Antes de v2.1 (hasta 2026-05-28):** ambos contextos usaban la MASTER_KEY
directamente. Los datos cifrados con la clave anterior son incompatibles con
la subclave derivada. Ver `08-master-key-procedures.md` para el procedimiento
de re-cifrado si existen datos de producción previos.

---

## Formato de almacenamiento

```
"<nonce_hex>:<auth_tag_hex>:<ciphertext_hex>"

Ejemplo:
"a1b2c3d4e5f6a7b8c9d0e1f2:d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9:788990aabbcc..."
  ^-- 12 bytes (24 hex)  ^-- 16 bytes (32 hex)  ^-- n bytes
```

El separador `:` no puede aparecer en hexadecimal → parsing seguro sin regex.

---

## Contextos AAD (Additional Authenticated Data)

| Contexto | AAD | Protege contra |
|----------|-----|----------------|
| Vínculo identidad-salud | `b"healthstack.health_link.v1"` | Reutilización cross-tabla |
| Notas de salud | `b"healthstack.health_notes.v1"` | Downgrade attacks |

Si el AAD no coincide exactamente, GCM lanza `InvalidTag` → acceso denegado.
Esto impide que un ciphertext válido de una tabla se use en otra.

---

## Propiedades de seguridad

### Autenticidad (AEAD)
GCM genera un auth tag de 128 bits por cada cifrado. Cualquier modificación
del ciphertext, el nonce o el AAD hace que el decrypt falle con `InvalidTag`.
Esto detecta manipulación de datos en la BD — cumple RGPD Art. 32.

### Confidencialidad
AES-256 con clave de 256 bits: seguridad teórica de 128 bits contra ataques
cuánticos (Grover's algorithm). La vida útil de los datos de salud (décadas)
justifica AES-256 sobre AES-128.

### Unicidad de nonce
Cada operación de cifrado usa `os.urandom(12)` — 96 bits de entropía del CSPRNG
del kernel Linux. La probabilidad de colisión de nonce con una misma clave es
negligible para volúmenes normales de uso (cumple NIST SP 800-38D §8).

---

## Archivos de implementación

```
backend/app/core/security/cryptoservice.py   ← SubKey_DataLinks + CryptoService
backend/app/modules/health/service.py        ← SubKey_Notes + encrypt/decrypt notas
```

---

## Evidencias de tests

```
tests/unit/test_security.py          ← 9 tests: JWT, Argon2, tokens
tests/integration/test_health.py     ← 9 tests: encrypt/decrypt flow
```

---

## Historial de cambios de seguridad

| Fecha | Versión | Cambio |
|-------|---------|--------|
| 2026-05-29 | 2.1 | HKDF subkey derivation — elimina key reuse entre data_links y notes |
| 2026-05-17 | 2.0 | Fix `associated_data` (era `aad`, parámetro incorrecto) |
| 2026-04-01 | 1.0 | Implementación inicial AES-256-GCM |
