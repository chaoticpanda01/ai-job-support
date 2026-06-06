"""Pydantic request/response schemas for interview endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Session
# ---------------------------------------------------------------------------

class InterviewSessionResponse(_Base):
    id: UUID
    user_id: UUID
    session_type: str
    target_role: str | None
    target_company: str | None
    language: str
    status: str
    overall_score: float | None
    feedback_summary: str | None
    completed_at: datetime | None
    created_at: datetime


class InterviewMessageResponse(_Base):
    id: UUID
    session_id: UUID
    role: str
    content: str
    language: str | None
    ai_evaluation: dict[str, Any] | None
    created_at: datetime


class InterviewSessionDetailResponse(InterviewSessionResponse):
    messages: list[InterviewMessageResponse]


# ---------------------------------------------------------------------------
# Requests
# ---------------------------------------------------------------------------

class CreateSessionRequest(_Base):
    session_type: str = Field(default="general", pattern="^(general|behavioral|technical|culture_fit)$")
    target_role: str | None = None
    target_company: str | None = None
    language: str = Field(default="ja", pattern="^(ja|en|id)$")


class SendMessageRequest(_Base):
    content: str = Field(min_length=1, max_length=4000)
