"""
Prompt builders for resume analysis.

Each function returns a plain string. The AIClient wraps user_prompt in
<user_content> tags automatically — do NOT add them here.

Output schema (JSON inside Claude's response):
{
  "japan_market_score": 0–100,
  "strengths": ["…"],
  "gaps": ["…"],
  "recommendations": ["…"],
  "language_assessment": "…",
  "estimated_japanese_level_required": "N1"|"N2"|"N3"|"N4"|"N5"|"none",
  "summary": "…"
}
"""

from __future__ import annotations

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Response schema — used by ResponseParser to validate Claude's output
# ---------------------------------------------------------------------------


class ResumeAnalysisResult(BaseModel):
    japan_market_score: int = Field(ge=0, le=100)
    strengths: list[str]
    gaps: list[str]
    recommendations: list[str]
    language_assessment: str
    estimated_japanese_level_required: str
    summary: str


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------


def build_system_prompt() -> str:
    return """\
You are a career consultant specialising in helping Indonesian professionals \
enter the Japanese job market. You have deep knowledge of Japanese workplace \
culture, HR expectations, and the specific challenges faced by foreign workers \
seeking employment in Japan.

Your task is to analyse a resume and produce a structured JSON assessment. \
Be honest, specific, and actionable. Always respond in English.

Return ONLY a JSON object matching this exact schema — no prose before or after:

{
  "japan_market_score": <integer 0-100>,
  "strengths": [<string>, ...],
  "gaps": [<string>, ...],
  "recommendations": [<string>, ...],
  "language_assessment": <string>,
  "estimated_japanese_level_required": "<N1|N2|N3|N4|N5|none>",
  "summary": <string>
}

Scoring guide for japan_market_score:
  0–30   Significant gaps; major rework needed before applying
  31–60  Moderate fit; targeted improvements would help
  61–80  Good fit; minor adjustments recommended
  81–100 Strong fit; ready to apply with minimal changes
"""


def build_user_prompt(
    resume_text: str,
    job_posting_text: str | None = None,
) -> str:
    """
    Build the user-turn prompt.

    resume_text        — extracted plain text from the uploaded file
    job_posting_text   — optional; if provided, score is relative to this role
    """
    parts: list[str] = [
        "Please analyse the following resume for the Japanese job market.\n",
        f"RESUME:\n{resume_text}",
    ]

    if job_posting_text:
        parts.append(
            f"\nTARGET JOB POSTING (use this to make the score and recommendations "
            f"specific to this role):\n{job_posting_text}"
        )
    else:
        parts.append(
            "\nNo specific job posting provided. Provide a general Japanese market assessment."
        )

    parts.append(
        "\nReturn the JSON assessment only. Do not include any explanation outside the JSON."
    )

    return "\n".join(parts)
