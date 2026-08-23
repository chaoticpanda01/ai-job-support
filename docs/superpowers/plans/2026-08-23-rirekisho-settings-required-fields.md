# Rirekisho Settings Split & Required-Fields Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Settings page into a rirekisho-required-info section and a general job-preferences section, surface which fields are required with a live-updating summary banner, and block the rirekisho generation wizard with a clear checklist before a doomed (and AI-quota-wasting) generation attempt.

**Architecture:** Extract the rirekisho-completeness check (currently a raise-only side effect inside `document_generator.py`) into a pure function returning structured `{key, label}` data, reused both by the existing generation-time gate and by two new fields on `GET /auth/me`'s response (`rirekisho_ready`, `rirekisho_missing_fields`). The frontend Settings page splits its single form into two independently-saved sections; the rirekisho-required section duplicates a small, explicitly-flagged subset of the completeness logic (~8 simple checks) so its summary banner can update live as the user types, without a network round-trip per keystroke. The generation wizard reads the backend's answer directly with zero duplication.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, pytest, pytest-asyncio, httpx (ASGITransport), Next.js 15 App Router, TypeScript, React Query. The frontend has no automated test runner configured (no jest/vitest in `package.json`) — frontend verification is via `npm run type-check`, `npm run format:check`, and manual browser testing, consistent with this codebase's existing convention.

**Spec:** `docs/superpowers/specs/2026-08-23-rirekisho-settings-required-fields-design.md`

---

### Task 1: Extract `rirekisho_missing_fields()` as a pure, reusable function

**Files:**
- Create: `backend/app/services/rirekisho_completeness.py`
- Modify: `backend/app/services/document_generator.py:293-331`
- Test: `backend/tests/unit/test_rirekisho_completeness.py`
- Test: `backend/tests/unit/test_document_generator.py` (verify existing tests still pass unchanged)

This extracts the field-by-field completeness logic that currently lives only inside `_check_rirekisho_profile_complete()` (which raises `DocumentGenerationError`) into a pure function that returns structured data instead. `_check_rirekisho_profile_complete()` becomes a thin wrapper around it — same behavior, same error message, for every case currently covered by tests. One deliberate, low-risk improvement: when `profile is None` entirely (no test currently covers this — confirmed via `grep -n "profile=None\|profile is None" backend/tests/unit/test_document_generator.py`, no matches), the old code produced one combined `"personal info (complete your profile)"` label; the new code produces the same five granular labels it would for a profile with all those fields empty (name in kana, date of birth, gender, phone number, mailing address). This is more actionable, not a regression, and is covered by a new test below.

- [ ] **Step 1: Write the failing tests for `rirekisho_missing_fields()`**

Create `backend/tests/unit/test_rirekisho_completeness.py`:

```python
"""
Unit tests for rirekisho_missing_fields().

Pure function, no I/O — tests use the same make_user/make_profile factories
as test_auth_routes.py.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.models.enums import Gender, VisaStatus
from app.services.rirekisho_completeness import rirekisho_missing_fields

from tests.conftest import make_profile, make_user


def _complete_profile():
    p = make_profile()
    p.name_kana = "ヤマダ タロウ"
    p.date_of_birth = date(1990, 1, 15)
    p.gender = Gender.male
    p.phone_number = "090-1234-5678"
    p.mailing_address = "東京都渋谷区"
    p.visa_status = VisaStatus.none
    return p


def test_complete_profile_returns_no_missing_fields() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    assert rirekisho_missing_fields(user, profile) == []


def test_missing_full_name() -> None:
    user = make_user(full_name=None)
    profile = _complete_profile()
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "full_name" in keys


def test_missing_name_kana() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    profile.name_kana = None
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "name_kana" in keys


def test_missing_date_of_birth() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    profile.date_of_birth = None
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "date_of_birth" in keys


def test_age_below_16_is_invalid() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    today = date.today()
    profile.date_of_birth = date(today.year - 15, today.month, today.day)
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "date_of_birth" in keys


def test_age_exactly_16_is_valid() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    today = date.today()
    profile.date_of_birth = date(today.year - 16, today.month, today.day) - timedelta(days=1)
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "date_of_birth" not in keys


def test_age_exactly_80_is_valid() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    today = date.today()
    profile.date_of_birth = date(today.year - 80, today.month, today.day)
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "date_of_birth" not in keys


def test_age_81_is_invalid() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    today = date.today()
    profile.date_of_birth = date(today.year - 81, today.month, today.day)
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "date_of_birth" in keys


def test_missing_gender() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    profile.gender = None
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "gender" in keys


def test_missing_phone_number() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    profile.phone_number = None
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "phone_number" in keys


def test_missing_mailing_address() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    profile.mailing_address = None
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "mailing_address" in keys


def test_visa_held_requires_category_and_expiration() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    profile.visa_status = VisaStatus.held
    profile.visa_category = None
    profile.residence_card_expiration = None
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "visa_category" in keys
    assert "residence_card_expiration" in keys


def test_visa_held_with_both_fields_present_is_complete() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    profile.visa_status = VisaStatus.held
    profile.visa_category = "技術・人文知識・国際業務"
    profile.residence_card_expiration = date(2030, 1, 1)
    assert rirekisho_missing_fields(user, profile) == []


def test_visa_not_held_does_not_require_category_or_expiration() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    profile.visa_status = VisaStatus.pending
    profile.visa_category = None
    profile.residence_card_expiration = None
    assert rirekisho_missing_fields(user, profile) == []


def test_profile_none_reports_every_profile_dependent_field() -> None:
    user = make_user(full_name="山田 太郎")
    keys = [m["key"] for m in rirekisho_missing_fields(user, None)]
    assert keys == [
        "name_kana",
        "date_of_birth",
        "gender",
        "phone_number",
        "mailing_address",
    ]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/unit/test_rirekisho_completeness.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.rirekisho_completeness'`

- [ ] **Step 3: Write the implementation**

Create `backend/app/services/rirekisho_completeness.py`:

```python
"""
Pure completeness check for rirekisho (履歴書) generation.

Single source of truth for "what does a profile need before a rirekisho can
be generated" — reused by:
  - document_generator.py, which raises DocumentGenerationError with the
    joined labels before spending any AI budget on a doomed generation.
  - the /auth/me* routes, which expose the same missing-field list to the
    frontend (Settings page live banner, and the rirekisho generation
    wizard's pre-flight gate) so the UI never has to guess or duplicate
    this logic.
"""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING, TypedDict

from app.models.enums import VisaStatus

if TYPE_CHECKING:
    from app.models.user import Profile, User


class MissingFieldEntry(TypedDict):
    key: str
    label: str


def rirekisho_missing_fields(user: User, profile: Profile | None) -> list[MissingFieldEntry]:
    """
    Returns [] if `user`/`profile` have everything needed to generate a
    rirekisho. Otherwise returns one {"key", "label"} entry per unmet
    requirement, in a fixed order.
    """
    missing: list[MissingFieldEntry] = []

    if not user.full_name:
        missing.append({"key": "full_name", "label": "full name"})

    if profile is None or not profile.name_kana:
        missing.append({"key": "name_kana", "label": "name in kana (ふりがな)"})

    if profile is None or profile.date_of_birth is None:
        missing.append({"key": "date_of_birth", "label": "date of birth"})
    else:
        today = date.today()
        dob = profile.date_of_birth
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        if not (16 <= age <= 80):
            missing.append(
                {
                    "key": "date_of_birth",
                    "label": "a valid date of birth (age must be between 16 and 80)",
                }
            )

    if profile is None or profile.gender is None:
        missing.append({"key": "gender", "label": "gender"})

    if profile is None or not profile.phone_number:
        missing.append({"key": "phone_number", "label": "phone number"})

    if profile is None or not profile.mailing_address:
        missing.append({"key": "mailing_address", "label": "mailing address"})

    if profile is not None and profile.visa_status == VisaStatus.held:
        if not profile.visa_category:
            missing.append({"key": "visa_category", "label": "visa category"})
        if profile.residence_card_expiration is None:
            missing.append(
                {
                    "key": "residence_card_expiration",
                    "label": "residence card expiration date",
                }
            )

    return missing
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/unit/test_rirekisho_completeness.py -v`
Expected: PASS, 15 passed

- [ ] **Step 5: Refactor `_check_rirekisho_profile_complete()` to use the new function**

In `backend/app/services/document_generator.py`, add the import near the other local imports at the top of the file (after `from app.repositories.user import ProfileRepository, UserRepository`):

```python
from app.services.rirekisho_completeness import rirekisho_missing_fields
```

Replace the body of `_check_rirekisho_profile_complete()` (currently lines 293-331) with:

```python
def _check_rirekisho_profile_complete(user: User, profile: Profile | None) -> None:
    """
    Raise DocumentGenerationError listing every missing field if the profile
    isn't complete enough to generate a rirekisho. Called before any AI work
    so a doomed generation fails fast and cheaply, with a message that lets
    the user fix everything in one pass instead of one field at a time.
    """
    missing = rirekisho_missing_fields(user, profile)
    if missing:
        labels = [m["label"] for m in missing]
        raise DocumentGenerationError(
            "Complete your profile before generating a 履歴書. Missing: " + ", ".join(labels) + "."
        )
```

- [ ] **Step 6: Run the full document_generator test suite to verify no regressions**

Run: `cd backend && .venv/bin/pytest tests/unit/test_document_generator.py -v`
Expected: PASS, all existing tests still pass (the three completeness-related tests — `test_generate_rirekisho_raises_when_profile_incomplete`, `test_generate_rirekisho_raises_when_visa_held_but_category_missing`, `test_generate_rirekisho_raises_when_age_out_of_range` — must still pass since the error message format is unchanged)

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/rirekisho_completeness.py backend/app/services/document_generator.py backend/tests/unit/test_rirekisho_completeness.py
git commit -m "Extract rirekisho_missing_fields() as a reusable, structured completeness check"
```

---

### Task 2: Expose `rirekisho_ready`/`rirekisho_missing_fields` on `GET /auth/me`

**Files:**
- Modify: `backend/app/schemas/user.py:36-96` (add schema, extend `MeResponse`)
- Modify: `backend/app/api/v1/auth.py` (add `_build_me_response()` helper, use it in 4 route handlers)
- Test: `backend/tests/unit/test_auth_routes.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/unit/test_auth_routes.py`, in the `GET /auth/me` section (after `test_get_me_returns_404_when_user_missing`):

```python
@pytest.mark.asyncio
async def test_get_me_reports_rirekisho_ready_when_profile_complete() -> None:
    from datetime import date

    from app.models.enums import Gender, VisaStatus

    user = make_user(full_name="山田 太郎")
    profile = make_profile(user_id=user.id)
    profile.name_kana = "ヤマダ タロウ"
    profile.date_of_birth = date(1990, 1, 15)
    profile.gender = Gender.male
    profile.phone_number = "090-1234-5678"
    profile.mailing_address = "東京都渋谷区"
    profile.visa_status = VisaStatus.none
    user.profile = profile

    with (
        _bypass_middleware(user),
        patch("app.api.v1.auth.UserRepository.get_with_profile", new=AsyncMock(return_value=user)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me", headers=_auth_headers())

    assert resp.status_code == 200
    data = resp.json()
    assert data["rirekisho_ready"] is True
    assert data["rirekisho_missing_fields"] == []


@pytest.mark.asyncio
async def test_get_me_reports_missing_fields_when_profile_incomplete() -> None:
    user = make_user(full_name="山田 太郎")
    profile = make_profile(user_id=user.id)  # defaults: name_kana, DOB, etc. all None
    user.profile = profile

    with (
        _bypass_middleware(user),
        patch("app.api.v1.auth.UserRepository.get_with_profile", new=AsyncMock(return_value=user)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me", headers=_auth_headers())

    assert resp.status_code == 200
    data = resp.json()
    assert data["rirekisho_ready"] is False
    keys = [f["key"] for f in data["rirekisho_missing_fields"]]
    assert "name_kana" in keys
    assert "date_of_birth" in keys
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/unit/test_auth_routes.py -v -k rirekisho_ready`
Expected: FAIL with `KeyError: 'rirekisho_ready'` (field doesn't exist in the response yet)

- [ ] **Step 3: Add the schema**

In `backend/app/schemas/user.py`, add a new schema right after `ProfileUpdateRequest` (after line 95, before the `# User` section comment):

```python
class RirekishoMissingField(_Base):
    key: str
    label: str
```

Update `MeResponse` (currently lines 118-122):

```python
class MeResponse(_Base):
    """Combined user + profile returned by GET /auth/me."""

    user: UserResponse
    profile: ProfileResponse | None
    rirekisho_ready: bool
    rirekisho_missing_fields: list[RirekishoMissingField]
```

- [ ] **Step 4: Add `_build_me_response()` helper and use it in all four route handlers**

In `backend/app/api/v1/auth.py`, add to the schema import block (currently lines 26-35):

```python
from app.schemas.user import (
    AIQuotaResponse,
    ClerkWebhookEvent,
    ClerkWebhookUserData,
    MeResponse,
    ProfileResponse,
    ProfileUpdateRequest,
    RirekishoMissingField,
    UserListResponse,
    UserResponse,
)
```

Add a new import line after `from app.services.file_storage import ...`:

```python
from app.services.rirekisho_completeness import rirekisho_missing_fields
```

Add the helper function in the `# Helpers` section at the bottom of the file, right after `_profile_response()`:

```python
def _build_me_response(user: User, profile: Profile | None) -> MeResponse:
    """
    Build a MeResponse, computing rirekisho_ready/rirekisho_missing_fields
    from the same rirekisho_missing_fields() check document_generator.py
    uses at generation time — so the frontend's "is my profile ready"
    signal can never drift from what will actually happen when the user
    clicks Generate.
    """
    missing = rirekisho_missing_fields(user, profile)
    return MeResponse(
        user=UserResponse.model_validate(user),
        profile=_profile_response(profile),
        rirekisho_ready=not missing,
        rirekisho_missing_fields=[
            RirekishoMissingField(key=m["key"], label=m["label"]) for m in missing
        ],
    )
```

Replace each of the four `MeResponse(...)` construction call sites:

In `get_me` (currently lines 138-141):
```python
    return _build_me_response(user, user.profile)
```

In `update_me` (currently lines 186-189):
```python
    return _build_me_response(user, profile)
```

In `upload_my_photo` (currently lines 253-256):
```python
    return _build_me_response(user, profile)
```

In `record_consent` (currently lines 283-286):
```python
    return _build_me_response(user, user.profile)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/unit/test_auth_routes.py -v`
Expected: PASS, all tests pass including the two new ones

- [ ] **Step 6: Run the full backend test suite to check for regressions**

Run: `cd backend && .venv/bin/pytest tests/unit -v`
Expected: PASS, no regressions in any other test file (document_generator tests, other auth tests, etc.)

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/user.py backend/app/api/v1/auth.py backend/tests/unit/test_auth_routes.py
git commit -m "Expose rirekisho_ready/rirekisho_missing_fields on GET /auth/me"
```

---

### Task 3: Frontend types and i18n keys

**Files:**
- Modify: `frontend/types/api.ts:55-58`
- Modify: `frontend/lib/i18n.ts` (settings namespace ~line 1038, documents namespace ~line 838)

- [ ] **Step 1: Add the new type and extend `MeResponse`**

In `frontend/types/api.ts`, add before the `MeResponse` interface (currently at line 55):

```typescript
export interface RirekishoMissingField {
  key: string;
  label: string;
}

```

Replace the `MeResponse` interface:

```typescript
export interface MeResponse {
  user: User;
  profile: Profile | null;
  rirekisho_ready: boolean;
  rirekisho_missing_fields: RirekishoMissingField[];
}
```

- [ ] **Step 2: Add new `settings` namespace i18n keys**

In `frontend/lib/i18n.ts`, inside the `settings` object, add these new keys right after `rirekishoInfoHint` (currently ending at line 1043):

```typescript
    jobPreferences: { en: "Job preferences", id: "Preferensi kerja", ja: "希望条件" },
    jobPreferencesHint: {
      en: "Used to tailor AI-generated content for both documents. Not required.",
      id: "Digunakan untuk menyesuaikan konten yang dibuat AI untuk kedua dokumen. Tidak wajib.",
      ja: "両方の書類のAI生成コンテンツの調整に使用されます。必須ではありません。",
    },
    required: { en: "Required", id: "Wajib", ja: "必須" },
    recommended: { en: "Recommended", id: "Disarankan", ja: "推奨" },
    rirekishoReady: {
      en: "✓ All required fields complete",
      id: "✓ Semua kolom wajib telah lengkap",
      ja: "✓ 必須項目はすべて入力済みです",
    },
    rirekishoMissingCount: {
      en: "{n} of {m} required fields missing:",
      id: "{n} dari {m} kolom wajib belum diisi:",
      ja: "必須項目 {m} 件中 {n} 件が未入力：",
    },
```

- [ ] **Step 3: Add new `documents` namespace i18n keys**

In `frontend/lib/i18n.ts`, inside the `documents` object, add these new keys right after `createFailed` (currently ending at line 842):

```typescript
    profileIncompleteTitle: {
      en: "Complete your profile to generate a rirekisho",
      id: "Lengkapi profil untuk membuat rirekisho",
      ja: "履歴書を生成するにはプロフィールを完成させてください",
    },
    profileIncompleteHint: {
      en: "The following are required before a 履歴書 can be generated:",
      id: "Berikut ini wajib diisi sebelum 履歴書 dapat dibuat:",
      ja: "履歴書を生成する前に、以下の入力が必要です：",
    },
    goToSettings: { en: "Go to Settings", id: "Buka Pengaturan", ja: "設定へ移動" },
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend && npm run type-check`
Expected: no errors

- [ ] **Step 5: Verify formatting**

Run: `cd frontend && npx prettier --check types/api.ts lib/i18n.ts`
Expected: no issues. If prettier reports formatting differences, run `npx prettier --write types/api.ts lib/i18n.ts` and re-check.

- [ ] **Step 6: Commit**

```bash
git add frontend/types/api.ts frontend/lib/i18n.ts
git commit -m "Add rirekisho_ready types and i18n keys for Settings split + wizard gate"
```

---

### Task 4: Split Settings page into RirekishoInfoSection and JobPreferencesSection

**Files:**
- Modify: `frontend/app/dashboard/settings/page.tsx` (full rewrite of `ProfileSection` into two components, plus `Field` gains `id`/`badge` props)

This is the biggest task. `ProfileSection` splits into two independently-saved sections. The `Field` shared component gains two optional props: `id` (to override its current `useId()`-generated id with a stable, predictable one for required fields, so the summary banner and the wizard's cross-page link can scroll-to/focus a specific field) and `badge` (small "Required"/"Recommended" pill next to the label). Both are optional and backward-compatible — fields that don't pass them behave exactly as before.

`visa_status` itself is edited in `JobPreferencesSection`, but `RirekishoInfoSection` needs to know its current value to decide whether visa category/expiration are required and whether to show the visa category field at all. It reads `me.profile.visa_status` directly (both sections call `useMe()`, which is a shared React Query cache under the `["me"]` key — no extra network request). This means: if the user changes visa status in Job Preferences without saving that section yet, the Rirekisho Info section's visa-related required/optional state won't update until Job Preferences is saved. This is an accepted, minor consequence of the two sections saving independently — call it out with a one-line code comment, not a bug.

- [ ] **Step 1: Write the complete new file**

Write `frontend/app/dashboard/settings/page.tsx`:

```tsx
"use client";

import { cloneElement, isValidElement, useEffect, useId, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { z } from "zod";
import { useMe, useUpdateProfile } from "@/hooks/useMe";
import { useDeleteAccount } from "@/hooks/useAccount";
import { useLang } from "@/lib/language-context";
import { t, type Language } from "@/lib/i18n";
import { SIGN_IN_ROUTE } from "@/lib/routes";
import { PhotoUploader } from "@/components/profile/PhotoUploader";
import type {
  Gender,
  JapaneseLevel,
  PreferredLanguage,
  ProfileUpdateRequest,
  VisaStatus,
} from "@/types/api";

const profileFormSchema = z.object({
  years_experience: z.coerce
    .number()
    .min(0, "Must be 0 or greater")
    .max(80, "Must be 80 or less")
    .optional(),
});

type ProfileFieldErrors = Partial<
  Record<keyof z.infer<typeof profileFormSchema>, string | undefined>
>;

const JAPANESE_LEVELS: JapaneseLevel[] = ["N1", "N2", "N3", "N4", "N5", "none"];
const LANGUAGES: { value: PreferredLanguage; label: string }[] = [
  { value: "id", label: "Indonesian (Bahasa Indonesia)" },
  { value: "en", label: "English" },
  { value: "ja", label: "Japanese (日本語)" },
];

// Keys mirror rirekisho_missing_fields()'s "key" values in
// backend/app/services/rirekisho_completeness.py — kept in sync manually,
// see the comment on computeMissingRirekishoFields below.
const REQUIRED_FIELD_LABEL_KEYS: Record<string, string> = {
  full_name: "fullName",
  name_kana: "nameKana",
  date_of_birth: "dateOfBirth",
  gender: "gender",
  phone_number: "phone",
  mailing_address: "address",
  visa_category: "visaCategory",
  residence_card_expiration: "visaExpiration",
};

function missingFieldLabel(key: string, lang: Language): string {
  return t("settings", REQUIRED_FIELD_LABEL_KEYS[key] ?? key, lang);
}

/**
 * Deliberate, bounded duplication of a subset of
 * rirekisho_missing_fields() (backend/app/services/rirekisho_completeness.py):
 * simple presence checks, the date-of-birth age-range rule, and the
 * visa-held conditional. Needed so the Settings banner can update as the
 * user types, without a network round-trip per keystroke. If the backend's
 * required-field set changes, this must be updated too — everywhere else
 * (the rirekisho generation wizard) reads the backend's computed answer
 * directly with no duplication at all.
 */
function computeMissingRirekishoFields(
  form: ProfileUpdateRequest,
  visaStatus: VisaStatus | undefined,
): string[] {
  const missing: string[] = [];

  if (!form.full_name) missing.push("full_name");
  if (!form.name_kana) missing.push("name_kana");

  if (!form.date_of_birth) {
    missing.push("date_of_birth");
  } else {
    const dob = new Date(form.date_of_birth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const hadBirthdayThisYear =
      today.getMonth() > dob.getMonth() ||
      (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
    if (!hadBirthdayThisYear) age -= 1;
    if (age < 16 || age > 80) missing.push("date_of_birth");
  }

  if (!form.gender) missing.push("gender");
  if (!form.phone_number) missing.push("phone_number");
  if (!form.mailing_address) missing.push("mailing_address");

  if (visaStatus === "held") {
    if (!form.visa_category) missing.push("visa_category");
    if (!form.residence_card_expiration) missing.push("residence_card_expiration");
  }

  return missing;
}

function focusField(key: string) {
  const el = document.getElementById(`rirekisho-field-${key}`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }
}

function RirekishoCompletenessBanner({
  missingKeys,
  totalRequired,
}: {
  missingKeys: string[];
  totalRequired: number;
}) {
  const { lang } = useLang();

  if (missingKeys.length === 0) {
    return (
      <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-400">
        {t("settings", "rirekishoReady", lang)}
      </p>
    );
  }

  return (
    <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
      <p>
        {t("settings", "rirekishoMissingCount", lang)
          .replace("{n}", String(missingKeys.length))
          .replace("{m}", String(totalRequired))}
      </p>
      <p className="mt-1 space-x-1">
        {missingKeys.map((key, i) => (
          <span key={key}>
            <button
              type="button"
              onClick={() => focusField(key)}
              className="underline hover:no-underline"
            >
              {missingFieldLabel(key, lang)}
            </button>
            {i < missingKeys.length - 1 ? "," : ""}
          </span>
        ))}
      </p>
    </div>
  );
}

export default function SettingsPage() {
  const { lang } = useLang();
  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">{t("settings", "title", lang)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("settings", "sub", lang)}</p>
      </div>

      <RirekishoInfoSection />
      <JobPreferencesSection />
      <DangerZone />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rirekisho info — required-for-generation fields, saved independently
// ---------------------------------------------------------------------------

function RirekishoInfoSection() {
  const { data: me, isLoading } = useMe();
  const updateProfile = useUpdateProfile();
  const { lang } = useLang();

  const [form, setForm] = useState<ProfileUpdateRequest>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!me?.profile) return;
    const p = me.profile;
    const next = {
      full_name: me.user.full_name ?? undefined,
      name_kana: p.name_kana ?? undefined,
      date_of_birth: p.date_of_birth ?? undefined,
      gender: p.gender ?? undefined,
      phone_number: p.phone_number ?? undefined,
      mailing_address: p.mailing_address ?? undefined,
      residence_card_expiration: p.residence_card_expiration ?? undefined,
      visa_category: p.visa_category ?? undefined,
      hobbies: p.hobbies ?? undefined,
      special_skills: p.special_skills ?? undefined,
      personal_requests: p.personal_requests ?? "貴社の規定に従います。",
    };
    setForm(
      Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) as ProfileUpdateRequest,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.profile?.id]);

  function handleChange<K extends keyof ProfileUpdateRequest>(
    key: K,
    value: ProfileUpdateRequest[K],
  ) {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await updateProfile.mutateAsync(form);
    setSaved(true);
  }

  if (isLoading) return <SectionSkeleton />;

  // visa_status is edited in JobPreferencesSection, not here — this reads
  // the last-saved value (both sections share the ["me"] query cache), so
  // the visa-conditional fields below only react after that section is
  // saved, not on every keystroke there. See the module comment above
  // computeMissingRirekishoFields.
  const visaStatus = me?.profile?.visa_status;
  const missingKeys = computeMissingRirekishoFields(form, visaStatus);
  const totalRequired = visaStatus === "held" ? 8 : 6;
  const requiredBadge = t("settings", "required", lang);

  return (
    <section className="space-y-6" id="rirekisho-info">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{t("settings", "rirekishoInfo", lang)}</h2>
        <p className="text-xs text-muted-foreground">{t("settings", "rirekishoInfoHint", lang)}</p>
      </div>

      <RirekishoCompletenessBanner missingKeys={missingKeys} totalRequired={totalRequired} />

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field id="rirekisho-field-full_name" label={t("settings", "fullName", lang)} badge={requiredBadge}>
          <input
            type="text"
            value={form.full_name ?? ""}
            onChange={(e) => handleChange("full_name", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field id="rirekisho-field-name_kana" label={t("settings", "nameKana", lang)} badge={requiredBadge}>
          <input
            type="text"
            value={form.name_kana ?? ""}
            onChange={(e) => handleChange("name_kana", e.target.value || undefined)}
            placeholder="ヤマダ タロウ"
            className={inputCls}
          />
        </Field>

        <Field id="rirekisho-field-date_of_birth" label={t("settings", "dateOfBirth", lang)} badge={requiredBadge}>
          <input
            type="date"
            value={form.date_of_birth ?? ""}
            onChange={(e) => handleChange("date_of_birth", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field id="rirekisho-field-gender" label={t("settings", "gender", lang)} badge={requiredBadge}>
          <select
            value={form.gender ?? ""}
            onChange={(e) =>
              handleChange("gender", (e.target.value || undefined) as Gender | undefined)
            }
            className={inputCls}
          >
            <option value="" disabled>
              {t("settings", "genderSelect", lang)}
            </option>
            <option value="male">{t("settings", "genderMale", lang)}</option>
            <option value="female">{t("settings", "genderFemale", lang)}</option>
          </select>
        </Field>

        <Field id="rirekisho-field-phone_number" label={t("settings", "phone", lang)} badge={requiredBadge}>
          <input
            type="tel"
            value={form.phone_number ?? ""}
            onChange={(e) => handleChange("phone_number", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field id="rirekisho-field-mailing_address" label={t("settings", "address", lang)} badge={requiredBadge}>
          <input
            type="text"
            value={form.mailing_address ?? ""}
            onChange={(e) => handleChange("mailing_address", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field
          id="rirekisho-field-residence_card_expiration"
          label={t("settings", "visaExpiration", lang)}
          badge={visaStatus === "held" ? requiredBadge : undefined}
        >
          <input
            type="date"
            value={form.residence_card_expiration ?? ""}
            onChange={(e) => handleChange("residence_card_expiration", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        {visaStatus === "held" && (
          <Field id="rirekisho-field-visa_category" label={t("settings", "visaCategory", lang)} badge={requiredBadge}>
            <input
              type="text"
              value={form.visa_category ?? ""}
              onChange={(e) => handleChange("visa_category", e.target.value || undefined)}
              className={inputCls}
            />
          </Field>
        )}

        <Field
          label={t("settings", "photo", lang)}
          hint={t("settings", "photoHint", lang)}
          badge={t("settings", "recommended", lang)}
        >
          <PhotoUploader />
        </Field>

        <Field label={t("settings", "hobbies", lang)}>
          <input
            type="text"
            value={form.hobbies ?? ""}
            onChange={(e) => handleChange("hobbies", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field label={t("settings", "specialSkills", lang)}>
          <input
            type="text"
            value={form.special_skills ?? ""}
            onChange={(e) => handleChange("special_skills", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field
          label={t("settings", "personalRequests", lang)}
          hint={t("settings", "personalRequestsHint", lang)}
        >
          <input
            type="text"
            value={form.personal_requests ?? ""}
            onChange={(e) => handleChange("personal_requests", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        {updateProfile.error && (
          <p className="text-sm text-destructive">
            {(updateProfile.error as { detail?: string }).detail ?? t("settings", "saveFail", lang)}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={updateProfile.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {updateProfile.isPending
              ? t("common", "saving", lang)
              : t("common", "saveChanges", lang)}
          </button>
          {saved && !updateProfile.isPending && (
            <p className="text-sm text-green-600">{t("common", "saved", lang)}</p>
          )}
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Job preferences — used for AI prompt enrichment, never required
// ---------------------------------------------------------------------------

function JobPreferencesSection() {
  const { data: me, isLoading } = useMe();
  const updateProfile = useUpdateProfile();
  const { lang } = useLang();

  const VISA_STATUSES: { value: VisaStatus; label: string }[] = [
    { value: "none", label: t("settings", "visaNone", lang) },
    { value: "pending", label: t("settings", "visaPending", lang) },
    { value: "held", label: t("settings", "visaHeld", lang) },
  ];

  const [form, setForm] = useState<ProfileUpdateRequest>({});
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ProfileFieldErrors>({});

  useEffect(() => {
    if (!me?.profile) return;
    const p = me.profile;
    const next = {
      nationality: p.nationality ?? undefined,
      japanese_level: p.japanese_level,
      visa_status: p.visa_status,
      preferred_language: p.preferred_language,
      years_experience: p.years_experience ?? undefined,
      target_role: p.target_role ?? [],
      target_industry: p.target_industry ?? [],
    };
    setForm(
      Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) as ProfileUpdateRequest,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.profile?.id]);

  function handleChange<K extends keyof ProfileUpdateRequest>(
    key: K,
    value: ProfileUpdateRequest[K],
  ) {
    setSaved(false);
    if (key === "years_experience") setFieldErrors({ years_experience: undefined });
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const result = profileFormSchema.safeParse(form);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      setFieldErrors({ years_experience: errors.years_experience?.[0] });
      setSaved(false);
      return;
    }
    setFieldErrors({});

    await updateProfile.mutateAsync(form);
    setSaved(true);
  }

  if (isLoading) return <SectionSkeleton />;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{t("settings", "jobPreferences", lang)}</h2>
        <p className="text-xs text-muted-foreground">{t("settings", "jobPreferencesHint", lang)}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label={t("settings", "nationality", lang)}>
          <input
            type="text"
            value={form.nationality ?? ""}
            onChange={(e) => handleChange("nationality", e.target.value || undefined)}
            placeholder="e.g. Indonesian"
            className={inputCls}
          />
        </Field>

        <Field label={t("settings", "jpLevel", lang)}>
          <select
            value={form.japanese_level ?? "none"}
            onChange={(e) => handleChange("japanese_level", e.target.value as JapaneseLevel)}
            className={inputCls}
          >
            {JAPANESE_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l === "none" ? t("settings", "jpNotTested", lang) : l}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("settings", "visaStatus", lang)}>
          <select
            value={form.visa_status ?? "none"}
            onChange={(e) => handleChange("visa_status", e.target.value as VisaStatus)}
            className={inputCls}
          >
            {VISA_STATUSES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("settings", "yearsExp", lang)} error={fieldErrors.years_experience}>
          <input
            type="number"
            min={0}
            max={80}
            value={form.years_experience ?? ""}
            onChange={(e) =>
              handleChange(
                "years_experience",
                e.target.value === "" ? undefined : Number(e.target.value),
              )
            }
            placeholder="e.g. 3"
            className={inputCls}
          />
        </Field>

        <Field
          label={t("settings", "targetRoles", lang)}
          hint={t("settings", "targetRolesHint", lang)}
        >
          <input
            type="text"
            value={(form.target_role ?? []).join(", ")}
            onChange={(e) =>
              handleChange(
                "target_role",
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            placeholder="e.g. Software Engineer, Backend Developer"
            className={inputCls}
          />
        </Field>

        <Field
          label={t("settings", "targetIndustries", lang)}
          hint={t("settings", "targetIndustriesHint", lang)}
        >
          <input
            type="text"
            value={(form.target_industry ?? []).join(", ")}
            onChange={(e) =>
              handleChange(
                "target_industry",
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            placeholder="e.g. Technology, Finance"
            className={inputCls}
          />
        </Field>

        <Field label={t("settings", "preferredLang", lang)}>
          <select
            value={form.preferred_language ?? "id"}
            onChange={(e) =>
              handleChange("preferred_language", e.target.value as PreferredLanguage)
            }
            className={inputCls}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>

        {updateProfile.error && (
          <p className="text-sm text-destructive">
            {(updateProfile.error as { detail?: string }).detail ?? t("settings", "saveFail", lang)}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={updateProfile.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {updateProfile.isPending
              ? t("common", "saving", lang)
              : t("common", "saveChanges", lang)}
          </button>
          {saved && !updateProfile.isPending && (
            <p className="text-sm text-green-600">{t("common", "saved", lang)}</p>
          )}
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Danger zone — account deletion
// ---------------------------------------------------------------------------

function DangerZone() {
  const router = useRouter();
  const { signOut } = useClerk();
  const deleteAccount = useDeleteAccount();
  const { lang } = useLang();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const CONFIRM_PHRASE = t("settings", "confirmPhrase", lang);
  const ready = confirmText.toLowerCase() === CONFIRM_PHRASE.toLowerCase();

  async function handleDelete() {
    if (!ready) return;
    await deleteAccount.mutateAsync();
    await signOut();
    router.push(SIGN_IN_ROUTE);
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-destructive">
        {t("settings", "dangerZone", lang)}
      </h2>

      <div className="space-y-4 rounded-lg border border-destructive/40 bg-destructive/5 p-5">
        <div>
          <p className="text-sm font-medium">{t("settings", "deleteAccount", lang)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("settings", "deleteDesc", lang)}</p>
        </div>

        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
          >
            {t("settings", "deleteBtn", lang)}
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("settings", "typeToConfirm", lang)}{" "}
              <span className="font-mono font-medium text-foreground">{CONFIRM_PHRASE}</span>{" "}
              {t("settings", "toConfirm", lang)}
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              className={`${inputCls} font-mono`}
              autoFocus
            />

            {deleteAccount.error && (
              <p className="text-sm text-destructive">
                {(deleteAccount.error as { detail?: string }).detail ??
                  t("settings", "deleteFail", lang)}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={!ready || deleteAccount.isPending}
                className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-40"
              >
                {deleteAccount.isPending
                  ? t("settings", "deleting", lang)
                  : t("settings", "confirmDeletion", lang)}
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmText("");
                }}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              >
                {t("common", "cancel", lang)}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function Field({
  id: idProp,
  label,
  hint,
  error,
  badge,
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  error?: string | undefined;
  badge?: string | undefined;
  children: React.ReactNode;
}) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
        {label}
        {badge && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {badge}
          </span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{
              id?: string;
              "aria-describedby"?: string;
              "aria-invalid"?: boolean;
            }>,
            {
              id,
              "aria-invalid": Boolean(error),
              ...(describedBy ? { "aria-describedby": describedBy } : {}),
            },
          )
        : children}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary";

function SectionSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-3 w-32 animate-pulse rounded bg-muted" />
          <div className="h-9 animate-pulse rounded-md bg-muted" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npm run type-check`
Expected: no errors

- [ ] **Step 3: Verify formatting**

Run: `cd frontend && npx prettier --check app/dashboard/settings/page.tsx`
Expected: no issues. If it reports differences, run `npx prettier --write app/dashboard/settings/page.tsx` and re-check.

- [ ] **Step 4: Verify lint**

Run: `cd frontend && npm run lint`
Expected: no new errors introduced in `app/dashboard/settings/page.tsx`

- [ ] **Step 5: Commit**

```bash
git add frontend/app/dashboard/settings/page.tsx
git commit -m "Split Settings into RirekishoInfoSection and JobPreferencesSection with required-field badges and live completeness banner"
```

---

### Task 5: Gate the rirekisho generation wizard on profile completeness

**Files:**
- Modify: `frontend/app/dashboard/documents/rirekisho/new/page.tsx`

- [ ] **Step 1: Write the complete new file**

Write `frontend/app/dashboard/documents/rirekisho/new/page.tsx`:

```tsx
"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useResumes } from "@/hooks/useResumes";
import { useCreateDocument } from "@/hooks/useDocuments";
import { useMe } from "@/hooks/useMe";
import { DocumentWizard } from "@/components/documents/DocumentWizard";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { ApiClientError } from "@/lib/api-client";

export default function NewRirekishoPage() {
  return (
    <Suspense>
      <NewRirekishoPageInner />
    </Suspense>
  );
}

function NewRirekishoPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialJobPostingId = searchParams.get("job") ?? undefined;
  const { data: resumeList, isLoading: resumesLoading } = useResumes();
  const { data: me, isLoading: meLoading } = useMe();
  const createMutation = useCreateDocument("rirekisho");
  const { lang } = useLang();

  async function handleSubmit(resumeId: string, jobPostingId?: string) {
    const result = await createMutation.mutateAsync({
      resume_id: resumeId,
      ...(jobPostingId ? { job_posting_id: jobPostingId } : {}),
    });
    router.push(`/dashboard/documents/${result.id}`);
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <Link
          href="/dashboard/documents"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          {t("documents", "backToDocuments", lang)}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">{t("documents", "generateRirekisho", lang)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("documents", "rirekishoSub", lang)}</p>
      </div>

      {meLoading && <div className="h-40 animate-pulse rounded-lg bg-muted" />}

      {!meLoading && me && !me.rirekisho_ready && (
        <div className="space-y-4 rounded-lg border border-dashed p-6">
          <p className="text-sm font-medium">{t("documents", "profileIncompleteTitle", lang)}</p>
          <p className="text-sm text-muted-foreground">
            {t("documents", "profileIncompleteHint", lang)}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {me.rirekisho_missing_fields.map((f) => (
              <li key={f.key}>{f.label}</li>
            ))}
          </ul>
          <Link
            href="/dashboard/settings#rirekisho-info"
            className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {t("documents", "goToSettings", lang)}
          </Link>
        </div>
      )}

      {!meLoading && me && me.rirekisho_ready && (
        <DocumentWizard
          resumeList={resumeList}
          resumesLoading={resumesLoading}
          {...(initialJobPostingId ? { initialJobPostingId } : {})}
          isPending={createMutation.isPending}
          error={
            createMutation.error instanceof ApiClientError
              ? createMutation.error.detail
              : createMutation.error
                ? t("documents", "createFailed", lang)
                : null
          }
          submitLabel={t("documents", "generateRirekisho", lang)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npm run type-check`
Expected: no errors

- [ ] **Step 3: Verify formatting**

Run: `cd frontend && npx prettier --check app/dashboard/documents/rirekisho/new/page.tsx`
Expected: no issues. If it reports differences, run `npx prettier --write app/dashboard/documents/rirekisho/new/page.tsx` and re-check.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/documents/rirekisho/new/page.tsx
git commit -m "Gate rirekisho generation wizard on profile completeness"
```

---

### Manual verification (after all tasks complete)

The frontend has no automated test runner, so after Task 5 lands, verify in a browser (dev server via the Browser pane):

1. **Settings page, incomplete profile**: navigate to `/dashboard/settings`. Confirm the amber banner shows "N of 6 required fields missing" (or 8 if visa status is "held") listing the actual missing fields, and that required fields show a "Required" badge, photo shows "Recommended". Type into a missing required field (e.g. phone number) and confirm the banner count decreases live, without saving.
2. **Settings page, click a missing-field link**: click one of the missing field names in the banner and confirm the page scrolls to and focuses that input.
3. **Settings page, visa-conditional fields**: in Job Preferences, set visa status to "Currently held" and save. Confirm Rirekisho Info's visa category field appears and both it and residence card expiration now show "Required" badges, and the banner's denominator becomes 8.
4. **Settings page, independent save**: edit a field in Rirekisho Info without saving, then upload/change the photo (or save Job Preferences). Confirm the unsaved Rirekisho Info edit is NOT lost (this is the profile-identity fix from an earlier session — must still hold with the split).
5. **Rirekisho wizard, incomplete profile**: with required fields missing, navigate to `/dashboard/documents/rirekisho/new`. Confirm the blocking card appears with the correct missing-field list and the "Go to Settings" link lands on `/dashboard/settings#rirekisho-info` scrolled to that section.
6. **Rirekisho wizard, complete profile**: fill in and save all required Settings fields, then revisit `/dashboard/documents/rirekisho/new`. Confirm the normal 3-step wizard now renders instead of the blocking card.
7. **Shokumu unaffected**: navigate to `/dashboard/documents/shokumu/new` and confirm it renders the wizard immediately regardless of rirekisho profile completeness (no gate was added there).
