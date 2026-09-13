"""
Resume analysis background task.

_run_analysis is invoked via FastAPI BackgroundTasks (see
app.api.v1.resumes), not a Celery task:
  1. Load the resume from DB
  2. Check AI budget
  3. Download the file from S3 and extract its text
  4. Call Gemini via AIClient, then parse and validate the JSON
  5. Write the ResumeAnalysis row, record AI usage, and clear the resume's
     analysis status, in one commit

The client polls GET /resumes/{id}/analysis/status, so every outcome of the
current request is recorded on the resume. A failure sets
analysis_status='failed' with an error code; raising alone would leave the
request pending until it went stale.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime
from uuid import UUID

from app.models.enums import AnalysisErrorCode

logger = logging.getLogger(__name__)


class ResumeAnalysisError(Exception):
    """An expected failure, recorded on the resume with a code the client can explain."""

    def __init__(self, code: AnalysisErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code


async def _run_analysis(
    resume_id: UUID,
    user_id: UUID,
    analysis_type: str,
    job_posting_id: UUID | None,
    language: str,
    requested_at: datetime,
) -> None:
    """
    Run one analysis request. requested_at identifies the request: the resume's
    status is updated only while it still holds that request, so a slow task
    can't overwrite the status of a newer one. A superseded success still saves
    its analysis.
    """
    try:
        await _analyze(resume_id, user_id, analysis_type, job_posting_id, language, requested_at)
    except ResumeAnalysisError as exc:
        logger.warning(
            "Resume analysis failed: resume_id=%s code=%s error=%s",
            resume_id,
            exc.code.value,
            exc,
        )
        await _record_failure(resume_id, requested_at, exc.code)
    except Exception:
        logger.exception("Resume analysis crashed: resume_id=%s", resume_id)
        await _record_failure(resume_id, requested_at, AnalysisErrorCode.unknown)


async def _analyze(
    resume_id: UUID,
    user_id: UUID,
    analysis_type: str,
    job_posting_id: UUID | None,
    language: str,
    requested_at: datetime,
) -> None:
    from sqlalchemy.exc import IntegrityError

    from app.config import settings
    from app.database import AsyncSessionFactory
    from app.models.enums import AnalysisType
    from app.repositories.resume import ResumeAnalysisRepository, ResumeRepository
    from app.services.ai.client import AIError, ai_client
    from app.services.ai.prompts.resume_analysis import (
        ResumeAnalysisResult,
        build_system_prompt,
        build_user_prompt,
    )
    from app.services.ai.response_parser import ResponseParseError, parse_response
    from app.services.ai.usage_tracker import AIBudgetError, usage_tracker
    from app.services.file_storage import StorageError, file_storage
    from app.services.resume_parser import ParseError, extract_text

    async with AsyncSessionFactory() as db:
        # -- Load resume
        resume_repo = ResumeRepository(db)
        resume = await resume_repo.get_owned(resume_id, user_id)
        if resume is None:
            # Deleted since the request: nothing to analyse or to record on.
            logger.info("Resume analysis skipped, resume deleted: resume_id=%s", resume_id)
            return

        # -- Budget check
        try:
            await usage_tracker.check_budget(user_id, "resume_analysis", db)
        except AIBudgetError as exc:
            raise ResumeAnalysisError(AnalysisErrorCode.budget_exceeded, str(exc)) from exc

        # -- Fetch file bytes from S3 / Backblaze B2
        try:
            file_bytes = file_storage.download(resume.file_url)
        except StorageError as exc:
            raise ResumeAnalysisError(AnalysisErrorCode.file_unavailable, str(exc)) from exc

        # -- Extract text
        try:
            resume_text = extract_text(file_bytes, resume.mime_type)
        except ParseError as exc:
            raise ResumeAnalysisError(AnalysisErrorCode.unreadable_file, str(exc)) from exc

        # -- Build prompts
        system = build_system_prompt(language)
        user_prompt = build_user_prompt(resume_text)

        # -- Call Gemini
        t0 = time.monotonic()
        try:
            response_text, input_tokens, output_tokens = await ai_client.generate(
                system,
                user_prompt,
                max_tokens=8192,
                feature="resume_analysis",
                json_mode=True,
            )
        except AIError as exc:
            raise ResumeAnalysisError(
                AnalysisErrorCode.ai_failed, f"AI call failed: {exc}"
            ) from exc
        latency_ms = int((time.monotonic() - t0) * 1000)

        # -- Parse + validate response
        try:
            parsed = parse_response(response_text, ResumeAnalysisResult)
        except ResponseParseError as exc:
            raise ResumeAnalysisError(
                AnalysisErrorCode.ai_failed, f"Response parsing failed: {exc}"
            ) from exc

        # -- Persist analysis
        analysis_repo = ResumeAnalysisRepository(db)
        try:
            analysis = await analysis_repo.create(
                resume_id=resume_id,
                analysis_type=AnalysisType(analysis_type),
                job_posting_id=job_posting_id,
                ai_model=settings.gemini_default_model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                result=parsed.model_dump(),
            )
        except IntegrityError:
            # Most likely the resume was deleted during the AI call, removing the
            # row the foreign key points at. Check before calling it a crash.
            await db.rollback()
            if await resume_repo.get_owned(resume_id, user_id) is None:
                logger.info("Resume analysis discarded, resume deleted: resume_id=%s", resume_id)
                return
            raise

        # -- Record usage (never raises)
        await usage_tracker.record(
            user_id=user_id,
            feature="resume_analysis",
            model=settings.gemini_default_model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
            db=db,
        )

        # -- Clear the pending status, unless a newer request now owns it
        is_current = await resume_repo.finish_analysis(resume_id, requested_at, error_code=None)

        await db.commit()

        logger.info(
            "Resume analysis complete: resume_id=%s analysis_id=%s tokens=%d superseded=%s",
            resume_id,
            analysis.id,
            input_tokens + output_tokens,
            not is_current,
        )


async def _record_failure(
    resume_id: UUID,
    requested_at: datetime,
    code: AnalysisErrorCode,
) -> None:
    """
    Mark the request failed in a fresh DB session. Best effort: if this fails
    too, it is logged, and the status endpoint reports the request as timed out
    once it goes stale.
    """
    from app.database import AsyncSessionFactory
    from app.repositories.resume import ResumeRepository

    try:
        async with AsyncSessionFactory() as db:
            if await ResumeRepository(db).finish_analysis(resume_id, requested_at, error_code=code):
                await db.commit()
    except Exception:
        logger.exception("Failed to record resume analysis failure: resume_id=%s", resume_id)
