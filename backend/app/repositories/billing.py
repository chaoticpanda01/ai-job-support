from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import (
    BillingEvent,
    NotificationLog,
    Subscription,
    SubscriptionLimit,
)
from app.models.enums import (
    BillingEventType,
    NotificationChannel,
    SubscriptionStatus,
    SubscriptionTier,
)
from app.repositories.base import BaseRepository


class SubscriptionRepository(BaseRepository[Subscription]):
    model = Subscription

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_active_for_user(self, user_id: UUID) -> Subscription | None:
        """Returns the single active or trialing subscription for a user."""
        return await self.session.scalar(
            select(Subscription).where(
                Subscription.user_id == user_id,
                Subscription.status.in_(
                    [SubscriptionStatus.active, SubscriptionStatus.trialing]
                ),
            )
        )

    async def get_by_stripe_id(
        self, stripe_subscription_id: str
    ) -> Subscription | None:
        return await self.session.scalar(
            select(Subscription).where(
                Subscription.stripe_subscription_id == stripe_subscription_id
            )
        )

    async def upsert_from_stripe(
        self,
        user_id: UUID,
        stripe_subscription_id: str,
        stripe_customer_id: str,
        tier: SubscriptionTier,
        status: SubscriptionStatus,
        current_period_start: datetime,
        current_period_end: datetime,
    ) -> Subscription:
        existing = await self.get_by_stripe_id(stripe_subscription_id)
        if existing is not None:
            return await self.update(
                existing,
                tier=tier,
                status=status,
                current_period_start=current_period_start,
                current_period_end=current_period_end,
            )
        return await self.create(
            user_id=user_id,
            stripe_subscription_id=stripe_subscription_id,
            stripe_customer_id=stripe_customer_id,
            tier=tier,
            status=status,
            current_period_start=current_period_start,
            current_period_end=current_period_end,
        )

    async def cancel(self, stripe_subscription_id: str) -> Subscription | None:
        sub = await self.get_by_stripe_id(stripe_subscription_id)
        if sub is None:
            return None
        return await self.update(
            sub,
            status=SubscriptionStatus.cancelled,
            cancelled_at=datetime.now(tz=timezone.utc),
        )


class BillingEventRepository(BaseRepository[BillingEvent]):
    model = BillingEvent

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def exists_by_stripe_event_id(self, stripe_event_id: str) -> bool:
        """Idempotency check — return True if this Stripe event was already processed."""
        result = await self.session.scalar(
            select(BillingEvent.id).where(
                BillingEvent.stripe_event_id == stripe_event_id
            )
        )
        return result is not None

    async def list_for_user(
        self, user_id: UUID, *, offset: int = 0, limit: int = 20
    ) -> list[BillingEvent]:
        return await self._scalars(
            select(BillingEvent)
            .where(BillingEvent.user_id == user_id)
            .order_by(BillingEvent.created_at.desc())
            .offset(offset)
            .limit(limit)
        )


class SubscriptionLimitRepository:
    """Read-only — limits are seeded at deploy time and never changed at runtime."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_for_tier(self, tier: SubscriptionTier) -> SubscriptionLimit | None:
        return await self.session.get(SubscriptionLimit, tier)

    async def get_all(self) -> list[SubscriptionLimit]:
        result = await self.session.scalars(select(SubscriptionLimit))
        return list(result.all())


class NotificationLogRepository(BaseRepository[NotificationLog]):
    model = NotificationLog

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def was_sent_recently(
        self,
        user_id: UUID,
        template_id: str,
        within_seconds: int,
    ) -> bool:
        """
        Deduplication check. Returns True if the same template was sent
        to this user within the cooldown window.
        """
        from sqlalchemy import func, text
        cutoff = func.now() - func.cast(
            f"{within_seconds} seconds", type_=text("interval")
        )
        result = await self.session.scalar(
            select(NotificationLog.id).where(
                NotificationLog.user_id == user_id,
                NotificationLog.template_id == template_id,
                NotificationLog.created_at >= cutoff,
            ).limit(1)
        )
        return result is not None

    async def record(
        self,
        user_id: UUID | None,
        channel: NotificationChannel,
        template_id: str,
        provider_id: str | None = None,
    ) -> NotificationLog:
        return await self.create(
            user_id=user_id,
            channel=channel,
            template_id=template_id,
            provider_id=provider_id,
        )
