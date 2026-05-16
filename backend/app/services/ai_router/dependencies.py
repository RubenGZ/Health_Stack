"""
app/services/ai_router/dependencies.py
=========================================
FastAPI dependency para inyectar el AIRouter en los endpoints.

El router se inicializa UNA SOLA VEZ en el startup de la app (main.py)
y se almacena en app.state.ai_router. Esta función lo extrae de ahí.

Uso en un endpoint:
    from app.services.ai_router.dependencies import get_ai_router
    from app.services.ai_router import AIRouter

    @router.post("/message")
    async def my_endpoint(
        ai_router: AIRouter = Depends(get_ai_router),
    ):
        resp = await ai_router.call(AIUseCase.PUBLIC_CHAT, request)
"""

from __future__ import annotations

from fastapi import Request

from app.services.ai_router.router import AIRouter


def get_ai_router(request: Request) -> AIRouter:
    """
    Extrae el AIRouter singleton de app.state.
    Falla con AttributeError claro si startup no lo inicializó.
    """
    router: AIRouter | None = getattr(request.app.state, "ai_router", None)
    if router is None:
        raise RuntimeError(
            "AIRouter no inicializado. "
            "Asegúrate de que startup_checks() en main.py crea app.state.ai_router."
        )
    return router
