"""
app/modules/integrations/router.py
=====================================
FastAPI endpoints for third-party fitness platform integrations.

OAuth2 flow:
  GET /{platform}/auth  → redirect user to platform's OAuth page
  GET /{platform}/callback → platform redirects here with ?code=...
  POST /{platform}/sync → pull latest data from platform
  DELETE /{platform} → disconnect (revoke stored tokens)

Apple Health (web can't use HealthKit):
  POST /apple/import-csv → parse exported CSV and import records
"""

from __future__ import annotations

from typing import Annotated
import uuid

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import RedirectResponse

from app.core.security.dependencies import CurrentUser
from app.modules.integrations.schemas import (
    AppleCSVImportResult,
    IntegrationAuthURL,
    IntegrationListResponse,
    SyncResult,
)
from app.modules.integrations.service import IntegrationService, _verify_state
from app.session import DBSession as DB

router = APIRouter()

_SUPPORTED_PLATFORMS = {"google_fit", "strava", "fitbit"}


def _validate_platform(platform: str) -> str:
    if platform not in _SUPPORTED_PLATFORMS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Platform '{platform}' not supported. Choose: {', '.join(sorted(_SUPPORTED_PLATFORMS))}",
        )
    return platform


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=IntegrationListResponse, summary="List connected integrations")
async def list_integrations(current_user: CurrentUser, db: DB):
    """Returns connection status for all supported platforms."""
    user_id = uuid.UUID(current_user["user_id"])
    svc = IntegrationService()
    return await svc.list_integrations(user_id, db)


@router.get(
    "/{platform}/auth",
    response_model=IntegrationAuthURL,
    summary="Get OAuth2 authorization URL",
)
async def get_auth_url(platform: str, current_user: CurrentUser):
    """Returns the URL to redirect the user to for OAuth2 authorization."""
    _validate_platform(platform)
    user_id = uuid.UUID(current_user["user_id"])
    svc = IntegrationService()
    url = svc.get_auth_url(platform, user_id)
    return IntegrationAuthURL(url=url, platform=platform)


@router.get(
    "/{platform}/callback",
    summary="OAuth2 callback — handles authorization code exchange",
    include_in_schema=False,
)
async def oauth_callback(
    platform: str,
    db: DB,
    code: Annotated[str, Query(description="Authorization code from the platform")] = "",
    state: Annotated[str | None, Query()] = None,
):
    """
    Called by the OAuth2 platform after user authorization.
    Exchanges the code for tokens, encrypts them, and stores them.
    Redirects to /integrations?connected=<platform>.
    """
    _validate_platform(platform)

    if not state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing state parameter.")
    try:
        user_id = _verify_state(state, platform)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or tampered state parameter.")

    svc = IntegrationService()
    await svc.handle_callback(platform, code, user_id, db)

    return RedirectResponse(url="/integrations?connected=" + platform, status_code=302)


@router.post(
    "/{platform}/sync",
    response_model=SyncResult,
    summary="Pull latest data from a connected platform",
)
async def sync_platform(platform: str, current_user: CurrentUser, db: DB):
    """Pulls the latest fitness/health data from the connected platform."""
    _validate_platform(platform)
    user_id = uuid.UUID(current_user["user_id"])
    svc = IntegrationService()
    return await svc.sync(platform, user_id, db)


@router.delete(
    "/{platform}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Disconnect an integration",
)
async def disconnect_platform(platform: str, current_user: CurrentUser, db: DB):
    """Removes stored tokens for the given platform."""
    _validate_platform(platform)
    user_id = uuid.UUID(current_user["user_id"])
    svc = IntegrationService()
    await svc.disconnect(platform, user_id, db)


@router.post(
    "/apple/import-csv",
    response_model=AppleCSVImportResult,
    summary="Import Apple Health CSV export",
)
async def import_apple_csv(
    current_user: CurrentUser,
    db: DB,
    file: UploadFile = File(..., description="Apple Health CSV export file"),
):
    """
    Parses an Apple Health CSV export and imports records into HealthStack Pro.
    Column names are flexible — handles multiple export app formats.
    """
    if file.content_type not in (
        "text/csv", "application/csv", "text/plain", "application/octet-stream"
    ):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only CSV files are supported. Export from Apple Health and upload the .csv file.",
        )

    # Verificar tamaño ANTES de leer para evitar OOM con archivos gigantes
    _MAX_CSV = 20 * 1024 * 1024  # 20 MB
    csv_bytes = await file.read(_MAX_CSV + 1)
    if len(csv_bytes) > _MAX_CSV:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large. Maximum size is 20 MB.",
        )

    user_id = uuid.UUID(current_user["user_id"])
    svc = IntegrationService()
    return await svc.import_apple_csv(csv_bytes, user_id, db)
