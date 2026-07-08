"""Unit tests for AI response parser."""

from __future__ import annotations

import pytest
from app.services.ai.response_parser import ResponseParseError, extract_json, parse_response
from pydantic import BaseModel


class _Schema(BaseModel):
    score: int
    tags: list[str]


# ---------------------------------------------------------------------------
# extract_json
# ---------------------------------------------------------------------------


def test_extract_json_from_plain_json() -> None:
    text = '{"score": 80, "tags": ["python"]}'
    result = extract_json(text)
    assert result == {"score": 80, "tags": ["python"]}


def test_extract_json_from_fenced_block() -> None:
    text = 'Here is the result:\n```json\n{"score": 70, "tags": []}\n```'
    result = extract_json(text)
    assert result["score"] == 70


def test_extract_json_from_fenced_block_no_language() -> None:
    text = '```\n{"score": 60, "tags": ["a"]}\n```'
    result = extract_json(text)
    assert result["score"] == 60


def test_extract_json_strips_surrounding_prose() -> None:
    text = 'Analysis complete. {"score": 55, "tags": []} End of response.'
    result = extract_json(text)
    assert result["score"] == 55


def test_extract_json_raises_on_no_json() -> None:
    with pytest.raises(ResponseParseError):
        extract_json("No JSON here at all.")


def test_extract_json_raises_on_invalid_json() -> None:
    with pytest.raises(ResponseParseError):
        extract_json("{score: 80}")  # invalid JSON — unquoted key


# ---------------------------------------------------------------------------
# parse_response
# ---------------------------------------------------------------------------


def test_parse_response_validates_against_schema() -> None:
    text = '{"score": 90, "tags": ["leadership", "java"]}'
    result = parse_response(text, _Schema)
    assert result.score == 90
    assert result.tags == ["leadership", "java"]


def test_parse_response_raises_on_schema_mismatch() -> None:
    text = '{"score": "not_an_int", "tags": []}'
    with pytest.raises(ResponseParseError):
        parse_response(text, _Schema)


def test_parse_response_raises_on_missing_field() -> None:
    text = '{"score": 80}'  # missing "tags"
    with pytest.raises(ResponseParseError):
        parse_response(text, _Schema)
