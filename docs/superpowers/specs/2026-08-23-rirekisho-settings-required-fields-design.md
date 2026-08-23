# Rirekisho Settings Split & Required-Fields Visibility — Design

## Problem

The Settings page (`frontend/app/dashboard/settings/page.tsx`) has a single "Profile" section, labeled entirely under a "Rirekisho Info" heading, that actually mixes three different kinds of fields with no visual distinction between them:

1. Fields the backend hard-requires before it will generate a rirekisho (full name, name in kana, date of birth, gender, phone number, mailing address, and conditionally visa category / residence card expiration when visa status is "held") — enforced today only inside `_check_rirekisho_profile_complete()` in `backend/app/services/document_generator.py:293`.
2. Fields the rirekisho renderer uses but doesn't require (photo, hobbies, special skills, personal requests).
3. General job-matching fields used by both rirekisho and shokumu generation for AI prompt enrichment (nationality, Japanese level, years of experience, target roles/industries, preferred language) — these never gate generation for either document type.

The consequence: users have no way to know, before clicking "Generate," whether their profile is complete enough for a rirekisho. They find out only when the backend rejects the request with a formatted error message — after already navigating through the multi-step wizard. Shokumu has no such gate at all; it only consumes the shared job-matching fields.

## Goals

- Split the Settings page into two independently-saved sections so rirekisho-specific fields are visually and functionally separate from general job-preference fields.
- Show required-field status inline (per-field badges) and as a live summary (top-of-section banner) in Settings, so users can self-serve completion without triggering a failed generation.
- Gate the rirekisho generation wizard itself on profile completeness, showing exactly what's missing with a link back to Settings, before the user can proceed — avoiding wasted time and (for a doomed generation that got as far as the AI call) wasted AI quota.
- Keep the completeness logic itself in exactly one place (the backend), with one narrow, explicitly-flagged exception for live-typing feedback in Settings.

## Non-goals

- Delete button for generated documents (flagged separately as a follow-up task, unrelated to this design).
- Multi-format export (PDF/Word/Excel) — separate, later topic.
- Improving rirekisho generation so it builds on the originally-uploaded resume's content more faithfully — separate, larger topic from an earlier session.
- Changing what fields are required — this design surfaces the existing backend requirement set, it doesn't change it. (One exception, called out below: photo is deliberately *not* added to the required set even though a real hand-written rirekisho conventionally includes one, because the backend has never enforced it — it renders a placeholder box when absent. It's labeled "Recommended" instead.)

## Backend

### New module: `backend/app/services/rirekisho_completeness.py`

Extract the field-checking logic that currently lives inline in `_check_rirekisho_profile_complete()` into a new pure function:

```python
def rirekisho_missing_fields(user: User, profile: Profile | None) -> list[dict[str, str]]:
    """
    Returns [] if the profile has everything needed to generate a rirekisho.
    Otherwise returns one {"key": ..., "label": ...} dict per unmet
    requirement, in the same order and with the same human-readable labels
    `_check_rirekisho_profile_complete` has always used.
    """
```

Required-field set (unchanged from current behavior):

| key | label | condition |
|---|---|---|
| `full_name` | "full name" | `user.full_name` falsy |
| `name_kana` | "name in kana (ふりがな)" | `profile is None or not profile.name_kana` |
| `date_of_birth` | "date of birth" | `profile is None or profile.date_of_birth is None` |
| `date_of_birth` | "a valid date of birth (age must be between 16 and 80)" | DOB present but computed age not in [16, 80] |
| `gender` | "gender" | `profile is None or profile.gender is None` |
| `phone_number` | "phone number" | `profile is None or not profile.phone_number` |
| `mailing_address` | "mailing address" | `profile is None or not profile.mailing_address` |
| `visa_category` | "visa category" | `profile is not None and profile.visa_status == VisaStatus.held and not profile.visa_category` |
| `residence_card_expiration` | "residence card expiration date" | `profile is not None and profile.visa_status == VisaStatus.held and profile.residence_card_expiration is None` |

`document_generator.py`'s `_check_rirekisho_profile_complete(user, profile)` becomes a thin wrapper:

```python
def _check_rirekisho_profile_complete(user: User, profile: Profile | None) -> None:
    missing = rirekisho_missing_fields(user, profile)
    if missing:
        labels = [m["label"] for m in missing]
        raise DocumentGenerationError(
            "Complete your profile before generating a 履歴書. Missing: " + ", ".join(labels) + "."
        )
```

Identical error message to today — no behavior change to the generation-time gate itself, this is a pure refactor of that path.

### Schema changes: `backend/app/schemas/user.py`

New small schema:

```python
class RirekishoMissingField(_Base):
    key: str
    label: str
```

`MeResponse` gains two fields:

```python
class MeResponse(_Base):
    user: UserResponse
    profile: ProfileResponse | None
    rirekisho_ready: bool
    rirekisho_missing_fields: list[RirekishoMissingField]
```

### Route changes: `backend/app/api/v1/auth.py`

Add a helper used by every handler that currently constructs a `MeResponse` (`get_me`, `update_me`, the `me/photo` upload handler, `record_consent`):

```python
def _build_me_response(user: User, profile: Profile | None) -> MeResponse:
    missing = rirekisho_missing_fields(user, profile)
    return MeResponse(
        user=UserResponse.model_validate(user),
        profile=ProfileResponse.model_validate(profile) if profile else None,
        rirekisho_ready=not missing,
        rirekisho_missing_fields=[RirekishoMissingField(**m) for m in missing],
    )
```

(Exact construction adapts to whatever each handler already does for the `photo_url` presigned-URL injection on `ProfileResponse` — this helper centralizes the new fields only, not a rewrite of existing response-building.)

## Frontend: Settings page split

`frontend/app/dashboard/settings/page.tsx`'s single `ProfileSection` splits into two sibling components, each independently saved (same pattern `PhotoUploader` already uses — its own mutation, doesn't block or get blocked by the rest of the form):

### `RirekishoInfoSection`

Wrapper has `id="rirekisho-info"` (anchor target for the wizard's deep link). Contains, in order: full name, name in kana, date of birth, gender, phone, mailing address, photo (labeled "Recommended," not "Required"), visa category + residence card expiration (rendered only when visa status is "held," same conditional the current code already has), hobbies, special skills, personal requests.

Each backend-required field — full name, name in kana, date of birth, gender, phone, mailing address (always required), plus visa category and residence card expiration (required only when visa status is "held") — gets a small "Required" badge next to its label. Each of these fields' `Field` wrapper is given a stable, predictable `id` — `rirekisho-field-<key>` — instead of the current `useId()`-generated one, so the summary banner can scroll-to and focus a specific field, and so the wizard's cross-page anchor link lands somewhere meaningful.

**Live summary banner**, above the fields:
- Complete: "✓ All required fields complete" (success styling).
- Incomplete: "N of M required fields missing: <label>, <label>, ..." (warning styling), where `M` is the total number of currently-applicable required fields (6, or 8 when visa status is "held") and each `<label>` is a clickable button that scrolls to and focuses the corresponding field.

The banner recomputes on every form-state change from a small local helper mirroring the backend's `rirekisho_missing_fields` shape:

```typescript
function computeMissingRirekishoFields(form: ProfileUpdateRequest): { key: string; label: string }[]
```

This is a deliberate, bounded duplication of ~7 simple presence checks plus the DOB age-range arithmetic and the visa-conditional inclusion rule — needed because the banner must respond to keystrokes, not a network round-trip. It is the **only** place this logic is duplicated; everywhere else (the wizard gate, below) reads the backend's computed answer directly. If the required-field set ever changes, both this function and `rirekisho_missing_fields()` in the backend need updating — call this out in a comment at the top of the TS function pointing at the Python source of truth.

### `JobPreferencesSection`

Contains: nationality, Japanese level, visa status, years of experience, target roles, target industries, preferred language. No required badges, no banner — none of these fields gate either document type's generation.

Both sections keep the existing `useEffect(() => {...}, [me?.profile?.id])` fix from the earlier profile-identity bug (each section syncs its own local state from `me.profile`/`me.user.full_name` independently, keyed on profile identity, not object reference).

## Frontend: rirekisho wizard gate

`frontend/app/dashboard/documents/rirekisho/new/page.tsx`'s inner component adds a `useMe()` call. Render logic, before reaching the existing `<DocumentWizard>`:

- `me` loading → existing resume-loading skeleton pattern extends to cover this.
- `me` loaded and `!me.rirekisho_ready` → render a blocking card instead of the wizard: heading ("Complete your profile to generate a rirekisho"), a bulleted list built directly from `me.rirekisho_missing_fields[].label` (no client-side recomputation — this path reads the backend's answer as-is), and a link/button to `/dashboard/settings#rirekisho-info`.
- `me.rirekisho_ready` → render `<DocumentWizard>` exactly as today.

`frontend/app/dashboard/documents/shokumu/new/page.tsx` is unchanged — shokumu has never required these fields and this design doesn't add a gate for it.

## i18n

New keys needed in `frontend/lib/i18n.ts`: section headers/hints for `jobPreferences` (mirroring existing `rirekishoInfo`/`rirekishoInfoHint`), a `required` badge label, a `recommended` badge label (for photo), banner copy for both complete/incomplete states, and the wizard's blocking-card copy (heading, "go to settings" button label).

## Testing

- Backend: unit tests for `rirekisho_missing_fields()` covering each individual missing condition, the DOB age-boundary edges (exactly 16, exactly 80, 15, 81), the visa-conditional branch (held vs. not held), and the fully-complete case. Existing `_check_rirekisho_profile_complete` tests continue to pass unchanged (it's now a thin wrapper with identical output). New test(s) for `MeResponse` including `rirekisho_ready`/`rirekisho_missing_fields` on at least one of the four routes that build it.
- Frontend: test `computeMissingRirekishoFields()` against the same edge cases as the backend unit tests (age boundaries, visa-conditional) to catch drift between the two implementations. Component-level check that the wizard renders the blocking card when `rirekisho_ready` is false and the wizard when true.

## Open questions resolved during design

- **Photo requirement:** deliberately left as "Recommended," not "Required" — matches existing backend behavior (never enforced), flagged in Goals/Non-goals above in case that's not what's wanted.
- **Banner duplication:** accepted as a small, explicitly-bounded exception to keep the live-typing UX responsive; everywhere else stays single-source-of-truth via the backend.
