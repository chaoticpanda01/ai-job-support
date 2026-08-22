# Admin Full Access Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin use every AI feature up to the shared daily ceiling instead of the 8-call personal cap, and fix the two data bugs that currently make rirekisho generation unreachable.

**Architecture:** Quota math moves into a `QuotaStatus` value object returned by a new `get_quota_status()` helper, which reports the *binding* cap — the one with the least headroom. `check_budget` resolves the caller's role once, delegates to that helper, and raises only if the binding cap is exhausted; admins simply have no per-user cap to bind against. Separately, `full_name` is threaded through the two layers that currently discard it, and onboarding learns to resume at the right step.

**Tech Stack:** Python 3.12, FastAPI, Pydantic, SQLAlchemy 2.0, pytest (unittest.mock); Next.js 15 App Router, TypeScript, react-hook-form + Zod, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-08-22-admin-full-access-design.md` (Parts A, B, C, E. Part D — the quota endpoint, header badge, and `aiQuota` i18n namespace — is deliberately deferred to a second plan.)

**Note on frontend verification:** this repo has no frontend test runner (no jest/vitest/playwright). Frontend tasks are verified with `npm run type-check`, `npm run lint`, and `npm run build`. Do not add a test framework.

---

### Task 1: Quota helper + admin exemption

**Files:**
- Modify (full-file replacement): `backend/app/services/ai/usage_tracker.py`
- Create: `backend/tests/unit/test_usage_tracker.py`

Full-file replacement is used because the module docstring, the imports, and `check_budget` all change together, and two new top-level definitions land between existing ones. Scattered Find/Replace edits across that many interleaved regions risk overlapping anchors.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/unit/test_usage_tracker.py`:

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd backend && source .venv/bin/activate
pytest tests/unit/test_usage_tracker.py -q
```
Expected: collection error — `ImportError: cannot import name 'QuotaStatus' from 'app.services.ai.usage_tracker'`.

- [ ] **Step 3: Overwrite `backend/app/services/ai/usage_tracker.py` with this content**

```python
"""
AI usage budget enforcement and logging.

Three operations:

  get_quota_status(user_id, is_admin, db) — pure quota math, no enforcement.
      Returns the *binding* QuotaStatus: whichever cap has the least
      headroom left. Admins have no per-user cap, so theirs always
      resolves to the global scope. Shared by check_budget and (in a
      follow-up plan) GET /auth/me/ai-quota, so enforcement and display
      cannot drift apart.

  check_budget(user_id, feature, db) — runs BEFORE every AI call.
      Resolves the caller's role, asks get_quota_status for the binding
      cap, and raises AIBudgetError (→ HTTP 429) if it is exhausted.

      Admins bypass the per-user fair-use cap but remain subject to the
      global circuit-breaker. That asymmetry is deliberate: the global cap
      is a proxy for Google's real Gemini free-tier ceiling, so exempting
      admins from it would create no extra capacity — it would only swap a
      friendly message for a raw Gemini 429, and let admin testing starve
      real visitors.

  record(user_id, feature, model, input_tokens, output_tokens, latency_ms, db)
      — runs AFTER every AI call.
      Appends a row to ai_usage_logs (partitioned table).
      Never raises — log failures must not abort the response.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import UserRole
from app.repositories.ai_usage import AIUsageRepository
from app.repositories.user import UserRepository

logger = logging.getLogger(__name__)

# Approximate cost per token in USD (claude-sonnet-4-x pricing, rounded up)
# Used for informational cost_usd column only — not for billing.
_INPUT_COST_PER_TOKEN = Decimal("0.000003")
_OUTPUT_COST_PER_TOKEN = Decimal("0.000015")

# Flat fair-use ceiling: total AI calls per rolling window, summed across
# every feature, applied to all non-admin users regardless of subscription tier.
# Per-user rolling-window fair-use cap (all AI features combined). Sized so a
# single visitor can do one full short interview or several quick features, but
# can't monopolize the shared Gemini free-tier budget.
AI_CALL_LIMIT = 8
AI_CALL_WINDOW_HOURS = 24

# Global circuit-breaker across ALL users, kept below Google's Gemini free-tier
# ceiling (20 requests/day for this project) so the whole app stays under the
# shared daily quota and no one hits the raw Gemini 429. The 4-request gap under
# 20 is deliberate headroom: check_budget is check-then-act (finding #14), so a
# concurrent burst can overshoot slightly — the buffer absorbs that overshoot so
# it still can't reach Google's hard limit. Raise both limits substantially if
# billing is enabled on the Gemini project.
#
# Admins are NOT exempt from this one. See the module docstring.
AI_GLOBAL_CALL_LIMIT = 16
AI_GLOBAL_WINDOW_HOURS = 24


class AIBudgetError(Exception):
    """Raised when a user has exceeded their rolling-window fair-use AI call quota."""

    def __init__(
        self,
        used: int,
        limit: int,
        window_hours: int = AI_CALL_WINDOW_HOURS,
        retry_after_seconds: int = 0,
        scope: str = "user",
    ) -> None:
        self.used = used
        self.limit = limit
        self.window_hours = window_hours
        # Seconds until the oldest call in the window ages out and frees up
        # a slot. It's an estimate, not an exact reset instant — the window
        # is rolling, so each call ages out individually rather than the
        # whole quota resetting at once.
        self.retry_after_seconds = retry_after_seconds
        self.scope = scope
        if scope == "global":
            message = (
                f"The demo has reached today's shared AI limit "
                f"({limit} requests per {window_hours} hours across all users). "
                f"Try again in {_format_duration(retry_after_seconds)}."
            )
        else:
            message = (
                f"AI usage limit reached: used={used}, limit={limit} per {window_hours} hours. "
                f"Try again in {_format_duration(retry_after_seconds)}."
            )
        super().__init__(message)

    def to_http_exception(self) -> HTTPException:
        """Shared 429 shape for every route that catches this exception."""
        return HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(self),
            headers={"Retry-After": str(self.retry_after_seconds)},
        )


@dataclass(frozen=True)
class QuotaStatus:
    """
    One rolling-window cap and how much of it is left.

    `scope` names which cap this is: "user" for the per-user fair-use quota,
    "global" for the shared circuit-breaker.
    """

    scope: str
    used: int
    limit: int
    window_hours: int
    resets_in_seconds: int

    @property
    def remaining(self) -> int:
        # Clamped: check_budget is check-then-act, so a concurrent burst can
        # push `used` past `limit`, and negative headroom is meaningless.
        return max(0, self.limit - self.used)

    @property
    def exhausted(self) -> bool:
        return self.used >= self.limit


def _reset_seconds(oldest_call_at: datetime | None, window_hours: int) -> int:
    """Seconds until the oldest call in the window ages out and frees a slot."""
    if oldest_call_at is None:
        return 0
    reset_at = oldest_call_at + timedelta(hours=window_hours)
    return max(0, math.ceil((reset_at - datetime.now(UTC)).total_seconds()))


def _format_duration(seconds: int) -> str:
    if seconds <= 10:
        return "a few seconds"
    if seconds <= 60:
        return f"{seconds} seconds"
    minutes = math.ceil(seconds / 60)
    if minutes < 60:
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    hours = minutes // 60
    rem_minutes = minutes % 60
    if rem_minutes == 0:
        return f"{hours} hour{'s' if hours != 1 else ''}"
    return f"{hours}h {rem_minutes}m"


async def _is_admin(user_id: UUID, db: AsyncSession) -> bool:
    """
    Resolve whether the caller is an admin.

    Fails closed: an unknown user_id yields False, so a lookup miss enforces
    the cap rather than silently exempting the caller.
    """
    user = await UserRepository(db).get(user_id)
    return user is not None and user.role == UserRole.admin


class UsageTracker:
    """
    Stateless service — each method receives the DB session from the caller.
    """

    async def get_quota_status(
        self,
        user_id: UUID,
        is_admin: bool,
        db: AsyncSession,
    ) -> QuotaStatus:
        """
        Return the binding cap — whichever has the least headroom left.

        Pure math: never raises on exhaustion, and never queries for the
        caller's role. `is_admin` is supplied by the caller (check_budget
        resolves it; API routes already hold it on CurrentUser), so the role
        lookup happens at most once per request.

        Admins have no per-user cap, so their binding cap is always the global
        one. For everyone else a tie favours the per-user scope, whose message
        is the more actionable of the two.
        """
        repo = AIUsageRepository(db)

        total, global_oldest = await repo.get_total_usage_window(AI_GLOBAL_WINDOW_HOURS)
        global_status = QuotaStatus(
            scope="global",
            used=total,
            limit=AI_GLOBAL_CALL_LIMIT,
            window_hours=AI_GLOBAL_WINDOW_HOURS,
            resets_in_seconds=_reset_seconds(global_oldest, AI_GLOBAL_WINDOW_HOURS),
        )
        if is_admin:
            return global_status

        used, oldest_call_at = await repo.get_recent_usage_window(user_id, AI_CALL_WINDOW_HOURS)
        user_status = QuotaStatus(
            scope="user",
            used=used,
            limit=AI_CALL_LIMIT,
            window_hours=AI_CALL_WINDOW_HOURS,
            resets_in_seconds=_reset_seconds(oldest_call_at, AI_CALL_WINDOW_HOURS),
        )
        return user_status if user_status.remaining <= global_status.remaining else global_status

    async def check_budget(
        self,
        user_id: UUID,
        feature: str,
        db: AsyncSession,
    ) -> None:
        """
        Enforce the binding rolling-window cap before an AI call (all features
        share one budget). Raises AIBudgetError with retry_after_seconds = time
        until the oldest counted call ages out and frees a slot.

        Admins skip the per-user cap but not the global circuit-breaker.

        `feature` is accepted for call-site clarity and logging symmetry with
        record(); the quota itself is deliberately whole-app, not per-feature,
        so a user can't spread calls across endpoints to dodge the cap.
        """
        is_admin = await _is_admin(user_id, db)
        quota = await self.get_quota_status(user_id, is_admin, db)
        if quota.exhausted:
            raise AIBudgetError(
                used=quota.used,
                limit=quota.limit,
                window_hours=quota.window_hours,
                retry_after_seconds=quota.resets_in_seconds,
                scope=quota.scope,
            )

    async def record(
        self,
        *,
        user_id: UUID | None,
        feature: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        latency_ms: int,
        db: AsyncSession,
    ) -> None:
        """
        Append an ai_usage_logs row. Silently swallows exceptions — a logging
        failure must never abort a successful AI response.
        """
        cost_usd = (
            Decimal(input_tokens) * _INPUT_COST_PER_TOKEN
            + Decimal(output_tokens) * _OUTPUT_COST_PER_TOKEN
        )
        try:
            repo = AIUsageRepository(db)
            await repo.record(
                user_id=user_id,
                feature=feature,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=cost_usd,
                latency_ms=latency_ms,
            )
        except Exception as exc:
            logger.error(
                "Failed to record AI usage: user_id=%s feature=%s error=%s",
                user_id,
                feature,
                exc,
            )


# Singleton
usage_tracker = UsageTracker()
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd backend && source .venv/bin/activate
pytest tests/unit/test_usage_tracker.py -v
```
Expected: 9 passed. (A `Required test coverage of 70% not reached` line appears when running a single file in isolation — that is the repo-wide gate, not a test failure. Ignore it here; Task 7 runs the full suite where it passes.)

- [ ] **Step 5: Run lint and type checks**

```bash
ruff check app/services/ai/usage_tracker.py tests/unit/test_usage_tracker.py
ruff format --check app/services/ai/usage_tracker.py tests/unit/test_usage_tracker.py
mypy app/services/ai/usage_tracker.py
```
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add app/services/ai/usage_tracker.py tests/unit/test_usage_tracker.py
git commit -m "Exempt admins from the per-user AI call cap

Quota math moves into a QuotaStatus value object returned by a new
get_quota_status() helper, which reports the binding cap — the one
with the least headroom left. check_budget resolves the caller's role
once, delegates to that helper, and raises only if the binding cap is
exhausted, so an admin simply has no per-user cap to bind against.

Admins remain subject to the global circuit-breaker. That cap is a
proxy for Google's real Gemini free-tier ceiling, so exempting admins
would create no capacity — it would only swap a friendly message for a
raw Gemini 429 and let admin testing starve real visitors. The role
lookup fails closed: an unknown user_id enforces the cap.

Behaviour for non-admins is unchanged. Binding-cap selection picks the
same cap the old sequential per-user-then-global checks would have."
```

---

### Task 2: Accept `full_name` on `PUT /auth/me`

**Files:**
- Modify: `backend/app/schemas/user.py`
- Modify: `backend/app/api/v1/auth.py`
- Test: `backend/tests/unit/test_auth_routes.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/unit/test_auth_routes.py`:

```python
@pytest.mark.asyncio
async def test_update_me_saves_full_name() -> None:
    """
    full_name lives on users, not profiles, so it must be applied through
    UserRepository rather than folded into the profile update.
    """
    user = make_user(full_name=None)
    profile = make_profile(user_id=user.id)
    user.profile = profile

    user_update = AsyncMock(return_value=user)

    with (
        _bypass_middleware(user),
        patch("app.api.v1.auth.UserRepository.get_with_profile", new=AsyncMock(return_value=user)),
        patch("app.api.v1.auth.UserRepository.update", new=user_update),
        patch(
            "app.api.v1.auth.ProfileRepository.get_or_create",
            new=AsyncMock(return_value=(profile, False)),
        ),
        patch("app.api.v1.auth.ProfileRepository.update", new=AsyncMock(return_value=profile)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.put(
                "/api/v1/auth/me",
                headers=_auth_headers(),
                json={"full_name": "Budi Santoso", "preferred_language": "id"},
            )

    assert resp.status_code == 200
    user_update.assert_awaited_once()
    assert user_update.await_args.kwargs["full_name"] == "Budi Santoso"


@pytest.mark.asyncio
async def test_update_me_without_full_name_leaves_user_untouched() -> None:
    """Omitting full_name must not clear it — exclude_none drops it entirely."""
    user = make_user(full_name="Existing Name")
    profile = make_profile(user_id=user.id)
    user.profile = profile

    user_update = AsyncMock(return_value=user)

    with (
        _bypass_middleware(user),
        patch("app.api.v1.auth.UserRepository.get_with_profile", new=AsyncMock(return_value=user)),
        patch("app.api.v1.auth.UserRepository.update", new=user_update),
        patch(
            "app.api.v1.auth.ProfileRepository.get_or_create",
            new=AsyncMock(return_value=(profile, False)),
        ),
        patch("app.api.v1.auth.ProfileRepository.update", new=AsyncMock(return_value=profile)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.put(
                "/api/v1/auth/me",
                headers=_auth_headers(),
                json={"preferred_language": "id"},
            )

    assert resp.status_code == 200
    user_update.assert_not_awaited()
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd backend && source .venv/bin/activate
pytest tests/unit/test_auth_routes.py::test_update_me_saves_full_name -v
```
Expected: FAIL — `user_update.assert_awaited_once()` raises `AssertionError: Expected 'update' to have been awaited once. Awaited 0 times.` because `ProfileUpdateRequest` silently drops the unknown `full_name` key.

- [ ] **Step 3: Add `full_name` to the request schema**

In `backend/app/schemas/user.py`, find:

```python
class ProfileUpdateRequest(_Base):
    nationality: str | None = None
```

Replace with:

```python
class ProfileUpdateRequest(_Base):
    # full_name is the only field here that lives on `users`, not `profiles`.
    # update_me applies it separately. It is the 氏名 shown on a generated
    # 履歴書 (RirekishoPersonal.name_kanji reads users.full_name).
    full_name: str | None = None
    nationality: str | None = None
```

- [ ] **Step 4: Apply `full_name` in `update_me`**

In `backend/app/api/v1/auth.py`, find:

```python
    update_data = body.model_dump(exclude_none=True)
    if update_data:
        # onboarding_step can only advance, never go backward
```

Replace with:

```python
    update_data = body.model_dump(exclude_none=True)

    # full_name lives on users, not profiles — apply it before the profile
    # fields. exclude_none means an omitted full_name is absent here, so this
    # can set the name but never clear it.
    full_name = update_data.pop("full_name", None)
    if full_name is not None:
        user = await user_repo.update(user, full_name=full_name)

    if update_data:
        # onboarding_step can only advance, never go backward
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pytest tests/unit/test_auth_routes.py -v
```
Expected: all pass, including both new tests.

- [ ] **Step 6: Run lint and type checks**

```bash
ruff check app/schemas/user.py app/api/v1/auth.py tests/unit/test_auth_routes.py
ruff format --check app/schemas/user.py app/api/v1/auth.py tests/unit/test_auth_routes.py
mypy app/schemas/user.py app/api/v1/auth.py
```
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add app/schemas/user.py app/api/v1/auth.py tests/unit/test_auth_routes.py
git commit -m "Accept full_name on PUT /auth/me

ProfileUpdateRequest had no full_name field, so the onboarding step-2
name input had nowhere to land even once the frontend started sending
it. full_name lives on users rather than profiles, so update_me pops it
and applies it through UserRepository before the profile fields.

exclude_none means an omitted full_name is absent from update_data
entirely, so this can set a name but never clear one."
```

---

### Task 3: Stop discarding `full_name` in onboarding step 2

**Files:**
- Modify: `frontend/types/api.ts`
- Modify: `frontend/app/onboarding/page.tsx`

Step 2 already collects and validates `full_name` (`step2Schema` requires it, and the input renders under the `s2Name` label). Its `onNext` then sends only `preferred_language` and `onboarding_step`, silently dropping the value.

- [ ] **Step 1: Add `full_name` to the TypeScript request type**

In `frontend/types/api.ts`, find:

```typescript
export interface ProfileUpdateRequest {
  nationality?: string;
```

Replace with:

```typescript
export interface ProfileUpdateRequest {
  // Lives on `users`, not `profiles` — the backend applies it separately.
  full_name?: string;
  nationality?: string;
```

- [ ] **Step 2: Send `full_name` from step 2**

In `frontend/app/onboarding/page.tsx`, find:

```typescript
                await updateProfile.mutateAsync({
                  preferred_language: data.preferred_language,
                  onboarding_step: 1,
                });
```

Replace with:

```typescript
                await updateProfile.mutateAsync({
                  full_name: data.full_name,
                  preferred_language: data.preferred_language,
                  onboarding_step: 1,
                });
```

- [ ] **Step 3: Verify types and lint**

```bash
cd frontend
npm run type-check
npm run lint
```
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add types/api.ts app/onboarding/page.tsx
git commit -m "Save the name collected in onboarding step 2

Step 2 required full_name in its Zod schema and rendered an input for
it, then dropped the value: onNext sent only preferred_language and
onboarding_step. That is why accounts finishing onboarding still ended
up with users.full_name NULL, which in turn blocks 履歴書 generation —
the completeness check requires it for the 氏名 field."
```

---

### Task 4: Resume onboarding at the right step

**Files:**
- Modify: `frontend/app/onboarding/page.tsx`

- [ ] **Step 1: Import `useRef`**

Find:

```typescript
import { cloneElement, isValidElement, useState, useEffect, useId, type ReactElement } from "react";
```

Replace with:

```typescript
import {
  cloneElement,
  isValidElement,
  useState,
  useEffect,
  useId,
  useRef,
  type ReactElement,
} from "react";
```

- [ ] **Step 2: Add the start-step sync**

Find:

```typescript
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // If already completed, redirect
  useEffect(() => {
    if (me?.profile?.onboarding_completed) {
      router.replace("/dashboard/resumes");
    }
  }, [me?.profile?.onboarding_completed, router]);
```

Replace with:

```typescript
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const didSyncStep = useRef(false);

  // If already completed, redirect
  useEffect(() => {
    if (me?.profile?.onboarding_completed) {
      router.replace("/dashboard/resumes");
    }
  }, [me?.profile?.onboarding_completed, router]);

  // Resume at the step after the last one saved, so a returning user isn't
  // forced to re-walk the whole wizard. Runs once: after this, the user's own
  // Back/Continue navigation owns `step`, and re-syncing would fight it.
  //
  // Exception: step 2 is the only place full_name is captured, so a user
  // missing it starts there however far they previously got. Without this they
  // would jump to step 5, finish it, flip the onboarding_completed generated
  // column, and then be redirected away permanently by the guard above — with
  // full_name still unset, leaving 履歴書 generation blocked and no route back.
  useEffect(() => {
    if (didSyncStep.current || !me) return;
    didSyncStep.current = true;

    const saved = me.profile?.onboarding_step ?? 0;
    const next = Math.min(saved + 1, TOTAL_STEPS);
    setStep(me.user.full_name ? next : Math.min(next, 2));
  }, [me]);
```

- [ ] **Step 3: Prefill step 5 from saved values**

Find:

```typescript
          <Step5
            visaHeld={me?.profile?.visa_status === "held"}
```

Replace with:

```typescript
          <Step5
            visaHeld={me?.profile?.visa_status === "held"}
            defaults={{
              name_kana: me?.profile?.name_kana ?? undefined,
              date_of_birth: me?.profile?.date_of_birth ?? undefined,
              gender: me?.profile?.gender ?? undefined,
              phone_number: me?.profile?.phone_number ?? undefined,
              mailing_address: me?.profile?.mailing_address ?? undefined,
              residence_card_expiration:
                me?.profile?.residence_card_expiration ?? undefined,
              visa_category: me?.profile?.visa_category ?? undefined,
            }}
```

- [ ] **Step 4: Accept and apply the `defaults` prop**

Find:

```typescript
function Step5({
  visaHeld,
  onNext,
  onBack,
  loading,
}: {
  visaHeld: boolean;
  onNext: (data: Step5Data) => Promise<void>;
  onBack: () => void;
  loading: boolean;
}) {
```

Replace with:

```typescript
function Step5({
  visaHeld,
  defaults,
  onNext,
  onBack,
  loading,
}: {
  visaHeld: boolean;
  defaults: Partial<Step5Data>;
  onNext: (data: Step5Data) => Promise<void>;
  onBack: () => void;
  loading: boolean;
}) {
```

- [ ] **Step 5: Seed the form with those defaults**

Find:

```typescript
    resolver: zodResolver(step5Schema),
    defaultValues: { gender: "male" },
  });
```

Replace with:

```typescript
    resolver: zodResolver(step5Schema),
    // Spread first, then fall back for gender specifically: a plain spread of
    // an absent value would overwrite the fallback with undefined and leave
    // the radio group unset.
    defaultValues: { ...defaults, gender: defaults.gender ?? "male" },
  });
```

- [ ] **Step 6: Verify types and lint**

```bash
cd frontend
npm run type-check
npm run lint
```
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add app/onboarding/page.tsx
git commit -m "Resume onboarding at the saved step and prefill step 5

The wizard hard-started at step 1, so a returning user had to click
through every step again to reach the one they had not done. It now
starts at the step after the last saved one, synced once so it cannot
fight the user's own Back navigation.

Users missing full_name start at step 2 regardless, since that is the
only step which captures it — otherwise they would jump to step 5,
complete onboarding, and be redirected away for good with the field
still unset.

Step 5 also prefills from saved values. Without that, revisiting a
completed step 5 rendered blank inputs and overwrote good data with
nulls on submit."
```

---

### Task 5: Add an Admin link to the dashboard nav

**Files:**
- Modify: `frontend/lib/i18n.ts`
- Modify: `frontend/app/dashboard/layout.tsx`

`/admin` currently has no inbound link anywhere — it links out ("← Back to app") but the only way in is typing the URL.

- [ ] **Step 1: Add the `admin` nav translation**

In `frontend/lib/i18n.ts`, find:

```typescript
    goToDashboard: { en: "Go to Dashboard", id: "Ke Dasbor", ja: "ダッシュボードへ" },
  },
```

Replace with:

```typescript
    goToDashboard: { en: "Go to Dashboard", id: "Ke Dasbor", ja: "ダッシュボードへ" },
    admin: { en: "Admin", id: "Admin", ja: "管理" },
  },
```

- [ ] **Step 2: Render the item for admins only**

In `frontend/app/dashboard/layout.tsx`, find:

```typescript
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { lang } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const NAV_ITEMS = [
    { href: "/dashboard/resumes", key: "resumes" },
    { href: "/dashboard/documents", key: "documents" },
    { href: "/dashboard/jobs", key: "jobs" },
    { href: "/dashboard/interview", key: "interview" },
    { href: "/dashboard/visa", key: "visa" },
    { href: "/dashboard/culture", key: "culture" },
    { href: "/dashboard/settings", key: "settings" },
  ] as const;
```

Replace with:

```typescript
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { lang } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const { data: me } = useMe();

  const NAV_ITEMS = [
    { href: "/dashboard/resumes", key: "resumes" },
    { href: "/dashboard/documents", key: "documents" },
    { href: "/dashboard/jobs", key: "jobs" },
    { href: "/dashboard/interview", key: "interview" },
    { href: "/dashboard/visa", key: "visa" },
    { href: "/dashboard/culture", key: "culture" },
    { href: "/dashboard/settings", key: "settings" },
    // /admin sits outside /dashboard and 403s for non-admins, so it is only
    // offered to those who can actually use it.
    ...(me?.user.role === "admin" ? [{ href: "/admin", key: "admin" }] : []),
  ];
```

Note the trailing `] as const;` becomes a plain `];`. The const assertion was decorative: `t(section, key: string, lang)` takes a plain `string` key (`lib/i18n.ts:1024`) and `isActive(href: string)` likewise, so nothing downstream depends on the literal types, and dropping it avoids a const-assertion-plus-spread edge case.

- [ ] **Step 3: Import `useMe`**

Find:

```typescript
import { useLang } from "@/lib/language-context";
```

Replace with:

```typescript
import { useMe } from "@/hooks/useMe";
import { useLang } from "@/lib/language-context";
```

- [ ] **Step 4: Verify types and lint**

```bash
cd frontend
npm run type-check
npm run lint
```
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add lib/i18n.ts app/dashboard/layout.tsx
git commit -m "Add an Admin nav item for admin users

/admin had no inbound link from anywhere in the app — it linked out via
'Back to app', but the only way in was typing the URL. The item renders
only when role is admin, since every /admin API route 403s for anyone
else."
```

---

### Task 6: Show a clean denial on `/admin` for non-admins

**Files:**
- Modify: `frontend/app/admin/page.tsx`

A non-admin visiting `/admin` currently gets the full panel chrome with four tabs, each rendering its own "Failed to load…" message from a 403. Nothing leaks — every `/admin/*` endpoint enforces `AdminUser` server-side — but it reads as a broken page rather than a closed door.

- [ ] **Step 1: Import `useMe` and `t`**

Find:

```typescript
export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("stats");
```

Replace with:

```typescript
export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("stats");
  const { data: me, isLoading: meLoading } = useMe();

  // The backend already enforces this on every /admin route; this only
  // replaces four separate "failed to load" panels with one clear answer.
  if (meLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (me?.user.role !== "admin") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <h1 className="text-xl font-semibold">Admin access required</h1>
        <p className="text-sm text-muted-foreground">
          Your account doesn&apos;t have permission to view this page.
        </p>
        <Link href="/dashboard/resumes" className="text-sm text-primary hover:underline">
          ← Back to app
        </Link>
      </div>
    );
  }
```

- [ ] **Step 2: Add the `useMe` import**

Find the import block at the top of `frontend/app/admin/page.tsx` and add this line immediately after the existing `import Link from "next/link";` line:

```typescript
import { useMe } from "@/hooks/useMe";
```

- [ ] **Step 3: Verify types, lint, and build**

```bash
cd frontend
npm run type-check
npm run lint
npm run build
```
Expected: all clean. The build must succeed — it is the only check that exercises the full page render path.

- [ ] **Step 4: Commit**

```bash
git add app/admin/page.tsx
git commit -m "Show a clear denial on /admin instead of four failed tabs

A non-admin reaching /admin saw the full Admin Panel chrome with every
tab rendering its own 'failed to load' error from a 403. Nothing
leaked — the backend enforces AdminUser on all /admin routes — but it
read as a broken page rather than a closed door."
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Backend**

```bash
cd backend && source .venv/bin/activate
ruff check .
ruff format --check .
mypy app/
pytest -q
```
Expected: lint/format/mypy clean. Test count rises from the 276 baseline by 11 — 9 in the new `test_usage_tracker.py` plus 2 in `test_auth_routes.py` — so roughly 287. Treat the number as a sanity check; the real bar is no failures and no drop from baseline, with coverage still over the 70% gate.

- [ ] **Step 2: Frontend**

```bash
cd frontend
npm run type-check
npm run lint
npm run build
```
Expected: all clean.

No commit for this task — verification only.

---

## Self-Review Notes (from writing-plans process)

**Spec coverage.** Part A → Task 1 (`QuotaStatus`, `get_quota_status`, admin exemption, fail-closed lookup, global cap retained, `record()` untouched). Part B → Task 4 (start-step sync, `full_name` exception, once-only ref guard, step 5 prefill). Part C → Tasks 2 and 3, both layers of the discard bug. Part E → Tasks 5 and 6. Part D is out of scope by instruction and has no task here.

**Placeholder scan.** No TBD/TODO. Every code step carries complete content; every command step states its expected output.

**Type consistency.** `QuotaStatus` field names (`scope`, `used`, `limit`, `window_hours`, `resets_in_seconds`) are identical in the dataclass, the tests, and the `AIBudgetError` construction in `check_budget`, and its `scope` values (`"user"`/`"global"`) match what `AIBudgetError` branches on. `get_quota_status(user_id, is_admin, db)` is called with that argument order in both tests and `check_budget`. `full_name` is spelled the same across `ProfileUpdateRequest` (Python), `ProfileUpdateRequest` (TypeScript), `step2Schema`, and the `mutateAsync` call. `Partial<Step5Data>` in Task 4's `defaults` prop matches the `Step5Data` type already derived from `step5BaseSchema`.

**Behaviour preservation.** Binding-cap selection returns the same cap the old sequential per-user-then-global checks did, for every non-admin case: user-exhausted alone → `"user"`; global-exhausted alone → `"global"`; both exhausted → tie resolves to `"user"`, matching the old order. This is why no existing test needed changing, and `test_check_budget_non_admin_blocked_by_user_cap` pins it.

**Deliberate ordering.** Task 2 (backend accepts `full_name`) precedes Task 3 (frontend sends it). Reversing them would ship a frontend writing a field the API silently drops. Task 3 precedes Task 4, whose start-step exception depends on `full_name` actually being persisted.

**Known gap left open.** Task 4's exception routes a user missing `full_name` to step 2, but they must then walk steps 3 and 4 again to reach step 5. Their previously saved answers are re-submitted with the same values, and `advance_onboarding_step` prevents `onboarding_step` from regressing, so nothing is lost — it is extra clicks, not data loss. Prefilling steps 2 through 4 was considered and left out as scope creep; step 5 is prefilled because there the blank-overwrite is a correctness bug rather than an inconvenience.
