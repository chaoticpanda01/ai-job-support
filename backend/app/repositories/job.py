from datetime import UTC, datetime, timedelta
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


class JobPostingRepository(BaseRepository[JobPosting]):
    model = JobPosting

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_active(self, job_id: UUID) -> JobPosting | None:
        return await self._scalar(_active(select(JobPosting).where(JobPosting.id == job_id)))

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
        offset: int = 0,
        limit: int = 20,
        min_friendliness: float | None = None,
    ) -> list[JobPosting]:
        stmt = _active(select(JobPosting))
        if min_friendliness is not None:
            stmt = stmt.where(JobPosting.foreigner_friendliness_score >= min_friendliness)
        stmt = stmt.order_by(JobPosting.created_at.desc()).offset(offset).limit(limit)
        return await self._scalars(stmt)

    async def search(
        self,
        query: str,
        *,
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
        return await self._scalars(
            _active(
                select(JobPosting)
                .where(ts_vector.op("@@")(ts_query))
                .order_by(
                    func.ts_rank(ts_vector, ts_query).desc(),
                    JobPosting.created_at.desc(),
                )
                .offset(offset)
                .limit(limit)
            )
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

    async def set_cache_expiry(self, job_id: UUID, days: int) -> None:
        expiry = datetime.now(tz=UTC) + timedelta(days=days)
        await self.session.execute(
            update(JobPosting).where(JobPosting.id == job_id).values(cached_until=expiry)
        )
        await self.session.flush()


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
