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
