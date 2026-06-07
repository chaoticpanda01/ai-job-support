"""
Celery tasks for resume analysis.

analyze_resume_task:
  1. Load resume + user from DB
  2. Check AI budget (raises AIBudgetError → task fails with known error)
  3. Extract text from the S3 file
  4. Call Claude via AIClient
  5. Parse and validate response JSON
  6. Write ResumeAnalysis row to DB
  7. Record AI usage
"""

from __future__ import annotations

import asyncio
import logging
import time
from uuid import UUID

from celery import Task

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


class _BaseTask(Task):  # type: ignore[type-arg]
    abstract = True

    def on_failure(self, exc: Exception, task_id: str, args: list, kwargs: dict, einfo: object) -> None:
        logger.error("Task %s failed: %s", task_id, exc)


@celery_app.task(
    bind=True,
    base=_BaseTask,
    name="app.workers.analysis_tasks.analyze_resume_task",
    max_retries=2,
    default_retry_delay=30,
)
def analyze_resume_task(
    self: Task,
    resume_id: str,
    user_id: str,
    analysis_type: str = "general",
    job_posting_id: str | None = None,
) -> dict:
    """
    Synchronous Celery task that runs async code via asyncio.run().
    Returns the analysis result dict on success.
    """
    try:
        return asyncio.run(
            _run_analysis(
                resume_id=UUID(resume_id),
                user_id=UUID(user_id),
                analysis_type=analysis_type,
                job_posting_id=UUID(job_posting_id) if job_posting_id else None,
            )
        )
    except Exception as exc:
        logger.exception("analyze_resume_task error: resume_id=%s", resume_id)
        raise self.retry(exc=exc) from exc


async def _run_analysis(
    resume_id: UUID,
    user_id: UUID,
    analysis_type: str,
    job_posting_id: UUID | None,
) -> dict:
    from sqlalchemy.ext.asyncio import AsyncSession

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
    from app.services.file_storage import file_storage
    from app.services.resume_parser import ParseError, extract_text
    from app.config import settings

    async with AsyncSessionFactory() as db:
        # -- Load resume
        resume_repo = ResumeRepository(db)
        resume = await resume_repo.get_owned(resume_id, user_id)
        if resume is None:
            raise ValueError(f"Resume {resume_id} not found for user {user_id}")

        # -- Budget check
        try:
            await usage_tracker.check_budget(user_id, "resume_analysis", db)
        except AIBudgetError as exc:
            logger.warning("Budget exceeded for user=%s: %s", user_id, exc)
            raise

        # -- Fetch file bytes from S3 / Backblaze B2
        import boto3  # type: ignore[import-untyped]
        s3_kwargs: dict = dict(
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )
        if settings.cloudflare_r2_endpoint_url:
            s3_kwargs["endpoint_url"] = settings.cloudflare_r2_endpoint_url
        s3 = boto3.client("s3", **s3_kwargs)
        obj = s3.get_object(Bucket=settings.s3_bucket_name, Key=resume.file_url)
        file_bytes = obj["Body"].read()

        # -- Extract text
        try:
            resume_text = extract_text(file_bytes, resume.mime_type)
        except ParseError as exc:
            raise ValueError(f"Text extraction failed: {exc}") from exc

        # -- Build prompts
        system = build_system_prompt()
        user_prompt = build_user_prompt(resume_text)

        # -- Call Claude
        t0 = time.monotonic()
        try:
            response_text, input_tokens, output_tokens = await ai_client.generate(
                system,
                user_prompt,
                max_tokens=8192,
                feature="resume_analysis",
            )
        except AIError as exc:
            raise ValueError(f"AI call failed: {exc}") from exc
        latency_ms = int((time.monotonic() - t0) * 1000)

        # -- Parse + validate response
        try:
            parsed = parse_response(response_text, ResumeAnalysisResult)
        except ResponseParseError as exc:
            raise ValueError(f"Response parsing failed: {exc}") from exc

        # -- Persist analysis
        analysis_repo = ResumeAnalysisRepository(db)
        analysis = await analysis_repo.create(
            resume_id=resume_id,
            analysis_type=AnalysisType(analysis_type),
            job_posting_id=job_posting_id,
            ai_model=settings.gemini_default_model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            result=parsed.model_dump(),
        )

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

        await db.commit()

        logger.info(
            "Resume analysis complete: resume_id=%s analysis_id=%s tokens=%d",
            resume_id,
            analysis.id,
            input_tokens + output_tokens,
        )
        return parsed.model_dump()
