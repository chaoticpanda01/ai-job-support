"""
Extracts and validates structured JSON from Gemini's text output.

Gemini sometimes wraps JSON in markdown code fences (```json … ```).
The parser strips those, then validates the dict against a Pydantic model
before any data is written to the database.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Matches ```json … ``` or ``` … ``` code fences
_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


class ResponseParseError(Exception):
    """Raised when JSON cannot be extracted or fails schema validation."""


def extract_json(text: str) -> dict[str, Any]:
    """
    Extract the first JSON object from an AI response string.
    Strips markdown code fences if present (handles both closed and unclosed fences).
    Raises ResponseParseError if no valid JSON is found.
    """
    # Try closed fence first: ```json ... ```
    fence_match = _FENCE_RE.search(text)
    if fence_match:
        candidate = fence_match.group(1).strip()
    else:
        # Handle unclosed fence (response truncated before closing ```)
        # Strip leading ```json or ``` marker if present
        stripped = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.IGNORECASE)
        candidate = stripped.strip()

    # Find first '{' … last '}' to ignore surrounding prose
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start != -1 and end != -1:
        candidate = candidate[start : end + 1]

    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError as exc:
        logger.warning("JSON decode failed: %s | raw=%r", exc, text[:200])
        raise ResponseParseError(f"No valid JSON in AI response: {exc}") from exc

    if not isinstance(parsed, dict):
        raise ResponseParseError(f"Expected JSON object, got {type(parsed).__name__}")

    return parsed


def parse_response(text: str, schema: type[T]) -> T:
    """
    Extract JSON from text and validate it against a Pydantic model.
    Raises ResponseParseError on extraction failure or schema mismatch.
    """
    data = extract_json(text)
    try:
        return schema.model_validate(data)
    except ValidationError as exc:
        logger.warning("Schema validation failed: %s | data=%r", exc, data)
        raise ResponseParseError(f"Gemini response failed schema validation: {exc}") from exc
