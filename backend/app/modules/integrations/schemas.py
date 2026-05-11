"""
app/modules/integrations/schemas.py
=====================================
Pydantic schemas for the integrations module.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class IntegrationStatus(BaseModel):
    platform: str
    connected: bool
    last_sync_at: datetime | None = None
    scope: str | None = None

    model_config = {"from_attributes": True}


class IntegrationListResponse(BaseModel):
    integrations: list[IntegrationStatus]


class IntegrationAuthURL(BaseModel):
    url: str
    platform: str


class SyncResult(BaseModel):
    platform: str
    records_imported: int
    message: str


class AppleCSVImportResult(BaseModel):
    records_imported: int
    message: str
