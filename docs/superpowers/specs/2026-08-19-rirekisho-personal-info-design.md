# Rirekisho personal-info sourcing — design

**Date:** 2026-08-19
**Status:** Approved, pending implementation plan

## Problem

The 履歴書 (rirekisho) generator asks Gemini to invent the entire `personal`
block — name in kana, date of birth, age, gender, address, phone — purely
from the text of an uploaded resume. Neither `User` nor `Profile` has any of
these fields today, and the platform's target users (Indonesian professionals
writing resumes by international convention) typically omit date of birth,
gender, and photos from their source resumes entirely — the exact fields a
rirekisho needs most. The result: a legally-relevant section of a document
users may submit to real employers is generated with no reliable source of
truth, no human review step before download, and a hard schema constraint
(`age: ge=16, le=80`) that either produces a fabricated value or fails
generation outright when date of birth can't be inferred.

Reviewing a real, successful rirekisho (shared by the user, who used it to
land an engineer/consultant offer one month prior) confirmed the affected
fields are genuinely load-bearing — furigana, date of birth, gender, address,
and phone all appear — and additionally surfaced two fields the current
schema has no slot for at all: a 国籍・ビザ (nationality/visa) line showing
visa category and residence card expiration date.

## Scope

Two phases, one spec, sequential implementation:

- **Phase 1 — Collect the data.** A new final onboarding step gathers the
  seven fields that have no source today.
- **Phase 2 — Use the data.** The rirekisho generator stops asking Gemini to
  invent personal/visa info and assembles it directly from the database.

Out of scope for this spec (explicitly deferred, not forgotten):
photo upload/placement, a 特技・趣味 (hobbies/skills) section, and a
本人希望記入欄 (special requests) section — all present on the real example
résumé, none currently in `RirekishoResult` or `_render_rirekisho`. These are
document-template gaps independent of the data-sourcing problem this spec
solves, and are large enough to warrant their own follow-up spec.

## Phase 1 — Onboarding step

### Fields

Seven required fields, added as nullable columns on `profiles`:

| Column | Type | Notes |
|---|---|---|
| `name_kana` | `str` | Katakana reading of full name (ふりがな) |
| `date_of_birth` | `date` | |
| `gender` | enum `male` \| `female` | Deliberately binary, not free text — the only thing this field does is print 男性/女性 on a JIS-format document that has no third printed option |
| `phone_number` | `str` | |
| `mailing_address` | `str` | Full postal address — distinct from the existing `current_location` (city-level only) |
| `residence_card_expiration` | `date` | The expiration date printed on the user's 在留カード |
| `visa_category` | `str` \| `None` | Free text (e.g. "技術・人文知識・国際業務") — matches the existing free-text pattern used by `target_industry`/`target_role` rather than an enum, since categories vary too much to enumerate. Only required when `visa_status = held` |

All columns nullable at the DB level, matching the existing convention:
"required" is enforced by the onboarding wizard's Zod schema, not a DB
constraint — the same pattern already used for `current_location` /
`target_location`.

### Position in onboarding

This step is placed **last**, after the existing step 4 (Japanese
level/visa/preferences) — not in the numerically-available gap at step 3.
Reason: `visa_category` is only meaningful when `visa_status = held`, and
`visa_status` itself isn't known until step 4 completes. Placing the new
step after step 4 lets it read the just-saved `visa_status` (via the
existing `useMe()` query) and conditionally show/require `visa_category`
correctly, with no duplicate "do you have a visa?" question anywhere.

Consequence: the onboarding-completion boundary moves.
- `Profile.onboarding_completed` (a Postgres `STORED GENERATED` column)
  changes from `onboarding_step = 4` to `onboarding_step = 5`.
- The `profiles_onboarding_step_range` CHECK constraint changes from
  `BETWEEN 0 AND 4` to `BETWEEN 0 AND 5`.
- Any user who already reached `onboarding_step = 4` under the old rule
  stops reading as "complete" until they finish the new step. Accepted as
  correct — there is no production user base to migrate around.

### Layout

Single page, grouped into three labeled sections (matches how the rirekisho
itself is visually sectioned):

- **本人情報** — name_kana, date_of_birth, gender
- **連絡先** — phone_number, mailing_address
- **ビザ情報** — residence_card_expiration, visa_category (only rendered
  when `visa_status === "held"`)

### Frontend implementation shape

- New `Step5` component in `frontend/app/onboarding/page.tsx`, following the
  exact structure of `Step2`/`Step3`/`Step4` (react-hook-form + zodResolver).
- `TOTAL_STEPS`: 4 → 5.
- `Step4`'s `onNext` no longer routes to the dashboard on completion — it
  calls `setStep(5)`. It still saves `onboarding_step: 4` (unchanged value).
- `Step5`'s `onNext` saves all required fields (`visa_category` only if
  applicable) plus `onboarding_step: 5`, then routes to
  `/dashboard/resumes`.
- New Zod schema `step5Schema`: all fields required except `visa_category`,
  which is conditionally required only when the already-loaded
  `me.profile.visa_status === "held"`.
- New i18n keys under the existing `t("onboarding", "s5...", lang)`
  convention, for all three languages (en/id/ja).

### Backend implementation shape

- `ProfileResponse` and `ProfileUpdateRequest` (`app/schemas/user.py`) gain
  the seven new fields.
- `ProfileUpdateRequest.onboarding_step` bound: `le=4` → `le=5`.
- New Alembic migration adding the seven columns and altering the
  generated-column expression + CHECK constraint described above.
  `database/schema.sql` updated to match (source of truth per project
  convention — DDL is never written anywhere else).

## Phase 2 — Wiring into rirekisho generation

### Source-of-truth table

| Output field | Source (unchanged) |
|---|---|
| `education`, `work_history`, `qualifications`, `self_pr`, `motivation` | Gemini, from `resume_text` (+ `profile_data` context) — **unchanged** |

| Output field | Source (was → becomes) |
|---|---|
| `name_kanji` | Gemini-inferred → `User.full_name` |
| `name_kana` | Gemini-inferred → `Profile.name_kana` |
| `date_of_birth` / `age` | Gemini-inferred → `Profile.date_of_birth`; age computed as of generation date (`date.today()`), matching real-world convention (a rirekisho's stated age reflects the day it's written) |
| `gender` | Gemini-inferred → `Profile.gender`, mapped `male → 男性`, `female → 女性` |
| `address` | Gemini-inferred → `Profile.mailing_address` |
| `phone` | Gemini-inferred → `Profile.phone_number` |
| *(new)* nationality/visa line | did not exist → `Profile.nationality` + `Profile.visa_category` + `Profile.residence_card_expiration`, shown only when `visa_status = held` |

### Schema changes

`app/services/ai/prompts/rirekisho.py`:
- `RirekishoResult` drops the `personal` field entirely — Gemini's JSON
  response no longer includes it, and the prompt's output-schema
  description is updated to match. This isn't just an instruction to
  ignore resume-text personal info; removing the field from the schema
  makes it structurally impossible for Gemini to re-emit a stale or
  incorrect value even if the resume text happens to contain one.
- `RirekishoPersonal` and a new `RirekishoVisaInfo` model remain as Pydantic
  models, but are now instantiated directly by `document_generator.py` from
  trusted `User`/`Profile` rows — not sent through `parse_response()`. They
  still provide a validation boundary (e.g. an unexpectedly invalid
  `date_of_birth`) even though the data is DB-sourced, not LLM-sourced.

  ```python
  class RirekishoVisaInfo(BaseModel):
      nationality: str
      visa_category: str | None = None
      residence_card_expiration: str | None = None  # pre-formatted, see below
  ```

### Generation flow changes

`app/services/document_generator.py`:
- Loads `User` (currently not loaded directly — only `Resume` and
  `Profile`) to get `full_name`.
- **New fail-fast check**, only for `document_type == rirekisho`: before
  calling Gemini, verify `Profile` has all fields required by this spec
  (`name_kana`, `date_of_birth`, `gender`, `phone_number`,
  `mailing_address`, `full_name`; plus `visa_category` and
  `residence_card_expiration` if `visa_status == held`). If anything's
  missing, raise `DocumentGenerationError` with a clear, actionable message
  ("Complete your profile before generating a 履歴書.") rather than
  producing blank fields or hitting a schema-validation failure deep in the
  pipeline. This surfaces through the existing failed-status UI
  (`error_message` on the document) with no new frontend work needed.
  `職務経歴書` is unaffected — it has no personal-info section and never had
  this problem.
- Assembles `RirekishoPersonal` and `RirekishoVisaInfo` directly from
  `User`/`Profile`, merges them into the `content` dict alongside Gemini's
  `education`/`work_history`/`qualifications`/`self_pr`/`motivation`.

### Template changes

`_render_rirekisho()` in `document_generator.py`:
- Personal-info table renders from the Python-assembled block exactly as
  today (no visual change to that table).
- Age display gains the `満` prefix seen on the real example (`満29歳`, not
  the current bare `{age}歳`) — a small, adjacent fix bundled with this
  work since it's the same line being touched.
- New row/section for 国籍・ビザ, rendered as
  `{nationality}（{visa_category}）　有効期限：{residence_card_expiration}`
  when `visa_category` is present, or `{nationality}` alone otherwise —
  `RirekishoVisaInfo.visa_category`/`residence_card_expiration` are already
  `None` for non-held users by construction (Phase 1 only collects them
  when `visa_status = held`), so the renderer doesn't need `visa_status`
  threaded in separately.
- `residence_card_expiration` is formatted as plain Western calendar
  (`YYYY年MM月DD日` via ordinary `strftime`), **not** run through
  `format_wareki_full()` — the real example shows the visa expiration date
  in Western format while the birth date uses 和暦, and that distinction is
  intentional, not an inconsistency to "fix."

## Error handling

Only one new case: the Phase 2 fail-fast profile-completeness check
described above. Everything else follows patterns already established in
the codebase — `ApiClientError` surfaced via the existing error banner on
the frontend, `DocumentGenerationError` caught and recorded by
`_run_generation` on the backend.

## Testing

**Backend:** unit tests for `document_generator.generate()` with (a) a
complete profile — asserts the personal/visa blocks match the DB values
exactly, not LLM-invented text — and (b) an incomplete profile — asserts
the new fail-fast `DocumentGenerationError`. Existing `RirekishoResult`/
prompt tests updated to reflect the shrunk schema (no `personal` field).
Standard project conventions apply: `ruff check`, `ruff format --check`,
`mypy app/`, `pytest`.

**Frontend:** this project has no automated UI test suite (confirmed —
only `type-check`/`lint`/`format` exist as scripts). `Step5` gets the same
verification as prior frontend changes in this project: type-check, lint,
format, and code review — the browser preview is blocked by Clerk, per
established project convention.
