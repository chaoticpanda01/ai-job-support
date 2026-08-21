"""Unit tests for rirekisho prompt builders and response schema."""

from __future__ import annotations

import pytest
from app.services.ai.prompts.rirekisho import (
    RirekishoEntry,
    RirekishoPersonal,
    RirekishoResult,
    RirekishoVisaInfo,
    build_system_prompt,
    build_user_prompt,
)
from pydantic import ValidationError

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------


def test_system_prompt_is_japanese_instruction() -> None:
    prompt = build_system_prompt()
    assert "履歴書" in prompt
    assert "JSON" in prompt
    assert "education" in prompt
    assert "work_history" in prompt
    assert "self_pr" in prompt
    assert "motivation" in prompt


def test_system_prompt_excludes_personal_info_fields() -> None:
    """Gemini must never be asked to produce personal info — it's DB-sourced."""
    prompt = build_system_prompt()
    assert "name_kanji" not in prompt
    assert "date_of_birth" not in prompt
    assert '"personal"' not in prompt


def test_system_prompt_includes_all_schema_fields() -> None:
    prompt = build_system_prompt()
    for field in [
        "education",
        "work_history",
        "qualifications",
        "self_pr",
        "motivation",
    ]:
        assert field in prompt


# ---------------------------------------------------------------------------
# User prompt
# ---------------------------------------------------------------------------


def test_user_prompt_includes_resume_text() -> None:
    prompt = build_user_prompt("5 years Java developer at PT. ABC")
    assert "5 years Java developer at PT. ABC" in prompt


def test_user_prompt_includes_profile_data() -> None:
    profile = {
        "japanese_level": "N3",
        "target_role": ["Software Engineer", "Backend Developer"],
        "target_location": "Tokyo",
        "years_experience": 5,
    }
    prompt = build_user_prompt("resume text", profile_data=profile)
    assert "N3" in prompt
    assert "Software Engineer" in prompt
    assert "Tokyo" in prompt
    assert "5" in prompt


def test_user_prompt_includes_job_posting_when_provided() -> None:
    prompt = build_user_prompt("resume", job_posting_text="Looking for Java dev in Tokyo")
    assert "Looking for Java dev in Tokyo" in prompt
    assert "motivation" in prompt.lower()


def test_user_prompt_general_motivation_when_no_job_posting() -> None:
    prompt = build_user_prompt("resume")
    assert "No specific job posting" in prompt


def test_user_prompt_skips_missing_profile_fields() -> None:
    profile = {"japanese_level": "N2"}
    prompt = build_user_prompt("resume", profile_data=profile)
    assert "N2" in prompt
    # Should not crash on missing optional keys
    assert "CANDIDATE PROFILE" in prompt


# ---------------------------------------------------------------------------
# RirekishoEntry schema
# ---------------------------------------------------------------------------


def test_rirekisho_entry_valid() -> None:
    entry = RirekishoEntry(year=2020, month=4, entry="株式会社ABC 入社")
    assert entry.year == 2020
    assert entry.month == 4


def test_rirekisho_entry_invalid_month() -> None:
    with pytest.raises(ValidationError):
        RirekishoEntry(year=2020, month=13, entry="test")


def test_rirekisho_entry_empty_entry_rejected() -> None:
    with pytest.raises(ValidationError):
        RirekishoEntry(year=2020, month=1, entry="")


# ---------------------------------------------------------------------------
# RirekishoResult schema
# ---------------------------------------------------------------------------


def _valid_result() -> dict:
    return {
        "education": [
            {"year": 2012, "month": 3, "entry": "○○大学 卒業"},
        ],
        "work_history": [
            {"year": 2012, "month": 4, "entry": "株式会社○○ 入社"},
            {"year": 2020, "month": 3, "entry": "株式会社○○ 退職"},
        ],
        "qualifications": ["日本語能力試験N3"],
        "self_pr": "積極的に業務に取り組んでいます。",
        "motivation": "日本でキャリアを築きたいと考えています。",
    }


def test_rirekisho_result_valid() -> None:
    result = RirekishoResult.model_validate(_valid_result())
    assert result.self_pr == "積極的に業務に取り組んでいます。"
    assert len(result.education) == 1
    assert len(result.work_history) == 2
    assert result.qualifications == ["日本語能力試験N3"]


def test_rirekisho_result_empty_self_pr_rejected() -> None:
    data = _valid_result()
    data["self_pr"] = ""
    with pytest.raises(ValidationError):
        RirekishoResult.model_validate(data)


# ---------------------------------------------------------------------------
# RirekishoPersonal / RirekishoVisaInfo — assembled in Python from
# User/Profile, never sent through parse_response(), but still validated
# as a safety net against a nonsensical DB value.
# ---------------------------------------------------------------------------


def test_rirekisho_personal_age_out_of_range_rejected() -> None:
    with pytest.raises(ValidationError):
        RirekishoPersonal(
            name_kanji="山田 太郎",
            name_kana="ヤマダ タロウ",
            date_of_birth="令和6年3月",
            age=10,
            gender="男性",
            address="東京都",
            phone="090-0000-0000",
            email="test@example.com",
        )


def test_rirekisho_visa_info_optional_fields_default_none() -> None:
    info = RirekishoVisaInfo(nationality="インドネシア")
    assert info.visa_category is None
    assert info.residence_card_expiration is None
