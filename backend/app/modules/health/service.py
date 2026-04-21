"""
app/modules/Health/service.py
===============================
Capa de lógica de negocio para el módulo de salud biométrica.

Responsabilidades:
- Resolver el health_subject_id del usuario autenticado (vía CryptoService)
- Cifrar/descifrar las notas del usuario (categoría especial Art. 9 RGPD)
- Orquestar creación, actualización, listado y eliminación de HealthRecords
- Gestionar la lógica de "upsert" por fecha: si ya existe un registro para esa
  fecha, actualizar en lugar de crear uno nuevo

NO hace:
- Acceso directo a BD (delega en HealthRepository)
- Formateo de respuestas HTTP (delega en el router)
- Generación de tokens JWT (módulo Identity)
"""

from __future__ import annotations

import logging
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.cryptoservice import CryptoService
from app.modules.health.repository import HealthRepository
from app.modules.health.schemas import (
    HealthRecordCreate,
    HealthRecordListResponse,
    HealthRecordResponse,
    HealthRecordUpdate,
)
from app.shared.exceptions import (
    DecryptionIntegrityError,
    DuplicateHealthRecordError,
    HealthRecordNotFoundError,
    MasterKeyNotConfiguredError,
)

logger = logging.getLogger(__name__)

# Contexto AAD para cifrado de notas (distinto al de health_uuid_enc)
_NOTES_AAD: bytes = b"healthstack.health_notes.v1"
_GCM_NONCE_SIZE: int = 12
_GCM_TAG_SIZE: int = 16


def _get_notes_aesgcm() -> AESGCM:
    """
    Devuelve una instancia AESGCM usando la MASTER_KEY del entorno.
    Reutiliza la misma clave que CryptoService (un solo secreto en entorno).
    """
    raw_key = os.environ.get("HEALTH_LINK_MASTER_KEY", "")
    if not raw_key:
        raise MasterKeyNotConfiguredError(
            "HEALTH_LINK_MASTER_KEY no configurada."
        )
    key_bytes = bytes.fromhex(raw_key)
    return AESGCM(key_bytes)


def _encrypt_notes(plaintext: str) -> str:
    """Cifra el texto de las notas con AES-256-GCM. Devuelve el payload serializado."""
    aesgcm = _get_notes_aesgcm()
    nonce = os.urandom(_GCM_NONCE_SIZE)
    ct_with_tag = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), _NOTES_AAD)
    ciphertext = ct_with_tag[:-_GCM_TAG_SIZE]
    auth_tag   = ct_with_tag[-_GCM_TAG_SIZE:]
    return ":".join([nonce.hex(), auth_tag.hex(), ciphertext.hex()])


def _decrypt_notes(payload_str: str) -> str:
    """Descifra el payload de notas. Lanza DecryptionIntegrityError si está manipulado."""
    parts = payload_str.split(":")
    if len(parts) != 3:
        raise DecryptionIntegrityError("Payload de notas malformado.")
    try:
        nonce, auth_tag, ciphertext = (bytes.fromhex(p) for p in parts)
    except ValueError:
        raise DecryptionIntegrityError("Payload de notas con formato hexadecimal inválido.")

    aesgcm = _get_notes_aesgcm()
    try:
        plaintext_bytes = aesgcm.decrypt(
            nonce=nonce,
            data=ciphertext + auth_tag,
            associated_data=_NOTES_AAD,
        )
    except InvalidTag:
        logger.error("DecryptionIntegrityError en notas de salud — posible manipulación.")
        raise DecryptionIntegrityError("No se pudo verificar la integridad de las notas.")
    return plaintext_bytes.decode("utf-8")


def _record_to_response(record, *, notes_plaintext: str | None) -> HealthRecordResponse:
    """Construye el schema de respuesta descifrando las notas."""
    return HealthRecordResponse(
        id=record.id,
        recorded_date=record.recorded_date,
        weight_kg=float(record.weight_kg) if record.weight_kg is not None else None,
        height_cm=float(record.height_cm) if record.height_cm is not None else None,
        body_fat_pct=float(record.body_fat_pct) if record.body_fat_pct is not None else None,
        muscle_mass_kg=float(record.muscle_mass_kg) if record.muscle_mass_kg is not None else None,
        waist_cm=float(record.waist_cm) if record.waist_cm is not None else None,
        resting_heart_rate=record.resting_heart_rate,
        sleep_hours=float(record.sleep_hours) if record.sleep_hours is not None else None,
        notes=notes_plaintext,
        created_at=record.created_at,
    )


def _decrypt_record_notes(record) -> str | None:
    """Descifra las notas de un HealthRecord. Devuelve None si no hay notas."""
    if not record.notes_encrypted:
        return None
    try:
        return _decrypt_notes(record.notes_encrypted)
    except DecryptionIntegrityError:
        logger.error(
            f"No se pudieron descifrar las notas del registro {str(record.id)[:8]}... "
            "Devolviendo None para no bloquear la respuesta."
        )
        return None


class HealthService:
    """
    Servicio de salud biométrica.
    Usa CryptoService para resolver la identidad del sujeto de salud.
    """

    # ── LIST ──────────────────────────────────────────────────────────────────

    @staticmethod
    async def list_records(
        db: AsyncSession,
        user_id: str,
        crypto: CryptoService,
        limit: int = 90,
        offset: int = 0,
    ) -> HealthRecordListResponse:
        """
        Lista los registros biométricos del usuario autenticado.

        Args:
            db: Sesión de BD.
            user_id: UUID del usuario (del JWT).
            crypto: CryptoService para resolver health_subject_id.
            limit: Máximo de registros a devolver.
            offset: Número de registros a saltar (paginación).
        """
        subject_id = await crypto.resolve_health_subject_id(user_id, db)
        records, total = await HealthRepository.list_by_subject(
            db, subject_id, limit=limit, offset=offset
        )

        responses = []
        for record in records:
            notes = _decrypt_record_notes(record)
            responses.append(_record_to_response(record, notes_plaintext=notes))

        return HealthRecordListResponse(records=responses, total=total)

    # ── CREATE ────────────────────────────────────────────────────────────────

    @staticmethod
    async def create_record(
        db: AsyncSession,
        user_id: str,
        data: HealthRecordCreate,
        crypto: CryptoService,
    ) -> HealthRecordResponse:
        """
        Crea un registro biométrico.

        Verifica duplicado por fecha — si ya existe, lanza DuplicateHealthRecordError.
        El cliente (api.js) captura el 409 y hace PATCH.
        """
        subject_id = await crypto.resolve_health_subject_id(user_id, db)

        # Verificar duplicado por fecha
        existing = await HealthRepository.get_by_date(db, subject_id, data.recorded_date)
        if existing:
            raise DuplicateHealthRecordError(
                f"Ya existe un registro para la fecha {data.recorded_date}. "
                "Usa PATCH para actualizar."
            )

        # Cifrar notas si las hay
        notes_encrypted = _encrypt_notes(data.notes) if data.notes else None

        record = await HealthRepository.create(
            db,
            health_subject_id=subject_id,
            recorded_date=data.recorded_date,
            weight_kg=data.weight_kg,
            height_cm=data.height_cm,
            body_fat_pct=data.body_fat_pct,
            muscle_mass_kg=data.muscle_mass_kg,
            waist_cm=data.waist_cm,
            resting_heart_rate=data.resting_heart_rate,
            sleep_hours=data.sleep_hours,
            notes_encrypted=notes_encrypted,
        )

        return _record_to_response(record, notes_plaintext=data.notes)

    # ── GET SINGLE ────────────────────────────────────────────────────────────

    @staticmethod
    async def get_record(
        db: AsyncSession,
        user_id: str,
        record_id: str,
        crypto: CryptoService,
    ) -> HealthRecordResponse:
        """Obtiene un registro biométrico por ID. Lanza 404 si no es del usuario."""
        subject_id = await crypto.resolve_health_subject_id(user_id, db)
        record = await HealthRepository.get_by_id(db, record_id, subject_id)
        if record is None:
            raise HealthRecordNotFoundError(
                f"No se encontró el registro con ID {record_id}."
            )
        notes = _decrypt_record_notes(record)
        return _record_to_response(record, notes_plaintext=notes)

    # ── UPDATE ────────────────────────────────────────────────────────────────

    @staticmethod
    async def update_record(
        db: AsyncSession,
        user_id: str,
        record_id: str,
        data: HealthRecordUpdate,
        crypto: CryptoService,
    ) -> HealthRecordResponse:
        """
        Actualiza campos específicos de un registro biométrico (PATCH).

        Solo modifica los campos enviados en el body (semántica PATCH).
        notes=None en el body sin enviar el campo → no modifica notas.
        Para borrar notas, enviar notes="" (string vacío).
        """
        subject_id = await crypto.resolve_health_subject_id(user_id, db)
        record = await HealthRepository.get_by_id(db, record_id, subject_id)
        if record is None:
            raise HealthRecordNotFoundError(
                f"No se encontró el registro con ID {record_id}."
            )

        # Determinar si se envió notas en el body
        update_dict = data.model_dump(exclude_unset=True)
        notes_plaintext: str | None = None
        notes_encrypted: str | None = None
        clear_notes = False

        if "notes" in update_dict:
            raw_notes = update_dict["notes"]
            if raw_notes:
                notes_encrypted = _encrypt_notes(raw_notes)
                notes_plaintext = raw_notes
            else:
                # notes vacío o None → borrar notas
                notes_encrypted = None
                clear_notes = True

        updated = await HealthRepository.update(
            db,
            record,
            recorded_date=update_dict.get("recorded_date"),
            weight_kg=update_dict.get("weight_kg"),
            height_cm=update_dict.get("height_cm"),
            body_fat_pct=update_dict.get("body_fat_pct"),
            muscle_mass_kg=update_dict.get("muscle_mass_kg"),
            waist_cm=update_dict.get("waist_cm"),
            resting_heart_rate=update_dict.get("resting_heart_rate"),
            sleep_hours=update_dict.get("sleep_hours"),
            notes_encrypted=notes_encrypted,
            clear_notes=clear_notes,
        )

        # Si no se actualizaron notas en este PATCH, descifrar las existentes
        if "notes" not in update_dict:
            notes_plaintext = _decrypt_record_notes(updated)

        return _record_to_response(updated, notes_plaintext=notes_plaintext)

    # ── DELETE ────────────────────────────────────────────────────────────────

    @staticmethod
    async def delete_record(
        db: AsyncSession,
        user_id: str,
        record_id: str,
        crypto: CryptoService,
    ) -> None:
        """
        Elimina un registro biométrico.
        Derecho al olvido: Art. 17 RGPD.
        """
        subject_id = await crypto.resolve_health_subject_id(user_id, db)
        record = await HealthRepository.get_by_id(db, record_id, subject_id)
        if record is None:
            raise HealthRecordNotFoundError(
                f"No se encontró el registro con ID {record_id}."
            )
        await HealthRepository.delete(db, record)
        logger.info(
            f"[Health] Registro {record_id[:8]}... eliminado para "
            f"subject={str(subject_id)[:8]}... (Art. 17 RGPD)"
        )
