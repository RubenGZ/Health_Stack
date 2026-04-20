"""
app/modules/Health/repository.py
==================================
Capa de acceso a datos para el módulo de salud biométrica.

PRINCIPIO DE AISLAMIENTO DE IDENTIDAD:
    Este repositorio NUNCA recibe un user_id.
    Recibe únicamente health_subject_id (UUID opaco).
    El CryptoService resuelve la traducción user_id → health_subject_id.
    Si alguien auditara este repositorio, no encontraría ninguna referencia
    a usuarios, emails ni tabla de identidad.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.Health.models import HealthRecord


class HealthRepository:
    """Operaciones CRUD sobre health.health_records."""

    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        health_subject_id: str | uuid.UUID,
        recorded_date: date,
        weight_kg: float | None = None,
        height_cm: float | None = None,
        body_fat_pct: float | None = None,
        muscle_mass_kg: float | None = None,
        waist_cm: float | None = None,
        resting_heart_rate: int | None = None,
        sleep_hours: float | None = None,
        notes_encrypted: str | None = None,
    ) -> HealthRecord:
        """Inserta un nuevo registro biométrico."""
        subject_uuid = (
            uuid.UUID(str(health_subject_id))
            if isinstance(health_subject_id, str)
            else health_subject_id
        )
        record = HealthRecord(
            health_subject_id=subject_uuid,
            recorded_date=recorded_date,
            weight_kg=weight_kg,
            height_cm=height_cm,
            body_fat_pct=body_fat_pct,
            muscle_mass_kg=muscle_mass_kg,
            waist_cm=waist_cm,
            resting_heart_rate=resting_heart_rate,
            sleep_hours=sleep_hours,
            notes_encrypted=notes_encrypted,
        )
        db.add(record)
        await db.flush()
        await db.refresh(record)
        return record

    @staticmethod
    async def get_by_id(
        db: AsyncSession,
        record_id: str | uuid.UUID,
        health_subject_id: str | uuid.UUID,
    ) -> HealthRecord | None:
        """
        Obtiene un registro por su ID.
        Requiere health_subject_id para verificar propiedad — nunca devuelve
        un registro de otro sujeto aunque el ID sea válido.
        """
        rid = uuid.UUID(str(record_id)) if isinstance(record_id, str) else record_id
        sid = (
            uuid.UUID(str(health_subject_id))
            if isinstance(health_subject_id, str)
            else health_subject_id
        )
        result = await db.execute(
            select(HealthRecord).where(
                and_(
                    HealthRecord.id == rid,
                    HealthRecord.health_subject_id == sid,
                )
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_date(
        db: AsyncSession,
        health_subject_id: str | uuid.UUID,
        recorded_date: date,
    ) -> HealthRecord | None:
        """Busca un registro por sujeto + fecha. Usado para detectar duplicados."""
        sid = (
            uuid.UUID(str(health_subject_id))
            if isinstance(health_subject_id, str)
            else health_subject_id
        )
        result = await db.execute(
            select(HealthRecord).where(
                and_(
                    HealthRecord.health_subject_id == sid,
                    HealthRecord.recorded_date == recorded_date,
                )
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_by_subject(
        db: AsyncSession,
        health_subject_id: str | uuid.UUID,
        limit: int = 90,
        offset: int = 0,
    ) -> tuple[list[HealthRecord], int]:
        """
        Lista registros paginados ordenados por fecha descendente.

        Returns:
            (records, total) — total es el count total sin paginación.
        """
        sid = (
            uuid.UUID(str(health_subject_id))
            if isinstance(health_subject_id, str)
            else health_subject_id
        )

        # Count total
        count_result = await db.execute(
            select(func.count()).where(HealthRecord.health_subject_id == sid)
        )
        total = count_result.scalar_one()

        # Registros paginados
        records_result = await db.execute(
            select(HealthRecord)
            .where(HealthRecord.health_subject_id == sid)
            .order_by(HealthRecord.recorded_date.desc())
            .limit(limit)
            .offset(offset)
        )
        records = list(records_result.scalars().all())

        return records, total

    @staticmethod
    async def update(
        db: AsyncSession,
        record: HealthRecord,
        *,
        recorded_date: date | None = None,
        weight_kg: float | None = None,
        height_cm: float | None = None,
        body_fat_pct: float | None = None,
        muscle_mass_kg: float | None = None,
        waist_cm: float | None = None,
        resting_heart_rate: int | None = None,
        sleep_hours: float | None = None,
        notes_encrypted: str | None = None,
        clear_notes: bool = False,
    ) -> HealthRecord:
        """
        Actualiza campos específicos de un HealthRecord (PATCH semántico).
        Solo se actualizan los campos que se proporcionan explícitamente.
        clear_notes=True permite borrar las notas (notas=None explícito en el body).
        """
        if recorded_date is not None:
            record.recorded_date = recorded_date
        if weight_kg is not None:
            record.weight_kg = weight_kg
        if height_cm is not None:
            record.height_cm = height_cm
        if body_fat_pct is not None:
            record.body_fat_pct = body_fat_pct
        if muscle_mass_kg is not None:
            record.muscle_mass_kg = muscle_mass_kg
        if waist_cm is not None:
            record.waist_cm = waist_cm
        if resting_heart_rate is not None:
            record.resting_heart_rate = resting_heart_rate
        if sleep_hours is not None:
            record.sleep_hours = sleep_hours
        if notes_encrypted is not None or clear_notes:
            record.notes_encrypted = notes_encrypted

        await db.flush()
        await db.refresh(record)
        return record

    @staticmethod
    async def delete(
        db: AsyncSession,
        record: HealthRecord,
    ) -> None:
        """Elimina un registro. El llamador ya verificó la propiedad."""
        await db.delete(record)
        await db.flush()
