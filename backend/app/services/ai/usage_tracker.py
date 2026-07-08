"""
AI usage budget enforcement and logging.

Two operations:
  check_budget(user_id, feature, db) — runs BEFORE every AI call.
      Enforces a flat per-user fair-use quota (DAILY_AI_CALL_LIMIT calls/day,
      across all AI features combined). Raises AIBudgetError (→ HTTP 429) once
      the user's calls today reach the limit.

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
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.ai_usage import AIUsageRepository

logger = logging.getLogger(__name__)

# Approximate cost per token in USD (claude-sonnet-4-x pricing, rounded up)
# Used for informational cost_usd column only — not for billing.
_INPUT_COST_PER_TOKEN = Decimal("0.000003")
_OUTPUT_COST_PER_TOKEN = Decimal("0.000015")

# Flat fair-use ceiling: total AI calls/day, summed across every feature,
# applied equally to all users regardless of subscription tier.
DAILY_AI_CALL_LIMIT = 5


class AIBudgetError(Exception):
    """Raised when a user has exceeded their daily fair-use AI call quota."""

    def __init__(self, used: int, limit: int) -> None:
        self.used = used
        self.limit = limit
        super().__init__(
            f"Daily AI usage limit reached: used={used}, limit={limit}. Try again tomorrow."
        )


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
        Enforce the flat daily fair-use quota (DAILY_AI_CALL_LIMIT calls/day,
        all features combined). Raises AIBudgetError once the user hits it.
        """
        repo = AIUsageRepository(db)
        used = await repo.get_daily_call_count(user_id)
        if used >= DAILY_AI_CALL_LIMIT:
            raise AIBudgetError(used=used, limit=DAILY_AI_CALL_LIMIT)

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
