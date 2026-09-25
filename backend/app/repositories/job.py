from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Select, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ApplicationStatus
from app.models.job import JobApplication, JobMatch, JobPosting, SavedJob
from app.repositories.base import BaseRepository

# ---------------------------------------------------------------------------
# Active job postings filter (applied everywhere)
# ---------------------------------------------------------------------------


def _active(stmt: Select[tuple[JobPosting]]) -> Select[tuple[JobPosting]]:
    """Append WHERE deleted_at IS NULL to any job_postings statement."""
    return stmt.where(JobPosting.deleted_at.is_(None))


def _visible_to(stmt: Select[tuple[JobPosting]], viewer_id: UUID) -> Select[tuple[JobPosting]]:
    """Limit postings to those `viewer_id` may see -- see JobPosting.visible_to."""
    return stmt.where(JobPosting.visible_to_clause(viewer_id))


class JobPostingRepository(BaseRepository[JobPosting]):
    model = JobPosting

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_active(self, job_id: UUID, *, viewer_id: UUID) -> JobPosting | None:
        return await self._scalar(
            _visible_to(_active(select(JobPosting).where(JobPosting.id == job_id)), viewer_id)
        )

    async def get_holder_of_url(self, source_url: str) -> JobPosting | None:
        """
        The posting holding this URL's slot, whether or not its cache is live.

        job_postings is unique on source_url across every row that isn't
        soft-deleted (idx_job_postings_source_url) -- expired rows included.
        So a URL whose translation has expired still has a row, and a new one
        can't be inserted beside it; the translate route refreshes this one.
        """
        return await self._scalar(
            _active(select(JobPosting).where(JobPosting.source_url == source_url))
        )

    async def get_by_url(self, source_url: str) -> JobPosting | None:
        """Returns the active (non-deleted, non-expired) posting for a URL."""
        return await self._scalar(
            _active(
                select(JobPosting).where(
                    JobPosting.source_url == source_url,
                    JobPosting.cached_until > func.now(),
                )
            )
        )

    async def list_active(
        self,
        *,
        viewer_id: UUID,
        offset: int = 0,
        limit: int = 20,
        min_friendliness: float | None = None,
    ) -> list[JobPosting]:
        stmt = _visible_to(_active(select(JobPosting)), viewer_id)
        if min_friendliness is not None:
            stmt = stmt.where(JobPosting.foreigner_friendliness_score >= min_friendliness)
        stmt = stmt.order_by(JobPosting.created_at.desc()).offset(offset).limit(limit)
        return await self._scalars(stmt)

    async def search(
        self,
        query: str,
        *,
        viewer_id: UUID,
        offset: int = 0,
        limit: int = 20,
    ) -> list[JobPosting]:
        """Full-text search on translated_title and translation_summary."""
        ts_query = func.plainto_tsquery("simple", query)
        ts_vector = func.to_tsvector(
            "simple",
            func.coalesce(JobPosting.translated_title, "")
            + " "
            + func.coalesce(JobPosting.translation_summary, ""),
        )
        stmt = _visible_to(
            _active(select(JobPosting).where(ts_vector.op("@@")(ts_query))), viewer_id
        )
        return await self._scalars(
            stmt.order_by(
                func.ts_rank(ts_vector, ts_query).desc(),
                JobPosting.created_at.desc(),
            )
            .offset(offset)
            .limit(limit)
        )

    async def soft_delete(self, job_id: UUID, user_id: UUID) -> bool:
        """Only the submitter can soft-delete their submitted posting."""
        result = await self.session.execute(
            update(JobPosting)
            .where(
                JobPosting.id == job_id,
                JobPosting.submitted_by == user_id,
                JobPosting.deleted_at.is_(None),
            )
            .values(deleted_at=func.now())
            .returning(JobPosting.id)
        )
        await self.session.flush()
        return result.scalar() is not None


class JobMatchRepository(BaseRepository[JobMatch]):
    model = JobMatch

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_for_resume_and_job(
        self, user_id: UUID, resume_id: UUID, job_posting_id: UUID
    ) -> JobMatch | None:
        return await self._scalar(
            select(JobMatch).where(
                JobMatch.user_id == user_id,
                JobMatch.resume_id == resume_id,
                JobMatch.job_posting_id == job_posting_id,
            )
        )

    async def list_top_matches(self, user_id: UUID, *, limit: int = 10) -> list[JobMatch]:
        return await self._scalars(
            select(JobMatch)
            .where(JobMatch.user_id == user_id)
            .order_by(JobMatch.match_score.desc())
            .limit(limit)
        )

    async def upsert(
        self,
        user_id: UUID,
        resume_id: UUID,
        job_posting_id: UUID,
        match_score: float,
        match_breakdown: dict[str, Any],
        recommendations: dict[str, Any] | None,
    ) -> JobMatch:
        existing = await self.get_for_resume_and_job(user_id, resume_id, job_posting_id)
        if existing is not None:
            return await self.update(
                existing,
                match_score=match_score,
                match_breakdown=match_breakdown,
                recommendations=recommendations,
            )
        return await self.create(
            user_id=user_id,
            resume_id=resume_id,
            job_posting_id=job_posting_id,
            match_score=match_score,
            match_breakdown=match_breakdown,
            recommendations=recommendations,
        )


class SavedJobRepository(BaseRepository[SavedJob]):
    model = SavedJob

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_for_user_and_job(self, user_id: UUID, job_posting_id: UUID) -> SavedJob | None:
        return await self._scalar(
            select(SavedJob).where(
                SavedJob.user_id == user_id,
                SavedJob.job_posting_id == job_posting_id,
            )
        )

    async def toggle(self, user_id: UUID, job_posting_id: UUID) -> bool:
        """Saves if not saved; unsaves if already saved. Returns True if now saved."""
        existing = await self.get_for_user_and_job(user_id, job_posting_id)
        if existing is not None:
            await self.delete(existing)
            return False
        await self.create(user_id=user_id, job_posting_id=job_posting_id)
        return True


class JobApplicationRepository(BaseRepository[JobApplication]):
    model = JobApplication

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_for_user_and_job(
        self, user_id: UUID, job_posting_id: UUID
    ) -> JobApplication | None:
        return await self._scalar(
            select(JobApplication).where(
                JobApplication.user_id == user_id,
                JobApplication.job_posting_id == job_posting_id,
            )
        )

    async def update_status(
        self, user_id: UUID, job_posting_id: UUID, status: ApplicationStatus
    ) -> JobApplication | None:
        app = await self.get_for_user_and_job(user_id, job_posting_id)
        if app is None:
            app = await self.create(
                user_id=user_id,
                job_posting_id=job_posting_id,
                status=status,
            )
        else:
            kwargs: dict[str, Any] = {"status": status}
            if status == ApplicationStatus.applied and app.applied_at is None:
                kwargs["applied_at"] = datetime.now(tz=UTC)
            app = await self.update(app, **kwargs)
        return app

    async def list_by_status(
        self, user_id: UUID, status: ApplicationStatus
    ) -> list[JobApplication]:
        return await self._scalars(
            select(JobApplication)
            .where(
                JobApplication.user_id == user_id,
                JobApplication.status == status,
            )
            .order_by(JobApplication.updated_at.desc())
        )
