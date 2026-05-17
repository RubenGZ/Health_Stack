"""
app/core/security/google_oauth.py
===================================
Helpers para el flujo OAuth 2.0 con Google (Authorization Code Flow).

Flujo completo:
  1. GET /auth/google/redirect  → construye la URL de consentimiento de Google
  2. Google redirige al usuario a /auth/google/callback?code=xxx&state=xxx
  3. GET /auth/google/callback  → canjea el code por tokens, obtiene perfil del user

Referencias:
  - https://developers.google.com/identity/protocols/oauth2/web-server
  - https://developers.google.com/identity/openid-connect/openid-connect

NOTA DE SEGURIDAD:
  - El parámetro `state` previene ataques CSRF en el callback.
  - PKCE no implementado aquí (opcional para server-side flow).
  - httpx se usa en modo síncrono-compatible (awaitable) con async client.
"""

from __future__ import annotations

import secrets
from typing import Any
import urllib.parse

import httpx

from app.core.config import get_settings

# ── URLs de Google ─────────────────────────────────────────────────────────────

_AUTH_ENDPOINT  = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
_USERINFO_URL   = "https://www.googleapis.com/oauth2/v3/userinfo"

# Scopes mínimos necesarios: email + perfil básico
_SCOPES = "openid email profile"


# ── Construir URL de autorización ─────────────────────────────────────────────

def build_auth_url(state: str | None = None) -> tuple[str, str]:
    """
    Genera la URL a la que redirigir al usuario para el consentimiento de Google.

    Returns:
        (url, state) — la URL y el nonce CSRF usado (guárdalo en sesión/cookie).

    Raises:
        ValueError: Si GOOGLE_CLIENT_ID o GOOGLE_REDIRECT_URI no están configurados.
    """
    cfg = get_settings()
    if not cfg.google_client_id or not cfg.google_redirect_uri:
        raise ValueError(
            "GOOGLE_CLIENT_ID y GOOGLE_REDIRECT_URI deben estar configurados en .env"
        )

    if state is None:
        state = secrets.token_urlsafe(32)

    params = {
        "client_id":     cfg.google_client_id,
        "redirect_uri":  cfg.google_redirect_uri,
        "response_type": "code",
        "scope":         _SCOPES,
        "access_type":   "offline",   # solicita refresh_token de Google (opcional)
        "prompt":        "select_account",
        "state":         state,
    }
    url = _AUTH_ENDPOINT + "?" + urllib.parse.urlencode(params)
    return url, state


# ── Canjear el code por tokens ─────────────────────────────────────────────────

async def exchange_code_for_tokens(code: str) -> dict[str, Any]:
    """
    POST a Google para canjear el authorization code por access_token + id_token.

    Args:
        code: El código recibido en el callback de Google.

    Returns:
        Dict con access_token, id_token, token_type, etc.

    Raises:
        httpx.HTTPStatusError: Si Google devuelve un error.
        ValueError: Si la respuesta no contiene los campos esperados.
    """
    cfg = get_settings()
    payload = {
        "code":          code,
        "client_id":     cfg.google_client_id,
        "client_secret": cfg.google_client_secret,
        "redirect_uri":  cfg.google_redirect_uri,
        "grant_type":    "authorization_code",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(_TOKEN_ENDPOINT, data=payload)
        resp.raise_for_status()
        return resp.json()


# ── Obtener perfil del usuario ─────────────────────────────────────────────────

async def get_google_user_info(access_token: str) -> dict[str, Any]:
    """
    Llama a la API de Google para obtener el perfil del usuario autenticado.

    Args:
        access_token: El token de acceso de Google obtenido en el intercambio.

    Returns:
        Dict con sub (google_id), email, name, picture, email_verified, etc.

    Raises:
        httpx.HTTPStatusError: Si Google devuelve un error.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            _USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()


# ── Función de alto nivel ─────────────────────────────────────────────────────

async def get_user_from_google_code(code: str) -> dict[str, str]:
    """
    Flujo completo: code → perfil de usuario de Google.

    Returns:
        Dict con: email, display_name, google_id, picture (puede ser "").

    Raises:
        ValueError: Si el email no está verificado o no se puede obtener.
    """
    tokens    = await exchange_code_for_tokens(code)
    user_info = await get_google_user_info(tokens["access_token"])

    if not user_info.get("email_verified", False):
        raise ValueError("El email de Google no está verificado. Acceso denegado.")

    email = user_info.get("email", "")
    if not email:
        raise ValueError("Google no devolvió un email válido.")

    return {
        "email":        email,
        "display_name": user_info.get("name", ""),
        "google_id":    user_info.get("sub", ""),
        "picture":      user_info.get("picture", ""),
    }
