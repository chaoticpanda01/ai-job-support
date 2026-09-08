"""Unit tests for the visa assessment prompt builders and response schema."""

from __future__ import annotations

import pytest
from app.services.ai.prompts.visa_assessment import (
    VisaAssessmentResult,
    VisaOption,
    build_system_prompt,
    build_user_prompt,
)
from pydantic import ValidationError


def _option(visa_type: str, *, recommended: bool = False) -> dict:
    return {
        "visa_type": visa_type,
        "eligibility": "eligible",
        "summary": "Cocok untuk latar belakang Anda.",
        "key_requirements": ["Gelar sarjana"],
        "gaps": [],
        "estimated_months": 6,
        "recommended": recommended,
    }


# --- System prompt -------------------------------------------------------


def test_system_prompt_mentions_visa_categories() -> None:
    prompt = build_system_prompt()
    assert "技術・人文知識・国際業務" in prompt
    assert "特定技能1号" in prompt
    assert "高度専門職" in prompt


def test_system_prompt_asks_for_all_categories_not_one() -> None:
    prompt = build_system_prompt()
    assert "eligible_with_gaps" in prompt
    assert "not_eligible" in prompt
    assert "options" in prompt


def test_system_prompt_instructs_indonesian_output() -> None:
    prompt = build_system_prompt()
    assert "Bahasa Indonesia" in prompt


# --- User prompt ---------------------------------------------------------


def test_user_prompt_includes_profile_fields() -> None:
    prompt = build_user_prompt(
        {
            "nationality": "Indonesian",
            "japanese_level": "N3",
            "years_experience": 4,
            "current_location": "Jakarta",
            "target_role": ["Backend Engineer"],
            "target_industry": ["IT"],
        }
    )
    assert "Indonesian" in prompt
    assert "N3" in prompt
    assert "4" in prompt
    assert "Jakarta" in prompt
    assert "Backend Engineer" in prompt
    assert "IT" in prompt


def test_user_prompt_omits_missing_fields() -> None:
    prompt = build_user_prompt({"nationality": "Indonesian"})
    assert "Indonesian" in prompt
    assert "Target location" not in prompt


# --- Result schema -------------------------------------------------------


def test_result_accepts_valid_payload() -> None:
    result = VisaAssessmentResult.model_validate(
        {"options": [_option("技人国", recommended=True), _option("特定技能1号")]}
    )
    assert len(result.options) == 2
    assert result.options[0].recommended is True


def test_result_rejects_empty_options() -> None:
    with pytest.raises(ValidationError):
        VisaAssessmentResult.model_validate({"options": []})


def test_result_rejects_unknown_eligibility_value() -> None:
    bad = _option("技人国")
    bad["eligibility"] = "maybe"
    with pytest.raises(ValidationError):
        VisaAssessmentResult.model_validate({"options": [bad]})


def test_result_promotes_first_option_when_none_recommended() -> None:
    """The AI sometimes flags nothing. Never return an assessment with no pick."""
    result = VisaAssessmentResult.model_validate(
        {"options": [_option("技人国"), _option("特定技能1号")]}
    )
    assert [o.recommended for o in result.options] == [True, False]


def test_result_keeps_only_the_first_recommendation() -> None:
    result = VisaAssessmentResult.model_validate(
        {
            "options": [
                _option("技人国", recommended=True),
                _option("特定技能1号", recommended=True),
            ]
        }
    )
    assert [o.recommended for o in result.options] == [True, False]


def test_recommended_option_is_the_nearest_path_when_nothing_eligible() -> None:
    """All-ineligible profiles still get a pick — the first listed option."""
    ineligible = _option("技人国")
    ineligible["eligibility"] = "not_eligible"
    ineligible["gaps"] = ["Belum punya gelar sarjana"]
    result = VisaAssessmentResult.model_validate({"options": [ineligible]})
    assert result.options[0].recommended is True


def test_option_requires_gaps_list_present() -> None:
    bad = _option("技人国")
    del bad["gaps"]
    with pytest.raises(ValidationError):
        VisaOption.model_validate(bad)
