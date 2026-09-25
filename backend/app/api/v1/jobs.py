"""
Job posting endpoints.

POST   /jobs/translate               — translate a Japanese job posting (URL + raw text)
GET    /jobs                         — list active postings (?q=search&min_score=0)
GET    /jobs/{id}                    — get posting detail (full translated description)
DELETE /jobs/{id}                    — soft-delete (submitter only)
POST   /jobs/{id}/match              — score a resume against this posting

Application tracker (Kanban):
POST   /jobs/applications            — create or move an application to planning
GET    /jobs/applications            — list all applications, grouped by status
PATCH  /jobs/applications/{id}       — update status / notes
DELETE /jobs/applications/{id}       — remove application from tracker
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any, TypeVar
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.dependencies import AuthUser, DbSession, PaginationDep
from app.repositories.job import JobApplicationRepository, JobMatchRepository, JobPostingRepository
from app.repositories.resume import ResumeRepository
from app.repositories.user import ProfileRepository
from app.schemas.job import (
    CreateApplicationRequest,
    JobApplicationResponse,
    JobPostingDetailResponse,
    JobPostingListResponse,
    JobPostingResponse,
    MatchRequest,
    MatchScoreResponse,
    TranslateJobRequest,
    UpdateApplicationRequest,
)

if TYPE_CHECKING:
    from app.models.job import JobApplication, JobPosting

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jobs", tags=["jobs"])

_R = TypeVar("_R", bound=JobPostingResponse)


def _posting_response(model: type[_R], job: JobPosting, viewer_id: UUID) -> _R:
    """
    Build a posting response for this viewer. Every response that carries a
    posting goes through here, so no path can forget either of these:

    - is_mine, in place of the submitter's user id.
    - original_description, the raw pasted text, only for its submitter. A
      shared posting is shared for its translation; the paste is whatever
      the user had to hand, and a scout email pasted together with its link
      would otherwise publish their name to everyone.
    """
    mine = job.submitted_by == viewer_id
    update: dict[str, object] = {"is_mine": mine}
    if not mine and issubclass(model, JobPostingDetailResponse):
        update["original_description"] = None
    return model.model_validate(job).model_copy(update=update)


_TRANSLATION_MAX_TOKENS = 8192
_MATCH_MAX_TOKENS = 2048


# ---------------------------------------------------------------------------
# Translate
# ---------------------------------------------------------------------------


@router.post(
    "/translate",
    response_model=JobPostingDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def translate_job(
    body: TranslateJobRequest,
    current_user: AuthUser,
    db: DbSession,
) -> JobPostingDetailResponse:
    """
    Translate a Japanese job posting into Indonesian and extract structured data.

    - If source_url is provided and a non-expired cached translation exists,
      it is returned immediately without calling Gemini.
    - raw_text is required and must be the pasted content of the posting page.
    """
    from app.config import settings
    from app.services.ai.client import AIError, ai_client
    from app.services.ai.prompts.job_translation import (
        JobTranslationResult,
        build_system_prompt,
        build_user_prompt,
    )
    from app.services.ai.response_parser import ResponseParseError, parse_response
    from app.services.ai.usage_tracker import AIBudgetError, usage_tracker

    if not body.raw_text or len(body.raw_text.strip()) < 50:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="raw_text is required and must be at least 50 characters.",
        )

    job_repo = JobPostingRepository(db)

    # -- Cache hit: return existing translation without calling Gemini
    stale: JobPosting | None = None
    if body.source_url:
        cached = await job_repo.get_by_url(body.source_url)
        if cached is not None:
            logger.info("Cache hit for url=%s job_id=%s", body.source_url, cached.id)
            return _posting_response(JobPostingDetailResponse, cached, current_user.user_id)
        # A miss can still find a row: an expired translation keeps the URL's
        # slot in the unique index, so it is refreshed below rather than
        # duplicated -- inserting beside it was a 500.
        stale = await job_repo.get_holder_of_url(body.source_url)

    # -- Budget check
    try:
        await usage_tracker.check_budget(current_user.user_id, "job_translation", db)
    except AIBudgetError as exc:
        raise exc.to_http_exception() from exc

    # -- Call Gemini
    system = build_system_prompt()
    user_prompt = build_user_prompt(body.raw_text, source_url=body.source_url)

    t0 = time.monotonic()
    try:
        response_text, input_tokens, output_tokens = await ai_client.generate(
            system,
            user_prompt,
            max_tokens=_TRANSLATION_MAX_TOKENS,
            feature="job_translation",
            json_mode=True,
        )
    except AIError as exc:
        logger.error("AI translation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Translation failed. Please try again.",
        ) from exc
    latency_ms = int((time.monotonic() - t0) * 1000)

    # -- Parse and validate
    try:
        parsed: JobTranslationResult = parse_response(response_text, JobTranslationResult)
    except ResponseParseError as exc:
        logger.error("Translation response parse failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Translation response was malformed. Please try again.",
        ) from exc

    # -- Persist
    sd = parsed.structured_data
    translation: dict[str, Any] = {
        "original_company": sd.company_name,
        "translated_title": parsed.translated_title,
        "translated_description": parsed.translated_description,
        "translation_summary": parsed.translation_summary,
        "foreigner_friendliness_score": parsed.foreigner_friendliness_score,
        "structured_data": sd.model_dump(),
        # Written with the row rather than by a second UPDATE afterwards, so
        # the posting returned below carries the expiry that was stored.
        "cached_until": datetime.now(tz=UTC) + timedelta(days=settings.job_translation_cache_days),
    }
    job: JobPosting | None = None
    if stale is not None:
        # Same row, same id: tracker entries, matches and documents that point
        # at it stay valid. submitted_by is kept, so is_mine still answers for
        # whoever first submitted the URL. For that reason the raw paste is
        # replaced only when they are the one refreshing -- it is shown to the
        # submitter alone, and must be theirs, not someone else's text shown
        # to them. The translation is shared anyway, so anyone refreshes it.
        refresh = dict(translation)
        if stale.submitted_by == current_user.user_id:
            refresh["original_description"] = body.raw_text
        elif stale.submitted_by is None:
            # The submitter's account is gone. Nobody could be shown their
            # paste any more, so don't keep it: it's their personal data.
            refresh["original_description"] = None
        job = await job_repo.refresh_unless_deleted(stale.id, **refresh)
        # None: deleted while the AI call ran, which freed the URL -- so it
        # is created afresh below, owned by this request.
    if job is None:
        job = await job_repo.create_or_get_holder(
            source_url=body.source_url,
            source_platform="manual",
            original_description=body.raw_text,
            original_language="ja",
            original_title=None,  # raw text paste — no parsed Japanese title
            submitted_by=current_user.user_id,
            **translation,
        )

    # -- Record usage (never raises)
    await usage_tracker.record(
        user_id=current_user.user_id,
        feature="job_translation",
        model=settings.gemini_default_model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=latency_ms,
        db=db,
    )

    await db.commit()
    await db.refresh(job)

    logger.info(
        "Job translated: job_id=%s user_id=%s tokens=%d",
        job.id,
        current_user.user_id,
        input_tokens + output_tokens,
    )
    return _posting_response(JobPostingDetailResponse, job, current_user.user_id)


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@router.get("", response_model=JobPostingListResponse)
async def list_jobs(
    current_user: AuthUser,
    db: DbSession,
    pagination: PaginationDep,
    q: str | None = Query(None, description="Full-text search on title and summary"),
    min_score: float | None = Query(
        None, ge=0, le=100, description="Minimum foreigner-friendliness score"
    ),
) -> JobPostingListResponse:
    """List active (non-deleted) job postings. Supports search and score filtering."""
    job_repo = JobPostingRepository(db)

    if q:
        items = await job_repo.search(
            q,
            viewer_id=current_user.user_id,
            offset=pagination.offset,
            limit=pagination.limit,
        )
    else:
        items = await job_repo.list_active(
            viewer_id=current_user.user_id,
            offset=pagination.offset,
            limit=pagination.limit,
            min_friendliness=min_score,
        )

    return JobPostingListResponse(
        items=[_posting_response(JobPostingResponse, j, current_user.user_id) for j in items],
        total=len(items),
    )


# ---------------------------------------------------------------------------
# Application tracker
#
# Deliberately declared before the /{job_id} routes below: Starlette matches
# routes in registration order, not by specificity, so a literal path like
# /applications must come before a dynamic /{job_id} segment of the same
# length or every request to /jobs/applications gets swallowed by get_job()
# (job_id="applications" fails UUID parsing -> 422). This was a real bug —
# GET /jobs/applications was unreachable before this reordering.
# ---------------------------------------------------------------------------


def _application_response(app: JobApplication) -> JobApplicationResponse:
    """
    Build response with denormalised posting title/company.

    The posting arrives through a relationship, which no query-level filter
    reaches, so visibility is checked here. Without it a tracker entry made
    before postings were scoped -- when every paste was visible to everyone --
    would keep showing the title and company of someone else's private paste.
    The entry itself stays: it is the viewer's own record of applying.
    Checked against the application's owner, who is always the caller.
    """
    posting = getattr(app, "job_posting", None)
    if posting is not None and not posting.visible_to(app.user_id):
        posting = None
    return JobApplicationResponse(
        id=app.id,
        user_id=app.user_id,
        job_posting_id=app.job_posting_id,
        status=app.status.value,
        applied_at=app.applied_at,
        notes=app.notes,
        created_at=app.created_at,
        updated_at=app.updated_at,
        job_title=posting.translated_title or posting.original_title if posting else None,
        job_company=posting.original_company if posting else None,
    )


@router.post(
    "/applications",
    response_model=JobApplicationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_application(
    body: CreateApplicationRequest,
    current_user: AuthUser,
    db: DbSession,
) -> JobApplicationResponse:
    """
    Add a job to the application tracker at 'planning' status.
    If an application for this job already exists, returns the existing one.
    """
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models.enums import ApplicationStatus
    from app.models.job import JobApplication

    job_repo = JobPostingRepository(db)
    job = await job_repo.get_active(body.job_posting_id, viewer_id=current_user.user_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job posting not found.")

    app_repo = JobApplicationRepository(db)
    existing = await app_repo.get_for_user_and_job(current_user.user_id, body.job_posting_id)
    if existing is not None:
        # Eagerly load posting for denormalisation
        refreshed_existing = await db.scalar(
            select(JobApplication)
            .where(JobApplication.id == existing.id)
            .options(selectinload(JobApplication.job_posting))
        )
        return _application_response(refreshed_existing or existing)

    app = await app_repo.create(
        user_id=current_user.user_id,
        job_posting_id=body.job_posting_id,
        status=ApplicationStatus.planning,
        notes=body.notes,
    )
    await db.flush()

    refreshed = await db.scalar(
        select(JobApplication)
        .where(JobApplication.id == app.id)
        .options(selectinload(JobApplication.job_posting))
    )
    return _application_response(refreshed or app)


@router.get("/applications", response_model=list[JobApplicationResponse])
async def list_applications(
    current_user: AuthUser,
    db: DbSession,
    status_filter: str | None = Query(default=None, alias="status"),
) -> list[JobApplicationResponse]:
    """
    List all tracked applications for the authenticated user.
    Optional ?status= filter (planning|applied|interviewing|offered|rejected|withdrawn).
    Results are ordered by updated_at desc within each status.
    """
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models.enums import ApplicationStatus
    from app.models.job import JobApplication

    stmt = (
        select(JobApplication)
        .where(JobApplication.user_id == current_user.user_id)
        .options(selectinload(JobApplication.job_posting))
        .order_by(JobApplication.updated_at.desc())
    )

    if status_filter:
        try:
            s = ApplicationStatus(status_filter)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid status '{status_filter}'.",
            ) from exc
        stmt = stmt.where(JobApplication.status == s)

    result = await db.scalars(stmt)
    apps = list(result.all())
    return [_application_response(a) for a in apps]


@router.patch("/applications/{application_id}", response_model=JobApplicationResponse)
async def update_application(
    application_id: UUID,
    body: UpdateApplicationRequest,
    current_user: AuthUser,
    db: DbSession,
) -> JobApplicationResponse:
    """Update the status and/or notes of a tracked application."""
    from datetime import datetime

    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models.enums import ApplicationStatus
    from app.models.job import JobApplication

    app = await db.scalar(
        select(JobApplication)
        .where(
            JobApplication.id == application_id,
            JobApplication.user_id == current_user.user_id,
        )
        .options(selectinload(JobApplication.job_posting))
    )
    if app is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")

    kwargs: dict[str, Any] = {}
    if body.status is not None:
        try:
            new_status = ApplicationStatus(body.status)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid status '{body.status}'.",
            ) from exc
        kwargs["status"] = new_status
        if new_status == ApplicationStatus.applied and app.applied_at is None:
            kwargs["applied_at"] = datetime.now(tz=UTC)

    if body.notes is not None:
        kwargs["notes"] = body.notes

    if kwargs:
        from app.repositories.job import JobApplicationRepository as _Repo

        app_repo = _Repo(db)
        app = await app_repo.update(app, **kwargs)
        await db.flush()
        # Re-fetch with relationship loaded
        refreshed = await db.scalar(
            select(JobApplication)
            .where(JobApplication.id == application_id)
            .options(selectinload(JobApplication.job_posting))
        )
        app = refreshed or app

    return _application_response(app)


@router.delete("/applications/{application_id}", status_code=status.HTTP_200_OK)
async def delete_application(
    application_id: UUID,
    current_user: AuthUser,
    db: DbSession,
) -> dict[str, Any]:
    """Remove a job from the application tracker."""
    from sqlalchemy import select

    from app.models.job import JobApplication

    app = await db.scalar(
        select(JobApplication).where(
            JobApplication.id == application_id,
            JobApplication.user_id == current_user.user_id,
        )
    )
    if app is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")

    await db.delete(app)
    await db.flush()
    return {"detail": "Application deleted"}


# ---------------------------------------------------------------------------
# Get detail
# ---------------------------------------------------------------------------


@router.get("/{job_id}", response_model=JobPostingDetailResponse)
async def get_job(
    job_id: UUID,
    current_user: AuthUser,
    db: DbSession,
) -> JobPostingDetailResponse:
    """Return full job posting including translated description."""
    job_repo = JobPostingRepository(db)
    job = await job_repo.get_active(job_id, viewer_id=current_user.user_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job posting not found")
    return _posting_response(JobPostingDetailResponse, job, current_user.user_id)


# ---------------------------------------------------------------------------
# Soft-delete (submitter only)
# ---------------------------------------------------------------------------


@router.delete("/{job_id}", status_code=status.HTTP_200_OK)
async def delete_job(
    job_id: UUID,
    current_user: AuthUser,
    db: DbSession,
) -> dict[str, Any]:
    """Soft-delete a job posting. Only the user who submitted it can delete it."""
    job_repo = JobPostingRepository(db)
    deleted = await job_repo.soft_delete(job_id, current_user.user_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job posting not found or you do not have permission to delete it",
        )
    await db.commit()
    return {"detail": "Job deleted"}


# ---------------------------------------------------------------------------
# Match score
# ---------------------------------------------------------------------------


@router.post("/{job_id}/match", response_model=MatchScoreResponse, status_code=status.HTTP_200_OK)
async def match_job(
    job_id: UUID,
    body: MatchRequest,
    current_user: AuthUser,
    db: DbSession,
) -> MatchScoreResponse:
    """
    Score a resume against a job posting using Gemini.
    Upserts the result — calling again with the same (resume, job) pair
    refreshes the score.
    """
    from app.config import settings
    from app.services.ai.client import AIError, ai_client
    from app.services.ai.prompts.job_match import (
        JobMatchResult,
        build_system_prompt,
        build_user_prompt,
    )
    from app.services.ai.response_parser import ResponseParseError, parse_response
    from app.services.ai.usage_tracker import AIBudgetError, usage_tracker
    from app.services.file_storage import StorageError, file_storage
    from app.services.resume_parser import ParseError, extract_text

    # -- Load job
    job_repo = JobPostingRepository(db)
    job = await job_repo.get_active(job_id, viewer_id=current_user.user_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job posting not found")

    if not job.translated_description:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Job posting has no translated description yet",
        )

    # -- Load resume (ownership enforced)
    resume_repo = ResumeRepository(db)
    resume = await resume_repo.get_owned(body.resume_id, current_user.user_id)
    if resume is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    # -- Load candidate's Japanese level from profile
    profile_repo = ProfileRepository(db)
    profile = await profile_repo.get_by_user_id(current_user.user_id)
    japanese_level: str | None = profile.japanese_level.value if profile else None

    # -- Budget check
    try:
        await usage_tracker.check_budget(current_user.user_id, "job_match", db)
    except AIBudgetError as exc:
        raise exc.to_http_exception() from exc

    # -- Extract resume text from S3 / Backblaze B2
    try:
        file_bytes = file_storage.download(resume.file_url)
    except StorageError as exc:
        logger.error("S3 fetch failed for resume=%s: %s", resume.id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not retrieve resume file. Please try again.",
        ) from exc

    try:
        # extract_text is CPU-bound (PDF/DOCX parsing) — run it off the event
        # loop so a slow or pathological file can't stall all other requests.
        resume_text = await asyncio.to_thread(extract_text, file_bytes, resume.mime_type)
    except ParseError as exc:
        logger.warning("Resume text extraction failed for resume=%s: %s", resume.id, exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not read this resume file. Please re-upload it in a supported format.",
        ) from exc

    # -- Call Gemini
    system = build_system_prompt()
    user_prompt = build_user_prompt(
        resume_text=resume_text,
        job_title=job.translated_title or job.original_title or "",
        job_description=job.translated_description,
        japanese_level=japanese_level,
    )

    t0 = time.monotonic()
    try:
        response_text, input_tokens, output_tokens = await ai_client.generate(
            system,
            user_prompt,
            max_tokens=_MATCH_MAX_TOKENS,
            feature="job_match",
            json_mode=True,
        )
    except AIError as exc:
        logger.error("AI match scoring failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Match scoring failed. Please try again.",
        ) from exc
    latency_ms = int((time.monotonic() - t0) * 1000)

    # -- Parse
    try:
        parsed: JobMatchResult = parse_response(response_text, JobMatchResult)
    except ResponseParseError as exc:
        logger.error("Match response parse failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Match scoring response was malformed. Please try again.",
        ) from exc

    # -- Upsert match row
    match_repo = JobMatchRepository(db)
    match = await match_repo.upsert(
        user_id=current_user.user_id,
        resume_id=body.resume_id,
        job_posting_id=job_id,
        match_score=float(parsed.match_score),
        match_breakdown=parsed.match_breakdown.model_dump(),
        recommendations=parsed.recommendations.model_dump(),
    )

    # -- Record usage (never raises)
    await usage_tracker.record(
        user_id=current_user.user_id,
        feature="job_match",
        model=settings.gemini_default_model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=latency_ms,
        db=db,
    )

    await db.commit()
    await db.refresh(match)

    logger.info(
        "Match scored: job_id=%s resume_id=%s score=%s tokens=%d",
        job_id,
        body.resume_id,
        parsed.match_score,
        input_tokens + output_tokens,
    )
    return MatchScoreResponse.model_validate(match)
