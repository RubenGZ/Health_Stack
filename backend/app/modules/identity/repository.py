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

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.identity.models import DataLink, PasswordResetToken, RefreshToken, User

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
            consent_date=datetime.now(UTC) if consent_gdpr else None,
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
            user.last_login_at = datetime.now(UTC)
            await db.flush()

    @staticmethod
    async def get_all(
        db: AsyncSession,
        *,
        limit: int = 100,
        offset: int = 0,
    ) -> list[User]:
        """
        Devuelve todos los usuarios paginados. Solo para uso admin.
        Ordenados por fecha de creación (más recientes primero).
        """
        from sqlalchemy import desc
        result = await db.execute(
            select(User)
            .order_by(desc(User.created_at))
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    @staticmethod
    async def update_password(
        db: AsyncSession,
        user_id: str | uuid.UUID,
        new_password_hash: str,
    ) -> None:
        """Actualiza el hash de contraseña de un usuario."""
        uid = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id
        result = await db.execute(select(User).where(User.id == uid))
        user = result.scalar_one_or_none()
        if user:
            user.password_hash = new_password_hash
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
            link.rotated_at = datetime.now(UTC)
            await db.flush()


# ── REFRESH TOKEN REPOSITORY ──────────────────────────────────────────────────

class RefreshTokenRepository:
    """
    Operaciones sobre la tabla `public.refresh_tokens`.
    Permite rotación de tokens y logout global sin Redis.
    """

    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        jti: str,
        user_id: str | uuid.UUID,
        expires_at: datetime,
    ) -> RefreshToken:
        """Registra un nuevo JTI como activo."""
        uid = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id
        token = RefreshToken(jti=jti, user_id=uid, expires_at=expires_at)
        db.add(token)
        await db.flush()
        return token

    @staticmethod
    async def get_by_jti(db: AsyncSession, jti: str) -> RefreshToken | None:
        """Busca un JTI. Devuelve None si no existe."""
        result = await db.execute(
            select(RefreshToken).where(RefreshToken.jti == jti)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def revoke(db: AsyncSession, jti: str) -> bool:
        """
        Revoca un JTI marcando revoked_at = now().
        Devuelve True si existía, False si no.
        """
        result = await db.execute(
            select(RefreshToken).where(RefreshToken.jti == jti)
        )
        token = result.scalar_one_or_none()
        if token is None:
            return False
        token.revoked_at = datetime.now(UTC)
        await db.flush()
        return True

    @staticmethod
    async def revoke_all_for_user(db: AsyncSession, user_id: str | uuid.UUID) -> int:
        """
        Revoca TODOS los refresh tokens de un usuario.
        Úsalo en: cambio de contraseña, cuenta comprometida, admin action.
        Devuelve el número de tokens revocados.
        """
        uid = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id
        result = await db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == uid, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        await db.flush()
        return result.rowcount

    @staticmethod
    async def revoke_all(db: AsyncSession, user_id: str | uuid.UUID) -> int:
        """Alias de revoke_all_for_user — interfaz uniforme para el router de reset."""
        return await RefreshTokenRepository.revoke_all_for_user(db, user_id)


# ── PASSWORD RESET REPOSITORY ─────────────────────────────────────────────────

class PasswordResetRepository:
    """
    Operaciones sobre la tabla `public.password_reset_tokens`.

    Seguridad:
    - Los tokens en claro nunca se persisten — solo su SHA-256 hex.
    - Cada `create_token` invalida los tokens anteriores del usuario.
    - `consume_token` verifica expiración y single-use en una sola operación.
    """

    @staticmethod
    async def create_token(db: AsyncSession, user_id: uuid.UUID) -> str:
        """
        Genera un token seguro, invalida los anteriores del usuario y guarda el hash.
        Devuelve el token en claro (para enviarlo por email — nunca se persiste).
        """
        # Invalidar tokens anteriores no consumidos del mismo usuario
        await db.execute(
            update(PasswordResetToken)
            .where(
                PasswordResetToken.user_id == user_id,
                PasswordResetToken.used_at.is_(None),
            )
            .values(used_at=datetime.now(UTC))
        )

        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        db_token = PasswordResetToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
        db.add(db_token)
        await db.flush()
        return raw_token

    @staticmethod
    async def consume_token(db: AsyncSession, raw_token: str) -> uuid.UUID | None:
        """
        Verifica y consume el token. Devuelve user_id si el token es válido,
        None si el token no existe, ya fue usado o está expirado.
        """
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        result = await db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.used_at.is_(None),
                PasswordResetToken.expires_at > datetime.now(UTC),
            )
        )
        db_token = result.scalar_one_or_none()
        if not db_token:
            return None
        db_token.used_at = datetime.now(UTC)
        await db.flush()
        return db_token.user_id
