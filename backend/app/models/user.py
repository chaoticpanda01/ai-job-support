from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import (
    JapaneseLevel,
    PreferredLanguage,
    SubscriptionTier,
    UserRole,
    VisaStatus,
    sa_japanese_level,
    sa_preferred_language,
    sa_subscription_tier,
    sa_user_role,
    sa_visa_status,
)

if TYPE_CHECKING:
    from app.models.billing import BillingEvent, NotificationLog, Subscription
    from app.models.document import GeneratedDocument
    from app.models.interview import InterviewSession
    from app.models.job import JobApplication, JobMatch, SavedJob
    from app.models.resume import Resume
    from app.models.visa import VisaConsultation


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("clerk_id", name="users_clerk_id_uk"),
        UniqueConstraint("email", name="users_email_uk"),
        CheckConstraint(
            "email ~* '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'",
            name="users_email_fmt",
        ),
    )

    clerk_id: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    full_name: Mapped[str | None] = mapped_column(String(255))
    subscription_tier: Mapped[SubscriptionTier] = mapped_column(
        sa_subscription_tier, nullable=False, server_default=text("'free'")
    )
    role: Mapped[UserRole] = mapped_column(
        sa_user_role, nullable=False, server_default=text("'user'")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # --- Relationships ---
    profile: Mapped["Profile | None"] = relationship(
        "Profile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    resumes: Mapped[list["Resume"]] = relationship(
        "Resume", back_populates="user", cascade="all, delete-orphan"
    )
    generated_documents: Mapped[list["GeneratedDocument"]] = relationship(
        "GeneratedDocument", back_populates="user", cascade="all, delete-orphan"
    )
    interview_sessions: Mapped[list["InterviewSession"]] = relationship(
        "InterviewSession", back_populates="user", cascade="all, delete-orphan"
    )
    visa_consultations: Mapped[list["VisaConsultation"]] = relationship(
        "VisaConsultation", back_populates="user", cascade="all, delete-orphan"
    )
    job_matches: Mapped[list["JobMatch"]] = relationship(
        "JobMatch", back_populates="user", cascade="all, delete-orphan"
    )
    saved_jobs: Mapped[list["SavedJob"]] = relationship(
        "SavedJob", back_populates="user", cascade="all, delete-orphan"
    )
    job_applications: Mapped[list["JobApplication"]] = relationship(
        "JobApplication", back_populates="user", cascade="all, delete-orphan"
    )
    subscriptions: Mapped[list["Subscription"]] = relationship(
        "Subscription", back_populates="user", cascade="all, delete-orphan"
    )
    billing_events: Mapped[list["BillingEvent"]] = relationship(
        "BillingEvent", back_populates="user"
    )
    notification_logs: Mapped[list["NotificationLog"]] = relationship(
        "NotificationLog", back_populates="user"
    )


class Profile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Extended job-seeking preferences. One-to-one with User (enforced by unique
    constraint on user_id).

    onboarding_step:
        0 = not started
        1 = basic info saved
        2 = resume uploaded
        3 = preferences set
        4 = completed

    onboarding_completed is a STORED GENERATED column — always derived from
    onboarding_step = 4. Never set it directly.
    """

    __tablename__ = "profiles"
    __table_args__ = (
        UniqueConstraint("user_id", name="profiles_user_id_uk"),
        CheckConstraint(
            "years_experience >= 0 AND years_experience <= 80",
            name="profiles_years_experience_range",
        ),
        CheckConstraint(
            "onboarding_step BETWEEN 0 AND 4",
            name="profiles_onboarding_step_range",
        ),
        Index("idx_profiles_user_id", "user_id"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="profiles_user_id_fk"),
        nullable=False,
    )
    nationality: Mapped[str] = mapped_column(
        String(100), nullable=False, server_default=text("'Indonesian'")
    )
    japanese_level: Mapped[JapaneseLevel] = mapped_column(
        sa_japanese_level, nullable=False, server_default=text("'none'")
    )
    target_industry: Mapped[list[str]] = mapped_column(
        ARRAY(Text()), nullable=False, server_default=text("'{}'")
    )
    target_role: Mapped[list[str]] = mapped_column(
        ARRAY(Text()), nullable=False, server_default=text("'{}'")
    )
    years_experience: Mapped[int | None] = mapped_column(SmallInteger)
    current_location: Mapped[str | None] = mapped_column(String(255))
    target_location: Mapped[str | None] = mapped_column(String(255))
    visa_status: Mapped[VisaStatus] = mapped_column(
        sa_visa_status, nullable=False, server_default=text("'none'")
    )
    preferred_language: Mapped[PreferredLanguage] = mapped_column(
        sa_preferred_language, nullable=False, server_default=text("'id'")
    )
    onboarding_step: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("0")
    )
    # STORED GENERATED: computed by PostgreSQL. Read-only in ORM.
    onboarding_completed: Mapped[bool] = mapped_column(
        Computed("onboarding_step = 4", persisted=True),
    )
    # Explicit AI-processing consent (Section 8.4). NULL = not yet given.
    consent_given_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # --- Relationships ---
    user: Mapped["User"] = relationship("User", back_populates="profile")
