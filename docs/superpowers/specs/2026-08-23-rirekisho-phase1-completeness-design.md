# Rirekisho Phase 1: Template & Content Completeness — Design

## Context

An end-to-end comparison between a user's own hand-written 履歴書 (rirekisho) and the one this app generated from it surfaced two categories of problems:

1. **Personal-info fields didn't match** (birthdate, address, phone, visa expiry). Traced to the code: these fields are a strict, deliberate database pass-through — `document_generator.py` assembles them from `User`/`Profile` rows and the Gemini prompt explicitly forbids the model from touching them (`ai/prompts/rirekisho.py`). Confirmed with the user that this is correct behavior; the mismatch was stale/placeholder data in their saved profile, not a code defect. **No fix needed for this part.**
2. **The generated document is missing structural pieces a real rirekisho needs, and its work-history content is less complete than the source document the user uploaded** — confirmed as real gaps by reading the actual template-rendering code. This spec addresses those gaps.

This is Phase 1 of a larger roadmap the user approved (in order): (1) this completeness fix, (2) per-job/agency content tailoring, (3) a review/edit-before-finalizing draft workflow, (4) multi-format export (Word/Excel alongside PDF). Phases 2–4 are out of scope here and will get their own spec once Phase 1 ships — building them first would mean redoing work once Phase 3's draft data model exists.

## Goals

- Add the three structural sections a standard rirekisho has that the current PDF is missing: a photo box, a 特技・趣味 (hobbies/skills) box, and a 本人希望記入欄 (requests to employer) box.
- Fix work-history generation so it does not lose information present in the source resume: specifically, duty-description lines under a company, and a same-company role/duty change producing an additional dated row (not folding two different jobs' worth of context into one entry).
- Apply the equivalent work-history fix to the 職務経歴書 (shokumu) document, whose schema has the same structural limitation.
- Everything added here is optional input — a user who skips the photo or leaves hobbies blank still gets a valid, generatable document (matching how a paper rirekisho with a blank photo box or blank 特技・趣味 section is normal, not broken).

## Non-goals

- Changing how personal/visa fields flow (confirmed correct, see Context).
- Per-job/agency tailoring of self_pr or 志望動機 (Phase 2).
- A review/edit UI before finalizing a document (Phase 3).
- Word/Excel export (Phase 4).
- Cropping, resizing, or editing the uploaded photo — accept it as-is (validated for type/size only) and let WeasyPrint scale it to the fixed photo-box dimensions.

## A. Data model

Add three nullable columns to `Profile` (`backend/app/models/user.py`), following the precedent set by migration `0005_add_rirekisho_personal_info.py`:

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `photo_storage_key` | `String(500)` | yes | S3/B2 object key, same convention as `resumes/{user_id}/{uuid}{ext}` |
| `hobbies` | `Text` | yes | Free text, user-entered, never AI-generated |
| `special_skills` | `Text` | yes | Free text, user-entered, never AI-generated |

New migration `backend/migrations/versions/0006_add_photo_hobbies_skills.py`, matching house style: zero-padded sequential revision id, docstring linking to this spec, idempotent `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` DDL block (see `0005` for the exact pattern to copy).

None of these three fields are added to `_check_rirekisho_profile_complete()` — generation must still succeed with all three empty.

## B. Photo upload

**Storage:** new `FileStorage.upload_photo(*, file_bytes, user_id, original_filename, mime_type) -> str` in `backend/app/services/file_storage.py`, mirroring the existing `upload_resume()`. Key convention: `photos/{user_id}/{uuid4().hex}{ext}`. Allowed MIME types: `image/jpeg`, `image/png`. Size cap: 5MB (resumes use 10MB; a headshot photo doesn't need that much).

**API:** new endpoint `POST /profile/photo` in a location consistent with how the rest of profile mutation is organized (check `backend/app/api/v1/auth.py`'s `/auth/me` handlers for the existing pattern before picking the exact route). On success: upload via `FileStorage`, save the returned key to `Profile.photo_storage_key`, return a presigned URL for immediate frontend preview. Replacing a photo should delete the old object from storage before/after saving the new key, following whatever cleanup convention `upload_resume`'s callers already use for old resumes (verify during implementation — don't leave orphaned objects in the bucket).

**Frontend:** new `PhotoUploader.tsx` component modeled directly on `frontend/components/resume/ResumeUploader.tsx` (same `react-dropzone` + `useMutation` pattern, swapped to image MIME types and the new endpoint). Rendered in two places: onboarding step 5 (alongside the other rirekisho fields) and the Settings page (wherever the other rirekisho personal-info fields are already editable).

**PDF embedding:** at render time, `document_generator.py` downloads the photo bytes via the existing `FileStorage.download()` (already used elsewhere in this file) and inlines them as a base64 `data:` URI in the `<img>` tag — not a live URL fetch — so PDF rendering has no runtime dependency on network access to the storage bucket.

## C. Hobbies & skills fields

Two plain `<textarea>` fields, `hobbies` and `special_skills`, added to onboarding step 5's form and to Settings, using the same form-field pattern already used for the other rirekisho text fields (e.g. `mailing_address`). No AI involvement — these are exactly what the user types, verbatim, same trust model as the rest of the personal-info block.

## D. Rirekisho work-history schema & prompt fix

**Problem:** `RirekishoEntry` (`backend/app/services/ai/prompts/rirekisho.py`) is `{year: int, month: int, entry: str}` — one dated line per event. The prompt's own example shows exactly one 入社 line and one 退職 line per company. Nothing tells the model to add a line when the source resume describes a role or duty change *within* one company's tenure, and nothing supports an undated duty-description line under a dated entry. Result: real content in the uploaded source (e.g. "technical dispatch to a telecom client doing base-station design," followed later by "role changed to design-contract management, same company") gets compressed into a single generic line, or dropped.

**Fix:**
1. Change the entry schema so `year`/`month` are `int | None` — `None` renders as a blank cell, used for an undated duty-description line that follows a dated entry.
2. Update the system prompt (`build_system_prompt()`) with explicit instructions and a worked example covering:
   - A company with one undated duty-description line under its 入社 row (current behavior, made explicit).
   - A company where the source resume describes a role/duty change mid-tenure: emit a *second dated row* under the same company (new date, new duty text) rather than merging it into the first row or dropping it. Do not repeat the company name on this row — only the entry/exit rows name the company.
3. Update `document_generator.py`'s `_render_rirekisho()` table-rendering to handle a blank year/month cell (verify current code's assumptions before changing — it may already tolerate this via simple string formatting, or may need an explicit blank-cell case).
4. Update `backend/tests/unit/test_rirekisho_prompt.py` to cover: a duty-description-only row (no date), and a same-company multi-row case.

## E. Shokumu schema & prompt fix

**Problem:** `ShokumuCompany` (`backend/app/services/ai/prompts/shokumu.py`) has one `role`, one `period_start`/`period_end`, and one `responsibilities` list per company — structurally unable to represent a promotion or transfer within one employer. A role change gets flattened into one bullet list under a single role title, losing the distinction between the two roles.

**Fix:** change `ShokumuCompany` to hold a company name plus a list of role-periods, each with its own `role`, `period_start`, `period_end`, and `responsibilities`. Update `build_system_prompt()`/`build_user_prompt()` in `shokumu.py` to instruct the model to emit a new role-period entry (not a new company block) when the source describes a role/duty change without an employer change. Update `document_generator.py`'s shokumu rendering to iterate role-periods within a company block. Update `backend/tests/unit/test_shokumu_prompt.py` accordingly.

## F. PDF template additions

In `document_generator.py:_render_rirekisho()` (currently lines ~405–488):

- **Photo box:** positioned per the traditional layout (top-right of the personal-info header block). If `photo_storage_key` is set, render the actual image (base64-inlined, see B). If not, render an empty bordered box with the standard placement guide text (dimensions, "本人単身胸から上," etc. — match the wording visible in the user's original template) so a physical photo can be glued in by hand, which is normal practice.
- **特技・趣味 box:** two labeled lists, 趣味 (hobbies) and 特技 (special skills), sourced verbatim from the new `Profile.hobbies`/`Profile.special_skills` fields. If both are empty, render the box with just the header and blank space (matches a physical blank template — do not hide the section entirely, since a hiring agent expects to see the section present even if unfilled).
- **本人希望記入欄 box:** fixed boilerplate text, always `貴社の規定に従います。` — no new input, no conditional logic.

The existing personal-info header table and the unified 学歴・職歴 table keep their current structure — both already match the standard format correctly; only the work-history *content* (D above) needs to change, not this table's layout.

## Testing

- Backend: extend `backend/tests/unit/test_document_generator.py` to cover photo-present vs photo-absent rendering, hobbies/skills-present vs blank rendering, and the fixed 本人希望記入欄 text. Extend `test_rirekisho_prompt.py`/`test_shokumu_prompt.py` per D/E above.
- Manual verification: regenerate a rirekisho for a profile with photo + hobbies + skills filled in, and one with all three blank, confirm both render valid PDFs with the new sections in the right place. Verify a work-history case with a same-company duty change actually produces two dated rows end-to-end (upload a resume describing this, generate, inspect output).

## Open implementation details (resolve during planning/implementation, not blocking this design)

- Exact route path and location for `POST /profile/photo` (verify against `auth.py`'s existing `/auth/me` pattern first).
- Old-photo cleanup-on-replace convention (verify how resume replacement handles this today, if at all).
- Whether `document_generator.py`'s current table-rendering code already tolerates a blank year/month cell or needs an explicit code path.
