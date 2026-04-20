"""
app/modules/identity/service.py
=================================
Capa de lógica de negocio para el módulo de identidad.

Responsabilidades:
- Orquestar el flujo de registro: crear usuario + llave de cruce cifrada
- Orquestar el flujo de login: verificar credenciales + emitir tokens
- Emitir access token y refresh token JWT

NO hace:
- Acceso directo a BD (delega en UserRepository / DataLinkRepository)
- Operaciones criptográficas directas (delega en CryptoService y HashingService)
- Formateo de respuestas HTTP (delega en el router)

IMPORTANTE — Timing attack en login:
    Aunque el usuario no exista, se ejecuta `verify_password` con un hash
    ficticio para que la respuesta tarde lo mismo. Esto evita user enumeration
    mediante diferencias de tiempo de respuesta.
"""

from __future__ import annotations

import logging

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.Security.cryptoservice import CryptoService
from app.core.Security.hashing import hash_password, needs_rehash, verify_password
from app.core.Security.jwt_handler import create_access_token, create_refresh_token
from app.modules.Identity.repository import UserRepository
from app.modules.Identity.schemas import (
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    RegisterResponse,
    UserPublicResponse,
)
from app.shared.exceptions import InvalidCredentialsError, UserAlreadyExistsError

logger = logging.getLogger(__name__)

# Hash ficticio para uso en timing-safe login (mismo coste que un hash real)
# Se calcula una vez al cargar el módulo para no pagar el coste en cada request
_DUMMY_HASH: str = hash_password("HealthStack_dummy_2024!")


class IdentityService:
    """
    Servicio de identidad — stateless, todos los métodos son estáticos.
    Se puede instanciar o usar directamente con los métodos de clase.
    """

    # ── REGISTRO ──────────────────────────────────────────────────────────────

    @staticmethod
    async def register(
        db: AsyncSession,
        request: RegisterRequest,
        crypto: CryptoService,
    ) -> RegisterResponse:
        """
        Registra un nuevo usuario y genera su llave de cruce cifrada.

        Flujo:
            1. Verificar que el email no está registrado
            2. Hashear la contraseña con Argon2id
            3. Crear el registro de usuario en `public.users`
            4. Generar health_subject_id (UUID aleatorio) y cifrarlo en `public.data_links`
            5. Emitir access token + refresh token JWT
            6. Devolver la respuesta

        El consentimiento RGPD ya fue validado por el schema Pydantic (RegisterRequest).
        Si consent_gdpr=False, Pydantic lanza ValidationError antes de llegar aquí.

        Args:
            db: Sesión de BD inyectada por get_db().
            request: Body del POST /auth/register validado por Pydantic.
            crypto: CryptoService inyectado para crear la llave de cruce.

        Raises:
            UserAlreadyExistsError: El email ya está registrado. → HTTP 409
        """
        # 1. Verificar unicidad de email ANTES de hashear la contraseña
        #    (ahorra ~200ms de Argon2 si el email ya existe)
        existing = await UserRepository.get_by_email(db, request.email)
        if existing is not None:
            logger.info(
                f"Intento de registro con email ya registrado: {request.email[:3]}***"
            )
            raise UserAlreadyExistsError(
                "Este email ya está registrado. ¿Quieres iniciar sesión?"
            )

        # 2. Hashear contraseña (operación costosa ~200ms — solo si el email es nuevo)
        password_hash = hash_password(request.password)

        # 3. Crear usuario
        try:
            user = await UserRepository.create(
                db=db,
                email=request.email,
                password_hash=password_hash,
                display_name=request.display_name,
                consent_gdpr=request.consent_gdpr,
            )
        except IntegrityError:
            # Condición de carrera: dos requests simultáneos con el mismo email
            # El UNIQUE constraint de PostgreSQL atrapa este caso
            await db.rollback()
            raise UserAlreadyExistsError(
                "Este email ya está registrado. ¿Quieres iniciar sesión?"
            )

        # 4. Crear llave de cruce cifrada (seudonimización AEPD)
        #    Este paso vincula user.id con un health_subject_id aleatorio
        health_subject_id = await crypto.create_health_link_for_user(
            user_id=str(user.id),
            db=db,
        )
        logger.info(
            f"Registro completado: user={str(user.id)[:8]}... "
            f"health_subject={health_subject_id[:8]}..."
        )

        # 5. Emitir tokens JWT
        access_token = create_access_token(
            user_id=str(user.id),
            email=user.email,
            role=user.role,
        )
        refresh_token = create_refresh_token(user_id=str(user.id))

        # 6. Construir respuesta
        return RegisterResponse(
            user=UserPublicResponse.model_validate(user),
            access_token=access_token,
            refresh_token=refresh_token,
        )

    # ── LOGIN ─────────────────────────────────────────────────────────────────

    @staticmethod
    async def login(
        db: AsyncSession,
        request: LoginRequest,
    ) -> LoginResponse:
        """
        Verifica credenciales y emite tokens JWT.

        Flujo:
            1. Buscar usuario por email
            2. Verificar contraseña (timing-safe: misma duración si el usuario no existe)
            3. Verificar que la cuenta está activa
            4. Actualizar last_login_at
            5. Rehashear si los parámetros de Argon2 cambiaron (opcional)
            6. Emitir access token + refresh token

        Seguridad:
            - Mismo mensaje de error para "email no encontrado" y "contraseña incorrecta"
              → evita user enumeration attacks
            - verify_password() es timing-safe (argon2-cffi garantiza tiempo constante)
            - Si el usuario no existe, se ejecuta `verify_password(_DUMMY_HASH)` para
              igualar el tiempo de respuesta y no filtrar si el email existe

        Args:
            db: Sesión de BD.
            request: Body del POST /auth/login validado por Pydantic.

        Raises:
            InvalidCredentialsError: Email o contraseña incorrectos. → HTTP 401
        """
        # 1. Buscar usuario
        user = await UserRepository.get_by_email(db, request.email)

        # 2. Verificar contraseña (timing-safe)
        if user is None:
            # Ejecutar verify_password con un hash ficticio para igualar tiempos
            # y no revelar mediante timing si el email existe en el sistema
            verify_password(request.password, _DUMMY_HASH)
            raise InvalidCredentialsError("Credenciales incorrectas.")

        password_ok = verify_password(request.password, user.password_hash)
        if not password_ok:
            raise InvalidCredentialsError("Credenciales incorrectas.")

        # 3. Verificar cuenta activa
        if not user.is_active:
            # Mismo mensaje genérico — no revelar si la cuenta está suspendida
            raise InvalidCredentialsError("Credenciales incorrectas.")

        # 4. Actualizar last_login_at (no crítico — no bloquea el login si falla)
        await UserRepository.update_last_login(db, str(user.id))

        # 5. Rehash si los parámetros de Argon2 han cambiado
        #    (ejemplo: si se sube time_cost de 3 a 4 en una actualización de seguridad)
        if needs_rehash(user.password_hash):
            new_hash = hash_password(request.password)
            user.password_hash = new_hash
            await db.flush()
            logger.info(f"Contraseña re-hasheada para user={str(user.id)[:8]}...")

        # 6. Emitir tokens
        access_token = create_access_token(
            user_id=str(user.id),
            email=user.email,
            role=user.role,
        )
        refresh_token = create_refresh_token(user_id=str(user.id))

        logger.info(f"Login exitoso: user={str(user.id)[:8]}...")

        return LoginResponse(
            user=UserPublicResponse.model_validate(user),
            access_token=access_token,
            refresh_token=refresh_token,
        )
