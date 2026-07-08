from decimal import Decimal
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

    async def get_daily_call_count(self, user_id: UUID) -> int:
        """
        Returns total AI call count across all features for the current
        calendar day (server timezone). Used by the per-user fair-use quota
        enforced in check_budget — deliberately whole-app, not per-feature,
        so a user can't just spread calls across endpoints to dodge the cap.
        """
        row = await self.session.execute(
            select(func.count()).where(
                AIUsageLog.user_id == user_id,
                func.date_trunc("day", AIUsageLog.created_at) == func.date_trunc("day", func.now()),
            )
        )
        return row.scalar_one()

    async def get_all_features_this_month(self, user_id: UUID) -> list[dict]:
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

    async def get_top_users_this_month(self, *, limit: int = 20) -> list[dict]:
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
