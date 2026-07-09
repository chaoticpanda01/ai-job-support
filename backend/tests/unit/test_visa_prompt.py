"""Unit tests for visa prompt builders and response schema."""

from __future__ import annotations

import pytest
from app.services.ai.prompts.visa import (
    VisaChecklist,
    VisaChecklistPhase,
    VisaChecklistStep,
    VisaRoadmapResult,
    build_system_prompt,
    build_user_prompt,
)
from pydantic import ValidationError

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------


def test_system_prompt_mentions_visa_categories() -> None:
    prompt = build_system_prompt()
    assert "技術・人文知識・国際業務" in prompt
    assert "特定技能1号" in prompt


def test_system_prompt_includes_schema_fields() -> None:
    prompt = build_system_prompt()
    for field in ["visa_type", "ai_guidance", "checklist", "phases", "steps"]:
        assert field in prompt


def test_system_prompt_instructs_indonesian_output() -> None:
    prompt = build_system_prompt()
    assert "Bahasa Indonesia" in prompt


# ---------------------------------------------------------------------------
# User prompt
# ---------------------------------------------------------------------------


def test_user_prompt_includes_basic_fields() -> None:
    snapshot = {
        "nationality": "Indonesian",
        "japanese_level": "N3",
        "visa_status": "student",
        "years_experience": 4,
        "current_location": "Jakarta",
        "target_location": "Tokyo",
        "preferred_language": "id",
    }
    prompt = build_user_prompt(snapshot)
    assert "Indonesian" in prompt
    assert "N3" in prompt
    assert "student" in prompt
    assert "4" in prompt
    assert "Jakarta" in prompt
    assert "Tokyo" in prompt
    assert "id" in prompt


def test_user_prompt_omits_missing_fields() -> None:
    prompt = build_user_prompt({})
    assert "Nationality" not in prompt
    assert "Target role" not in prompt


def test_user_prompt_target_role_as_list() -> None:
    prompt = build_user_prompt({"target_role": ["Software Engineer", "Data Analyst"]})
    assert "Software Engineer" in prompt
    assert "Data Analyst" in prompt


def test_user_prompt_target_role_as_single_string() -> None:
    prompt = build_user_prompt({"target_role": "Software Engineer"})
    assert "Software Engineer" in prompt


def test_user_prompt_target_industry_as_list() -> None:
    prompt = build_user_prompt({"target_industry": ["IT", "Manufacturing"]})
    assert "IT" in prompt
    assert "Manufacturing" in prompt


def test_user_prompt_includes_instructions_footer() -> None:
    prompt = build_user_prompt({})
    assert "Return the JSON object only" in prompt


# ---------------------------------------------------------------------------
# VisaChecklistStep schema
# ---------------------------------------------------------------------------


def _valid_step() -> dict:
    return {
        "id": "step_1_1",
        "title": "Kumpulkan dokumen",
        "detail": "Siapkan paspor dan ijazah.",
        "required": True,
        "estimated_weeks": 2,
        "resources": ["Immigration Bureau: moj.go.jp"],
    }


def test_visa_checklist_step_valid() -> None:
    step = VisaChecklistStep.model_validate(_valid_step())
    assert step.id == "step_1_1"
    assert step.required is True


def test_visa_checklist_step_empty_title_rejected() -> None:
    data = _valid_step()
    data["title"] = ""
    with pytest.raises(ValidationError):
        VisaChecklistStep.model_validate(data)


def test_visa_checklist_step_negative_weeks_rejected() -> None:
    data = _valid_step()
    data["estimated_weeks"] = -1
    with pytest.raises(ValidationError):
        VisaChecklistStep.model_validate(data)


def test_visa_checklist_step_zero_weeks_allowed() -> None:
    data = _valid_step()
    data["estimated_weeks"] = 0
    step = VisaChecklistStep.model_validate(data)
    assert step.estimated_weeks == 0


# ---------------------------------------------------------------------------
# VisaChecklistPhase / VisaChecklist / VisaRoadmapResult
# ---------------------------------------------------------------------------


def _valid_phase() -> dict:
    return {
        "phase": "Persiapan Dokumen",
        "description": "Kumpulkan semua dokumen yang diperlukan.",
        "steps": [_valid_step()],
    }


def test_visa_checklist_phase_valid() -> None:
    phase = VisaChecklistPhase.model_validate(_valid_phase())
    assert phase.phase == "Persiapan Dokumen"
    assert len(phase.steps) == 1


def test_visa_checklist_phase_empty_description_rejected() -> None:
    data = _valid_phase()
    data["description"] = ""
    with pytest.raises(ValidationError):
        VisaChecklistPhase.model_validate(data)


def test_visa_checklist_valid() -> None:
    checklist = VisaChecklist.model_validate({"phases": [_valid_phase()]})
    assert len(checklist.phases) == 1


def test_visa_roadmap_result_valid() -> None:
    result = VisaRoadmapResult.model_validate(
        {
            "visa_type": "技術・人文知識・国際業務 (Engineer/Specialist)",
            "ai_guidance": "Visa ini cocok untuk Anda karena latar belakang teknis Anda.",
            "checklist": {"phases": [_valid_phase()]},
        }
    )
    assert "技術" in result.visa_type
    assert len(result.checklist.phases) == 1


def test_visa_roadmap_result_empty_visa_type_rejected() -> None:
    with pytest.raises(ValidationError):
        VisaRoadmapResult.model_validate(
            {
                "visa_type": "",
                "ai_guidance": "Some guidance text.",
                "checklist": {"phases": []},
            }
        )


def test_visa_roadmap_result_empty_checklist_phases_allowed() -> None:
    result = VisaRoadmapResult.model_validate(
        {
            "visa_type": "経営・管理",
            "ai_guidance": "Some guidance text.",
            "checklist": {"phases": []},
        }
    )
    assert result.checklist.phases == []
