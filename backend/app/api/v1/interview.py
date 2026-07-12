"""
Interview practice endpoints.

POST   /interview/sessions                     — create a new session + stream first question
POST   /interview/sessions/{id}/message        — send user answer + stream eval + next question
GET    /interview/sessions/{id}                — get session with full message history
PUT    /interview/sessions/{id}/end            — end session + stream summary feedback
GET    /interview/sessions                     — list completed sessions

SSE event protocol:
  data: {"type": "token",   "content": "<text chunk>"}
  data: {"type": "eval",    "content": <InterviewEvalResult JSON>}
  data: {"type": "summary", "content": <InterviewSummaryResult JSON>}
  data: {"type": "done"}
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.dependencies import AuthUser, DbSession, PaginationDep
from app.repositories.interview import InterviewMessageRepository, InterviewSessionRepository
from app.repositories.user import ProfileRepository
from app.schemas.interview import (
    CreateSessionRequest,
    InterviewSessionDetailResponse,
    InterviewSessionResponse,
    SendMessageRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/interview", tags=["interview"])

_QUESTION_MAX_TOKENS = 800
_EVAL_MAX_TOKENS = 2048
_SUMMARY_MAX_TOKENS = 800

# Cap conversation history sent to Claude — keeps context window predictable
_HISTORY_WINDOW = 20


# ---------------------------------------------------------------------------
# Create session + stream first question
# ---------------------------------------------------------------------------


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_session(
    body: CreateSessionRequest,
    current_user: AuthUser,
    db: DbSession,
) -> StreamingResponse:
    """
    Create a new interview session and immediately stream the first question.
    Returns text/event-stream — client reads SSE tokens then a 'done' event.
    """
    from app.services.ai.usage_tracker import AIBudgetError, usage_tracker

    # Budget check before creating anything
    try:
        await usage_tracker.check_budget(current_user.user_id, "interview_message", db)
    except AIBudgetError as exc:
        raise exc.to_http_exception() from exc

    # Load candidate profile for richer question context
    profile_repo = ProfileRepository(db)
    profile = await profile_repo.get_by_user_id(current_user.user_id)
    candidate_profile: dict[str, Any] | None = None
    if profile:
        candidate_profile = {
            "japanese_level": profile.japanese_level.value,
            "years_experience": profile.years_experience,
            "target_industry": profile.target_industry,
        }

    # Create session row
    sess_repo = InterviewSessionRepository(db)
    session = await sess_repo.create(
        user_id=current_user.user_id,
        session_type=body.session_type,
        target_role=body.target_role,
        target_company=body.target_company,
        language=body.language,
    )
    await db.commit()
    await db.refresh(session)

    session_id = session.id
    user_id = current_user.user_id

    return StreamingResponse(
        _stream_question(
            session_id=session_id,
            user_id=user_id,
            turn_number=1,
            session_type=body.session_type,
            language=body.language,
            target_role=body.target_role,
            target_company=body.target_company,
            candidate_profile=candidate_profile,
            conversation_history=[],
        ),
        media_type="text/event-stream",
        headers={
            "X-Session-Id": str(session_id),
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Send user answer + stream eval + next question
# ---------------------------------------------------------------------------


@router.post("/sessions/{session_id}/message")
async def send_message(
    session_id: UUID,
    body: SendMessageRequest,
    current_user: AuthUser,
    db: DbSession,
) -> StreamingResponse:
    """
    Submit the candidate's answer. Streams:
      1. Per-answer evaluation ({"type": "eval", "content": {...}})
      2. Next interviewer question ({"type": "token", "content": "..."} chunks)
      3. {"type": "done"}
    """
    from app.services.ai.usage_tracker import AIBudgetError, usage_tracker

    sess_repo = InterviewSessionRepository(db)
    session = await sess_repo.get_active(session_id, current_user.user_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active interview session not found",
        )

    try:
        await usage_tracker.check_budget(current_user.user_id, "interview_message", db)
    except AIBudgetError as exc:
        raise exc.to_http_exception() from exc

    # Fetch recent history for context
    msg_repo = InterviewMessageRepository(db)
    history_rows = await msg_repo.get_last_n(session_id, _HISTORY_WINDOW)
    conversation_history = [
        {"role": row.role.value, "content": row.content} for row in history_rows
    ]

    # The last interviewer message is the question being answered
    last_question = next(
        (m["content"] for m in reversed(conversation_history) if m["role"] == "interviewer"),
        "",
    )

    turn_number = sum(1 for m in conversation_history if m["role"] == "user") + 2

    return StreamingResponse(
        _stream_eval_and_question(
            session_id=session_id,
            user_id=current_user.user_id,
            answer=body.content,
            last_question=last_question,
            turn_number=turn_number,
            session_type=session.session_type.value,
            language=session.language.value,
            target_role=session.target_role,
            target_company=session.target_company,
            conversation_history=conversation_history,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# End session + stream summary
# ---------------------------------------------------------------------------


@router.put("/sessions/{session_id}/end")
async def end_session(
    session_id: UUID,
    current_user: AuthUser,
    db: DbSession,
) -> StreamingResponse:
    """
    End an active session and stream the overall feedback summary.
    Streams {"type": "summary", "content": {...}} then {"type": "done"}.
    """
    from app.services.ai.usage_tracker import AIBudgetError, usage_tracker

    sess_repo = InterviewSessionRepository(db)
    session = await sess_repo.get_active(session_id, current_user.user_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active interview session not found",
        )

    try:
        await usage_tracker.check_budget(current_user.user_id, "interview_message", db)
    except AIBudgetError as exc:
        raise exc.to_http_exception() from exc

    msg_repo = InterviewMessageRepository(db)
    all_messages = await msg_repo.list_for_session(session_id)

    conversation_history = [{"role": m.role.value, "content": m.content} for m in all_messages]
    per_answer_scores = [
        m.ai_evaluation
        for m in all_messages
        if m.role.value == "user" and m.ai_evaluation is not None
    ]

    return StreamingResponse(
        _stream_summary(
            session_id=session_id,
            user_id=current_user.user_id,
            session_type=session.session_type.value,
            target_role=session.target_role,
            conversation_history=conversation_history,
            per_answer_scores=per_answer_scores,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Get session with messages
# ---------------------------------------------------------------------------


@router.get("/sessions/{session_id}", response_model=InterviewSessionDetailResponse)
async def get_session(
    session_id: UUID,
    current_user: AuthUser,
    db: DbSession,
) -> InterviewSessionDetailResponse:
    sess_repo = InterviewSessionRepository(db)
    session = await sess_repo.get_with_messages(session_id, current_user.user_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return InterviewSessionDetailResponse.model_validate(session)


# ---------------------------------------------------------------------------
# List completed sessions
# ---------------------------------------------------------------------------


@router.get("/sessions", response_model=list[InterviewSessionResponse])
async def list_sessions(
    current_user: AuthUser,
    db: DbSession,
    pagination: PaginationDep,
) -> list[InterviewSessionResponse]:
    sess_repo = InterviewSessionRepository(db)
    sessions = await sess_repo.list_completed(
        current_user.user_id,
        offset=pagination.offset,
        limit=pagination.limit,
    )
    return [InterviewSessionResponse.model_validate(s) for s in sessions]


# ---------------------------------------------------------------------------
# SSE generator: first question
# ---------------------------------------------------------------------------


async def _stream_question(
    *,
    session_id: UUID,
    user_id: UUID,
    turn_number: int,
    session_type: str,
    language: str,
    target_role: str | None,
    target_company: str | None,
    candidate_profile: dict[str, Any] | None,
    conversation_history: list[dict[str, str]],
) -> AsyncGenerator[str, None]:
    from app.config import settings
    from app.database import AsyncSessionFactory
    from app.repositories.interview import InterviewMessageRepository
    from app.services.ai.client import AIError, ai_client
    from app.services.ai.prompts.interview import (
        build_question_system_prompt,
        build_question_user_prompt,
    )
    from app.services.ai.usage_tracker import usage_tracker

    system = build_question_system_prompt(session_type, language)
    user_prompt = build_question_user_prompt(
        turn_number=turn_number,
        conversation_history=conversation_history,
        target_role=target_role,
        target_company=target_company,
        candidate_profile=candidate_profile,
    )

    full_text = ""
    input_tokens = 0
    t0 = time.monotonic()

    try:
        async for chunk in ai_client.stream(
            system, user_prompt, max_tokens=_QUESTION_MAX_TOKENS, feature="interview_message"
        ):
            full_text += chunk
            yield _sse("token", chunk)
    except AIError as exc:
        logger.error("Question stream failed: session=%s error=%s", session_id, exc)
        yield _sse_error("Question generation failed. Please try again.")
        return

    yield _sse_done()
    latency_ms = int((time.monotonic() - t0) * 1000)

    # Persist the question and record usage in a fresh session
    async with AsyncSessionFactory() as db:
        msg_repo = InterviewMessageRepository(db)
        await msg_repo.add_interviewer_turn(session_id=session_id, content=full_text)
        await usage_tracker.record(
            user_id=user_id,
            feature="interview_message",
            model=settings.gemini_default_model,
            input_tokens=input_tokens,
            output_tokens=len(full_text.split()),  # approximate — stream doesn't return counts
            latency_ms=latency_ms,
            db=db,
        )
        await db.commit()


# ---------------------------------------------------------------------------
# SSE generator: evaluate answer + next question
# ---------------------------------------------------------------------------


async def _stream_eval_and_question(
    *,
    session_id: UUID,
    user_id: UUID,
    answer: str,
    last_question: str,
    turn_number: int,
    session_type: str,
    language: str,
    target_role: str | None,
    target_company: str | None,
    conversation_history: list[dict[str, str]],
) -> AsyncGenerator[str, None]:
    from app.config import settings
    from app.database import AsyncSessionFactory
    from app.repositories.interview import InterviewMessageRepository
    from app.services.ai.client import AIError, ai_client
    from app.services.ai.prompts.interview import (
        InterviewEvalResult,
        build_eval_system_prompt,
        build_eval_user_prompt,
        build_question_system_prompt,
        build_question_user_prompt,
    )
    from app.services.ai.response_parser import parse_response
    from app.services.ai.usage_tracker import usage_tracker

    t0 = time.monotonic()

    # -- Step 1: Evaluate the answer (non-streaming, returns JSON)
    eval_system = build_eval_system_prompt(language)
    eval_user = build_eval_user_prompt(question=last_question, answer=answer)

    eval_result: dict[str, Any] | None = None
    try:
        eval_text, eval_in, eval_out = await ai_client.generate(
            eval_system,
            eval_user,
            max_tokens=_EVAL_MAX_TOKENS,
            feature="interview_message",
            json_mode=True,
        )
        parsed_eval = parse_response(eval_text, InterviewEvalResult)
        eval_result = parsed_eval.model_dump()
        yield _sse("eval", eval_result)
    except Exception as exc:
        logger.warning("Eval failed for session=%s: %s — continuing without eval", session_id, exc)
        eval_in = eval_out = 0

    # -- Step 2: Persist user turn with evaluation
    updated_history = conversation_history + [{"role": "user", "content": answer}]

    async with AsyncSessionFactory() as db:
        msg_repo = InterviewMessageRepository(db)
        await msg_repo.add_user_turn(
            session_id=session_id,
            content=answer,
            language=language,
            ai_evaluation=eval_result,
        )
        await db.commit()

    # -- Step 3: Stream next question
    q_system = build_question_system_prompt(session_type, language)
    q_user = build_question_user_prompt(
        turn_number=turn_number,
        conversation_history=updated_history,
        target_role=target_role,
        target_company=target_company,
    )

    full_question = ""
    try:
        async for chunk in ai_client.stream(
            q_system, q_user, max_tokens=_QUESTION_MAX_TOKENS, feature="interview_message"
        ):
            full_question += chunk
            yield _sse("token", chunk)
    except AIError as exc:
        logger.error("Question stream failed after eval: session=%s error=%s", session_id, exc)
        yield _sse_error("Question generation failed. Please try again.")
        return

    yield _sse_done()
    latency_ms = int((time.monotonic() - t0) * 1000)

    # -- Persist next question + usage
    async with AsyncSessionFactory() as db:
        msg_repo = InterviewMessageRepository(db)
        await msg_repo.add_interviewer_turn(session_id=session_id, content=full_question)
        await usage_tracker.record(
            user_id=user_id,
            feature="interview_message",
            model=settings.gemini_default_model,
            input_tokens=eval_in,
            output_tokens=eval_out + len(full_question.split()),
            latency_ms=latency_ms,
            db=db,
        )
        await db.commit()


# ---------------------------------------------------------------------------
# SSE generator: end-of-session summary
# ---------------------------------------------------------------------------


async def _stream_summary(
    *,
    session_id: UUID,
    user_id: UUID,
    session_type: str,
    target_role: str | None,
    conversation_history: list[dict[str, str]],
    per_answer_scores: list[dict[str, Any]],
) -> AsyncGenerator[str, None]:
    from app.config import settings
    from app.database import AsyncSessionFactory
    from app.repositories.interview import InterviewSessionRepository
    from app.services.ai.client import ai_client
    from app.services.ai.prompts.interview import (
        InterviewSummaryResult,
        build_summary_system_prompt,
        build_summary_user_prompt,
    )
    from app.services.ai.response_parser import parse_response
    from app.services.ai.usage_tracker import usage_tracker

    t0 = time.monotonic()
    system = build_summary_system_prompt()
    user_prompt = build_summary_user_prompt(
        session_type=session_type,
        target_role=target_role,
        conversation_history=conversation_history,
        per_answer_scores=per_answer_scores,
    )

    try:
        summary_text, in_tok, out_tok = await ai_client.generate(
            system,
            user_prompt,
            max_tokens=_SUMMARY_MAX_TOKENS,
            feature="interview_message",
            json_mode=True,
        )
        parsed_summary = parse_response(summary_text, InterviewSummaryResult)
    except Exception as exc:
        logger.error("Summary generation failed: session=%s error=%s", session_id, exc)
        yield _sse_error("Summary generation failed.")
        return

    yield _sse("summary", parsed_summary.model_dump())
    yield _sse_done()

    latency_ms = int((time.monotonic() - t0) * 1000)

    async with AsyncSessionFactory() as db:
        sess_repo = InterviewSessionRepository(db)
        await sess_repo.complete(
            session_id=session_id,
            overall_score=float(parsed_summary.overall_score),
            feedback_summary=parsed_summary.feedback_summary,
        )
        await usage_tracker.record(
            user_id=user_id,
            feature="interview_message",
            model=settings.gemini_default_model,
            input_tokens=in_tok,
            output_tokens=out_tok,
            latency_ms=latency_ms,
            db=db,
        )
        await db.commit()


# ---------------------------------------------------------------------------
# SSE formatting helpers
# ---------------------------------------------------------------------------


def _sse(event_type: str, content: str | dict[str, Any]) -> str:
    payload = json.dumps({"type": event_type, "content": content}, ensure_ascii=False)
    return f"data: {payload}\n\n"


def _sse_done() -> str:
    return f"data: {json.dumps({'type': 'done'})}\n\n"


def _sse_error(message: str) -> str:
    payload = json.dumps({"type": "error", "content": message})
    return f"data: {payload}\n\n"
