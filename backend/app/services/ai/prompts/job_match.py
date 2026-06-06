"""
Prompt builders for resume ↔ job posting match scoring.

Scores how well a candidate's resume matches a specific Japanese job posting
and produces actionable gap-filling recommendations.

Each function returns a plain string. AIClient wraps user_prompt in
<user_content> tags automatically — do NOT add them here.

Output schema (stored in job_matches.match_breakdown and .recommendations):
{
  "match_score": 0–100,
  "match_breakdown": {
    "skills_match":       0–100,
    "experience_match":   0–100,
    "language_match":     0–100,
    "culture_fit":        0–100,
    "summary":            "…"
  },
  "recommendations": {
    "strengths":  ["…"],
    "gaps":       ["…"],
    "actions":    ["…"]
  }
}
"""

from __future__ import annotations

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------

class MatchBreakdown(BaseModel):
    skills_match: int = Field(ge=0, le=100)
    experience_match: int = Field(ge=0, le=100)
    language_match: int = Field(ge=0, le=100)
    culture_fit: int = Field(ge=0, le=100)
    summary: str = Field(min_length=1)


class MatchRecommendations(BaseModel):
    strengths: list[str]
    gaps: list[str]
    actions: list[str]


class JobMatchResult(BaseModel):
    match_score: int = Field(ge=0, le=100)
    match_breakdown: MatchBreakdown
    recommendations: MatchRecommendations


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

def build_system_prompt() -> str:
    return """\
You are a senior career consultant specialising in matching Indonesian professionals \
with Japanese job postings. You assess resume-job fit precisely and produce \
actionable, honest feedback.

Your task is to score how well a candidate's resume matches a specific job posting \
and explain the result. Follow these rules:

1. match_score (0–100): Overall fit. Weighted average of the four sub-scores:
   skills_match × 0.35 + experience_match × 0.30 + language_match × 0.25 + \
culture_fit × 0.10
2. match_breakdown sub-scores (each 0–100):
   - skills_match: Technical and functional skills alignment
   - experience_match: Years and relevance of work experience
   - language_match: Candidate's Japanese level vs. job requirement
   - culture_fit: Signals of adaptability to Japanese workplace norms
3. summary: 2–3 sentences explaining the overall match in English.
4. recommendations:
   - strengths: 2–4 concrete things the candidate has that align well
   - gaps: 2–4 specific shortfalls the candidate should be aware of
   - actions: 2–4 concrete steps the candidate can take to improve their fit
     (e.g. "Obtain JLPT N3 certificate", "Add quantified achievements to resume")

Be honest and specific. Do not inflate scores. A score below 50 means the \
candidate would likely not pass screening — say so clearly in the summary.

Return ONLY a JSON object matching this exact schema — no prose before or after:

{
  "match_score": <integer 0-100>,
  "match_breakdown": {
    "skills_match":     <integer 0-100>,
    "experience_match": <integer 0-100>,
    "language_match":   <integer 0-100>,
    "culture_fit":      <integer 0-100>,
    "summary":          <string in English>
  },
  "recommendations": {
    "strengths": [<string>, ...],
    "gaps":      [<string>, ...],
    "actions":   [<string>, ...]
  }
}
"""


def build_user_prompt(
    resume_text: str,
    job_title: str,
    job_description: str,
    japanese_level: str | None = None,
) -> str:
    """
    Build the user-turn prompt.

    resume_text     — plain text extracted from the uploaded resume file
    job_title       — original Japanese title (or translated title)
    job_description — translated Indonesian description (for scoring context)
    japanese_level  — candidate's self-reported JLPT level from profile, if known
    """
    parts: list[str] = [
        "Please score the match between this candidate's resume and the job posting.\n",
        f"JOB TITLE: {job_title}",
        f"\nJOB DESCRIPTION:\n{job_description}",
        f"\nCANDIDATE RESUME:\n{resume_text}",
    ]

    if japanese_level:
        parts.append(f"\nCANDIDATE JAPANESE LEVEL (self-reported): {japanese_level}")

    parts.append(
        "\nReturn the JSON object only. Do not include any explanation outside the JSON."
    )

    return "\n".join(parts)
