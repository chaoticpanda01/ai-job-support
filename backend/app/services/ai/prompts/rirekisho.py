"""
Prompt builders for 履歴書 (Rirekisho) generation.

履歴書 is the standard Japanese résumé form. It is highly structured and
follows strict conventions: chronological education/work history written in
Japanese, personal information, self-PR, and motivation statement.

Each function returns a plain string. AIClient wraps user_prompt in
<user_content> tags automatically — do NOT add them here.

Output schema (stored in generated_documents.content):
{
  "personal": {
    "name_kanji":    "山田 太郎",
    "name_kana":     "ヤマダ タロウ",
    "date_of_birth": "1990年1月15日",
    "age":           35,
    "gender":        "男性",
    "address":       "東京都渋谷区…",
    "phone":         "090-1234-5678",
    "email":         "example@email.com"
  },
  "education": [
    {"year": 2012, "month": 3, "entry": "○○大学 ○○学部 卒業"}
  ],
  "work_history": [
    {"year": 2012, "month": 4, "entry": "株式会社○○ 入社"},
    {"year": 2018, "month": 3, "entry": "株式会社○○ 一身上の都合により退職"}
  ],
  "qualifications": ["普通自動車免許（第一種）", "日本語能力試験N3"],
  "self_pr":   "…",
  "motivation": "…"
}
"""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------

class RirekishoEntry(BaseModel):
    year: int = Field(ge=1950, le=2100)
    month: int = Field(ge=1, le=12)
    entry: str = Field(min_length=1)


class RirekishoPersonal(BaseModel):
    name_kanji: str
    name_kana: str
    date_of_birth: str
    age: int = Field(ge=16, le=80)
    gender: str
    address: str
    phone: str
    email: str


class RirekishoResult(BaseModel):
    personal: RirekishoPersonal
    education: list[RirekishoEntry]
    work_history: list[RirekishoEntry]
    qualifications: list[str]
    self_pr: str = Field(min_length=1)
    motivation: str = Field(min_length=1)


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

def build_system_prompt() -> str:
    return """\
You are an expert Japanese career document writer specialising in 履歴書 \
(rirekisho) for foreign nationals applying to Japanese companies. You have \
deep knowledge of Japanese HR conventions, the JIS standard résumé format, \
and how to present Indonesian work experience in a way that resonates with \
Japanese hiring managers.

Your task is to generate a complete, properly formatted 履歴書 in Japanese \
based on the candidate's source resume. Follow these rules strictly:

1. All text fields (entries, self_pr, motivation) must be written in natural \
Japanese (日本語). Translate experience and achievements into Japanese.
2. Education and work history must be in chronological order (oldest first).
3. Each education/work entry must be a single concise line following the \
convention: "学校名/会社名 + 入学/卒業/入社/退職" etc.
4. self_pr (自己PR): 3–5 sentences highlighting strengths relevant to \
Japanese workplace culture — teamwork (チームワーク), diligence (勤勉さ), \
adaptability (適応力).
5. motivation (志望動機): 3–5 sentences tailored to the target role/company \
if provided, otherwise write a compelling general motivation for working in Japan.
6. For foreign nationals without a Japanese address, use their current address.
7. Gender: use "男性" or "女性". If unspecified, omit (use empty string).
8. Infer age from date of birth if not explicitly stated.

Return ONLY a JSON object matching this exact schema — no prose before or after:

{
  "personal": {
    "name_kanji":    <string — name in kanji or romaji if no kanji>,
    "name_kana":     <string — name in katakana>,
    "date_of_birth": <string — "YYYY年M月D日" format>,
    "age":           <integer>,
    "gender":        <string — "男性" | "女性" | "">,
    "address":       <string>,
    "phone":         <string>,
    "email":         <string>
  },
  "education": [
    {"year": <int>, "month": <int 1-12>, "entry": <string in Japanese>},
    ...
  ],
  "work_history": [
    {"year": <int>, "month": <int 1-12>, "entry": <string in Japanese>},
    ...
  ],
  "qualifications": [<string in Japanese>, ...],
  "self_pr":    <string in Japanese — 3-5 sentences>,
  "motivation": <string in Japanese — 3-5 sentences>
}
"""


def build_user_prompt(
    resume_text: str,
    profile_data: dict | None = None,
    job_posting_text: str | None = None,
) -> str:
    """
    Build the user-turn prompt.

    resume_text      — plain text extracted from the uploaded resume file
    profile_data     — optional dict with keys: japanese_level, target_role,
                       target_location, years_experience (from profiles table)
    job_posting_text — optional translated job posting text for motivation tailoring
    """
    parts: list[str] = [
        "Please generate a 履歴書 (rirekisho) in Japanese for the following candidate.\n",
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
        if profile_data.get("target_location"):
            extras.append(f"Target location: {profile_data['target_location']}")
        if profile_data.get("years_experience") is not None:
            extras.append(f"Years of experience: {profile_data['years_experience']}")
        if extras:
            parts.append("\nCANDIDATE PROFILE:\n" + "\n".join(extras))

    if job_posting_text:
        parts.append(
            f"\nTARGET JOB POSTING (tailor the motivation section to this role):\n"
            f"{job_posting_text}"
        )
    else:
        parts.append(
            "\nNo specific job posting provided. Write a general motivation for "
            "working in Japan in the candidate's target field."
        )

    parts.append(
        "\nReturn the JSON object only. All text values must be in Japanese. "
        "Do not include any explanation outside the JSON."
    )

    return "\n".join(parts)
