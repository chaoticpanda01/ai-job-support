from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import (
    BillingEventType,
    NotificationChannel,
    NotificationStatus,
    SubscriptionStatus,
    SubscriptionTier,
    sa_billing_event_type,
    sa_notification_channel,
    sa_notification_status,
    sa_subscription_status,
    sa_subscription_tier,
)

if TYPE_CHECKING:
    from app.models.user import User


class Subscription(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Active Stripe subscription record. Written only by the Stripe webhook
    handler — never by the subscribe endpoint.

    A partial unique index ensures only one active/trialing subscription
    per user: idx_subscriptions_active_user.
    """

    __tablename__ = "subscriptions"
    __table_args__ = (
        UniqueConstraint("stripe_subscription_id", name="subscriptions_stripe_sub_uk"),
        CheckConstraint(
            "current_period_end > current_period_start",
            name="subscriptions_period_order",
        ),
        Index(
            "idx_subscriptions_active_user",
            "user_id",
            unique=True,
            postgresql_where=text("status IN ('active', 'trialing')"),
        ),
    )

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="subscriptions_user_fk"),
        nullable=False,
        index=True,
    )
    stripe_subscription_id: Mapped[str] = mapped_column(String(255), nullable=False)
    stripe_customer_id: Mapped[str] = mapped_column(String(255), nullable=False)
    tier: Mapped[SubscriptionTier] = mapped_column(sa_subscription_tier, nullable=False)
    status: Mapped[SubscriptionStatus] = mapped_column(
        sa_subscription_status, nullable=False, server_default=text("'active'")
    )
    current_period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    current_period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # --- Relationships ---
    user: Mapped["User"] = relationship("User", back_populates="subscriptions")


class BillingEvent(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """
    Append-only audit log of Stripe billing events. Never update rows.
    stripe_event_id unique constraint ensures idempotency on duplicate webhooks.
    """

    __tablename__ = "billing_events"
    __table_args__ = (UniqueConstraint("stripe_event_id", name="billing_events_stripe_ev_uk"),)

    user_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL", name="billing_events_user_fk"),
        index=True,
    )
    stripe_event_id: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[BillingEventType] = mapped_column(sa_billing_event_type, nullable=False)
    tier_from: Mapped[SubscriptionTier | None] = mapped_column(sa_subscription_tier)
    tier_to: Mapped[SubscriptionTier | None] = mapped_column(sa_subscription_tier)
    amount_jpy: Mapped[int | None] = mapped_column(Integer)

    # --- Relationships ---
    user: Mapped["User | None"] = relationship("User", back_populates="billing_events")


class NotificationLog(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """
    Append-only log of every outbound notification.

    Before sending any email, check that template_id hasn't been sent to this
    user within the cooldown window by querying this table. The repository
    provides check_recent() for this purpose.
    """

    __tablename__ = "notification_log"
    __table_args__ = (
        Index(
            "idx_notification_log_user_template",
            "user_id",
            "template_id",
            "created_at",
        ),
    )

    user_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL", name="notification_log_user_fk"),
    )
    channel: Mapped[NotificationChannel] = mapped_column(sa_notification_channel, nullable=False)
    template_id: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[NotificationStatus] = mapped_column(
        sa_notification_status, nullable=False, server_default=text("'sent'")
    )
    provider_id: Mapped[str | None] = mapped_column(Text)

    # --- Relationships ---
    user: Mapped["User | None"] = relationship("User", back_populates="notification_logs")


class SubscriptionLimit(Base):
    """
    Reference table for per-tier feature limits. Seeded at deploy time.
    -1 means unlimited (used for 'pro' tier).
    """

    __tablename__ = "subscription_limits"

    tier: Mapped[SubscriptionTier] = mapped_column(sa_subscription_tier, primary_key=True)
    monthly_resume_uploads: Mapped[int] = mapped_column(Integer, nullable=False)
    monthly_analyses: Mapped[int] = mapped_column(Integer, nullable=False)
    monthly_rirekisho: Mapped[int] = mapped_column(Integer, nullable=False)
    monthly_shokumu: Mapped[int] = mapped_column(Integer, nullable=False)
    monthly_job_translate: Mapped[int] = mapped_column(Integer, nullable=False)
    monthly_interviews: Mapped[int] = mapped_column(Integer, nullable=False)
    monthly_token_budget: Mapped[int] = mapped_column(Integer, nullable=False)
    pdf_export_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    full_culture_access: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
