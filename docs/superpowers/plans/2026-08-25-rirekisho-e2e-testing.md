# Rirekisho Generation E2E Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real-database integration test for rirekisho generation — proving the full HTTP → auth → DB → background-task → WeasyPrint → storage → download pipeline actually wires together, with and without an uploaded photo.

**Architecture:** One new test file in `backend/tests/integration/` (currently empty except `__init__.py`). Reuses the existing Clerk-auth-bypass pattern from `backend/tests/unit/test_document_routes.py`. Seeds a real `User`/`Profile`/`Resume` directly via the app's own `AsyncSessionFactory` against the real Postgres (same one `docker-compose.yml` and CI already provide) — no DB mocking. Mocks only the two genuinely external boundaries: `ai_client.generate` (no real Gemini calls) and `file_storage` (no real S3/B2 calls) — everything else (routing, auth middleware, DB, the `BackgroundTasks`-driven generation, and real WeasyPrint PDF rendering) runs for real.

**Tech Stack:** pytest, pytest-asyncio, httpx (`AsyncClient` + `ASGITransport`), real PostgreSQL (via `docker-compose.yml` locally, CI's `postgres` service in CI).

---

### Task 1: Test infrastructure + no-photo E2E test

**Files:**
- Create: `backend/tests/integration/test_rirekisho_generation_e2e.py`

**Context:** `backend/tests/integration/__init__.py` already exists (empty package). `pyproject.toml`'s `testpaths = ["tests"]` means this file will automatically run as part of the existing `pytest` invocation — no CI changes needed. This task builds every piece of infrastructure (auth bypass, DB seed/cleanup, AI/storage mocks) needed for the first scenario; Task 2 reuses all of it for the second scenario.

Before writing the file, some facts about the existing codebase this test depends on (already verified by reading the source):
- `POST /api/v1/documents/rirekisho` accepts `{"resume_id": "<uuid>"}`, returns `202` with `{"id", "status", "error_message", "completed_at"}` (`DocumentStatusResponse`).
- `GET /api/v1/documents/{id}` returns the same shape (status poll).
- `GET /api/v1/documents/{id}/download` returns `DocumentDetailResponse` (`{"content", "download_url", ...}` plus base fields) when the document is `completed`.
- Auth: `ClerkJWTMiddleware` resolves the user via `app.middleware.clerk_auth._resolve_user(session, clerk_id, email)`. Patching that function directly (matching `test_document_routes.py`'s `_bypass_middleware`) makes the real middleware run but skip the real Clerk JWKS/DB round-trip, resolving to whatever `User` object is passed in — including a real, DB-backed one.
- `rirekisho_missing_fields()` (in `app/services/rirekisho_completeness.py`) requires, for `visa_status=none`: `User.full_name`, `Profile.name_kana`, `Profile.date_of_birth` (age 16–80), `Profile.gender`, `Profile.phone_number`, `Profile.mailing_address`.
- `DocumentGenerator._call_ai()` calls `ai_client.generate(...) -> tuple[str, int, int]` (response text, input tokens, output tokens); the text must parse into `RirekishoResult` (`education`, `work_history`, `qualifications`, `self_pr`, `motivation`).
- `DocumentGenerator._fetch_and_extract()` calls `file_storage.download(resume.file_url)` then `extract_text(file_bytes, mime_type)` (imported directly into `app/services/document_generator.py`, so it must be patched there, not in `app.services.resume_parser`).
- `_build_rirekisho_personal()` calls `file_storage.download(profile.photo_storage_key)` only when `photo_storage_key` is set, base64-embeds it, and picks `image/png` vs `image/jpeg` from the key's file extension.
- The generated PDF is uploaded via `file_storage.upload_document(*, file_bytes, user_id, document_type) -> str` (returns a storage key).
- `_run_generation` (the `BackgroundTasks` callback) opens its own `AsyncSessionFactory()` session — separate from the seeding session, but the same real database, so committed writes are visible.
- Deleting a `User` row cascades (via `ondelete="CASCADE"` on every relevant FK) to its `Profile`, `Resume`, and `GeneratedDocument` rows — cleanup only needs to delete the `User` row.
- `usage_tracker.check_budget()` runs for real against `ai_usage_logs`; a brand-new user has no prior usage, so it always passes with no extra setup.

- [ ] **Step 1: Write the test file with all infrastructure and the first test**

Create `backend/tests/integration/test_rirekisho_generation_e2e.py`:

```python
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


@pytest.mark.asyncio
async def test_generate_rirekisho_without_photo_end_to_end() -> None:
    user, resume, _photo_key = await _seed_complete_profile_user(with_photo=False)
    try:
        with (
            _bypass_middleware(user),
            patch.object(ai_client, "generate", new=_mock_ai_generate()),
            patch.object(file_storage, "download", new=_mock_file_storage_download(None)),
            patch("app.services.document_generator.extract_text", return_value="resume text"),
            patch.object(file_storage, "upload_document") as mock_upload,
        ):
            mock_upload.return_value = "documents/e2e-test/rirekisho/fake.pdf"

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                create_resp = await client.post(
                    "/api/v1/documents/rirekisho",
                    headers=_auth_headers(),
                    json={"resume_id": str(resume.id)},
                )
                assert create_resp.status_code == 202
                document_id = create_resp.json()["id"]

                status = create_resp.json()["status"]
                for _ in range(5):
                    if status == DocumentStatus.completed.value:
                        break
                    poll_resp = await client.get(
                        f"/api/v1/documents/{document_id}", headers=_auth_headers()
                    )
                    status = poll_resp.json()["status"]
                assert status == DocumentStatus.completed.value, (
                    f"generation did not complete, final status={status!r}"
                )

                download_resp = await client.get(
                    f"/api/v1/documents/{document_id}/download", headers=_auth_headers()
                )
                assert download_resp.status_code == 200
                assert download_resp.json()["download_url"] is not None

        document_row = await _fetch_document_row(uuid.UUID(document_id))
        assert document_row is not None
        assert document_row.status == DocumentStatus.completed
        assert document_row.file_url is not None

        assert mock_upload.called
        pdf_bytes = mock_upload.call_args.kwargs["file_bytes"]
        assert pdf_bytes.startswith(b"%PDF-")
        assert b"/Subtype /Image" not in pdf_bytes and b"/Subtype/Image" not in pdf_bytes
    finally:
        await _cleanup_user(user.id)
```

- [ ] **Step 2: Run it**

Ensure Postgres/Redis are up first: `docker compose up postgres redis -d` (from the repo root).

Run: `cd backend && .venv/bin/python -m pytest tests/integration/test_rirekisho_generation_e2e.py -v --no-cov`
Expected: `test_generate_rirekisho_without_photo_end_to_end` PASSES. (Unlike a typical TDD cycle, there's no new production code to write here — the feature this test exercises was already built and fixed earlier this session. If it fails, don't "fix the test to make it pass" — read the failure, it means either a mock is wired wrong or a real bug exists; investigate before changing assertions.)

- [ ] **Step 3: Commit**

```bash
git add backend/tests/integration/test_rirekisho_generation_e2e.py
git commit -m "Add E2E test infra + no-photo rirekisho generation test"
```

---

### Task 2: With-photo E2E test

**Files:**
- Modify: `backend/tests/integration/test_rirekisho_generation_e2e.py`

**Context:** Reuses every helper from Task 1 — including `_create_and_await_completion` (the shared create/poll/download helper extracted from Task 1's code-quality review, which post-dates this plan's original draft; use it, don't re-inline the create/poll/download sequence). The only differences from the first test: seed with `with_photo=True`, mock `file_storage.download` to serve real JPEG bytes for the photo key, and invert the image-presence assertion.

- [ ] **Step 1: Add the second test**

Append to `backend/tests/integration/test_rirekisho_generation_e2e.py`, after `test_generate_rirekisho_without_photo_end_to_end`:

```python
@pytest.mark.asyncio
async def test_generate_rirekisho_with_photo_end_to_end() -> None:
    user, resume, photo_key = await _seed_complete_profile_user(with_photo=True)
    try:
        with (
            _bypass_middleware(user),
            patch.object(ai_client, "generate", new=_mock_ai_generate()),
            patch.object(file_storage, "download", new=_mock_file_storage_download(photo_key)),
            patch("app.services.document_generator.extract_text", return_value="resume text"),
            patch.object(file_storage, "upload_document") as mock_upload,
        ):
            mock_upload.return_value = "documents/e2e-test/rirekisho/fake.pdf"

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                document_id = await _create_and_await_completion(client, resume.id)

        document_row = await _fetch_document_row(uuid.UUID(document_id))
        assert document_row is not None
        assert document_row.status == DocumentStatus.completed
        assert document_row.file_url is not None

        assert mock_upload.called
        pdf_bytes = mock_upload.call_args.kwargs["file_bytes"]
        assert pdf_bytes.startswith(b"%PDF-")
        assert b"/Subtype /Image" in pdf_bytes or b"/Subtype/Image" in pdf_bytes
    finally:
        await _cleanup_user(user.id)
```

- [ ] **Step 2: Run both tests**

Run: `cd backend && .venv/bin/python -m pytest tests/integration/test_rirekisho_generation_e2e.py -v --no-cov`
Expected: both tests PASS (2 passed).

- [ ] **Step 3: Check ruff/mypy cleanliness**

Run: `cd backend && .venv/bin/ruff check tests/integration/test_rirekisho_generation_e2e.py && .venv/bin/ruff format --check tests/integration/test_rirekisho_generation_e2e.py`
Expected: both clean. If `ruff format --check` reports drift, run `.venv/bin/ruff format tests/integration/test_rirekisho_generation_e2e.py` and re-verify.

(mypy is not run here — CI's mypy step only checks `app/`, not `tests/`, per `.github/workflows/ci.yml`.)

- [ ] **Step 4: Commit**

```bash
git add backend/tests/integration/test_rirekisho_generation_e2e.py
git commit -m "Add with-photo rirekisho generation E2E test"
```

---

### Task 3: Red-green verification (prove these tests have real teeth)

**Files:** None modified — verification only, following this session's own precedent (`865f964` originally shipped a false-negative regression test, corrected in `c3e33e0` after independent review caught it). Both new tests get the same scrutiny before being considered done.

- [ ] **Step 1: Verify the no-photo test actually catches a broken embed-when-no-photo state**

Temporarily break the "no photo" invariant to confirm the test's `/Subtype /Image` absence check is real, not vacuous. In `backend/app/services/document_generator.py`, find the `else:` branch inside `_render_rirekisho()` (the no-photo placeholder branch) and temporarily force it to render an `<img>` tag anyway, by adding this line right after `photo_data_uri = p.get("photo_data_uri")`. Use the same real, valid JPEG bytes the test itself uses (not arbitrary fake bytes) so the failure mode is unambiguous — WeasyPrint is guaranteed to actually embed a real image, rather than possibly failing to decode invalid bytes and producing a different, harder-to-interpret failure:

```python
    photo_data_uri = p.get("photo_data_uri") or (
        "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKC"
        "gkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQE"
        "BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAA"
        "Aj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oAD"
        "AMBAAIRAxEAPwCdABmX/9k="
    )  # TEMPORARY: red-green check
```

Run: `cd backend && .venv/bin/python -m pytest tests/integration/test_rirekisho_generation_e2e.py::test_generate_rirekisho_without_photo_end_to_end -v --no-cov`
Expected: FAILS (the image-absence assertion should trip — if it instead fails with an unrelated error, or passes, investigate before proceeding; don't just note it and move on).

Revert the temporary change:

```bash
git checkout -- backend/app/services/document_generator.py
```

Run: `cd backend && .venv/bin/python -m pytest tests/integration/test_rirekisho_generation_e2e.py::test_generate_rirekisho_without_photo_end_to_end -v --no-cov`
Expected: PASSES again (confirms the revert was clean).

- [ ] **Step 2: Verify the with-photo test actually catches a broken embed-when-photo-present state**

In `backend/tests/integration/test_rirekisho_generation_e2e.py`, temporarily change `_mock_file_storage_download`'s photo branch to return empty/invalid bytes instead of a real JPEG — replace this line inside `_mock_file_storage_download`'s inner `_download` function:

```python
        if photo_key is not None and key == photo_key:
            return _TEST_JPEG_BYTES
```

with:

```python
        if photo_key is not None and key == photo_key:
            return b""  # TEMPORARY: red-green check -- invalid image bytes
```

Run: `cd backend && .venv/bin/python -m pytest tests/integration/test_rirekisho_generation_e2e.py::test_generate_rirekisho_with_photo_end_to_end -v --no-cov`
Expected: FAILS (the image-presence assertion should trip, since WeasyPrint can't embed invalid image data — if the test instead errors out before reaching that assertion, that's still evidence the test isn't a silent placebo; if it unexpectedly PASSES, that's a real problem to investigate before trusting this test).

Revert the temporary change:

```python
        if photo_key is not None and key == photo_key:
            return _TEST_JPEG_BYTES
```

Run: `cd backend && .venv/bin/python -m pytest tests/integration/test_rirekisho_generation_e2e.py -v --no-cov`
Expected: both tests PASS again (2 passed).

- [ ] **Step 3: Confirm the repo is clean (nothing left uncommitted from the reverts)**

```bash
git status --short
git diff --stat
```

Expected: no output from either command (the Step 1 revert used `git checkout --`, and Step 2's revert restored the file to its Task 2 committed state by hand — confirm `git diff --stat` is empty; if it isn't, that means the manual revert in Step 2 left the file different from what Task 2 committed, and you need to fix it before proceeding, not commit an accidental change).

- [ ] **Step 4: Full backend test suite**

Run: `cd backend && .venv/bin/python -m pytest -q` (bare invocation, no explicit path arguments — `pyproject.toml`'s `testpaths = ["tests"]` picks up both `tests/unit` and `tests/integration` automatically, matching exactly what CI runs).

Do NOT run `pytest tests/unit tests/integration -q` (unit directory listed first as an explicit argument) — this ordering triggers a real but unrelated pytest-asyncio/asyncpg issue (`RuntimeError: Event loop is closed`, from a connection-close callback trying to schedule a task on an event loop that a later, differently-scoped test already tore down). It's a pre-existing event-loop-lifecycle interaction between the many function-scoped async unit tests and the module-level DB engine singleton — not a defect introduced by this test's code — and it does not occur with the bare `pytest` invocation (or with `tests/integration` listed before `tests/unit`), which is what CI actually runs. If you hit this, don't debug it as if it were a real regression — just use the bare `pytest -q` invocation instead.

Expected: all tests pass, including the 2 new E2E tests, with no regressions in the rest of the suite.

No commit for this task — it's verification only, and Step 3 confirms nothing was left uncommitted.
