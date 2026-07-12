"""
AIClient — single access point for the Google Gemini API.

Uses the new google-genai SDK (google.genai package).
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncGenerator

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)

_RETRY_DELAYS = (1.0, 2.0, 4.0)

_client = genai.Client(api_key=settings.gemini_api_key)


class AIError(Exception):
    """Raised when all retries are exhausted."""


class AIClient:
    def __init__(self) -> None:
        self._model = settings.gemini_default_model

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        max_tokens: int,
        feature: str = "unknown",
        json_mode: bool = False,
    ) -> tuple[str, int, int]:
        safe_user = f"<user_content>{user_prompt}</user_content>"
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=max_tokens,
            response_mime_type="application/json" if json_mode else "text/plain",
            # Gemini 2.5 models default to a *dynamic* thinking budget, and
            # those reasoning tokens count against max_output_tokens — on a
            # hard input the model can burn most of the budget "thinking"
            # and leave too little for the actual JSON, truncating it
            # (intermittently, since the thinking token spend varies per
            # call). These are structured extraction/scoring tasks, not
            # tasks that benefit from extended reasoning, so disable it.
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        )
        last_exc: Exception | None = None

        for attempt, delay in enumerate((*_RETRY_DELAYS, None), start=1):
            try:
                t0 = time.monotonic()
                response = await asyncio.to_thread(
                    _client.models.generate_content,
                    model=self._model,
                    contents=safe_user,
                    config=config,
                )
                latency_ms = int((time.monotonic() - t0) * 1000)
                text = response.text or ""
                if response.candidates and response.candidates[0].finish_reason == "MAX_TOKENS":
                    logger.warning(
                        "Gemini response truncated by max_output_tokens=%d for feature=%s "
                        "— output is likely incomplete/invalid JSON",
                        max_tokens,
                        feature,
                    )
                input_tokens = (
                    response.usage_metadata.prompt_token_count or 0
                    if response.usage_metadata
                    else 0
                )
                output_tokens = (
                    response.usage_metadata.candidates_token_count or 0
                    if response.usage_metadata
                    else 0
                )
                thoughts_tokens = (
                    response.usage_metadata.thoughts_token_count or 0
                    if response.usage_metadata
                    else 0
                )
                logger.debug(
                    "AI generate: feature=%s attempt=%d latency=%dms tokens=%d+%d thoughts=%d",
                    feature,
                    attempt,
                    latency_ms,
                    input_tokens,
                    output_tokens,
                    thoughts_tokens,
                )
                return text, input_tokens, output_tokens
            except Exception as exc:
                last_exc = exc
                logger.warning(
                    "Gemini error on attempt %d for feature=%s: %s", attempt, feature, exc
                )
                if delay is not None:
                    await asyncio.sleep(delay)

        raise AIError(f"All Gemini retries exhausted for feature={feature}") from last_exc

    async def stream(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        max_tokens: int,
        feature: str = "unknown",
    ) -> AsyncGenerator[str, None]:
        safe_user = f"<user_content>{user_prompt}</user_content>"
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=max_tokens,
        )

        try:
            async for chunk in await _client.aio.models.generate_content_stream(
                model=self._model,
                contents=safe_user,
                config=config,
            ):
                if chunk.text:
                    yield chunk.text
        except Exception as exc:
            logger.warning("Gemini stream error for feature=%s: %s", feature, exc)
            raise AIError(f"Gemini stream failed for feature={feature}") from exc


ai_client = AIClient()
