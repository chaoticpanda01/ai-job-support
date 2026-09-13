"""
Unit tests for the resume analysis background task and the repository methods
that track its request.

The client learns the outcome only from the resume's analysis status, so every
path must end with the status cleared (success) or marked failed with a code.
DB, S3, text extraction, and Gemini are mocked.
"""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import AsyncIterator, Callable, Iterator
from contextlib import asynccontextmanager, contextmanager
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.api.v1.resumes import _ANALYSIS_STALE_AFTER, _analysis_status
from app.models.enums import AnalysisErrorCode
from app.models.resume import Resume
from app.repositories.resume import ResumeRepository
from app.services.ai.client import AIError
from app.services.ai.usage_tracker import AIBudgetError
from app.services.file_storage import StorageError
from app.services.resume_parser import ParseError
from app.workers.analysis_tasks import _run_analysis
from sqlalchemy import and_
from sqlalchemy.exc import IntegrityError, OperationalError

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
            db.rollback = AsyncMock()
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
    # Exactly this id AND this request time. compare() also checks bound values,
    # which the second assert proves by shifting the time by a microsecond.
    assert statement.whereclause.compare(
        and_(Resume.id == resume_id, Resume.analysis_requested_at == requested_at)
    )
    assert not statement.whereclause.compare(
        and_(
            Resume.id == resume_id,
            Resume.analysis_requested_at == requested_at + timedelta(microseconds=1),
        )
    )
    params: dict[str, Any] = statement.compile().params
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


@pytest.mark.asyncio
async def test_mark_analysis_pending_returns_the_stored_time() -> None:
    """finish_analysis matches on this value, so it must be what the DB holds."""
    stored = datetime(2026, 1, 1, tzinfo=UTC)
    session = MagicMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock(
        side_effect=lambda obj: setattr(obj, "analysis_requested_at", stored)
    )

    assert await ResumeRepository(session).mark_analysis_pending(MagicMock()) == stored


# ---------------------------------------------------------------------------
# Ordering and less obvious failure paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_success_clears_the_status_before_committing() -> None:
    """Committing first would save the analysis but leave the status pending."""
    deps = _Deps()
    commits_seen_by_finish: list[list[int]] = []

    async def finish(*_: Any, **__: Any) -> bool:
        commits_seen_by_finish.append(list(deps.commits))
        return True

    deps.finish.side_effect = finish

    await deps.run()

    assert commits_seen_by_finish == [[]]
    assert deps.commits == [1]


@pytest.mark.asyncio
async def test_commit_failure_is_recorded_as_unknown() -> None:
    deps = _Deps()
    committed: list[int] = []
    opened = 0

    @asynccontextmanager
    async def factory() -> AsyncIterator[MagicMock]:
        nonlocal opened
        opened += 1
        number = opened
        db = MagicMock()

        async def commit() -> None:
            if number == 1:
                raise OperationalError("COMMIT", {}, Exception("connection lost"))
            committed.append(number)

        db.commit = commit
        yield db

    resume_id, requested_at = uuid.uuid4(), datetime.now(tz=UTC)
    with deps.patched(), patch("app.database.AsyncSessionFactory", new=factory):
        await _run_analysis(resume_id, uuid.uuid4(), "general", None, "en", requested_at)

    codes = [call.kwargs["error_code"] for call in deps.finish.await_args_list]
    assert codes == [None, AnalysisErrorCode.unknown]
    assert committed == [2]


@pytest.mark.asyncio
async def test_unexpected_error_from_the_ai_call_is_unknown_not_ai_failed() -> None:
    """Only AIError means the AI call failed; anything else is a bug to tell apart."""
    deps = _Deps()
    deps.generate.side_effect = TimeoutError("socket")

    resume_id, requested_at = await deps.run()

    deps.finish.assert_awaited_once_with(
        resume_id, requested_at, error_code=AnalysisErrorCode.unknown
    )


@pytest.mark.asyncio
async def test_resume_deleted_during_the_ai_call_is_discarded() -> None:
    deps = _Deps()
    deps.get_owned.side_effect = [deps.resume, None]
    deps.create.side_effect = IntegrityError("INSERT", {}, Exception("resume_analyses_resume_fk"))

    await deps.run()

    deps.finish.assert_not_awaited()
    assert deps.commits == []


@pytest.mark.asyncio
async def test_integrity_error_for_a_resume_that_still_exists_is_recorded() -> None:
    deps = _Deps()
    deps.create.side_effect = IntegrityError("INSERT", {}, Exception("some other constraint"))

    resume_id, requested_at = await deps.run()

    deps.finish.assert_awaited_once_with(
        resume_id, requested_at, error_code=AnalysisErrorCode.unknown
    )
    assert deps.commits == [2]


@pytest.mark.asyncio
async def test_superseded_success_is_logged(caplog: pytest.LogCaptureFixture) -> None:
    deps = _Deps()
    deps.finish.return_value = False

    with caplog.at_level(logging.INFO, logger="app.workers.analysis_tasks"):
        await deps.run()

    assert "superseded=True" in caplog.text


# ---------------------------------------------------------------------------
# Status endpoint staleness
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("age", "expected"),
    [
        pytest.param(_ANALYSIS_STALE_AFTER - timedelta(microseconds=1), "pending", id="inside"),
        pytest.param(_ANALYSIS_STALE_AFTER, "failed", id="at-threshold"),
    ],
)
def test_pending_goes_stale_exactly_at_the_threshold(age: timedelta, expected: str) -> None:
    now = datetime(2026, 9, 13, 12, 0, tzinfo=UTC)
    resume = MagicMock(
        analysis_status="pending", analysis_error_code=None, analysis_requested_at=now - age
    )

    assert _analysis_status(resume, now).status == expected


def test_stale_threshold_outlasts_the_longest_ai_call() -> None:
    """Otherwise a task still waiting on Gemini could be reported as timed out."""
    from app.services.ai.client import MAX_GENERATE_SECONDS

    assert _ANALYSIS_STALE_AFTER.total_seconds() > MAX_GENERATE_SECONDS
