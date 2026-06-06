"""
AI usage budget enforcement and logging.

Two operations:
  check_budget(user_id, feature, db) — runs BEFORE every AI call.
      Reads v_user_monthly_usage and subscription_limits.
      Raises AIBudgetError (→ HTTP 429) if the user is over their token budget.

  record(user_id, feature, model, input_tokens, output_tokens, latency_ms, db)
      — runs AFTER every AI call.
      Appends a row to ai_usage_logs (partitioned table).
      Never raises — log failures must not abort the response.
"""

from __future__ import annotations

import logging
import time
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import SubscriptionLimit
from app.models.user import User
from app.repositories.ai_usage import AIUsageRepository

logger = logging.getLogger(__name__)

# Approximate cost per token in USD (claude-sonnet-4-x pricing, rounded up)
# Used for informational cost_usd column only — not for billing.
_INPUT_COST_PER_TOKEN = Decimal("0.000003")
_OUTPUT_COST_PER_TOKEN = Decimal("0.000015")


class AIBudgetError(Exception):
    """Raised when a user has exceeded their monthly token budget."""

    def __init__(self, used: int, limit: int) -> None:
        self.used = used
        self.limit = limit
        super().__init__(
            f"Monthly AI token budget exceeded: used={used}, limit={limit}"
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
        Budget enforcement is disabled — platform is fully free.
        All users have unlimited access. This method is a no-op.

        To re-enable: restore the tier/subscription_limits logic from git history
        (see the billing feature branch backup).
        """
        return

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
