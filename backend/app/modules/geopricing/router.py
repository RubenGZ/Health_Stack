"""
Geo-pricing endpoint.

Returns currency and prices based on the visitor's IP address.
No auth required. Uses ip-api.com for geolocation with a 10-min in-memory cache.
"""
import ipaddress
import itertools
import logging
import time
from typing import Any

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Constants ─────────────────────────────────────────────────────────────────

EUROZONE = {
    "AT", "BE", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT",
    "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
}

PRICING: dict[str, tuple[str, str, int, int]] = {
    "CH": ("CHF", "CHF ", 10, 26),
    "GB": ("GBP", "£",   8,  20),
    "PL": ("PLN", "zł",  39, 99),
    "AU": ("AUD", "A$",  13, 33),
}

EUR_DEFAULTS = ("EUR", "€", 9, 24)

CACHE_TTL = 600  # 10 minutes
_CACHE_MAX = 5000
_CACHE_EVICT = 500

# ── In-memory cache ───────────────────────────────────────────────────────────

_cache: dict[str, tuple[dict[str, Any], float]] = {}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_response(country: str, currency: str, symbol: str, pro: int, elite: int) -> dict[str, Any]:
    return {
        "country": country,
        "currency": currency,
        "symbol": symbol,
        "prices": {"free": 0, "pro": pro, "elite": elite},
    }


def _eur_response(country: str = "XX") -> dict[str, Any]:
    currency, symbol, pro, elite = EUR_DEFAULTS
    return _build_response(country, currency, symbol, pro, elite)


def _is_private(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
        return addr.is_private or addr.is_loopback
    except ValueError:
        return True  # treat invalid IPs as private → safe fallback


def _extract_ip(request: Request) -> str:
    # X-Real-IP is set by Nginx from $remote_addr — always trusted
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    # Rightmost entry of X-Forwarded-For is appended by Nginx — trusted
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[-1].strip()
    if request.client:
        return request.client.host
    return "127.0.0.1"


def _resolve_pricing(country_code: str) -> dict[str, Any]:
    if country_code in PRICING:
        currency, symbol, pro, elite = PRICING[country_code]
        return _build_response(country_code, currency, symbol, pro, elite)
    if country_code in EUROZONE:
        currency, symbol, pro, elite = EUR_DEFAULTS
        return _build_response(country_code, currency, symbol, pro, elite)
    # Default to EUR for unknown countries
    return _eur_response(country_code)


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("/geo-price")
async def geo_price(request: Request) -> JSONResponse:
    ip = _extract_ip(request)

    # Private/loopback IPs → return EUR defaults without calling ip-api
    if _is_private(ip):
        return JSONResponse(_eur_response("XX"))

    # Check cache
    now = time.monotonic()
    if ip in _cache:
        result, cached_at = _cache[ip]
        if now - cached_at < CACHE_TTL:
            return JSONResponse(result)

    # Call ip-api.com
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            # ip-api.com free tier does not support HTTPS — do not change to https://
            url = f"http://ip-api.com/json/{ip}?fields=status,countryCode"
            resp = await client.get(url)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "success":
                country_code = data.get("countryCode", "")
                result = _resolve_pricing(country_code)
                if len(_cache) >= _CACHE_MAX:
                    for key in list(itertools.islice(_cache, _CACHE_EVICT)):
                        _cache.pop(key, None)
                _cache[ip] = (result, now)
                return JSONResponse(result)
    except Exception as exc:
        logger.warning("geo-price ip-api lookup failed for %s: %s", ip, exc)

    return JSONResponse(_eur_response("XX"))
