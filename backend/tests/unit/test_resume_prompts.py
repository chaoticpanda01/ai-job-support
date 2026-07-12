"""Unit tests for resume_analysis prompt builders."""

from __future__ import annotations

import pytest
from app.services.ai.prompts.resume_analysis import (
    ResumeAnalysisResult,
    build_system_prompt,
    build_user_prompt,
)
from pydantic import ValidationError


def test_system_prompt_contains_json_schema_hint() -> None:
    prompt = build_system_prompt()
    assert "japan_market_score" in prompt
    assert "JSON" in prompt


def test_system_prompt_defaults_to_english() -> None:
    prompt = build_system_prompt()
    assert "in English" in prompt


def test_system_prompt_respects_japanese_language() -> None:
    prompt = build_system_prompt("ja")
    assert "Japanese" in prompt
    assert "in English" not in prompt


def test_system_prompt_respects_indonesian_language() -> None:
    prompt = build_system_prompt("id")
    assert "Indonesian" in prompt
    assert "in English" not in prompt


def test_user_prompt_includes_resume_text() -> None:
    prompt = build_user_prompt("5 years Java developer")
    assert "5 years Java developer" in prompt


def test_user_prompt_includes_job_posting_when_provided() -> None:
    prompt = build_user_prompt("my resume", job_posting_text="Looking for Java dev")
    assert "Looking for Java dev" in prompt
    assert "TARGET JOB POSTING" in prompt


def test_user_prompt_general_when_no_job_posting() -> None:
    prompt = build_user_prompt("my resume")
    assert "general" in prompt.lower()


def test_resume_analysis_result_schema_valid() -> None:
    result = ResumeAnalysisResult(
        japan_market_score=75,
        strengths=["leadership"],
        gaps=["N3 Japanese"],
        recommendations=["Get N3"],
        language_assessment="Intermediate",
        estimated_japanese_level_required="N3",
        summary="Good candidate",
    )
    assert result.japan_market_score == 75


def test_resume_analysis_result_rejects_out_of_range_score() -> None:
    with pytest.raises(ValidationError):
        ResumeAnalysisResult(
            japan_market_score=150,  # invalid
            strengths=[],
            gaps=[],
            recommendations=[],
            language_assessment="",
            estimated_japanese_level_required="N3",
            summary="",
        )
