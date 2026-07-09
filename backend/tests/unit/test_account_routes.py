"""
Unit tests for DELETE /account.

All external I/O (DB, Stripe, Resend, Clerk) is mocked so these run without
live credentials or a database.
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.main import app
from app.middleware import clerk_auth as clerk_auth_module
from httpx import ASGITransport, AsyncClient, Response

from tests.conftest import make_user

_FAKE_JWKS: dict[str, Any] = {"keys": []}


def _auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer valid_token"}


@contextmanager
def _bypass_middleware(user: Any) -> Iterator[None]:
    """Let the real ClerkJWTMiddleware run, mocking its I/O boundaries."""
    claims = {"sub": user.clerk_id, "email": user.email, "exp": int(time.time()) + 3600}
    with (
        patch.object(clerk_auth_module, "_get_jwks", new=AsyncMock(return_value=_FAKE_JWKS)),
        patch("app.middleware.clerk_auth.jwt.decode", return_value=claims),
        patch("app.middleware.clerk_auth._resolve_user", new=AsyncMock(return_value=user)),
    ):
        yield


def _clerk_delete_success() -> Response:
    return Response(status_code=200, json={"deleted": True})


def _mock_clerk_client(
    *, response: Response | None = None, side_effect: Exception | None = None
) -> MagicMock:
    """
    Build a mock for the `httpx.AsyncClient(...)` account.py constructs
    internally to call the Clerk API. Deliberately NOT patching
    httpx.AsyncClient.delete — that patches the class-level method shared by
    *every* AsyncClient instance, including the ASGITransport-based test
    client used to drive the request in these tests, which would break
    request routing entirely. Patching the constructor (httpx.AsyncClient
    itself) only affects account.py's dynamic `httpx.AsyncClient(...)` call;
    the test client here imports AsyncClient via `from httpx import
    AsyncClient`, a name bound at import time that a later patch of the
    httpx module's attribute doesn't touch.
    """
    mock_client = AsyncMock()
    if side_effect is not None:
        mock_client.delete = AsyncMock(side_effect=side_effect)
    else:
        mock_client.delete = AsyncMock(return_value=response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    return MagicMock(return_value=mock_client)


@pytest.mark.asyncio
async def test_delete_account_happy_path() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.account.UserRepository.get", new=AsyncMock(return_value=user)),
        patch("app.api.v1.account.UserRepository.update", new=AsyncMock(return_value=user)),
        patch(
            "app.api.v1.account.SubscriptionRepository.get_active_for_user",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "app.services.email_service.email_service.send_account_deleted",
            new=AsyncMock(),
        ),
        patch("httpx.AsyncClient", _mock_clerk_client(response=_clerk_delete_success())),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete("/api/v1/account", headers=_auth_headers())

    assert resp.status_code == 200
    assert resp.json() == {"detail": "Account deleted"}


@pytest.mark.asyncio
async def test_delete_account_user_not_found_returns_404() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.account.UserRepository.get", new=AsyncMock(return_value=None)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete("/api/v1/account", headers=_auth_headers())

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_account_cancels_active_subscription() -> None:
    user = make_user()
    subscription = MagicMock()
    subscription.stripe_subscription_id = "sub_123"

    with (
        _bypass_middleware(user),
        patch("app.api.v1.account.UserRepository.get", new=AsyncMock(return_value=user)),
        patch("app.api.v1.account.UserRepository.update", new=AsyncMock(return_value=user)),
        patch(
            "app.api.v1.account.SubscriptionRepository.get_active_for_user",
            new=AsyncMock(return_value=subscription),
        ),
        patch("stripe.Subscription.cancel") as mock_cancel,
        patch(
            "app.services.email_service.email_service.send_account_deleted",
            new=AsyncMock(),
        ),
        patch("httpx.AsyncClient", _mock_clerk_client(response=_clerk_delete_success())),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete("/api/v1/account", headers=_auth_headers())

    assert resp.status_code == 200
    mock_cancel.assert_called_once_with("sub_123")


@pytest.mark.asyncio
async def test_delete_account_stripe_cancel_failure_does_not_block_deletion() -> None:
    user = make_user()
    subscription = MagicMock()
    subscription.stripe_subscription_id = "sub_123"

    with (
        _bypass_middleware(user),
        patch("app.api.v1.account.UserRepository.get", new=AsyncMock(return_value=user)),
        patch("app.api.v1.account.UserRepository.update", new=AsyncMock(return_value=user)),
        patch(
            "app.api.v1.account.SubscriptionRepository.get_active_for_user",
            new=AsyncMock(return_value=subscription),
        ),
        patch("stripe.Subscription.cancel", side_effect=Exception("stripe down")),
        patch(
            "app.services.email_service.email_service.send_account_deleted",
            new=AsyncMock(),
        ),
        patch("httpx.AsyncClient", _mock_clerk_client(response=_clerk_delete_success())),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete("/api/v1/account", headers=_auth_headers())

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_delete_account_email_failure_does_not_block_deletion() -> None:
    from app.services.email_service import EmailServiceError

    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.account.UserRepository.get", new=AsyncMock(return_value=user)),
        patch("app.api.v1.account.UserRepository.update", new=AsyncMock(return_value=user)),
        patch(
            "app.api.v1.account.SubscriptionRepository.get_active_for_user",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "app.services.email_service.email_service.send_account_deleted",
            new=AsyncMock(side_effect=EmailServiceError("send failed")),
        ),
        patch("httpx.AsyncClient", _mock_clerk_client(response=_clerk_delete_success())),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete("/api/v1/account", headers=_auth_headers())

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_delete_account_clerk_delete_failure_does_not_block_deletion() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.account.UserRepository.get", new=AsyncMock(return_value=user)),
        patch("app.api.v1.account.UserRepository.update", new=AsyncMock(return_value=user)),
        patch(
            "app.api.v1.account.SubscriptionRepository.get_active_for_user",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "app.services.email_service.email_service.send_account_deleted",
            new=AsyncMock(),
        ),
        patch("httpx.AsyncClient", _mock_clerk_client(side_effect=Exception("clerk down"))),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete("/api/v1/account", headers=_auth_headers())

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_delete_account_no_email_skips_email_send() -> None:
    user = make_user(email="")

    with (
        _bypass_middleware(user),
        patch("app.api.v1.account.UserRepository.get", new=AsyncMock(return_value=user)),
        patch("app.api.v1.account.UserRepository.update", new=AsyncMock(return_value=user)),
        patch(
            "app.api.v1.account.SubscriptionRepository.get_active_for_user",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "app.services.email_service.email_service.send_account_deleted",
            new=AsyncMock(),
        ) as mock_send,
        patch("httpx.AsyncClient", _mock_clerk_client(response=_clerk_delete_success())),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete("/api/v1/account", headers=_auth_headers())

    assert resp.status_code == 200
    mock_send.assert_not_called()
