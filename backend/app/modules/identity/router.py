"""
app/modules/identity/router.py
================================
Router FastAPI del módulo de identidad.

Endpoints:
    POST /api/v1/auth/register           — Registro de nuevo usuario
    POST /api/v1/auth/login              — Login y emisión de tokens
    GET  /api/v1/auth/me                 — Perfil del usuario autenticado
    POST /api/v1/auth/refresh            — Renovar access token con refresh token
    POST /api/v1/auth/logout             — Cerrar sesión
    GET  /api/v1/auth/google/redirect    — Iniciar OAuth Google (redirige al consent)
    GET  /api/v1/auth/google/callback    — Callback OAuth Google (emite JWT)
    GET  /api/v1/admin/users             — [Admin] Listar todos los usuarios
    PATCH /api/v1/admin/users/{id}       — [Admin] Actualizar rol / estado de usuario

Responsabilidades de esta capa:
- Recibir y validar el body HTTP (Pydantic hace la validación de tipos)
- Llamar al servicio correspondiente
- Devolver la respuesta HTTP correcta

NO hace:
- Lógica de negocio (está en IdentityService)
- Acceso directo a BD (está en UserRepository)
"""


import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.core.security.cryptoservice import CryptoService, get_crypto_service
from app.core.security.dependencies import CurrentUser, require_role
from app.core.security.hashing import hash_password
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

logger = logging.getLogger(__name__)

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
        plan=getattr(user, "plan", "free"),
    )
    new_refresh_token = create_refresh_token(user_id=str(user.id))

    # Persistir nuevo JTI en BD
    new_rt_payload = decode_token(new_refresh_token)
    await RefreshTokenRepository.create(
        db=db,
        jti=new_rt_payload["jti"],
        user_id=str(user.id),
        expires_at=datetime.fromtimestamp(new_rt_payload["exp"], tz=UTC),
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


# ── GET /google/redirect ──────────────────────────────────────────────────────

@router.get(
    "/google/redirect",
    summary="Iniciar login con Google",
    description=(
        "Redirige al usuario a la página de consentimiento de Google OAuth. "
        "Una vez que el usuario autoriza, Google redirige a /google/callback con un code. "
        "No requiere autenticación previa."
    ),
)
async def google_redirect(request: Request) -> RedirectResponse:
    """
    Genera la URL de consentimiento de Google y redirige al usuario.
    El parámetro `state` actúa como nonce CSRF — en producción con sesiones
    se debería almacenar en la cookie de sesión para verificarlo en el callback.
    """
    try:
        from app.core.security.google_oauth import build_auth_url
        url, state = build_auth_url()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Google OAuth no está configurado: {exc}",
        )
    # En producción: guardar state en cookie firmada y verificarlo en callback
    return RedirectResponse(url=url, status_code=status.HTTP_302_FOUND)


# ── GET /google/callback ──────────────────────────────────────────────────────

@router.get(
    "/google/callback",
    summary="Callback de Google OAuth",
    description=(
        "Google llama a este endpoint tras el consentimiento del usuario. "
        "Intercambia el código por tokens de Google, obtiene el perfil, "
        "crea la cuenta si no existe (con consentimiento RGPD implícito en OAuth), "
        "y emite un JWT HealthStack. Redirige al frontend con el token en el hash."
    ),
)
async def google_callback(
    request: Request,
    db: DBSession,
    crypto: CryptoService = Depends(get_crypto_service),
    code: str = Query(..., description="Código de autorización de Google"),
    state: str | None = Query(None),
    error: str | None = Query(None),
) -> RedirectResponse:
    """
    Flujo OAuth callback:
    1. Verificar que no hay error de Google (ej. usuario canceló)
    2. Obtener perfil de Google (email, nombre) usando el code
    3. Buscar usuario por email — crear si no existe
    4. Emitir JWT HealthStack
    5. Redirigir al frontend con el token en el fragmento URL (#)
    """
    # 1. Error de Google (usuario canceló el consentimiento, etc.)
    if error:
        logger.warning(f"Google OAuth error: {error}")
        return RedirectResponse(url="/?auth_error=google_denied", status_code=302)

    if not code:
        return RedirectResponse(url="/?auth_error=no_code", status_code=302)

    # 2. Obtener perfil de Google
    try:
        from app.core.security.google_oauth import get_user_from_google_code
        google_user = await get_user_from_google_code(code)
    except Exception as exc:
        logger.error(f"Error obteniendo perfil de Google: {exc}")
        return RedirectResponse(url="/?auth_error=google_failed", status_code=302)

    # 3. Buscar o crear usuario
    email        = google_user["email"]
    display_name = google_user.get("display_name") or email.split("@")[0]

    user = await UserRepository.get_by_email(db, email)

    if user is None:
        # Nuevo usuario vía Google — creamos la cuenta
        # El consentimiento RGPD está implícito en el flujo OAuth de Google
        # (el usuario acepta en la pantalla de consentimiento de Google)
        password_hash = hash_password(f"google_oauth_{google_user['google_id']}_hs")
        user = await UserRepository.create(
            db=db,
            email=email,
            password_hash=password_hash,
            display_name=display_name,
            consent_gdpr=True,
        )
        # Crear llave de cruce (seudonimización AEPD)
        await crypto.create_health_link_for_user(user_id=str(user.id), db=db)
        logger.info(f"Nuevo usuario creado via Google OAuth: {str(user.id)[:8]}...")
    else:
        # Usuario existente — actualizar last_login
        await UserRepository.update_last_login(db, str(user.id))
        logger.info(f"Login via Google OAuth: {str(user.id)[:8]}...")

    # 4. Emitir tokens JWT HealthStack
    access_token  = create_access_token(
        user_id=str(user.id),
        email=user.email,
        role=user.role,
        plan=getattr(user, "plan", "free"),
    )
    refresh_token = create_refresh_token(user_id=str(user.id))

    _rt_payload = decode_token(refresh_token)
    await RefreshTokenRepository.create(
        db=db,
        jti=_rt_payload["jti"],
        user_id=str(user.id),
        expires_at=datetime.fromtimestamp(_rt_payload["exp"], tz=UTC),
    )

    # 5. Redirigir al frontend con los tokens en el fragmento (#)
    #    El JS del frontend lee el hash y almacena los tokens en localStorage
    from app.core.config import get_settings
    settings = get_settings()

    # Detectar la URL base a partir del request si no hay config explícita
    base = str(request.base_url).rstrip("/")

    redirect_url = (
        f"{base}/"
        f"?auth=google"
        f"#access_token={access_token}"
        f"&refresh_token={refresh_token}"
        f"&token_type=bearer"
    )
    return RedirectResponse(url=redirect_url, status_code=302)


# ── ADMIN ENDPOINTS ───────────────────────────────────────────────────────────

class AdminUpdateUserRequest(BaseModel):
    """Body para PATCH /admin/users/{user_id}."""
    role: str | None = None       # "user" | "admin"
    is_active: bool | None = None


@router.get(
    "/admin/users",
    summary="[Admin] Listar todos los usuarios",
    description="Devuelve la lista completa de usuarios. Solo accesible con rol 'admin'.",
)
async def admin_list_users(
    db: DBSession,
    _admin: dict = Depends(require_role("admin")),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[UserPublicResponse]:
    """Lista paginada de todos los usuarios del sistema."""
    users = await UserRepository.get_all(db, limit=limit, offset=offset)
    return [UserPublicResponse.model_validate(u) for u in users]


@router.patch(
    "/admin/users/{user_id}",
    summary="[Admin] Actualizar rol o estado de un usuario",
    description=(
        "Permite al admin cambiar el rol ('user'/'admin') o activar/suspender "
        "una cuenta (is_active). Solo accesible con rol 'admin'."
    ),
)
async def admin_update_user(
    user_id: str,
    body: AdminUpdateUserRequest,
    db: DBSession,
    _admin: dict = Depends(require_role("admin")),
) -> UserPublicResponse:
    """
    Actualiza rol o estado de un usuario. Ambos campos son opcionales.
    """
    user = await UserRepository.get_by_id(db, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Usuario {user_id} no encontrado.",
        )

    if body.role is not None:
        if body.role not in ("user", "admin"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Rol inválido. Valores permitidos: 'user', 'admin'.",
            )
        user.role = body.role

    if body.is_active is not None:
        user.is_active = body.is_active

    await db.flush()
    await db.refresh(user)
    logger.info(
        f"Admin {_admin['user_id'][:8]} actualizó usuario {user_id[:8]}: "
        f"role={body.role} is_active={body.is_active}"
    )
    return UserPublicResponse.model_validate(user)
