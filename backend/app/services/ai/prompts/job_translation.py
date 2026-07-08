"""
Prompt builders for Japanese job posting translation.

Translates a Japanese job posting (pasted URL text or raw text) into
Indonesian, extracts structured data, and scores foreigner-friendliness.

Each function returns a plain string. AIClient wraps user_prompt in
<user_content> tags automatically — do NOT add them here.

Output schema (stored in job_postings columns):
{
  "translated_title":       "…",
  "translated_description": "…",
  "translation_summary":    "…",
  "foreigner_friendliness_score": 0–100,
  "structured_data": {
    "company_name":      "…",
    "location":          "…",
    "employment_type":   "…",
    "salary_range":      "…",
    "required_japanese": "N1|N2|N3|N4|N5|none",
    "required_experience_years": 0,
    "key_requirements":  ["…"],
    "benefits":          ["…"],
    "visa_sponsorship":  true|false|null
  }
}
"""

from __future__ import annotations

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------


class JobStructuredData(BaseModel):
    company_name: str
    location: str
    employment_type: str
    salary_range: str
    required_japanese: str  # "N1"|"N2"|"N3"|"N4"|"N5"|"none"
    required_experience_years: int = Field(ge=0)
    key_requirements: list[str]
    benefits: list[str]
    visa_sponsorship: bool | None = None


class JobTranslationResult(BaseModel):
    translated_title: str = Field(min_length=1)
    translated_description: str = Field(min_length=1)
    translation_summary: str = Field(min_length=1)
    foreigner_friendliness_score: int = Field(ge=0, le=100)
    structured_data: JobStructuredData


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------


def build_system_prompt() -> str:
    return """\
You are an expert bilingual career consultant fluent in Japanese and Indonesian, \
specialising in the Japanese job market for foreign nationals. You help Indonesian \
professionals understand Japanese job postings by translating them accurately and \
extracting key information.

Your task is to translate a Japanese job posting into Indonesian (Bahasa Indonesia) \
and extract structured data. Follow these rules:

1. translated_title: Translate the job title into Indonesian. Keep company names in \
their original form.
2. translated_description: Full translation of the posting into natural, professional \
Indonesian. Preserve all requirements, responsibilities, and benefits. Do not \
summarise or omit any section.
3. translation_summary: A concise 3–5 sentence Indonesian summary highlighting the \
most important points a candidate needs to know.
4. foreigner_friendliness_score (0–100): Assess how accessible this role is to a \
foreign (Indonesian) applicant based on:
   - Japanese language requirement (lower requirement = higher score)
   - Visa sponsorship availability (yes = higher score)
   - International team / English usage mentioned (yes = higher score)
   - Industry familiarity for Indonesian workers (manufacturing, IT, care = higher)
   Scoring guide:
     0–30   Very difficult: high Japanese requirement, no visa support mentioned
     31–60  Challenging: N3+ required, visa support unclear
     61–80  Accessible: N4/N5 or none, some foreigner-friendly signals
     81–100 Very accessible: no/low Japanese required, visa sponsorship confirmed
5. structured_data: Extract from the original posting. Use "none" for \
required_japanese if no JLPT level is specified. Set visa_sponsorship to null if \
not mentioned.

Return ONLY a JSON object matching this exact schema — no prose before or after:

{
  "translated_title": <string in Indonesian>,
  "translated_description": <string in Indonesian — full translation>,
  "translation_summary": <string in Indonesian — 3-5 sentences>,
  "foreigner_friendliness_score": <integer 0-100>,
  "structured_data": {
    "company_name":               <string>,
    "location":                   <string>,
    "employment_type":            <string — e.g. "正社員", "契約社員", "アルバイト">,
    "salary_range":               <string — as stated in posting>,
    "required_japanese":          <"N1"|"N2"|"N3"|"N4"|"N5"|"none">,
    "required_experience_years":  <integer — 0 if fresh graduate welcome>,
    "key_requirements":           [<string>, ...],
    "benefits":                   [<string>, ...],
    "visa_sponsorship":           <true|false|null>
  }
}
"""


def build_user_prompt(
    job_text: str,
    source_url: str | None = None,
) -> str:
    """
    Build the user-turn prompt.

    job_text   — raw text of the job posting (pasted by the user)
    source_url — optional URL the user provided (included for context only,
                 not fetched — ToS compliance)
    """
    parts: list[str] = []

    if source_url:
        parts.append(f"Source URL (for reference only): {source_url}\n")

    parts.append("Please translate and analyse the following Japanese job posting.\n")
    parts.append(f"JOB POSTING:\n{job_text}")
    parts.append("\nReturn the JSON object only. Do not include any explanation outside the JSON.")

    return "\n".join(parts)
