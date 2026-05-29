"""
app/modules/Routines/router.py
================================
Endpoints REST para el módulo de rutinas.

Prefijo: /api/v1/routines
Todos requieren autenticación.

Endpoints:
    GET    /              → Listar rutinas del usuario
    POST   /              → Guardar rutina
    DELETE /{id}          → Eliminar rutina
    POST   /ai-generate   → Generar rutina personalizada con IA (Groq)
"""


from fastapi import APIRouter, Depends, Query, Request, status

from app.core.security.dependencies import CurrentUser
from app.modules.routines.schemas import (
    AIRoutineRequest,
    AIRoutineResponse,
    RoutineCreate,
    RoutineListResponse,
    RoutineResponse,
)
from app.modules.routines.schemas import ChronicInjuryCreate, ChronicInjuryOut
from app.modules.routines.service import InjuryService, RoutineService, generate_ai_routine_injury_aware
from app.services.ai_router.dependencies import get_ai_router
from app.services.ai_router.router import AIRouter
from app.session import DBSession

router = APIRouter()


def _get_limiter():
    from app.main import limiter
    return limiter


@router.get(
    "/",
    response_model=RoutineListResponse,
    summary="Listar rutinas guardadas",
)
async def list_routines(
    db: DBSession,
    current_user: CurrentUser,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    return await RoutineService.list_routines(
        db=db,
        user_id=current_user["user_id"],
        limit=limit,
        offset=offset,
    )


@router.post(
    "/",
    response_model=RoutineResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Guardar rutina",
)
async def save_routine(
    body: RoutineCreate,
    db: DBSession,
    current_user: CurrentUser,
):
    return await RoutineService.save_routine(
        db=db,
        user_id=current_user["user_id"],
        data=body,
    )


@router.delete(
    "/{routine_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar rutina",
)
async def delete_routine(
    routine_id: str,
    db: DBSession,
    current_user: CurrentUser,
):
    await RoutineService.delete_routine(
        db=db,
        user_id=current_user["user_id"],
        routine_id=routine_id,
    )


@router.post(
    "/ai-generate",
    response_model=AIRoutineResponse,
    summary="Generar rutina personalizada con IA",
)
@_get_limiter().limit("5/minute")
async def ai_generate_routine(
    request: Request,
    body: AIRoutineRequest,
    current_user: CurrentUser,
):
    """
    Genera una rutina de entrenamiento personalizada usando Groq/Llama.
    No requiere DB. Requiere JWT.
    Con fallback graceful si la API key no está configurada.
    """
    return await RoutineService.generate_ai_routine(body)


@router.get(
    "/injuries",
    response_model=list[ChronicInjuryOut],
    summary="Listar lesiones crónicas activas",
)
async def list_injuries(
    db: DBSession,
    current_user: CurrentUser,
):
    return await InjuryService.list_injuries(db, current_user["user_id"])


@router.post(
    "/injuries",
    response_model=ChronicInjuryOut,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar lesión crónica",
)
async def create_injury(
    body: ChronicInjuryCreate,
    db: DBSession,
    current_user: CurrentUser,
):
    return await InjuryService.create_injury(db, current_user["user_id"], body)


@router.delete(
    "/injuries/{injury_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar lesión crónica (soft delete)",
)
async def delete_injury(
    injury_id: str,
    db: DBSession,
    current_user: CurrentUser,
):
    await InjuryService.delete_injury(db, current_user["user_id"], injury_id)


@router.post(
    "/ai-generate-injury-aware",
    response_model=AIRoutineResponse,
    summary="Generar rutina IA adaptada a lesiones crónicas",
)
@_get_limiter().limit("5/minute")
async def ai_generate_injury_aware(
    request: Request,
    body: AIRoutineRequest,
    db: DBSession,
    current_user: CurrentUser,
    ai_router: AIRouter = Depends(get_ai_router),
):
    """
    Genera una rutina personalizada respetando las lesiones crónicas del usuario.
    Si no hay lesiones, equivale a /ai-generate. Fallback graceful si la IA falla.
    """
    return await generate_ai_routine_injury_aware(
        request=body,
        db=db,
        user_id=current_user["user_id"],
        ai_router=ai_router,
    )
