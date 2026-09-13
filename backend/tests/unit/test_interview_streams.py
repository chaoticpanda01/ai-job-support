"""
Unit tests for the interview SSE generators.

The client acts on "done" (it opens or refetches the session page) and on
"summary" (it treats the session as over), so the rows those events describe
must be committed before the events are sent. DB and Gemini are mocked.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator, Callable, Iterator
from contextlib import asynccontextmanager, contextmanager
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.api.v1.interview import _stream_question, _stream_summary
from app.services.ai.client import AIError


@contextmanager
def _fake_db(log: list[str]) -> Iterator[None]:
    """Patch AsyncSessionFactory with a session whose commits are logged."""
    db = MagicMock()
    db.commit = AsyncMock(side_effect=lambda: log.append("commit"))

    @asynccontextmanager
    async def factory() -> AsyncIterator[MagicMock]:
        yield db

    with patch("app.database.AsyncSessionFactory", new=factory):
        yield


async def _drain(gen: AsyncIterator[str], log: list[str]) -> list[dict[str, Any]]:
    """Consume an SSE generator, logging each event type as it is sent."""
    events = []
    async for chunk in gen:
        event = json.loads(chunk.removeprefix("data: "))
        log.append(event["type"])
        events.append(event)
    return events


def _stream_of(*chunks: str, error: Exception | None = None) -> Callable[..., AsyncIterator[str]]:
    async def stream(*_args: Any, **_kwargs: Any) -> AsyncIterator[str]:
        for chunk in chunks:
            yield chunk
        if error is not None:
            raise error

    return stream


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


def _summary_kwargs(session_id: uuid.UUID, user_id: uuid.UUID) -> dict[str, Any]:
    return {
        "session_id": session_id,
        "user_id": user_id,
        "session_type": "general",
        "target_role": None,
        "conversation_history": [],
        "per_answer_scores": [],
    }


@pytest.mark.asyncio
async def test_first_question_is_saved_before_done() -> None:
    session_id, user_id = uuid.uuid4(), uuid.uuid4()
    log: list[str] = []
    add_turn = AsyncMock(side_effect=lambda **_: log.append("add_interviewer_turn"))
    abandon = AsyncMock()

    with (
        _fake_db(log),
        patch("app.services.ai.client.ai_client.stream", new=_stream_of("自己", "紹介を")),
        patch(
            "app.repositories.interview.InterviewMessageRepository.add_interviewer_turn",
            new=add_turn,
        ),
        patch("app.repositories.interview.InterviewSessionRepository.abandon", new=abandon),
        patch("app.services.ai.usage_tracker.usage_tracker.record", new=AsyncMock()),
    ):
        events = await _drain(_stream_question(**_question_kwargs(session_id, user_id)), log)

    assert [e["type"] for e in events] == ["token", "token", "done"]
    assert log.index("add_interviewer_turn") < log.index("commit") < log.index("done")
    add_turn.assert_awaited_once_with(session_id=session_id, content="自己紹介を")
    abandon.assert_not_awaited()


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
    session_id, user_id = uuid.uuid4(), uuid.uuid4()
    log: list[str] = []
    add_turn = AsyncMock()
    abandon = AsyncMock(side_effect=lambda *_: log.append("abandon"))

    with (
        _fake_db(log),
        patch("app.services.ai.client.ai_client.stream", new=stream),
        patch(
            "app.repositories.interview.InterviewMessageRepository.add_interviewer_turn",
            new=add_turn,
        ),
        patch("app.repositories.interview.InterviewSessionRepository.abandon", new=abandon),
        patch("app.services.ai.usage_tracker.usage_tracker.record", new=AsyncMock()),
    ):
        events = await _drain(_stream_question(**_question_kwargs(session_id, user_id)), log)

    assert events[-1]["type"] == "error"
    assert "done" not in log
    assert log.index("abandon") < log.index("commit") < log.index("error")
    abandon.assert_awaited_once_with(session_id, user_id)
    add_turn.assert_not_awaited()


@pytest.mark.asyncio
async def test_abandon_failure_still_sends_the_error_event() -> None:
    session_id, user_id = uuid.uuid4(), uuid.uuid4()
    log: list[str] = []

    with (
        _fake_db(log),
        patch("app.services.ai.client.ai_client.stream", new=_stream_of(error=AIError("boom"))),
        patch(
            "app.repositories.interview.InterviewSessionRepository.abandon",
            new=AsyncMock(side_effect=RuntimeError("db down")),
        ),
    ):
        events = await _drain(_stream_question(**_question_kwargs(session_id, user_id)), log)

    assert [e["type"] for e in events] == ["error"]


@pytest.mark.asyncio
async def test_summary_is_sent_after_the_session_is_completed() -> None:
    session_id, user_id = uuid.uuid4(), uuid.uuid4()
    log: list[str] = []
    summary = {
        "overall_score": 72,
        "feedback_summary": "Clear answers.",
        "top_strengths": ["Structure"],
        "top_improvements": ["Keigo"],
    }
    complete = AsyncMock(side_effect=lambda **_: log.append("complete"))

    with (
        _fake_db(log),
        patch(
            "app.services.ai.client.ai_client.generate",
            new=AsyncMock(return_value=(json.dumps(summary), 100, 50)),
        ),
        patch("app.repositories.interview.InterviewSessionRepository.complete", new=complete),
        patch("app.services.ai.usage_tracker.usage_tracker.record", new=AsyncMock()),
    ):
        events = await _drain(_stream_summary(**_summary_kwargs(session_id, user_id)), log)

    assert [e["type"] for e in events] == ["summary", "done"]
    assert events[0]["content"] == summary
    assert log.index("complete") < log.index("commit") < log.index("summary")
    complete.assert_awaited_once_with(
        session_id=session_id, overall_score=72.0, feedback_summary="Clear answers."
    )


@pytest.mark.asyncio
async def test_failed_summary_leaves_the_session_active() -> None:
    """The client keeps the End button so the user can retry."""
    session_id, user_id = uuid.uuid4(), uuid.uuid4()
    log: list[str] = []
    complete = AsyncMock()

    with (
        _fake_db(log),
        patch(
            "app.services.ai.client.ai_client.generate",
            new=AsyncMock(side_effect=AIError("boom")),
        ),
        patch("app.repositories.interview.InterviewSessionRepository.complete", new=complete),
    ):
        events = await _drain(_stream_summary(**_summary_kwargs(session_id, user_id)), log)

    assert [e["type"] for e in events] == ["error"]
    complete.assert_not_awaited()
    assert "commit" not in log
