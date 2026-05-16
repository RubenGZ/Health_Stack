"""
app/services/ai_router/config.py
=================================
Configuración del AIRouter: keys de providers + mapping use_case → routing.

Se integra con el sistema de Settings existente del proyecto (pydantic-settings).
Las keys de Gemini y Cerebras son opcionales — el router degrada elegantemente
si no están configuradas, usando Groq como fallback universal.

Variables de entorno nuevas (añadir a .env.example):
  GEMINI_API_KEY=
  CEREBRAS_API_KEY=
  AI_ROUTER_FALLBACK_ENABLED=true
  AI_ROUTER_LOG_LEVEL=INFO

GROQ_API_KEY no es nueva — ya existe en el proyecto como GROK_API_KEY.
El config la lee con alias para mantener compatibilidad.
"""

from __future__ import annotations

import logging

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.services.ai_router.schemas import AIUseCase, RoutingRule

logger = logging.getLogger(__name__)


# ── Mapping por defecto ───────────────────────────────────────────────────────

_DEFAULT_ROUTING: dict[AIUseCase, RoutingRule] = {
    # Chat público: Groq llama-3.3 (mejor instruction-following para conversación)
    # → Gemini Flash como fallback
    # Nota: Gemini Flash ignoraba instrucciones de "una pregunta a la vez";
    # llama-3.3 sigue prompts conversacionales con mucha más fidelidad.
    AIUseCase.PUBLIC_CHAT: RoutingRule(
        primary="groq",
        primary_model="llama-3.3-70b-versatile",
        fallback="gemini",
        fallback_model="gemini-2.5-flash",
    ),
    # Coach tiempo real: Cerebras (~2000 tok/s, latencia mínima) → Groq fallback
    AIUseCase.REALTIME_COACH: RoutingRule(
        primary="cerebras",
        primary_model="llama-3.3-70b",
        fallback="groq",
        fallback_model="llama-3.3-70b-versatile",
    ),
    # Narración biomarcadores: Gemini Pro (razonamiento complejo) → Groq fallback
    # TODO: P0-RGPD — envía datos de peso/entrenamientos. Migrar a tier de pago
    # o Vertex AI antes de producción con usuarios reales.
    AIUseCase.INSIGHTS_NARRATIVE: RoutingRule(
        primary="gemini",
        primary_model="gemini-2.5-pro",
        fallback="groq",
        fallback_model="llama-3.3-70b-versatile",
    ),
    # Riesgo de lesión: Gemini Pro (análisis médico) → Groq fallback
    # TODO: P0-RGPD — envía nombres de ejercicios y frecuencia de entrenamiento.
    # Migrar a tier de pago antes de producción con usuarios reales.
    AIUseCase.INJURY_RISK: RoutingRule(
        primary="gemini",
        primary_model="gemini-2.5-pro",
        fallback="groq",
        fallback_model="llama-3.3-70b-versatile",
    ),
    # Objetivos semanales: Gemini Flash (respuesta estructurada JSON) → Groq fallback
    # TODO: P0-RGPD — envía nivel, XP y peso reciente del usuario.
    # Migrar a tier de pago antes de producción con usuarios reales.
    AIUseCase.WEEKLY_GOALS: RoutingRule(
        primary="gemini",
        primary_model="gemini-2.5-flash",
        fallback="groq",
        fallback_model="llama-3.3-70b-versatile",
    ),
    # Food vision: reservado para futura PR (requiere multimodal)
    AIUseCase.FOOD_VISION: RoutingRule(
        primary="gemini",
        primary_model="gemini-2.5-pro",
        fallback="groq",
        fallback_model="llama-3.3-70b-versatile",
    ),
}


# ── Settings ──────────────────────────────────────────────────────────────────

class AIRouterSettings(BaseSettings):
    """
    Configuración del AIRouter.

    Lee variables de entorno automáticamente vía pydantic-settings.
    Compatible con el .env del proyecto (mismo archivo).
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Groq: ya existe en el proyecto como GROK_API_KEY (alias para compatibilidad)
    grok_api_key: str = ""

    # Providers nuevos — opcionales, vacío = provider deshabilitado
    gemini_api_key: SecretStr | None = None
    cerebras_api_key: SecretStr | None = None

    # Comportamiento del router
    ai_router_fallback_enabled: bool = True
    ai_router_log_level: str = "INFO"

    # El routing se define en código (no sobreescribible por env en v1).
    # En v2 se puede añadir un JSON env var para sobreescribir reglas concretas.
    routing: dict[AIUseCase, RoutingRule] = _DEFAULT_ROUTING

    @model_validator(mode="after")
    def warn_on_missing_providers(self) -> AIRouterSettings:
        """
        Emite warnings al arrancar si hay use_cases cuyo provider primario
        no tiene API key configurada. El router los redirigirá al fallback
        en cada llamada, pero es mejor saberlo en arranque.
        """
        available = self._available_providers()
        warned: set[str] = set()

        for use_case, rule in self.routing.items():
            if rule.primary not in available and rule.primary not in warned:
                logger.warning(
                    "AIRouter: provider '%s' no tiene API key configurada. "
                    "Los use_cases que lo usan como primario (%s) caerán al fallback '%s'.",
                    rule.primary,
                    use_case.value,
                    rule.fallback,
                )
                warned.add(rule.primary)

        return self

    def _available_providers(self) -> set[str]:
        """Devuelve los nombres de providers con key configurada."""
        available: set[str] = set()
        if self.grok_api_key:
            available.add("groq")
        if self.gemini_api_key and self.gemini_api_key.get_secret_value():
            available.add("gemini")
        if self.cerebras_api_key and self.cerebras_api_key.get_secret_value():
            available.add("cerebras")
        return available

    def get_groq_key(self) -> str:
        """Devuelve la Groq API key (puede ser vacía)."""
        return self.grok_api_key

    def get_gemini_key(self) -> str:
        """Devuelve la Gemini API key o cadena vacía si no está configurada."""
        if self.gemini_api_key:
            return self.gemini_api_key.get_secret_value()
        return ""

    def get_cerebras_key(self) -> str:
        """Devuelve la Cerebras API key o cadena vacía si no está configurada."""
        if self.cerebras_api_key:
            return self.cerebras_api_key.get_secret_value()
        return ""
