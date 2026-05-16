"""
app/services/ai_router/schemas.py
==================================
Tipos de datos compartidos por el router y todos los providers.

Diseñado para ser importado por cualquier capa del backend sin crear
dependencias circulares — NO importa nada del propio proyecto.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator


# ── Use cases ────────────────────────────────────────────────────────────────

class AIUseCase(str, Enum):
    """
    Identifica el contexto de cada llamada al router.
    El router usa este valor para seleccionar provider + modelo.
    """
    PUBLIC_CHAT         = "public_chat"          # Chat wizard público — sin PII directa
    REALTIME_COACH      = "realtime_coach"       # Coach de fuerza intra-sesión — latencia crítica
    INSIGHTS_NARRATIVE  = "insights_narrative"   # Narración de biomarcadores — envía datos de salud
    INJURY_RISK         = "injury_risk"          # Análisis de riesgo de lesión — envía rutinas
    WEEKLY_GOALS        = "weekly_goals"         # Micro-objetivos semanales — envía peso/XP
    FOOD_VISION         = "food_vision"          # Análisis de foto de comida — requiere visión (futuro)


# ── Request / Response ────────────────────────────────────────────────────────

class AIMessage(BaseModel):
    """Mensaje individual en una conversación multi-turno."""
    role: Literal["system", "user", "assistant"]
    content: str = Field(..., min_length=1)


class AIRequest(BaseModel):
    """
    Solicitud normalizada que cualquier provider sabe procesar.

    El router inyecta `model_override` desde la RoutingRule antes
    de pasar el request al provider — los llamadores normalmente
    no necesitan setearlo.
    """
    messages: list[AIMessage] = Field(..., min_length=1)
    max_tokens: int = Field(default=1024, ge=1, le=8192)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    timeout_s: float = Field(default=10.0, ge=0.5, le=120.0)
    response_format: Literal["text", "json_object"] = "text"
    # Sobreescribe el modelo que usará el provider para esta request.
    # Normalmente lo setea el router desde RoutingRule; los endpoints
    # no deberían necesitar setearlo directamente.
    model_override: str | None = None

    @model_validator(mode="after")
    def validate_has_user_message(self) -> AIRequest:
        """Al menos un mensaje debe ser de rol 'user'."""
        roles = {m.role for m in self.messages}
        if "user" not in roles:
            raise ValueError("AIRequest debe contener al menos un mensaje con role='user'")
        return self


class AIResponse(BaseModel):
    """
    Respuesta normalizada devuelta por cualquier provider.
    Incluye metadatos de trazabilidad para logging y observabilidad.
    """
    content: str
    provider_used: str           # "gemini" | "groq" | "cerebras"
    model_used: str              # modelo exacto que respondió
    latency_ms: int = Field(..., ge=0)
    tokens_used: int | None = None   # no todos los providers lo devuelven siempre
    finish_reason: str = "stop"
    fallback_triggered: bool = False


# ── Routing ───────────────────────────────────────────────────────────────────

class RoutingRule(BaseModel):
    """
    Define el provider primario y el fallback para un AIUseCase concreto.
    Almacenada en AIRouterSettings.routing.
    """
    primary: str             # nombre del provider: "gemini" | "groq" | "cerebras"
    primary_model: str       # modelo que usará el provider primario
    fallback: str | None = None        # None = sin fallback (endpoints que prefieren 503 limpio)
    fallback_model: str | None = None  # requerido si fallback no es None

    @model_validator(mode="after")
    def fallback_model_required_with_fallback(self) -> RoutingRule:
        if self.fallback is not None and self.fallback_model is None:
            raise ValueError("fallback_model es requerido cuando se define fallback")
        return self
