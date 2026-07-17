"""
Unit tests for ClerkJWTMiddleware.

All external calls (JWKS fetch, DB lookup) are mocked so these tests
run without a live database or Clerk account.
"""

from __future__ import annotations

import time
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.main import app
from app.middleware import clerk_auth as clerk_auth_module
from httpx import ASGITransport, AsyncClient

from tests.conftest import make_user

FAKE_JWKS = {"keys": []}
FAKE_CLAIMS = {
    "sub": "clerk_test_123",
    "email": "test@example.com",
    "exp": int(time.time()) + 3600,
}


def _patch_jwks() -> Any:
    return patch.object(clerk_auth_module, "_get_jwks", new=AsyncMock(return_value=FAKE_JWKS))


def _patch_validate(claims: dict = FAKE_CLAIMS) -> Any:
    return patch.object(clerk_auth_module, "_validate_token", new=AsyncMock(return_value=claims))


def _patch_resolve(user: Any) -> Any:
    return patch("app.middleware.clerk_auth._resolve_user", new=AsyncMock(return_value=user))


# ---------------------------------------------------------------------------
# Bypass paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_bypasses_auth() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        with patch("app.database.ping_db", new=AsyncMock(return_value=True)):
            resp = await client.get("/health")
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Missing / malformed token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_missing_auth_header_returns_401() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401
    assert "Authorization" in resp.json()["detail"] or resp.json()["detail"]


@pytest.mark.asyncio
async def test_malformed_bearer_returns_401() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/auth/me", headers={"Authorization": "NotBearer token"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Invalid / expired token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invalid_token_returns_401() -> None:
    import jwt

    with patch.object(
        clerk_auth_module,
        "_validate_token",
        new=AsyncMock(side_effect=jwt.InvalidTokenError("bad")),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/auth/me", headers={"Authorization": "Bearer bad.token"}
            )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid token"


@pytest.mark.asyncio
async def test_expired_token_returns_401() -> None:
    import jwt

    with patch.object(
        clerk_auth_module,
        "_validate_token",
        new=AsyncMock(side_effect=jwt.ExpiredSignatureError("expired")),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer expired"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Token has expired"


# ---------------------------------------------------------------------------
# User not in DB
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_user_not_in_db_returns_401() -> None:
    with _patch_jwks(), _patch_validate(), _patch_resolve(None):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer valid"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "User not found"


# ---------------------------------------------------------------------------
# Deactivated user
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_inactive_user_returns_401() -> None:
    inactive_user = make_user(is_active=False)
    with _patch_jwks(), _patch_validate(), _patch_resolve(inactive_user):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer valid"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Account is deactivated"


# ---------------------------------------------------------------------------
# Successful auth sets request.state
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_valid_token_passes_through() -> None:
    user = make_user()
    # We test state propagation by hitting /auth/me and mocking the repo
    with (
        _patch_jwks(),
        _patch_validate(),
        _patch_resolve(user),
        patch(
            "app.api.v1.auth.UserRepository.get_with_profile",
            new=AsyncMock(return_value=user),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer valid"})
    # 200 means middleware passed and route handler ran
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# JWKS cache
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_jwks_cache_is_used_on_second_call() -> None:
    import httpx

    fetch_count = 0
    original_get = httpx.AsyncClient.get

    async def counting_get(self: Any, url: str, **kwargs: Any) -> Any:
        nonlocal fetch_count
        if "jwks" in url:
            fetch_count += 1
        return await original_get(self, url, **kwargs)

    clerk_auth_module._jwks_cache = {}
    clerk_auth_module._jwks_fetched_at = 0.0

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json = MagicMock(return_value=FAKE_JWKS)

    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=mock_response)) as mock_get:
        await clerk_auth_module._get_jwks()
        await clerk_auth_module._get_jwks()
        assert mock_get.call_count == 1  # second call used cache


# ---------------------------------------------------------------------------
# Authorized-party (azp) enforcement — opt-in
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_azp_rejected_when_not_in_allowed_list() -> None:
    claims = {"sub": "clerk_test_123", "email": "test@example.com", "azp": "https://evil.example"}
    with (
        _patch_validate(claims),
        patch.object(
            clerk_auth_module.settings, "clerk_authorized_parties", "https://good.example"
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid token"


@pytest.mark.asyncio
async def test_azp_allowed_passes() -> None:
    user = make_user()
    claims = {"sub": "clerk_test_123", "email": "test@example.com", "azp": "https://good.example"}
    with (
        _patch_validate(claims),
        _patch_resolve(user),
        patch.object(
            clerk_auth_module.settings, "clerk_authorized_parties", "https://good.example"
        ),
        patch("app.api.v1.auth.UserRepository.get_with_profile", new=AsyncMock(return_value=user)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer x"})
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# _validate_token — signing-key selection
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_validate_token_raises_when_kid_not_found() -> None:
    import jwt

    with (
        patch.object(clerk_auth_module, "_get_jwks", new=AsyncMock(return_value={"keys": []})),
        patch(
            "app.middleware.clerk_auth.jwt.get_unverified_header",
            return_value={"kid": "missing"},
        ),
        pytest.raises(jwt.InvalidTokenError),
    ):
        await clerk_auth_module._validate_token("whatever")
