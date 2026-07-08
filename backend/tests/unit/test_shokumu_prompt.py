"""Unit tests for shokumu prompt builders and response schema."""

from __future__ import annotations

import pytest
from app.services.ai.prompts.shokumu import (
    ShokumuCompany,
    ShokumuResult,
    ShokumuSkills,
    build_system_prompt,
    build_user_prompt,
)
from pydantic import ValidationError

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------


def test_system_prompt_mentions_shokumukeirekisho() -> None:
    prompt = build_system_prompt()
    assert "職務経歴書" in prompt
    assert "JSON" in prompt


def test_system_prompt_includes_all_schema_fields() -> None:
    prompt = build_system_prompt()
    for field in [
        "summary",
        "companies",
        "skills",
        "self_pr",
        "motivation",
        "responsibilities",
        "achievements",
        "period_start",
        "period_end",
    ]:
        assert field in prompt


def test_system_prompt_instructs_reverse_chronological() -> None:
    prompt = build_system_prompt()
    assert "reverse chronological" in prompt.lower() or "most recent first" in prompt.lower()


# ---------------------------------------------------------------------------
# User prompt
# ---------------------------------------------------------------------------


def test_user_prompt_includes_resume_text() -> None:
    prompt = build_user_prompt("10 years backend engineering")
    assert "10 years backend engineering" in prompt


def test_user_prompt_includes_full_profile() -> None:
    profile = {
        "japanese_level": "N2",
        "target_role": ["Backend Engineer"],
        "target_industry": ["IT", "Finance"],
        "years_experience": 10,
    }
    prompt = build_user_prompt("resume", profile_data=profile)
    assert "N2" in prompt
    assert "Backend Engineer" in prompt
    assert "IT" in prompt
    assert "Finance" in prompt
    assert "10" in prompt


def test_user_prompt_with_job_posting() -> None:
    prompt = build_user_prompt("resume", job_posting_text="Seeking senior Python engineer")
    assert "Seeking senior Python engineer" in prompt


def test_user_prompt_no_job_posting_fallback() -> None:
    prompt = build_user_prompt("resume")
    assert "No specific job posting" in prompt


# ---------------------------------------------------------------------------
# ShokumuCompany schema
# ---------------------------------------------------------------------------


def _valid_company() -> dict:
    return {
        "company_name": "株式会社テスト",
        "industry": "情報通信業",
        "employee_count": "約500名",
        "period_start": "2015年4月",
        "period_end": "2020年3月",
        "role": "ソフトウェアエンジニア",
        "responsibilities": ["バックエンド開発を担当"],
        "achievements": ["システム応答速度を30%改善"],
    }


def test_shokumu_company_valid() -> None:
    company = ShokumuCompany.model_validate(_valid_company())
    assert company.company_name == "株式会社テスト"
    assert len(company.responsibilities) == 1


def test_shokumu_company_empty_responsibilities_rejected() -> None:
    data = _valid_company()
    data["responsibilities"] = []
    with pytest.raises(ValidationError):
        ShokumuCompany.model_validate(data)


def test_shokumu_company_empty_achievements_allowed() -> None:
    data = _valid_company()
    data["achievements"] = []
    company = ShokumuCompany.model_validate(data)
    assert company.achievements == []


def test_shokumu_company_current_job_uses_genzai() -> None:
    data = _valid_company()
    data["period_end"] = "現在"
    company = ShokumuCompany.model_validate(data)
    assert company.period_end == "現在"


# ---------------------------------------------------------------------------
# ShokumuResult schema
# ---------------------------------------------------------------------------


def _valid_result() -> dict:
    return {
        "summary": "10年以上のバックエンド開発経験を持つエンジニアです。",
        "companies": [_valid_company()],
        "skills": {
            "technical": ["Python", "Java"],
            "languages": ["日本語（N2）", "英語（ビジネスレベル）"],
            "other": ["アジャイル開発"],
        },
        "self_pr": "積極的にチームに貢献できます。",
        "motivation": "日本のIT業界で更なるキャリアを積みたいと考えています。",
    }


def test_shokumu_result_valid() -> None:
    result = ShokumuResult.model_validate(_valid_result())
    assert result.summary
    assert len(result.companies) == 1
    assert "Python" in result.skills.technical


def test_shokumu_result_empty_companies_rejected() -> None:
    data = _valid_result()
    data["companies"] = []
    with pytest.raises(ValidationError):
        ShokumuResult.model_validate(data)


def test_shokumu_result_empty_summary_rejected() -> None:
    data = _valid_result()
    data["summary"] = ""
    with pytest.raises(ValidationError):
        ShokumuResult.model_validate(data)


def test_shokumu_result_empty_motivation_rejected() -> None:
    data = _valid_result()
    data["motivation"] = ""
    with pytest.raises(ValidationError):
        ShokumuResult.model_validate(data)


def test_shokumu_skills_all_lists_can_be_empty() -> None:
    skills = ShokumuSkills(technical=[], languages=[], other=[])
    assert skills.technical == []
