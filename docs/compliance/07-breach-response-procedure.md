# Procedimiento de Respuesta a Brechas de Datos

**Art. 33 RGPD:** Notificación a la AEPD en 72 horas desde conocimiento.
**Art. 34 RGPD:** Comunicación a los interesados si el riesgo es alto.

---

## Clasificación de brechas por severidad

### CRÍTICO — Notificación AEPD obligatoria (72h)
- Acceso no autorizado a `health_records` (datos biométricos)
- Robo de `HEALTH_LINK_MASTER_KEY`
- Exfiltración masiva de `users` (emails + hashes)
- Acceso no autorizado a `data_links` + MASTER_KEY (rompe pseudonimización)
- Filtración de `notes_encrypted` + MASTER_KEY

### ALTO — Evaluar notificación a usuarios
- Acceso a `users` sin `data_links` (emails expuestos, pero no biometría)
- Compromiso de tokens JWT activos (revocar todos los refresh tokens)
- Acceso a logs con PII no filtrada

### MEDIO — Investigar y documentar
- Intento de acceso fallido a endpoints admin
- Rate limit bypass sospechoso
- Error de integridad en `InvalidTag` (puede indicar manipulación de BD)

### BAJO — Registrar
- Fallo en autenticación repetido (puede ser usuario olvidó contraseña)
- Error de configuración en variables de entorno no críticas

---

## Protocolo de actuación (primeras 72 horas)

### Hora 0-2: Contención

```bash
# 1. Revocar todos los refresh tokens activos
docker exec healthstack_backend python -c "
from app.modules.identity.repository import RefreshTokenRepository
import asyncio
from app.session import get_db

async def revoke_all():
    async for db in get_db():
        await db.execute('UPDATE public.refresh_tokens SET revoked_at = NOW() WHERE revoked_at IS NULL')
        await db.commit()
asyncio.run(revoke_all())
"

# 2. Cambiar HEALTH_LINK_MASTER_KEY si fue comprometida
# CRÍTICO: requiere re-cifrado de todos los data_links antes de reiniciar
# Ver 08-master-key-procedures.md

# 3. Si la BD fue comprometida: cambiar DATABASE_URL password
# docker exec healthstack_postgres psql -U postgres -c "ALTER USER postgres PASSWORD 'nueva_password_segura';"

# 4. Rotar JWT keys (invalida todos los tokens activos)
# Regenerar jwt_private_key_pem y jwt_public_key_pem en .env.pi
```

### Hora 2-24: Evaluación

1. **Alcance:** ¿Qué tablas fueron accedidas? ¿Con qué privilegios?
2. **Tiempo de exposición:** ¿Desde cuándo había acceso no autorizado?
3. **Usuarios afectados:** Número exacto, tipo de datos expuestos.
4. **Vector de entrada:** CVE exploitada, credencial comprometida, etc.
5. **Evidencias:** Logs de nginx, logs de PostgreSQL, logs de Sentry.

### Hora 24-72: Notificación AEPD

**Formulario:** https://sedeagpd.gob.es/sede-electronica-web/

**Contenido mínimo requerido (Art. 33.3 RGPD):**
- Naturaleza de la brecha (acceso, pérdida, destrucción)
- Categorías y número aproximado de interesados afectados
- Categorías y número de registros afectados
- Datos de contacto del DPO o responsable
- Consecuencias probables de la brecha
- Medidas adoptadas o propuestas

### Si el riesgo es ALTO — Notificar a usuarios (Art. 34)

Criterio: si la brecha expone datos de salud (Art. 9) sin pseudonimización efectiva.

**Plantilla de email a usuarios:**

```
Asunto: Aviso de seguridad importante — HealthStack Pro

Estimado usuario,

Le informamos de un incidente de seguridad que puede haber afectado a sus datos.

¿Qué ocurrió?
[Descripción concreta sin términos técnicos]

¿Qué datos pueden estar afectados?
[Lista específica]

¿Qué hemos hecho?
[Medidas tomadas]

¿Qué debe hacer usted?
[Acciones concretas: cambiar contraseña, etc.]

Para cualquier pregunta: privacy@healthstack.pro

HealthStack Pro
```

---

## Registro de incidentes

| Fecha | Severidad | Descripción | Afectados | Notificado AEPD | Resuelto |
|-------|-----------|-------------|-----------|-----------------|----------|
| — | — | Sin incidentes registrados | — | — | — |

---

## Contactos de emergencia

- **Responsable técnico:** Ruben (crear email de emergencia)
- **AEPD:** https://www.aepd.es · Teléfono: 901 100 099
- **Registro de Brechas AEPD:** https://sedeagpd.gob.es

*Mantener este documento actualizado con cada cambio de personal o infraestructura.*
