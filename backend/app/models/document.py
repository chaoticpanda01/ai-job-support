from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, UUIDPrimaryKeyMixin
from app.models.enums import (
    DocumentStatus,
    DocumentType,
    sa_document_status,
    sa_document_type,
)

if TYPE_CHECKING:
    from app.models.resume import Resume
    from app.models.user import User


class GeneratedDocument(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """
    Async-generated Japanese career document (履歴書, 職務経歴書).

    Lifecycle:
        pending → processing → completed | failed

    - content and file_url are NULL until status = 'completed'
    - error_message is populated when status = 'failed'
    - resume_id SET NULL when source resume is deleted (document is still
      downloadable via file_url if previously completed)
    """

    __tablename__ = "generated_documents"
    __table_args__ = (
        CheckConstraint(
            "input_tokens IS NULL OR input_tokens >= 0",
            name="gen_docs_input_tokens_gte0",
        ),
        CheckConstraint(
            "output_tokens IS NULL OR output_tokens >= 0",
            name="gen_docs_output_tokens_gte0",
        ),
        CheckConstraint(
            "completed_at IS NULL OR completed_at >= created_at",
            name="generated_documents_timing",
        ),
        Index(
            "idx_gen_docs_status",
            "status",
            postgresql_where=text("status IN ('pending', 'processing')"),
        ),
        Index("idx_gen_docs_created", "user_id", "created_at"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="generated_documents_user_fk"),
        nullable=False,
        index=True,
    )
    resume_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("resumes.id", ondelete="SET NULL", name="generated_documents_resume_fk"),
    )
    document_type: Mapped[DocumentType] = mapped_column(sa_document_type, nullable=False)
    status: Mapped[DocumentStatus] = mapped_column(
        sa_document_status, nullable=False, server_default=text("'pending'")
    )
    job_context: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    ai_model: Mapped[str | None] = mapped_column(String(100))
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    content: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    file_url: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # --- Relationships ---
    user: Mapped["User"] = relationship("User", back_populates="generated_documents")
    resume: Mapped["Resume | None"] = relationship("Resume")
