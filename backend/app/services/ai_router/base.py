"""
app/services/ai_router/base.py
================================
Interface abstracta que deben implementar todos los providers de IA.

Los providers concretos (groq.py, gemini.py, cerebras.py) heredan de AIProvider
y garantizan que el router puede intercambiarlos sin tocar código de endpoints.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from app.services.ai_router.schemas import AIRequest, AIResponse

# ── Excepciones ───────────────────────────────────────────────────────────────

class AIProviderError(Exception):
    """
    Error genérico de un provider.
    El router lo captura para decidir si lanzar fallback.
    """
    def __init__(
        self,
        provider: str,
        reason: str,
        original: Exception | None = None,
    ) -> None:
        self.provider = provider
        self.reason = reason
        self.original = original
        super().__init__(f"[{provider}] {reason}")


class AITimeoutError(AIProviderError):
    """
    El provider no respondió dentro del timeout.
    Siempre lanza fallback — el request podría haber llegado al provider.
    """


class AIRateLimitError(AIProviderError):
    """
    El provider devolvió 429 Too Many Requests.
    Lanza fallback — el request es válido, el provider simplemente está saturado.
    """


class AIInvalidRequestError(AIProviderError):
    """
    El provider devolvió 4xx ≠ 429 (request malformado, contexto demasiado largo…).
    NO lanza fallback — si el request es inválido para el primario, lo será
    también para el fallback y sería un bug nuestro.
    """


# ── Interface ─────────────────────────────────────────────────────────────────

class AIProvider(ABC):
    """
    Interface que todos los providers deben implementar.

    Contrato:
    - `complete()` es async y puede lanzar AIProviderError (o subclases).
    - `health_check()` devuelve True si el provider está accesible ahora mismo.
    - `supports_vision` indica si el provider acepta imágenes en el contenido.

    El router solo llama a `complete()` y captura las excepciones tipadas.
    Nunca llama directamente a la API de ningún proveedor.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Identificador corto del provider: "groq", "gemini", "cerebras"."""
        ...

    @property
    @abstractmethod
    def supports_vision(self) -> bool:
        """True si el provider acepta imágenes en los mensajes (multimodal)."""
        ...

    @abstractmethod
    async def complete(self, request: AIRequest) -> AIResponse:
        """
        Ejecuta la llamada al provider y devuelve una AIResponse normalizada.

        Debe lanzar:
        - AITimeoutError si supera request.timeout_s
        - AIRateLimitError si el provider devuelve 429
        - AIInvalidRequestError si el provider devuelve 4xx ≠ 429
        - AIProviderError para cualquier otro error (5xx, red, etc.)
        """
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """
        Comprobación ligera de disponibilidad.
        Devuelve True si el provider responde, False en cualquier error.
        No lanza excepciones.
        """
        ...
