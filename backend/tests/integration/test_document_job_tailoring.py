"""
Tailoring a generated document to a job posting, checked against real Postgres.

Two halves had to agree and didn't. The create route stored only the
posting's id in job_context; the generator read job_context's
"translated_description", which nothing ever wrote. Every "tailored"
document was generated as if no posting had been given, and nothing failed.
So the first test here drives the whole chain -- the real route, the real
repository, the real generator up to the AI call -- rather than checking
either half alone, since each half was fine on its own.

The rest pin the security rule the lookup has to respect. A posting pasted
without a URL is private to whoever pasted it, and anything the generator is
given ends up in the prompt and can be read back out of the PDF, so the
lookup must go through the visibility-scoped get_active.

Seeding and the auth bypass come from tests/integration/_helpers.py.
Postings are deleted explicitly: job_postings.submitted_by is ON DELETE
SET NULL, so deleting the users would leave them behind.
Generated documents cascade with their user.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, patch

import pytest
from app.database import AsyncSessionFactory
from app.main import app
from app.models.document import GeneratedDocument
from app.models.enums import JobSourcePlatform, OriginalLanguage
from app.models.job import JobPosting
from app.models.user import User
from app.services.ai.client import AIError, ai_client
from app.services.ai.usage_tracker import usage_tracker
from app.services.file_storage import file_storage
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select

from tests.integration._helpers import (
    auth_headers,
    bypass_middleware,
    cleanup_user,
    seed_complete_profile_user,
)

pytestmark = pytest.mark.asyncio

_ENDPOINTS = ["rirekisho", "shokumu"]


class _World:
    def __init__(self) -> None:
        self.token = f"tailor{uuid.uuid4().hex[:12]}"
        self.me: User
        self.resume_id: uuid.UUID
        self.other_id: uuid.UUID
        self.shared: uuid.UUID  # someone else's, from a URL
        self.their_paste: uuid.UUID  # someone else's, pasted text
        self.my_paste: uuid.UUID  # mine, pasted text
        self.untranslated: uuid.UUID  # mine, never translated

    def text(self, which: str) -> str:
        return f"{self.token}-{which}-posting-text"


def _posting(submitted_by: uuid.UUID, *, url: str | None, text: str | None) -> JobPosting:
    return JobPosting(
        source_url=url,
        source_platform=JobSourcePlatform.manual,
        original_language=OriginalLanguage.ja,
        translated_title="Backend Engineer",
        translated_description=text,
        submitted_by=submitted_by,
    )


@pytest.fixture
async def world() -> AsyncIterator[_World]:
    w = _World()
    me, resume, _ = await seed_complete_profile_user(with_photo=False)
    w.me, w.resume_id = me, resume.id
    posting_ids: list[uuid.UUID] = []
    other_id: uuid.UUID | None = None

    # Everything from here on is undone in the finally, including a setup that
    # fails partway: the seeded user is already committed by then, and without
    # this a failure while inserting postings would leave it in the database.
    try:
        async with AsyncSessionFactory() as session:
            other = User(clerk_id=f"clerk_{w.token}", email=f"{w.token}@example.com")
            session.add(other)
            await session.flush()
            other_id = w.other_id = other.id

            shared = _posting(
                other.id, url=f"https://example.test/{w.token}", text=w.text("shared")
            )
            their_paste = _posting(other.id, url=None, text=w.text("theirs"))
            my_paste = _posting(me.id, url=None, text=w.text("mine"))
            untranslated = _posting(me.id, url=None, text=None)
            session.add_all([shared, their_paste, my_paste, untranslated])
            await session.commit()
            w.shared, w.their_paste = shared.id, their_paste.id
            w.my_paste, w.untranslated = my_paste.id, untranslated.id
            posting_ids = [w.shared, w.their_paste, w.my_paste, w.untranslated]

        yield w
    finally:
        try:
            async with AsyncSessionFactory() as session:
                if posting_ids:
                    await session.execute(delete(JobPosting).where(JobPosting.id.in_(posting_ids)))
                if other_id is not None:
                    await session.execute(delete(User).where(User.id == other_id))
                await session.commit()
        finally:
            # Runs even if the block above raises, so the seeded user never
            # outlives the test.
            await cleanup_user(me.id)


async def _create(w: _World, endpoint: str, job_posting_id: uuid.UUID | None) -> tuple[int, dict]:
    """POST a document create as `w.me` without running generation."""
    body: dict[str, str] = {"resume_id": str(w.resume_id)}
    if job_posting_id is not None:
        body["job_posting_id"] = str(job_posting_id)
    with (
        bypass_middleware(w.me),
        # Generation is covered by the chain test; here only what the route
        # decides and stores matters.
        patch("app.workers.document_tasks._run_generation", new=AsyncMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/documents/{endpoint}", json=body, headers=auth_headers()
            )
    return resp.status_code, resp.json()


async def _stored_context(document_id: str) -> dict | None:
    async with AsyncSessionFactory() as session:
        doc = await session.get(GeneratedDocument, uuid.UUID(document_id))
        assert doc is not None
        return doc.job_context


async def _document_count(user_id: uuid.UUID) -> int:
    async with AsyncSessionFactory() as session:
        count = await session.scalar(
            select(func.count())
            .select_from(GeneratedDocument)
            .where(GeneratedDocument.user_id == user_id)
        )
        return int(count or 0)


@pytest.mark.parametrize("endpoint", _ENDPOINTS)
async def test_a_tailored_document_puts_the_posting_in_the_prompt(
    world: _World, endpoint: str
) -> None:
    # The whole chain: route -> job_context -> generator -> prompt. The AI
    # call is where the posting has to arrive, so capture it there and stop:
    # raising AIError ends generation before a PDF is rendered or any usage
    # is recorded.
    #
    # check_budget is stubbed because the local dev database shares the
    # app's real global AI cap, and whether it has headroom today has nothing
    # to do with this test. No real AI call can happen here -- generate is
    # replaced -- so stubbing the check spends nothing it exists to protect.
    prompts: list[str] = []

    async def capture(system: str, user: str, **_: object) -> tuple[str, int, int]:
        prompts.append(user)
        raise AIError("stop after capturing the prompt")

    with (
        bypass_middleware(world.me),
        patch.object(usage_tracker, "check_budget", new=AsyncMock()),
        patch.object(ai_client, "generate", new=capture),
        patch.object(file_storage, "download", return_value=b"%PDF-1.4 resume"),
        patch("app.services.document_generator.extract_text", return_value="resume text"),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/documents/{endpoint}",
                json={"resume_id": str(world.resume_id), "job_posting_id": str(world.shared)},
                headers=auth_headers(),
            )

    assert resp.status_code == 202
    assert len(prompts) == 1, "generation never reached the AI call"
    assert world.text("shared") in prompts[0]


@pytest.mark.parametrize("endpoint", _ENDPOINTS)
async def test_cannot_tailor_to_someone_elses_pasted_posting(world: _World, endpoint: str) -> None:
    before = await _document_count(world.me.id)

    status, body = await _create(world, endpoint, world.their_paste)

    assert status == 404
    # Refused before anything was queued, not generated untailored.
    assert await _document_count(world.me.id) == before


@pytest.mark.parametrize("endpoint", _ENDPOINTS)
async def test_a_private_posting_looks_exactly_like_a_missing_one(
    world: _World, endpoint: str
) -> None:
    # Same status and same body, so the response can't be used to probe
    # which posting ids exist.
    hidden = await _create(world, endpoint, world.their_paste)
    missing = await _create(world, endpoint, uuid.uuid4())

    assert hidden == missing


@pytest.mark.parametrize("endpoint", _ENDPOINTS)
async def test_can_tailor_to_a_shared_posting(world: _World, endpoint: str) -> None:
    status, body = await _create(world, endpoint, world.shared)

    assert status == 202
    context = await _stored_context(body["id"])
    assert context is not None
    assert context["translated_description"] == world.text("shared")


@pytest.mark.parametrize("endpoint", _ENDPOINTS)
async def test_can_tailor_to_your_own_pasted_posting(world: _World, endpoint: str) -> None:
    status, body = await _create(world, endpoint, world.my_paste)

    assert status == 202
    context = await _stored_context(body["id"])
    assert context is not None
    assert context["translated_description"] == world.text("mine")


@pytest.mark.parametrize("endpoint", _ENDPOINTS)
async def test_a_posting_with_no_translation_is_refused(world: _World, endpoint: str) -> None:
    status, _ = await _create(world, endpoint, world.untranslated)

    assert status == 422


@pytest.mark.parametrize("endpoint", _ENDPOINTS)
async def test_an_untailored_document_has_no_job_context(world: _World, endpoint: str) -> None:
    status, body = await _create(world, endpoint, None)

    assert status == 202
    assert await _stored_context(body["id"]) is None
