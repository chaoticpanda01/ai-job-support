"""
Document endpoints.

POST   /documents/rirekisho          — create & enqueue 履歴書 generation
POST   /documents/shokumu            — create & enqueue 職務経歴書 generation
GET    /documents                    — list user's generated documents
                                        (?type=rirekisho|shokumukeirekisho)
GET    /documents/{id}               — poll status (lightweight)
GET    /documents/{id}/download      — get detail with presigned download URL
DELETE /documents/{id}               — delete a generated document + its file
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import AuthUser, DbSession, PaginationDep
from app.models.document import GeneratedDocument
from app.models.enums import DocumentOrientation, DocumentStatus, DocumentType
from app.repositories.document import DocumentRepository
from app.schemas.document import (
    CreateRirekishoRequest,
    CreateShokumuRequest,
    DocumentDetailResponse,
    DocumentListResponse,
    DocumentStatusResponse,
)
from app.services.file_storage import StorageError, file_storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_doc(doc: GeneratedDocument | None) -> GeneratedDocument:
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return doc


async def _owned_doc(doc_id: UUID, user_id: UUID, db: AsyncSession) -> GeneratedDocument:
    repo = DocumentRepository(db)
    doc = await repo.get_owned(doc_id, user_id)
    return _require_doc(doc)


# ---------------------------------------------------------------------------
# Create — 履歴書
# ---------------------------------------------------------------------------


@router.post(
    "/rirekisho",
    response_model=DocumentStatusResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_rirekisho(
    body: CreateRirekishoRequest,
    current_user: AuthUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
) -> DocumentStatusResponse:
    """Enqueue 履歴書 (rirekisho) generation. Poll GET /documents/{id} for status."""
    from app.workers.document_tasks import _run_generation

    job_context: dict[str, str] | None = None
    if body.job_posting_id is not None:
        job_context = {"job_posting_id": str(body.job_posting_id)}

    doc = GeneratedDocument(
        id=uuid4(),
        user_id=current_user.user_id,
        resume_id=body.resume_id,
        document_type=DocumentType.rirekisho,
        status=DocumentStatus.pending,
        orientation=body.orientation,
        job_context=job_context,
    )
    db.add(doc)
    await db.flush()
    await db.commit()

    background_tasks.add_task(_run_generation, doc.id, current_user.user_id)

    logger.info("Enqueued rirekisho: document_id=%s user_id=%s", doc.id, current_user.user_id)
    return DocumentStatusResponse(
        id=doc.id,
        status=doc.status,
        orientation=doc.orientation,
        error_message=doc.error_message,
        completed_at=doc.completed_at,
    )


# ---------------------------------------------------------------------------
# Create — 職務経歴書
# ---------------------------------------------------------------------------


@router.post(
    "/shokumu",
    response_model=DocumentStatusResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_shokumu(
    body: CreateShokumuRequest,
    current_user: AuthUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
) -> DocumentStatusResponse:
    """Enqueue 職務経歴書 (shokumukeirekisho) generation. Poll GET /documents/{id} for status."""
    from app.workers.document_tasks import _run_generation

    job_context: dict[str, str] | None = None
    if body.job_posting_id is not None:
        job_context = {"job_posting_id": str(body.job_posting_id)}

    doc = GeneratedDocument(
        id=uuid4(),
        user_id=current_user.user_id,
        resume_id=body.resume_id,
        document_type=DocumentType.shokumukeirekisho,
        status=DocumentStatus.pending,
        orientation=DocumentOrientation.portrait,
        job_context=job_context,
    )
    db.add(doc)
    await db.flush()
    await db.commit()

    background_tasks.add_task(_run_generation, doc.id, current_user.user_id)

    logger.info("Enqueued shokumu: document_id=%s user_id=%s", doc.id, current_user.user_id)
    return DocumentStatusResponse(
        id=doc.id,
        status=doc.status,
        orientation=doc.orientation,
        error_message=doc.error_message,
        completed_at=doc.completed_at,
    )


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    current_user: AuthUser,
    db: DbSession,
    pagination: PaginationDep,
    doc_type: DocumentType | None = Query(None, alias="type"),
) -> DocumentListResponse:
    """List generated documents for the current user, optionally filtered by type."""
    repo = DocumentRepository(db)

    if doc_type is not None:
        items = await repo.list_by_user_and_type(
            current_user.user_id,
            doc_type,
            offset=pagination.offset,
            limit=pagination.limit,
        )
    else:
        items = await repo.list_by_user(
            current_user.user_id,
            offset=pagination.offset,
            limit=pagination.limit,
        )

    return DocumentListResponse(items=items, total=len(items))


# ---------------------------------------------------------------------------
# Status poll
# ---------------------------------------------------------------------------


@router.get("/{document_id}", response_model=DocumentStatusResponse)
async def get_document_status(
    document_id: UUID,
    current_user: AuthUser,
    db: DbSession,
) -> DocumentStatusResponse:
    """Lightweight status poll — used by the frontend polling loop."""
    doc = await _owned_doc(document_id, current_user.user_id, db)
    return DocumentStatusResponse(
        id=doc.id,
        status=doc.status,
        orientation=doc.orientation,
        error_message=doc.error_message,
        completed_at=doc.completed_at,
    )


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------


@router.get("/{document_id}/download", response_model=DocumentDetailResponse)
async def download_document(
    document_id: UUID,
    current_user: AuthUser,
    db: DbSession,
) -> DocumentDetailResponse:
    """Return document detail with a 15-minute presigned S3 download URL."""
    doc = await _owned_doc(document_id, current_user.user_id, db)

    download_url: str | None = None
    if doc.status == DocumentStatus.completed and doc.file_url:
        try:
            download_url = file_storage.presigned_url(doc.file_url)
        except StorageError as exc:
            logger.error("Failed to generate presigned URL for document %s: %s", document_id, exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not generate download URL",
            ) from exc

    return DocumentDetailResponse(
        id=doc.id,
        user_id=doc.user_id,
        resume_id=doc.resume_id,
        document_type=doc.document_type,
        status=doc.status,
        orientation=doc.orientation,
        job_context=doc.job_context,
        ai_model=doc.ai_model,
        input_tokens=doc.input_tokens,
        output_tokens=doc.output_tokens,
        error_message=doc.error_message,
        completed_at=doc.completed_at,
        created_at=doc.created_at,
        content=doc.content,
        download_url=download_url,
    )


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@router.delete("/{document_id}", status_code=status.HTTP_200_OK)
async def delete_document(
    document_id: UUID,
    current_user: AuthUser,
    db: DbSession,
) -> dict[str, Any]:
    doc = await _owned_doc(document_id, current_user.user_id, db)

    if doc.status in (DocumentStatus.pending, DocumentStatus.processing):
        # The background generation task (_run_generation) may still be
        # running and hasn't looked up this row for the last time yet.
        # Deleting now would let it finish generating, upload a file to
        # storage, and then silently no-op on the now-missing row —
        # orphaning that file with nothing left to clean it up. Terminal
        # statuses (completed/failed) are the only safe states to delete.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a document while it's still being generated.",
        )

    repo = DocumentRepository(db)
    file_url = doc.file_url
    await repo.delete(doc)

    # Best-effort storage deletion — DB row is already removed. Unlike
    # resumes (which always have a file), a document may have no file yet
    # (pending/processing/failed generation never produced one).
    if file_url:
        try:
            file_storage.delete(file_url)
        except StorageError as exc:
            logger.warning(
                "Storage delete failed for document file_url=%s: %s — DB row already removed",
                file_url,
                exc,
            )

    return {"detail": "Document deleted"}
