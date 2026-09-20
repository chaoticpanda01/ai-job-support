"""
Document generation background task.

_run_generation is invoked via FastAPI BackgroundTasks (see
app.api.v1.documents), not a Celery task:
  1. Mark document as processing
  2. Run DocumentGenerator.generate() pipeline
  3. On success: mark completed with output data
  4. On any failure: mark failed with an error code the client can explain

The client polls GET /documents/{id} until the document reaches a terminal
state, so every outcome has to be recorded on the row. A task that ended
without recording one would leave the document at 'processing' and the client
polling forever, which is why the failure path catches every exception rather
than only the pipeline's own.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from app.models.enums import DocumentErrorCode

logger = logging.getLogger(__name__)


async def _run_generation(document_id: UUID, user_id: UUID) -> dict[str, Any] | None:
    """
    Run one generation, returning its output, or None if it failed. A failure is
    reported by the document's own status, not by raising: nothing awaits this
    task, so an exception escaping here would only be logged twice.
    """
    from app.services.document_generator import DocumentGenerationError

    try:
        return await _generate(document_id, user_id)
    except DocumentGenerationError as exc:
        logger.warning(
            "Document generation failed: document_id=%s code=%s error=%s",
            document_id,
            exc.code.value,
            exc,
        )
        await _record_failure(document_id, exc.code, str(exc))
    except Exception as exc:
        logger.exception("Document generation crashed: document_id=%s", document_id)
        await _record_failure(document_id, DocumentErrorCode.unknown, repr(exc))
    return None


async def _generate(document_id: UUID, user_id: UUID) -> dict[str, Any]:
    from app.database import AsyncSessionFactory
    from app.repositories.document import DocumentRepository
    from app.services.document_generator import document_generator

    async with AsyncSessionFactory() as db:
        doc_repo = DocumentRepository(db)

        # Committed, not just flushed: the status is what the client polls, and
        # a flush alone would be discarded when this session closes on a failure.
        await doc_repo.set_processing(document_id)
        await db.commit()

        output = await document_generator.generate(document_id, user_id, db)

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


async def _record_failure(
    document_id: UUID,
    code: DocumentErrorCode,
    message: str,
) -> None:
    """
    Mark the document failed in a fresh DB session: the one the generation ran
    in may have been left unusable by the failure. Best effort -- if this fails
    too, it is logged, and the status endpoint reports the document as timed out
    once it has been running too long.
    """
    from app.database import AsyncSessionFactory
    from app.repositories.document import DocumentRepository

    try:
        async with AsyncSessionFactory() as db:
            await DocumentRepository(db).set_failed(
                document_id,
                error_code=code,
                # Truncated: some driver and validation errors carry a very long
                # message, and nothing reads more than the first line of it.
                error_message=message[:2000],
            )
            await db.commit()
    except Exception:
        logger.exception(
            "Failed to record document generation failure: document_id=%s", document_id
        )
