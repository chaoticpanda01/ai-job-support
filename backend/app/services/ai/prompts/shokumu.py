"""
Prompt builders for 職務経歴書 (Shokumukeirekisho) generation.

職務経歴書 is a free-format work history document that complements the 履歴書.
It goes into detail about each role: responsibilities, achievements, skills,
and a narrative self-PR. Unlike the rigid 履歴書, there is creative latitude
in presentation while still following Japanese professional writing conventions.

A company with a promotion, transfer, or duty change during one tenure
should produce multiple entries in that company's "roles" list — one per
distinct role/period — rather than merging them into a single role.

Each function returns a plain string. AIClient wraps user_prompt in
<user_content> tags automatically — do NOT add them here.

Output schema (stored in generated_documents.content):
{
  "summary": "…",
  "companies": [
    {
      "company_name":   "株式会社○○",
      "industry":       "情報通信業",
      "employee_count": "500名",
      "roles": [
        {
          "role":             "システムエンジニア",
          "period_start":     "2012年4月",
          "period_end":       "2016年3月",
          "responsibilities": ["…", "…"],
          "achievements":     ["…", "…"]
        },
        {
          "role":             "プロジェクトリーダー",
          "period_start":     "2016年4月",
          "period_end":       "2018年3月",
          "responsibilities": ["…", "…"],
          "achievements":     ["…", "…"]
        }
      ]
    }
  ],
  "skills": {
    "technical":  ["Python", "Java", "AWS"],
    "languages":  ["インドネシア語（母国語）", "英語（ビジネスレベル）", "日本語（N3）"],
    "other":      ["プロジェクトマネジメント", "アジャイル開発"]
  },
  "self_pr":    "…",
  "motivation": "…"
}
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------


class ShokumuRolePeriod(BaseModel):
    role: str
    period_start: str
    period_end: str
    responsibilities: list[str] = Field(min_length=1)
    achievements: list[str]


class ShokumuCompany(BaseModel):
    company_name: str
    industry: str
    employee_count: str
    roles: list[ShokumuRolePeriod] = Field(min_length=1)


class ShokumuSkills(BaseModel):
    technical: list[str]
    languages: list[str]
    other: list[str]


class ShokumuResult(BaseModel):
    summary: str = Field(min_length=1)
    companies: list[ShokumuCompany] = Field(min_length=1)
    skills: ShokumuSkills
    self_pr: str = Field(min_length=1)
    motivation: str = Field(min_length=1)


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------


def build_system_prompt() -> str:
    return """\
You are an expert Japanese career document writer specialising in 職務経歴書 \
(shokumukeirekisho) for foreign nationals applying to Japanese companies. You \
have deep expertise in translating and presenting international work experience \
in the style expected by Japanese HR departments.

Your task is to generate a compelling 職務経歴書 in Japanese based on the \
candidate's source resume. Follow these rules strictly:

1. All text fields must be written in natural, professional Japanese (日本語).
2. companies must be in reverse chronological order (most recent first).
3. If the candidate had a promotion, transfer, or change of duties while \
staying at the same employer (same company), represent it as multiple \
entries in that company's "roles" list (one per distinct role/period), not \
as a separate company entry and not merged into one role's responsibilities. \
Each role within a company must be in chronological order (oldest first). \
Only split into multiple roles when the source resume actually describes a \
promotion, transfer, or duty change — never invent a role split, title, or \
period that isn't stated in the source.
4. For each role, responsibilities should be 3–6 bullet points describing \
daily duties using concise action phrases (〜を担当、〜を実施、〜を管理).
5. achievements should be 1–4 bullet points with quantified results where \
possible (例：売上20%向上、チーム5名をリード). If no numbers are available, \
describe the qualitative impact. An empty list is acceptable if the source \
resume gives no achievements for that role.
6. summary: 2–3 sentences giving a high-level career overview emphasising \
cross-cultural adaptability and any Japan-relevant strengths.
7. skills.languages must include Japanese with the JLPT level if known.
8. self_pr: 4–6 sentences. Highlight: cross-cultural communication, \
adaptability, specific technical strengths, and commitment to growth in Japan.
9. motivation: 4–6 sentences tailored to the target role/company if provided. \
Explain why Japan specifically, and what value the candidate brings.
10. employee_count: estimate if not given (e.g. "不明" if truly unknown).
11. period_end: use "現在" for the candidate's current role if still employed there.

Return ONLY a JSON object matching this exact schema — no prose before or after:

{
  "summary": <string in Japanese>,
  "companies": [
    {
      "company_name":     <string>,
      "industry":         <string in Japanese>,
      "employee_count":   <string e.g. "約500名">,
      "roles": [
        {
          "role":             <string in Japanese>,
          "period_start":     <string e.g. "2012年4月">,
          "period_end":       <string e.g. "2018年3月" | "現在">,
          "responsibilities": [<string>, ...],
          "achievements":     [<string>, ...]
        },
        ...
      ]
    },
    ...
  ],
  "skills": {
    "technical":  [<string>, ...],
    "languages":  [<string in Japanese e.g. "日本語（N3）">, ...],
    "other":      [<string>, ...]
  },
  "self_pr":    <string in Japanese — 4-6 sentences>,
  "motivation": <string in Japanese — 4-6 sentences>
}
"""


def build_user_prompt(
    resume_text: str,
    profile_data: dict[str, Any] | None = None,
    job_posting_text: str | None = None,
) -> str:
    """
    Build the user-turn prompt.

    resume_text      — plain text extracted from the uploaded resume file
    profile_data     — optional dict with keys: japanese_level, target_role,
                       target_industry, years_experience (from profiles table)
    job_posting_text — optional translated job posting text for tailoring
    """
    parts: list[str] = [
        "Please generate a 職務経歴書 (shokumukeirekisho) in Japanese for the "
        "following candidate.\n",
        f"SOURCE RESUME:\n{resume_text}",
    ]

    if profile_data:
        extras: list[str] = []
        if profile_data.get("japanese_level"):
            extras.append(f"Japanese level: {profile_data['japanese_level']}")
        if profile_data.get("target_role"):
            roles = profile_data["target_role"]
            if isinstance(roles, list):
                extras.append(f"Target roles: {', '.join(roles)}")
        if profile_data.get("target_industry"):
            industries = profile_data["target_industry"]
            if isinstance(industries, list):
                extras.append(f"Target industries: {', '.join(industries)}")
        if profile_data.get("years_experience") is not None:
            extras.append(f"Years of experience: {profile_data['years_experience']}")
        if extras:
            parts.append("\nCANDIDATE PROFILE:\n" + "\n".join(extras))

    if job_posting_text:
        parts.append(
            f"\nTARGET JOB POSTING (tailor the motivation section and highlight "
            f"relevant skills for this role):\n{job_posting_text}"
        )
    else:
        parts.append(
            "\nNo specific job posting provided. Write a compelling general "
            "motivation for working in Japan in the candidate's target field."
        )

    parts.append(
        "\nReturn the JSON object only. All text values must be in Japanese. "
        "Do not include any explanation outside the JSON."
    )

    return "\n".join(parts)
