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

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status

from app.core.Security.cryptoservice import CryptoService, get_crypto_service
from app.core.Security.dependencies import CurrentUser
from app.core.Security.jwt_handler import decode_token
from app.modules.Identity.repository import UserRepository
from app.modules.Identity.schemas import (
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    RegisterResponse,
    UserPublicResponse,
)
from app.modules.Identity.service import IdentityService
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
    summary="Renovar access token",
    description=(
        "Dado un refresh token válido, emite un nuevo access token. "
        "El refresh token NO se rota en esta versión (Fase 1). "
        "En producción, implementar rotación con lista de JTIs en Redis."
    ),
)
async def refresh_token(
    body: dict,
    db: DBSession,
) -> dict:
    """
    Renueva el access token usando el refresh token.

    Body esperado: {"refresh_token": "<jwt>"}

    TODO (Fase 2 — Seguridad):
    - Rotar el refresh token en cada uso (invalidar el anterior).
    - Almacenar JTIs válidos en Redis para permitir logout global.
    - Límite de renovaciones por IP (rate limiting).
    """
    token = body.get("refresh_token", "")
    if not token:
        raise TokenInvalidError("refresh_token es requerido.")

    try:
        payload = decode_token(token)
    except Exception as exc:
        raise TokenInvalidError("Refresh token inválido o expirado.") from exc

    if payload.get("type") != "refresh":
        raise TokenInvalidError("El token proporcionado no es un refresh token.")

    user_id = payload.get("sub")
    user = await UserRepository.get_by_id(db, user_id)
    if user is None or not user.is_active:
        raise TokenInvalidError("El usuario asociado al token no está disponible.")

    from app.core.Security.jwt_handler import create_access_token
    new_access_token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        role=user.role,
    )

    return {
        "access_token": new_access_token,
        "token_type": "bearer",
    }
