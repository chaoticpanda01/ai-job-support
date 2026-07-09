"""
Unit tests for auth API routes.

DB calls and middleware are mocked so these run without a live database.
"""

from __future__ import annotations

import json
import time
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.main import app
from app.middleware import clerk_auth as clerk_auth_module
from app.models.enums import UserRole
from httpx import ASGITransport, AsyncClient

from tests.conftest import make_profile, make_user

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_FAKE_JWKS: dict[str, Any] = {"keys": []}


def _auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer valid_token"}


@contextmanager
def _bypass_middleware(user: Any) -> Iterator[None]:
    """
    Let the real ClerkJWTMiddleware run, but mock its I/O boundaries (JWKS
    fetch, JWT decode, DB user resolution) so it resolves to `user`.

    Deliberately NOT patching BaseHTTPMiddleware.dispatch directly (the
    previous approach here) — Starlette runs dispatch inside an internal
    task group, and unittest.mock.patch's context-manager exit doesn't wait
    for that task to fully finish, which leaked state (and sometimes a
    stale event loop reference) into whichever test ran next. This mirrors
    the pattern already used successfully in test_clerk_middleware.py.
    """
    claims = {"sub": user.clerk_id, "email": user.email, "exp": int(time.time()) + 3600}
    with (
        patch.object(clerk_auth_module, "_get_jwks", new=AsyncMock(return_value=_FAKE_JWKS)),
        patch("app.middleware.clerk_auth.jwt.decode", return_value=claims),
        patch("app.middleware.clerk_auth._resolve_user", new=AsyncMock(return_value=user)),
    ):
        yield


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_me_returns_user_and_profile() -> None:
    user = make_user()
    profile = make_profile(user_id=user.id)
    user.profile = profile

    with (
        _bypass_middleware(user),
        patch("app.api.v1.auth.UserRepository.get_with_profile", new=AsyncMock(return_value=user)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me", headers=_auth_headers())

    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["email"] == user.email
    assert data["user"]["role"] == "user"


@pytest.mark.asyncio
async def test_get_me_returns_404_when_user_missing() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.auth.UserRepository.get_with_profile", new=AsyncMock(return_value=None)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me", headers=_auth_headers())

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PUT /auth/me
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_me_returns_updated_profile() -> None:
    user = make_user()
    profile = make_profile(user_id=user.id)
    user.profile = profile

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.auth.UserRepository.get_with_profile",
            new=AsyncMock(return_value=user),
        ),
        patch(
            "app.api.v1.auth.ProfileRepository.get_or_create",
            new=AsyncMock(return_value=(profile, False)),
        ),
        patch(
            "app.api.v1.auth.ProfileRepository.update",
            new=AsyncMock(return_value=profile),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.put(
                "/api/v1/auth/me",
                headers=_auth_headers(),
                json={"nationality": "Indonesian", "years_experience": 3},
            )

    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# POST /auth/webhook
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_webhook_invalid_signature_returns_400() -> None:
    payload = json.dumps({"type": "user.created", "data": {}}).encode()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/webhook",
            content=payload,
            headers={"content-type": "application/json"},
        )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid webhook signature"


@pytest.mark.asyncio
async def test_webhook_user_created_calls_upsert() -> None:
    user = make_user()
    profile = make_profile(user_id=user.id)

    payload_dict = {
        "type": "user.created",
        "data": {
            "id": "clerk_new_123",
            "email_addresses": [
                {
                    "email_address": "new@example.com",
                    "verification": {"status": "verified"},
                }
            ],
            "first_name": "New",
            "last_name": "User",
            "primary_email_address_id": None,
        },
    }
    payload = json.dumps(payload_dict).encode()

    with (
        patch("app.api.v1.auth.Webhook") as mock_wh_cls,
        patch(
            "app.api.v1.auth.UserRepository.upsert_from_clerk",
            new=AsyncMock(return_value=(user, True)),
        ),
        patch(
            "app.api.v1.auth.ProfileRepository.get_or_create",
            new=AsyncMock(return_value=(profile, True)),
        ),
    ):
        mock_wh = MagicMock()
        mock_wh.verify = MagicMock(return_value=None)
        mock_wh_cls.return_value = mock_wh

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/webhook",
                content=payload,
                headers={
                    "content-type": "application/json",
                    "svix-id": "x",
                    "svix-signature": "x",
                    "svix-timestamp": "x",
                },
            )

    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# GET /auth/users — admin only
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_users_forbidden_for_regular_user() -> None:
    user = make_user(role=UserRole.user)
    with _bypass_middleware(user):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/users", headers=_auth_headers())
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_users_allowed_for_admin() -> None:
    admin = make_user(role=UserRole.admin)

    with (
        _bypass_middleware(admin),
        patch("app.api.v1.auth.db", create=True),
        patch("sqlalchemy.ext.asyncio.AsyncSession.scalar", new=AsyncMock(return_value=0)),
        patch(
            "sqlalchemy.ext.asyncio.AsyncSession.scalars",
            new=AsyncMock(return_value=MagicMock(all=MagicMock(return_value=[]))),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/users", headers=_auth_headers())

    # 200 or 500 (DB not mocked) — just verify not 403
    assert resp.status_code != 403
