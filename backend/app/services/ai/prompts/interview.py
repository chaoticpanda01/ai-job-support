"""
Prompt builders for mock interview practice.

Three distinct AI calls per session:

  1. question()   — Interviewer asks the next question (streamed via SSE).
                    Called once per turn to generate one question.

  2. evaluate()   — Evaluates the candidate's answer immediately after they
                    submit it (streamed via SSE as {"type": "eval", ...}).
                    Populates InterviewMessage.ai_evaluation.

  3. summarise()  — End-of-session overall feedback (streamed via SSE).
                    Populates InterviewSession.feedback_summary + overall_score.

Each function returns a plain string. AIClient wraps user_prompt in
<user_content> tags automatically — do NOT add them here.

SSE event protocol (enforced in the route, not here):
  data: {"type": "token",    "content": "<text chunk>"}
  data: {"type": "eval",     "content": <InterviewEvalResult JSON>}
  data: {"type": "summary",  "content": <InterviewSummaryResult JSON>}
  data: {"type": "done"}

Evaluation schema (stored in interview_messages.ai_evaluation):
{
  "keigo_score":         0–100,
  "content_relevance":   0–100,
  "specificity_score":   0–100,
  "grammar_issues":      ["…"],
  "positive_feedback":   "…",
  "improvement_tip":     "…"
}

Summary schema (stored in interview_sessions):
{
  "overall_score":      0–100,
  "feedback_summary":   "…",
  "top_strengths":      ["…"],
  "top_improvements":   ["…"]
}
"""

from __future__ import annotations

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class InterviewEvalResult(BaseModel):
    """Per-answer evaluation. Stored in interview_messages.ai_evaluation."""

    keigo_score: int = Field(ge=0, le=100)
    content_relevance: int = Field(ge=0, le=100)
    specificity_score: int = Field(ge=0, le=100)
    grammar_issues: list[str]
    positive_feedback: str = Field(min_length=1)
    improvement_tip: str = Field(min_length=1)


class InterviewSummaryResult(BaseModel):
    """End-of-session summary. Stored in interview_sessions."""

    overall_score: int = Field(ge=0, le=100)
    feedback_summary: str = Field(min_length=1)
    top_strengths: list[str]
    top_improvements: list[str]


# ---------------------------------------------------------------------------
# 1. Question prompt — interviewer turn
# ---------------------------------------------------------------------------


def build_question_system_prompt(
    session_type: str,
    language: str,
) -> str:
    """
    System prompt for the interviewer role.

    session_type — "general" | "behavioral" | "technical" | "culture_fit"
    language     — "ja" | "en" | "id"
    """
    lang_instruction = _lang_instruction(language)
    type_instruction = _type_instruction(session_type)

    return f"""\
You are an experienced Japanese hiring manager conducting a mock job interview \
to help an Indonesian candidate prepare for real Japanese interviews. You are \
professional, encouraging, and culturally aware.

{lang_instruction}

{type_instruction}

Rules for generating interview questions:
1. Ask exactly ONE question per turn. Never ask multiple questions at once.
2. Questions must be realistic — the kind a Japanese HR manager or department \
head would genuinely ask.
3. Vary the difficulty: start with warm-up questions, then progress to deeper \
behavioural or situational questions.
4. If job context is provided, tailor questions to the specific role and company.
5. Do not repeat a question that has already been asked in this session.
6. Do not evaluate the candidate's answer here — only ask a question.
7. Keep questions concise: 1–3 sentences maximum.

Respond with the question only — no preamble, no numbering, no quotation marks."""


def build_question_user_prompt(
    turn_number: int,
    conversation_history: list[dict[str, str]],
    target_role: str | None = None,
    target_company: str | None = None,
    candidate_profile: dict | None = None,
) -> str:
    """
    Build the user-turn prompt for generating the next interview question.

    turn_number          — 1-based index of the current question
    conversation_history — list of {"role": "interviewer"|"user", "content": "…"}
    target_role          — optional role the candidate is applying for
    target_company       — optional company name
    candidate_profile    — optional dict with japanese_level, years_experience, target_industry
    """
    parts: list[str] = []

    if target_role or target_company:
        context_parts: list[str] = []
        if target_role:
            context_parts.append(f"Role: {target_role}")
        if target_company:
            context_parts.append(f"Company: {target_company}")
        parts.append("INTERVIEW CONTEXT:\n" + "\n".join(context_parts))

    if candidate_profile:
        profile_parts: list[str] = []
        if candidate_profile.get("japanese_level"):
            profile_parts.append(f"Japanese level: {candidate_profile['japanese_level']}")
        if candidate_profile.get("years_experience") is not None:
            profile_parts.append(f"Years of experience: {candidate_profile['years_experience']}")
        if candidate_profile.get("target_industry"):
            industries = candidate_profile["target_industry"]
            if isinstance(industries, list):
                profile_parts.append(f"Target industry: {', '.join(industries)}")
        if profile_parts:
            parts.append("CANDIDATE PROFILE:\n" + "\n".join(profile_parts))

    if conversation_history:
        history_lines = "\n".join(
            f"{msg['role'].upper()}: {msg['content']}" for msg in conversation_history
        )
        parts.append(f"CONVERSATION SO FAR:\n{history_lines}")

    parts.append(
        f"This is question number {turn_number}. "
        "Please ask the next appropriate interview question."
    )

    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# 2. Evaluation prompt — assess candidate's answer
# ---------------------------------------------------------------------------


def build_eval_system_prompt(language: str) -> str:
    """
    System prompt for per-answer evaluation.
    language — "ja" | "en" | "id"
    """
    return f"""\
You are a Japanese language and interview coach evaluating a candidate's answer \
to an interview question. Your feedback must be honest, specific, and actionable.

{_lang_instruction(language)}

Evaluate the answer on three dimensions:
1. keigo_score (0–100): Correctness and appropriateness of Japanese honorific \
language (敬語). 100 = perfect formal business Japanese. If the answer is not \
in Japanese, score based on formality and professionalism of the language used.
2. content_relevance (0–100): How directly and completely the answer addresses \
the question asked. 100 = fully on-topic with concrete examples.
3. specificity_score (0–100): Use of specific examples, numbers, outcomes \
(STAR method). 100 = concrete, detailed, memorable.

Scoring guide:
  0–40   Needs major improvement
  41–60  Developing — key elements missing
  61–80  Competent — minor gaps
  81–100 Strong — ready for real interviews

Return ONLY a JSON object — no prose before or after:

{{
  "keigo_score":       <integer 0-100>,
  "content_relevance": <integer 0-100>,
  "specificity_score": <integer 0-100>,
  "grammar_issues":    [<string — specific issue>, ...],
  "positive_feedback": <string — 1-2 sentences on what was done well>,
  "improvement_tip":   <string — 1 concrete, actionable suggestion>
}}"""


def build_eval_user_prompt(question: str, answer: str) -> str:
    """
    Build the user-turn prompt for evaluating a candidate's answer.

    question — the interviewer's question
    answer   — the candidate's response
    """
    return (
        f"INTERVIEW QUESTION:\n{question}\n\n"
        f"CANDIDATE'S ANSWER:\n{answer}\n\n"
        "Please evaluate this answer and return the JSON assessment only."
    )


# ---------------------------------------------------------------------------
# 3. Summary prompt — end-of-session feedback
# ---------------------------------------------------------------------------


def build_summary_system_prompt() -> str:
    return """\
You are a senior interview coach summarising a completed mock interview session. \
Your feedback must be balanced, honest, and motivating — acknowledging genuine \
strengths while identifying the most important areas for improvement.

Return ONLY a JSON object — no prose before or after:

{
  "overall_score":     <integer 0-100 — weighted average reflecting readiness>,
  "feedback_summary":  <string — 3-5 sentences covering overall performance,
                         standout moments, and the single most important thing
                         to work on before a real interview>,
  "top_strengths":     [<string>, ...],
  "top_improvements":  [<string>, ...]
}

Scoring guide:
  0–40   Not yet ready — significant preparation needed
  41–60  Developing — a few more sessions recommended
  61–80  Competent — minor polish needed before real interviews
  81–100 Interview-ready — strong candidate"""


def build_summary_user_prompt(
    session_type: str,
    target_role: str | None,
    conversation_history: list[dict[str, str]],
    per_answer_scores: list[dict],
) -> str:
    """
    Build the user-turn prompt for the end-of-session summary.

    session_type         — "general" | "behavioral" | "technical" | "culture_fit"
    target_role          — optional role being applied for
    conversation_history — full list of {"role": …, "content": …}
    per_answer_scores    — list of InterviewEvalResult dicts for each user turn
    """
    parts: list[str] = [
        f"SESSION TYPE: {session_type}",
    ]

    if target_role:
        parts.append(f"TARGET ROLE: {target_role}")

    history_lines = "\n".join(
        f"{msg['role'].upper()}: {msg['content']}" for msg in conversation_history
    )
    parts.append(f"FULL CONVERSATION:\n{history_lines}")

    if per_answer_scores:
        score_lines = "\n".join(
            f"Answer {i + 1}: keigo={s.get('keigo_score')}, "
            f"relevance={s.get('content_relevance')}, "
            f"specificity={s.get('specificity_score')}"
            for i, s in enumerate(per_answer_scores)
        )
        parts.append(f"PER-ANSWER SCORES:\n{score_lines}")

    parts.append("Please provide the overall session summary as a JSON object only.")

    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _lang_instruction(language: str) -> str:
    if language == "ja":
        return (
            "Conduct the interview entirely in Japanese (日本語). "
            "Use formal business Japanese (丁寧語/敬語) appropriate for a real interview."
        )
    if language == "id":
        return (
            "Conduct the interview in Indonesian (Bahasa Indonesia). "
            "Use formal, professional Indonesian appropriate for a job interview."
        )
    return (
        "Conduct the interview in English. "
        "Use formal, professional English appropriate for a job interview."
    )


def _type_instruction(session_type: str) -> str:
    if session_type == "behavioral":
        return (
            "This is a BEHAVIOURAL interview. Focus on past experience using the STAR method "
            "(Situation, Task, Action, Result). Typical openers: "
            "「〜した経験を教えてください」「〜のとき、どう対応しましたか」"
        )
    if session_type == "technical":
        return (
            "This is a TECHNICAL interview. Ask role-specific technical questions "
            "appropriate to the candidate's target field. Mix conceptual understanding "
            "with practical problem-solving."
        )
    if session_type == "culture_fit":
        return (
            "This is a CULTURE FIT interview. Focus on values, teamwork, working style, "
            "and adaptability to Japanese workplace culture (チームワーク, 報連相, 勤勉さ). "
            "Typical openers: 「あなたの強みは何ですか」「チームで困難があったとき〜」"
        )
    # general
    return (
        "This is a GENERAL interview covering a mix of self-introduction, motivation, "
        "experience, and goals. Start with 「自己紹介をしてください」 on the first turn, "
        "then progress to experience and motivation questions."
    )
