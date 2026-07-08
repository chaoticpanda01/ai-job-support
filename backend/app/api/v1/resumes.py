"""
Resume endpoints.

POST   /resumes                    — upload a PDF or DOCX resume
GET    /resumes                    — list user's resumes
GET    /resumes/{id}               — get resume with presigned download URL
DELETE /resumes/{id}               — delete resume + S3 object
PUT    /resumes/{id}/primary        — set as primary resume
POST   /resumes/{id}/analyze        — enqueue AI analysis task
GET    /resumes/{id}/analysis       — get latest analysis result
"""

from __future__ import annotations

import logging
from uuid import UUID

import magic
from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, status

from app.dependencies import AuthUser, DbSession
from app.repositories.resume import ResumeAnalysisRepository, ResumeRepository
from app.schemas.resume import (
    AnalyzeRequest,
    AnalyzeResponse,
    ResumeAnalysisResponse,
    ResumeDetailResponse,
    ResumeListResponse,
    ResumeResponse,
)
from app.services.file_storage import StorageError, file_storage, sanitize_filename

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/resumes", tags=["resumes"])

_ALLOWED_MIME = frozenset(
    [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]
)
_MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB (matches DB constraint)


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

@router.post("", response_model=ResumeResponse, status_code=status.HTTP_201_CREATED)
async def upload_resume(
    file: UploadFile,
    current_user: AuthUser,
    db: DbSession,
) -> ResumeResponse:
    """
    Upload a PDF or DOCX resume. Stores it in S3 (private bucket) and
    creates the DB row. Text extraction and AI analysis are triggered separately.
    """
    file_bytes = await file.read()

    if len(file_bytes) > _MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {_MAX_FILE_SIZE // 1024 // 1024} MB",
        )

    # Detect MIME from bytes (not from filename extension) for security
    detected_mime = magic.from_buffer(file_bytes[:2048], mime=True)
    if detected_mime not in _ALLOWED_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF and DOCX files are accepted",
        )

    safe_filename = sanitize_filename(file.filename or "resume")

    try:
        s3_key = file_storage.upload_resume(
            file_bytes=file_bytes,
            user_id=current_user.user_id,
            original_filename=safe_filename,
            mime_type=detected_mime,
        )
    except StorageError as exc:
        logger.error("S3 upload failed for user=%s: %s", current_user.user_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="File upload failed. Please try again.",
        ) from exc

    repo = ResumeRepository(db)
    resume = await repo.create(
        user_id=current_user.user_id,
        file_name=safe_filename,
        file_url=s3_key,
        file_size_bytes=len(file_bytes),
        mime_type=detected_mime,
    )

    # First upload for this user → auto-set as primary
    count = await repo.count_by_user(current_user.user_id)
    if count == 1:
        await repo.set_primary(resume.id, current_user.user_id)
        await db.refresh(resume)

    return ResumeResponse.model_validate(resume)


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------

@router.get("", response_model=ResumeListResponse)
async def list_resumes(
    current_user: AuthUser,
    db: DbSession,
) -> ResumeListResponse:
    repo = ResumeRepository(db)
    resumes = await repo.list_by_user(current_user.user_id)
    total = await repo.count_by_user(current_user.user_id)
    return ResumeListResponse(
        items=[ResumeResponse.model_validate(r) for r in resumes],
        total=total,
    )


# ---------------------------------------------------------------------------
# Get (with presigned URL)
# ---------------------------------------------------------------------------

@router.get("/{resume_id}", response_model=ResumeDetailResponse)
async def get_resume(
    resume_id: UUID,
    current_user: AuthUser,
    db: DbSession,
) -> ResumeDetailResponse:
    repo = ResumeRepository(db)
    resume = await repo.get_owned(resume_id, current_user.user_id)
    if resume is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    try:
        download_url = file_storage.presigned_url(resume.file_url)
    except StorageError:
        download_url = ""

    return ResumeDetailResponse(
        **ResumeResponse.model_validate(resume).model_dump(),
        download_url=download_url,
    )


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

@router.delete("/{resume_id}", status_code=status.HTTP_200_OK)
async def delete_resume(
    resume_id: UUID,
    current_user: AuthUser,
    db: DbSession,
) -> dict:
    repo = ResumeRepository(db)
    resume = await repo.get_owned(resume_id, current_user.user_id)
    if resume is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    s3_key = resume.file_url
    await repo.delete(resume)

    # Best-effort S3 deletion — DB row is already removed
    try:
        file_storage.delete(s3_key)
    except StorageError as exc:
        logger.warning("S3 delete failed for key=%s: %s — DB row already removed", s3_key, exc)

    return {"detail": "Resume deleted"}


# ---------------------------------------------------------------------------
# Set primary
# ---------------------------------------------------------------------------

@router.put("/{resume_id}/primary", response_model=ResumeResponse)
async def set_primary(
    resume_id: UUID,
    current_user: AuthUser,
    db: DbSession,
) -> ResumeResponse:
    repo = ResumeRepository(db)
    resume = await repo.set_primary(resume_id, current_user.user_id)
    if resume is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")
    return ResumeResponse.model_validate(resume)


# ---------------------------------------------------------------------------
# Trigger analysis
# ---------------------------------------------------------------------------

@router.post("/{resume_id}/analyze", response_model=AnalyzeResponse, status_code=status.HTTP_202_ACCEPTED)
async def analyze_resume(
    resume_id: UUID,
    body: AnalyzeRequest,
    current_user: AuthUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
) -> AnalyzeResponse:
    """
    Trigger resume analysis as a FastAPI background task (no Celery required).
    Returns immediately; the client polls GET /resumes/{id}/analysis for results.
    """
    repo = ResumeRepository(db)
    resume = await repo.get_owned(resume_id, current_user.user_id)
    if resume is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    from app.workers.analysis_tasks import _run_analysis  # call inner async fn directly

    background_tasks.add_task(
        _run_analysis,
        resume_id,
        current_user.user_id,
        body.analysis_type.value,
        body.job_posting_id,
    )

    return AnalyzeResponse(task_id=str(resume_id), resume_id=resume_id)


# ---------------------------------------------------------------------------
# Get latest analysis
# ---------------------------------------------------------------------------

@router.get("/{resume_id}/analysis", response_model=ResumeAnalysisResponse)
async def get_analysis(
    resume_id: UUID,
    current_user: AuthUser,
    db: DbSession,
) -> ResumeAnalysisResponse:
    # Verify ownership of the resume first
    resume_repo = ResumeRepository(db)
    resume = await resume_repo.get_owned(resume_id, current_user.user_id)
    if resume is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    analysis_repo = ResumeAnalysisRepository(db)
    analysis = await analysis_repo.get_latest_for_resume(resume_id)
    if analysis is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No analysis found. Trigger one with POST /resumes/{id}/analyze",
        )

    return ResumeAnalysisResponse.model_validate(analysis)
