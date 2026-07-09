from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import GeneratedDocument
from app.models.enums import DocumentStatus, DocumentType
from app.repositories.base import BaseRepository


class DocumentRepository(BaseRepository[GeneratedDocument]):
    model = GeneratedDocument

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    # ------------------------------------------------------------------
    # Status transitions
    # ------------------------------------------------------------------

    async def set_processing(self, document_id: UUID) -> GeneratedDocument | None:
        doc = await self.get(document_id)
        if doc is None or doc.status != DocumentStatus.pending:
            return doc
        return await self.update(doc, status=DocumentStatus.processing)

    async def set_completed(
        self,
        document_id: UUID,
        *,
        content: dict[str, Any],
        file_url: str,
        ai_model: str,
        input_tokens: int,
        output_tokens: int,
    ) -> GeneratedDocument | None:
        doc = await self.get(document_id)
        if doc is None:
            return None
        return await self.update(
            doc,
            status=DocumentStatus.completed,
            content=content,
            file_url=file_url,
            ai_model=ai_model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            completed_at=datetime.now(tz=UTC),
        )

    async def set_failed(self, document_id: UUID, error_message: str) -> GeneratedDocument | None:
        doc = await self.get(document_id)
        if doc is None:
            return None
        return await self.update(
            doc,
            status=DocumentStatus.failed,
            error_message=error_message,
            completed_at=datetime.now(tz=UTC),
        )

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    async def list_pending(self, *, limit: int = 50) -> list[GeneratedDocument]:
        """Used by Celery worker health check to detect stuck jobs."""
        return await self._scalars(
            select(GeneratedDocument)
            .where(
                GeneratedDocument.status.in_([DocumentStatus.pending, DocumentStatus.processing])
            )
            .order_by(GeneratedDocument.created_at.asc())
            .limit(limit)
        )

    async def list_by_user_and_type(
        self,
        user_id: UUID,
        document_type: DocumentType,
        *,
        offset: int = 0,
        limit: int = 20,
    ) -> list[GeneratedDocument]:
        return await self._scalars(
            select(GeneratedDocument)
            .where(
                GeneratedDocument.user_id == user_id,
                GeneratedDocument.document_type == document_type,
            )
            .order_by(GeneratedDocument.created_at.desc())
            .offset(offset)
            .limit(limit)
        )

    async def count_completed_this_month(self, user_id: UUID, document_type: DocumentType) -> int:
        from sqlalchemy import func

        result = await self.session.scalar(
            select(func.count())
            .select_from(GeneratedDocument)
            .where(
                GeneratedDocument.user_id == user_id,
                GeneratedDocument.document_type == document_type,
                GeneratedDocument.status == DocumentStatus.completed,
                func.date_trunc("month", GeneratedDocument.created_at)
                == func.date_trunc("month", func.now()),
            )
        )
        return result or 0
