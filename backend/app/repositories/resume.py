from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import AnalysisErrorCode, AnalysisStatus, AnalysisType
from app.models.resume import Resume, ResumeAnalysis
from app.repositories.base import BaseRepository


class ResumeRepository(BaseRepository[Resume]):
    model = Resume

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_primary(self, user_id: UUID) -> Resume | None:
        return await self._scalar(
            select(Resume).where(
                Resume.user_id == user_id,
                Resume.is_primary.is_(True),
            )
        )

    async def get_with_analyses(self, resume_id: UUID, user_id: UUID) -> Resume | None:
        return await self._scalar(
            select(Resume)
            .where(Resume.id == resume_id, Resume.user_id == user_id)
            .options(selectinload(Resume.analyses))
        )

    async def set_primary(self, resume_id: UUID, user_id: UUID) -> Resume | None:
        """
        Atomically clears any existing primary flag for this user and sets
        the new one. Both operations happen in the same flush.
        """
        # Clear existing primary
        await self.session.execute(
            update(Resume)
            .where(Resume.user_id == user_id, Resume.is_primary.is_(True))
            .values(is_primary=False)
        )
        # Set new primary
        await self.session.execute(
            update(Resume)
            .where(Resume.id == resume_id, Resume.user_id == user_id)
            .values(is_primary=True)
        )
        await self.session.flush()
        return await self.get_owned(resume_id, user_id)

    async def mark_parsed(self, resume_id: UUID, parsed_content: dict[str, Any]) -> Resume | None:
        resume = await self.get(resume_id)
        if resume is None:
            return None
        return await self.update(resume, parsed_content=parsed_content)

    async def mark_analysis_pending(self, resume: Resume) -> datetime:
        """
        Record a new analysis request, replacing any earlier one, and return its
        time as stored. The time identifies the request for finish_analysis.
        Does not commit.
        """
        requested_at = datetime.now(tz=UTC)
        updated = await self.update(
            resume,
            analysis_status=AnalysisStatus.pending.value,
            analysis_error_code=None,
            analysis_requested_at=requested_at,
        )
        return updated.analysis_requested_at or requested_at

    async def finish_analysis(
        self,
        resume_id: UUID,
        requested_at: datetime,
        *,
        error_code: AnalysisErrorCode | None,
    ) -> bool:
        """
        Record the outcome of the request made at requested_at: clear the status
        on success (error_code None), or mark it failed with error_code. A single
        conditional UPDATE, so a newer request that replaced it is left alone.
        Returns False if no row matched (superseded, or the resume was deleted).
        Does not commit.
        """
        result = await self.session.execute(
            update(Resume)
            .where(Resume.id == resume_id, Resume.analysis_requested_at == requested_at)
            .values(
                analysis_status=None if error_code is None else AnalysisStatus.failed.value,
                analysis_error_code=None if error_code is None else error_code.value,
            )
        )
        return bool(result.rowcount)  # type: ignore[attr-defined]

    async def count_by_user(self, user_id: UUID) -> int:
        from sqlalchemy import func, select

        result = await self.session.scalar(
            select(func.count()).select_from(Resume).where(Resume.user_id == user_id)
        )
        return result or 0


class ResumeAnalysisRepository(BaseRepository[ResumeAnalysis]):
    model = ResumeAnalysis

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_latest_for_resume(
        self,
        resume_id: UUID,
        analysis_type: AnalysisType = AnalysisType.general,
    ) -> ResumeAnalysis | None:
        return await self._scalar(
            select(ResumeAnalysis)
            .where(
                ResumeAnalysis.resume_id == resume_id,
                ResumeAnalysis.analysis_type == analysis_type,
            )
            .order_by(ResumeAnalysis.created_at.desc())
            .limit(1)
        )

    async def list_for_resume(
        self, resume_id: UUID, *, offset: int = 0, limit: int = 20
    ) -> list[ResumeAnalysis]:
        return await self._scalars(
            select(ResumeAnalysis)
            .where(ResumeAnalysis.resume_id == resume_id)
            .order_by(ResumeAnalysis.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
