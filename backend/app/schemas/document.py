"""Pydantic request/response schemas for document endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.enums import (
    DocumentErrorCode,
    DocumentOrientation,
    DocumentStatus,
    DocumentType,
)


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Document
# ---------------------------------------------------------------------------


class DocumentResponse(_Base):
    id: UUID
    user_id: UUID
    resume_id: UUID | None
    document_type: DocumentType
    status: DocumentStatus
    orientation: DocumentOrientation
    job_context: dict[str, Any] | None
    ai_model: str | None
    input_tokens: int | None
    output_tokens: int | None
    # content is the structured AI output (JSON), not returned in list views
    # Why a failed generation failed; set exactly when status is "failed". The
    # row's error_message is deliberately not exposed: it holds the underlying
    # exception text, which can name SQL, storage keys and other internals, and
    # the client shows its own message for the code instead.
    error_code: DocumentErrorCode | None = None
    completed_at: datetime | None
    created_at: datetime

    @model_validator(mode="after")
    def _code_only_when_failed(self) -> Self:
        if (self.status == DocumentStatus.failed) != (self.error_code is not None):
            raise ValueError("error_code is required when failed and not allowed otherwise")
        return self


class DocumentDetailResponse(DocumentResponse):
    """Extended response that includes the AI-generated content and download URL."""

    content: dict[str, Any] | None
    download_url: str | None


class DocumentListResponse(_Base):
    items: list[DocumentResponse]
    total: int


# ---------------------------------------------------------------------------
# Create requests
# ---------------------------------------------------------------------------


class CreateRirekishoRequest(_Base):
    resume_id: UUID
    # Optional job posting context — if provided, tailors the document to the role
    job_posting_id: UUID | None = None
    orientation: DocumentOrientation = DocumentOrientation.portrait


class CreateShokumuRequest(_Base):
    resume_id: UUID
    job_posting_id: UUID | None = None


# ---------------------------------------------------------------------------
# Status poll response (lightweight — used by client polling loop)
# ---------------------------------------------------------------------------


class DocumentStatusResponse(_Base):
    """
    A document's state for the polling client. error_code says why a failed
    generation failed and is set exactly when status is "failed"; see
    DocumentResponse for why the row's error_message stays server-side.
    """

    id: UUID
    status: DocumentStatus
    orientation: DocumentOrientation
    error_code: DocumentErrorCode | None = None
    completed_at: datetime | None

    @model_validator(mode="after")
    def _code_only_when_failed(self) -> Self:
        if (self.status == DocumentStatus.failed) != (self.error_code is not None):
            raise ValueError("error_code is required when failed and not allowed otherwise")
        return self
