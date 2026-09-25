"""
Who can see a job posting, checked against real Postgres.

The pool is shared on purpose: a posting translated from a URL is a public
job ad, cached so the next person to submit that URL doesn't spend an AI
call. A posting pasted as text with no URL is whatever the user had to hand
-- often a scout email addressed to them by name -- so it stays private to
its submitter.

The route tests mock the database session, so they build the repository's
real SQL but never run it: canned rows come back whatever the WHERE clause
says, and they passed unchanged when this rule was introduced. These tests
run the queries, which is the only way to know the filter filters.

Uses the local dev database (DATABASE_URL), like the rirekisho end-to-end
test, and removes everything it creates. Postings are deleted explicitly:
job_postings.submitted_by is ON DELETE SET NULL, so deleting the users
alone would leave them behind.
"""

from __future__ import annotations

import uuid

import pytest
from app.database import AsyncSessionFactory
from app.models.enums import JobSourcePlatform, OriginalLanguage
from app.models.job import JobPosting
from app.models.user import User
from app.repositories.job import JobPostingRepository
from sqlalchemy import delete

pytestmark = pytest.mark.asyncio


class _World:
    """Two users and three postings between them."""

    def __init__(self) -> None:
        self.token = f"visibility{uuid.uuid4().hex[:12]}"
        self.alice: uuid.UUID
        self.bob: uuid.UUID
        self.public: uuid.UUID  # alice's, from a URL
        self.alice_private: uuid.UUID  # alice's, pasted text
        self.bob_private: uuid.UUID  # bob's, pasted text


def _posting(token: str, *, submitted_by: uuid.UUID, url: str | None, score: float) -> JobPosting:
    return JobPosting(
        source_url=url,
        source_platform=JobSourcePlatform.manual,
        original_language=OriginalLanguage.ja,
        # The token makes these rows findable by search() and by nothing else
        # already in the dev database.
        translated_title=f"{token} backend engineer",
        translation_summary=f"{token} summary",
        foreigner_friendliness_score=score,
        submitted_by=submitted_by,
    )


@pytest.fixture
async def world():
    w = _World()
    async with AsyncSessionFactory() as session:
        alice = User(clerk_id=f"clerk_vis_a_{w.token}", email=f"a-{w.token}@example.com")
        bob = User(clerk_id=f"clerk_vis_b_{w.token}", email=f"b-{w.token}@example.com")
        session.add_all([alice, bob])
        await session.flush()
        w.alice, w.bob = alice.id, bob.id

        public = _posting(
            w.token, submitted_by=alice.id, url=f"https://example.test/{w.token}", score=80
        )
        alice_private = _posting(w.token, submitted_by=alice.id, url=None, score=80)
        bob_private = _posting(w.token, submitted_by=bob.id, url=None, score=80)
        session.add_all([public, alice_private, bob_private])
        await session.commit()
        w.public, w.alice_private, w.bob_private = public.id, alice_private.id, bob_private.id

    yield w

    async with AsyncSessionFactory() as session:
        await session.execute(
            delete(JobPosting).where(JobPosting.id.in_([w.public, w.alice_private, w.bob_private]))
        )
        await session.execute(delete(User).where(User.id.in_([w.alice, w.bob])))
        await session.commit()


async def _get(job_id: uuid.UUID, viewer: uuid.UUID) -> JobPosting | None:
    async with AsyncSessionFactory() as session:
        return await JobPostingRepository(session).get_active(job_id, viewer_id=viewer)


async def _listed(viewer: uuid.UUID, w: _World, **filters: float) -> set[uuid.UUID]:
    """Ids of this world's postings that list_active shows `viewer`."""
    async with AsyncSessionFactory() as session:
        rows = await JobPostingRepository(session).list_active(
            viewer_id=viewer, limit=100, **filters
        )
    ours = {w.public, w.alice_private, w.bob_private}
    return {r.id for r in rows} & ours


async def _searched(viewer: uuid.UUID, w: _World) -> set[uuid.UUID]:
    async with AsyncSessionFactory() as session:
        rows = await JobPostingRepository(session).search(w.token, viewer_id=viewer, limit=100)
    return {r.id for r in rows}


async def test_a_posting_from_a_url_is_shared(world: _World) -> None:
    assert await _get(world.public, world.bob) is not None


async def test_a_pasted_posting_is_hidden_from_everyone_else(world: _World) -> None:
    assert await _get(world.alice_private, world.bob) is None


async def test_a_pasted_posting_is_still_visible_to_whoever_pasted_it(world: _World) -> None:
    assert await _get(world.alice_private, world.alice) is not None


async def test_the_list_shows_shared_postings_and_your_own_pastes_only(world: _World) -> None:
    assert await _listed(world.bob, world) == {world.public, world.bob_private}
    assert await _listed(world.alice, world) == {world.public, world.alice_private}


async def test_the_score_filter_still_applies_on_top(world: _World) -> None:
    # Visibility narrows the pool; it must not replace the filters the reader
    # asked for. Every posting here scores 80, so a 90 floor leaves nothing.
    assert await _listed(world.bob, world, min_friendliness=90) == set()


async def test_search_cannot_find_someone_elses_paste(world: _World) -> None:
    # Search is the path most likely to be missed: it builds its own
    # statement, and a hidden posting found by keyword is just as exposed.
    assert await _searched(world.bob, world) == {world.public, world.bob_private}


async def test_a_paste_whose_submitter_was_deleted_is_visible_to_nobody(world: _World) -> None:
    # submitted_by becomes NULL when the account goes, and NULL matches no
    # viewer -- so the private text disappears with the person who pasted it
    # rather than falling open to everyone.
    async with AsyncSessionFactory() as session:
        await session.execute(delete(User).where(User.id == world.alice))
        await session.commit()

    assert await _get(world.alice_private, world.bob) is None
    assert await _get(world.public, world.bob) is not None
