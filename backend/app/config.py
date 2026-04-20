"""
app/core/config.py
==================
Configuración centralizada usando pydantic-settings.

Ventajas sobre os.environ directamente:
- Validación de tipos en arranque (falla rápido si falta una variable crítica)
- Autocompletado en IDE
- Valores por defecto seguros para desarrollo

NOTA DE SEGURIDAD: La clase Settings NO debe loguearse completa en ningún
momento — contiene secretos. El método safe_repr() es el único que se puede
usar para diagnóstico.
"""

from __future__ import annotations

import binascii
from functools import lru_cache

from pydantic import field_validator, PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Todas las variables de entorno de la aplicación con tipos y validaciones.
    Al instanciar esta clase, pydantic-settings lee automáticamente el .env.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        # extra="forbid" → falla si hay variables desconocidas en .env
        # Ayuda a detectar typos en nombres de variables
        extra="ignore",
    )

    # ── Aplicación ────────────────────────────────────────────
    app_env: str = "development"
    debug: bool = False

    # ── Base de datos ─────────────────────────────────────────
    database_url: str  # asyncpg URL para SQLAlchemy async
    database_sync_url: str  # psycopg2 URL para Alembic migrations

    # ── Llave Maestra de Cifrado (AEPD) ──────────────────────
    # Esta variable es el corazón de la seudonimización.
    # Debe ser exactamente 32 bytes (64 chars hex) para AES-256.
    health_link_master_key: str

    # ── JWT ───────────────────────────────────────────────────
    jwt_private_key_pem: str
    jwt_public_key_pem: str
    jwt_algorithm: str = "RS256"
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 7

    # ── Redis ─────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── Sentry ────────────────────────────────────────────────
    sentry_dsn: str = ""  # Vacío → Sentry desactivado

    # ── VALIDADORES ───────────────────────────────────────────

    @field_validator("health_link_master_key")
    @classmethod
    def validate_master_key(cls, v: str) -> str:
        """
        Validación crítica: la clave maestra DEBE ser exactamente 32 bytes (256 bits).
        AES-256 requiere claves de 32 bytes. Si la clave es más corta, el cifrado
        es más débil. Si falla aquí, la aplicación NO arranca.

        Norma: NIST SP 800-57 recomienda AES-256 para datos de salud a largo plazo.
        """
        try:
            key_bytes = binascii.unhexlify(v)
        except (ValueError, binascii.Error) as exc:
            raise ValueError(
                "HEALTH_LINK_MASTER_KEY debe ser una cadena hexadecimal válida. "
                "Generar con: python -c \"import secrets; print(secrets.token_hex(32))\""
            ) from exc

        if len(key_bytes) != 32:
            raise ValueError(
                f"HEALTH_LINK_MASTER_KEY debe tener exactamente 32 bytes (256 bits). "
                f"Longitud actual: {len(key_bytes)} bytes ({len(v)} chars hex). "
                f"AES-256 requiere exactamente 256 bits."
            )
        return v

    def get_master_key_bytes(self) -> bytes:
        """
        Devuelve la clave maestra como bytes.
        Método centralizado para acceder a los bytes — evita repetir unhexlify.
        """
        return binascii.unhexlify(self.health_link_master_key)

    def safe_repr(self) -> dict:
        """
        Representación segura para logs — nunca expone secretos.
        Usar SOLO para diagnóstico, nunca en respuestas HTTP.
        """
        return {
            "app_env": self.app_env,
            "debug": self.debug,
            "database_url": self.database_url.split("@")[-1] if "@" in self.database_url else "***",
            "health_link_master_key": f"***{self.health_link_master_key[-4:]}",  # solo últimos 4 chars
            "jwt_algorithm": self.jwt_algorithm,
            "sentry_enabled": bool(self.sentry_dsn),
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Singleton de configuración. lru_cache garantiza que solo se crea una instancia.
    FastAPI Depends(get_settings) lo reutiliza sin recarga.
    """
    return Settings()
