from datetime import datetime
from typing import Any, TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import (
    AnalysisType,
    PreferredLanguage,
    sa_analysis_type,
    sa_preferred_language,
)

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.job import JobPosting


class Resume(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Uploaded resume file. parsed_content is populated asynchronously by
    the Celery analysis task after upload.

    Only one resume per user can have is_primary=True (enforced by a partial
    unique index in the DB: idx_resumes_one_primary).
    """

    __tablename__ = "resumes"
    __table_args__ = (
        CheckConstraint(
            "file_size_bytes > 0 AND file_size_bytes <= 10485760",
            name="resumes_file_size_range",
        ),
        CheckConstraint(
            "mime_type IN ('application/pdf', "
            "'application/vnd.openxmlformats-officedocument.wordprocessingml.document')",
            name="resumes_mime_type_allowed",
        ),
        # Partial unique index — only one PRIMARY per user.
        # Defined as an Index here; actual DDL is in the baseline migration.
        Index(
            "idx_resumes_one_primary",
            "user_id",
            unique=True,
            postgresql_where=text("is_primary = TRUE"),
        ),
        Index("idx_resumes_created_at", "user_id", "created_at"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="resumes_user_id_fk"),
        nullable=False,
        index=True,
    )
    file_name: Mapped[str] = mapped_column(String(500), nullable=False)
    file_url: Mapped[str] = mapped_column(Text, nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    language: Mapped[PreferredLanguage] = mapped_column(
        sa_preferred_language, nullable=False, server_default=text("'id'")
    )
    is_primary: Mapped[bool] = mapped_column(
        nullable=False, server_default=text("false")
    )
    parsed_content: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    # --- Relationships ---
    user: Mapped["User"] = relationship("User", back_populates="resumes")
    analyses: Mapped[list["ResumeAnalysis"]] = relationship(
        "ResumeAnalysis", back_populates="resume", cascade="all, delete-orphan"
    )


class ResumeAnalysis(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """
    AI analysis result for a resume. job_posting_id is nullable with SET NULL
    on delete — analyses survive job removal; UI renders "job no longer available"
    when job_posting_id is non-null but the referenced row is gone (soft-deleted).
    """

    __tablename__ = "resume_analyses"
    __table_args__ = (
        CheckConstraint("input_tokens >= 0", name="resume_analyses_input_tokens_gte0"),
        CheckConstraint("output_tokens >= 0", name="resume_analyses_output_tokens_gte0"),
        Index("idx_resume_analyses_result", "result", postgresql_using="gin"),
    )

    resume_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("resumes.id", ondelete="CASCADE", name="resume_analyses_resume_fk"),
        nullable=False,
        index=True,
    )
    analysis_type: Mapped[AnalysisType] = mapped_column(
        sa_analysis_type, nullable=False, server_default=text("'general'")
    )
    # Nullable FK; SET NULL when job is (hard) deleted.
    # We use soft-delete on job_postings, so this FK should almost never be nulled.
    job_posting_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("job_postings.id", ondelete="SET NULL", name="resume_analyses_job_fk"),
    )
    ai_model: Mapped[str] = mapped_column(String(100), nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    result: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

    # --- Relationships ---
    resume: Mapped["Resume"] = relationship("Resume", back_populates="analyses")
    job_posting: Mapped["JobPosting | None"] = relationship("JobPosting")
