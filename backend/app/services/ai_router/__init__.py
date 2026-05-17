"""
app/services/ai_router
=======================
Capa de abstracción multi-provider para llamadas a modelos de lenguaje.

Importaciones públicas del módulo — los endpoints solo necesitan esto:

    from app.services.ai_router import AIRouter, AIUseCase, AIRequest

El router se inicializa una vez en el lifespan de FastAPI y se inyecta
como dependencia (ver main.py — Bloque D).
"""

from app.services.ai_router.base import (
    AIInvalidRequestError,
    AIProvider,
    AIProviderError,
    AIRateLimitError,
    AITimeoutError,
)
from app.services.ai_router.config import AIRouterSettings
from app.services.ai_router.router import AIRouter
from app.services.ai_router.schemas import (
    AIMessage,
    AIRequest,
    AIResponse,
    AIUseCase,
    RoutingRule,
)

__all__ = [
    # Schemas
    "AIUseCase",
    "AIMessage",
    "AIRequest",
    "AIResponse",
    "RoutingRule",
    # Base / excepciones
    "AIProvider",
    "AIProviderError",
    "AITimeoutError",
    "AIRateLimitError",
    "AIInvalidRequestError",
    # Config
    "AIRouterSettings",
    # Router (disponible desde Bloque C)
    "AIRouter",
]
