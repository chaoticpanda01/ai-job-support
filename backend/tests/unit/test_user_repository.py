"""
Unit tests for UserRepository and ProfileRepository.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.enums import UserRole
from app.models.user import Profile, User
from app.repositories.user import ProfileRepository, UserRepository
from tests.conftest import make_profile, make_user


def _make_session() -> MagicMock:
    session = MagicMock()
    session.scalar = AsyncMock()
    session.scalars = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()
    session.delete = AsyncMock()
    session.get = AsyncMock()
    return session


# ---------------------------------------------------------------------------
# UserRepository
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_by_clerk_id_returns_user() -> None:
    session = _make_session()
    user = make_user(clerk_id="clerk_abc")
    session.scalar.return_value = user

    repo = UserRepository(session)
    result = await repo.get_by_clerk_id("clerk_abc")

    assert result is user
    session.scalar.assert_called_once()


@pytest.mark.asyncio
async def test_get_by_clerk_id_returns_none_when_not_found() -> None:
    session = _make_session()
    session.scalar.return_value = None

    repo = UserRepository(session)
    result = await repo.get_by_clerk_id("nonexistent")

    assert result is None


@pytest.mark.asyncio
async def test_upsert_creates_new_user() -> None:
    session = _make_session()
    session.scalar.return_value = None  # get_by_clerk_id returns None → create

    new_user = make_user(clerk_id="new_clerk")
    session.refresh = AsyncMock()

    repo = UserRepository(session)

    with patch.object(repo, "create", new=AsyncMock(return_value=new_user)) as mock_create:
        user, created = await repo.upsert_from_clerk(
            clerk_id="new_clerk",
            email="new@example.com",
            full_name="New User",
            email_verified=True,
        )

    assert created is True
    assert user is new_user
    mock_create.assert_called_once()


@pytest.mark.asyncio
async def test_upsert_updates_existing_user() -> None:
    session = _make_session()
    existing = make_user(clerk_id="existing_clerk")
    session.scalar.return_value = existing

    repo = UserRepository(session)

    with patch.object(repo, "update", new=AsyncMock(return_value=existing)) as mock_update:
        user, created = await repo.upsert_from_clerk(
            clerk_id="existing_clerk",
            email="updated@example.com",
            full_name="Updated Name",
            email_verified=True,
        )

    assert created is False
    mock_update.assert_called_once()


# ---------------------------------------------------------------------------
# ProfileRepository
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_or_create_creates_profile_when_none_exists() -> None:
    session = _make_session()
    session.scalar.return_value = None  # no existing profile

    uid = uuid.uuid4()
    profile = make_profile(user_id=uid)

    repo = ProfileRepository(session)
    with patch.object(repo, "create", new=AsyncMock(return_value=profile)):
        result, created = await repo.get_or_create(uid)

    assert created is True
    assert result is profile


@pytest.mark.asyncio
async def test_get_or_create_returns_existing_profile() -> None:
    uid = uuid.uuid4()
    existing = make_profile(user_id=uid)

    session = _make_session()
    session.scalar.return_value = existing

    repo = ProfileRepository(session)
    result, created = await repo.get_or_create(uid)

    assert created is False
    assert result is existing


@pytest.mark.asyncio
async def test_advance_onboarding_step_advances_when_greater() -> None:
    uid = uuid.uuid4()
    profile = make_profile(user_id=uid)
    profile.onboarding_step = 1

    session = _make_session()
    session.scalar.return_value = profile

    updated_profile = make_profile(user_id=uid)
    updated_profile.onboarding_step = 2

    repo = ProfileRepository(session)
    with patch.object(repo, "update", new=AsyncMock(return_value=updated_profile)):
        result = await repo.advance_onboarding_step(uid, 2)

    assert result is updated_profile


@pytest.mark.asyncio
async def test_advance_onboarding_step_does_not_go_backwards() -> None:
    uid = uuid.uuid4()
    profile = make_profile(user_id=uid)
    profile.onboarding_step = 3  # already at 3

    session = _make_session()
    session.scalar.return_value = profile

    repo = ProfileRepository(session)
    with patch.object(repo, "update", new=AsyncMock()) as mock_update:
        result = await repo.advance_onboarding_step(uid, 2)  # try to go back to 2

    mock_update.assert_not_called()
    assert result is profile
