"""
app/core/security/__init__.py
==============================
Exportaciones públicas del módulo de seguridad.
"""

from app.core.security.cryptoservice import CryptoService, get_crypto_service
from app.core.security.dependencies import CurrentUser, get_current_user, require_role
from app.core.security.hashing import hash_password, needs_rehash, verify_password
from app.core.security.jwt_handler import (
    create_access_token,
    create_refresh_token,
    decode_token,
    extract_user_id,
)

__all__ = [
    "CryptoService",
    "get_crypto_service",
    "CurrentUser",
    "get_current_user",
    "require_role",
    "hash_password",
    "verify_password",
    "needs_rehash",
    "create_access_token",
    "create_refresh_token",
    "decode_token",
    "extract_user_id",
]
