"""Pydantic schemas for resume and resume-analysis endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AnalysisType, PreferredLanguage


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Resume
# ---------------------------------------------------------------------------

class ResumeResponse(_Base):
    id: UUID
    user_id: UUID
    file_name: str
    file_size_bytes: int
    mime_type: str
    language: PreferredLanguage
    is_primary: bool
    # file_url is the S3 key — never exposed directly; use /download endpoint
    created_at: datetime
    updated_at: datetime


class ResumeDetailResponse(ResumeResponse):
    """Extended response including a fresh presigned download URL."""
    download_url: str


class ResumeListResponse(_Base):
    items: list[ResumeResponse]
    total: int


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

class ResumeAnalysisResponse(_Base):
    id: UUID
    resume_id: UUID
    analysis_type: AnalysisType
    job_posting_id: UUID | None
    ai_model: str
    input_tokens: int
    output_tokens: int
    result: dict[str, Any]
    created_at: datetime


class AnalyzeRequest(_Base):
    analysis_type: AnalysisType = AnalysisType.general
    job_posting_id: UUID | None = None


class AnalyzeResponse(_Base):
    """Returned immediately after triggering analysis. Client polls for result."""
    task_id: str
    resume_id: UUID
    status: str = "queued"
