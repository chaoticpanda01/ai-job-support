"""Pydantic request/response schemas for job posting endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Job posting
# ---------------------------------------------------------------------------

class JobPostingResponse(_Base):
    id: UUID
    source_url: str | None
    source_platform: str
    original_title: str | None
    original_company: str | None
    original_language: str
    translated_title: str | None
    translation_summary: str | None
    foreigner_friendliness_score: float | None
    structured_data: dict[str, Any] | None
    cached_until: datetime | None
    submitted_by: UUID | None
    created_at: datetime


class JobPostingDetailResponse(JobPostingResponse):
    """Includes full translated description — omitted from list views for size."""
    original_description: str | None
    translated_description: str | None


class JobPostingListResponse(_Base):
    items: list[JobPostingResponse]
    total: int


# ---------------------------------------------------------------------------
# Translate request
# ---------------------------------------------------------------------------

class TranslateJobRequest(_Base):
    # At least one of source_url or raw_text is required (validated in route)
    source_url: str | None = None
    raw_text: str = Field(min_length=50, description="Raw text pasted from the job posting page")


# ---------------------------------------------------------------------------
# Match
# ---------------------------------------------------------------------------

class MatchScoreResponse(_Base):
    id: UUID
    user_id: UUID
    resume_id: UUID
    job_posting_id: UUID
    match_score: float
    match_breakdown: dict[str, Any]
    recommendations: dict[str, Any] | None
    created_at: datetime


class MatchRequest(_Base):
    resume_id: UUID


# ---------------------------------------------------------------------------
# Application tracker
# ---------------------------------------------------------------------------

class JobApplicationResponse(_Base):
    id: UUID
    user_id: UUID
    job_posting_id: UUID
    status: str
    applied_at: datetime | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    # Denormalised posting fields for display in the Kanban board
    job_title: str | None = None
    job_company: str | None = None


class CreateApplicationRequest(_Base):
    job_posting_id: UUID
    notes: str | None = None


class UpdateApplicationRequest(_Base):
    status: str | None = None
    notes: str | None = None
