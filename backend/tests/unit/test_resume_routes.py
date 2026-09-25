"""
Unit tests for resume endpoints (upload, list, get, delete, set primary,
analyze, get analysis, get analysis status).

All external I/O (DB, S3, MIME detection, background analysis task) is
mocked so these run without a live database.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.api.v1.resumes import _ANALYSIS_STALE_AFTER
from app.database import get_db
from app.main import app
from app.middleware import clerk_auth as clerk_auth_module
from app.models.enums import AnalysisType, PreferredLanguage
from app.schemas.resume import AnalysisStatusResponse
from app.services.file_storage import StorageError
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from tests.conftest import make_user

_FAKE_JWKS: dict[str, Any] = {"keys": []}


def _auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer valid_token"}


@contextmanager
def _bypass_middleware(user: Any) -> Iterator[None]:
    """Let the real ClerkJWTMiddleware run, mocking its I/O boundaries."""
    claims = {"sub": user.clerk_id, "email": user.email, "exp": int(time.time()) + 3600}
    with (
        patch.object(clerk_auth_module, "_get_jwks", new=AsyncMock(return_value=_FAKE_JWKS)),
        patch("app.middleware.clerk_auth._validate_token", new=AsyncMock(return_value=claims)),
        patch("app.middleware.clerk_auth._resolve_user", new=AsyncMock(return_value=user)),
    ):
        yield


@contextmanager
def _fake_db_session() -> Iterator[MagicMock]:
    """Override get_db (upload_resume calls db.refresh() directly on first upload)."""
    session = MagicMock()
    session.refresh = AsyncMock()

    async def _fake_get_db() -> Any:
        yield session

    app.dependency_overrides[get_db] = _fake_get_db
    try:
        yield session
    finally:
        app.dependency_overrides.pop(get_db, None)


def _mock_resume(*, user_id: uuid.UUID | None = None, is_primary: bool = False) -> MagicMock:
    resume = MagicMock()
    resume.id = uuid.uuid4()
    resume.user_id = user_id or uuid.uuid4()
    resume.file_name = "resume.pdf"
    resume.file_url = "resumes/user123/abc.pdf"
    resume.file_size_bytes = 12345
    resume.mime_type = "application/pdf"
    resume.language = PreferredLanguage.id
    resume.is_primary = is_primary
    resume.created_at = datetime.now(tz=UTC)
    resume.updated_at = datetime.now(tz=UTC)
    return resume


def _mock_analysis(*, resume_id: uuid.UUID | None = None) -> MagicMock:
    analysis = MagicMock()
    analysis.id = uuid.uuid4()
    analysis.resume_id = resume_id or uuid.uuid4()
    analysis.analysis_type = AnalysisType.general
    analysis.job_posting_id = None
    analysis.ai_model = "gemini-2.5-flash"
    analysis.input_tokens = 100
    analysis.output_tokens = 200
    analysis.result = {"japan_market_score": 75}
    analysis.created_at = datetime.now(tz=UTC)
    return analysis


# ---------------------------------------------------------------------------
# POST /resumes (upload)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_resume_first_upload_sets_primary() -> None:
    user = make_user()
    resume = _mock_resume(user_id=user.id, is_primary=True)

    with (
        _bypass_middleware(user),
        _fake_db_session(),
        patch("app.api.v1.resumes.magic.from_buffer", return_value="application/pdf"),
        patch(
            "app.api.v1.resumes.file_storage.upload_resume",
            return_value="resumes/user123/abc.pdf",
        ),
        patch("app.api.v1.resumes.ResumeRepository.create", new=AsyncMock(return_value=resume)),
        patch("app.api.v1.resumes.ResumeRepository.count_by_user", new=AsyncMock(return_value=1)),
        patch(
            "app.api.v1.resumes.ResumeRepository.set_primary", new=AsyncMock(return_value=resume)
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/resumes",
                headers=_auth_headers(),
                files={"file": ("resume.pdf", b"%PDF-1.4 fake content", "application/pdf")},
            )

    assert resp.status_code == 201
    assert resp.json()["is_primary"] is True


@pytest.mark.asyncio
async def test_upload_resume_not_first_upload_skips_set_primary() -> None:
    user = make_user()
    resume = _mock_resume(user_id=user.id, is_primary=False)

    with (
        _bypass_middleware(user),
        _fake_db_session(),
        patch("app.api.v1.resumes.magic.from_buffer", return_value="application/pdf"),
        patch(
            "app.api.v1.resumes.file_storage.upload_resume",
            return_value="resumes/user123/abc.pdf",
        ),
        patch("app.api.v1.resumes.ResumeRepository.create", new=AsyncMock(return_value=resume)),
        patch("app.api.v1.resumes.ResumeRepository.count_by_user", new=AsyncMock(return_value=2)),
        patch("app.api.v1.resumes.ResumeRepository.set_primary", new=AsyncMock()) as mock_set,
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/resumes",
                headers=_auth_headers(),
                files={"file": ("resume.pdf", b"%PDF-1.4 fake content", "application/pdf")},
            )

    assert resp.status_code == 201
    mock_set.assert_not_called()


@pytest.mark.asyncio
async def test_upload_resume_rejects_disallowed_mime() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.resumes.magic.from_buffer", return_value="image/png"),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/resumes",
                headers=_auth_headers(),
                files={"file": ("resume.png", b"fake png bytes", "image/png")},
            )

    assert resp.status_code == 415


@pytest.mark.asyncio
async def test_upload_resume_too_large_returns_413() -> None:
    user = make_user()
    oversized = b"x" * (10 * 1024 * 1024 + 1)

    with _bypass_middleware(user):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/resumes",
                headers=_auth_headers(),
                files={"file": ("resume.pdf", oversized, "application/pdf")},
            )

    assert resp.status_code == 413


@pytest.mark.asyncio
async def test_upload_resume_s3_failure_returns_502() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.resumes.magic.from_buffer", return_value="application/pdf"),
        patch(
            "app.api.v1.resumes.file_storage.upload_resume",
            side_effect=StorageError("S3 unavailable"),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/resumes",
                headers=_auth_headers(),
                files={"file": ("resume.pdf", b"%PDF-1.4 fake content", "application/pdf")},
            )

    assert resp.status_code == 502


# ---------------------------------------------------------------------------
# GET /resumes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_resumes_returns_items() -> None:
    user = make_user()
    resumes = [_mock_resume(user_id=user.id), _mock_resume(user_id=user.id)]

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.resumes.ResumeRepository.list_by_user", new=AsyncMock(return_value=resumes)
        ),
        patch("app.api.v1.resumes.ResumeRepository.count_by_user", new=AsyncMock(return_value=2)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/resumes", headers=_auth_headers())

    assert resp.status_code == 200
    assert resp.json()["total"] == 2


# ---------------------------------------------------------------------------
# GET /resumes/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_resume_returns_detail_with_download_url() -> None:
    user = make_user()
    resume = _mock_resume(user_id=user.id)

    with (
        _bypass_middleware(user),
        patch("app.api.v1.resumes.ResumeRepository.get_owned", new=AsyncMock(return_value=resume)),
        patch(
            "app.api.v1.resumes.file_storage.presigned_url",
            return_value="https://s3.example.com/signed",
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/resumes/{resume.id}", headers=_auth_headers())

    assert resp.status_code == 200
    assert resp.json()["download_url"] == "https://s3.example.com/signed"


@pytest.mark.asyncio
async def test_get_resume_presign_failure_returns_empty_url() -> None:
    user = make_user()
    resume = _mock_resume(user_id=user.id)

    with (
        _bypass_middleware(user),
        patch("app.api.v1.resumes.ResumeRepository.get_owned", new=AsyncMock(return_value=resume)),
        patch(
            "app.api.v1.resumes.file_storage.presigned_url",
            side_effect=StorageError("S3 unavailable"),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/resumes/{resume.id}", headers=_auth_headers())

    assert resp.status_code == 200
    assert resp.json()["download_url"] == ""


@pytest.mark.asyncio
async def test_get_resume_not_found_returns_404() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.resumes.ResumeRepository.get_owned", new=AsyncMock(return_value=None)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/resumes/{uuid.uuid4()}", headers=_auth_headers())

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /resumes/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_resume_happy_path() -> None:
    user = make_user()
    resume = _mock_resume(user_id=user.id)

    with (
        _bypass_middleware(user),
        patch("app.api.v1.resumes.ResumeRepository.get_owned", new=AsyncMock(return_value=resume)),
        patch("app.api.v1.resumes.ResumeRepository.delete", new=AsyncMock()),
        patch("app.api.v1.resumes.file_storage.delete"),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(f"/api/v1/resumes/{resume.id}", headers=_auth_headers())

    assert resp.status_code == 200
    assert resp.json() == {"detail": "Resume deleted"}


@pytest.mark.asyncio
async def test_delete_resume_s3_failure_still_succeeds() -> None:
    user = make_user()
    resume = _mock_resume(user_id=user.id)

    with (
        _bypass_middleware(user),
        patch("app.api.v1.resumes.ResumeRepository.get_owned", new=AsyncMock(return_value=resume)),
        patch("app.api.v1.resumes.ResumeRepository.delete", new=AsyncMock()),
        patch("app.api.v1.resumes.file_storage.delete", side_effect=StorageError("S3 down")),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(f"/api/v1/resumes/{resume.id}", headers=_auth_headers())

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_delete_resume_not_found_returns_404() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.resumes.ResumeRepository.get_owned", new=AsyncMock(return_value=None)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(f"/api/v1/resumes/{uuid.uuid4()}", headers=_auth_headers())

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PUT /resumes/{id}/primary
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_set_primary_happy_path() -> None:
    user = make_user()
    resume = _mock_resume(user_id=user.id, is_primary=True)

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.resumes.ResumeRepository.set_primary", new=AsyncMock(return_value=resume)
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.put(f"/api/v1/resumes/{resume.id}/primary", headers=_auth_headers())

    assert resp.status_code == 200
    assert resp.json()["is_primary"] is True


@pytest.mark.asyncio
async def test_set_primary_not_found_returns_404() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.resumes.ResumeRepository.set_primary", new=AsyncMock(return_value=None)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.put(
                f"/api/v1/resumes/{uuid.uuid4()}/primary", headers=_auth_headers()
            )

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /resumes/{id}/analyze
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_analyze_resume_marks_pending_and_commits_before_enqueuing() -> None:
    """The task reads the request time in its own session, so it must be committed first."""
    user = make_user()
    resume = _mock_resume(user_id=user.id)
    requested_at = datetime.now(tz=UTC)
    events: list[str] = []

    async def mark_pending_effect(*_: Any) -> datetime:
        events.append("pending")
        return requested_at

    async def run_analysis_effect(*_: Any) -> None:
        events.append("task")

    mark_pending = AsyncMock(side_effect=mark_pending_effect)
    run_analysis = AsyncMock(side_effect=run_analysis_effect)

    with (
        _bypass_middleware(user),
        _fake_db_session() as session,
        patch("app.api.v1.resumes.ResumeRepository.get_owned", new=AsyncMock(return_value=resume)),
        patch("app.api.v1.resumes.ResumeRepository.mark_analysis_pending", new=mark_pending),
        patch("app.workers.analysis_tasks._run_analysis", new=run_analysis),
    ):
        session.commit = AsyncMock(side_effect=lambda: events.append("commit"))
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/resumes/{resume.id}/analyze",
                headers=_auth_headers(),
                json={"language": "ja"},
            )

    assert resp.status_code == 202
    assert resp.json()["resume_id"] == str(resume.id)
    assert events == ["pending", "commit", "task"]
    mark_pending.assert_awaited_once_with(resume)
    run_analysis.assert_awaited_once_with(resume.id, user.id, "general", None, "ja", requested_at)


@pytest.mark.asyncio
async def test_analyze_resume_not_found_returns_404() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.resumes.ResumeRepository.get_owned", new=AsyncMock(return_value=None)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/resumes/{uuid.uuid4()}/analyze", headers=_auth_headers(), json={}
            )

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /resumes/{id}/analysis
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_analysis_happy_path() -> None:
    user = make_user()
    resume = _mock_resume(user_id=user.id)
    analysis = _mock_analysis(resume_id=resume.id)

    with (
        _bypass_middleware(user),
        patch("app.api.v1.resumes.ResumeRepository.get_owned", new=AsyncMock(return_value=resume)),
        patch(
            "app.api.v1.resumes.ResumeAnalysisRepository.get_latest_for_resume",
            new=AsyncMock(return_value=analysis),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                f"/api/v1/resumes/{resume.id}/analysis", headers=_auth_headers()
            )

    assert resp.status_code == 200
    assert resp.json()["result"] == {"japan_market_score": 75}


@pytest.mark.asyncio
async def test_get_analysis_resume_not_found_returns_404() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.resumes.ResumeRepository.get_owned", new=AsyncMock(return_value=None)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                f"/api/v1/resumes/{uuid.uuid4()}/analysis", headers=_auth_headers()
            )

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_analysis_no_analysis_returns_404() -> None:
    user = make_user()
    resume = _mock_resume(user_id=user.id)

    with (
        _bypass_middleware(user),
        patch("app.api.v1.resumes.ResumeRepository.get_owned", new=AsyncMock(return_value=resume)),
        patch(
            "app.api.v1.resumes.ResumeAnalysisRepository.get_latest_for_resume",
            new=AsyncMock(return_value=None),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                f"/api/v1/resumes/{resume.id}/analysis", headers=_auth_headers()
            )

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /resumes/{id}/analysis/status
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("stored_status", "stored_code", "age", "expected"),
    [
        pytest.param(None, None, None, {"status": "idle", "error_code": None}, id="idle"),
        pytest.param(
            "pending",
            None,
            timedelta(seconds=30),
            {"status": "pending", "error_code": None},
            id="pending",
        ),
        pytest.param(
            "pending",
            None,
            _ANALYSIS_STALE_AFTER + timedelta(seconds=1),
            {"status": "failed", "error_code": "timed_out"},
            id="stale-pending",
        ),
        pytest.param(
            "pending",
            None,
            None,
            {"status": "failed", "error_code": "timed_out"},
            id="pending-without-time",
        ),
        pytest.param(
            "failed",
            "unreadable_file",
            timedelta(seconds=5),
            {"status": "failed", "error_code": "unreadable_file"},
            id="failed",
        ),
        pytest.param(
            "failed",
            "retired_code",
            None,
            {"status": "failed", "error_code": "unknown"},
            id="unrecognised-code",
        ),
    ],
)
async def test_get_analysis_status(
    stored_status: str | None,
    stored_code: str | None,
    age: timedelta | None,
    expected: dict[str, Any],
) -> None:
    user = make_user()
    resume = _mock_resume(user_id=user.id)
    resume.analysis_status = stored_status
    resume.analysis_error_code = stored_code
    resume.analysis_requested_at = None if age is None else datetime.now(tz=UTC) - age

    with (
        _bypass_middleware(user),
        patch("app.api.v1.resumes.ResumeRepository.get_owned", new=AsyncMock(return_value=resume)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                f"/api/v1/resumes/{resume.id}/analysis/status", headers=_auth_headers()
            )

    assert resp.status_code == 200
    assert resp.json() == expected


@pytest.mark.asyncio
async def test_get_analysis_status_resume_not_found_returns_404() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.resumes.ResumeRepository.get_owned", new=AsyncMock(return_value=None)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                f"/api/v1/resumes/{uuid.uuid4()}/analysis/status", headers=_auth_headers()
            )

    assert resp.status_code == 404


@pytest.mark.parametrize(
    ("status", "code"),
    [
        pytest.param("failed", None, id="failed-without-code"),
        pytest.param("pending", "ai_failed", id="pending-with-code"),
        pytest.param("idle", "unknown", id="idle-with-code"),
    ],
)
def test_analysis_status_response_has_a_code_exactly_when_failed(
    status: str, code: str | None
) -> None:
    with pytest.raises(ValidationError):
        AnalysisStatusResponse.model_validate({"status": status, "error_code": code})


# ---------------------------------------------------------------------------
# A job posting id on an analysis request must be one the caller can see
# ---------------------------------------------------------------------------
#
# The analysis doesn't load the posting today; the id is only stored. It is
# checked anyway, through the same visibility-scoped lookup documents use, so
# a later change that does put the posting into the prompt can't become a way
# to read someone else's private paste. Which postings are visible is tested
# against real Postgres in tests/integration/test_job_posting_visibility.py.


@pytest.mark.asyncio
async def test_analyze_refuses_a_posting_the_caller_cannot_see() -> None:
    user = make_user()
    resume = _mock_resume(user_id=user.id)
    get_active = AsyncMock(return_value=None)
    mark_pending = AsyncMock(return_value=datetime.now(tz=UTC))
    run_analysis = AsyncMock()

    with (
        _bypass_middleware(user),
        _fake_db_session(),
        patch("app.api.v1.resumes.ResumeRepository.get_owned", new=AsyncMock(return_value=resume)),
        patch("app.api.v1.resumes.JobPostingRepository.get_active", new=get_active),
        patch("app.api.v1.resumes.ResumeRepository.mark_analysis_pending", new=mark_pending),
        patch("app.workers.analysis_tasks._run_analysis", new=run_analysis),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/resumes/{resume.id}/analyze",
                headers=_auth_headers(),
                json={"language": "ja", "job_posting_id": str(uuid.uuid4())},
            )

    assert resp.status_code == 404
    assert get_active.await_args.kwargs["viewer_id"] == user.id
    # Refused before the resume was marked pending, so nothing is left
    # showing "analysing" for a request that never ran.
    mark_pending.assert_not_awaited()
    run_analysis.assert_not_awaited()


@pytest.mark.asyncio
async def test_analyze_accepts_a_posting_the_caller_can_see() -> None:
    user = make_user()
    resume = _mock_resume(user_id=user.id)

    with (
        _bypass_middleware(user),
        _fake_db_session() as session,
        patch("app.api.v1.resumes.ResumeRepository.get_owned", new=AsyncMock(return_value=resume)),
        patch(
            "app.api.v1.resumes.JobPostingRepository.get_active",
            new=AsyncMock(return_value=MagicMock()),
        ),
        patch(
            "app.api.v1.resumes.ResumeRepository.mark_analysis_pending",
            new=AsyncMock(return_value=datetime.now(tz=UTC)),
        ),
        patch("app.workers.analysis_tasks._run_analysis", new=AsyncMock()),
    ):
        # The fake session's commit isn't awaitable by default; the route
        # commits before queueing the analysis.
        session.commit = AsyncMock()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/resumes/{resume.id}/analyze",
                headers=_auth_headers(),
                json={"language": "ja", "job_posting_id": str(uuid.uuid4())},
            )

    assert resp.status_code == 202
