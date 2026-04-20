"""
app/modules/identity/repository.py
=====================================
Capa de acceso a datos para el módulo de identidad.

Responsabilidades:
- CRUD sobre la tabla `users` (schema: public)
- CRUD sobre la tabla `data_links` (schema: public)

Reglas:
- Los repositorios NO contienen lógica de negocio.
- Los repositorios NO lanzan excepciones HTTP — solo excepciones de dominio.
- Usan `flush()` (no `commit()`) para que la sesión de `get_db()` controle
  la transacción completa: si algo falla en el servicio, el rollback
  deshace todos los cambios del request.

Separación de schemas PostgreSQL:
- `users` y `data_links` → schema `public`
- `health_records` → schema `health` (módulo Health)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.Identity.models import DataLink, User


# ── USER REPOSITORY ───────────────────────────────────────────────────────────

class UserRepository:
    """Operaciones de base de datos sobre la tabla `public.users`."""

    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        email: str,
        password_hash: str,
        display_name: str | None,
        consent_gdpr: bool,
    ) -> User:
        """
        Inserta un nuevo usuario.

        Usa `flush()` (no `commit()`) para hacer el INSERT en la transacción
        actual y obtener el `id` generado sin cerrar la transacción.
        El commit lo gestiona `get_db()` al finalizar el request.

        Raises:
            sqlalchemy.exc.IntegrityError: Si el email ya existe (UNIQUE constraint).
            El llamador (service) convierte esto en UserAlreadyExistsError.
        """
        user = User(
            email=email,
            password_hash=password_hash,
            display_name=display_name,
            consent_gdpr=consent_gdpr,
            consent_date=datetime.now(timezone.utc) if consent_gdpr else None,
        )
        db.add(user)
        # flush → ejecuta el INSERT y rellena user.id sin hacer commit
        await db.flush()
        await db.refresh(user)  # Refresca los campos generados por el servidor (timestamps)
        return user

    @staticmethod
    async def get_by_email(db: AsyncSession, email: str) -> User | None:
        """Busca un usuario por email. Devuelve None si no existe."""
        result = await db.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_id(db: AsyncSession, user_id: str | uuid.UUID) -> User | None:
        """Busca un usuario por UUID. Devuelve None si no existe."""
        uid = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id
        result = await db.execute(
            select(User).where(User.id == uid)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def update_last_login(db: AsyncSession, user_id: str | uuid.UUID) -> None:
        """Actualiza la fecha de último login del usuario."""
        uid = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id
        result = await db.execute(
            select(User).where(User.id == uid)
        )
        user = result.scalar_one_or_none()
        if user:
            user.last_login_at = datetime.now(timezone.utc)
            await db.flush()

    @staticmethod
    async def set_active(
        db: AsyncSession,
        user_id: str | uuid.UUID,
        *,
        active: bool,
    ) -> None:
        """Activa o suspende (soft-delete) una cuenta. Solo para uso admin."""
        uid = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id
        result = await db.execute(select(User).where(User.id == uid))
        user = result.scalar_one_or_none()
        if user:
            user.is_active = active
            await db.flush()


# ── DATA LINK REPOSITORY ──────────────────────────────────────────────────────

class DataLinkRepository:
    """
    Operaciones sobre la tabla `public.data_links`.

    Esta tabla es el corazón de la seudonimización AEPD:
    almacena el vínculo cifrado user_id ↔ health_subject_id.

    IMPORTANTE: Este repositorio NO descifra nada. El CryptoService
    es el único componente autorizado para operar con el payload cifrado.
    """

    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        user_id: str | uuid.UUID,
        health_uuid_enc: str,
    ) -> DataLink:
        """
        Crea la llave de cruce cifrada para un usuario.

        Se llama UNA SOLA VEZ por usuario, durante el registro.
        Un segundo intento lanza IntegrityError (UNIQUE constraint en user_id).

        Args:
            user_id: UUID del usuario propietario.
            health_uuid_enc: Payload AES-256-GCM serializado como
                             "<nonce_hex>:<tag_hex>:<ciphertext_hex>".
        """
        uid = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id
        link = DataLink(
            user_id=uid,
            health_uuid_enc=health_uuid_enc,
        )
        db.add(link)
        await db.flush()
        await db.refresh(link)
        return link

    @staticmethod
    async def get_by_user_id(
        db: AsyncSession,
        user_id: str | uuid.UUID,
    ) -> DataLink | None:
        """
        Recupera la llave de cruce cifrada de un usuario.

        Devuelve None si el usuario no tiene llave (registro incompleto).
        El CryptoService llama a este método para resolver el health_subject_id.
        """
        uid = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id
        result = await db.execute(
            select(DataLink).where(DataLink.user_id == uid)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def update_rotated_at(
        db: AsyncSession,
        user_id: str | uuid.UUID,
        *,
        new_health_uuid_enc: str,
    ) -> None:
        """
        Actualiza el payload cifrado tras una rotación de la MASTER_KEY.
        Registra la fecha de rotación en `rotated_at`.
        """
        uid = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id
        result = await db.execute(
            select(DataLink).where(DataLink.user_id == uid)
        )
        link = result.scalar_one_or_none()
        if link:
            link.health_uuid_enc = new_health_uuid_enc
            link.rotated_at = datetime.now(timezone.utc)
            await db.flush()
