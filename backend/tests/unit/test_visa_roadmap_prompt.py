"""Unit tests for the visa roadmap prompt builders and response schema."""

from __future__ import annotations

import pytest
from app.services.ai.prompts.visa_roadmap import (
    VisaChecklist,
    VisaChecklistPhase,
    VisaChecklistStep,
    VisaRoadmapResult,
    build_system_prompt,
    build_user_prompt,
)
from pydantic import ValidationError


def _step(step_id: str = "step_1_1") -> dict:
    return {
        "id": step_id,
        "title": "Kumpulkan ijazah",
        "detail": "Siapkan salinan ijazah dan transkrip yang diterjemahkan.",
        "required": True,
        "estimated_weeks": 2,
        "resources": ["Immigration Bureau: moj.go.jp"],
    }


# --- System prompt -------------------------------------------------------


def test_system_prompt_describes_checklist_schema() -> None:
    prompt = build_system_prompt()
    for field in ["ai_guidance", "checklist", "phases", "steps", "estimated_weeks"]:
        assert field in prompt


def test_system_prompt_instructs_indonesian_output() -> None:
    assert "Bahasa Indonesia" in build_system_prompt()


def test_system_prompt_does_not_ask_the_model_to_choose_a_visa() -> None:
    """The category is already decided by the user — the prompt must not re-pick."""
    prompt = build_system_prompt()
    assert "visa_type" not in prompt


# --- User prompt ---------------------------------------------------------


def test_user_prompt_includes_the_chosen_visa_type() -> None:
    prompt = build_user_prompt({"nationality": "Indonesian"}, "特定技能1号")
    assert "特定技能1号" in prompt


def test_user_prompt_includes_profile_fields() -> None:
    prompt = build_user_prompt(
        {"nationality": "Indonesian", "japanese_level": "N3", "current_location": "Jakarta"},
        "技術・人文知識・国際業務",
    )
    assert "Indonesian" in prompt
    assert "N3" in prompt
    assert "Jakarta" in prompt


# --- Result schema -------------------------------------------------------


def test_result_accepts_valid_payload() -> None:
    result = VisaRoadmapResult.model_validate(
        {
            "ai_guidance": "Jalur ini realistis untuk Anda.",
            "checklist": {
                "phases": [
                    {
                        "phase": "Persiapan Dokumen",
                        "description": "Kumpulkan dokumen yang dibutuhkan.",
                        "steps": [_step()],
                    }
                ]
            },
        }
    )
    assert result.checklist.phases[0].steps[0].id == "step_1_1"


def test_result_rejects_missing_guidance() -> None:
    with pytest.raises(ValidationError):
        VisaRoadmapResult.model_validate({"checklist": {"phases": []}})


def test_step_rejects_negative_estimated_weeks() -> None:
    bad = _step()
    bad["estimated_weeks"] = -1
    with pytest.raises(ValidationError):
        VisaChecklistStep.model_validate(bad)


def test_checklist_accepts_empty_phases() -> None:
    """An empty roadmap is degenerate but valid — the route decides what to do."""
    assert VisaChecklist.model_validate({"phases": []}).phases == []


def test_phase_requires_a_name() -> None:
    with pytest.raises(ValidationError):
        VisaChecklistPhase.model_validate(
            {"phase": "", "description": "x", "steps": [_step()]}
        )
