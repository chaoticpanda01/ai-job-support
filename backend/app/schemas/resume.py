"""Pydantic schemas for resume and resume-analysis endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.enums import AnalysisErrorCode, AnalysisType, PreferredLanguage


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
    language: PreferredLanguage = PreferredLanguage.en


class AnalyzeResponse(_Base):
    """
    Returned once the request is recorded as pending. The client then polls
    GET /resumes/{id}/analysis/status.
    """

    task_id: str
    resume_id: UUID
    status: str = "queued"


class AnalysisStatusResponse(_Base):
    """
    Status of a resume's latest analysis request: "idle" when none is running and
    the latest did not fail, "pending" while one runs, "failed" with error_code
    saying why. error_code is set exactly when status is "failed".
    """

    status: Literal["idle", "pending", "failed"]
    error_code: AnalysisErrorCode | None = None

    @model_validator(mode="after")
    def _code_only_when_failed(self) -> Self:
        if (self.status == "failed") != (self.error_code is not None):
            raise ValueError("error_code is required when failed and not allowed otherwise")
        return self
