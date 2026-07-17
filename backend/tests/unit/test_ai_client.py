"""Unit tests for the Gemini-based AIClient."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.services.ai.client import AIClient, AIError


def _make_response(
    *,
    text: str = "ok",
    input_tokens: int = 10,
    output_tokens: int = 5,
    finish_reason: str = "STOP",
) -> MagicMock:
    """Build a mock google-genai response matching what generate() reads."""
    resp = MagicMock()
    resp.text = text
    candidate = MagicMock()
    candidate.finish_reason = finish_reason
    resp.candidates = [candidate]
    resp.usage_metadata.prompt_token_count = input_tokens
    resp.usage_metadata.candidates_token_count = output_tokens
    resp.usage_metadata.thoughts_token_count = 0
    return resp


# ---------------------------------------------------------------------------
# generate — success
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_returns_text_and_tokens() -> None:
    resp = _make_response(text='{"japan_market_score": 75}', input_tokens=100, output_tokens=50)
    with patch("app.services.ai.client._client") as mock_client:
        mock_client.models.generate_content.return_value = resp
        text, inp, out = await AIClient().generate("system", "user content", max_tokens=1500)

    assert text == '{"japan_market_score": 75}'
    assert inp == 100
    assert out == 50


# ---------------------------------------------------------------------------
# generate — wraps user content in XML tags (prompt-injection boundary)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_wraps_user_prompt_in_xml() -> None:
    captured: dict = {}

    def fake_generate(**kwargs):  # type: ignore[no-untyped-def]
        captured.update(kwargs)
        return _make_response()

    with patch("app.services.ai.client._client") as mock_client:
        mock_client.models.generate_content.side_effect = fake_generate
        await AIClient().generate("sys", "raw user text", max_tokens=100)

    assert captured["contents"] == "<user_content>raw user text</user_content>"


# ---------------------------------------------------------------------------
# generate — json_mode selects the JSON response mime type
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_json_mode_sets_mime_type() -> None:
    captured: dict = {}

    def fake_generate(**kwargs):  # type: ignore[no-untyped-def]
        captured.update(kwargs)
        return _make_response()

    with patch("app.services.ai.client._client") as mock_client:
        mock_client.models.generate_content.side_effect = fake_generate
        await AIClient().generate("sys", "u", max_tokens=100, json_mode=True)

    assert captured["config"].response_mime_type == "application/json"


# ---------------------------------------------------------------------------
# generate — retries on error then raises AIError
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_raises_ai_error_after_retries() -> None:
    with (
        patch("app.services.ai.client._client") as mock_client,
        patch("app.services.ai.client._RETRY_DELAYS", (0.0, 0.0, 0.0)),
        patch("app.services.ai.client.asyncio.sleep", new=AsyncMock()),
    ):
        mock_client.models.generate_content.side_effect = RuntimeError("boom")
        with pytest.raises(AIError):
            await AIClient().generate("sys", "user", max_tokens=100)


@pytest.mark.asyncio
async def test_generate_retries_then_succeeds() -> None:
    resp = _make_response(text="recovered", input_tokens=1, output_tokens=1)
    with (
        patch("app.services.ai.client._client") as mock_client,
        patch("app.services.ai.client._RETRY_DELAYS", (0.0, 0.0, 0.0)),
        patch("app.services.ai.client.asyncio.sleep", new=AsyncMock()),
    ):
        mock_client.models.generate_content.side_effect = [RuntimeError("transient"), resp]
        text, _inp, _out = await AIClient().generate("sys", "user", max_tokens=100)

    assert text == "recovered"
