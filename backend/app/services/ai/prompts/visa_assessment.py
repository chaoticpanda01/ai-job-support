"""
Prompt builders for the visa ASSESSMENT call.

Given a snapshot of an Indonesian professional's profile, evaluate them against
every relevant Japanese work visa category and return one entry per category
with an eligibility verdict. This is deliberately cheap: no checklists, so the
response stays small and the user sees their options fast. The roadmap for a
chosen category is generated separately by prompts/visa_roadmap.py.

Output schema:
{
  "options": [
    {
      "visa_type":        "…",
      "eligibility":      "eligible" | "eligible_with_gaps" | "not_eligible",
      "summary":          "…",
      "key_requirements": ["…"],
      "gaps":             ["…"],
      "estimated_months": 6,
      "recommended":      true
    }
  ]
}

Each function returns a plain string. AIClient wraps user_prompt in
<user_content> tags automatically — do NOT add them here.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class VisaOption(BaseModel):
    visa_type: str = Field(min_length=1, max_length=100)
    eligibility: Literal["eligible", "eligible_with_gaps", "not_eligible"]
    summary: str = Field(min_length=1)
    key_requirements: list[str]
    gaps: list[str]
    estimated_months: int = Field(ge=0)
    recommended: bool


class VisaAssessmentResult(BaseModel):
    options: list[VisaOption] = Field(min_length=1)

    @model_validator(mode="after")
    def exactly_one_recommended(self) -> VisaAssessmentResult:
        """
        Normalise rather than reject. The model occasionally flags zero options
        (common when nothing is outright eligible) or several. Failing the whole
        assessment over a boolean would waste a paid call, so: keep the first
        flagged option, and if none was flagged promote the first listed one —
        the prompt orders options best-first, so that is the nearest achievable
        path.
        """
        flagged = [o for o in self.options if o.recommended]
        winner = flagged[0] if flagged else self.options[0]
        for option in self.options:
            option.recommended = option is winner
        return self


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------


def build_system_prompt() -> str:
    return """\
You are a Japan immigration specialist with deep expertise in work visa categories \
for Indonesian nationals. You provide accurate, up-to-date, and actionable guidance \
on the Japanese visa application process, tailored to the candidate's specific \
background, skill level, and goals.

Your task is to ASSESS an Indonesian professional against every relevant Japanese \
work visa category and report what each one would mean for them. Do NOT pick a \
single category and discard the rest — the candidate makes that choice themselves.

1. CATEGORIES — Evaluate the candidate against each of these:
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
   Return 3–5 options — the categories that are genuinely worth this candidate's \
consideration. Omit a category only when it is entirely irrelevant to them (for \
example 経営・管理 for a candidate with no interest in running a business). State \
each visa_type as its Japanese official name + English name.

2. ELIGIBILITY — Give each option one verdict:
   - "eligible"           → they meet the requirements today
   - "eligible_with_gaps" → reachable, but something is missing (language level, \
a sector test, years of experience)
   - "not_eligible"       → not a realistic path for this candidate now
   For "eligible", gaps MUST be an empty list.

3. ORDER AND RECOMMENDATION — List options best-first, and set "recommended": true \
on exactly one — the strongest realistic path. If nothing is currently "eligible", \
recommend the nearest achievable option (the one whose gaps are most closable), \
never none.

4. PER-OPTION CONTENT:
   - summary: 2–3 sentences in Indonesian explaining why this category does or \
does not fit this specific candidate
   - key_requirements: the concrete requirements for this category (3–6 items)
   - gaps: what this candidate is missing right now (empty list if none)
   - estimated_months: realistic months from today to holding this visa

5. All prose (summary, key_requirements, gaps) must be in Indonesian \
(Bahasa Indonesia). This does NOT apply to visa_type: per rule 1, visa_type is \
always the Japanese official name + English name only — never add an \
Indonesian explanation there. If a category's name needs explaining, that \
explanation belongs in summary, which is already Indonesian prose per rule 4.

Return ONLY a JSON object matching this exact schema — no prose before or after:

{
  "options": [
    {
      "visa_type":        <string — Japanese official name + English name>,
      "eligibility":      <"eligible" | "eligible_with_gaps" | "not_eligible">,
      "summary":          <string in Indonesian — 2-3 sentences>,
      "key_requirements": [<string in Indonesian>, ...],
      "gaps":             [<string in Indonesian>, ...],
      "estimated_months": <integer>,
      "recommended":      <boolean>
    }
  ]
}"""


def build_user_prompt(profile_snapshot: dict[str, Any]) -> str:
    """
    Build the user-turn prompt from the profile snapshot captured at assessment
    time: nationality, japanese_level, visa_status, target_role, target_industry,
    years_experience, current_location, target_location, preferred_language.
    """
    lines: list[str] = [
        "Please assess the following candidate against the Japanese work visa categories.\n",
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
        "\nAssess this candidate against every relevant visa category and return "
        "the JSON object only."
    )

    return "\n".join(lines)
