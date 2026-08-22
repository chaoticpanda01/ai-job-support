"""
Resume analysis background task.

_run_analysis is invoked via FastAPI BackgroundTasks (see
app.api.v1.resumes), not a Celery task:
  1. Load resume + user from DB
  2. Check AI budget (raises AIBudgetError → caller records failure)
  3. Extract text from the S3 file
  4. Call Gemini via AIClient
  5. Parse and validate response JSON
  6. Write ResumeAnalysis row to DB
  7. Record AI usage
"""

from __future__ import annotations

import logging
import time
from typing import Any
from uuid import UUID

logger = logging.getLogger(__name__)


async def _run_analysis(
    resume_id: UUID,
    user_id: UUID,
    analysis_type: str,
    job_posting_id: UUID | None,
    language: str = "en",
) -> dict[str, Any]:
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
    from app.services.file_storage import file_storage
    from app.services.resume_parser import ParseError, extract_text

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
        file_bytes = file_storage.download(resume.file_url)

        # -- Extract text
        try:
            resume_text = extract_text(file_bytes, resume.mime_type)
        except ParseError as exc:
            raise ValueError("Could not read resume file — unsupported or corrupt format") from exc

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
