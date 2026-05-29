# Pseudonimización AEPD — Arquitectura DataLink

**Versión:** 1.2 · **Fecha:** 2026-05-29 · **Estado:** Production

---

## Base legal y normativa

- **RGPD Art. 9:** Los datos de salud son categoría especial — requieren medidas adicionales.
- **RGPD Art. 25:** Privacy by Design — la arquitectura incorpora protección desde el diseño.
- **Guía AEPD "Orientaciones para tratamientos de datos de salud":**
  La pseudonimización mediante separación de tablas con vínculo cifrado es la
  medida técnica recomendada para datos biométricos.

---

## Arquitectura de tres tablas

```
┌──────────────────────┐     ┌─────────────────────────┐     ┌──────────────────────┐
│  public.users        │     │  public.data_links       │     │  health.health_records│
│  ─────────────────── │     │  ──────────────────────  │     │  ──────────────────── │
│  id: UUID (real)     │────▶│  user_id: UUID (FK)      │     │  id: UUID             │
│  email: str          │     │  health_uuid_enc: TEXT   │────▶│  health_subject_id:   │
│  display_name: str   │     │    (AES-256-GCM cipher)  │     │    UUID (opaco)        │
│  password_hash: str  │     └─────────────────────────┘     │  weight_kg: Decimal   │
│  ...                 │                                       │  notes_encrypted: str │
└──────────────────────┘                                       │  ...                  │
       Identidad              Puente cifrado (AEPD)                  Biometría
```

### Propiedades de separación

| Escenario de ataque | Qué obtiene el atacante | Consecuencia |
|--------------------|------------------------|--------------|
| Solo `health_records` | UUIDs sin contexto | No puede relacionar con personas |
| Solo `data_links` | Ciphertext AES-GCM | No puede descifrar sin MASTER_KEY |
| Solo `users` | Email, nombre, hash | No accede a datos biométricos |
| `data_links` + MASTER_KEY | Puede resolver el vínculo | Brecha total — requiere acceso al servidor |

---

## Flujo de registro (creación del DataLink)

```
1. Usuario registra email + contraseña
2. CryptoService.generate_health_subject_id()
   → genera UUID v4 aleatorio (NO derivado del user_id)
3. CryptoService.encrypt_health_link(health_subject_id)
   → nonce = os.urandom(12)
   → ct = AESGCM(SubKey_DataLinks).encrypt(nonce, subject_id, AAD)
   → almacena "<nonce>:<tag>:<ct>" en data_links.health_uuid_enc
4. health_subject_id devuelto solo en este momento (nunca más en claro)
5. Se crea HealthRecord baseline con ese health_subject_id
```

**Garantía:** El `health_subject_id` no se almacena en ningún lugar en texto plano.
Solo existe en RAM durante el flujo de registro y durante las consultas autenticadas.

---

## Flujo de consulta (resolución del DataLink)

```
GET /api/v1/health/records  [Bearer token]
       │
       ▼
1. decode_token(bearer) → user_id
2. DataLinkRepository.get_by_user_id(db, user_id) → data_links row
3. CryptoService.decrypt_health_link(health_uuid_enc)
   → valida auth_tag (InvalidTag si manipulado)
   → devuelve health_subject_id en RAM (no se loguea)
4. HealthRepository.list_by_subject(db, health_subject_id)
   → SELECT * FROM health_records WHERE health_subject_id = $1
5. Para cada registro: descifrar notes_encrypted con SubKey_Notes
6. Respuesta: datos biométricos del usuario
```

El `health_subject_id` nunca aparece en respuestas HTTP ni en logs.

---

## Propiedades del health_subject_id

- **UUID v4 completamente aleatorio** — no derivado del user_id ni del email.
- **No determinístico** — no puede regenerarse a partir de ningún dato público.
- **Único** — UNIQUE constraint en `health_records.health_subject_id`.
- **Opaco** — por sí solo no revela nada sobre el titular de los datos.

### Por qué UUID v4 y no un hash del user_id

Un hash del `user_id` sería determinístico: si un atacante tiene las dos tablas
y conoce el algoritmo, puede computar `hash(user_id)` para cada usuario y
correlacionar directamente. UUID v4 aleatorio rompe esta correlación — solo el
`CryptoService` con la MASTER_KEY puede resolver el vínculo.

---

## Derecho al olvido (Art. 17 RGPD)

`DELETE /api/v1/health/records/{id}` elimina el HealthRecord.
Si el usuario borra su cuenta, se elimina `data_links` → los `health_records`
quedan como UUIDs huérfanos sin posibilidad de re-vinculación.

**Pendiente:** implementar endpoint `DELETE /auth/account` que elimine en cascada
users → data_links → health_records.

---

## Archivos de implementación

```
backend/app/core/security/cryptoservice.py     ← CryptoService, encrypt/decrypt
backend/app/modules/identity/models.py         ← DataLink ORM model
backend/app/modules/identity/repository.py     ← DataLinkRepository
backend/app/modules/health/service.py          ← Resolución en cada request
```
