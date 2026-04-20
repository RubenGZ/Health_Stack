"""
tests/unit/test_security.py
============================
Tests unitarios de seguridad: JWT, hashing y crypto.
"""

import pytest
from app.core.security.jwt_handler import (
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.security.hashing import hash_password, verify_password
from app.shared.exceptions import TokenExpiredError, TokenInvalidError


# ── JWT ────────────────────────────────────────────────────────────────────────

class TestJWT:

    def test_create_and_decode_access_token(self):
        token = create_access_token(
            user_id="abc123", email="user@test.com", role="user"
        )
        payload = decode_token(token)
        assert payload["sub"] == "abc123"
        assert payload["email"] == "user@test.com"
        assert payload["type"] == "access"

    def test_create_and_decode_refresh_token(self):
        token = create_refresh_token(user_id="abc123")
        payload = decode_token(token)
        assert payload["sub"] == "abc123"
        assert payload["type"] == "refresh"

    def test_tokens_have_unique_jti(self):
        t1 = create_access_token("u1", "a@b.com", "user")
        t2 = create_access_token("u1", "a@b.com", "user")
        p1 = decode_token(t1)
        p2 = decode_token(t2)
        assert p1["jti"] != p2["jti"]

    def test_invalid_token_raises(self):
        with pytest.raises(TokenInvalidError):
            decode_token("esto.no.es.un.token")

    def test_tampered_token_raises(self):
        token = create_access_token("u1", "a@b.com", "user")
        tampered = token[:-5] + "XXXXX"
        with pytest.raises(TokenInvalidError):
            decode_token(tampered)


# ── Password Hashing ───────────────────────────────────────────────────────────

class TestHashing:

    def test_hash_and_verify_correct_password(self):
        pwd = "SuperSecure123!"
        hashed = hash_password(pwd)
        assert verify_password(pwd, hashed) is True

    def test_wrong_password_fails(self):
        hashed = hash_password("correct_password")
        assert verify_password("wrong_password", hashed) is False

    def test_hash_is_not_plaintext(self):
        pwd = "my_secret"
        hashed = hash_password(pwd)
        assert pwd not in hashed
        assert hashed.startswith("$argon2")

    def test_same_password_different_hashes(self):
        pwd = "same_password"
        h1 = hash_password(pwd)
        h2 = hash_password(pwd)
        assert h1 != h2  # Salt diferente cada vez
