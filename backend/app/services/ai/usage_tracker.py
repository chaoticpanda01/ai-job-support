"""
AI usage budget enforcement and logging.

Two operations:
  check_budget(user_id, feature, db) — runs BEFORE every AI call.
      Enforces a flat per-user fair-use quota (AI_CALL_LIMIT calls per
      AI_CALL_WINDOW_HOURS, across all AI features combined). Raises
      AIBudgetError (→ HTTP 429) once the user's calls in the trailing
      window reach the limit.

      This is a fair-use ceiling, not a billing tier — every user gets the
      same limit regardless of subscription. It exists to bound worst-case
      Gemini API cost from a single compromised/scripted account, not to
      gate features behind payment.

  record(user_id, feature, model, input_tokens, output_tokens, latency_ms, db)
      — runs AFTER every AI call.
      Appends a row to ai_usage_logs (partitioned table).
      Never raises — log failures must not abort the response.
"""

from __future__ import annotations

import logging
import math
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.ai_usage import AIUsageRepository

logger = logging.getLogger(__name__)

# Approximate cost per token in USD (claude-sonnet-4-x pricing, rounded up)
# Used for informational cost_usd column only — not for billing.
_INPUT_COST_PER_TOKEN = Decimal("0.000003")
_OUTPUT_COST_PER_TOKEN = Decimal("0.000015")

# Flat fair-use ceiling: total AI calls per rolling window, summed across
# every feature, applied equally to all users regardless of subscription tier.
# Kept just under Google's Gemini free-tier ceiling (20 requests/day for this
# project) so a user hits this clean "daily limit reached" message before the
# raw Gemini 429. Raise substantially if billing is enabled on the Gemini project.
AI_CALL_LIMIT = 18
AI_CALL_WINDOW_HOURS = 24


class AIBudgetError(Exception):
    """Raised when a user has exceeded their rolling-window fair-use AI call quota."""

    def __init__(
        self,
        used: int,
        limit: int,
        window_hours: int = AI_CALL_WINDOW_HOURS,
        retry_after_seconds: int = 0,
    ) -> None:
        self.used = used
        self.limit = limit
        self.window_hours = window_hours
        # Seconds until the oldest call in the window ages out and frees up
        # a slot. It's an estimate, not an exact reset instant — the window
        # is rolling, so each call ages out individually rather than the
        # whole quota resetting at once.
        self.retry_after_seconds = retry_after_seconds
        super().__init__(
            f"AI usage limit reached: used={used}, limit={limit} per {window_hours} hours. "
            f"Try again in {_format_duration(retry_after_seconds)}."
        )

    def to_http_exception(self) -> HTTPException:
        """Shared 429 shape for every route that catches this exception."""
        return HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(self),
            headers={"Retry-After": str(self.retry_after_seconds)},
        )


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


class UsageTracker:
    """
    Stateless service — each method receives the DB session from the caller.
    """

    async def check_budget(
        self,
        user_id: UUID,
        feature: str,
        db: AsyncSession,
    ) -> None:
        """
        Enforce the flat rolling-window fair-use quota (AI_CALL_LIMIT calls
        per AI_CALL_WINDOW_HOURS, all features combined). Raises
        AIBudgetError once the user hits it, with retry_after_seconds set to
        when the oldest call in the window ages out and frees a slot.
        """
        repo = AIUsageRepository(db)
        used, oldest_call_at = await repo.get_recent_usage_window(user_id, AI_CALL_WINDOW_HOURS)
        if used >= AI_CALL_LIMIT:
            retry_after_seconds = 0
            if oldest_call_at is not None:
                reset_at = oldest_call_at + timedelta(hours=AI_CALL_WINDOW_HOURS)
                retry_after_seconds = max(
                    0, math.ceil((reset_at - datetime.now(UTC)).total_seconds())
                )
            raise AIBudgetError(
                used=used,
                limit=AI_CALL_LIMIT,
                window_hours=AI_CALL_WINDOW_HOURS,
                retry_after_seconds=retry_after_seconds,
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
