"""
app/shared/exceptions.py
========================
Excepciones personalizadas de HealthStack Pro.

Filosofía: cada dominio tiene sus propias excepciones tipadas.
Los handlers globales en main.py las convierten en respuestas HTTP
con el código de estado correcto, manteniendo los routers limpios.
"""

from __future__ import annotations

# ── BASE ──────────────────────────────────────────────────────────────────────

class HealthStackError(Exception):
    """Excepción raíz. Todas las excepciones del dominio la heredan."""
    message: str

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


# ── CRIPTOGRAFÍA / SEUDONIMIZACIÓN ────────────────────────────────────────────

class CryptoError(HealthStackError):
    """
    Fallo genérico en el CryptoService.
    Nunca exponer detalles internos al cliente — solo loguear en backend.
    Relevancia AEPD: un fallo cripto indica posible manipulación de datos
    de salud. Debe alertar al equipo de seguridad (Sentry/PagerDuty).
    """


class DecryptionIntegrityError(CryptoError):
    """
    AES-GCM devolvió InvalidTag: el ciphertext o el IV fueron manipulados.
    Esto puede indicar un intento de ataque o corrupción de datos.
    Respuesta HTTP apropiada: 403 Forbidden (no 500 — no es un error del servidor).

    Art. 32 RGPD: obliga a detectar y notificar brechas de integridad.
    """


class MasterKeyNotConfiguredError(CryptoError):
    """
    La variable HEALTH_LINK_MASTER_KEY no está en el entorno.
    Fallo fatal en arranque — la aplicación no debe inicializarse sin ella.
    """


class HealthLinkNotFoundError(CryptoError):
    """
    El usuario no tiene una llave de cruce en la tabla DataLink.
    Puede ocurrir si el registro se interrumpió antes de crearla.
    """


# ── IDENTIDAD / AUTENTICACIÓN ─────────────────────────────────────────────────

class UserAlreadyExistsError(HealthStackError):
    """Email ya registrado. HTTP 409 Conflict."""


class UserNotFoundError(HealthStackError):
    """Usuario no encontrado. HTTP 404. Usar con cuidado: no revelar si el email existe."""


class InvalidCredentialsError(HealthStackError):
    """
    Credenciales incorrectas. HTTP 401.
    Importante: SIEMPRE devolver el mismo mensaje genérico para email
    y contraseña incorrectos — evitar user enumeration attacks.
    """


class TokenExpiredError(HealthStackError):
    """JWT expirado. HTTP 401."""


class TokenInvalidError(HealthStackError):
    """JWT malformado o con firma inválida. HTTP 401."""


class InsufficientPermissionsError(HealthStackError):
    """El usuario no tiene el rol requerido para esta operación. HTTP 403."""


# ── DATOS DE SALUD ────────────────────────────────────────────────────────────

class HealthRecordNotFoundError(HealthStackError):
    """No existe registro biométrico para la fecha solicitada. HTTP 404."""


class DuplicateHealthRecordError(HealthStackError):
    """Ya existe un registro biométrico para esa fecha. HTTP 409."""


# ── VALIDACIÓN ────────────────────────────────────────────────────────────────

class ValidationError(HealthStackError):
    """Error de validación de negocio (distinto de los errores de Pydantic). HTTP 422."""
