"""
app/core/security/crypto.py
============================
CryptoService — Motor de Seudonimización (AEPD / Art. 25 RGPD)
===============================================================

PROPÓSITO LEGAL
---------------
El Art. 25 RGPD (Privacy by Design) exige que los datos de salud (categoría
especial según Art. 9) se traten con medidas técnicas que minimicen el riesgo
por defecto. La seudonimización es la medida recomendada por la AEPD.

CÓMO FUNCIONA LA "LLAVE DE CRUCE"
----------------------------------
Problema: necesitamos vincular user_id (tabla identidad) con health_subject_id
(tabla biometría), pero esa vinculación NO puede almacenarse en texto plano.

Solución:
    ┌─────────────┐      ┌──────────────────┐      ┌────────────────────┐
    │ users.id    │ ───▶ │ data_links       │ ───▶ │ health_records     │
    │ (UUID real) │      │ health_uuid_enc  │      │ health_subject_id  │
    │             │      │ (AES-256-GCM)   │      │ (UUID opaco)       │
    └─────────────┘      └──────────────────┘      └────────────────────┘
         Identidad              Puente cifrado              Biometría

    Si un atacante extrae la tabla health_records, ve UUIDs sin contexto.
    Si extrae data_links, ve ciphertext sin la MASTER_KEY (entorno).
    Solo el CryptoService (con MASTER_KEY en RAM) puede resolver el vínculo.

PRIMITIVAS CRIPTOGRÁFICAS
--------------------------
- Algoritmo: AES-256-GCM (Galois/Counter Mode)
  * AES-256: clave de 256 bits → seguridad de 128 bits cuántica
  * GCM: modo autenticado → detecta manipulación del ciphertext (AEAD)
  * NIST SP 800-38D define GCM como modo estándar para datos sensibles

- Nonce/IV: 96 bits (12 bytes) aleatorios, único por operación de cifrado
  * NIST recomienda 96 bits para GCM por eficiencia y seguridad
  * NUNCA reutilizar el mismo IV con la misma clave → rompería la seguridad

- AAD (Additional Authenticated Data): b"healthstack.health_link.v1"
  * Vincula el ciphertext a su contexto semántico
  * Evita que un ciphertext válido de otra tabla sea reutilizado aquí
  * No es secreto, pero sí obligatorio para que el decrypt tenga éxito

- Auth Tag: 128 bits (16 bytes) — GCM lo genera automáticamente
  * Verifica integridad Y autenticidad del ciphertext en una sola operación

FORMATO DE ALMACENAMIENTO
--------------------------
    "<iv_hex>:<auth_tag_hex>:<ciphertext_hex>"
    Ejemplo: "a1b2c3...12bytes:d4e5f6...16bytes:788990...nbytes"
    Almacenado como TEXT en PostgreSQL (o BYTEA en producción).
"""

from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass
from typing import TYPE_CHECKING

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.shared.exceptions import (
    DecryptionIntegrityError,
    HealthLinkNotFoundError,
    MasterKeyNotConfiguredError,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

# Logger del módulo — los mensajes de error NUNCA incluyen
# el ciphertext ni el plaintext para evitar fuga en logs
logger = logging.getLogger(__name__)


# ── CONSTANTES ────────────────────────────────────────────────────────────────

# Contexto AAD: identifica unívocamente el propósito de este cifrado.
# Si cambia el sistema, cambiar la versión ("v2") fuerza re-cifrado de todos
# los registros → previene downgrade attacks.
_AAD_CONTEXT: bytes = b"healthstack.health_link.v1"

# Longitud del nonce GCM en bytes (96 bits — recomendado NIST SP 800-38D)
_GCM_NONCE_SIZE: int = 12

# Longitud del auth tag GCM en bytes (128 bits — máxima seguridad)
_GCM_TAG_SIZE: int = 16

# Longitud de la clave AES-256 en bytes (32 bytes = 256 bits)
_AES_KEY_SIZE: int = 32


# ── DTO INTERNO ────────────────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class EncryptedPayload:
    """
    Representación estructurada de un payload cifrado.
    frozen=True → inmutable después de creación (no se puede modificar accidentalmente).
    slots=True → más eficiente en memoria (no usa __dict__).
    """

    nonce: bytes       # 12 bytes — IV único para esta operación
    auth_tag: bytes    # 16 bytes — tag de autenticación GCM
    ciphertext: bytes  # n bytes — datos cifrados

    def serialize(self) -> str:
        """
        Serializa a string hex para almacenar en la BD.
        Formato: "<nonce_hex>:<auth_tag_hex>:<ciphertext_hex>"

        Elegimos hex sobre base64 por legibilidad en inspecciones forenses.
        El separador ':' no puede aparecer en hex válido → parsing seguro.
        """
        return ":".join([
            self.nonce.hex(),
            self.auth_tag.hex(),
            self.ciphertext.hex(),
        ])

    @classmethod
    def deserialize(cls, payload_str: str) -> "EncryptedPayload":
        """
        Deserializa desde la BD.
        Valida el número de componentes antes de hacer fromhex()
        para evitar ValueError en datos corruptos.
        """
        parts = payload_str.split(":")

        # Validar estructura antes de convertir — fallo explícito y temprano
        if len(parts) != 3:
            raise ValueError(
                f"Formato de payload inválido: se esperan 3 componentes "
                f"separados por ':', se encontraron {len(parts)}. "
                f"¿El campo fue modificado fuera del CryptoService?"
            )

        try:
            nonce, auth_tag, ciphertext = (bytes.fromhex(p) for p in parts)
        except ValueError as exc:
            raise ValueError(
                "Los componentes del payload no son hexadecimales válidos. "
                "Posible corrupción de datos."
            ) from exc

        # Validar longitudes — detecta corrupción parcial
        if len(nonce) != _GCM_NONCE_SIZE:
            raise ValueError(
                f"Nonce inválido: {len(nonce)} bytes (esperado: {_GCM_NONCE_SIZE})"
            )
        if len(auth_tag) != _GCM_TAG_SIZE:
            raise ValueError(
                f"Auth tag inválido: {len(auth_tag)} bytes (esperado: {_GCM_TAG_SIZE})"
            )

        return cls(nonce=nonce, auth_tag=auth_tag, ciphertext=ciphertext)


# ── SERVICIO PRINCIPAL ────────────────────────────────────────────────────────

class CryptoService:
    """
    Servicio de seudonimización para la llave de cruce user ↔ health_subject.

    PRINCIPIO DE DISEÑO: Este servicio es el ÚNICO punto del sistema que
    puede resolver la relación entre identidad y datos de salud.
    Ningún repositorio, router ni modelo accede a esta lógica directamente.

    CICLO DE VIDA:
        1. Se instancia una vez al arrancar la aplicación (singleton).
        2. Se inyecta vía FastAPI Depends() en los servicios que lo necesitan.
        3. La MASTER_KEY se carga en __init__ y permanece en RAM.
           No se vuelve a leer del entorno durante la ejecución.
    """

    # Contexto AAD expuesto como atributo de clase para usarlo en tests
    AAD_CONTEXT: bytes = _AAD_CONTEXT

    def __init__(self, master_key_hex: str | None = None) -> None:
        """
        Inicializa el servicio cargando y validando la clave maestra.

        Args:
            master_key_hex: Clave hex de 64 chars. Si None, lee de la variable
                            de entorno HEALTH_LINK_MASTER_KEY.

        Raises:
            MasterKeyNotConfiguredError: Si la variable no existe o tiene
                                         longitud incorrecta. Fallo fatal.
        """
        raw_key = master_key_hex or os.environ.get("HEALTH_LINK_MASTER_KEY", "")

        if not raw_key:
            raise MasterKeyNotConfiguredError(
                "HEALTH_LINK_MASTER_KEY no está configurada. "
                "La aplicación no puede operar sin ella — los datos de salud "
                "no pueden cifrarse ni descifrarse."
            )

        try:
            key_bytes = bytes.fromhex(raw_key)
        except ValueError as exc:
            raise MasterKeyNotConfiguredError(
                "HEALTH_LINK_MASTER_KEY no es un string hexadecimal válido."
            ) from exc

        # Validación de longitud — AES-256 requiere exactamente 32 bytes
        # Esta comprobación es la línea de defensa contra configuraciones débiles
        if len(key_bytes) != _AES_KEY_SIZE:
            raise MasterKeyNotConfiguredError(
                f"HEALTH_LINK_MASTER_KEY debe tener {_AES_KEY_SIZE} bytes "
                f"({_AES_KEY_SIZE * 2} chars hex) para AES-256. "
                f"Longitud actual: {len(key_bytes)} bytes. "
                f"Genera una clave válida con: "
                f"python -c \"import secrets; print(secrets.token_hex(32))\""
            )

        # Instanciar AESGCM con los bytes de la clave
        # El objeto AESGCM de cryptography es thread-safe → puede compartirse
        self._aesgcm = AESGCM(key_bytes)

        # Eliminar la referencia al string hex inmediatamente después de usarlo
        # Reduce el tiempo que el secreto vive en memoria como string Python
        del key_bytes

        logger.info(
            "CryptoService inicializado correctamente. "
            "AES-256-GCM listo para operaciones de seudonimización."
        )

    # ── API PÚBLICA ───────────────────────────────────────────────────────────

    @staticmethod
    def generate_health_subject_id() -> str:
        """
        Genera un UUID v4 completamente aleatorio como identificador del sujeto
        de salud. Este UUID NO tiene relación con el user.id.

        Por qué UUID v4 y no un hash del user_id:
        - Un hash del user_id sería determinístico → si alguien obtiene ambas
          tablas y conoce el algoritmo de hash, puede correlacionar registros.
        - UUID v4 aleatorio es no determinístico → la correlación solo es posible
          con la MASTER_KEY, que está en el entorno, no en la BD.
        """
        return str(uuid.uuid4())

    def encrypt_health_link(self, health_subject_id: str) -> str:
        """
        Cifra el health_subject_id para almacenar en data_links.health_uuid_enc.

        Args:
            health_subject_id: UUID string del sujeto de salud (plaintext).

        Returns:
            Payload cifrado serializado como "<nonce_hex>:<tag_hex>:<ct_hex>".

        Proceso:
            1. Generar nonce de 96 bits (único para esta operación)
            2. Cifrar con AES-256-GCM usando nonce + AAD
            3. GCM devuelve ciphertext + auth_tag concatenados (los últimos 16 bytes son el tag)
            4. Separar ciphertext y tag para almacenamiento estructurado
            5. Serializar a string hex

        Seguridad:
            - Cada llamada genera un nonce diferente → mismo plaintext → ciphertexts distintos
            - AAD vincula el ciphertext a este contexto específico
            - El auth_tag detecta cualquier modificación posterior
        """
        # 1. Nonce criptográficamente aleatorio — NUNCA reusar con la misma clave
        #    os.urandom() usa /dev/urandom en Linux → CSPRNG del kernel
        nonce = os.urandom(_GCM_NONCE_SIZE)

        plaintext = health_subject_id.encode("utf-8")  # UUID → bytes UTF-8

        # 2. Cifrar con AES-GCM
        #    La biblioteca cryptography concatena ciphertext + auth_tag en la salida
        #    Eso es estándar en AEAD: los últimos TAG_SIZE bytes son el tag de autenticación
        ciphertext_with_tag = self._aesgcm.encrypt(
            nonce=nonce,
            data=plaintext,
            associated_data=_AAD_CONTEXT,  # AAD protege la integridad del contexto
        )

        # 3. Separar: ciphertext = todo excepto últimos 16 bytes; tag = últimos 16 bytes
        ciphertext = ciphertext_with_tag[:-_GCM_TAG_SIZE]
        auth_tag   = ciphertext_with_tag[-_GCM_TAG_SIZE:]

        # 4. Empaquetar y serializar
        payload = EncryptedPayload(
            nonce=nonce,
            auth_tag=auth_tag,
            ciphertext=ciphertext,
        )

        return payload.serialize()

    def decrypt_health_link(self, encrypted_payload_str: str) -> str:
        """
        Descifra y devuelve el health_subject_id original.

        Args:
            encrypted_payload_str: Payload serializado de la BD.

        Returns:
            health_subject_id como UUID string.

        Raises:
            DecryptionIntegrityError: Si el auth_tag no coincide → datos manipulados.
                                       HTTP 403 en el router (no 500).
            ValueError: Si el formato del payload es inválido.

        Seguridad:
            - cryptography.exceptions.InvalidTag indica manipulación o clave incorrecta
            - NO revelar al cliente si fue manipulación o clave incorrecta
              (eso daría información sobre el sistema de cifrado)
            - El log de error NO incluye el payload (evita fuga de datos cifrados en logs)
        """
        try:
            payload = EncryptedPayload.deserialize(encrypted_payload_str)
        except ValueError as exc:
            # Error de formato — puede indicar corrupción de BD o bug de programación
            logger.error(
                "CryptoService.decrypt_health_link: payload malformado. "
                "Verificar integridad de la columna data_links.health_uuid_enc."
            )
            raise DecryptionIntegrityError(
                "El payload cifrado está malformado. "
                "Esto puede indicar corrupción de datos."
            ) from exc

        try:
            # GCM verifica el auth_tag ANTES de devolver el plaintext
            # Si la verificación falla → InvalidTag (no se devuelve ningún dato)
            # Esto es la propiedad AEAD: Authenticated Encryption with Associated Data
            plaintext_bytes = self._aesgcm.decrypt(
                nonce=payload.nonce,
                data=payload.ciphertext + payload.auth_tag,  # Reconstituir formato GCM
                associated_data=_AAD_CONTEXT,  # Debe coincidir exactamente con el usado en encrypt
            )
        except InvalidTag:
            # InvalidTag → el ciphertext, nonce o AAD fueron modificados después del cifrado
            # NUNCA loguear el payload aquí — podría contener datos sensibles parciales
            logger.error(
                "CryptoService.decrypt_health_link: InvalidTag detectado. "
                "Posible manipulación de datos en data_links.health_uuid_enc. "
                "ACCIÓN REQUERIDA: revisar logs de acceso a la tabla data_links."
            )
            # Relevancia AEPD: Art. 32 obliga a detectar y notificar brechas de integridad.
            # Esta excepción debe disparar una alerta en Sentry.
            raise DecryptionIntegrityError(
                "No se pudo verificar la integridad del enlace de salud. "
                "El registro puede haber sido modificado. "
                "Contacte al administrador del sistema."
            )

        return plaintext_bytes.decode("utf-8")

    async def resolve_health_subject_id(
        self,
        user_id: str,
        db: "AsyncSession",
    ) -> str:
        """
        API de alto nivel: dado un user_id, devuelve el health_subject_id.
        Este es el método que usan los servicios de dominio (nunca los routers).

        Flujo completo:
            user_id → data_links.health_uuid_enc → decrypt → health_subject_id

        Args:
            user_id: UUID del usuario autenticado.
            db: Sesión de BD inyectada por FastAPI Depends.

        Returns:
            health_subject_id como string UUID.

        Raises:
            HealthLinkNotFoundError: El usuario no tiene llave de cruce.
                                      Ocurre si el registro se interrumpió.
            DecryptionIntegrityError: El payload fue manipulado.
        """
        # Importación local para evitar circular imports entre módulos
        from app.modules.identity.repository import DataLinkRepository

        link = await DataLinkRepository.get_by_user_id(db, user_id)

        if link is None:
            logger.warning(
                "CryptoService.resolve_health_subject_id: "
                f"No existe DataLink para user_id={user_id[:8]}... "
                "¿El registro se interrumpió antes de crear la llave de cruce?"
            )
            raise HealthLinkNotFoundError(
                f"El usuario no tiene una llave de cruce registrada. "
                f"El registro puede estar incompleto."
            )

        return self.decrypt_health_link(link.health_uuid_enc)

    async def create_health_link_for_user(
        self,
        user_id: str,
        db: "AsyncSession",
    ) -> str:
        """
        Crea la llave de cruce durante el registro del usuario.

        Pasos:
            1. Generar health_subject_id (UUID aleatorio, no relacionado con user_id)
            2. Cifrar health_subject_id con AES-256-GCM
            3. Persistir en data_links: {user_id, health_uuid_enc}
            4. Devolver health_subject_id para crear el HealthRecord inicial

        Este método se llama UNA SOLA VEZ por usuario, en el flujo de registro.
        Un segundo llamado lanzará IntegrityError de PostgreSQL (UNIQUE en user_id).

        Returns:
            health_subject_id: el UUID opaco del sujeto de salud.
        """
        from app.modules.identity.repository import DataLinkRepository

        # 1. UUID completamente aleatorio — no derivado del user_id
        health_subject_id = self.generate_health_subject_id()

        # 2. Cifrar para almacenar en la BD
        encrypted_payload = self.encrypt_health_link(health_subject_id)

        # 3. Persistir el vínculo cifrado
        await DataLinkRepository.create(
            db=db,
            user_id=user_id,
            health_uuid_enc=encrypted_payload,
        )

        logger.info(
            f"CryptoService: health_link creado para user_id={user_id[:8]}... "
            f"health_subject_id={health_subject_id[:8]}..."
        )

        # 4. Devolver el UUID en claro — solo en este momento del registro
        return health_subject_id


# ── SINGLETON ─────────────────────────────────────────────────────────────────

def get_crypto_service() -> CryptoService:
    """
    Dependencia de FastAPI para inyectar el CryptoService.

    La instancia se crea una vez y se reutiliza (singleton funcional con FastAPI).
    Si HEALTH_LINK_MASTER_KEY no está configurada, la aplicación falla al arrancar.

    Uso en routers/servicios:
        async def endpoint(crypto: CryptoService = Depends(get_crypto_service)):
            ...
    """
    # Importar aquí para que el fallo sea en el primer request, no en import time
    # (permite tests unitarios sin la variable de entorno)
    return CryptoService()
