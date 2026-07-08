"""
Celery tasks for document generation.

generate_rirekisho_task / generate_shokumu_task:
  1. Mark document as processing
  2. Run DocumentGenerator.generate() pipeline
  3. On success: mark completed with output data
  4. On DocumentGenerationError: mark failed with error message
"""

from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from celery import Task

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


class _BaseDocTask(Task):  # type: ignore[type-arg]
    abstract = True

    def on_failure(
        self, exc: Exception, task_id: str, args: list, kwargs: dict, einfo: object
    ) -> None:
        logger.error("Document task %s failed: %s", task_id, exc)


@celery_app.task(
    bind=True,
    base=_BaseDocTask,
    name="app.workers.document_tasks.generate_rirekisho_task",
    max_retries=2,
    default_retry_delay=30,
)
def generate_rirekisho_task(self: Task, document_id: str, user_id: str) -> dict:
    try:
        return asyncio.run(_run_generation(UUID(document_id), UUID(user_id)))
    except Exception as exc:
        logger.exception("generate_rirekisho_task error: document_id=%s", document_id)
        raise self.retry(exc=exc) from exc


@celery_app.task(
    bind=True,
    base=_BaseDocTask,
    name="app.workers.document_tasks.generate_shokumu_task",
    max_retries=2,
    default_retry_delay=30,
)
def generate_shokumu_task(self: Task, document_id: str, user_id: str) -> dict:
    try:
        return asyncio.run(_run_generation(UUID(document_id), UUID(user_id)))
    except Exception as exc:
        logger.exception("generate_shokumu_task error: document_id=%s", document_id)
        raise self.retry(exc=exc) from exc


async def _run_generation(document_id: UUID, user_id: UUID) -> dict:
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
