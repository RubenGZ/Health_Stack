"""
app/modules/identity/router.py
================================
Router FastAPI del módulo de identidad.

Endpoints:
    POST /api/v1/auth/register  — Registro de nuevo usuario
    POST /api/v1/auth/login     — Login y emisión de tokens
    GET  /api/v1/auth/me        — Perfil del usuario autenticado
    POST /api/v1/auth/refresh   — Renovar access token con refresh token

Responsabilidades de esta capa:
- Recibir y validar el body HTTP (Pydantic hace la validación de tipos)
- Llamar al servicio correspondiente
- Devolver la respuesta HTTP correcta

NO hace:
- Lógica de negocio (está en IdentityService)
- Acceso directo a BD (está en UserRepository)
"""


from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, status

from app.core.security.cryptoservice import CryptoService, get_crypto_service
from app.core.security.dependencies import CurrentUser
from app.core.security.jwt_handler import (
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.modules.identity.repository import RefreshTokenRepository, UserRepository
from app.modules.identity.schemas import (
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    RegisterRequest,
    RegisterResponse,
    UserPublicResponse,
)
from app.modules.identity.service import IdentityService
from app.session import DBSession
from app.shared.exceptions import TokenInvalidError, UserNotFoundError

router = APIRouter()

# Importamos el limiter desde main para reutilizarlo en los decoradores.
# El import tardío evita importaciones circulares durante la inicialización.
def _get_limiter():
    from app.main import limiter
    return limiter


# ── POST /register ────────────────────────────────────────────────────────────

@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar nuevo usuario",
    description=(
        "Crea una cuenta nueva. Requiere consentimiento RGPD explícito. "
        "Genera automáticamente la llave de cruce cifrada (seudonimización AEPD). "
        "Devuelve access token (15 min) y refresh token (7 días)."
    ),
)
@_get_limiter().limit("3/hour")   # Máx. 3 registros por hora por IP
async def register(
    request: Request,
    body: RegisterRequest,
    db: DBSession,
    crypto: CryptoService = Depends(get_crypto_service),
) -> RegisterResponse:
    """
    Flujo completo de registro:
    1. Valida que el email no exista
    2. Crea el usuario con contraseña Argon2id
    3. Genera y cifra la llave de cruce (AES-256-GCM)
    4. Emite JWT RS256
    """
    return await IdentityService.register(db=db, request=body, crypto=crypto)


# ── POST /login ───────────────────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Iniciar sesión",
    description=(
        "Verifica credenciales y emite tokens JWT. "
        "El mensaje de error es genérico para email y contraseña incorrectos "
        "(evita user enumeration attacks). "
        "Limitado a 5 intentos por minuto por IP (protección fuerza bruta)."
    ),
)
@_get_limiter().limit("5/minute")   # OWASP A07 — Brute force protection
async def login(
    request: Request,
    body: LoginRequest,
    db: DBSession,
) -> LoginResponse:
    """
    Flujo de login:
    1. Busca el usuario por email
    2. Verifica la contraseña con Argon2id (timing-safe)
    3. Emite access token (15 min) + refresh token (7 días)

    Rate limit: 5 intentos/minuto por IP.
    Superado el límite → HTTP 429 con cabecera Retry-After.
    """
    return await IdentityService.login(db=db, request=body)


# ── GET /me ───────────────────────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=UserPublicResponse,
    summary="Perfil del usuario actual",
    description="Devuelve los datos públicos del usuario autenticado. Requiere Bearer token.",
)
async def me(
    current_user: CurrentUser,
    db: DBSession,
) -> UserPublicResponse:
    """
    Extrae el user_id del JWT Bearer y devuelve el perfil.
    No devuelve datos de salud — solo identidad pública.
    """
    user = await UserRepository.get_by_id(db, current_user["user_id"])
    if user is None:
        # Caso extremo: el token es válido pero el usuario fue eliminado
        raise UserNotFoundError("El usuario asociado al token no existe.")
    return UserPublicResponse.model_validate(user)


# ── POST /refresh ─────────────────────────────────────────────────────────────

@router.post(
    "/refresh",
    summary="Renovar access token con rotación de refresh token",
    description=(
        "Dado un refresh token válido y no revocado, emite un nuevo access token "
        "y un nuevo refresh token (rotación). El refresh token antiguo queda revocado "
        "inmediatamente — no puede reutilizarse. Permite logout global y detección "
        "de reutilización de tokens comprometidos."
    ),
)
@_get_limiter().limit("10/minute")   # Protección contra refresh token flooding
async def refresh_token(
    request: Request,
    body: RefreshRequest,
    db: DBSession,
) -> dict:
    """
    Flujo de rotación de refresh token (ADR-001-B):
    1. Decodificar y validar el JWT (firma, expiración, type=refresh)
    2. Verificar que el JTI existe en `refresh_tokens` y NO está revocado
    3. Revocar el JTI antiguo (revoked_at = now)
    4. Emitir nuevo access token + nuevo refresh token
    5. Persistir el nuevo JTI en `refresh_tokens`

    Si el JTI no existe o ya está revocado → 401 (posible token reuse attack).
    """
    token = body.refresh_token

    try:
        payload = decode_token(token)
    except Exception as exc:
        raise TokenInvalidError("Refresh token inválido o expirado.") from exc

    if payload.get("type") != "refresh":
        raise TokenInvalidError("El token proporcionado no es un refresh token.")

    old_jti = payload.get("jti")
    user_id = payload.get("sub")

    # Verificar JTI en BD — detecta tokens revocados (logout) o reutilizados
    stored_token = await RefreshTokenRepository.get_by_jti(db, old_jti)
    if stored_token is None or not stored_token.is_valid:
        raise TokenInvalidError(
            "Refresh token revocado o no registrado. Inicia sesión de nuevo."
        )

    user = await UserRepository.get_by_id(db, user_id)
    if user is None or not user.is_active:
        raise TokenInvalidError("El usuario asociado al token no está disponible.")

    # Revocar el JTI antiguo (rotación: el viejo token ya no sirve)
    await RefreshTokenRepository.revoke(db, old_jti)

    # Emitir nuevos tokens
    new_access_token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        role=user.role,
    )
    new_refresh_token = create_refresh_token(user_id=str(user.id))

    # Persistir nuevo JTI en BD
    new_rt_payload = decode_token(new_refresh_token)
    await RefreshTokenRepository.create(
        db=db,
        jti=new_rt_payload["jti"],
        user_id=str(user.id),
        expires_at=datetime.fromtimestamp(new_rt_payload["exp"], tz=timezone.utc),
    )

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
    }


# ── POST /logout ──────────────────────────────────────────────────────────────

@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cerrar sesión",
    description=(
        "Revoca el refresh token proporcionado. "
        "El access token expirará en máximo 15 minutos por su TTL natural. "
        "Para logout global (todos los dispositivos), usar /logout-all."
    ),
)
@_get_limiter().limit("20/minute")
async def logout(
    request: Request,
    body: RefreshRequest,
    db: DBSession,
) -> None:
    """
    Revoca el JTI del refresh token para invalidarlo inmediatamente.
    Si el token ya está revocado o no existe, se devuelve 204 igualmente
    (idempotente — el resultado es el mismo: el token no es válido).
    """
    try:
        payload = decode_token(body.refresh_token)
    except Exception:
        # Token ya expirado o inválido → ya no es útil, tratamos como éxito
        return

    if payload.get("type") != "refresh":
        return  # No es un refresh token → ignorar silenciosamente

    jti = payload.get("jti")
    if jti:
        await RefreshTokenRepository.revoke(db, jti)  # No-op si ya revocado
