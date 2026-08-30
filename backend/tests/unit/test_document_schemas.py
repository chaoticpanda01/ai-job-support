"""Unit tests for document Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from app.models.enums import DocumentOrientation, DocumentStatus, DocumentType
from app.schemas.document import (
    CreateRirekishoRequest,
    CreateShokumuRequest,
    DocumentDetailResponse,
    DocumentResponse,
    DocumentStatusResponse,
)
from pydantic import ValidationError


def _doc_data(**overrides: object) -> dict:
    base: dict = {
        "id": uuid.uuid4(),
        "user_id": uuid.uuid4(),
        "resume_id": None,
        "document_type": DocumentType.rirekisho,
        "status": DocumentStatus.pending,
        "orientation": DocumentOrientation.portrait,
        "job_context": None,
        "ai_model": None,
        "input_tokens": None,
        "output_tokens": None,
        "error_message": None,
        "completed_at": None,
        "created_at": datetime.now(tz=UTC),
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# DocumentResponse
# ---------------------------------------------------------------------------


def test_document_response_from_dict() -> None:
    data = _doc_data()
    resp = DocumentResponse.model_validate(data)
    assert resp.status == DocumentStatus.pending
    assert resp.document_type == DocumentType.rirekisho


def test_document_response_completed_fields() -> None:
    data = _doc_data(
        status=DocumentStatus.completed,
        ai_model="claude-sonnet-4-6",
        input_tokens=1200,
        output_tokens=800,
        completed_at=datetime.now(tz=UTC),
    )
    resp = DocumentResponse.model_validate(data)
    assert resp.ai_model == "claude-sonnet-4-6"
    assert resp.input_tokens == 1200


# ---------------------------------------------------------------------------
# DocumentDetailResponse
# ---------------------------------------------------------------------------


def test_document_detail_response_includes_content_and_url() -> None:
    data = {
        **_doc_data(status=DocumentStatus.completed),
        "content": {"name": "山田太郎"},
        "download_url": "https://s3.example.com/documents/test.pdf",
    }
    resp = DocumentDetailResponse.model_validate(data)
    assert resp.content == {"name": "山田太郎"}
    assert resp.download_url is not None


def test_document_detail_response_allows_null_content() -> None:
    data = {**_doc_data(), "content": None, "download_url": None}
    resp = DocumentDetailResponse.model_validate(data)
    assert resp.content is None
    assert resp.download_url is None


# ---------------------------------------------------------------------------
# Create requests
# ---------------------------------------------------------------------------


def test_create_rirekisho_request_requires_resume_id() -> None:
    with pytest.raises(ValidationError):
        CreateRirekishoRequest.model_validate({})


def test_create_rirekisho_request_job_posting_id_optional() -> None:
    req = CreateRirekishoRequest(resume_id=uuid.uuid4())
    assert req.job_posting_id is None


def test_create_shokumu_request_with_job_posting() -> None:
    rid = uuid.uuid4()
    jid = uuid.uuid4()
    req = CreateShokumuRequest(resume_id=rid, job_posting_id=jid)
    assert req.job_posting_id == jid


# ---------------------------------------------------------------------------
# DocumentStatusResponse
# ---------------------------------------------------------------------------


def test_document_status_response_pending() -> None:
    resp = DocumentStatusResponse(
        id=uuid.uuid4(),
        status=DocumentStatus.pending,
        orientation=DocumentOrientation.portrait,
        error_message=None,
        completed_at=None,
    )
    assert resp.status == DocumentStatus.pending


def test_document_status_response_failed_has_error() -> None:
    resp = DocumentStatusResponse(
        id=uuid.uuid4(),
        status=DocumentStatus.failed,
        orientation=DocumentOrientation.portrait,
        error_message="AI budget exceeded",
        completed_at=datetime.now(tz=UTC),
    )
    assert resp.error_message == "AI budget exceeded"
