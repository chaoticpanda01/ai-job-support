from decimal import Decimal
from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, Numeric, String, text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin


class AIUsageLog(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """
    Immutable append-only log of every Gemini (and fallback) API call.

    The underlying PostgreSQL table is partitioned by RANGE (created_at) —
    one partition per month. SQLAlchemy is unaware of this; it queries the
    parent table and PostgreSQL's partition pruning handles the rest.

    The pg_cron job 'create-ai-usage-partition' creates next month's partition
    on the 25th of each month. Pre-created through 2027-12.

    user_id is nullable for system-level calls (e.g., background health checks).
    """

    __tablename__ = "ai_usage_logs"
    __table_args__ = (
        CheckConstraint("input_tokens >= 0", name="ai_usage_input_tokens_gte0"),
        CheckConstraint("output_tokens >= 0", name="ai_usage_output_tokens_gte0"),
        CheckConstraint(
            "latency_ms IS NULL OR latency_ms >= 0",
            name="ai_usage_latency_gte0",
        ),
        Index("idx_ai_usage_feature_date", "feature", "created_at"),
        # postgresql_partition_by is intentionally omitted — partitioning is
        # transparent to SQLAlchemy and managed entirely by the DB / migration.
    )

    user_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL", name="ai_usage_logs_user_fk"),
        index=True,
    )
    feature: Mapped[str] = mapped_column(String(100), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    latency_ms: Mapped[int | None] = mapped_column(Integer)
