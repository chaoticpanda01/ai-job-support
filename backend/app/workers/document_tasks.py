"""
Document generation background task.

_run_generation is invoked via FastAPI BackgroundTasks (see
app.api.v1.documents), not a Celery task:
  1. Mark document as processing
  2. Run DocumentGenerator.generate() pipeline
  3. On success: mark completed with output data
  4. On DocumentGenerationError: mark failed with error message
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

logger = logging.getLogger(__name__)


async def _run_generation(document_id: UUID, user_id: UUID) -> dict[str, Any]:
    from app.database import AsyncSessionFactory
    from app.repositories.document import DocumentRepository
    from app.services.document_generator import DocumentGenerationError, document_generator

    async with AsyncSessionFactory() as db:
        doc_repo = DocumentRepository(db)

        await doc_repo.set_processing(document_id)
        await db.flush()

        try:
            output = await document_generator.generate(document_id, user_id, db)
        except DocumentGenerationError as exc:
            await doc_repo.set_failed(document_id, error_message=str(exc))
            await db.commit()
            logger.error("Document generation failed: document_id=%s error=%s", document_id, exc)
            raise

        await doc_repo.set_completed(
            document_id,
            content=output.content,
            file_url=output.file_url,
            ai_model=output.ai_model,
            input_tokens=output.input_tokens,
            output_tokens=output.output_tokens,
        )
        await db.commit()

        logger.info(
            "Document generation complete: document_id=%s tokens=%d",
            document_id,
            output.input_tokens + output.output_tokens,
        )
        return {
            "document_id": str(document_id),
            "file_url": output.file_url,
            "input_tokens": output.input_tokens,
            "output_tokens": output.output_tokens,
        }
