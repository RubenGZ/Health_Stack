"""
app/modules/identity/schemas.py
================================
Schemas Pydantic v2 para el módulo de identidad.

Separación de responsabilidades:
- *Request schemas: validan datos de entrada (POST/PUT bodies)
- *Response schemas: definen qué datos se exponen al cliente
- *Internal schemas: usados entre capas del backend (nunca salen al cliente)

SEGURIDAD: Los schemas de respuesta NUNCA incluyen password_hash,
health_subject_id, health_uuid_enc ni datos de la tabla data_links.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


# ── REQUEST SCHEMAS ────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    """Body del endpoint POST /auth/register."""

    email: EmailStr = Field(
        ...,
        description="Email del usuario. Debe ser único en el sistema.",
        examples=["usuario@ejemplo.es"],
    )

    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Contraseña en texto plano. Se hashea con Argon2id antes de persistir.",
    )

    display_name: str | None = Field(
        default=None,
        max_length=100,
        description="Nombre visible opcional.",
    )

    consent_gdpr: bool = Field(
        ...,
        description=(
            "Consentimiento explícito para tratamiento de datos de salud. "
            "Art. 7 RGPD: debe ser activo (no pre-marcado) y específico. "
            "Si es False, el registro es rechazado."
        ),
    )

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        """
        Validación básica de complejidad.
        En producción, considerar zxcvbn para evaluación de entropía real.
        """
        if len(v) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres.")
        if v.isdigit():
            raise ValueError("La contraseña no puede ser solo números.")
        if v.lower() == v:
            raise ValueError("La contraseña debe incluir al menos una mayúscula.")
        return v

    @field_validator("consent_gdpr")
    @classmethod
    def consent_must_be_true(cls, v: bool) -> bool:
        """
        El consentimiento RGPD es obligatorio para crear la cuenta.
        Sin consentimiento no podemos almacenar datos de salud (Art. 9 RGPD).
        """
        if not v:
            raise ValueError(
                "El consentimiento para el tratamiento de datos de salud es "
                "obligatorio para registrarse. Art. 7 RGPD."
            )
        return v


class LoginRequest(BaseModel):
    """Body del endpoint POST /auth/login."""

    email: EmailStr
    password: str = Field(..., min_length=1)


# ── RESPONSE SCHEMAS ────────────────────────────────────────────────────────────

class UserPublicResponse(BaseModel):
    """
    Datos del usuario expuestos al cliente.

    EXCLUYE: password_hash, health_subject_id, cualquier dato de salud.
    Solo se expone lo necesario para la UI.
    """

    id: UUID
    email: str
    display_name: str | None
    role: str
    consent_gdpr: bool
    consent_date: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}  # Permite crear desde ORM models


class RegisterResponse(BaseModel):
    """Respuesta del endpoint POST /auth/register."""

    user: UserPublicResponse
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    message: str = "Registro completado. Llave de cruce de salud generada y cifrada."


class LoginResponse(BaseModel):
    """Respuesta del endpoint POST /auth/login."""

    user: UserPublicResponse
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
