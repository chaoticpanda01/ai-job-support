"""
Unit tests for resume endpoints (upload, list, get, delete, set primary,
analyze, get analysis).

All external I/O (DB, S3, MIME detection, background analysis task) is
mocked so these run without a live database.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.database import get_db
from app.main import app
from app.middleware import clerk_auth as clerk_auth_module
from app.models.enums import AnalysisType, PreferredLanguage
from app.services.file_storage import StorageError
from httpx import ASGITransport, AsyncClient

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
async def test_analyze_resume_enqueues_task() -> None:
    user = make_user()
    resume = _mock_resume(user_id=user.id)

    with (
        _bypass_middleware(user),
        patch("app.api.v1.resumes.ResumeRepository.get_owned", new=AsyncMock(return_value=resume)),
        patch("app.workers.analysis_tasks._run_analysis", new=AsyncMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/resumes/{resume.id}/analyze", headers=_auth_headers(), json={}
            )

    assert resp.status_code == 202
    assert resp.json()["resume_id"] == str(resume.id)


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
