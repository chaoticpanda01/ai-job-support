"""
Shared pytest fixtures.

Uses an in-memory SQLite-like approach via a test-scoped PostgreSQL transaction
that is rolled back after each test, keeping tests isolated without truncating tables.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from unittest.mock import MagicMock

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
    return profile


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest_asyncio.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
