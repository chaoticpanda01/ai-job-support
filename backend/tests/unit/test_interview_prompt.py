"""Unit tests for interview prompt builders and response schemas."""

from __future__ import annotations

import pytest
from app.services.ai.prompts.interview import (
    InterviewEvalResult,
    InterviewSummaryResult,
    build_eval_system_prompt,
    build_eval_user_prompt,
    build_question_system_prompt,
    build_question_user_prompt,
    build_summary_system_prompt,
    build_summary_user_prompt,
)
from pydantic import ValidationError

# ---------------------------------------------------------------------------
# Question prompt
# ---------------------------------------------------------------------------


def test_question_system_prompt_japanese_language() -> None:
    prompt = build_question_system_prompt("general", "ja")
    assert "日本語" in prompt
    assert "敬語" in prompt


def test_question_system_prompt_indonesian_language() -> None:
    prompt = build_question_system_prompt("general", "id")
    assert "Bahasa Indonesia" in prompt


def test_question_system_prompt_english_language() -> None:
    prompt = build_question_system_prompt("general", "en")
    assert "professional English" in prompt


def test_question_system_prompt_behavioral_type() -> None:
    prompt = build_question_system_prompt("behavioral", "en")
    assert "BEHAVIOURAL" in prompt
    assert "STAR method" in prompt


def test_question_system_prompt_technical_type() -> None:
    prompt = build_question_system_prompt("technical", "en")
    assert "TECHNICAL" in prompt


def test_question_system_prompt_culture_fit_type() -> None:
    prompt = build_question_system_prompt("culture_fit", "en")
    assert "CULTURE FIT" in prompt


def test_question_system_prompt_general_type_default() -> None:
    prompt = build_question_system_prompt("general", "en")
    assert "GENERAL interview" in prompt


def test_question_user_prompt_includes_turn_number() -> None:
    prompt = build_question_user_prompt(turn_number=3, conversation_history=[])
    assert "question number 3" in prompt


def test_question_user_prompt_includes_role_and_company() -> None:
    prompt = build_question_user_prompt(
        turn_number=1,
        conversation_history=[],
        target_role="Backend Engineer",
        target_company="Acme Corp",
    )
    assert "Backend Engineer" in prompt
    assert "Acme Corp" in prompt


def test_question_user_prompt_includes_candidate_profile() -> None:
    prompt = build_question_user_prompt(
        turn_number=1,
        conversation_history=[],
        candidate_profile={
            "japanese_level": "N3",
            "years_experience": 5,
            "target_industry": ["IT", "Finance"],
        },
    )
    assert "N3" in prompt
    assert "5" in prompt
    assert "IT" in prompt
    assert "Finance" in prompt


def test_question_user_prompt_includes_conversation_history() -> None:
    history = [
        {"role": "interviewer", "content": "自己紹介をしてください"},
        {"role": "user", "content": "私はエンジニアです"},
    ]
    prompt = build_question_user_prompt(turn_number=2, conversation_history=history)
    assert "INTERVIEWER: 自己紹介をしてください" in prompt
    assert "USER: 私はエンジニアです" in prompt


def test_question_user_prompt_no_context_omits_sections() -> None:
    prompt = build_question_user_prompt(turn_number=1, conversation_history=[])
    assert "INTERVIEW CONTEXT" not in prompt
    assert "CANDIDATE PROFILE" not in prompt
    assert "CONVERSATION SO FAR" not in prompt


# ---------------------------------------------------------------------------
# Evaluation prompt
# ---------------------------------------------------------------------------


def test_eval_system_prompt_mentions_dimensions() -> None:
    prompt = build_eval_system_prompt("ja")
    assert "keigo_score" in prompt
    assert "content_relevance" in prompt
    assert "specificity_score" in prompt


def test_eval_user_prompt_includes_question_and_answer() -> None:
    prompt = build_eval_user_prompt("なぜ日本で働きたいですか？", "成長したいからです。")
    assert "なぜ日本で働きたいですか？" in prompt
    assert "成長したいからです。" in prompt


# ---------------------------------------------------------------------------
# Summary prompt
# ---------------------------------------------------------------------------


def test_summary_system_prompt_mentions_schema_fields() -> None:
    prompt = build_summary_system_prompt()
    assert "overall_score" in prompt
    assert "feedback_summary" in prompt
    assert "top_strengths" in prompt
    assert "top_improvements" in prompt


def test_summary_user_prompt_includes_session_type_and_role() -> None:
    prompt = build_summary_user_prompt(
        session_type="technical",
        target_role="Data Engineer",
        conversation_history=[{"role": "interviewer", "content": "hello"}],
        per_answer_scores=[],
    )
    assert "SESSION TYPE: technical" in prompt
    assert "TARGET ROLE: Data Engineer" in prompt


def test_summary_user_prompt_no_target_role_omits_section() -> None:
    prompt = build_summary_user_prompt(
        session_type="general",
        target_role=None,
        conversation_history=[],
        per_answer_scores=[],
    )
    assert "TARGET ROLE" not in prompt


def test_summary_user_prompt_includes_per_answer_scores() -> None:
    prompt = build_summary_user_prompt(
        session_type="general",
        target_role=None,
        conversation_history=[],
        per_answer_scores=[
            {"keigo_score": 80, "content_relevance": 70, "specificity_score": 60},
        ],
    )
    assert "PER-ANSWER SCORES" in prompt
    assert "keigo=80" in prompt
    assert "relevance=70" in prompt
    assert "specificity=60" in prompt


def test_summary_user_prompt_no_scores_omits_section() -> None:
    prompt = build_summary_user_prompt(
        session_type="general",
        target_role=None,
        conversation_history=[],
        per_answer_scores=[],
    )
    assert "PER-ANSWER SCORES" not in prompt


# ---------------------------------------------------------------------------
# InterviewEvalResult schema
# ---------------------------------------------------------------------------


def _valid_eval() -> dict:
    return {
        "keigo_score": 80,
        "content_relevance": 75,
        "specificity_score": 60,
        "grammar_issues": ["Minor particle misuse"],
        "positive_feedback": "Clear structure and good use of examples.",
        "improvement_tip": "Use more specific numbers.",
    }


def test_interview_eval_result_valid() -> None:
    result = InterviewEvalResult.model_validate(_valid_eval())
    assert result.keigo_score == 80
    assert result.grammar_issues == ["Minor particle misuse"]


def test_interview_eval_result_score_out_of_range_rejected() -> None:
    data = _valid_eval()
    data["keigo_score"] = 101
    with pytest.raises(ValidationError):
        InterviewEvalResult.model_validate(data)


def test_interview_eval_result_empty_positive_feedback_rejected() -> None:
    data = _valid_eval()
    data["positive_feedback"] = ""
    with pytest.raises(ValidationError):
        InterviewEvalResult.model_validate(data)


def test_interview_eval_result_empty_grammar_issues_allowed() -> None:
    data = _valid_eval()
    data["grammar_issues"] = []
    result = InterviewEvalResult.model_validate(data)
    assert result.grammar_issues == []


# ---------------------------------------------------------------------------
# InterviewSummaryResult schema
# ---------------------------------------------------------------------------


def _valid_summary() -> dict:
    return {
        "overall_score": 72,
        "feedback_summary": "Solid overall performance with room to grow.",
        "top_strengths": ["Clear communication"],
        "top_improvements": ["More specific examples"],
    }


def test_interview_summary_result_valid() -> None:
    result = InterviewSummaryResult.model_validate(_valid_summary())
    assert result.overall_score == 72
    assert result.top_strengths == ["Clear communication"]


def test_interview_summary_result_score_negative_rejected() -> None:
    data = _valid_summary()
    data["overall_score"] = -1
    with pytest.raises(ValidationError):
        InterviewSummaryResult.model_validate(data)


def test_interview_summary_result_empty_feedback_rejected() -> None:
    data = _valid_summary()
    data["feedback_summary"] = ""
    with pytest.raises(ValidationError):
        InterviewSummaryResult.model_validate(data)


def test_interview_summary_result_empty_lists_allowed() -> None:
    data = _valid_summary()
    data["top_strengths"] = []
    data["top_improvements"] = []
    result = InterviewSummaryResult.model_validate(data)
    assert result.top_strengths == []
    assert result.top_improvements == []
