from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.visa import VisaConsultation
from app.repositories.base import BaseRepository


class VisaConsultationRepository(BaseRepository[VisaConsultation]):
    model = VisaConsultation

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_latest_for_user(self, user_id: UUID) -> VisaConsultation | None:
        return await self._scalar(
            select(VisaConsultation)
            .where(VisaConsultation.user_id == user_id)
            .order_by(VisaConsultation.created_at.desc())
            .limit(1)
        )

    async def update_checklist(
        self, consultation_id: UUID, user_id: UUID, checklist: dict[str, Any]
    ) -> VisaConsultation | None:
        consult = await self.get_owned(consultation_id, user_id)
        if consult is None:
            return None
        return await self.update(consult, checklist=checklist)
