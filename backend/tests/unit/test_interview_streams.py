"""
Unit tests for the interview SSE generators.

The client acts on "done" (it opens or refetches the chat) and on "summary" (it
treats the session as over), so what those events describe must be committed
before they are sent. When generating or saving fails, the stream must end with
an "error" event: a failed first question abandons its session, a failed turn
saves nothing, and a failed summary leaves the session active. DB and Gemini
are mocked.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from contextlib import asynccontextmanager, contextmanager
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.api.v1.interview import _stream_eval_and_question, _stream_question, _stream_summary
from app.services.ai.client import AIError

_QUESTION_REPO = "app.repositories.interview.InterviewMessageRepository"
_SESSION_REPO = "app.repositories.interview.InterviewSessionRepository"
_RECORD_USAGE = "app.services.ai.usage_tracker.usage_tracker.record"
_STREAM = "app.services.ai.client.ai_client.stream"
_GENERATE = "app.services.ai.client.ai_client.generate"


@contextmanager
def _fake_db(log: list[str]) -> Iterator[None]:
    """
    Patch AsyncSessionFactory. Each call opens a new DB session named db1, db2, ...
    whose commits are logged with its name, so a test can tell which session a
    write was committed in.
    """
    opened = 0

    @asynccontextmanager
    async def factory() -> AsyncIterator[MagicMock]:
        nonlocal opened
        opened += 1
        db = MagicMock()
        db.name = f"db{opened}"
        db.commit = AsyncMock(side_effect=lambda: log.append(f"commit:{db.name}"))
        yield db

    with patch("app.database.AsyncSessionFactory", new=factory):
        yield


class _RepoMethod:
    """A fake repository method that logs the DB session it ran in."""

    def __init__(self, log: list[str], name: str, error: Exception | None = None) -> None:
        self.log = log
        self.name = name
        self.error = error
        self.calls: list[tuple[tuple[Any, ...], dict[str, Any]]] = []

    def fake(self) -> Callable[..., Awaitable[None]]:
        recorder = self

        # A plain function, so the repository instance is bound as `repo`.
        async def method(repo: Any, *args: Any, **kwargs: Any) -> None:
            recorder.calls.append((args, kwargs))
            recorder.log.append(f"{recorder.name}:{repo.session.name}")
            if recorder.error is not None:
                raise recorder.error

        return method


async def _drain(gen: AsyncIterator[str], log: list[str]) -> list[dict[str, Any]]:
    """Consume an SSE generator, logging each event type as it is sent."""
    events = []
    async for chunk in gen:
        event = json.loads(chunk.removeprefix("data: "))
        log.append(event["type"])
        events.append(event)
    return events


def _assert_order(log: list[str], *entries: str) -> None:
    positions = [log.index(entry) for entry in entries]
    assert positions == sorted(positions), log


def _stream_of(*chunks: str, error: Exception | None = None) -> Callable[..., AsyncIterator[str]]:
    async def stream(*_args: Any, **_kwargs: Any) -> AsyncIterator[str]:
        for chunk in chunks:
            yield chunk
        if error is not None:
            raise error

    return stream


def _ids() -> tuple[uuid.UUID, uuid.UUID]:
    return uuid.uuid4(), uuid.uuid4()


def _question_kwargs(session_id: uuid.UUID, user_id: uuid.UUID) -> dict[str, Any]:
    return {
        "session_id": session_id,
        "user_id": user_id,
        "turn_number": 1,
        "session_type": "general",
        "language": "ja",
        "target_role": None,
        "target_company": None,
        "candidate_profile": None,
        "conversation_history": [],
    }


def _turn_kwargs(session_id: uuid.UUID, user_id: uuid.UUID) -> dict[str, Any]:
    return {
        "session_id": session_id,
        "user_id": user_id,
        "answer": "私はエンジニアです。",
        "last_question": "自己紹介をお願いします。",
        "turn_number": 2,
        "session_type": "general",
        "language": "ja",
        "target_role": None,
        "target_company": None,
        "conversation_history": [],
    }


def _summary_kwargs(session_id: uuid.UUID, user_id: uuid.UUID) -> dict[str, Any]:
    return {
        "session_id": session_id,
        "user_id": user_id,
        "session_type": "general",
        "target_role": None,
        "conversation_history": [],
        "per_answer_scores": [],
    }


_EVALUATION = {
    "keigo_score": 70,
    "content_relevance": 80,
    "specificity_score": 60,
    "grammar_issues": [],
    "positive_feedback": "Clear.",
    "improvement_tip": "Add an example.",
}


def _turn_response(next_question: str = "次の質問です。") -> tuple[str, int, int]:
    return json.dumps({"evaluation": _EVALUATION, "next_question": next_question}), 100, 50


_SUMMARY = {
    "overall_score": 72,
    "feedback_summary": "Clear answers.",
    "top_strengths": ["Structure"],
    "top_improvements": ["Keigo"],
}


# ---------------------------------------------------------------------------
# First question
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_first_question_is_saved_before_done() -> None:
    session_id, user_id = _ids()
    log: list[str] = []
    add_turn = _RepoMethod(log, "add_interviewer_turn")
    abandon = _RepoMethod(log, "abandon")

    with (
        _fake_db(log),
        patch(_STREAM, new=_stream_of("自己", "紹介を")),
        patch(f"{_QUESTION_REPO}.add_interviewer_turn", new=add_turn.fake()),
        patch(f"{_SESSION_REPO}.abandon", new=abandon.fake()),
        patch(_RECORD_USAGE, new=AsyncMock()),
    ):
        events = await _drain(_stream_question(**_question_kwargs(session_id, user_id)), log)

    assert [e["type"] for e in events] == ["token", "token", "done"]
    _assert_order(log, "add_interviewer_turn:db1", "commit:db1", "done")
    assert add_turn.calls == [((), {"session_id": session_id, "content": "自己紹介を"})]
    assert abandon.calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "stream",
    [
        pytest.param(_stream_of("部分", error=AIError("boom")), id="ai-error"),
        pytest.param(_stream_of("  ", "\n"), id="empty-text"),
    ],
)
async def test_failed_first_question_abandons_the_session(
    stream: Callable[..., AsyncIterator[str]],
) -> None:
    """Otherwise the session stays active with no question to answer."""
    session_id, user_id = _ids()
    log: list[str] = []
    add_turn = _RepoMethod(log, "add_interviewer_turn")
    abandon = _RepoMethod(log, "abandon")

    with (
        _fake_db(log),
        patch(_STREAM, new=stream),
        patch(f"{_QUESTION_REPO}.add_interviewer_turn", new=add_turn.fake()),
        patch(f"{_SESSION_REPO}.abandon", new=abandon.fake()),
        patch(_RECORD_USAGE, new=AsyncMock()),
    ):
        events = await _drain(_stream_question(**_question_kwargs(session_id, user_id)), log)

    assert events[-1]["type"] == "error"
    assert "done" not in log
    _assert_order(log, "abandon:db1", "commit:db1", "error")
    assert abandon.calls == [((session_id, user_id), {})]
    assert add_turn.calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize("failing", ["add_interviewer_turn", "record_usage"])
async def test_first_question_save_failure_abandons_and_sends_an_error(failing: str) -> None:
    """The question already streamed, but nothing was saved to answer."""
    session_id, user_id = _ids()
    log: list[str] = []
    boom = RuntimeError("db down")
    add_turn = _RepoMethod(
        log, "add_interviewer_turn", boom if failing == "add_interviewer_turn" else None
    )
    abandon = _RepoMethod(log, "abandon")
    record = AsyncMock(side_effect=boom if failing == "record_usage" else None)

    with (
        _fake_db(log),
        patch(_STREAM, new=_stream_of("自己紹介を")),
        patch(f"{_QUESTION_REPO}.add_interviewer_turn", new=add_turn.fake()),
        patch(f"{_SESSION_REPO}.abandon", new=abandon.fake()),
        patch(_RECORD_USAGE, new=record),
    ):
        events = await _drain(_stream_question(**_question_kwargs(session_id, user_id)), log)

    assert [e["type"] for e in events] == ["token", "error"]
    assert "commit:db1" not in log
    _assert_order(log, "abandon:db2", "commit:db2", "error")
    assert abandon.calls == [((session_id, user_id), {})]


@pytest.mark.asyncio
async def test_abandon_failure_still_sends_the_error_event() -> None:
    """A DB failure while abandoning must not hide the error from the client."""
    session_id, user_id = _ids()
    log: list[str] = []
    abandon = _RepoMethod(log, "abandon", RuntimeError("db down"))

    with (
        _fake_db(log),
        patch(_STREAM, new=_stream_of(error=AIError("boom"))),
        patch(f"{_SESSION_REPO}.abandon", new=abandon.fake()),
    ):
        events = await _drain(_stream_question(**_question_kwargs(session_id, user_id)), log)

    assert [e["type"] for e in events] == ["error"]
    assert abandon.calls == [((session_id, user_id), {})]


# ---------------------------------------------------------------------------
# Answer turn: evaluation + next question
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_turn_is_saved_together_before_done() -> None:
    session_id, user_id = _ids()
    log: list[str] = []
    add_user = _RepoMethod(log, "add_user_turn")
    add_question = _RepoMethod(log, "add_interviewer_turn")

    with (
        _fake_db(log),
        patch(_GENERATE, new=AsyncMock(return_value=_turn_response())),
        patch(f"{_QUESTION_REPO}.add_user_turn", new=add_user.fake()),
        patch(f"{_QUESTION_REPO}.add_interviewer_turn", new=add_question.fake()),
        patch(_RECORD_USAGE, new=AsyncMock()),
    ):
        events = await _drain(_stream_eval_and_question(**_turn_kwargs(session_id, user_id)), log)

    assert [e["type"] for e in events] == ["eval", "token", "done"]
    _assert_order(log, "add_user_turn:db1", "add_interviewer_turn:db1", "commit:db1", "done")
    assert log.count("commit:db1") == 1
    assert add_user.calls == [
        (
            (),
            {
                "session_id": session_id,
                "content": "私はエンジニアです。",
                "language": "ja",
                "ai_evaluation": _EVALUATION,
            },
        )
    ]
    assert add_question.calls == [((), {"session_id": session_id, "content": "次の質問です。"})]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "generate",
    [
        pytest.param(AsyncMock(side_effect=AIError("boom")), id="ai-error"),
        pytest.param(AsyncMock(return_value=("not json", 10, 5)), id="malformed-json"),
        pytest.param(AsyncMock(return_value=_turn_response("   ")), id="empty-question"),
    ],
)
async def test_failed_turn_saves_nothing(generate: AsyncMock) -> None:
    """The client puts the answer back to resend, so nothing may be saved."""
    session_id, user_id = _ids()
    log: list[str] = []
    add_user = _RepoMethod(log, "add_user_turn")

    with (
        _fake_db(log),
        patch(_GENERATE, new=generate),
        patch(f"{_QUESTION_REPO}.add_user_turn", new=add_user.fake()),
    ):
        events = await _drain(_stream_eval_and_question(**_turn_kwargs(session_id, user_id)), log)

    assert [e["type"] for e in events] == ["error"]
    assert add_user.calls == []
    assert not any(entry.startswith("commit") for entry in log)


@pytest.mark.asyncio
async def test_turn_save_failure_sends_an_error_instead_of_done() -> None:
    session_id, user_id = _ids()
    log: list[str] = []

    with (
        _fake_db(log),
        patch(_GENERATE, new=AsyncMock(return_value=_turn_response())),
        patch(f"{_QUESTION_REPO}.add_user_turn", new=_RepoMethod(log, "add_user_turn").fake()),
        patch(
            f"{_QUESTION_REPO}.add_interviewer_turn",
            new=_RepoMethod(log, "add_interviewer_turn", RuntimeError("db down")).fake(),
        ),
    ):
        events = await _drain(_stream_eval_and_question(**_turn_kwargs(session_id, user_id)), log)

    assert [e["type"] for e in events] == ["eval", "token", "error"]
    assert not any(entry.startswith("commit") for entry in log)


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_summary_is_sent_after_the_session_is_completed() -> None:
    session_id, user_id = _ids()
    log: list[str] = []
    complete = _RepoMethod(log, "complete")

    with (
        _fake_db(log),
        patch(_GENERATE, new=AsyncMock(return_value=(json.dumps(_SUMMARY), 100, 50))),
        patch(f"{_SESSION_REPO}.complete", new=complete.fake()),
        patch(_RECORD_USAGE, new=AsyncMock()),
    ):
        events = await _drain(_stream_summary(**_summary_kwargs(session_id, user_id)), log)

    assert [e["type"] for e in events] == ["summary", "done"]
    assert events[0]["content"] == _SUMMARY
    _assert_order(log, "complete:db1", "commit:db1", "summary")
    assert complete.calls == [
        (
            (),
            {
                "session_id": session_id,
                "overall_score": 72.0,
                "feedback_summary": "Clear answers.",
            },
        )
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "generate",
    [
        pytest.param(AsyncMock(side_effect=AIError("boom")), id="ai-error"),
        pytest.param(AsyncMock(return_value=("not json", 10, 5)), id="malformed-json"),
    ],
)
async def test_failed_summary_leaves_the_session_active(generate: AsyncMock) -> None:
    """The client keeps the End button so the user can retry."""
    session_id, user_id = _ids()
    log: list[str] = []
    complete = _RepoMethod(log, "complete")

    with (
        _fake_db(log),
        patch(_GENERATE, new=generate),
        patch(f"{_SESSION_REPO}.complete", new=complete.fake()),
    ):
        events = await _drain(_stream_summary(**_summary_kwargs(session_id, user_id)), log)

    assert [e["type"] for e in events] == ["error"]
    assert complete.calls == []
    assert not any(entry.startswith("commit") for entry in log)


@pytest.mark.asyncio
async def test_summary_save_failure_sends_an_error_without_the_summary() -> None:
    """Sending the summary would hide End for a session that is still active."""
    session_id, user_id = _ids()
    log: list[str] = []

    with (
        _fake_db(log),
        patch(_GENERATE, new=AsyncMock(return_value=(json.dumps(_SUMMARY), 100, 50))),
        patch(
            f"{_SESSION_REPO}.complete",
            new=_RepoMethod(log, "complete", RuntimeError("db down")).fake(),
        ),
    ):
        events = await _drain(_stream_summary(**_summary_kwargs(session_id, user_id)), log)

    assert [e["type"] for e in events] == ["error"]
    assert not any(entry.startswith("commit") for entry in log)
