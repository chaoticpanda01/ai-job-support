"""
E2E test for rirekisho (履歴書) generation: real HTTP request through auth,
a real database, the real BackgroundTasks-driven generation pipeline, and
real WeasyPrint PDF rendering. Only the genuinely external boundaries are
mocked: the Gemini call (ai_client.generate) and object storage
(file_storage) -- no real AI cost, no real S3/B2 calls.

Requires a real, migrated Postgres reachable via the app's configured
DATABASE_URL/DATABASE_SYNC_URL -- run `docker compose up postgres redis -d`
from the repo root before running this file locally. CI already provisions
this via its `postgres` service container. If the database isn't reachable,
this test fails loudly with a connection error rather than skipping --
that's deliberate, so a broken DB connection is never silently hidden.

NOTE: usage_tracker.check_budget()/record() are deliberately NOT mocked
(only ai_client.generate and file_storage are), so every real pass through
this pipeline consumes a slot in the app's actual, shared, global AI-call
budget (AI_GLOBAL_CALL_LIMIT in app/services/ai/usage_tracker.py -- 16
calls per rolling 24h, shared across everything hitting this database, not
per-test or per-user). Running this file repeatedly in quick succession
during local development can exhaust that budget against your local dev
DB, causing AIBudgetError failures unrelated to any code defect -- that's
expected, not a regression, and clears on its own once the rolling window
ages out. Do not "fix" it by mocking usage_tracker or by deleting rows
from ai_usage_logs.
"""

from __future__ import annotations

import base64
import json
import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.database import AsyncSessionFactory
from app.main import app
from app.middleware import clerk_auth as clerk_auth_module
from app.models.document import GeneratedDocument
from app.models.enums import DocumentStatus, Gender
from app.models.resume import Resume
from app.models.user import Profile, User
from app.services.ai.client import ai_client
from app.services.file_storage import file_storage
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

_FAKE_JWKS: dict[str, Any] = {"keys": []}

# Same tiny valid JPEG already used in backend/tests/unit/test_document_generator.py's
# WeasyPrint image-embedding regression test.
_TEST_JPEG_BASE64 = (
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8Q"
    "EBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ"
    "EBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QA"
    "FQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
)
_TEST_JPEG_BYTES = base64.b64decode(_TEST_JPEG_BASE64)

_MAX_POLL_ATTEMPTS = 5


def _auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer valid_token"}


@contextmanager
def _bypass_middleware(user: User) -> Iterator[None]:
    """
    Let the real ClerkJWTMiddleware run, mocking only its network/DB-lookup
    boundary (_resolve_user) so it resolves to the given real, DB-backed
    user without a real Clerk round-trip. Mirrors
    tests/unit/test_document_routes.py's _bypass_middleware.
    """
    claims = {"sub": user.clerk_id, "email": user.email, "exp": int(time.time()) + 3600}
    with (
        patch.object(clerk_auth_module, "_get_jwks", new=AsyncMock(return_value=_FAKE_JWKS)),
        patch("app.middleware.clerk_auth._validate_token", new=AsyncMock(return_value=claims)),
        patch("app.middleware.clerk_auth._resolve_user", new=AsyncMock(return_value=user)),
    ):
        yield


async def _seed_complete_profile_user(*, with_photo: bool) -> tuple[User, Resume, str | None]:
    """
    Insert a real User + Profile (complete enough to pass
    rirekisho_missing_fields()) + Resume, directly via the app's own
    session factory. Returns the persisted User, Resume, and the photo
    storage key (or None) -- returned directly rather than via
    user.profile.photo_storage_key, since the session (and the object's
    relationship-loading capability) closes at the end of this function;
    accessing an unloaded relationship on a detached async ORM object
    later would raise DetachedInstanceError.
    """
    unique = uuid.uuid4().hex
    photo_storage_key = f"photos/{unique}/photo.jpg" if with_photo else None
    async with AsyncSessionFactory() as session:
        user = User(
            clerk_id=f"clerk_e2e_test_{unique}",
            email=f"e2e-{unique}@example.com",
            full_name="山田 太郎",
            email_verified=True,
        )
        session.add(user)
        await session.flush()

        profile = Profile(
            user_id=user.id,
            name_kana="ヤマダ タロウ",
            date_of_birth=date(1990, 1, 15),
            gender=Gender.male,
            phone_number="090-1234-5678",
            mailing_address="東京都渋谷区1-2-3",
            photo_storage_key=photo_storage_key,
        )
        session.add(profile)

        resume = Resume(
            user_id=user.id,
            file_name="resume.pdf",
            file_url=f"resumes/{unique}/resume.pdf",
            file_size_bytes=12345,
            mime_type="application/pdf",
        )
        session.add(resume)

        await session.commit()
        await session.refresh(user)
        await session.refresh(resume)
        return user, resume, photo_storage_key


async def _fetch_document_row(document_id: uuid.UUID) -> GeneratedDocument | None:
    """
    Independently re-reads the GeneratedDocument row via a fresh session,
    separate from whatever session the request/background-task pipeline
    used -- this is what actually proves the DB write landed, rather than
    trusting the same API route that could have its own read/write bug.
    """
    async with AsyncSessionFactory() as session:
        result = await session.execute(
            select(GeneratedDocument).where(GeneratedDocument.id == document_id)
        )
        return result.scalar_one_or_none()


async def _cleanup_user(user_id: uuid.UUID) -> None:
    """Deletes the User row -- cascades (ondelete=CASCADE) to Profile/Resume/GeneratedDocument."""
    async with AsyncSessionFactory() as session:
        await session.execute(delete(User).where(User.id == user_id))
        await session.commit()


def _mock_ai_generate() -> AsyncMock:
    """Canned RirekishoResult JSON -- no real Gemini call."""
    result = {
        "education": [{"year": 2012, "month": 3, "entry": "○○大学 卒業"}],
        "work_history": [{"year": 2012, "month": 4, "entry": "株式会社ABC 入社"}],
        "qualifications": ["日本語能力試験N3"],
        "self_pr": "チームワークを大切にしています。",
        "motivation": "日本で働きたいと思っています。",
    }
    return AsyncMock(return_value=(json.dumps(result), 100, 50))


def _mock_file_storage_download(photo_key: str | None) -> MagicMock:
    """
    Serves canned bytes for both call sites that read via file_storage.download:
    resume-text extraction (any bytes -- extract_text is separately mocked
    and never actually parses them) and, when photo_key is given, the
    profile photo (must be a real decodable JPEG since WeasyPrint actually
    renders it into the PDF).

    file_storage.download() is a synchronous method (not async, unlike
    ai_client.generate) -- must be mocked with MagicMock, not AsyncMock, or
    calling it would return an unawaited coroutine object instead of bytes.
    """

    def _download(key: str) -> bytes:
        if photo_key is not None and key == photo_key:
            return _TEST_JPEG_BYTES
        return b"unused placeholder bytes for resume text extraction"

    return MagicMock(side_effect=_download)


async def _create_and_await_completion(
    client: AsyncClient, resume_id: uuid.UUID, *, orientation: str = "portrait"
) -> str:
    """
    POSTs to create a rirekisho, polls until it completes (or the poll bound
    is exhausted), and confirms the download endpoint reports it ready.
    Returns the document_id. BackgroundTasks execute synchronously as part
    of the same ASGI call when driven through ASGITransport, so the very
    first poll already reflects the final status in practice -- the bound
    is defensive, not a real eventual-consistency wait.
    """
    create_resp = await client.post(
        "/api/v1/documents/rirekisho",
        headers=_auth_headers(),
        json={"resume_id": str(resume_id), "orientation": orientation},
    )
    assert create_resp.status_code == 202
    document_id: str = create_resp.json()["id"]

    status = create_resp.json()["status"]
    for _ in range(_MAX_POLL_ATTEMPTS):
        if status == DocumentStatus.completed.value:
            break
        poll_resp = await client.get(f"/api/v1/documents/{document_id}", headers=_auth_headers())
        status = poll_resp.json()["status"]
    assert status == DocumentStatus.completed.value, (
        f"generation did not complete, final status={status!r}"
    )

    download_resp = await client.get(
        f"/api/v1/documents/{document_id}/download", headers=_auth_headers()
    )
    assert download_resp.status_code == 200
    assert download_resp.json()["download_url"] is not None

    return document_id


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "with_photo, orientation",
    [(False, "portrait"), (True, "portrait"), (True, "landscape")],
    ids=["without_photo_portrait", "with_photo_portrait", "with_photo_landscape"],
)
async def test_generate_rirekisho_end_to_end(with_photo: bool, orientation: str) -> None:
    user, resume, photo_key = await _seed_complete_profile_user(with_photo=with_photo)
    try:
        with (
            _bypass_middleware(user),
            patch.object(ai_client, "generate", new=_mock_ai_generate()),
            patch.object(file_storage, "download", new=_mock_file_storage_download(photo_key)),
            patch("app.services.document_generator.extract_text", return_value="resume text"),
            patch.object(file_storage, "upload_document") as mock_upload,
        ):
            mock_upload.return_value = "documents/e2e-test/rirekisho/fake.pdf"

            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                document_id = await _create_and_await_completion(
                    client, resume.id, orientation=orientation
                )

        document_row = await _fetch_document_row(uuid.UUID(document_id))
        assert document_row is not None
        assert document_row.status == DocumentStatus.completed
        assert document_row.file_url is not None
        assert document_row.orientation.value == orientation

        assert mock_upload.called
        pdf_bytes = mock_upload.call_args.kwargs["file_bytes"]
        assert pdf_bytes.startswith(b"%PDF-")
        contains_image = b"/Subtype /Image" in pdf_bytes or b"/Subtype/Image" in pdf_bytes
        assert contains_image == with_photo

        if orientation == "landscape":
            import io

            import pypdf

            reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
            assert len(reader.pages) == 2
    finally:
        await _cleanup_user(user.id)
