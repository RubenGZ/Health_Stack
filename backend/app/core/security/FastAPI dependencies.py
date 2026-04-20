"""
app/core/security/dependencies.py
===================================
Dependencias de FastAPI para autenticación y autorización.

Estas funciones se usan con Depends() en los routers para proteger endpoints.
FastAPI las ejecuta automáticamente antes del handler del endpoint.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security.jwt_handler import decode_token
from app.shared.exceptions import TokenExpiredError, TokenInvalidError

# Esquema Bearer — FastAPI extrae el token del header "Authorization: Bearer <token>"
# auto_error=False → devolvemos un 401 personalizado en lugar del default
_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> dict:
    """
    Extrae y valida el usuario del JWT Bearer token.

    Returns:
        Dict con user_id, email y role del payload JWT.

    Raises:
        HTTPException 401: Token ausente, expirado o inválido.

    Uso en routers:
        @router.get("/protected")
        async def protected(user: CurrentUser):
            return {"user_id": user["user_id"]}
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticación requerido.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_token(credentials.credentials)
    except TokenExpiredError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="El token ha expirado. Inicia sesión de nuevo.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except TokenInvalidError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verificar que sea un access token (no un refresh token)
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tipo de token incorrecto. Se requiere un access token.",
        )

    return {
        "user_id": payload["sub"],
        "email":   payload.get("email", ""),
        "role":    payload.get("role", "user"),
        "jti":     payload.get("jti", ""),
    }


def require_role(required_role: str):
    """
    Factory de dependencias para control de acceso por rol.

    Uso:
        @router.delete("/admin/users/{id}")
        async def delete_user(user: CurrentUser = Depends(require_role("admin"))):
    """
    async def role_checker(
        current_user: dict = Depends(get_current_user),
    ) -> dict:
        if current_user["role"] != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Se requiere rol '{required_role}' para esta operación.",
            )
        return current_user
    return role_checker


# Tipo anotado para usar en firmas de funciones
CurrentUser = Annotated[dict, Depends(get_current_user)]
