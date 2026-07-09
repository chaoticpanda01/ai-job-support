from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import InterviewStatus, MessageRole
from app.models.interview import InterviewMessage, InterviewSession
from app.repositories.base import BaseRepository


class InterviewSessionRepository(BaseRepository[InterviewSession]):
    model = InterviewSession

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_active(self, session_id: UUID, user_id: UUID) -> InterviewSession | None:
        return await self._scalar(
            select(InterviewSession).where(
                InterviewSession.id == session_id,
                InterviewSession.user_id == user_id,
                InterviewSession.status == InterviewStatus.active,
            )
        )

    async def get_with_messages(self, session_id: UUID, user_id: UUID) -> InterviewSession | None:
        return await self._scalar(
            select(InterviewSession)
            .where(
                InterviewSession.id == session_id,
                InterviewSession.user_id == user_id,
            )
            .options(selectinload(InterviewSession.messages))
        )

    async def complete(
        self,
        session_id: UUID,
        overall_score: float,
        feedback_summary: str,
    ) -> InterviewSession | None:
        sess = await self.get(session_id)
        if sess is None:
            return None
        return await self.update(
            sess,
            status=InterviewStatus.completed,
            overall_score=overall_score,
            feedback_summary=feedback_summary,
            completed_at=datetime.now(tz=UTC),
        )

    async def abandon(self, session_id: UUID, user_id: UUID) -> InterviewSession | None:
        sess = await self.get_active(session_id, user_id)
        if sess is None:
            return None
        return await self.update(
            sess,
            status=InterviewStatus.abandoned,
            completed_at=datetime.now(tz=UTC),
        )

    async def list_completed(
        self, user_id: UUID, *, offset: int = 0, limit: int = 20
    ) -> list[InterviewSession]:
        return await self._scalars(
            select(InterviewSession)
            .where(
                InterviewSession.user_id == user_id,
                InterviewSession.status == InterviewStatus.completed,
            )
            .order_by(InterviewSession.completed_at.desc())
            .offset(offset)
            .limit(limit)
        )


class InterviewMessageRepository(BaseRepository[InterviewMessage]):
    model = InterviewMessage

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def list_for_session(self, session_id: UUID) -> list[InterviewMessage]:
        """Returns all messages in chronological order for AI context building."""
        return await self._scalars(
            select(InterviewMessage)
            .where(InterviewMessage.session_id == session_id)
            .order_by(InterviewMessage.created_at.asc())
        )

    async def get_last_n(self, session_id: UUID, n: int) -> list[InterviewMessage]:
        """Returns the most recent N messages. Used to cap context window size."""
        rows = await self._scalars(
            select(InterviewMessage)
            .where(InterviewMessage.session_id == session_id)
            .order_by(InterviewMessage.created_at.desc())
            .limit(n)
        )
        return list(reversed(rows))

    async def add_user_turn(
        self,
        session_id: UUID,
        content: str,
        language: str | None,
        ai_evaluation: dict[str, Any] | None,
    ) -> InterviewMessage:
        return await self.create(
            session_id=session_id,
            role=MessageRole.user,
            content=content,
            language=language,
            ai_evaluation=ai_evaluation,
        )

    async def add_interviewer_turn(self, session_id: UUID, content: str) -> InterviewMessage:
        return await self.create(
            session_id=session_id,
            role=MessageRole.interviewer,
            content=content,
        )
