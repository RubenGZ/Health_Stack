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

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
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
        Validación de complejidad OWASP — mínimo aceptable para datos de salud.
        Requisitos: 8+ chars, 1 mayúscula, 1 minúscula, 1 número, 1 especial.
        """
        errors = []
        if len(v) < 8:
            errors.append("al menos 8 caracteres")
        if not any(c.isupper() for c in v):
            errors.append("al menos una mayúscula (A-Z)")
        if not any(c.islower() for c in v):
            errors.append("al menos una minúscula (a-z)")
        if not any(c.isdigit() for c in v):
            errors.append("al menos un número (0-9)")
        if not any(c in r"!@#$%^&*()_+-=[]{}|;':\",./<>?" for c in v):
            errors.append("al menos un carácter especial (!@#$%...)")
        if errors:
            raise ValueError(
                "La contraseña no cumple los requisitos de seguridad: "
                + ", ".join(errors) + "."
            )
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


class RefreshRequest(BaseModel):
    """Body del endpoint POST /auth/refresh."""

    refresh_token: str = Field(
        ...,
        min_length=10,
        description="JWT refresh token emitido en login o register.",
    )


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
    plan: str = "free"
    is_active: bool = True
    consent_gdpr: bool
    consent_date: datetime | None
    last_login_at: datetime | None = None
    created_at: datetime
    onboarding_completed: bool = False
    onboarding_v2_completed: bool = False   # True cuando completó el wizard v2 inteligente
    ai_consent_at: datetime | None = None   # Timestamp consentimiento Art.9 IA. Null = sin consentimiento.

    model_config = {"from_attributes": True}  # Permite crear desde ORM models


class UpdateMeRequest(BaseModel):
    """Body para PATCH /auth/me."""

    display_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=60,
        description="Nombre visible del usuario. None = no cambiar.",
    )

    @field_validator("display_name", mode="before")
    @classmethod
    def strip_name(cls, v: str | None) -> str | None:
        return v.strip() if isinstance(v, str) else v


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


# ── PASSWORD RESET SCHEMAS ─────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    """Body del endpoint POST /auth/forgot-password."""

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Body del endpoint POST /auth/reset-password."""

    token: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        """Misma validación de complejidad que RegisterRequest.password_strength."""
        errors = []
        if not any(c.isupper() for c in v):
            errors.append("al menos una mayúscula")
        if not any(c.islower() for c in v):
            errors.append("al menos una minúscula")
        if not any(c.isdigit() for c in v):
            errors.append("al menos un número")
        if not any(c in r"!@#$%^&*()_+-=[]{}|;':\",./<>?" for c in v):
            errors.append("al menos un carácter especial")
        if errors:
            raise ValueError(
                "La contraseña no cumple los requisitos: " + ", ".join(errors)
            )
        return v


class ForgotPasswordResponse(BaseModel):
    """Respuesta del endpoint POST /auth/forgot-password."""

    message: str


class ResetPasswordResponse(BaseModel):
    """Respuesta del endpoint POST /auth/reset-password."""

    message: str


# ── ONBOARDING SCHEMAS ─────────────────────────────────────────────────────────

class OnboardingRequest(BaseModel):
    """Body del endpoint POST /auth/onboarding."""

    biological_sex: Literal["male", "female"] = Field(
        ...,
        description="Sexo biológico del usuario.",
    )
    birth_date: date = Field(
        ...,
        description="Fecha de nacimiento (YYYY-MM-DD).",
    )
    current_weight_kg: Decimal = Field(
        ...,
        gt=20,
        lt=500,
        description="Peso actual en kg.",
    )
    height_cm: Decimal = Field(
        ...,
        gt=50,
        lt=300,
        description="Altura en cm.",
    )
    activity_level: Literal[
        "sedentary", "lightly_active", "moderately_active", "very_active"
    ] = Field(
        ...,
        description="Nivel de actividad física semanal.",
    )
    primary_fitness_goal: Literal[
        "lose_fat", "maintain", "gain_muscle", "increase_strength"
    ] = Field(
        ...,
        description="Objetivo principal de fitness.",
    )

    @field_validator("birth_date")
    @classmethod
    def birth_date_reasonable(cls, v: date) -> date:
        from datetime import date as date_type
        today = date_type.today()
        age = today.year - v.year - ((today.month, today.day) < (v.month, v.day))
        if age < 13:
            raise ValueError("Debes tener al menos 13 años para usar la aplicación.")
        if age > 120:
            raise ValueError("Fecha de nacimiento no válida.")
        return v


class OnboardingResponse(BaseModel):
    """Respuesta del endpoint POST /auth/onboarding."""

    message: str = "Perfil de onboarding guardado correctamente."
    onboarding_completed: bool = True
    health_record_seeded: bool = Field(
        description="True si se creó el registro baseline en health_records.",
    )


# ── Smart Onboarding v2 ───────────────────────────────────────────────────────

class SportActivityItem(BaseModel):
    """Un deporte dentro de la lista de actividades del usuario."""
    sport: str = Field(..., max_length=64)
    days_per_week: int = Field(..., ge=1, le=7)
    duration_min: int = Field(..., ge=5, le=300)
    intensity: Literal["low", "moderate", "high"]


class OnboardingV2In(BaseModel):
    """Body del endpoint POST /auth/onboarding-v2."""

    # Objetivo fitness (capturado en paso 0 del wizard v2)
    primary_fitness_goal: Literal[
        "lose_fat", "maintain", "gain_muscle", "increase_strength"
    ] | None = Field(
        default=None,
        description="Objetivo principal del usuario. Si se envía, se actualiza en public.users.",
    )

    # Consentimiento RGPD Art.9
    ai_consent: bool = Field(
        ...,
        description=(
            "Consentimiento explícito Art.9 para procesar datos de composición corporal "
            "con IA. Sin consentimiento se usa fórmula local (Mifflin)."
        ),
    )

    # NEAT — Tipo de trabajo y pasos
    work_type: Literal["desk", "standing", "physical", "remote", "none"] = Field(
        ..., description="Tipo de trabajo principal."
    )
    daily_steps_range: Literal["lt4k", "4k7k", "7k10k", "gt10k"] = Field(
        ..., description="Rango de pasos diarios habituales."
    )

    # Deportes
    sport_activities: list[SportActivityItem] = Field(
        default_factory=list,
        max_length=6,
        description="Lista de deportes practicados (max 6).",
    )

    # Historial de fuerza
    strength_experience: Literal["never", "lt6m", "6m2y", "gt2y"] = Field(
        ..., description="Años de experiencia en entrenamiento de fuerza."
    )
    strength_consistency: Literal["regular", "inconsistent", "starting"] = Field(
        ..., description="Consistencia en el entrenamiento de fuerza."
    )

    # Composición corporal (opcional)
    body_fat_pct: Decimal | None = Field(
        default=None, ge=3, le=60,
        description="% grasa corporal exacto (opcional). Permite Katch-McArdle.",
    )
    body_fat_visual: Literal["lean_soft", "belly_main", "uniform", "high_volume"] | None = Field(
        default=None,
        description="Estimación visual de composición corporal (si no hay % exacto).",
    )

    # Alimentación
    eating_style: Literal["omnivore", "vegetarian", "vegan"] = Field(
        ..., description="Estilo de alimentación principal."
    )
    food_intolerances: list[Literal["gluten", "lactose"]] = Field(
        default_factory=list,
        description="Intolerancias alimentarias.",
    )

    @field_validator("sport_activities")
    @classmethod
    def max_6_activities(cls, v: list) -> list:
        if len(v) > 6:
            raise ValueError("Máximo 6 actividades deportivas.")
        return v


class OnboardingV2Macros(BaseModel):
    protein_g: int
    carbs_g: int
    fat_g: int


class OnboardingV2Result(BaseModel):
    """Resultado del análisis metabólico — devuelto al frontend tras POST /onboarding-v2."""

    tdee_kcal: int
    target_kcal: int
    formula_used: str = Field(description="groq_katch_mcardle | groq_mifflin | mifflin_fallback")
    confidence: Literal["high", "medium", "low"]
    confidence_reason: str | None = None

    estimated_body_fat_pct: Decimal | None = None
    lean_mass_kg: Decimal | None = None

    macros: OnboardingV2Macros
    protein_sources: list[str] = Field(default_factory=list)
    carb_sources: list[str] = Field(default_factory=list)

    neat_assessment: str | None = None
    recomp_potential: str | None = None

    diagnosis: str = Field(description="Párrafo narrativo del análisis metabólico.")
    action_steps: list[str] = Field(
        default_factory=list,
        description="Hasta 3 acciones priorizadas.",
    )
    diet_alert: str | None = Field(
        default=None,
        description="Alerta dietética específica (p.ej. déficit proteico).",
    )

    onboarding_v2_completed: bool = True
    ai_used: bool = Field(description="True si el resultado viene de Groq, False si es fallback.")
