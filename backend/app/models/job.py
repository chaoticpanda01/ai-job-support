from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    desc,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import (
    ApplicationStatus,
    JobSourcePlatform,
    OriginalLanguage,
    sa_application_status,
    sa_job_source_platform,
    sa_original_language,
)

if TYPE_CHECKING:
    from app.models.resume import Resume
    from app.models.user import User


class JobPosting(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """
    Translated Japanese job posting. Shared across users — deduplication by URL.

    Soft-delete via deleted_at. All queries must filter WHERE deleted_at IS NULL.
    The repository enforces this automatically.

    foreigner_friendliness_score is extracted from the AI translation response
    into a dedicated column for server-side sorting and filtering.
    """

    __tablename__ = "job_postings"
    __table_args__ = (
        CheckConstraint(
            "foreigner_friendliness_score IS NULL "
            "OR foreigner_friendliness_score BETWEEN 0 AND 100",
            name="job_postings_friendliness_range",
        ),
        # Partial unique index: only one active posting per source URL
        Index(
            "idx_job_postings_source_url",
            "source_url",
            unique=True,
            postgresql_where=text("source_url IS NOT NULL AND deleted_at IS NULL"),
        ),
        Index(
            "idx_job_postings_created_at",
            desc("created_at"),
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "idx_job_postings_company",
            "original_company",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("idx_job_postings_structured", "structured_data", postgresql_using="gin"),
        Index(
            "idx_job_postings_friendliness",
            desc("foreigner_friendliness_score"),
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "idx_job_postings_title_search",
            text(
                "to_tsvector('simple'::regconfig, (COALESCE(translated_title, ''::text) "
                "|| ' '::text) || COALESCE(translation_summary, ''::text))"
            ),
            postgresql_using="gin",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    source_url: Mapped[str | None] = mapped_column(Text)
    source_platform: Mapped[JobSourcePlatform] = mapped_column(
        sa_job_source_platform, nullable=False, server_default=text("'manual'")
    )
    original_title: Mapped[str | None] = mapped_column(Text)
    original_company: Mapped[str | None] = mapped_column(String(500))
    original_description: Mapped[str | None] = mapped_column(Text)
    original_language: Mapped[OriginalLanguage] = mapped_column(
        sa_original_language, nullable=False, server_default=text("'ja'")
    )
    translated_title: Mapped[str | None] = mapped_column(Text)
    translated_description: Mapped[str | None] = mapped_column(Text)
    translation_summary: Mapped[str | None] = mapped_column(Text)
    structured_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    foreigner_friendliness_score: Mapped[float | None] = mapped_column(Numeric(5, 2))
    submitted_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL", name="job_postings_submitted_by_fk"),
    )
    cached_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # --- Relationships ---
    submitter: Mapped["User | None"] = relationship("User", foreign_keys=[submitted_by])
    matches: Mapped[list["JobMatch"]] = relationship("JobMatch", back_populates="job_posting")
    saved_by: Mapped[list["SavedJob"]] = relationship("SavedJob", back_populates="job_posting")
    applications: Mapped[list["JobApplication"]] = relationship(
        "JobApplication", back_populates="job_posting"
    )


class JobMatch(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """AI-scored compatibility between a user's resume and a job posting."""

    __tablename__ = "job_matches"
    __table_args__ = (
        CheckConstraint(
            "match_score BETWEEN 0 AND 100",
            name="job_matches_score_range",
        ),
        UniqueConstraint(
            "user_id",
            "resume_id",
            "job_posting_id",
            name="job_matches_unique_triple",
        ),
        Index("idx_job_matches_user_resume", "user_id", "resume_id"),
        Index("idx_job_matches_score", "user_id", desc("match_score")),
    )

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="job_matches_user_fk"),
        nullable=False,
    )
    resume_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("resumes.id", ondelete="CASCADE", name="job_matches_resume_fk"),
        nullable=False,
    )
    job_posting_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("job_postings.id", ondelete="CASCADE", name="job_matches_job_fk"),
        nullable=False,
    )
    match_score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    match_breakdown: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    recommendations: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    # --- Relationships ---
    user: Mapped["User"] = relationship("User", back_populates="job_matches")
    resume: Mapped["Resume"] = relationship("Resume")
    job_posting: Mapped["JobPosting"] = relationship("JobPosting", back_populates="matches")


class SavedJob(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """Lightweight bookmark. Separate from JobMatch — saving ≠ applying."""

    __tablename__ = "saved_jobs"
    __table_args__ = (
        UniqueConstraint("user_id", "job_posting_id", name="saved_jobs_unique"),
        Index("idx_saved_jobs_user_id", "user_id"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="saved_jobs_user_fk"),
        nullable=False,
    )
    job_posting_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("job_postings.id", ondelete="CASCADE", name="saved_jobs_job_fk"),
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text)

    # --- Relationships ---
    user: Mapped["User"] = relationship("User", back_populates="saved_jobs")
    job_posting: Mapped["JobPosting"] = relationship("JobPosting", back_populates="saved_by")


class JobApplication(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Tracks a user's application pipeline per job.

    Status transitions:
        planning → applied → interviewing → offered | rejected
        any state → withdrawn
    """

    __tablename__ = "job_applications"
    __table_args__ = (
        UniqueConstraint("user_id", "job_posting_id", name="job_applications_unique"),
        Index("idx_job_applications_user_id", "user_id"),
        Index("idx_job_applications_status", "user_id", "status"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="job_applications_user_fk"),
        nullable=False,
    )
    job_posting_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("job_postings.id", ondelete="CASCADE", name="job_applications_job_fk"),
        nullable=False,
    )
    status: Mapped[ApplicationStatus] = mapped_column(
        sa_application_status, nullable=False, server_default=text("'planning'")
    )
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)

    # --- Relationships ---
    user: Mapped["User"] = relationship("User", back_populates="job_applications")
    job_posting: Mapped["JobPosting"] = relationship("JobPosting", back_populates="applications")
