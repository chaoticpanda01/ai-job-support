"""
Unit tests for job posting endpoints (translate, list, get, delete, match,
application tracker CRUD).

All external I/O (DB, Gemini, S3) is mocked so these run without a live
database or API key.
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
from app.models.enums import ApplicationStatus, JapaneseLevel
from app.services.ai.client import AIError
from app.services.ai.response_parser import ResponseParseError
from app.services.ai.usage_tracker import AIBudgetError
from app.services.file_storage import StorageError
from app.services.resume_parser import ParseError
from httpx import ASGITransport, AsyncClient

from tests.conftest import make_profile, make_user

_FAKE_JWKS: dict[str, Any] = {"keys": []}


def _auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer valid_token"}


@contextmanager
def _bypass_middleware(user: Any) -> Iterator[None]:
    """Let the real ClerkJWTMiddleware run, mocking its I/O boundaries."""
    claims = {"sub": user.clerk_id, "email": user.email, "exp": int(time.time()) + 3600}
    with (
        patch.object(clerk_auth_module, "_get_jwks", new=AsyncMock(return_value=_FAKE_JWKS)),
        patch("app.middleware.clerk_auth.jwt.decode", return_value=claims),
        patch("app.middleware.clerk_auth._resolve_user", new=AsyncMock(return_value=user)),
    ):
        yield


@contextmanager
def _fake_db_session(
    *, scalar_results: list[Any] | None = None, scalars_result: list[Any] | None = None
) -> Iterator[MagicMock]:
    """
    Override get_db with a mock session. The application-tracker endpoints
    build raw SQLAlchemy select() statements and call db.scalar()/scalars()
    directly (not through a repository), so the session itself needs
    mocking rather than a repository method.
    """
    added: list[Any] = []
    session = MagicMock()
    session.scalar = AsyncMock(side_effect=scalar_results or [])
    session.scalars = AsyncMock(
        return_value=MagicMock(all=MagicMock(return_value=scalars_result or []))
    )
    session.add = MagicMock(side_effect=added.append)
    session.delete = AsyncMock()
    session.commit = AsyncMock()

    async def _fake_refresh(obj: Any) -> None:
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()

    session.refresh = AsyncMock(side_effect=_fake_refresh)

    async def _fake_flush() -> None:
        for obj in added:
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()
        added.clear()

    session.flush = AsyncMock(side_effect=_fake_flush)

    async def _fake_get_db() -> Any:
        yield session

    app.dependency_overrides[get_db] = _fake_get_db
    try:
        yield session
    finally:
        app.dependency_overrides.pop(get_db, None)


def _mock_job(*, submitted_by: uuid.UUID | None = None, deleted: bool = False) -> MagicMock:
    job = MagicMock()
    job.id = uuid.uuid4()
    job.source_url = "https://example.com/job/123"
    job.source_platform = "manual"
    job.original_title = None
    job.original_company = "Acme K.K."
    job.original_description = "元のテキスト"
    job.original_language = "ja"
    job.translated_title = "Backend Engineer"
    job.translated_description = "Translated full description"
    job.translation_summary = "Summary"
    job.foreigner_friendliness_score = 80.0
    job.structured_data = {"company_name": "Acme K.K."}
    job.cached_until = None
    job.submitted_by = submitted_by or uuid.uuid4()
    job.created_at = datetime.now(tz=UTC)
    job.deleted_at = datetime.now(tz=UTC) if deleted else None
    return job


def _mock_resume(*, user_id: uuid.UUID | None = None) -> MagicMock:
    resume = MagicMock()
    resume.id = uuid.uuid4()
    resume.user_id = user_id or uuid.uuid4()
    resume.file_url = "resumes/user123/abc.pdf"
    resume.mime_type = "application/pdf"
    return resume


def _mock_match(*, user_id: uuid.UUID | None = None) -> MagicMock:
    match = MagicMock()
    match.id = uuid.uuid4()
    match.user_id = user_id or uuid.uuid4()
    match.resume_id = uuid.uuid4()
    match.job_posting_id = uuid.uuid4()
    match.match_score = 82.5
    match.match_breakdown = {"skills": 80}
    match.recommendations = {"tips": ["Learn keigo"]}
    match.created_at = datetime.now(tz=UTC)
    return match


def _mock_application(*, user_id: uuid.UUID | None = None, job_posting: Any = None) -> MagicMock:
    application = MagicMock()
    application.id = uuid.uuid4()
    application.user_id = user_id or uuid.uuid4()
    application.job_posting_id = uuid.uuid4()
    application.status = ApplicationStatus.planning
    application.applied_at = None
    application.notes = None
    application.created_at = datetime.now(tz=UTC)
    application.updated_at = datetime.now(tz=UTC)
    application.job_posting = job_posting
    return application


# ---------------------------------------------------------------------------
# POST /jobs/translate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_translate_job_cache_hit_skips_ai_call() -> None:
    user = make_user()
    cached = _mock_job()

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.jobs.JobPostingRepository.get_by_url", new=AsyncMock(return_value=cached)
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/jobs/translate",
                headers=_auth_headers(),
                json={
                    "source_url": "https://example.com/job/123",
                    "raw_text": "x" * 60,
                },
            )

    assert resp.status_code == 201
    assert resp.json()["translated_title"] == "Backend Engineer"


@pytest.mark.asyncio
async def test_translate_job_raw_text_too_short_returns_422() -> None:
    user = make_user()

    with _bypass_middleware(user):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/jobs/translate",
                headers=_auth_headers(),
                json={"raw_text": "too short"},
            )

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_translate_job_budget_exceeded_returns_429() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.jobs.JobPostingRepository.get_by_url", new=AsyncMock(return_value=None)),
        patch(
            "app.services.ai.usage_tracker.usage_tracker.check_budget",
            new=AsyncMock(side_effect=AIBudgetError(used=5, limit=5)),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/jobs/translate",
                headers=_auth_headers(),
                json={"raw_text": "x" * 60},
            )

    assert resp.status_code == 429


@pytest.mark.asyncio
async def test_translate_job_ai_error_returns_502() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.jobs.JobPostingRepository.get_by_url", new=AsyncMock(return_value=None)),
        patch("app.services.ai.usage_tracker.usage_tracker.check_budget", new=AsyncMock()),
        patch(
            "app.services.ai.client.ai_client.generate",
            new=AsyncMock(side_effect=AIError("Gemini unavailable")),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/jobs/translate",
                headers=_auth_headers(),
                json={"raw_text": "x" * 60},
            )

    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_translate_job_parse_failure_returns_502() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.jobs.JobPostingRepository.get_by_url", new=AsyncMock(return_value=None)),
        patch("app.services.ai.usage_tracker.usage_tracker.check_budget", new=AsyncMock()),
        patch(
            "app.services.ai.client.ai_client.generate",
            new=AsyncMock(return_value=("not json", 10, 5)),
        ),
        patch(
            "app.services.ai.response_parser.parse_response",
            side_effect=ResponseParseError("bad json"),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/jobs/translate",
                headers=_auth_headers(),
                json={"raw_text": "x" * 60},
            )

    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_translate_job_happy_path_creates_posting() -> None:
    user = make_user()
    job = _mock_job(submitted_by=user.id)

    ai_json = (
        '{"translated_title": "Backend Engineer", '
        '"translated_description": "desc", '
        '"translation_summary": "summary", '
        '"foreigner_friendliness_score": 80, '
        '"structured_data": {'
        '"company_name": "Acme K.K.", "location": "Tokyo", '
        '"employment_type": "Full-time", "salary_range": "6-8M JPY", '
        '"required_japanese": "N3", "required_experience_years": 3, '
        '"key_requirements": ["Python"], "benefits": ["Remote work"]}}'
    )

    with (
        _bypass_middleware(user),
        _fake_db_session(),
        patch("app.api.v1.jobs.JobPostingRepository.get_by_url", new=AsyncMock(return_value=None)),
        patch("app.services.ai.usage_tracker.usage_tracker.check_budget", new=AsyncMock()),
        patch("app.services.ai.usage_tracker.usage_tracker.record", new=AsyncMock()),
        patch(
            "app.services.ai.client.ai_client.generate",
            new=AsyncMock(return_value=(ai_json, 100, 50)),
        ),
        patch("app.api.v1.jobs.JobPostingRepository.create", new=AsyncMock(return_value=job)),
        patch("app.api.v1.jobs.JobPostingRepository.set_cache_expiry", new=AsyncMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/jobs/translate",
                headers=_auth_headers(),
                json={"raw_text": "x" * 60},
            )

    assert resp.status_code == 201


# ---------------------------------------------------------------------------
# GET /jobs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_jobs_returns_items() -> None:
    user = make_user()
    jobs = [_mock_job(), _mock_job()]

    with (
        _bypass_middleware(user),
        patch("app.api.v1.jobs.JobPostingRepository.list_active", new=AsyncMock(return_value=jobs)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/jobs", headers=_auth_headers())

    assert resp.status_code == 200
    assert resp.json()["total"] == 2


@pytest.mark.asyncio
async def test_list_jobs_with_search_query() -> None:
    user = make_user()
    jobs = [_mock_job()]

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.jobs.JobPostingRepository.search", new=AsyncMock(return_value=jobs)
        ) as mock_search,
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/jobs", headers=_auth_headers(), params={"q": "engineer"}
            )

    assert resp.status_code == 200
    mock_search.assert_called_once()


# ---------------------------------------------------------------------------
# GET /jobs/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_job_found() -> None:
    user = make_user()
    job = _mock_job()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.jobs.JobPostingRepository.get_active", new=AsyncMock(return_value=job)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/jobs/{job.id}", headers=_auth_headers())

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_job_not_found_returns_404() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.jobs.JobPostingRepository.get_active", new=AsyncMock(return_value=None)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/jobs/{uuid.uuid4()}", headers=_auth_headers())

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /jobs/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_job_happy_path() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        _fake_db_session(),
        patch("app.api.v1.jobs.JobPostingRepository.soft_delete", new=AsyncMock(return_value=True)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(f"/api/v1/jobs/{uuid.uuid4()}", headers=_auth_headers())

    assert resp.status_code == 200
    assert resp.json() == {"detail": "Job deleted"}


@pytest.mark.asyncio
async def test_delete_job_not_owner_returns_404() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.jobs.JobPostingRepository.soft_delete", new=AsyncMock(return_value=False)
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(f"/api/v1/jobs/{uuid.uuid4()}", headers=_auth_headers())

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /jobs/{id}/match
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_match_job_happy_path() -> None:
    user = make_user()
    job = _mock_job()
    resume = _mock_resume(user_id=user.id)
    profile = make_profile(user_id=user.id)
    profile.japanese_level = JapaneseLevel.N3
    match = _mock_match(user_id=user.id)

    ai_json = (
        '{"match_score": 82, '
        '"match_breakdown": {"skills_match": 80, "experience_match": 85, '
        '"language_match": 80, "culture_fit": 85, "summary": "Strong overall fit"}, '
        '"recommendations": {"strengths": ["Strong background"], '
        '"gaps": ["Improve keigo"], "actions": ["Study N2"]}}'
    )

    with (
        _bypass_middleware(user),
        _fake_db_session(),
        patch("app.api.v1.jobs.JobPostingRepository.get_active", new=AsyncMock(return_value=job)),
        patch("app.api.v1.jobs.ResumeRepository.get_owned", new=AsyncMock(return_value=resume)),
        patch(
            "app.api.v1.jobs.ProfileRepository.get_by_user_id", new=AsyncMock(return_value=profile)
        ),
        patch("app.services.ai.usage_tracker.usage_tracker.check_budget", new=AsyncMock()),
        patch("app.services.ai.usage_tracker.usage_tracker.record", new=AsyncMock()),
        patch("app.services.file_storage.file_storage.download", return_value=b"%PDF-fake content"),
        patch("app.services.resume_parser.extract_text", return_value="resume text content"),
        patch(
            "app.services.ai.client.ai_client.generate",
            new=AsyncMock(return_value=(ai_json, 100, 50)),
        ),
        patch("app.api.v1.jobs.JobMatchRepository.upsert", new=AsyncMock(return_value=match)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/jobs/{job.id}/match",
                headers=_auth_headers(),
                json={"resume_id": str(resume.id)},
            )

    assert resp.status_code == 200
    assert resp.json()["match_score"] == 82.5


@pytest.mark.asyncio
async def test_match_job_no_translated_description_returns_422() -> None:
    user = make_user()
    job = _mock_job()
    job.translated_description = None

    with (
        _bypass_middleware(user),
        patch("app.api.v1.jobs.JobPostingRepository.get_active", new=AsyncMock(return_value=job)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/jobs/{job.id}/match",
                headers=_auth_headers(),
                json={"resume_id": str(uuid.uuid4())},
            )

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_match_job_resume_not_found_returns_404() -> None:
    user = make_user()
    job = _mock_job()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.jobs.JobPostingRepository.get_active", new=AsyncMock(return_value=job)),
        patch("app.api.v1.jobs.ResumeRepository.get_owned", new=AsyncMock(return_value=None)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/jobs/{job.id}/match",
                headers=_auth_headers(),
                json={"resume_id": str(uuid.uuid4())},
            )

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_match_job_s3_failure_returns_502() -> None:
    user = make_user()
    job = _mock_job()
    resume = _mock_resume(user_id=user.id)
    profile = make_profile(user_id=user.id)
    profile.japanese_level = JapaneseLevel.N3

    with (
        _bypass_middleware(user),
        patch("app.api.v1.jobs.JobPostingRepository.get_active", new=AsyncMock(return_value=job)),
        patch("app.api.v1.jobs.ResumeRepository.get_owned", new=AsyncMock(return_value=resume)),
        patch(
            "app.api.v1.jobs.ProfileRepository.get_by_user_id", new=AsyncMock(return_value=profile)
        ),
        patch("app.services.ai.usage_tracker.usage_tracker.check_budget", new=AsyncMock()),
        patch(
            "app.services.file_storage.file_storage.download",
            side_effect=StorageError("S3 down"),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/jobs/{job.id}/match",
                headers=_auth_headers(),
                json={"resume_id": str(resume.id)},
            )

    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_match_job_unparseable_resume_returns_422() -> None:
    user = make_user()
    job = _mock_job()
    resume = _mock_resume(user_id=user.id)
    profile = make_profile(user_id=user.id)
    profile.japanese_level = JapaneseLevel.N3

    with (
        _bypass_middleware(user),
        patch("app.api.v1.jobs.JobPostingRepository.get_active", new=AsyncMock(return_value=job)),
        patch("app.api.v1.jobs.ResumeRepository.get_owned", new=AsyncMock(return_value=resume)),
        patch(
            "app.api.v1.jobs.ProfileRepository.get_by_user_id", new=AsyncMock(return_value=profile)
        ),
        patch("app.services.ai.usage_tracker.usage_tracker.check_budget", new=AsyncMock()),
        patch("app.services.file_storage.file_storage.download", return_value=b"corrupt bytes"),
        patch(
            "app.services.resume_parser.extract_text",
            side_effect=ParseError("unsupported format"),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/jobs/{job.id}/match",
                headers=_auth_headers(),
                json={"resume_id": str(resume.id)},
            )

    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /jobs/applications
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_application_new() -> None:
    user = make_user()
    job = _mock_job()
    created = _mock_application(user_id=user.id)

    with (
        _bypass_middleware(user),
        _fake_db_session(scalar_results=[created]),
        patch("app.api.v1.jobs.JobPostingRepository.get_active", new=AsyncMock(return_value=job)),
        patch(
            "app.api.v1.jobs.JobApplicationRepository.get_for_user_and_job",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "app.api.v1.jobs.JobApplicationRepository.create", new=AsyncMock(return_value=created)
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/jobs/applications",
                headers=_auth_headers(),
                json={"job_posting_id": str(job.id)},
            )

    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_create_application_already_exists_returns_existing() -> None:
    user = make_user()
    job = _mock_job()
    existing = _mock_application(user_id=user.id)

    with (
        _bypass_middleware(user),
        _fake_db_session(scalar_results=[existing]),
        patch("app.api.v1.jobs.JobPostingRepository.get_active", new=AsyncMock(return_value=job)),
        patch(
            "app.api.v1.jobs.JobApplicationRepository.get_for_user_and_job",
            new=AsyncMock(return_value=existing),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/jobs/applications",
                headers=_auth_headers(),
                json={"job_posting_id": str(job.id)},
            )

    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_create_application_job_not_found_returns_404() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.jobs.JobPostingRepository.get_active", new=AsyncMock(return_value=None)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/jobs/applications",
                headers=_auth_headers(),
                json={"job_posting_id": str(uuid.uuid4())},
            )

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /jobs/applications
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_applications_returns_items() -> None:
    user = make_user()
    apps = [_mock_application(user_id=user.id), _mock_application(user_id=user.id)]

    with (
        _bypass_middleware(user),
        _fake_db_session(scalars_result=apps),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/jobs/applications", headers=_auth_headers())

    assert resp.status_code == 200
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_list_applications_invalid_status_returns_422() -> None:
    user = make_user()

    with _bypass_middleware(user):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/jobs/applications",
                headers=_auth_headers(),
                params={"status": "not_a_real_status"},
            )

    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /jobs/applications/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_application_status() -> None:
    user = make_user()
    application = _mock_application(user_id=user.id)

    with (
        _bypass_middleware(user),
        _fake_db_session(scalar_results=[application, application]),
        patch(
            "app.repositories.job.JobApplicationRepository.update",
            new=AsyncMock(return_value=application),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(
                f"/api/v1/jobs/applications/{application.id}",
                headers=_auth_headers(),
                json={"status": "applied"},
            )

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_update_application_not_found_returns_404() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        _fake_db_session(scalar_results=[None]),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(
                f"/api/v1/jobs/applications/{uuid.uuid4()}",
                headers=_auth_headers(),
                json={"status": "applied"},
            )

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_application_invalid_status_returns_422() -> None:
    user = make_user()
    application = _mock_application(user_id=user.id)

    with (
        _bypass_middleware(user),
        _fake_db_session(scalar_results=[application]),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(
                f"/api/v1/jobs/applications/{application.id}",
                headers=_auth_headers(),
                json={"status": "not_a_real_status"},
            )

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_update_application_notes_only() -> None:
    user = make_user()
    application = _mock_application(user_id=user.id)

    with (
        _bypass_middleware(user),
        _fake_db_session(scalar_results=[application, application]),
        patch(
            "app.repositories.job.JobApplicationRepository.update",
            new=AsyncMock(return_value=application),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(
                f"/api/v1/jobs/applications/{application.id}",
                headers=_auth_headers(),
                json={"notes": "Following up next week"},
            )

    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# DELETE /jobs/applications/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_application_happy_path() -> None:
    user = make_user()
    application = _mock_application(user_id=user.id)

    with (
        _bypass_middleware(user),
        _fake_db_session(scalar_results=[application]),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(
                f"/api/v1/jobs/applications/{application.id}", headers=_auth_headers()
            )

    assert resp.status_code == 200
    assert resp.json() == {"detail": "Application deleted"}


@pytest.mark.asyncio
async def test_delete_application_not_found_returns_404() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        _fake_db_session(scalar_results=[None]),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(
                f"/api/v1/jobs/applications/{uuid.uuid4()}", headers=_auth_headers()
            )

    assert resp.status_code == 404
