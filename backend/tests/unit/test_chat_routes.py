"""
Unit tests for the chatbot endpoint.

The client renders a 200 reply verbatim as something the assistant said, so
what this endpoint calls a reply and what it calls a failure decides whether a
reader sees a translated message or an English sentence in a Japanese window.
Gemini, the budget check and the DB are mocked.
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.database import get_db
from app.main import app
from app.middleware import clerk_auth as clerk_auth_module
from app.services.ai.client import AIError
from app.services.ai.usage_tracker import AIBudgetError
from httpx import ASGITransport, AsyncClient

from tests.conftest import make_user

_FAKE_JWKS: dict[str, Any] = {"keys": []}


def _auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer valid_token"}


@contextmanager
def _bypass_middleware(user: Any) -> Iterator[None]:
    claims = {"sub": user.clerk_id, "email": user.email, "exp": int(time.time()) + 3600}
    with (
        patch.object(clerk_auth_module, "_get_jwks", new=AsyncMock(return_value=_FAKE_JWKS)),
        patch("app.middleware.clerk_auth._validate_token", new=AsyncMock(return_value=claims)),
        patch("app.middleware.clerk_auth._resolve_user", new=AsyncMock(return_value=user)),
    ):
        yield


@contextmanager
def _fake_db_session() -> Iterator[MagicMock]:
    session = MagicMock()
    session.commit = AsyncMock()
    session.flush = AsyncMock()

    async def _fake_get_db() -> Any:
        yield session

    app.dependency_overrides[get_db] = _fake_get_db
    try:
        yield session
    finally:
        app.dependency_overrides.pop(get_db, None)


async def _post(message: str = "How do I get a work visa?") -> Any:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.post(
            "/api/v1/chat/message",
            json={"message": message, "history": []},
            headers=_auth_headers(),
        )


@pytest.mark.asyncio
async def test_a_reply_comes_back_as_a_reply() -> None:
    user = make_user()
    with (
        _bypass_middleware(user),
        _fake_db_session(),
        patch("app.services.ai.usage_tracker.usage_tracker.check_budget", new=AsyncMock()),
        patch("app.services.ai.usage_tracker.usage_tracker.record", new=AsyncMock()),
        patch(
            "app.services.ai.client.ai_client.generate",
            new=AsyncMock(return_value=("You'll need a Certificate of Eligibility.", 10, 20)),
        ),
    ):
        resp = await _post()

    assert resp.status_code == 200
    assert resp.json()["reply"] == "You'll need a Certificate of Eligibility."


@pytest.mark.asyncio
async def test_an_ai_failure_is_an_error_not_a_reply() -> None:
    """
    A 200 whose reply says the assistant is unavailable is indistinguishable
    from an answer, and the client can only translate a status.
    """
    user = make_user()
    with (
        _bypass_middleware(user),
        _fake_db_session(),
        patch("app.services.ai.usage_tracker.usage_tracker.check_budget", new=AsyncMock()),
        patch(
            "app.services.ai.client.ai_client.generate",
            new=AsyncMock(side_effect=AIError("upstream timeout")),
        ),
    ):
        resp = await _post()

    assert resp.status_code == 502
    assert "reply" not in resp.json()


@pytest.mark.asyncio
async def test_being_over_the_ai_budget_says_how_long_to_wait() -> None:
    """The client turns Retry-After into a live countdown, so it has to be sent."""
    user = make_user()
    with (
        _bypass_middleware(user),
        _fake_db_session(),
        patch(
            "app.services.ai.usage_tracker.usage_tracker.check_budget",
            new=AsyncMock(side_effect=AIBudgetError(used=8, limit=8, retry_after_seconds=7200)),
        ),
    ):
        resp = await _post()

    assert resp.status_code == 429
    assert resp.headers["Retry-After"] == "7200"
