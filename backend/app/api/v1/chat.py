"""
AI Chatbot endpoint.

POST /chat/message — send a message, get a response from Gemini.

Maintains a short conversation history in the request body (last 10 messages).
No persistence — history is managed client-side.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.ai.client import AIError, ai_client

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
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str


@router.post("/message", response_model=ChatResponse)
async def chat_message(body: ChatRequest) -> ChatResponse:
    # Build conversation context from history (last 10 messages)
    history_text = ""
    for msg in body.history[-10:]:
        role_label = "User" if msg.role == "user" else "Assistant"
        history_text += f"{role_label}: {msg.content}\n"

    user_prompt = f"{history_text}User: {body.message}"

    try:
        reply, _, _ = await ai_client.generate(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=user_prompt,
            max_tokens=1000,
            feature="chatbot",
        )
    except AIError as exc:
        logger.error("Chatbot AI error: %s", exc)
        reply = "Sorry, I'm having trouble connecting right now. Please try again in a moment."

    return ChatResponse(reply=reply)
