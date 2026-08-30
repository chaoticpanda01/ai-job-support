"""
Shared pytest fixtures.

Uses an in-memory SQLite-like approach via a test-scoped PostgreSQL transaction
that is rolled back after each test, keeping tests isolated without truncating tables.
"""

from __future__ import annotations

import os

# Force APP_ENV=test (unless the real shell environment already set one
# explicitly) before any app module is imported below. app/database.py reads
# settings.is_test at import time to pick NullPool (test) vs the pooled,
# pool_pre_ping=True engine (dev/prod) -- the latter binds connections to
# whichever asyncio event loop first used them, which crashes
# ("attached to a different loop") once a second real-DB async test runs
# under pytest-asyncio's function-scoped event loops. Local dev's .env sets
# APP_ENV=development (correct for `docker compose up backend`), so without
# this override, any local run of 2+ real-DB integration tests together
# fails in a way that only reproduces here, not in CI -- CI's workflow sets
# APP_ENV: test directly as a job env var, bypassing .env entirely.
os.environ.setdefault("APP_ENV", "test")

import uuid
from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from app.main import app
from app.models.enums import SubscriptionTier, UserRole
from app.models.user import Profile, User
from httpx import ASGITransport, AsyncClient

# ---------------------------------------------------------------------------
# Test database — use a separate SQLite-compatible or real PG test DB.
# For unit tests we patch the DB entirely; integration tests need a real DB.
# These fixtures target unit tests.
# ---------------------------------------------------------------------------


def make_user(
    *,
    user_id: uuid.UUID | None = None,
    clerk_id: str = "clerk_test_123",
    email: str = "test@example.com",
    full_name: str | None = "Test User",
    role: UserRole = UserRole.user,
    is_active: bool = True,
    subscription_tier: SubscriptionTier = SubscriptionTier.free,
) -> MagicMock:
    """Build a mock User ORM object for use in unit tests."""
    user = MagicMock(spec=User)
    user.id = user_id or uuid.uuid4()
    user.clerk_id = clerk_id
    user.email = email
    user.email_verified = True
    user.full_name = full_name
    user.role = role
    user.is_active = is_active
    user.subscription_tier = subscription_tier
    user.last_login_at = None
    user.profile = None
    return user


def make_profile(user_id: uuid.UUID | None = None) -> MagicMock:
    """Build a mock Profile ORM object."""
    profile = MagicMock(spec=Profile)
    profile.id = uuid.uuid4()
    profile.user_id = user_id or uuid.uuid4()
    profile.nationality = "Indonesian"
    profile.japanese_level = "none"
    profile.target_industry = []
    profile.target_role = []
    profile.years_experience = None
    profile.current_location = None
    profile.target_location = None
    profile.visa_status = "none"
    profile.preferred_language = "id"
    profile.onboarding_step = 0
    profile.onboarding_completed = False
    profile.name_kana = None
    profile.date_of_birth = None
    profile.gender = None
    profile.phone_number = None
    profile.mailing_address = None
    profile.residence_card_expiration = None
    profile.visa_category = None
    profile.photo_storage_key = None
    profile.hobbies = None
    profile.special_skills = None
    profile.personal_requests = None
    profile.commute_time = None
    profile.dependents = None
    return profile


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(autouse=True)
def _disable_rate_limiter() -> Any:
    """
    Force RateLimiterMiddleware to fail open on every request in every test.

    Route tests drive real HTTP requests through the full middleware stack
    via ASGITransport, including the real RateLimiterMiddleware — not just
    the auth middleware tests deliberately exercise. If a developer machine
    (or CI's redis service container) has Redis actually reachable, rapid
    test requests hit real per-route limits (e.g. 5/hour for resume
    uploads), causing flaky, test-order-dependent 429s unrelated to what's
    being tested. Patching _get_redis to fail mirrors the middleware's own
    documented fail-open behavior when Redis is unavailable — it's not
    bypassing a check we care about here, just removing an unrelated
    dependency on ambient Redis state.
    """
    with patch(
        "app.middleware.rate_limiter.RateLimiterMiddleware._get_redis",
        side_effect=RuntimeError("Redis disabled in unit tests"),
    ):
        yield


@pytest_asyncio.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
