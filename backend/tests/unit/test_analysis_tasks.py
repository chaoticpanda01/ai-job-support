"""
Unit tests for the resume analysis background task and the repository methods
that track its request.

The client learns the outcome only from the resume's analysis status, so every
path must end with the status cleared (success) or marked failed with a code.
DB, S3, text extraction, and Gemini are mocked.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator, Callable, Iterator
from contextlib import asynccontextmanager, contextmanager
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.models.enums import AnalysisErrorCode
from app.repositories.resume import ResumeRepository
from app.services.ai.client import AIError
from app.services.ai.usage_tracker import AIBudgetError
from app.services.file_storage import StorageError
from app.services.resume_parser import ParseError
from app.workers.analysis_tasks import _run_analysis

_VALID_RESULT = {
    "japan_market_score": 72,
    "strengths": ["Python"],
    "gaps": ["Business Japanese"],
    "recommendations": ["Aim for JLPT N2"],
    "language_assessment": "Fluent English",
    "estimated_japanese_level_required": "N2",
    "summary": "A strong fit for international teams.",
}


class _Deps:
    """Mocks for everything the task touches, with each DB session's commits logged."""

    def __init__(self) -> None:
        self.resume = MagicMock(file_url="resumes/u/r.pdf", mime_type="application/pdf")
        self.get_owned = AsyncMock(return_value=self.resume)
        self.check_budget = AsyncMock()
        self.download = MagicMock(return_value=b"%PDF-1.7")
        self.extract_text = MagicMock(return_value="Resume text")
        self.generate = AsyncMock(return_value=(json.dumps(_VALID_RESULT), 100, 200))
        self.create = AsyncMock(return_value=MagicMock(id=uuid.uuid4()))
        self.record = AsyncMock()
        self.finish = AsyncMock(return_value=True)
        # The number of each DB session that committed: 1 is the analysis itself,
        # 2 the separate session that records a failure.
        self.commits: list[int] = []

    @contextmanager
    def patched(self) -> Iterator[None]:
        opened = 0

        @asynccontextmanager
        async def factory() -> AsyncIterator[MagicMock]:
            nonlocal opened
            opened += 1
            number = opened
            db = MagicMock()
            db.commit = AsyncMock(side_effect=lambda: self.commits.append(number))
            yield db

        with (
            patch("app.database.AsyncSessionFactory", new=factory),
            patch("app.repositories.resume.ResumeRepository.get_owned", new=self.get_owned),
            patch("app.repositories.resume.ResumeRepository.finish_analysis", new=self.finish),
            patch("app.repositories.resume.ResumeAnalysisRepository.create", new=self.create),
            patch(
                "app.services.ai.usage_tracker.usage_tracker.check_budget", new=self.check_budget
            ),
            patch("app.services.ai.usage_tracker.usage_tracker.record", new=self.record),
            patch("app.services.file_storage.file_storage.download", new=self.download),
            patch("app.services.resume_parser.extract_text", new=self.extract_text),
            patch("app.services.ai.client.ai_client.generate", new=self.generate),
        ):
            yield

    async def run(self) -> tuple[uuid.UUID, datetime]:
        resume_id, requested_at = uuid.uuid4(), datetime.now(tz=UTC)
        with self.patched():
            await _run_analysis(resume_id, uuid.uuid4(), "general", None, "en", requested_at)
        return resume_id, requested_at


# ---------------------------------------------------------------------------
# _run_analysis
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_success_saves_the_analysis_and_clears_the_status_in_one_commit() -> None:
    deps = _Deps()
    resume_id, requested_at = await deps.run()

    deps.create.assert_awaited_once()
    assert deps.create.await_args is not None
    assert deps.create.await_args.kwargs["result"] == _VALID_RESULT
    deps.record.assert_awaited_once()
    deps.finish.assert_awaited_once_with(resume_id, requested_at, error_code=None)
    assert deps.commits == [1]


def _raise(attribute: str, error: Exception) -> Callable[[_Deps], None]:
    return lambda deps: setattr(getattr(deps, attribute), "side_effect", error)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("break_it", "expected_code"),
    [
        pytest.param(
            _raise("check_budget", AIBudgetError(used=10, limit=10)),
            AnalysisErrorCode.budget_exceeded,
            id="budget",
        ),
        pytest.param(
            _raise("download", StorageError("bucket unreachable")),
            AnalysisErrorCode.file_unavailable,
            id="storage",
        ),
        pytest.param(
            _raise("extract_text", ParseError("no text layer")),
            AnalysisErrorCode.unreadable_file,
            id="unreadable",
        ),
        pytest.param(
            _raise("generate", AIError("quota exhausted")),
            AnalysisErrorCode.ai_failed,
            id="ai-error",
        ),
        pytest.param(
            lambda deps: setattr(deps.generate, "return_value", ("not json", 10, 5)),
            AnalysisErrorCode.ai_failed,
            id="malformed-response",
        ),
        pytest.param(
            _raise("create", RuntimeError("db down")),
            AnalysisErrorCode.unknown,
            id="unexpected",
        ),
    ],
)
async def test_failure_is_recorded_with_its_code(
    break_it: Callable[[_Deps], None], expected_code: AnalysisErrorCode
) -> None:
    deps = _Deps()
    break_it(deps)

    resume_id, requested_at = await deps.run()

    deps.finish.assert_awaited_once_with(resume_id, requested_at, error_code=expected_code)
    # Nothing from the failed attempt is committed; the failure is, separately.
    assert deps.commits == [2]


@pytest.mark.asyncio
async def test_failure_of_a_superseded_request_is_not_committed() -> None:
    deps = _Deps()
    deps.generate.side_effect = AIError("quota exhausted")
    deps.finish.return_value = False

    await deps.run()

    deps.finish.assert_awaited_once()
    assert deps.commits == []


@pytest.mark.asyncio
async def test_success_of_a_superseded_request_still_saves_the_analysis() -> None:
    deps = _Deps()
    deps.finish.return_value = False

    await deps.run()

    deps.create.assert_awaited_once()
    assert deps.commits == [1]


@pytest.mark.asyncio
async def test_deleted_resume_is_skipped_without_recording_anything() -> None:
    deps = _Deps()
    deps.get_owned.return_value = None

    await deps.run()

    deps.generate.assert_not_awaited()
    deps.finish.assert_not_awaited()
    assert deps.commits == []


@pytest.mark.asyncio
async def test_failing_to_record_a_failure_does_not_raise() -> None:
    deps = _Deps()
    deps.generate.side_effect = AIError("quota exhausted")
    deps.finish.side_effect = RuntimeError("db down")

    await deps.run()  # logged; the status endpoint reports it once stale

    assert deps.commits == []


# ---------------------------------------------------------------------------
# ResumeRepository request tracking
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mark_analysis_pending_starts_a_new_request() -> None:
    session = MagicMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()
    resume = MagicMock(analysis_status="failed", analysis_error_code="ai_failed")

    requested_at = await ResumeRepository(session).mark_analysis_pending(resume)

    assert resume.analysis_status == "pending"
    assert resume.analysis_error_code is None
    assert resume.analysis_requested_at == requested_at
    assert requested_at.tzinfo is not None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("error_code", "stored_status", "stored_code"),
    [
        pytest.param(None, None, None, id="success-clears"),
        pytest.param(AnalysisErrorCode.ai_failed, "failed", "ai_failed", id="failure-marks"),
    ],
)
async def test_finish_analysis_updates_only_the_matching_request(
    error_code: AnalysisErrorCode | None,
    stored_status: str | None,
    stored_code: str | None,
) -> None:
    session = MagicMock()
    session.execute = AsyncMock(return_value=MagicMock(rowcount=1))
    resume_id, requested_at = uuid.uuid4(), datetime.now(tz=UTC)

    finished = await ResumeRepository(session).finish_analysis(
        resume_id, requested_at, error_code=error_code
    )

    assert finished is True
    assert session.execute.await_args is not None
    statement = session.execute.await_args.args[0]
    compiled = statement.compile()
    where = str(statement.whereclause)
    assert "resumes.id" in where and "resumes.analysis_requested_at" in where
    params: dict[str, Any] = compiled.params
    assert resume_id in params.values() and requested_at in params.values()
    assert params["analysis_status"] == stored_status
    assert params["analysis_error_code"] == stored_code


@pytest.mark.asyncio
async def test_finish_analysis_reports_a_superseded_request() -> None:
    session = MagicMock()
    session.execute = AsyncMock(return_value=MagicMock(rowcount=0))

    finished = await ResumeRepository(session).finish_analysis(
        uuid.uuid4(), datetime.now(tz=UTC), error_code=None
    )

    assert finished is False
