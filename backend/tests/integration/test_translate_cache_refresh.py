"""
Re-translating a URL whose cached translation has expired, against real
Postgres.

job_postings has a unique index on source_url covering every row that isn't
soft-deleted (idx_job_postings_source_url, built by the baseline migration
from database/schema.sql). get_by_url only returns a posting while its cache
is live, so once cached_until passed the translate route missed the cache,
tried to insert a second row for the same URL, and hit that index -- an
IntegrityError, a 500 to the user. The route tests mock the database
session and never reach the index, which is why this lives here.

The fix refreshes the expired row in place: same id, so tracker entries,
matches and documents that point at it stay valid.

The AI call is stubbed, and so are check_budget and record. The local dev
database shares the app's real global AI cap; with generate replaced there
is no real call to budget for, and recording one would put a fake entry in
the real usage log that counts against everyone's cap. Seeded rows are
deleted explicitly (job_postings.submitted_by is ON DELETE SET NULL).
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from app.database import AsyncSessionFactory
from app.main import app
from app.models.enums import JobSourcePlatform, OriginalLanguage
from app.models.job import JobPosting
from app.models.user import User
from app.repositories.job import JobPostingRepository
from app.services.ai.client import ai_client
from app.services.ai.usage_tracker import usage_tracker
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select, update

from tests.integration._helpers import auth_headers, bypass_middleware

pytestmark = pytest.mark.asyncio

_PASTE = "【募集職種】バックエンドエンジニア " * 5  # comfortably over the 50-char minimum


def _translation(title: str) -> str:
    """A valid JobTranslationResult, as the model would return it."""
    return json.dumps(
        {
            "translated_title": title,
            "translated_description": f"{title} description",
            "translation_summary": f"{title} summary",
            "foreigner_friendliness_score": 77,
            "structured_data": {
                "company_name": "Fresh K.K.",
                "location": "Tokyo",
                "employment_type": "Full-time",
                "salary_range": "6-9M JPY",
                "required_japanese": "N2",
                "required_experience_years": 3,
                "key_requirements": ["Python"],
                "benefits": ["Remote"],
                "visa_sponsorship": True,
            },
        }
    )


class _World:
    def __init__(self) -> None:
        self.token = uuid.uuid4().hex[:12]
        self.url = f"https://example.test/job/{self.token}"
        self.alice: User  # submitted the expired posting
        self.bob: User  # someone else submitting the same URL later
        self.posting: uuid.UUID


async def _seed_posting(w: _World, *, cached_until: datetime | None) -> None:
    async with AsyncSessionFactory() as session:
        posting = JobPosting(
            source_url=w.url,
            source_platform=JobSourcePlatform.manual,
            original_language=OriginalLanguage.ja,
            original_description="alice's own paste",
            translated_title="stale title",
            translated_description="stale description",
            translation_summary="stale summary",
            submitted_by=w.alice.id,
            cached_until=cached_until,
        )
        session.add(posting)
        await session.commit()
        w.posting = posting.id


@pytest.fixture
async def world() -> AsyncIterator[_World]:
    w = _World()
    user_ids: list[uuid.UUID] = []
    try:
        async with AsyncSessionFactory() as session:
            alice = User(clerk_id=f"clerk_refresh_a_{w.token}", email=f"a-{w.token}@example.com")
            bob = User(clerk_id=f"clerk_refresh_b_{w.token}", email=f"b-{w.token}@example.com")
            session.add_all([alice, bob])
            await session.commit()
            user_ids = [alice.id, bob.id]
            for user in (alice, bob):
                await session.refresh(user)
            w.alice, w.bob = alice, bob
        yield w
    finally:
        async with AsyncSessionFactory() as session:
            await session.execute(delete(JobPosting).where(JobPosting.source_url == w.url))
            if user_ids:
                await session.execute(delete(User).where(User.id.in_(user_ids)))
            await session.commit()


async def _translate(w: _World, as_user: User, generate: AsyncMock) -> tuple[int, dict]:
    with (
        bypass_middleware(as_user),
        patch.object(ai_client, "generate", new=generate),
        patch.object(usage_tracker, "check_budget", new=AsyncMock()),
        patch.object(usage_tracker, "record", new=AsyncMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/jobs/translate",
                json={"source_url": w.url, "raw_text": _PASTE},
                headers=auth_headers(),
            )
    return resp.status_code, resp.json()


def _fresh_generate(title: str = "fresh title") -> AsyncMock:
    return AsyncMock(return_value=(_translation(title), 100, 200))


async def _rows(w: _World) -> list[JobPosting]:
    """Every row for this URL, soft-deleted ones included."""
    async with AsyncSessionFactory() as session:
        return list(
            (await session.scalars(select(JobPosting).where(JobPosting.source_url == w.url))).all()
        )


_EXPIRED = datetime.now(tz=UTC) - timedelta(days=1)


async def test_an_expired_url_is_translated_again_instead_of_crashing(world: _World) -> None:
    # The bug: this raised UniqueViolationError on idx_job_postings_source_url.
    await _seed_posting(world, cached_until=_EXPIRED)

    status, body = await _translate(world, world.bob, _fresh_generate())

    assert status == 201
    assert body["translated_title"] == "fresh title"


async def test_the_expired_row_is_refreshed_in_place(world: _World) -> None:
    await _seed_posting(world, cached_until=_EXPIRED)

    _, body = await _translate(world, world.bob, _fresh_generate())

    rows = await _rows(world)
    assert len(rows) == 1, "a second row for the URL was inserted"
    row = rows[0]
    # Same id, so tracker entries, matches and documents that point at it
    # stay valid.
    assert row.id == world.posting
    assert body["id"] == str(world.posting)
    assert row.translated_title == "fresh title"
    assert row.cached_until is not None and row.cached_until > datetime.now(tz=UTC)


async def test_a_refresh_by_someone_else_keeps_the_submitter_and_their_paste(
    world: _World,
) -> None:
    # The raw paste is shown to the submitter alone. Replacing it with the
    # refresher's text would show alice bob's paste -- so it stays hers.
    await _seed_posting(world, cached_until=_EXPIRED)

    _, body = await _translate(world, world.bob, _fresh_generate())

    row = (await _rows(world))[0]
    assert row.submitted_by == world.alice.id
    assert row.original_description == "alice's own paste"
    assert body["is_mine"] is False
    assert body["original_description"] is None


async def test_the_submitter_refreshing_replaces_their_own_paste(world: _World) -> None:
    await _seed_posting(world, cached_until=_EXPIRED)

    _, body = await _translate(world, world.alice, _fresh_generate())

    row = (await _rows(world))[0]
    assert row.original_description == _PASTE
    assert body["is_mine"] is True
    assert body["original_description"] == _PASTE


async def test_a_live_cache_hit_still_skips_the_ai(world: _World) -> None:
    await _seed_posting(world, cached_until=datetime.now(tz=UTC) + timedelta(days=3))
    generate = _fresh_generate()

    status, body = await _translate(world, world.bob, generate)

    assert status == 201
    generate.assert_not_awaited()
    assert body["translated_title"] == "stale title"


async def test_a_posting_that_never_got_an_expiry_counts_as_expired(world: _World) -> None:
    # get_by_url needs cached_until > now(), so NULL was a miss that then hit
    # the same unique index.
    await _seed_posting(world, cached_until=None)

    status, _ = await _translate(world, world.bob, _fresh_generate())

    assert status == 201
    assert len(await _rows(world)) == 1


async def test_a_deleted_posting_for_the_url_is_left_alone(world: _World) -> None:
    # The unique index skips soft-deleted rows, so a deleted posting frees
    # its URL: a new one is created beside it, and the deleted one is not
    # brought back.
    await _seed_posting(world, cached_until=_EXPIRED)
    async with AsyncSessionFactory() as session:
        deleted = await session.get(JobPosting, world.posting)
        assert deleted is not None
        deleted.deleted_at = datetime.now(tz=UTC)
        await session.commit()

    status, body = await _translate(world, world.bob, _fresh_generate())

    assert status == 201
    assert body["id"] != str(world.posting)
    rows = {r.id: r for r in await _rows(world)}
    assert len(rows) == 2
    assert rows[world.posting].deleted_at is not None


async def test_a_refresh_records_the_ai_call_it_made(world: _World) -> None:
    # The refresh spends a real AI call in production, so it has to count
    # against the budget like any other translation.
    await _seed_posting(world, cached_until=_EXPIRED)
    record = AsyncMock()

    with (
        bypass_middleware(world.bob),
        patch.object(ai_client, "generate", new=_fresh_generate()),
        patch.object(usage_tracker, "check_budget", new=AsyncMock()),
        patch.object(usage_tracker, "record", new=record),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.post(
                "/api/v1/jobs/translate",
                json={"source_url": world.url, "raw_text": _PASTE},
                headers=auth_headers(),
            )

    record.assert_awaited_once()
    assert record.await_args.kwargs["feature"] == "job_translation"


async def test_a_deleted_submitters_paste_is_cleared_on_refresh(world: _World) -> None:
    # submitted_by goes NULL when the account is deleted. Nobody can be shown
    # that paste any more, so a refresh drops it rather than keeping personal
    # data no one owns.
    await _seed_posting(world, cached_until=_EXPIRED)
    async with AsyncSessionFactory() as session:
        await session.execute(delete(User).where(User.id == world.alice.id))
        await session.commit()

    status, _ = await _translate(world, world.bob, _fresh_generate())

    assert status == 201
    row = (await _rows(world))[0]
    assert row.submitted_by is None
    assert row.original_description is None


async def test_a_posting_deleted_during_the_refresh_is_not_revived(world: _World) -> None:
    # The AI call is the window: the route has read the expired row and is
    # waiting on the model when the submitter deletes it. Refreshing it
    # anyway would hand back an id that 404s. The deletion freed the URL, so
    # a new posting is created instead.
    await _seed_posting(world, cached_until=_EXPIRED)

    async def delete_during_the_call(*_: object, **__: object) -> tuple[str, int, int]:
        async with AsyncSessionFactory() as session:
            await session.execute(
                update(JobPosting)
                .where(JobPosting.id == world.posting)
                .values(deleted_at=datetime.now(tz=UTC))
            )
            await session.commit()
        return _translation("fresh title"), 100, 200

    status, body = await _translate(world, world.bob, AsyncMock(side_effect=delete_during_the_call))

    assert status == 201
    assert body["id"] != str(world.posting)
    rows = {r.id: r for r in await _rows(world)}
    assert rows[world.posting].deleted_at is not None, "the deleted posting was revived"
    new = rows[uuid.UUID(body["id"])]
    assert new.deleted_at is None
    assert new.translated_title == "fresh title"


async def test_two_first_submitters_of_a_url_do_not_crash(world: _World) -> None:
    # Two requests translate a URL nobody has submitted: both look it up, both
    # find nothing, both insert, and the second hits the unique index. Here
    # the first lookup is made to miss a row that exists -- the state the
    # losing request is in -- so its insert collides. It should get the
    # winning row, as a cache hit would, not a 500.
    await _seed_posting(world, cached_until=_EXPIRED)
    real_lookup = JobPostingRepository.get_holder_of_url
    calls: list[str] = []

    async def lookup_that_misses_once(self: JobPostingRepository, url: str) -> JobPosting | None:
        calls.append(url)
        if len(calls) == 1:
            return None
        return await real_lookup(self, url)

    with patch.object(JobPostingRepository, "get_holder_of_url", new=lookup_that_misses_once):
        status, body = await _translate(world, world.bob, _fresh_generate())

    assert status == 201
    assert body["id"] == str(world.posting)
    assert len(await _rows(world)) == 1
