from typing import Any
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.resume import Resume, ResumeAnalysis
from app.models.enums import AnalysisType
from app.repositories.base import BaseRepository


class ResumeRepository(BaseRepository[Resume]):
    model = Resume

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_primary(self, user_id: UUID) -> Resume | None:
        return await self.session.scalar(
            select(Resume).where(
                Resume.user_id == user_id,
                Resume.is_primary.is_(True),
            )
        )

    async def get_with_analyses(self, resume_id: UUID, user_id: UUID) -> Resume | None:
        return await self.session.scalar(
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

    async def mark_parsed(
        self, resume_id: UUID, parsed_content: dict[str, Any]
    ) -> Resume | None:
        resume = await self.get(resume_id)
        if resume is None:
            return None
        return await self.update(resume, parsed_content=parsed_content)

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
        return await self.session.scalar(
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
