from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_usage import AIUsageLog
from app.repositories.base import BaseRepository


class AIUsageRepository(BaseRepository[AIUsageLog]):
    model = AIUsageLog

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_monthly_stats(self, user_id: UUID, feature: str) -> tuple[int, int, Decimal]:
        """
        Returns (call_count, total_tokens, total_cost_usd) for the current
        calendar month. Used by pre-call budget enforcement.
        """
        row = await self.session.execute(
            select(
                func.count().label("call_count"),
                func.coalesce(
                    func.sum(AIUsageLog.input_tokens + AIUsageLog.output_tokens), 0
                ).label("total_tokens"),
                func.coalesce(func.sum(AIUsageLog.cost_usd), Decimal("0")).label("total_cost_usd"),
            ).where(
                AIUsageLog.user_id == user_id,
                AIUsageLog.feature == feature,
                func.date_trunc("month", AIUsageLog.created_at)
                == func.date_trunc("month", func.now()),
            )
        )
        r = row.one()
        return r.call_count, r.total_tokens, r.total_cost_usd

    async def get_recent_usage_window(
        self, user_id: UUID, window_hours: int
    ) -> tuple[int, datetime | None]:
        """
        Returns (call_count, oldest_call_at) across all features in the
        trailing `window_hours` (rolling window, not calendar-aligned).
        Used by the per-user fair-use quota enforced in check_budget —
        deliberately whole-app, not per-feature, so a user can't just spread
        calls across endpoints to dodge the cap.

        oldest_call_at is the timestamp of the earliest call still inside the
        window — once that call ages out (oldest_call_at + window_hours), the
        count drops by one and a new call is allowed. It's None when the
        window is empty. Callers use it to compute a reset countdown.
        """
        cutoff = datetime.now(UTC) - timedelta(hours=window_hours)
        row = await self.session.execute(
            select(
                func.count().label("call_count"),
                func.min(AIUsageLog.created_at).label("oldest_call_at"),
            ).where(
                AIUsageLog.user_id == user_id,
                AIUsageLog.created_at >= cutoff,
            )
        )
        r = row.one()
        return r.call_count, r.oldest_call_at

    async def get_total_usage_window(self, window_hours: int) -> tuple[int, datetime | None]:
        """
        Returns (call_count, oldest_call_at) across ALL users and features in the
        trailing `window_hours`. Used by the global circuit-breaker in
        check_budget to keep the whole app under the shared Gemini free-tier
        daily quota. Same shape as get_recent_usage_window but without the
        per-user filter.
        """
        cutoff = datetime.now(UTC) - timedelta(hours=window_hours)
        row = await self.session.execute(
            select(
                func.count().label("call_count"),
                func.min(AIUsageLog.created_at).label("oldest_call_at"),
            ).where(
                AIUsageLog.created_at >= cutoff,
            )
        )
        r = row.one()
        return r.call_count, r.oldest_call_at

    async def get_all_features_this_month(self, user_id: UUID) -> list[dict[str, Any]]:
        """
        Returns per-feature usage for the current month.
        Used by GET /users/usage to populate the frontend usage meters.
        """
        rows = await self.session.execute(
            select(
                AIUsageLog.feature,
                func.count().label("call_count"),
                func.coalesce(
                    func.sum(AIUsageLog.input_tokens + AIUsageLog.output_tokens), 0
                ).label("total_tokens"),
                func.coalesce(func.sum(AIUsageLog.cost_usd), Decimal("0")).label("total_cost_usd"),
            )
            .where(
                AIUsageLog.user_id == user_id,
                func.date_trunc("month", AIUsageLog.created_at)
                == func.date_trunc("month", func.now()),
            )
            .group_by(AIUsageLog.feature)
        )
        return [
            {
                "feature": r.feature,
                "call_count": r.call_count,
                "total_tokens": r.total_tokens,
                "total_cost_usd": r.total_cost_usd,
            }
            for r in rows.all()
        ]

    async def record(
        self,
        *,
        user_id: UUID | None,
        feature: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        cost_usd: Decimal | None,
        latency_ms: int | None,
    ) -> AIUsageLog:
        return await self.create(
            user_id=user_id,
            feature=feature,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost_usd,
            latency_ms=latency_ms,
        )

    async def get_top_users_this_month(self, *, limit: int = 20) -> list[dict[str, Any]]:
        """Admin/monitoring: identify potential abusers by token spend."""
        rows = await self.session.execute(
            select(
                AIUsageLog.user_id,
                func.sum(AIUsageLog.input_tokens + AIUsageLog.output_tokens).label("total_tokens"),
                func.coalesce(func.sum(AIUsageLog.cost_usd), Decimal("0")).label("total_cost_usd"),
            )
            .where(
                AIUsageLog.user_id.is_not(None),
                func.date_trunc("month", AIUsageLog.created_at)
                == func.date_trunc("month", func.now()),
            )
            .group_by(AIUsageLog.user_id)
            .order_by(func.sum(AIUsageLog.cost_usd).desc())
            .limit(limit)
        )
        return [
            {
                "user_id": r.user_id,
                "total_tokens": r.total_tokens,
                "total_cost_usd": r.total_cost_usd,
            }
            for r in rows.all()
        ]
