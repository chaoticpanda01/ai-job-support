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
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin
from app.models.enums import (
    InterviewStatus,
    InterviewType,
    MessageRole,
    PreferredLanguage,
    sa_interview_status,
    sa_interview_type,
    sa_message_role,
    sa_preferred_language,
)

if TYPE_CHECKING:
    from app.models.user import User


class InterviewSession(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """
    One practice interview session. Contains metadata and aggregate feedback.
    Messages are stored in InterviewMessage (one row per conversation turn).
    """

    __tablename__ = "interview_sessions"
    __table_args__ = (
        CheckConstraint(
            "overall_score IS NULL OR overall_score BETWEEN 0 AND 100",
            name="interview_sessions_score_range",
        ),
        CheckConstraint(
            "completed_at IS NULL OR completed_at >= created_at",
            name="interview_sessions_timing",
        ),
        Index("idx_interview_sessions_status", "user_id", "status"),
        Index("idx_interview_sessions_created", "user_id", "created_at"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="interview_sessions_user_fk"),
        nullable=False,
        index=True,
    )
    session_type: Mapped[InterviewType] = mapped_column(
        sa_interview_type, nullable=False, server_default=text("'general'")
    )
    target_role: Mapped[str | None] = mapped_column(String(255))
    target_company: Mapped[str | None] = mapped_column(String(255))
    language: Mapped[PreferredLanguage] = mapped_column(
        sa_preferred_language, nullable=False, server_default=text("'ja'")
    )
    status: Mapped[InterviewStatus] = mapped_column(
        sa_interview_status, nullable=False, server_default=text("'active'")
    )
    session_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    overall_score: Mapped[float | None] = mapped_column(Numeric(5, 2))
    feedback_summary: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # --- Relationships ---
    user: Mapped["User"] = relationship("User", back_populates="interview_sessions")
    messages: Mapped[list["InterviewMessage"]] = relationship(
        "InterviewMessage",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="InterviewMessage.created_at.asc()",
    )


class InterviewMessage(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """
    Each turn in an interview session.

    role:
        interviewer — AI-generated question or response
        user        — candidate's answer (has ai_evaluation)
        feedback    — post-session summary turn

    ai_evaluation is only populated for user turns and contains:
        keigo_score, content_relevance, specificity_score,
        grammar_issues, positive_feedback, improvement_tip
    """

    __tablename__ = "interview_messages"
    __table_args__ = (Index("idx_interview_messages_session", "session_id", "created_at"),)

    session_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey(
            "interview_sessions.id",
            ondelete="CASCADE",
            name="interview_messages_session_fk",
        ),
        nullable=False,
    )
    role: Mapped[MessageRole] = mapped_column(sa_message_role, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[PreferredLanguage | None] = mapped_column(sa_preferred_language)
    ai_evaluation: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    # --- Relationships ---
    session: Mapped["InterviewSession"] = relationship(
        "InterviewSession", back_populates="messages"
    )
