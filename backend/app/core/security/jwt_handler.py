"""
app/core/security/jwt_handler.py
=================================
Gestión de JWT con RS256 (clave asimétrica).

Por qué RS256 sobre HS256:
- RS256: clave privada firma, clave pública verifica.
  Permite que otros servicios (microservicios futuros) verifiquen tokens
  sin necesitar la clave privada → menor superficie de ataque.
- HS256: la misma clave firma y verifica → todos los servicios tienen la clave
  secreta → si uno se compromete, todos los tokens son falsificables.

Tipos de token:
- Access token: vida corta (15 min), contiene claims del usuario
- Refresh token: vida larga (7 días), almacenado en HttpOnly cookie
  La rotación del refresh token se implementa en el servicio de identidad.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
import uuid

from jose import ExpiredSignatureError, JWTError, jwt

from app.core.config import get_settings
from app.shared.exceptions import TokenExpiredError, TokenInvalidError

_settings = get_settings()


def _utc_now() -> datetime:
    """Retorna el timestamp UTC actual. Centralizado para facilitar mocking en tests."""
    return datetime.now(UTC)


def create_access_token(
    user_id: str,
    email: str,
    role: str,
) -> str:
    """
    Crea un JWT access token firmado con RS256.

    Claims incluidos:
    - sub: user_id (sujeto estándar JWT — RFC 7519)
    - email: para display en frontend (no usar para autorización)
    - role: para control de acceso basado en roles
    - iat, exp: timestamps estándar
    - jti: JWT ID único → permite invalidación individual si es necesario
    - iss, aud: issuer/audience → previene reutilización de tokens entre servicios

    NOTA: Los tokens JWT NO contienen datos de salud. Solo identidad y permisos.
    """
    now = _utc_now()
    payload: dict[str, Any] = {
        "sub":   user_id,
        "email": email,
        "role":  role,
        "iat":   now,
        "exp":   now + timedelta(minutes=_settings.jwt_access_token_expire_minutes),
        "jti":   str(uuid.uuid4()),  # ID único por token
        "iss":   "healthstack.api",
        "aud":   "healthstack.web",
        "type":  "access",
    }
    return jwt.encode(
        payload,
        _settings.jwt_private_key_pem,
        algorithm=_settings.jwt_algorithm,
    )


def create_refresh_token(user_id: str) -> str:
    """
    Crea un JWT refresh token de larga duración.
    El refresh token solo contiene user_id y jti para minimizar el payload.
    """
    now = _utc_now()
    payload: dict[str, Any] = {
        "sub":  user_id,
        "iat":  now,
        "exp":  now + timedelta(days=_settings.jwt_refresh_token_expire_days),
        "jti":  str(uuid.uuid4()),
        "iss":  "healthstack.api",
        "aud":  "healthstack.web",
        "type": "refresh",
    }
    return jwt.encode(
        payload,
        _settings.jwt_private_key_pem,
        algorithm=_settings.jwt_algorithm,
    )


def decode_token(token: str) -> dict[str, Any]:
    """
    Decodifica y valida un JWT.

    Raises:
        TokenExpiredError: El token ha expirado.
        TokenInvalidError: El token es inválido (firma, estructura, audience).

    La separación entre TokenExpiredError y TokenInvalidError permite al frontend
    diferenciar entre "renovar token" (expirado) y "hacer login" (inválido).
    """
    try:
        return jwt.decode(
            token,
            _settings.jwt_public_key_pem,
            algorithms=[_settings.jwt_algorithm],
            audience="healthstack.web",
        )
    except ExpiredSignatureError as exc:
        raise TokenExpiredError("El token de acceso ha expirado. Renuévalo.") from exc
    except JWTError as exc:
        raise TokenInvalidError("Token inválido o con firma incorrecta.") from exc


def extract_user_id(token: str) -> str:
    """Shortcut para extraer solo el user_id del token."""
    payload = decode_token(token)
    return payload["sub"]
