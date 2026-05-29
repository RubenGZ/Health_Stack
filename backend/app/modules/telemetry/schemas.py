from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class PageViewCreate(BaseModel):
    page: str = Field(..., max_length=100)
    country: str | None = Field(default=None, max_length=2)


class PageViewResponse(BaseModel):
    ok: bool = True


# Claves cuyo valor se filtra antes de loguearse — evita PII en logs
_TELEMETRY_PII_KEYS: frozenset[str] = frozenset({
    "email", "password", "token", "user_id", "name", "phone",
    "display_name", "access_token", "refresh_token", "health_subject_id",
})


class EventCreate(BaseModel):
    event: str = Field(
        ...,
        max_length=80,
        pattern=r"^[a-z][a-z0-9_]*$",  # snake_case — previene inyección en logs
    )
    data: dict = Field(default_factory=dict)

    @field_validator("data")
    @classmethod
    def sanitize_and_limit_data(cls, v: dict) -> dict:
        """
        1. Trunca si el payload supera 2 KB — previene log flooding.
        2. Filtra valores de claves con PII conocida antes de loguearse.
        """
        if len(str(v)) > 2048:
            return {"_truncated": True, "_original_keys": list(v.keys())[:10]}
        items = list(v.items())[:20]
        return {
            k: "[FILTERED]" if k.lower() in _TELEMETRY_PII_KEYS else val
            for k, val in items
        }
