"""Unit tests for AIClient."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from anthropic import APIStatusError, RateLimitError
from app.services.ai.client import AIClient, AIError, _extract_text

# ---------------------------------------------------------------------------
# _extract_text helper
# ---------------------------------------------------------------------------


def test_extract_text_returns_first_text_block() -> None:
    block = MagicMock()
    block.type = "text"
    block.text = "hello"
    response = MagicMock()
    response.content = [block]
    assert _extract_text(response) == "hello"


def test_extract_text_returns_empty_for_no_text_block() -> None:
    block = MagicMock()
    block.type = "tool_use"
    response = MagicMock()
    response.content = [block]
    assert _extract_text(response) == ""


# ---------------------------------------------------------------------------
# generate — success
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_returns_text_and_tokens() -> None:
    mock_block = MagicMock()
    mock_block.type = "text"
    mock_block.text = '{"japan_market_score": 75}'

    mock_response = MagicMock()
    mock_response.content = [mock_block]
    mock_response.usage.input_tokens = 100
    mock_response.usage.output_tokens = 50

    client = AIClient.__new__(AIClient)
    client._model = "claude-sonnet-4-6"
    client._anthropic = MagicMock()
    client._anthropic.messages.create = AsyncMock(return_value=mock_response)

    text, inp, out = await client.generate("system", "user content", max_tokens=1500)

    assert text == '{"japan_market_score": 75}'
    assert inp == 100
    assert out == 50


# ---------------------------------------------------------------------------
# generate — wraps user content in XML tags
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_wraps_user_prompt_in_xml() -> None:
    captured: list[dict] = []

    mock_block = MagicMock()
    mock_block.type = "text"
    mock_block.text = "ok"
    mock_response = MagicMock()
    mock_response.content = [mock_block]
    mock_response.usage.input_tokens = 10
    mock_response.usage.output_tokens = 5

    async def fake_create(**kwargs):  # type: ignore[no-untyped-def]
        captured.append(kwargs)
        return mock_response

    client = AIClient.__new__(AIClient)
    client._model = "test-model"
    client._anthropic = MagicMock()
    client._anthropic.messages.create = fake_create

    await client.generate("sys", "raw user text", max_tokens=100)

    messages = captured[0]["messages"]
    assert "<user_content>raw user text</user_content>" in messages[0]["content"]


# ---------------------------------------------------------------------------
# generate — retries on rate limit then raises AIError
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_raises_ai_error_after_retries() -> None:
    client = AIClient.__new__(AIClient)
    client._model = "test-model"
    client._anthropic = MagicMock()
    client._anthropic.messages.create = AsyncMock(
        side_effect=RateLimitError.__new__(RateLimitError)
    )

    with (
        patch("app.services.ai.client._RETRY_DELAYS", (0.0, 0.0, 0.0)),
        patch("app.services.ai.client.asyncio.sleep", new=AsyncMock()),
        patch("app.config.settings.ai_fallback_enabled", False),
        pytest.raises(AIError),
    ):
        await client.generate("sys", "user", max_tokens=100)


# ---------------------------------------------------------------------------
# generate — non-retryable 4xx raises immediately
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_raises_immediately_on_4xx() -> None:
    client = AIClient.__new__(AIClient)
    client._model = "test-model"
    client._anthropic = MagicMock()

    exc = APIStatusError.__new__(APIStatusError)
    exc.status_code = 400
    exc.message = "Bad request"
    client._anthropic.messages.create = AsyncMock(side_effect=exc)

    with pytest.raises(AIError, match="400"):
        await client.generate("sys", "user", max_tokens=100)
