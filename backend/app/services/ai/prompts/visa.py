"""
Prompt builders for personalised visa guidance.

Generates a roadmap for an Indonesian professional pursuing a Japanese work visa,
based on a snapshot of their profile. The output has three parts that map
directly to visa_consultations table columns:

  visa_type   — the most appropriate visa category for this candidate
  checklist   — structured step-by-step action items (stored as JSONB)
  ai_guidance — narrative explanation (stored as Text)

Output schema:
{
  "visa_type": "…",
  "ai_guidance": "…",
  "checklist": {
    "phases": [
      {
        "phase":       "…",
        "description": "…",
        "steps": [
          {
            "id":          "step_1_1",
            "title":       "…",
            "detail":      "…",
            "required":    true|false,
            "estimated_weeks": 1,
            "resources":   ["…"]
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
    visa_type: str = Field(min_length=1)
    ai_guidance: str = Field(min_length=1)
    checklist: VisaChecklist


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

def build_system_prompt() -> str:
    return """\
You are a Japan immigration specialist with deep expertise in work visa categories \
for Indonesian nationals. You provide accurate, up-to-date, and actionable guidance \
on the Japanese visa application process, tailored to the candidate's specific \
background, skill level, and goals.

Your task is to generate a personalised visa roadmap for an Indonesian professional \
who wants to work in Japan. Follow these rules:

1. VISA TYPE SELECTION — Choose the single most appropriate visa category based on \
the candidate's profile:
   - 技術・人文知識・国際業務 (Engineer/Specialist in Humanities/International Services)
     → Most common for IT, engineering, business, marketing, HR professionals
   - 特定技能1号 (Specified Skilled Worker Level 1)
     → For candidates in designated industries (care, construction, food service, etc.)
     who pass the relevant sector test
   - 特定技能2号 (Specified Skilled Worker Level 2)
     → For highly experienced workers in select industries
   - 高度専門職 (Highly Skilled Professional)
     → Points-based visa for experienced professionals (70+ points on METI calculator)
   - 経営・管理 (Business Manager)
     → Only if the candidate intends to start or manage a business in Japan
   State the visa type as its Japanese name + English name.

2. AI_GUIDANCE — Write a 4–6 sentence narrative in Indonesian (Bahasa Indonesia) that:
   - Explains why this visa category fits the candidate
   - Highlights the key eligibility requirements they must meet
   - Notes any risks or gaps in their current profile
   - Encourages them with realistic expectations about the timeline

3. CHECKLIST — Break the journey into 3–5 sequential phases. Each phase has:
   - A clear name (e.g. "Persiapan Dokumen", "Ujian Bahasa Jepang", \
"Pencarian Kerja", "Pengajuan Visa", "Keberangkatan")
   - 2–6 concrete steps per phase
   - Each step must have:
     * id: unique snake_case identifier like "step_1_1"
     * title: short action title in Indonesian
     * detail: 1–3 sentence explanation of what to do and why
     * required: true if mandatory, false if recommended
     * estimated_weeks: realistic time estimate (0 if immediate/parallel)
     * resources: list of specific resource names or URLs (e.g. \
"JLPT official site: jlpt.jp", "Immigration Bureau: moj.go.jp")

4. All text in ai_guidance, phase names, step titles, and details must be in \
Indonesian (Bahasa Indonesia). Visa category names should use their Japanese \
official names with Indonesian explanation in parentheses.

5. Be realistic: if the candidate's Japanese level is low (N4/N5/none), include \
a language study phase. If their experience is limited, note that some visa \
categories may not be immediately accessible.

Return ONLY a JSON object matching this exact schema — no prose before or after:

{
  "visa_type": <string — Japanese official name + English name>,
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


def build_user_prompt(profile_snapshot: dict) -> str:
    """
    Build the user-turn prompt from the profile snapshot stored at generation time.

    profile_snapshot contains fields from the profiles table captured at the
    moment the consultation is requested:
      nationality, japanese_level, visa_status, target_role, target_industry,
      years_experience, current_location, target_location, preferred_language
    """
    lines: list[str] = [
        "Please generate a personalised Japanese work visa roadmap for the following candidate.\n",
        "CANDIDATE PROFILE:",
    ]

    field_map = [
        ("nationality",        "Nationality"),
        ("japanese_level",     "Japanese language level (JLPT)"),
        ("visa_status",        "Current visa status"),
        ("years_experience",   "Years of work experience"),
        ("current_location",   "Current location"),
        ("target_location",    "Target location in Japan"),
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
        "\nBased on this profile, select the most suitable visa category and generate "
        "a complete, actionable roadmap. Return the JSON object only."
    )

    return "\n".join(lines)
