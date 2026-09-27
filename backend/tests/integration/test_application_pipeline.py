"""
The migrated application_status enum and job_applications.closed_from, against
real Postgres. The route tests mock the session, so they can't show that the
database accepts the new values; this does.

Seeded rows are deleted explicitly: job_postings.submitted_by is ON DELETE SET
NULL, so deleting the user alone would leave the posting behind.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from app.database import AsyncSessionFactory
from app.models.enums import ApplicationStatus, JobSourcePlatform, OriginalLanguage
from app.models.job import JobApplication, JobPosting
from app.models.user import User
from sqlalchemy import delete, select, text

pytestmark = pytest.mark.asyncio


class _World:
    user_id: uuid.UUID
    posting_id: uuid.UUID
    application_id: uuid.UUID


@pytest.fixture
async def world() -> AsyncIterator[_World]:
    w = _World()
    token = uuid.uuid4().hex[:12]
    try:
        async with AsyncSessionFactory() as session:
            user = User(clerk_id=f"clerk_pipeline_{token}", email=f"p-{token}@example.com")
            session.add(user)
            await session.flush()
            posting = JobPosting(
                source_url=None,
                source_platform=JobSourcePlatform.manual,
                original_language=OriginalLanguage.ja,
                original_description="a private paste",
                submitted_by=user.id,
            )
            session.add(posting)
            await session.flush()
            application = JobApplication(user_id=user.id, job_posting_id=posting.id)
            session.add(application)
            await session.commit()
            w.user_id, w.posting_id, w.application_id = user.id, posting.id, application.id
        yield w
    finally:
        async with AsyncSessionFactory() as session:
            await session.execute(delete(JobPosting).where(JobPosting.id == w.posting_id))
            await session.execute(delete(User).where(User.id == w.user_id))
            await session.commit()


async def test_the_enum_lists_the_stages_in_order() -> None:
    async with AsyncSessionFactory() as session:
        values = (
            await session.execute(text("SELECT enum_range(NULL::application_status)::text[]"))
        ).scalar_one()
    assert values == [s.value for s in ApplicationStatus]


@pytest.mark.parametrize(
    ("status", "closed_from"),
    [
        (ApplicationStatus.preparing, None),
        (ApplicationStatus.accepted, None),
        (ApplicationStatus.skipped, ApplicationStatus.planning),
        (ApplicationStatus.rejected, ApplicationStatus.interviewing),
    ],
)
async def test_a_row_holds_the_new_statuses_and_closed_from(
    world: _World, status: ApplicationStatus, closed_from: ApplicationStatus | None
) -> None:
    async with AsyncSessionFactory() as session:
        row = await session.get(JobApplication, world.application_id)
        assert row is not None
        row.status = status
        row.closed_from = closed_from
        await session.commit()

    async with AsyncSessionFactory() as session:
        stored = await session.scalar(
            select(JobApplication).where(JobApplication.id == world.application_id)
        )
    assert stored is not None
    assert stored.status == status
    assert stored.closed_from == closed_from
