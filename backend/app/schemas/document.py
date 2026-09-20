"""Pydantic request/response schemas for document endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict

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
    # Why a failed generation failed. NULL on a document that didn't fail, and
    # on one that failed before the column existed.
    error_code: DocumentErrorCode | None = None
    # The underlying English message. Kept for support; the client shows its own
    # message for error_code instead.
    error_message: str | None
    completed_at: datetime | None
    created_at: datetime


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
    id: UUID
    status: DocumentStatus
    orientation: DocumentOrientation
    error_code: DocumentErrorCode | None = None
    error_message: str | None
    completed_at: datetime | None
