"""
Unit tests for UsageTracker quota logic.

DB access is mocked — these verify cap arithmetic and the admin
exemption, not SQL.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.models.enums import UserRole
from app.services.ai.usage_tracker import (
    AI_CALL_LIMIT,
    AI_GLOBAL_CALL_LIMIT,
    AIBudgetError,
    QuotaStatus,
    UsageTracker,
)


def _mock_user(role: UserRole = UserRole.user) -> MagicMock:
    u = MagicMock()
    u.role = role
    return u


# ---------------------------------------------------------------------------
# QuotaStatus
# ---------------------------------------------------------------------------


def test_quota_status_remaining_clamps_at_zero() -> None:
    """Usage can overshoot the limit under concurrency; remaining must not go negative."""
    over = QuotaStatus(scope="user", used=12, limit=8, window_hours=24, resets_in_seconds=100)
    assert over.exhausted is True
    assert over.remaining == 0

    under = QuotaStatus(scope="user", used=3, limit=8, window_hours=24, resets_in_seconds=0)
    assert under.exhausted is False
    assert under.remaining == 5


# ---------------------------------------------------------------------------
# get_quota_status — binding-cap selection
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_quota_status_admin_always_global_scope() -> None:
    tracker = UsageTracker()
    with patch("app.services.ai.usage_tracker.AIUsageRepository") as MockUsageRepo:
        MockUsageRepo.return_value.get_total_usage_window = AsyncMock(return_value=(3, None))
        # Must be an explicit AsyncMock (not an auto-created plain MagicMock
        # attribute) for assert_not_awaited() below to be a valid call.
        MockUsageRepo.return_value.get_recent_usage_window = AsyncMock()

        quota = await tracker.get_quota_status(uuid.uuid4(), True, AsyncMock())

    assert quota.scope == "global"
    assert quota.used == 3
    assert quota.limit == AI_GLOBAL_CALL_LIMIT
    assert quota.remaining == AI_GLOBAL_CALL_LIMIT - 3
    # An admin has no per-user cap, so that window is never queried.
    MockUsageRepo.return_value.get_recent_usage_window.assert_not_awaited()


@pytest.mark.asyncio
async def test_get_quota_status_returns_user_scope_when_user_is_binding() -> None:
    """user 7/8 (1 left) vs global 2/16 (14 left) — the per-user cap binds."""
    tracker = UsageTracker()
    with patch("app.services.ai.usage_tracker.AIUsageRepository") as MockUsageRepo:
        MockUsageRepo.return_value.get_total_usage_window = AsyncMock(return_value=(2, None))
        MockUsageRepo.return_value.get_recent_usage_window = AsyncMock(return_value=(7, None))

        quota = await tracker.get_quota_status(uuid.uuid4(), False, AsyncMock())

    assert quota.scope == "user"
    assert quota.remaining == 1


@pytest.mark.asyncio
async def test_get_quota_status_returns_global_scope_when_global_is_binding() -> None:
    """user 1/8 (7 left) vs global 15/16 (1 left) — the global cap binds."""
    tracker = UsageTracker()
    with patch("app.services.ai.usage_tracker.AIUsageRepository") as MockUsageRepo:
        MockUsageRepo.return_value.get_total_usage_window = AsyncMock(
            return_value=(AI_GLOBAL_CALL_LIMIT - 1, None)
        )
        MockUsageRepo.return_value.get_recent_usage_window = AsyncMock(return_value=(1, None))

        quota = await tracker.get_quota_status(uuid.uuid4(), False, AsyncMock())

    assert quota.scope == "global"
    assert quota.remaining == 1


@pytest.mark.asyncio
async def test_get_quota_status_tie_favours_user_scope() -> None:
    """Equal headroom resolves to the per-user scope — the more actionable message."""
    tracker = UsageTracker()
    with patch("app.services.ai.usage_tracker.AIUsageRepository") as MockUsageRepo:
        MockUsageRepo.return_value.get_total_usage_window = AsyncMock(
            return_value=(AI_GLOBAL_CALL_LIMIT - AI_CALL_LIMIT, None)
        )
        MockUsageRepo.return_value.get_recent_usage_window = AsyncMock(return_value=(0, None))

        quota = await tracker.get_quota_status(uuid.uuid4(), False, AsyncMock())

    assert quota.scope == "user"
    assert quota.remaining == AI_CALL_LIMIT


# ---------------------------------------------------------------------------
# check_budget — enforcement
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_check_budget_passes_when_under_both_caps() -> None:
    tracker = UsageTracker()
    with (
        patch("app.services.ai.usage_tracker.UserRepository") as MockUserRepo,
        patch("app.services.ai.usage_tracker.AIUsageRepository") as MockUsageRepo,
    ):
        MockUserRepo.return_value.get = AsyncMock(return_value=_mock_user())
        MockUsageRepo.return_value.get_total_usage_window = AsyncMock(return_value=(2, None))
        MockUsageRepo.return_value.get_recent_usage_window = AsyncMock(return_value=(1, None))

        await tracker.check_budget(uuid.uuid4(), "chatbot", AsyncMock())


@pytest.mark.asyncio
async def test_check_budget_non_admin_blocked_by_user_cap() -> None:
    tracker = UsageTracker()
    with (
        patch("app.services.ai.usage_tracker.UserRepository") as MockUserRepo,
        patch("app.services.ai.usage_tracker.AIUsageRepository") as MockUsageRepo,
    ):
        MockUserRepo.return_value.get = AsyncMock(return_value=_mock_user(UserRole.user))
        MockUsageRepo.return_value.get_total_usage_window = AsyncMock(return_value=(5, None))
        MockUsageRepo.return_value.get_recent_usage_window = AsyncMock(
            return_value=(AI_CALL_LIMIT, None)
        )

        with pytest.raises(AIBudgetError) as exc_info:
            await tracker.check_budget(uuid.uuid4(), "chatbot", AsyncMock())

    assert exc_info.value.scope == "user"


@pytest.mark.asyncio
async def test_check_budget_admin_bypasses_user_cap() -> None:
    """An admin well past the per-user ceiling still passes while global has room."""
    tracker = UsageTracker()
    with (
        patch("app.services.ai.usage_tracker.UserRepository") as MockUserRepo,
        patch("app.services.ai.usage_tracker.AIUsageRepository") as MockUsageRepo,
    ):
        MockUserRepo.return_value.get = AsyncMock(return_value=_mock_user(UserRole.admin))
        MockUsageRepo.return_value.get_total_usage_window = AsyncMock(return_value=(5, None))
        MockUsageRepo.return_value.get_recent_usage_window = AsyncMock(
            return_value=(AI_CALL_LIMIT + 10, None)
        )

        await tracker.check_budget(uuid.uuid4(), "chatbot", AsyncMock())

        MockUsageRepo.return_value.get_recent_usage_window.assert_not_awaited()


@pytest.mark.asyncio
async def test_check_budget_admin_still_blocked_by_global_cap() -> None:
    """The global breaker is a proxy for Google's real quota — admins are not exempt."""
    tracker = UsageTracker()
    with (
        patch("app.services.ai.usage_tracker.UserRepository") as MockUserRepo,
        patch("app.services.ai.usage_tracker.AIUsageRepository") as MockUsageRepo,
    ):
        MockUserRepo.return_value.get = AsyncMock(return_value=_mock_user(UserRole.admin))
        MockUsageRepo.return_value.get_total_usage_window = AsyncMock(
            return_value=(AI_GLOBAL_CALL_LIMIT, None)
        )

        with pytest.raises(AIBudgetError) as exc_info:
            await tracker.check_budget(uuid.uuid4(), "chatbot", AsyncMock())

    assert exc_info.value.scope == "global"


@pytest.mark.asyncio
async def test_check_budget_unknown_user_fails_closed() -> None:
    """A lookup miss must enforce the cap, never silently grant an exemption."""
    tracker = UsageTracker()
    with (
        patch("app.services.ai.usage_tracker.UserRepository") as MockUserRepo,
        patch("app.services.ai.usage_tracker.AIUsageRepository") as MockUsageRepo,
    ):
        MockUserRepo.return_value.get = AsyncMock(return_value=None)
        MockUsageRepo.return_value.get_total_usage_window = AsyncMock(return_value=(5, None))
        MockUsageRepo.return_value.get_recent_usage_window = AsyncMock(
            return_value=(AI_CALL_LIMIT, None)
        )

        with pytest.raises(AIBudgetError) as exc_info:
            await tracker.check_budget(uuid.uuid4(), "chatbot", AsyncMock())

    assert exc_info.value.scope == "user"
