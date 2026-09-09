from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.visa import VisaConsultation, VisaRoadmap
from app.repositories.base import BaseRepository


class VisaConsultationRepository(BaseRepository[VisaConsultation]):
    model = VisaConsultation

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_latest_for_user(self, user_id: UUID) -> VisaConsultation | None:
        # selectinload is required, not an optimisation: VisaConsultationResponse
        # serialises .roadmaps, and lazy-loading a relationship under asyncio
        # raises MissingGreenlet.
        return await self._scalar(
            select(VisaConsultation)
            .where(VisaConsultation.user_id == user_id)
            .options(selectinload(VisaConsultation.roadmaps))
            .order_by(VisaConsultation.created_at.desc())
            .limit(1)
        )

    async def get_owned_with_roadmaps(
        self, consultation_id: UUID, user_id: UUID
    ) -> VisaConsultation | None:
        """get_owned(), plus the eager-loaded roadmaps the response needs."""
        return await self._scalar(
            select(VisaConsultation)
            .where(
                VisaConsultation.id == consultation_id,
                VisaConsultation.user_id == user_id,
            )
            .options(selectinload(VisaConsultation.roadmaps))
        )


class VisaRoadmapRepository(BaseRepository[VisaRoadmap]):
    model = VisaRoadmap

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_for_consultation_and_type(
        self, consultation_id: UUID, visa_type: str
    ) -> VisaRoadmap | None:
        return await self._scalar(
            select(VisaRoadmap).where(
                VisaRoadmap.consultation_id == consultation_id,
                VisaRoadmap.visa_type == visa_type,
            )
        )
