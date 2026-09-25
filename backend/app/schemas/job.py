"""Pydantic request/response schemas for job posting endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    # Whether the caller submitted this posting -- computed per request by
    # _posting_response in api/v1/jobs.py. Replaces the submitter's user id,
    # which every caller received for every posting in the shared pool and
    # which the client never used: it only let one user see which postings
    # another account had submitted.
    is_mine: bool = False
    created_at: datetime


class JobPostingDetailResponse(JobPostingResponse):
    """Includes full translated description — omitted from list views for size."""

    # The raw pasted text -- returned to its submitter only; None for
    # everyone else (see _posting_response in api/v1/jobs.py).
    original_description: str | None
    translated_description: str | None


class JobPostingListResponse(_Base):
    items: list[JobPostingResponse]
    total: int


# ---------------------------------------------------------------------------
# Translate request
# ---------------------------------------------------------------------------


# See TranslateJobRequest._normalise_source_url.
_MAX_SOURCE_URL_BYTES = 2000


class TranslateJobRequest(_Base):
    # At least one of source_url or raw_text is required (validated in route)
    source_url: str | None = Field(default=None, max_length=2000)
    # Upper bound caps per-call Gemini input cost: a job posting is realistically
    # well under 20k characters, and the extractor truncates resume text at 20k too.
    raw_text: str = Field(
        min_length=50,
        max_length=20_000,
        description="Raw text pasted from the job posting page",
    )

    @field_validator("source_url", mode="before")
    @classmethod
    def _normalise_source_url(cls, value: object) -> object:
        """
        Having a URL is what makes a posting public (JobPosting.visible_to),
        and the URL is the translation cache's key, so the server decides
        what counts as one rather than trusting the browser's type="url".

        - Blank means no URL: the posting stays private instead of being
          published under an empty string.
        - Only http(s), with a real host. No credentials: a user:password@
          URL would publish them to every user.
        - The scheme and host are lower-cased and the #fragment dropped, so
          one page gets one cache entry. The path and query are kept as sent:
          they can be case-sensitive, and on Indeed ?jk= is the job's identity.
        - At most _MAX_SOURCE_URL_BYTES bytes. source_url is in a btree index
          whose entries Postgres caps at 2704 bytes, and max_length counts
          characters: measured, an incompressible 2721-byte URL fails the
          insert ("index row size 2736 exceeds btree version 4 maximum 2704"),
          and a 1991-character non-ASCII URL within max_length is 5931 bytes.
          2000 leaves room for the index's own overhead.
        """
        if not isinstance(value, str):
            return value
        value = value.strip()
        if not value:
            return None
        if any(ch.isspace() for ch in value):
            raise ValueError("source_url must not contain spaces")
        if len(value.encode("utf-8")) > _MAX_SOURCE_URL_BYTES:
            raise ValueError("source_url is too long")
        parts = urlsplit(value)
        scheme = parts.scheme.lower()
        if scheme not in ("http", "https") or not parts.hostname:
            raise ValueError("source_url must be an http or https URL")
        if parts.username is not None or parts.password is not None:
            raise ValueError("source_url must not contain a username or password")
        host = parts.hostname  # urlsplit lower-cases it
        if ":" in host:  # an IPv6 literal loses its brackets in .hostname
            host = f"[{host}]"
        port = parts.port  # raises ValueError for a non-numeric port
        netloc = f"{host}:{port}" if port is not None else host
        return urlunsplit((scheme, netloc, parts.path, parts.query, ""))
        value = value.strip()
        if not value:
            return None
        parts = urlsplit(value)
        if parts.scheme not in ("http", "https") or not parts.netloc:
            raise ValueError("source_url must be an http or https URL")
        return value


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
