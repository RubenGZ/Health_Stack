"""
app/modules/integrations/service.py
=====================================
Business logic for third-party fitness platform integrations.

Supported OAuth2 platforms: Google Fit, Strava, Fitbit
Apple Health: CSV import only (no web OAuth2 available)

OAuth2 flow:
  1. GET /integrations/{platform}/auth   → redirect user to provider
  2. User grants permissions on provider
  3. GET /integrations/{platform}/callback → exchange code for tokens, store encrypted
  4. POST /integrations/{platform}/sync  → pull data, create HealthRecords

Token security:
  - Tokens encrypted with AES-256-GCM before storage
  - AAD context: b"healthstack.integration_token.v1"
  - Same MASTER_KEY as health_link, different binding context
"""

from __future__ import annotations

import csv
import hashlib
import hmac
import io
import logging
import os
import urllib.parse
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.modules.integrations.models import IntegrationToken
from app.modules.integrations.repository import IntegrationRepository
from app.modules.integrations.schemas import (
    AppleCSVImportResult,
    IntegrationListResponse,
    IntegrationStatus,
    SyncResult,
)

logger = logging.getLogger(__name__)

# ── Token encryption (AAD distinct from health_link) ─────────────────────────
_TOKEN_AAD: bytes = b"healthstack.integration_token.v1"
_GCM_NONCE_SIZE: int = 12
_GCM_TAG_SIZE: int = 16

SUPPORTED_PLATFORMS = ("google_fit", "strava", "fitbit")

_PLATFORM_CONFIG: dict[str, dict] = {
    "google_fit": {
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "scope": " ".join([
            "https://www.googleapis.com/auth/fitness.body.read",
            "https://www.googleapis.com/auth/fitness.activity.read",
            "https://www.googleapis.com/auth/fitness.sleep.read",
        ]),
        "client_id_key": "google_fit_client_id",
        "client_secret_key": "google_fit_client_secret",
        "extra_auth_params": {"access_type": "offline", "prompt": "consent"},
    },
    "strava": {
        "auth_url": "https://www.strava.com/oauth/authorize",
        "token_url": "https://www.strava.com/oauth/token",
        "scope": "read,activity:read",
        "client_id_key": "strava_client_id",
        "client_secret_key": "strava_client_secret",
        "extra_auth_params": {"approval_prompt": "auto"},
    },
    "fitbit": {
        "auth_url": "https://www.fitbit.com/oauth2/authorize",
        "token_url": "https://api.fitbit.com/oauth2/token",
        "scope": "activity weight sleep heartrate",
        "client_id_key": "fitbit_client_id",
        "client_secret_key": "fitbit_client_secret",
        "extra_auth_params": {"response_type": "code"},
    },
}


def _get_aesgcm():
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    raw = os.environ.get("HEALTH_LINK_MASTER_KEY", "")
    if not raw:
        raise RuntimeError("HEALTH_LINK_MASTER_KEY not configured")
    return AESGCM(bytes.fromhex(raw))


def _encrypt_token(plaintext: str) -> str:
    """Encrypt an OAuth2 token string. Returns nonce:tag:ct hex."""
    nonce = os.urandom(_GCM_NONCE_SIZE)
    ct_with_tag = _get_aesgcm().encrypt(nonce, plaintext.encode(), _TOKEN_AAD)
    ct = ct_with_tag[:-_GCM_TAG_SIZE]
    tag = ct_with_tag[-_GCM_TAG_SIZE:]
    return f"{nonce.hex()}:{tag.hex()}:{ct.hex()}"


def _decrypt_token(payload: str) -> str:
    """Decrypt an OAuth2 token. Raises ValueError on tamper."""
    parts = payload.split(":")
    if len(parts) != 3:
        raise ValueError("Malformed token payload")
    nonce, tag, ct = (bytes.fromhex(p) for p in parts)
    plaintext = _get_aesgcm().decrypt(nonce, ct + tag, _TOKEN_AAD)
    return plaintext.decode()


def _build_state(platform: str, user_id: uuid.UUID) -> str:
    """
    CSRF-proof state = "{user_id}:{HMAC-SHA256(platform:user_id, MASTER_KEY)}".

    El user_id viaja en claro (necesario para recuperarlo en el callback sin
    sesión de servidor). La firma HMAC impide que nadie forge un state válido.
    Formato: <uuid>:<64-char-hex-signature>
    """
    raw = os.environ.get("HEALTH_LINK_MASTER_KEY", "x")
    key = bytes.fromhex(raw) if len(raw) == 64 else raw.encode()
    msg = f"{platform}:{user_id}".encode()
    sig = hmac.new(key, msg, hashlib.sha256).hexdigest()
    return f"{user_id}:{sig}"


def _verify_state(state: str, platform: str) -> uuid.UUID:
    """
    Verifica el state OAuth2 y devuelve el user_id si la firma es válida.
    Lanza ValueError si el formato es incorrecto o la firma no coincide.
    """
    if not state or ":" not in state:
        raise ValueError("state format invalid")
    # Formato: "<uuid>:<64-char-hmac>" — el UUID tiene guiones, por eso rsplit
    user_id_str, sig = state.rsplit(":", 1)
    user_id = uuid.UUID(user_id_str)          # ValueError si no es UUID válido
    expected = _build_state(platform, user_id)
    # compare_digest previene timing attacks
    if not hmac.compare_digest(state, expected):
        raise ValueError("state signature mismatch")
    return user_id


def _redirect_uri(platform: str) -> str:
    settings = get_settings()
    base = getattr(settings, "integration_redirect_base", "https://healthstack.pro")
    return f"{base}/api/v1/integrations/{platform}/callback"


class IntegrationService:

    def get_auth_url(self, platform: str, user_id: uuid.UUID) -> str:
        if platform not in SUPPORTED_PLATFORMS:
            raise ValueError(f"Unsupported platform: {platform}")

        cfg = _PLATFORM_CONFIG[platform]
        settings = get_settings()
        client_id = getattr(settings, cfg["client_id_key"], "")

        if not client_id:
            raise RuntimeError(
                f"{cfg['client_id_key'].upper()} not configured. "
                "Add it to backend/.env to enable this integration."
            )

        params: dict = {
            "client_id": client_id,
            "response_type": "code",
            "redirect_uri": _redirect_uri(platform),
            "scope": cfg["scope"],
            "state": _build_state(platform, user_id),
        }
        params.update(cfg.get("extra_auth_params", {}))

        return f"{cfg['auth_url']}?{urllib.parse.urlencode(params)}"

    async def handle_callback(
        self,
        platform: str,
        code: str,
        user_id: uuid.UUID,
        db: AsyncSession,
    ) -> IntegrationToken:
        """Exchange OAuth code for tokens and store them encrypted."""
        if platform not in SUPPORTED_PLATFORMS:
            raise ValueError(f"Unsupported platform: {platform}")

        cfg = _PLATFORM_CONFIG[platform]
        settings = get_settings()
        client_id = getattr(settings, cfg["client_id_key"], "")
        client_secret = getattr(settings, cfg["client_secret_key"], "")

        async with httpx.AsyncClient(timeout=15.0) as client:
            # Fitbit requires Basic auth header
            if platform == "fitbit":
                import base64
                creds = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
                resp = await client.post(
                    cfg["token_url"],
                    data={"code": code, "redirect_uri": _redirect_uri(platform), "grant_type": "authorization_code"},
                    headers={"Authorization": f"Basic {creds}", "Content-Type": "application/x-www-form-urlencoded"},
                )
            else:
                resp = await client.post(cfg["token_url"], data={
                    "code": code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": _redirect_uri(platform),
                    "grant_type": "authorization_code",
                })
            resp.raise_for_status()
            token_data = resp.json()

        access_token: str = token_data["access_token"]
        refresh_token: str | None = token_data.get("refresh_token")
        expires_in: int = token_data.get("expires_in", 3600)
        scope_raw = token_data.get("scope", cfg["scope"])
        scope = scope_raw if isinstance(scope_raw, str) else " ".join(scope_raw)
        expires_at = datetime.now(tz=timezone.utc) + timedelta(seconds=expires_in)

        access_enc = _encrypt_token(access_token)
        refresh_enc = _encrypt_token(refresh_token) if refresh_token else None

        repo = IntegrationRepository(db)
        return await repo.upsert_token(
            user_id=user_id,
            platform=platform,
            access_token_enc=access_enc,
            refresh_token_enc=refresh_enc,
            expires_at=expires_at,
            scope=scope,
            platform_user_id=None,
        )

    async def _refresh_if_needed(
        self, token: IntegrationToken, db: AsyncSession
    ) -> str:
        """Return a valid access token, refreshing if needed."""
        now = datetime.now(tz=timezone.utc)
        if token.expires_at and token.expires_at > now + timedelta(minutes=5):
            return _decrypt_token(token.access_token_enc)

        if not token.refresh_token_enc:
            return _decrypt_token(token.access_token_enc)

        refresh_token = _decrypt_token(token.refresh_token_enc)
        cfg = _PLATFORM_CONFIG[token.platform]
        settings = get_settings()
        client_id = getattr(settings, cfg["client_id_key"], "")
        client_secret = getattr(settings, cfg["client_secret_key"], "")

        async with httpx.AsyncClient(timeout=15.0) as client:
            if token.platform == "fitbit":
                import base64
                creds = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
                resp = await client.post(
                    cfg["token_url"],
                    data={"grant_type": "refresh_token", "refresh_token": refresh_token},
                    headers={"Authorization": f"Basic {creds}", "Content-Type": "application/x-www-form-urlencoded"},
                )
            else:
                resp = await client.post(cfg["token_url"], data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": client_id,
                    "client_secret": client_secret,
                })
            resp.raise_for_status()
            data = resp.json()

        new_access = data["access_token"]
        new_refresh = data.get("refresh_token", refresh_token)
        expires_in = data.get("expires_in", 3600)
        expires_at = now + timedelta(seconds=expires_in)

        token.access_token_enc = _encrypt_token(new_access)
        token.refresh_token_enc = _encrypt_token(new_refresh)
        token.expires_at = expires_at
        await db.flush()

        return new_access

    async def sync(
        self,
        platform: str,
        user_id: uuid.UUID,
        db: AsyncSession,
    ) -> SyncResult:
        """Pull data from the platform and upsert into HealthRecords."""
        repo = IntegrationRepository(db)
        token = await repo.get_token(user_id, platform)
        if not token:
            raise ValueError(f"No {platform} connection found. Connect first.")

        access_token = await self._refresh_if_needed(token, db)

        if platform == "google_fit":
            count = await self._sync_google_fit(access_token, user_id, db)
        elif platform == "strava":
            count = await self._sync_strava(access_token, user_id, db)
        elif platform == "fitbit":
            count = await self._sync_fitbit(access_token, user_id, db)
        else:
            raise ValueError(f"Unsupported platform: {platform}")

        await repo.mark_synced(user_id, platform)

        return SyncResult(
            platform=platform,
            records_imported=count,
            message=f"Successfully synced {count} records from {platform}.",
        )

    async def _sync_google_fit(
        self, access_token: str, user_id: uuid.UUID, db: AsyncSession
    ) -> int:
        """Fetch weight data from Google Fit and upsert HealthRecords."""
        from app.core.security.cryptoservice import get_crypto_service
        from app.modules.health.service import HealthService
        from app.modules.health.schemas import HealthRecordCreate

        crypto = get_crypto_service()
        health_svc = HealthService()

        now_ms = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
        days_ago_ms = int((datetime.now(tz=timezone.utc) - timedelta(days=90)).timestamp() * 1000)

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
                headers={"Authorization": f"Bearer {access_token}"},
                json={
                    "aggregateBy": [{"dataTypeName": "com.google.weight"}],
                    "bucketByTime": {"durationMillis": 86400000},
                    "startTimeMillis": days_ago_ms,
                    "endTimeMillis": now_ms,
                },
            )
            if resp.status_code != 200:
                logger.warning("Google Fit sync failed: %s", resp.text)
                return 0
            data = resp.json()

        count = 0
        for bucket in data.get("bucket", []):
            for dataset in bucket.get("dataset", []):
                for point in dataset.get("point", []):
                    vals = point.get("value", [])
                    if not vals:
                        continue
                    weight_kg = Decimal(str(vals[0].get("fpVal", 0))).quantize(Decimal("0.1"))
                    if weight_kg <= 0:
                        continue
                    ts_ms = int(point.get("startTimeNanos", 0)) // 1_000_000
                    record_date = date.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
                    try:
                        await health_svc.create_record(
                            db=db,
                            user_id=str(user_id),
                            data=HealthRecordCreate(
                                recorded_date=record_date,
                                weight_kg=weight_kg,
                            ),
                            crypto=crypto,
                        )
                        count += 1
                    except Exception:
                        pass  # skip duplicates or errors
        return count

    async def _sync_strava(
        self, access_token: str, user_id: uuid.UUID, db: AsyncSession
    ) -> int:
        """Fetch recent activities from Strava (heart rate data)."""
        from app.core.security.cryptoservice import get_crypto_service
        from app.modules.health.service import HealthService
        from app.modules.health.schemas import HealthRecordCreate

        crypto = get_crypto_service()
        health_svc = HealthService()

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                "https://www.strava.com/api/v3/athlete/activities",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"per_page": 50},
            )
            if resp.status_code != 200:
                logger.warning("Strava sync failed: %s", resp.text)
                return 0
            activities = resp.json()

        count = 0
        for act in activities:
            avg_hr = act.get("average_heartrate")
            if not avg_hr:
                continue
            start_date = act.get("start_date", "")
            if not start_date:
                continue
            record_date = datetime.fromisoformat(start_date.replace("Z", "+00:00")).date()
            try:
                await health_svc.create_record(
                    db=db,
                    user_id=str(user_id),
                    data=HealthRecordCreate(
                        recorded_date=record_date,
                        resting_heart_rate=int(avg_hr),
                    ),
                    crypto=crypto,
                )
                count += 1
            except Exception:
                pass
        return count

    async def _sync_fitbit(
        self, access_token: str, user_id: uuid.UUID, db: AsyncSession
    ) -> int:
        """Fetch weight and sleep data from Fitbit."""
        from app.core.security.cryptoservice import get_crypto_service
        from app.modules.health.service import HealthService
        from app.modules.health.schemas import HealthRecordCreate

        crypto = get_crypto_service()
        health_svc = HealthService()
        count = 0

        async with httpx.AsyncClient(timeout=20.0) as client:
            # Weight
            resp = await client.get(
                "https://api.fitbit.com/1/user/-/body/log/weight/list.json",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"offset": 0, "limit": 100, "sort": "desc"},
            )
            if resp.status_code == 200:
                for entry in resp.json().get("weight", []):
                    try:
                        record_date = date.fromisoformat(entry["date"])
                        weight_kg = Decimal(str(entry["weight"])).quantize(Decimal("0.1"))
                        await health_svc.create_record(
                            db=db,
                            user_id=str(user_id),
                            data=HealthRecordCreate(
                                recorded_date=record_date,
                                weight_kg=weight_kg,
                            ),
                            crypto=crypto,
                        )
                        count += 1
                    except Exception:
                        pass

            # Sleep
            resp = await client.get(
                "https://api.fitbit.com/1.2/user/-/sleep/list.json",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"offset": 0, "limit": 50, "sort": "desc"},
            )
            if resp.status_code == 200:
                for entry in resp.json().get("sleep", []):
                    try:
                        record_date = date.fromisoformat(entry["dateOfSleep"])
                        minutes = entry.get("minutesAsleep", 0)
                        sleep_h = Decimal(str(minutes / 60)).quantize(Decimal("0.1"))
                        await health_svc.create_record(
                            db=db,
                            user_id=str(user_id),
                            data=HealthRecordCreate(
                                recorded_date=record_date,
                                sleep_hours=sleep_h,
                            ),
                            crypto=crypto,
                        )
                        count += 1
                    except Exception:
                        pass

        return count

    async def import_apple_csv(
        self,
        csv_bytes: bytes,
        user_id: uuid.UUID,
        db: AsyncSession,
    ) -> AppleCSVImportResult:
        """
        Import Apple Health export CSV.
        Expected columns: date, weight_kg (or weight_lb), sleep_hours, resting_heart_rate
        """
        from app.core.security.cryptoservice import get_crypto_service
        from app.modules.health.service import HealthService
        from app.modules.health.schemas import HealthRecordCreate

        crypto = get_crypto_service()
        health_svc = HealthService()
        count = 0

        try:
            text = csv_bytes.decode("utf-8-sig")
            reader = csv.DictReader(io.StringIO(text))
            for row in reader:
                try:
                    raw_date = row.get("date") or row.get("Date") or row.get("startDate") or ""
                    if not raw_date:
                        continue
                    record_date = date.fromisoformat(raw_date[:10])

                    kwargs: dict = {"recorded_date": record_date}

                    if w := (row.get("weight_kg") or row.get("Weight (kg)")):
                        kwargs["weight_kg"] = Decimal(str(w)).quantize(Decimal("0.1"))
                    elif lb := (row.get("weight_lb") or row.get("Weight (lb)")):
                        kwargs["weight_kg"] = (Decimal(str(lb)) * Decimal("0.453592")).quantize(Decimal("0.1"))

                    if s := (row.get("sleep_hours") or row.get("Sleep Analysis (hr)")):
                        kwargs["sleep_hours"] = Decimal(str(s)).quantize(Decimal("0.1"))

                    if hr := (row.get("resting_heart_rate") or row.get("Heart Rate (count/min)")):
                        kwargs["resting_heart_rate"] = int(float(hr))

                    if len(kwargs) > 1:
                        await health_svc.create_record(
                            db=db,
                            user_id=str(user_id),
                            data=HealthRecordCreate(**kwargs),
                            crypto=crypto,
                        )
                        count += 1
                except Exception:
                    continue

        except Exception as exc:
            logger.warning("Apple CSV import failed: %s", exc)
            raise ValueError("Could not parse CSV. Verify the file format.") from exc

        return AppleCSVImportResult(
            records_imported=count,
            message=f"Imported {count} records from Apple Health CSV.",
        )

    async def list_integrations(
        self, user_id: uuid.UUID, db: AsyncSession
    ) -> IntegrationListResponse:
        repo = IntegrationRepository(db)
        tokens = await repo.list_tokens(user_id)
        connected = {t.platform: t for t in tokens}

        statuses = [
            IntegrationStatus(
                platform=p,
                connected=p in connected,
                last_sync_at=connected[p].last_sync_at if p in connected else None,
                scope=connected[p].scope if p in connected else None,
            )
            for p in SUPPORTED_PLATFORMS
        ]
        return IntegrationListResponse(integrations=statuses)

    async def disconnect(
        self, platform: str, user_id: uuid.UUID, db: AsyncSession
    ) -> bool:
        repo = IntegrationRepository(db)
        return await repo.delete_token(user_id, platform)
