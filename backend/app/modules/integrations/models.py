"""
app/modules/integrations/models.py
=====================================
SQLAlchemy model for OAuth2 integration tokens.

Security: access_token and refresh_token are stored encrypted (AES-256-GCM).
No plaintext credentials ever reach the database.
"""

from __future__ import annotations

from datetime import datetime
import uuid

from sqlalchemy import DateTime, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.base_model import Base, TimestampMixin, UUIDPrimaryKeyMixin


class IntegrationToken(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Stores OAuth2 tokens for third-party fitness platform integrations.

    Supported platforms: google_fit, strava, fitbit

    SECURITY: Both access_token and refresh_token are encrypted with AES-256-GCM
    before storage. The same MASTER_KEY used for health pseudonymization is used
    here with a different AAD context (healthstack.integration_token.v1) to
    prevent cross-context ciphertext reuse.
    """

    __tablename__ = "integration_tokens"
    __table_args__ = (
        UniqueConstraint("user_id", "platform", name="uq_integration_user_platform"),
        {
            "comment": (
                "OAuth2 tokens for Google Fit, Strava, Fitbit integrations. "
                "Tokens are AES-256-GCM encrypted — same key as health_link, "
                "different AAD context."
            )
        },
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
        comment="FK to users.id — not enforced at DB level (cross-schema isolation).",
    )

    platform: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="google_fit | strava | fitbit",
    )

    access_token_enc: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="AES-256-GCM encrypted access token. Format: nonce_hex:tag_hex:ct_hex",
    )

    refresh_token_enc: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="AES-256-GCM encrypted refresh token. Null if platform does not issue one.",
    )

    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="When the access_token expires. None means no expiry (unusual).",
    )

    scope: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True,
        comment="Space-separated OAuth2 scopes granted by the user.",
    )

    platform_user_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        comment="Platform's own user identifier (e.g. Strava athlete ID).",
    )

    last_sync_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp of the last successful data sync from this platform.",
    )

    def __repr__(self) -> str:
        return f"<IntegrationToken user={str(self.user_id)[:8]}... platform={self.platform}>"
