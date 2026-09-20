"""
Unit tests for the document generation background task, the repository method
that records a failure, and the staleness rule the status endpoint applies.

The client polls the document's status until it reaches a terminal state, so
every way generation can end has to leave the row at 'completed' or 'failed'.
A path that ends without recording one leaves the client polling a spinner
forever, which is the bug these tests exist to prevent. DB and the generator
pipeline are mocked.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager, contextmanager
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.api.v1.documents import _GENERATION_STALE_AFTER, _effective_state
from app.models.enums import DocumentErrorCode, DocumentStatus
from app.repositories.document import DocumentRepository
from app.services.ai.client import MAX_GENERATE_SECONDS
from app.services.document_generator import (
    DocumentGenerationError,
    GeneratedDocumentOutput,
)
from app.workers.document_tasks import _run_generation

_OUTPUT = GeneratedDocumentOutput(
    content={"summary": "ok"},
    file_url="documents/u/d.pdf",
    ai_model="gemini-2.0-flash",
    input_tokens=100,
    output_tokens=50,
)


class _Deps:
    """Mocks for everything the task touches, with each DB session's commits logged."""

    def __init__(self) -> None:
        self.set_processing = AsyncMock()
        self.set_completed = AsyncMock()
        self.set_failed = AsyncMock()
        self.generate = AsyncMock(return_value=_OUTPUT)
        # The number of the DB session that committed: 1 is the generation
        # itself, 2 the separate session that records a failure.
        self.commits: list[int] = []
        self.session_commit_error: Exception | None = None

    @contextmanager
    def patched(self) -> Iterator[None]:
        opened = 0

        @asynccontextmanager
        async def factory() -> AsyncIterator[MagicMock]:
            nonlocal opened
            opened += 1
            number = opened

            async def commit() -> None:
                if self.session_commit_error is not None and number > 1:
                    raise self.session_commit_error
                self.commits.append(number)

            db = MagicMock()
            db.commit = AsyncMock(side_effect=commit)
            db.rollback = AsyncMock()
            yield db

        with (
            patch("app.database.AsyncSessionFactory", new=factory),
            patch(
                "app.repositories.document.DocumentRepository.set_processing",
                new=self.set_processing,
            ),
            patch(
                "app.repositories.document.DocumentRepository.set_completed",
                new=self.set_completed,
            ),
            patch("app.repositories.document.DocumentRepository.set_failed", new=self.set_failed),
            patch("app.services.document_generator.document_generator.generate", new=self.generate),
        ):
            yield

    async def run(self) -> uuid.UUID:
        document_id = uuid.uuid4()
        with self.patched():
            await _run_generation(document_id, uuid.uuid4())
        return document_id

    async def run_failing(self) -> uuid.UUID:
        """Run a generation that fails. The task reports it on the row, not by raising."""
        document_id = uuid.uuid4()
        with self.patched():
            assert await _run_generation(document_id, uuid.uuid4()) is None
        return document_id


# ---------------------------------------------------------------------------
# Success
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_success_commits_processing_then_the_finished_document() -> None:
    deps = _Deps()
    document_id = await deps.run()

    deps.set_processing.assert_awaited_once_with(document_id)
    deps.set_completed.assert_awaited_once()
    deps.set_failed.assert_not_awaited()
    # Both in the generation's own session, and the 'processing' mark committed
    # on its own so the client sees it while the generation runs.
    assert deps.commits == [1, 1]


@pytest.mark.asyncio
async def test_success_returns_the_generated_file_and_token_counts() -> None:
    deps = _Deps()
    document_id = uuid.uuid4()
    with deps.patched():
        result = await _run_generation(document_id, uuid.uuid4())

    assert result == {
        "document_id": str(document_id),
        "file_url": "documents/u/d.pdf",
        "input_tokens": 100,
        "output_tokens": 50,
    }


# ---------------------------------------------------------------------------
# Failure recording
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "code",
    [
        DocumentErrorCode.budget_exceeded,
        DocumentErrorCode.profile_incomplete,
        DocumentErrorCode.resume_missing,
        DocumentErrorCode.file_unavailable,
        DocumentErrorCode.unreadable_file,
        DocumentErrorCode.ai_failed,
        DocumentErrorCode.pdf_failed,
        DocumentErrorCode.upload_failed,
    ],
)
async def test_pipeline_failure_is_recorded_with_its_own_code(code: DocumentErrorCode) -> None:
    deps = _Deps()
    deps.generate.side_effect = DocumentGenerationError(code, "step failed")

    document_id = await deps.run_failing()

    deps.set_failed.assert_awaited_once_with(
        document_id, error_code=code, error_message="step failed"
    )
    deps.set_completed.assert_not_awaited()


@pytest.mark.asyncio
async def test_unexpected_exception_is_recorded_as_unknown() -> None:
    """
    The pipeline's own error type is not the only way generation can fail: a
    driver error, a bug, or anything else raised here would otherwise leave the
    document at 'processing' forever.
    """
    deps = _Deps()
    deps.generate.side_effect = RuntimeError("connection reset")

    document_id = await deps.run_failing()

    deps.set_failed.assert_awaited_once()
    assert deps.set_failed.await_args is not None
    assert deps.set_failed.await_args.args == (document_id,)
    assert deps.set_failed.await_args.kwargs["error_code"] is DocumentErrorCode.unknown
    assert "connection reset" in deps.set_failed.await_args.kwargs["error_message"]


@pytest.mark.asyncio
async def test_failure_is_recorded_in_a_separate_session() -> None:
    """
    The generation session may be unusable after the failure (a rolled-back
    transaction still needs a rollback before it accepts anything), so the
    failure has to be written through a session of its own.
    """
    deps = _Deps()
    deps.generate.side_effect = DocumentGenerationError(DocumentErrorCode.ai_failed, "boom")

    await deps.run_failing()

    # 1 is the 'processing' mark; the failure commits in session 2.
    assert deps.commits == [1, 2]


@pytest.mark.asyncio
async def test_a_failure_while_recording_the_failure_is_logged_not_raised(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """
    A database that is unreachable when the failure is written leaves the
    document running; the status endpoint reports it as timed out once it is
    stale. The task must not raise on the way out.
    """
    deps = _Deps()
    deps.generate.side_effect = DocumentGenerationError(DocumentErrorCode.pdf_failed, "boom")
    deps.session_commit_error = RuntimeError("database gone")

    with caplog.at_level(logging.ERROR), deps.patched():
        await _run_generation(uuid.uuid4(), uuid.uuid4())

    assert "Failed to record document generation failure" in caplog.text


@pytest.mark.asyncio
async def test_a_very_long_error_message_is_truncated() -> None:
    deps = _Deps()
    deps.generate.side_effect = DocumentGenerationError(DocumentErrorCode.ai_failed, "x" * 5000)

    await deps.run_failing()

    assert deps.set_failed.await_args is not None
    assert len(deps.set_failed.await_args.kwargs["error_message"]) == 2000


@pytest.mark.asyncio
async def test_a_failure_before_generation_still_records() -> None:
    """set_processing failing must not skip the failure record."""
    deps = _Deps()
    deps.set_processing.side_effect = RuntimeError("row locked")

    document_id = await deps.run_failing()

    deps.set_failed.assert_awaited_once()
    assert deps.set_failed.await_args is not None
    assert deps.set_failed.await_args.args == (document_id,)
    deps.generate.assert_not_awaited()


# ---------------------------------------------------------------------------
# DocumentRepository.set_failed
# ---------------------------------------------------------------------------


def _repo_with(doc: MagicMock | None) -> tuple[DocumentRepository, AsyncMock]:
    repo = DocumentRepository(MagicMock())
    update = AsyncMock(return_value=doc)
    repo.get = AsyncMock(return_value=doc)  # type: ignore[method-assign]
    repo.update = update  # type: ignore[method-assign]
    return repo, update


@pytest.mark.asyncio
async def test_set_failed_records_the_code_and_a_completion_time() -> None:
    doc = MagicMock(status=DocumentStatus.processing)
    repo, update = _repo_with(doc)

    await repo.set_failed(
        uuid.uuid4(), error_code=DocumentErrorCode.ai_failed, error_message="AI failed"
    )

    assert update.await_args is not None
    kwargs = update.await_args.kwargs
    assert kwargs["status"] is DocumentStatus.failed
    # The value, not the member: the column is a plain VARCHAR.
    assert kwargs["error_code"] == "ai_failed"
    assert kwargs["error_message"] == "AI failed"
    assert kwargs["completed_at"] is not None


@pytest.mark.asyncio
async def test_set_failed_leaves_a_deleted_document_alone() -> None:
    repo, update = _repo_with(None)

    result = await repo.set_failed(
        uuid.uuid4(), error_code=DocumentErrorCode.unknown, error_message="boom"
    )

    assert result is None
    update.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [DocumentStatus.completed, DocumentStatus.failed])
async def test_set_failed_does_not_overwrite_a_finished_document(status: DocumentStatus) -> None:
    """A late failure from a superseded run must not bury a completed result."""
    doc = MagicMock(status=status)
    repo, update = _repo_with(doc)

    result = await repo.set_failed(
        uuid.uuid4(), error_code=DocumentErrorCode.unknown, error_message="late"
    )

    assert result is doc
    update.assert_not_awaited()


# ---------------------------------------------------------------------------
# Staleness (_effective_state)
# ---------------------------------------------------------------------------


def _doc(status: DocumentStatus, *, age: timedelta, error_code: str | None = None) -> MagicMock:
    now = datetime.now(tz=UTC)
    return MagicMock(status=status, error_code=error_code, created_at=now - age)


@pytest.mark.parametrize("status", [DocumentStatus.pending, DocumentStatus.processing])
def test_a_running_generation_is_reported_as_running(status: DocumentStatus) -> None:
    doc = _doc(status, age=timedelta(seconds=5))
    assert _effective_state(doc, datetime.now(tz=UTC)) == (status, None)


@pytest.mark.parametrize("status", [DocumentStatus.pending, DocumentStatus.processing])
def test_a_generation_running_too_long_is_reported_as_timed_out(status: DocumentStatus) -> None:
    doc = _doc(status, age=_GENERATION_STALE_AFTER + timedelta(seconds=1))
    assert _effective_state(doc, datetime.now(tz=UTC)) == (
        DocumentStatus.failed,
        DocumentErrorCode.timed_out,
    )


@pytest.mark.parametrize(
    ("age", "expected"),
    [
        pytest.param(
            _GENERATION_STALE_AFTER - timedelta(seconds=1),
            (DocumentStatus.processing, None),
            id="inside",
        ),
        pytest.param(
            _GENERATION_STALE_AFTER,
            (DocumentStatus.failed, DocumentErrorCode.timed_out),
            id="at-the-cutoff",
        ),
    ],
)
def test_the_cutoff_is_reached_at_exactly_the_cutoff(
    age: timedelta, expected: tuple[DocumentStatus, DocumentErrorCode | None]
) -> None:
    """A generation is running right up to the cutoff, and stale from it on."""
    now = datetime.now(tz=UTC)
    doc = MagicMock(status=DocumentStatus.processing, error_code=None, created_at=now - age)
    assert _effective_state(doc, now) == expected


def test_a_document_with_no_creation_time_yet_is_not_stale() -> None:
    """
    A row that hasn't been flushed has no created_at, and nothing to measure
    staleness against. It is newly created, so it must read as running rather
    than as a generation that timed out before it began.
    """
    doc = MagicMock(status=DocumentStatus.pending, error_code=None, created_at=None)
    assert _effective_state(doc, datetime.now(tz=UTC)) == (DocumentStatus.pending, None)


# Fix 5: guard the cutoff against being shortened below what a generation can take.
def test_the_cutoff_outlasts_the_longest_possible_generation() -> None:
    """
    A cutoff shorter than a generation would report a healthy run as timed out.
    The margin covers what generation does around the AI call: rendering the
    HTML, converting it to a PDF in a worker thread, uploading it, and the DB
    writes -- more post-AI work than resume analysis does, so the same
    MAX_GENERATE_SECONDS + 120 budget is tighter here.
    """
    assert _GENERATION_STALE_AFTER.total_seconds() > MAX_GENERATE_SECONDS


def test_a_failed_document_reports_its_stored_code() -> None:
    doc = _doc(DocumentStatus.failed, age=timedelta(days=1), error_code="budget_exceeded")
    assert _effective_state(doc, datetime.now(tz=UTC)) == (
        DocumentStatus.failed,
        DocumentErrorCode.budget_exceeded,
    )


@pytest.mark.parametrize("stored", [None, "code_from_a_newer_version"])
def test_a_failure_without_a_code_this_version_knows_is_reported_as_unknown(
    stored: str | None,
) -> None:
    doc = _doc(DocumentStatus.failed, age=timedelta(days=1), error_code=stored)
    assert _effective_state(doc, datetime.now(tz=UTC)) == (
        DocumentStatus.failed,
        DocumentErrorCode.unknown,
    )


def test_a_completed_document_has_no_error_code() -> None:
    doc = _doc(DocumentStatus.completed, age=timedelta(days=1))
    assert _effective_state(doc, datetime.now(tz=UTC)) == (DocumentStatus.completed, None)
