"""
app/main.py
============
Punto de entrada de HealthStack Pro API.

Responsabilidades:
- Instanciar la aplicación FastAPI con metadatos y configuración
- Registrar middlewares (CORS, etc.)
- Registrar handlers globales de excepciones de dominio
- Incluir routers de cada módulo
- Exponer endpoint de health check para monitorización

NOTA: Los routers de módulos se añadirán conforme se implementen
      (identity, health, etc.). Cada módulo tendrá su propio router.py.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.core.config import get_settings
from app.shared.exceptions import (
    DecryptionIntegrityError,
    DuplicateHealthRecordError,
    HealthLinkNotFoundError,
    HealthRecordNotFoundError,
    InsufficientPermissionsError,
    InvalidCredentialsError,
    MasterKeyNotConfiguredError,
    TokenExpiredError,
    TokenInvalidError,
    UserAlreadyExistsError,
    UserNotFoundError,
    ValidationError,
)

# ── Logger ────────────────────────────────────────────────────────────────────
logger = logging.getLogger(__name__)

# ── Settings ──────────────────────────────────────────────────────────────────
settings = get_settings()

# ── Rate Limiter (OWASP A07 — Brute Force Protection) ────────────────────────
# En producción, pasar storage_uri="redis://..." para estado compartido entre workers.
# En desarrollo usa memoria local (reinicia con el proceso).
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

# ── Sentry PII filter ─────────────────────────────────────────────────────────
# RGPD Art. 28: Sentry es un subencargado — solo puede recibir metadatos de error,
# nunca datos personales (email, IPs de usuarios, payloads de salud).
_SENSITIVE_KEYS = {"email", "password", "health_subject_id", "health_uuid_enc",
                   "weight_kg", "notes", "user_id", "refresh_token", "access_token"}

def _sentry_before_send(event: dict, hint: dict) -> dict | None:
    """
    Filtra PII antes de enviar eventos a Sentry.
    - Elimina keys sensibles de request bodies y user context
    - Redacta IPs de usuarios (mantiene solo primer octeto para geolocalización)
    - Elimina cabeceras Authorization
    """
    # Redactar datos del request
    request = event.get("request", {})
    if "data" in request and isinstance(request["data"], dict):
        request["data"] = {
            k: "[FILTERED]" if k in _SENSITIVE_KEYS else v
            for k, v in request["data"].items()
        }
    # Eliminar cabecera Authorization (contiene JWT)
    headers = request.get("headers", {})
    if "Authorization" in headers:
        headers["Authorization"] = "[FILTERED]"
    if "authorization" in headers:
        headers["authorization"] = "[FILTERED]"

    # Redactar IP — mantener solo primer octeto para geolocalización (RGPD Art. 4)
    if "user" in event and "ip_address" in event["user"]:
        ip = event["user"]["ip_address"]
        event["user"]["ip_address"] = ip.split(".")[0] + ".x.x.x" if "." in ip else "[FILTERED]"

    return event


# ── Sentry (opcional) ─────────────────────────────────────────────────────────
if settings.sentry_dsn:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            traces_sample_rate=0.2,
            integrations=[
                FastApiIntegration(transaction_style="endpoint"),
                SqlalchemyIntegration(),
            ],
            before_send=_sentry_before_send,  # Filtra PII — RGPD Art. 28
            send_default_pii=False,           # Nunca enviar PII por defecto
        )
        logger.info("Sentry inicializado con filtro PII activo.")
    except ImportError:
        logger.warning("sentry-sdk no está instalado. Monitorización desactivada.")

# ── Aplicación FastAPI ────────────────────────────────────────────────────────
app = FastAPI(
    title="HealthStack Pro API",
    description=(
        "Backend seguro para la plataforma de fitness HealthStack Pro. "
        "Implementa seudonimización AEPD/RGPD para datos de salud (Art. 9)."
    ),
    version="2.0.0",
    # Swagger y ReDoc solo disponibles en entorno de desarrollo
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
_DEV_ORIGINS = [
    "http://localhost:5173",   # Vite dev server
    "http://localhost:3000",   # Frontend dev
    "http://127.0.0.1:5173",
]

# En producción, ALLOWED_ORIGINS se lee del entorno para no hardcodear dominios en código.
# Formato: "https://healthstack.app,https://www.healthstack.app"
_PROD_ORIGINS_RAW = getattr(settings, "allowed_origins", "") or ""
_PROD_ORIGINS = [o.strip() for o in _PROD_ORIGINS_RAW.split(",") if o.strip()]

_ALLOWED_ORIGINS = _DEV_ORIGINS if settings.app_env == "development" else _PROD_ORIGINS

if settings.app_env != "development" and not _ALLOWED_ORIGINS:
    logger.warning(
        "CORS: ALLOWED_ORIGINS no configurado en producción. "
        "Todas las peticiones cross-origin serán bloqueadas. "
        "Configura la variable de entorno ALLOWED_ORIGINS."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# ── Security Headers Middleware ───────────────────────────────────────────────
# OWASP A05: Security Misconfiguration — headers defensivos en toda respuesta
@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # HSTS solo en producción (HTTPS obligatorio)
    if settings.app_env != "development":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    return response

# ── Rate limiting middleware + handler de 429 ─────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── Prometheus metrics ────────────────────────────────────────────────────────
try:
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator().instrument(app).expose(app, endpoint="/metrics")
    logger.info("Prometheus metrics expuestos en /metrics")
except ImportError:
    logger.warning("prometheus-fastapi-instrumentator no instalado. Métricas desactivadas.")


# ── Exception Handlers ────────────────────────────────────────────────────────
# Cada excepción de dominio se mapea a su código HTTP apropiado.
# Los routers no necesitan saber sobre HTTP — solo lanzan excepciones de dominio.

@app.exception_handler(UserAlreadyExistsError)
async def user_already_exists_handler(request: Request, exc: UserAlreadyExistsError):
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"detail": exc.message})


@app.exception_handler(UserNotFoundError)
async def user_not_found_handler(request: Request, exc: UserNotFoundError):
    # Respuesta genérica para evitar user enumeration
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": "Recurso no encontrado."},
    )


@app.exception_handler(InvalidCredentialsError)
async def invalid_credentials_handler(request: Request, exc: InvalidCredentialsError):
    # Mensaje genérico — no revelar si el email existe o la contraseña es incorrecta
    return JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"detail": "Credenciales incorrectas."},
        headers={"WWW-Authenticate": "Bearer"},
    )


@app.exception_handler(TokenExpiredError)
async def token_expired_handler(request: Request, exc: TokenExpiredError):
    return JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"detail": exc.message},
        headers={"WWW-Authenticate": "Bearer"},
    )


@app.exception_handler(TokenInvalidError)
async def token_invalid_handler(request: Request, exc: TokenInvalidError):
    return JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"detail": "Token inválido."},
        headers={"WWW-Authenticate": "Bearer"},
    )


@app.exception_handler(InsufficientPermissionsError)
async def insufficient_permissions_handler(request: Request, exc: InsufficientPermissionsError):
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={"detail": exc.message},
    )


@app.exception_handler(DecryptionIntegrityError)
async def decryption_integrity_handler(request: Request, exc: DecryptionIntegrityError):
    # No revelar detalles criptográficos al cliente
    logger.error("DecryptionIntegrityError detectado. Posible manipulación de datos.")
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={"detail": "No se pudo verificar la integridad de los datos. Contacte al soporte."},
    )


@app.exception_handler(HealthLinkNotFoundError)
async def health_link_not_found_handler(request: Request, exc: HealthLinkNotFoundError):
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": "Registro de salud no encontrado. El registro puede estar incompleto."},
    )


@app.exception_handler(MasterKeyNotConfiguredError)
async def master_key_handler(request: Request, exc: MasterKeyNotConfiguredError):
    # Error de configuración del servidor — nunca exponer detalles al cliente
    logger.critical("MASTER_KEY no configurada. La aplicación no puede operar.")
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": "El servicio no está disponible. Contacte al administrador."},
    )


@app.exception_handler(HealthRecordNotFoundError)
async def health_record_not_found_handler(request: Request, exc: HealthRecordNotFoundError):
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": exc.message},
    )


@app.exception_handler(DuplicateHealthRecordError)
async def duplicate_health_record_handler(request: Request, exc: DuplicateHealthRecordError):
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": exc.message},
    )


@app.exception_handler(ValidationError)
async def validation_error_handler(request: Request, exc: ValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.message},
    )


# ── Routers ───────────────────────────────────────────────────────────────────
from app.modules.community.router import router as community_router
from app.modules.gamification.router import router as gamification_router
from app.modules.health.router import router as health_router
from app.modules.identity.router import router as identity_router
from app.modules.nutrition.router import router as nutrition_router
from app.modules.routines.router import router as routines_router

app.include_router(
    identity_router,
    prefix="/api/v1/auth",
    tags=["Auth"],
)

app.include_router(
    health_router,
    prefix="/api/v1/health",
    tags=["Health"],
)

app.include_router(
    routines_router,
    prefix="/api/v1/routines",
    tags=["Routines"],
)

app.include_router(
    community_router,
    prefix="/api/v1/community",
    tags=["Community"],
)

app.include_router(
    gamification_router,
    prefix="/api/v1/gamification",
    tags=["Gamification"],
)

app.include_router(
    nutrition_router,
    prefix="/api/v1/nutrition",
    tags=["Nutrition"],
)


# ── Endpoints del sistema ─────────────────────────────────────────────────────

@app.get(
    "/health",
    tags=["System"],
    summary="Health check",
    description="Verifica que la API está activa. Usado por load balancers y monitorización.",
)
async def health_check():
    """
    Endpoint de health check — no requiere autenticación.
    Devuelve 200 si la API está operativa.
    """
    return {
        "status": "ok",
        "version": "2.0.0",
        "environment": settings.app_env,
    }


@app.get(
    "/",
    tags=["System"],
    summary="Bienvenida",
    description="Punto de entrada de la API. Devuelve información básica del servicio.",
)
async def root():
    return {
        "welcome": "Bienvenido a HealthStack Pro API",
        "version": "2.0.0",
        "description": (
            "Plataforma de salud personal con seguimiento biométrico, "
            "nutrición, rutinas de ejercicio y comunidad."
        ),
        "endpoints": {
            "health_check": "/health",
            "docs": "/docs" if settings.debug else "No disponible en producción",
            "redoc": "/redoc" if settings.debug else "No disponible en producción",
        },
        "modules": [
            "auth",
            "health",
            "nutrition",
            "routines",
            "community",
            "gamification",
        ],
        "environment": settings.app_env,
    }
