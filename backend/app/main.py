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
import os

from fastapi import Depends, FastAPI, Request, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
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
# Usa Redis cuando la URL no apunta a localhost (entorno de producción).
# En Pi/dev el redis_url es redis://localhost:... → cae en memoria local.
_redis_url = settings.redis_url
_rate_limit_storage = (
    _redis_url
    if _redis_url and "localhost" not in _redis_url and "127.0.0.1" not in _redis_url
    else None
)
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200/minute"],
    storage_uri=_rate_limit_storage,
)

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
# En desarrollo/staging permitimos cualquier origen (incluye Cloudflare tunnels,
# IPs de LAN, etc.).  En producción solo los dominios explícitos en ALLOWED_ORIGINS.
_PROD_ORIGINS_RAW = getattr(settings, "allowed_origins", "") or ""
_PROD_ORIGINS = [o.strip() for o in _PROD_ORIGINS_RAW.split(",") if o.strip()]

# Usamos allow_origin_regex cuando no hay lista explícita de orígenes.
# Esto cubre: desarrollo local, Cloudflare Quick Tunnel (URL cambia en cada restart),
# y cualquier staging sin dominio fijo.
# La seguridad real viene de JWT en cada endpoint, no de CORS.
# Cuando ALLOWED_ORIGINS esté configurado en producción (dominio propio),
# se restringe a esos orígenes.
if _PROD_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_PROD_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
    )
else:
    if settings.app_env == "production":
        logger.info(
            "CORS: ALLOWED_ORIGINS no configurado — permitiendo cualquier origen. "
            "Configura ALLOWED_ORIGINS en .env para restringir en producción."
        )
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r".*",
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
from app.modules.admin.router import router as admin_router
from app.modules.integrations.router import router as integrations_router
from app.modules.ai_coach.router import router as ai_coach_router
from app.modules.ai_insights.router import router as ai_insights_router
from app.modules.chat.router import router as chat_router
from app.modules.community.router import router as community_router
from app.modules.geopricing.router import router as geopricing_router
from app.modules.gamification.router import router as gamification_router
from app.modules.health.router import router as health_router
from app.modules.identity.router import router as identity_router
from app.modules.nutrition.router import router as nutrition_router
from app.modules.routines.router import router as routines_router
from app.modules.telemetry.router import router as telemetry_router
from app.modules.workout_sessions.router import router as workout_router
from app.modules.ranked.router import router as ranked_router
from app.modules.gym_servers.router import router as gym_router

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

app.include_router(
    geopricing_router,
    prefix="/api",
    tags=["Geo-Pricing"],
)

app.include_router(
    admin_router,
    prefix="/api/v1/admin",
    tags=["Admin"],
)

app.include_router(
    telemetry_router,
    prefix="/api/v1/telemetry",
    tags=["Telemetry"],
)

app.include_router(
    chat_router,
    prefix="/api/v1/chat",
    tags=["AI Chat"],
)

app.include_router(
    ai_coach_router,
    prefix="/api/v1/ai-coach",
    tags=["AI Coach"],
)

app.include_router(
    ai_insights_router,
    prefix="/api/v1/ai-insights",
    tags=["AI Insights"],
)

app.include_router(
    integrations_router,
    prefix="/api/v1/integrations",
    tags=["Integrations"],
)

app.include_router(
    workout_router,
    prefix="/api/v1/workout",
    tags=["Workout Sessions"],
)

app.include_router(
    ranked_router,
    prefix="/api/v1/ranked",
    tags=["Ranked System"],
)

app.include_router(
    gym_router,
    prefix="/api/v1/gym-servers",
    tags=["Gym Servers"],
)


# ── Scheduler lifecycle ───────────────────────────────────────────────────────
from app.core.scheduler import start_scheduler, stop_scheduler

@app.on_event("startup")
async def startup_checks() -> None:
    if settings.app_env == "production":
        origins_raw = getattr(settings, "allowed_origins", "") or ""
        if not origins_raw.strip():
            logger.critical(
                "PRODUCCIÓN SIN ALLOWED_ORIGINS: CORS permite cualquier origen. "
                "Configura ALLOWED_ORIGINS en .env antes de servir tráfico real."
            )
    start_scheduler()

@app.on_event("shutdown")
async def shutdown_scheduler() -> None:
    stop_scheduler()


# ── Endpoints del sistema ─────────────────────────────────────────────────────

from app.session import get_db  # noqa: E402 — after app creation to avoid circular import


@app.get(
    "/health",
    tags=["System"],
    summary="Health check",
    description="Verifica que la API está activa y la BD responde. Usado por Docker healthcheck y load balancers.",
)
async def health_check(db: AsyncSession = Depends(get_db)):
    """
    Devuelve 200 solo si la API está operativa Y la base de datos responde.
    Un fallo de BD devuelve 503 para que el Docker healthcheck falle y
    nginx no enrute tráfico a un backend sin acceso a datos.
    """
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        logger.error("[health] DB check failed: %s", exc)
        return JSONResponse(
            status_code=503,
            content={"status": "error", "detail": "Database unavailable"},
        )
    return {
        "status": "ok",
        "version": "2.0.0",
        "environment": settings.app_env,
    }


# ── Frontend SPA (StaticFiles) ────────────────────────────────────────────────
# Montado DESPUÉS de todos los routers: FastAPI evalúa las rutas del router
# primero, por lo que /api/v1/*, /health, /docs, etc. se resuelven antes
# de que StaticFiles entre en juego.  html=True activa el fallback SPA:
# cualquier path desconocido devuelve index.html (necesario para client-side routing).
_FRONTEND_DIR = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "frontend")
)
if os.path.isdir(_FRONTEND_DIR):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=_FRONTEND_DIR, html=True), name="frontend")
    logger.info("Frontend SPA montado desde %s", _FRONTEND_DIR)
else:
    logger.warning("Directorio frontend no encontrado en %s — solo API activa.", _FRONTEND_DIR)
