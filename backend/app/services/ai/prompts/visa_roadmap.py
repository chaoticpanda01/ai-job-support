"""
Prompt builders for generating a roadmap for ONE already-chosen visa category.

The category is selected by the user from the options produced by
prompts/visa_assessment.py, so this prompt does not re-litigate the choice —
it produces the phased action plan for the category it is handed.

Output schema:
{
  "ai_guidance": "…",
  "checklist": {
    "phases": [
      {
        "phase":       "…",
        "description": "…",
        "steps": [
          {
            "id":              "step_1_1",
            "title":           "…",
            "detail":          "…",
            "required":        true|false,
            "estimated_weeks": 1,
            "resources":       ["…"]
          }
        ]
      }
    ]
  }
}

Each function returns a plain string. AIClient wraps user_prompt in
<user_content> tags automatically — do NOT add them here.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class VisaChecklistStep(BaseModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    detail: str = Field(min_length=1)
    required: bool
    estimated_weeks: int = Field(ge=0)
    resources: list[str]


class VisaChecklistPhase(BaseModel):
    phase: str = Field(min_length=1)
    description: str = Field(min_length=1)
    steps: list[VisaChecklistStep]


class VisaChecklist(BaseModel):
    phases: list[VisaChecklistPhase]


class VisaRoadmapResult(BaseModel):
    ai_guidance: str = Field(min_length=1)
    checklist: VisaChecklist


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------


def build_system_prompt() -> str:
    return """\
You are a Japan immigration specialist with deep expertise in work visa categories \
for Indonesian nationals. The candidate has ALREADY chosen which visa category they \
want to pursue. Your task is to produce the concrete action plan for that category — \
do not suggest a different one, and do not re-argue their choice.

1. AI_GUIDANCE — Write a 4–6 sentence narrative in Indonesian (Bahasa Indonesia) that:
   - Explains what this category requires of them specifically
   - Highlights the key eligibility requirements they must meet
   - Notes any risks or gaps in their current profile for THIS category
   - Encourages them with realistic expectations about the timeline

2. CHECKLIST — Break the journey into 3–5 sequential phases. Each phase has:
   - A clear name (e.g. "Persiapan Dokumen", "Ujian Bahasa Jepang", \
"Pencarian Kerja", "Pengajuan Visa", "Keberangkatan")
   - 2–6 concrete steps per phase
   - Each step must have:
     * id: unique snake_case identifier like "step_1_1" (phase index, step index)
     * title: short action title in Indonesian
     * detail: 1–3 sentence explanation of what to do and why
     * required: true if mandatory, false if recommended
     * estimated_weeks: realistic time estimate (0 if immediate/parallel)
     * resources: list of specific resource names or URLs (e.g. \
"JLPT official site: jlpt.jp", "Immigration Bureau: moj.go.jp")

3. All text in ai_guidance, phase names, step titles, and details must be in \
Indonesian (Bahasa Indonesia).

4. Be realistic and specific to the chosen category. If the candidate's Japanese \
level is below what this category needs, include a language study phase. If the \
category requires a sector skills test, make taking it an explicit step.

Return ONLY a JSON object matching this exact schema — no prose before or after:

{
  "ai_guidance": <string in Indonesian — 4-6 sentences>,
  "checklist": {
    "phases": [
      {
        "phase":       <string in Indonesian>,
        "description": <string in Indonesian — 1-2 sentences>,
        "steps": [
          {
            "id":               <string — "step_X_Y">,
            "title":            <string in Indonesian>,
            "detail":           <string in Indonesian>,
            "required":         <boolean>,
            "estimated_weeks":  <integer>,
            "resources":        [<string>, ...]
          }
        ]
      }
    ]
  }
}"""


def build_user_prompt(profile_snapshot: dict[str, Any], visa_type: str) -> str:
    """
    Build the user-turn prompt for the chosen category.

    visa_type has already been validated by the caller against the assessed
    options on the consultation, so it is never arbitrary client input.
    """
    lines: list[str] = [
        f"The candidate has chosen to pursue: {visa_type}\n",
        "Generate their roadmap for that visa category.\n",
        "CANDIDATE PROFILE:",
    ]

    field_map = [
        ("nationality", "Nationality"),
        ("japanese_level", "Japanese language level (JLPT)"),
        ("visa_status", "Current visa status"),
        ("years_experience", "Years of work experience"),
        ("current_location", "Current location"),
        ("target_location", "Target location in Japan"),
        ("preferred_language", "Preferred language"),
    ]

    for key, label in field_map:
        value = profile_snapshot.get(key)
        if value is not None:
            lines.append(f"  {label}: {value}")

    target_role = profile_snapshot.get("target_role")
    if target_role:
        roles = target_role if isinstance(target_role, list) else [target_role]
        lines.append(f"  Target role(s): {', '.join(str(r) for r in roles)}")

    target_industry = profile_snapshot.get("target_industry")
    if target_industry:
        industries = target_industry if isinstance(target_industry, list) else [target_industry]
        lines.append(f"  Target industry: {', '.join(str(i) for i in industries)}")

    lines.append(
        f"\nProduce a complete, actionable roadmap for {visa_type}. Return the JSON object only."
    )

    return "\n".join(lines)
