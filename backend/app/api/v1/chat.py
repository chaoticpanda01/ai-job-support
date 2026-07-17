"""
AI Chatbot endpoint.

POST /chat/message — send a message, get a response from Gemini.

Maintains a short conversation history in the request body (last 10 messages).
No persistence — history is managed client-side.
"""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.config import settings
from app.dependencies import AuthUser, DbSession
from app.services.ai.client import AIError, ai_client
from app.services.ai.usage_tracker import AIBudgetError, usage_tracker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

SYSTEM_PROMPT = """You are a helpful assistant for Japan Job Support, a platform that helps
Indonesian professionals find employment in Japan.

You specialize in:
- Japanese workplace culture and etiquette (報連相, keigo, nemawashi, etc.)
- Japan work visa types and application processes
- Japanese resume writing (履歴書, 職務経歴書)
- Job hunting strategies for the Japanese market
- Japanese language tips for the workplace
- Indonesian-to-Japan career transition advice

Always respond in the same language the user writes in:
- If they write in Indonesian (Bahasa Indonesia), reply in Indonesian
- If they write in English, reply in English
- If they write in Japanese, reply in Japanese

Keep responses concise and practical. If a question is outside your area of expertise
(Japan jobs / career / culture), politely redirect the user back to relevant topics.
"""


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str = Field(max_length=8000)


class ChatRequest(BaseModel):
    # Bounds per-call Gemini input cost; the call-count quota alone can't (a
    # single call could otherwise carry a near-context-window payload).
    message: str = Field(min_length=1, max_length=8000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)


class ChatResponse(BaseModel):
    reply: str


@router.post("/message", response_model=ChatResponse)
async def chat_message(
    body: ChatRequest,
    current_user: AuthUser,
    db: DbSession,
) -> ChatResponse:
    try:
        await usage_tracker.check_budget(current_user.user_id, "chatbot", db)
    except AIBudgetError as exc:
        raise exc.to_http_exception() from exc

    # Build conversation context from history (last 10 messages)
    history_text = ""
    for msg in body.history[-10:]:
        role_label = "User" if msg.role == "user" else "Assistant"
        history_text += f"{role_label}: {msg.content}\n"

    user_prompt = f"{history_text}User: {body.message}"

    t0 = time.monotonic()
    try:
        reply, input_tokens, output_tokens = await ai_client.generate(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=user_prompt,
            max_tokens=1000,
            feature="chatbot",
        )
    except AIError as exc:
        logger.error("Chatbot AI error: %s", exc)
        return ChatResponse(
            reply="Sorry, I'm having trouble connecting right now. Please try again in a moment."
        )

    await usage_tracker.record(
        user_id=current_user.user_id,
        feature="chatbot",
        model=settings.gemini_default_model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=int((time.monotonic() - t0) * 1000),
        db=db,
    )

    return ChatResponse(reply=reply)
