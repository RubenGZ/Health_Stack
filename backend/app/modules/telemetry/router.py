from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security.jwt_handler import decode_token
from app.modules.telemetry.schemas import PageViewCreate, PageViewResponse
from app.modules.telemetry.service import TelemetryService
from app.session import DBSession
from app.shared.exceptions import TokenExpiredError, TokenInvalidError

logger = logging.getLogger(__name__)
router = APIRouter()

_bearer = HTTPBearer(auto_error=False)


@router.post("/page-view", response_model=PageViewResponse, summary="Registrar visita de página")
async def record_page_view(
    request: Request,
    body: Annotated[PageViewCreate, Body()],
    db: DBSession,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> PageViewResponse:
    user_id = None
    is_auth = False
    is_admin = False

    if credentials:
        try:
            payload = decode_token(credentials.credentials)
            if payload.get("type") == "access":
                user_id = payload.get("sub")
                is_auth = True
                is_admin = payload.get("role") == "admin"
        except (TokenExpiredError, TokenInvalidError):
            pass

    try:
        await TelemetryService.record_page_view(db, body, user_id, is_auth, is_admin)
    except Exception as e:
        logger.warning(f"Error registrando page view: {e}")

    return PageViewResponse()
