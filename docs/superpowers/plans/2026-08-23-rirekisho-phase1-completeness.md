# Rirekisho Phase 1: Template & Content Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap between a generated rirekisho and a real one — add photo/hobbies/personal-requests sections, fix work-history content loss, and open a real post-onboarding edit path for rirekisho fields.

**Architecture:** Four new nullable `Profile` columns (photo key, hobbies, special skills, personal requests) flow through the existing DB-pass-through path (never through Gemini, same trust model as name/DOB/address). `RirekishoEntry`/`ShokumuCompany` schemas gain the shape needed to preserve duty-line and mid-tenure-role-change detail from the source resume. A new Settings section and an onboarding-step-5 addition give users a real way to set all of this, since today nothing does once onboarding is complete.

**Tech Stack:** FastAPI + SQLAlchemy async + Alembic (backend), Next.js + react-hook-form + zod + TanStack Query (frontend), WeasyPrint (PDF), boto3/S3-compatible storage, Gemini via `google-genai`.

**Spec:** `docs/superpowers/specs/2026-08-23-rirekisho-phase1-completeness-design.md`

---

## Task 1: Database migration + Profile model + test fixture

**Files:**
- Create: `backend/migrations/versions/0006_add_photo_hobbies_skills.py`
- Modify: `backend/app/models/user.py:183` (after `visa_category`)
- Modify: `backend/tests/conftest.py:54-77` (`make_profile`)

- [ ] **Step 1: Write the migration**

```python
"""add photo, hobbies, special_skills, personal_requests to profiles

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-23

Adds the fields needed to close template/content gaps found comparing a
generated rirekisho against a real one: a photo box, a 特技・趣味 section,
and an editable 本人希望記入欄 with a boilerplate default. See design spec
at docs/superpowers/specs/2026-08-23-rirekisho-phase1-completeness-design.md.
"""

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN photo_storage_key VARCHAR(500);
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN hobbies TEXT;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN special_skills TEXT;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN personal_requests TEXT;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)


def downgrade() -> None:
    op.drop_column("profiles", "personal_requests")
    op.drop_column("profiles", "special_skills")
    op.drop_column("profiles", "hobbies")
    op.drop_column("profiles", "photo_storage_key")
```

- [ ] **Step 2: Run the migration against your local DB**

Run: `cd backend && alembic upgrade head`
Expected: no errors; `alembic current` shows `0006`.

- [ ] **Step 3: Add the columns to the `Profile` model**

In `backend/app/models/user.py`, immediately after the `visa_category` line (currently line 183):

```python
    visa_category: Mapped[str | None] = mapped_column(String(255))
    # --- Phase 1 rirekisho completeness fields ---
    photo_storage_key: Mapped[str | None] = mapped_column(String(500))
    hobbies: Mapped[str | None] = mapped_column(Text)
    special_skills: Mapped[str | None] = mapped_column(Text)
    personal_requests: Mapped[str | None] = mapped_column(Text)
```

- [ ] **Step 4: Update the `make_profile` test fixture**

In `backend/tests/conftest.py`, add after the existing `profile.visa_category = None` line:

```python
    profile.visa_category = None
    profile.photo_storage_key = None
    profile.hobbies = None
    profile.special_skills = None
    profile.personal_requests = None
    return profile
```

(Required: `make_profile()` returns `MagicMock(spec=Profile)` — without these explicit `None` assignments, any test that serializes the profile through `ProfileResponse` would get an unset `MagicMock` attribute instead of `None`, failing Pydantic validation on every existing auth-route test.)

- [ ] **Step 5: Run the existing backend test suite to confirm nothing broke**

Run: `cd backend && python -m pytest tests/unit/test_auth_routes.py tests/unit/test_document_generator.py -v`
Expected: all pass (this step only adds columns/fixture defaults — no behavior changed yet).

- [ ] **Step 6: Commit**

```bash
git add backend/migrations/versions/0006_add_photo_hobbies_skills.py backend/app/models/user.py backend/tests/conftest.py
git commit -m "Add photo, hobbies, special_skills, personal_requests columns to profiles"
```

---

## Task 2: Backend & frontend Profile schemas

**Files:**
- Modify: `backend/app/schemas/user.py:36-83` (`ProfileResponse`, `ProfileUpdateRequest`)
- Modify: `frontend/types/api.ts` (`Profile`, `ProfileUpdateRequest` interfaces)

- [ ] **Step 1: Add fields to `ProfileResponse`**

In `backend/app/schemas/user.py`, in `ProfileResponse`, after the `visa_category: str | None` line:

```python
    visa_category: str | None
    photo_storage_key: str | None
    photo_url: str | None = None
    hobbies: str | None
    special_skills: str | None
    personal_requests: str | None
```

`photo_url` is not an ORM column — it's a presigned URL computed at request time (see Task 4) since the storage bucket is private and `photo_storage_key` alone isn't fetchable by a browser.

- [ ] **Step 2: Add fields to `ProfileUpdateRequest`**

In the same file, in `ProfileUpdateRequest`, after the `visa_category: str | None = None` line:

```python
    visa_category: str | None = None
    hobbies: str | None = None
    special_skills: str | None = None
    personal_requests: str | None = None
```

`photo_storage_key` is deliberately **not** added here — it's only ever set via the dedicated upload endpoint in Task 4, never through the generic profile-update path, so upload validation stays centralized in one place.

- [ ] **Step 3: Run the schema/route tests**

Run: `cd backend && python -m pytest tests/unit/test_auth_routes.py tests/unit/test_document_schemas.py -v`
Expected: all pass.

- [ ] **Step 4: Mirror the fields in the frontend `Profile` type**

In `frontend/types/api.ts`, in the `Profile` interface, after `visa_category: string | null;`:

```typescript
  visa_category: string | null;
  photo_storage_key: string | null;
  photo_url: string | null;
  hobbies: string | null;
  special_skills: string | null;
  personal_requests: string | null;
```

- [ ] **Step 5: Mirror the fields in `ProfileUpdateRequest`**

In the same file, in `ProfileUpdateRequest`, after `visa_category?: string;`:

```typescript
  visa_category?: string;
  hobbies?: string;
  special_skills?: string;
  personal_requests?: string;
```

- [ ] **Step 6: Type-check the frontend**

Run: `cd frontend && npm run type-check`
Expected: no errors (nothing consumes these new fields yet, so this only verifies the type additions themselves are valid).

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/user.py frontend/types/api.ts
git commit -m "Add photo/hobbies/special_skills/personal_requests to Profile schemas"
```

---

## Task 3: Photo upload in `FileStorage`

**Files:**
- Modify: `backend/app/services/file_storage.py:65-137` (add `upload_photo` after `upload_resume`)

- [ ] **Step 1: Add `upload_photo`**

In `backend/app/services/file_storage.py`, immediately after the `upload_resume` method (which ends at line 107, right before `def upload_document`):

```python
    def upload_photo(
        self,
        *,
        file_bytes: bytes,
        user_id: UUID,
        original_filename: str,
        mime_type: str,
    ) -> str:
        """
        Upload a rirekisho photo to S3. Returns the S3 object key, stored in
        profiles.photo_storage_key.
        Key structure: photos/{user_id}/{uuid}.{ext}
        """
        ext = _extension_for(mime_type, original_filename)
        key = f"photos/{user_id}/{uuid4().hex}{ext}"

        try:
            _get_client().put_object(
                Bucket=self.bucket,
                Key=key,
                Body=file_bytes,
                ContentType=mime_type,
                ACL="private",
            )
        except (BotoCoreError, ClientError) as exc:
            logger.error("S3 upload failed: key=%s error=%s", key, exc)
            raise StorageError(f"Upload failed: {exc}") from exc

        logger.info("Uploaded photo: key=%s size=%d", key, len(file_bytes))
        return key
```

No change needed to `_extension_for` — `mimetypes.guess_extension("image/jpeg")` returns `.jpg` and `("image/png")` returns `.png` already.

- [ ] **Step 2: Sanity-check by hand**

Run:
```bash
cd backend && python -c "
from app.services.file_storage import _extension_for
assert _extension_for('image/jpeg', 'photo.jpg') == '.jpg'
assert _extension_for('image/png', 'photo.png') == '.png'
print('ok')
"
```
Expected: `ok`

(No dedicated unit test file exists for `file_storage.py` in this codebase — it's a thin boto3 wrapper exercised indirectly through the routes that call it, matching how `upload_resume`/`upload_document` are tested. `upload_photo` will be covered by Task 4's route tests via mocking.)

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/file_storage.py
git commit -m "Add FileStorage.upload_photo for rirekisho photo uploads"
```

---

## Task 4: `POST /auth/me/photo` endpoint + presigned photo URLs on `/auth/me`

**Files:**
- Modify: `backend/app/api/v1/auth.py`
- Modify: `backend/tests/unit/test_auth_routes.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/unit/test_auth_routes.py`, after the `PUT /auth/me` test section (after `test_update_me_returns_updated_profile`, before the `POST /auth/webhook` section header):

```python
# ---------------------------------------------------------------------------
# POST /auth/me/photo
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_photo_saves_key_and_returns_presigned_url() -> None:
    user = make_user()
    profile = make_profile(user_id=user.id)
    user.profile = profile

    with (
        _bypass_middleware(user),
        patch("app.api.v1.auth.magic.from_buffer", return_value="image/jpeg"),
        patch(
            "app.api.v1.auth.ProfileRepository.get_or_create",
            new=AsyncMock(return_value=(profile, False)),
        ),
        patch(
            "app.api.v1.auth.file_storage.upload_photo",
            return_value="photos/user123/abc.jpg",
        ),
        patch("app.api.v1.auth.ProfileRepository.update", new=AsyncMock(return_value=profile)),
        patch(
            "app.api.v1.auth.file_storage.presigned_url",
            return_value="https://s3.example.com/signed-photo-url",
        ),
        patch(
            "app.api.v1.auth.UserRepository.get_with_profile",
            new=AsyncMock(return_value=user),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/me/photo",
                headers=_auth_headers(),
                files={"file": ("photo.jpg", b"fake jpeg bytes", "image/jpeg")},
            )

    assert resp.status_code == 200
    assert resp.json()["profile"]["photo_url"] == "https://s3.example.com/signed-photo-url"


@pytest.mark.asyncio
async def test_upload_photo_deletes_old_photo_on_replace() -> None:
    user = make_user()
    profile = make_profile(user_id=user.id)
    profile.photo_storage_key = "photos/user123/old.jpg"
    user.profile = profile

    with (
        _bypass_middleware(user),
        patch("app.api.v1.auth.magic.from_buffer", return_value="image/png"),
        patch(
            "app.api.v1.auth.ProfileRepository.get_or_create",
            new=AsyncMock(return_value=(profile, False)),
        ),
        patch(
            "app.api.v1.auth.file_storage.upload_photo",
            return_value="photos/user123/new.png",
        ),
        patch("app.api.v1.auth.ProfileRepository.update", new=AsyncMock(return_value=profile)),
        patch("app.api.v1.auth.file_storage.presigned_url", return_value="https://s3.example.com/x"),
        patch("app.api.v1.auth.file_storage.delete") as mock_delete,
        patch(
            "app.api.v1.auth.UserRepository.get_with_profile",
            new=AsyncMock(return_value=user),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/me/photo",
                headers=_auth_headers(),
                files={"file": ("photo.png", b"fake png bytes", "image/png")},
            )

    assert resp.status_code == 200
    mock_delete.assert_called_once_with("photos/user123/old.jpg")


@pytest.mark.asyncio
async def test_upload_photo_rejects_disallowed_mime() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.auth.magic.from_buffer", return_value="application/pdf"),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/me/photo",
                headers=_auth_headers(),
                files={"file": ("photo.pdf", b"fake pdf bytes", "application/pdf")},
            )

    assert resp.status_code == 415


@pytest.mark.asyncio
async def test_upload_photo_too_large_returns_413() -> None:
    user = make_user()
    oversized = b"x" * (5 * 1024 * 1024 + 1)

    with _bypass_middleware(user):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/me/photo",
                headers=_auth_headers(),
                files={"file": ("photo.jpg", oversized, "image/jpeg")},
            )

    assert resp.status_code == 413
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd backend && python -m pytest tests/unit/test_auth_routes.py -k upload_photo -v`
Expected: FAIL — `404 Not Found` (route doesn't exist yet) or `AttributeError` for `app.api.v1.auth.magic`/`app.api.v1.auth.file_storage` (not imported yet).

- [ ] **Step 3: Update imports in `auth.py`**

In `backend/app/api/v1/auth.py`, replace the current import block (lines 10-33) with:

```python
from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import magic
from fastapi import APIRouter, HTTPException, Request, UploadFile, status
from sqlalchemy import func, select
from svix.webhooks import Webhook, WebhookVerificationError

from app.config import settings
from app.dependencies import AdminUser, AuthUser, DbSession, PaginationDep
from app.models.user import Profile, User
from app.repositories.user import ProfileRepository, UserRepository
from app.schemas.user import (
    AIQuotaResponse,
    ClerkWebhookEvent,
    ClerkWebhookUserData,
    MeResponse,
    ProfileResponse,
    ProfileUpdateRequest,
    UserListResponse,
    UserResponse,
)
from app.services.ai.usage_tracker import usage_tracker
from app.services.file_storage import StorageError, file_storage, sanitize_filename

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_ALLOWED_PHOTO_MIME = frozenset(["image/jpeg", "image/png"])
_MAX_PHOTO_SIZE = 5 * 1024 * 1024  # 5 MB
```

- [ ] **Step 4: Add the `_profile_response` helper**

In `backend/app/api/v1/auth.py`, add this near the bottom, in the helpers section (alongside `_extract_primary_email` etc. — before those, so it reads top-to-bottom as "response building" then "webhook parsing"):

```python
def _profile_response(profile: Profile | None) -> ProfileResponse | None:
    """
    Build a ProfileResponse from an ORM Profile, filling in photo_url — a
    presigned S3 URL — since photo_storage_key alone isn't fetchable by a
    browser (the bucket is private).
    """
    if profile is None:
        return None
    resp = ProfileResponse.model_validate(profile)
    if profile.photo_storage_key:
        try:
            resp = resp.model_copy(
                update={"photo_url": file_storage.presigned_url(profile.photo_storage_key)}
            )
        except StorageError:
            logger.warning("Failed to presign photo URL for profile_id=%s", profile.id)
    return resp
```

- [ ] **Step 5: Wire `_profile_response` into `get_me`, `update_me`, `record_consent`**

In `get_me` (around line 123-134), change the return to:

```python
    return MeResponse(
        user=UserResponse.model_validate(user),
        profile=_profile_response(user.profile),
    )
```

In `update_me` (around line 179-182), change the return to:

```python
    return MeResponse(
        user=UserResponse.model_validate(user),
        profile=_profile_response(profile),
    )
```

In `record_consent` (around line 209-212), change the return to:

```python
    return MeResponse(
        user=UserResponse.model_validate(user),
        profile=_profile_response(user.profile),
    )
```

- [ ] **Step 6: Add the `POST /auth/me/photo` endpoint**

In `backend/app/api/v1/auth.py`, add this new route right after `update_me` (after its closing `)` around line 182, before the `# --- Consent ---` section header):

```python
@router.post("/me/photo", response_model=MeResponse)
async def upload_my_photo(
    file: UploadFile,
    current_user: AuthUser,
    db: DbSession,
) -> MeResponse:
    """
    Upload/replace the rirekisho photo for the current user. Stores it in S3
    (private bucket) and saves the key on the user's profile. Any previously
    uploaded photo is deleted afterward (best-effort).
    """
    too_large = HTTPException(
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        detail=f"File exceeds maximum size of {_MAX_PHOTO_SIZE // 1024 // 1024} MB",
    )
    file_bytes = await file.read(_MAX_PHOTO_SIZE + 1)
    if len(file_bytes) > _MAX_PHOTO_SIZE:
        raise too_large

    detected_mime = magic.from_buffer(file_bytes[:2048], mime=True)
    if detected_mime not in _ALLOWED_PHOTO_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPEG and PNG images are accepted",
        )

    profile_repo = ProfileRepository(db)
    profile, _ = await profile_repo.get_or_create(current_user.user_id)
    old_key = profile.photo_storage_key

    try:
        new_key = file_storage.upload_photo(
            file_bytes=file_bytes,
            user_id=current_user.user_id,
            original_filename=sanitize_filename(file.filename or "photo"),
            mime_type=detected_mime,
        )
    except StorageError as exc:
        logger.error("Photo upload failed for user=%s: %s", current_user.user_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Photo upload failed. Please try again.",
        ) from exc

    profile = await profile_repo.update(profile, photo_storage_key=new_key)

    if old_key:
        try:
            file_storage.delete(old_key)
        except StorageError as exc:
            logger.warning("Failed to delete old photo key=%s: %s", old_key, exc)

    user_repo = UserRepository(db)
    user = await user_repo.get_with_profile(current_user.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return MeResponse(
        user=UserResponse.model_validate(user),
        profile=_profile_response(profile),
    )
```

Update the module docstring at the top of the file to list the new route:

```python
"""
Authentication routes.

POST /auth/webhook   — Clerk webhook: create/update user on Clerk events
GET  /auth/me        — return authenticated user + profile
PUT  /auth/me        — update profile fields
POST /auth/me/photo  — upload/replace the rirekisho photo
GET  /auth/users     — list all users (admin only)
"""
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/unit/test_auth_routes.py -v`
Expected: all pass, including the 4 new `upload_photo` tests.

- [ ] **Step 8: Run the full backend suite**

Run: `cd backend && python -m pytest tests/unit -v`
Expected: all pass (the `_profile_response` change touches every `MeResponse`-returning route).

- [ ] **Step 9: Run ruff and mypy**

Run: `cd backend && ruff check app/api/v1/auth.py && mypy app/api/v1/auth.py`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add backend/app/api/v1/auth.py backend/tests/unit/test_auth_routes.py
git commit -m "Add POST /auth/me/photo and presigned photo URLs on /auth/me"
```

---

## Task 5: Rirekisho schema fix — nullable dates, new personal fields, prompt update

**Files:**
- Modify: `backend/app/services/ai/prompts/rirekisho.py`
- Modify: `backend/tests/unit/test_rirekisho_prompt.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/unit/test_rirekisho_prompt.py`, in the `RirekishoEntry schema` section (after `test_rirekisho_entry_empty_entry_rejected`):

```python
def test_rirekisho_entry_allows_null_year_month_for_duty_description() -> None:
    entry = RirekishoEntry(year=None, month=None, entry="店長として、店舗経営業務を行う")
    assert entry.year is None
    assert entry.month is None
```

Add to the `System prompt` section (after `test_system_prompt_includes_all_schema_fields`):

```python
def test_system_prompt_covers_mid_tenure_role_change() -> None:
    prompt = build_system_prompt()
    assert "same company" in prompt.lower() or "within the same company" in prompt.lower()


def test_system_prompt_covers_undated_duty_description() -> None:
    prompt = build_system_prompt()
    assert "null" in prompt.lower()
```

Add a new section at the end of the file, after `test_rirekisho_visa_info_optional_fields_default_none`:

```python
# ---------------------------------------------------------------------------
# RirekishoPersonal — new Phase 1 fields
# ---------------------------------------------------------------------------


def test_rirekisho_personal_new_fields_default_none_except_requests() -> None:
    personal = RirekishoPersonal(
        name_kanji="山田 太郎",
        name_kana="ヤマダ タロウ",
        date_of_birth="令和6年3月",
        age=30,
        gender="男性",
        address="東京都",
        phone="090-0000-0000",
        email="test@example.com",
        personal_requests="貴社の規定に従います。",
    )
    assert personal.photo_data_uri is None
    assert personal.hobbies is None
    assert personal.special_skills is None
    assert personal.personal_requests == "貴社の規定に従います。"


def test_rirekisho_personal_requests_is_required() -> None:
    with pytest.raises(ValidationError):
        RirekishoPersonal(
            name_kanji="山田 太郎",
            name_kana="ヤマダ タロウ",
            date_of_birth="令和6年3月",
            age=30,
            gender="男性",
            address="東京都",
            phone="090-0000-0000",
            email="test@example.com",
        )
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/unit/test_rirekisho_prompt.py -v`
Expected: FAIL — `RirekishoEntry(year=None, ...)` raises `ValidationError` (fields aren't nullable yet); `RirekishoPersonal(...)` fails on missing `personal_requests` argument (doesn't exist yet); the two prompt-content tests fail on missing text.

- [ ] **Step 3: Update `RirekishoEntry` and `RirekishoPersonal`**

In `backend/app/services/ai/prompts/rirekisho.py`, replace the `RirekishoEntry` class:

```python
class RirekishoEntry(BaseModel):
    year: int | None = Field(default=None, ge=1950, le=2100)
    month: int | None = Field(default=None, ge=1, le=12)
    entry: str = Field(min_length=1)
```

Replace the `RirekishoPersonal` class:

```python
class RirekishoPersonal(BaseModel):
    """Assembled in Python from User/Profile — never part of Gemini's response."""

    name_kanji: str
    name_kana: str
    date_of_birth: str
    age: int = Field(ge=16, le=80)
    gender: str
    address: str
    phone: str
    email: str
    photo_data_uri: str | None = None
    hobbies: str | None = None
    special_skills: str | None = None
    personal_requests: str
```

- [ ] **Step 4: Update the system prompt**

In the same file, replace `build_system_prompt()`:

```python
def build_system_prompt() -> str:
    return """\
You are an expert Japanese career document writer specialising in 履歴書 \
(rirekisho) for foreign nationals applying to Japanese companies. You have \
deep knowledge of Japanese HR conventions, the JIS standard résumé format, \
and how to present Indonesian work experience in a way that resonates with \
Japanese hiring managers.

Your task is to generate the non-personal-info sections of a complete, \
properly formatted 履歴書 in Japanese based on the candidate's source \
resume. Personal information (name, date of birth, gender, address, phone, \
nationality, visa details) is sourced separately from the candidate's \
verified profile data — do not attempt to infer, guess, or include any of \
it in your response. Follow these rules strictly:

1. All text fields (entries, self_pr, motivation) must be written in natural \
Japanese (日本語). Translate experience and achievements into Japanese.
2. Education and work history must be in chronological order (oldest first).
3. Each education/work entry must be a single concise line following the \
convention: "学校名/会社名 + 入学/卒業/入社/退職" etc.
4. Preserve every distinct fact from the source resume — do not compress or \
drop detail just to keep entries short. Specifically for work_history:
   a. If the source resume describes a change in role, duties, or \
   responsibilities WITHIN the same company (not a new employer), add an \
   additional dated entry for that change. Do not repeat the company name \
   on this row — only the 入社/退職 rows name the company. Example: a \
   candidate who worked at one company from 2020-04 doing network design, \
   then changed to contract-management duties in 2022-07 without changing \
   employer, should produce THREE work_history rows for that company: the \
   入社 row, a row dated 2022-07 describing the new duties, and the 退職 \
   row (or a "現在に至る" final row if still employed there) — not one row \
   that discards the earlier role.
   b. You may add an undated entry (year and month both null) immediately \
   after a dated entry to describe that job's day-to-day duties in more \
   detail. Set both year and month to null (not 0, not omitted) for such \
   lines. Example: after a 入社 row, a null-dated row like "従業員数39名の \
   通信会社に技術派遣され、基地局設計を担当" is valid and expected when the \
   source resume gives this level of detail.
5. self_pr (自己PR): 3–5 sentences highlighting strengths relevant to \
Japanese workplace culture — teamwork (チームワーク), diligence (勤勉さ), \
adaptability (適応力).
6. motivation (志望動機): 3–5 sentences tailored to the target role/company \
if provided, otherwise write a compelling general motivation for working in Japan.

Return ONLY a JSON object matching this exact schema — no prose before or after:

{
  "education": [
    {"year": <int|null>, "month": <int 1-12|null>, "entry": <string in Japanese>},
    ...
  ],
  "work_history": [
    {"year": <int|null>, "month": <int 1-12|null>, "entry": <string in Japanese>},
    ...
  ],
  "qualifications": [<string in Japanese>, ...],
  "self_pr":    <string in Japanese — 3-5 sentences>,
  "motivation": <string in Japanese — 3-5 sentences>
}

year/month are null only for an undated duty-description row (rule 4b above) \
— every 入学/卒業/入社/退職 row and every mid-tenure role-change row \
(rule 4a) must have both year and month set.
"""
```

- [ ] **Step 5: Update the module docstring**

At the top of the file, replace the "Output schema" comment block (lines 18-31) to reflect nullable dates and an example of both new row kinds:

```python
Output schema (Gemini's actual response, stored in generated_documents.content
alongside the separately-assembled "personal"/"visa_info" blocks):
{
  "education": [
    {"year": 2012, "month": 3, "entry": "○○大学 ○○学部 卒業"}
  ],
  "work_history": [
    {"year": 2012, "month": 4, "entry": "株式会社○○ 入社"},
    {"year": null, "month": null, "entry": "従業員数50名の企業に技術派遣され、設計業務を担当"},
    {"year": 2016, "month": 7, "entry": "設計契約管理業務に配置転換"},
    {"year": 2018, "month": 3, "entry": "株式会社○○ 一身上の都合により退職"}
  ],
  "qualifications": ["普通自動車免許（第一種）", "日本語能力試験N3"],
  "self_pr":   "…",
  "motivation": "…"
}

RirekishoPersonal now also carries photo_data_uri, hobbies, special_skills,
and personal_requests — all assembled from Profile in
app.services.document_generator, never generated by Gemini, same as the
other personal-info fields.
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/unit/test_rirekisho_prompt.py -v`
Expected: all pass.

- [ ] **Step 7: Run ruff and mypy**

Run: `cd backend && ruff check app/services/ai/prompts/rirekisho.py && mypy app/services/ai/prompts/rirekisho.py`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/ai/prompts/rirekisho.py backend/tests/unit/test_rirekisho_prompt.py
git commit -m "Support nullable work-history dates and new personal fields in rirekisho prompt"
```

---

## Task 6: `document_generator.py` — rirekisho rendering (photo, hobbies, requests, blank dates)

**Files:**
- Modify: `backend/app/services/document_generator.py`
- Modify: `backend/tests/unit/test_document_generator.py`

- [ ] **Step 1: Write the failing tests**

In `backend/tests/unit/test_document_generator.py`, update `_rirekisho_render_content()` to include the new personal fields:

```python
def _rirekisho_render_content() -> dict:
    """
    Shape of the content dict AFTER DocumentGenerator.generate() merges in
    the DB-assembled personal/visa_info blocks — what _render_rirekisho()
    actually receives at render time. Distinct from _rirekisho_content(),
    which is what Gemini/RirekishoResult alone produces.
    """
    content = _rirekisho_content()
    content["personal"] = {
        "name_kanji": "山田 太郎",
        "name_kana": "ヤマダ タロウ",
        "date_of_birth": "平成2年1月15日",
        "age": 35,
        "gender": "男性",
        "address": "東京都渋谷区",
        "phone": "090-1234-5678",
        "email": "test@example.com",
        "photo_data_uri": None,
        "hobbies": "スノーボード",
        "special_skills": "Python",
        "personal_requests": "貴社の規定に従います。",
    }
    content["visa_info"] = {
        "nationality": "インドネシア",
        "visa_category": "技術・人文知識・国際業務",
        "residence_card_expiration": "2031年4月9日",
    }
    return content
```

Add new tests after `test_render_rirekisho_shows_nationality_only_when_not_held`:

```python
def test_render_rirekisho_shows_empty_photo_box_when_no_photo() -> None:
    html = _render_rirekisho(_rirekisho_render_content())
    assert "写真をはる位置" in html
    assert "<img" not in html


def test_render_rirekisho_shows_photo_when_present() -> None:
    content = _rirekisho_render_content()
    content["personal"]["photo_data_uri"] = "data:image/jpeg;base64,ZmFrZQ=="
    html = _render_rirekisho(content)
    assert '<img src="data:image/jpeg;base64,ZmFrZQ=="' in html
    assert "写真をはる位置" not in html


def test_render_rirekisho_shows_hobbies_and_skills() -> None:
    html = _render_rirekisho(_rirekisho_render_content())
    assert "スノーボード" in html
    assert "Python" in html
    assert "特技・趣味" in html


def test_render_rirekisho_shows_personal_requests() -> None:
    html = _render_rirekisho(_rirekisho_render_content())
    assert "貴社の規定に従います。" in html
    assert "本人希望記入欄" in html


def test_render_rirekisho_handles_blank_date_entry() -> None:
    content = _rirekisho_render_content()
    content["work_history"].append(
        {"year": None, "month": None, "entry": "店長として、店舗経営業務を行う"}
    )
    html = _render_rirekisho(content)
    assert "店長として、店舗経営業務を行う" in html
    # Should not crash trying to format a null date, and the row should
    # render with an empty date cell rather than "None年None月".
    assert "None" not in html
```

Add a new test for `_build_rirekisho_personal`'s photo/requests assembly, in a new section after the existing renderer tests (before `# --- DocumentGenerator.generate — success path (rirekisho) ---`):

```python
# ---------------------------------------------------------------------------
# _build_rirekisho_personal — photo, hobbies, personal_requests assembly
# ---------------------------------------------------------------------------


def test_build_rirekisho_personal_defaults_personal_requests() -> None:
    from app.services.document_generator import _build_rirekisho_personal

    user = _mock_user()
    profile = _mock_profile()
    profile.photo_storage_key = None
    profile.hobbies = None
    profile.special_skills = None
    profile.personal_requests = None

    personal = _build_rirekisho_personal(user, profile)
    assert personal["personal_requests"] == "貴社の規定に従います。"
    assert personal["photo_data_uri"] is None
    assert personal["hobbies"] is None


def test_build_rirekisho_personal_uses_custom_personal_requests() -> None:
    from app.services.document_generator import _build_rirekisho_personal

    user = _mock_user()
    profile = _mock_profile()
    profile.photo_storage_key = None
    profile.hobbies = "スノーボード"
    profile.special_skills = "Python"
    profile.personal_requests = "リモートワークを希望します。"

    personal = _build_rirekisho_personal(user, profile)
    assert personal["personal_requests"] == "リモートワークを希望します。"
    assert personal["hobbies"] == "スノーボード"
    assert personal["special_skills"] == "Python"


def test_build_rirekisho_personal_embeds_photo_as_data_uri() -> None:
    from app.services.document_generator import _build_rirekisho_personal

    user = _mock_user()
    profile = _mock_profile()
    profile.photo_storage_key = "photos/u1/abc.jpg"
    profile.hobbies = None
    profile.special_skills = None
    profile.personal_requests = None

    with patch(
        "app.services.document_generator.file_storage.download",
        return_value=b"fake-jpeg-bytes",
    ):
        personal = _build_rirekisho_personal(user, profile)

    assert personal["photo_data_uri"] == "data:image/jpeg;base64,ZmFrZS1qcGVnLWJ5dGVz"


def test_build_rirekisho_personal_photo_download_failure_omits_photo() -> None:
    from app.services.document_generator import _build_rirekisho_personal

    user = _mock_user()
    profile = _mock_profile()
    profile.photo_storage_key = "photos/u1/abc.jpg"
    profile.hobbies = None
    profile.special_skills = None
    profile.personal_requests = None

    with patch(
        "app.services.document_generator.file_storage.download",
        side_effect=StorageError("boom"),
    ):
        personal = _build_rirekisho_personal(user, profile)

    assert personal["photo_data_uri"] is None
```

Add the `StorageError` import at the top of the test file:

```python
from app.services.file_storage import StorageError
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/unit/test_document_generator.py -v`
Expected: FAIL — `_build_rirekisho_personal` doesn't accept/produce the new fields yet; `_render_rirekisho` doesn't emit the photo box, hobbies box, or personal-requests box; the blank-date test crashes with a `TypeError` from `format_wareki_date(None, None)`.

- [ ] **Step 3: Add `base64` import and the default-requests constant**

In `backend/app/services/document_generator.py`, add to the imports (after `import asyncio`):

```python
import asyncio
import base64
import logging
```

Add this constant near the top of the "Rirekisho personal-info assembly" section (right after the section's docstring comment, before `_check_rirekisho_profile_complete`):

```python
_DEFAULT_PERSONAL_REQUESTS = "貴社の規定に従います。"
```

- [ ] **Step 4: Update `_build_rirekisho_personal`**

Replace the function body:

```python
def _build_rirekisho_personal(user: User, profile: Profile) -> dict[str, Any]:
    """Assemble the rirekisho personal-info block from User/Profile."""
    from pydantic import ValidationError

    from app.services.ai.prompts.rirekisho import RirekishoPersonal
    from app.utils.japanese_date import format_wareki_full

    dob = profile.date_of_birth
    if dob is None:
        raise DocumentGenerationError("date_of_birth missing after completeness check")
    if profile.gender is None:
        raise DocumentGenerationError("gender missing after completeness check")

    today = date.today()
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    gender_ja = "男性" if profile.gender == Gender.male else "女性"

    photo_data_uri: str | None = None
    if profile.photo_storage_key:
        try:
            photo_bytes = file_storage.download(profile.photo_storage_key)
            ext = profile.photo_storage_key.rsplit(".", 1)[-1].lower()
            mime = "image/png" if ext == "png" else "image/jpeg"
            photo_data_uri = f"data:{mime};base64,{base64.b64encode(photo_bytes).decode('ascii')}"
        except StorageError:
            logger.warning(
                "Failed to fetch rirekisho photo for user_id=%s; rendering without it", user.id
            )

    try:
        personal = RirekishoPersonal(
            name_kanji=user.full_name or "",
            name_kana=profile.name_kana or "",
            date_of_birth=format_wareki_full(dob.year, dob.month, dob.day),
            age=age,
            gender=gender_ja,
            address=profile.mailing_address or "",
            phone=profile.phone_number or "",
            email=user.email,
            photo_data_uri=photo_data_uri,
            hobbies=profile.hobbies or None,
            special_skills=profile.special_skills or None,
            personal_requests=profile.personal_requests or _DEFAULT_PERSONAL_REQUESTS,
        )
    except ValidationError as exc:
        raise DocumentGenerationError(f"Invalid personal info for rirekisho: {exc}") from exc
    return personal.model_dump()
```

- [ ] **Step 5: Update `_render_rirekisho`**

Replace the entire function:

```python
def _render_rirekisho(c: dict[str, Any]) -> str:
    p = c.get("personal", {})
    v = c.get("visa_info", {})

    from app.utils.japanese_date import format_wareki_date

    def _entry_row(entry: dict[str, Any]) -> str:
        year, month = entry.get("year"), entry.get("month")
        date_cell = format_wareki_date(year, month) if year is not None and month is not None else ""
        return f"<tr><td>{date_cell}</td><td>{_esc(entry['entry'])}</td></tr>"

    education_rows = "".join(_entry_row(e) for e in c.get("education", []))
    work_rows = "".join(_entry_row(w) for w in c.get("work_history", []))
    qualifications = "".join(f"<li>{_esc(q)}</li>" for q in c.get("qualifications", []))

    visa_category = v.get("visa_category")
    if visa_category:
        visa_line = (
            f"{v.get('nationality', '')}（{visa_category}）"
            f"　有効期限：{v.get('residence_card_expiration', '')}"
        )
    else:
        visa_line = v.get("nationality", "")

    photo_data_uri = p.get("photo_data_uri")
    if photo_data_uri:
        photo_box_inner = (
            f'<img src="{_esc(photo_data_uri)}" '
            'style="width:100%; height:100%; object-fit:cover;" />'
        )
    else:
        photo_box_inner = (
            "写真をはる位置<br>1.縦36〜40mm<br>横24〜30mm"
            "<br>2.本人単身胸から上<br>3.裏面のりづけ"
        )

    return f"""
<div style="max-width:170mm; margin:0 auto;">
  <h1 style="text-align:center; font-size:16pt; letter-spacing:0.3em; margin-bottom:8px;">
    履　歴　書
  </h1>

  <div style="display:flex; gap:8px; align-items:flex-start; margin-bottom:6px;">
    <table style="flex:1;">
      <tr>
        <th style="width:16%;">ふりがな</th>
        <td style="width:42%;">{_esc(p.get("name_kana", ""))}</td>
        <th style="width:12%;">性別</th>
        <td style="width:30%;">{_esc(p.get("gender", ""))}</td>
      </tr>
      <tr>
        <th>氏名</th>
        <td style="font-size:13pt; font-weight:bold;">{_esc(p.get("name_kanji", ""))}</td>
        <th>生年月日</th>
        <td>{_esc(p.get("date_of_birth", ""))}（満{p.get("age", "")}歳）</td>
      </tr>
      <tr>
        <th>住所</th>
        <td colspan="3">{_esc(p.get("address", ""))}</td>
      </tr>
      <tr>
        <th>電話番号</th>
        <td>{_esc(p.get("phone", ""))}</td>
        <th>メール</th>
        <td>{_esc(p.get("email", ""))}</td>
      </tr>
      <tr>
        <th>国籍・ビザ</th>
        <td colspan="3">{_esc(visa_line)}</td>
      </tr>
    </table>
    <div style="width:30mm; height:40mm; flex-shrink:0; border:1px solid #333; display:flex; align-items:center; justify-content:center; text-align:center; font-size:8pt; padding:2px;">
      {photo_box_inner}
    </div>
  </div>

  <p class="section-title">学歴・職歴</p>
  <table>
    <thead>
      <tr><th style="width:22%;">年月</th><th>内容</th></tr>
    </thead>
    <tbody>
      <tr><td colspan="2" style="text-align:center; font-weight:bold;">学歴</td></tr>
      {education_rows}
      <tr><td colspan="2" style="text-align:center; font-weight:bold;">職歴</td></tr>
      {work_rows}
      <tr><td colspan="2" style="text-align:right;">以上</td></tr>
    </tbody>
  </table>

  <p class="section-title">資格・免許</p>
  <ul style="padding-left:1.2em; margin:4px 0;">{qualifications}</ul>

  <p class="section-title">特技・趣味</p>
  <div style="padding:4px; font-size:10pt;">
    <p style="margin:2px 0;"><strong>趣味：</strong>{_esc(p.get("hobbies") or "")}</p>
    <p style="margin:2px 0;"><strong>特技：</strong>{_esc(p.get("special_skills") or "")}</p>
  </div>

  <p class="section-title">自己PR</p>
  <p style="white-space:pre-wrap; padding:4px;">{_esc(c.get("self_pr", ""))}</p>

  <p class="section-title">志望動機</p>
  <p style="white-space:pre-wrap; padding:4px;">{_esc(c.get("motivation", ""))}</p>

  <p class="section-title">本人希望記入欄</p>
  <p style="white-space:pre-wrap; padding:4px;">{_esc(p.get("personal_requests", ""))}</p>
</div>
"""
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/unit/test_document_generator.py -v`
Expected: all pass.

- [ ] **Step 7: Run ruff and mypy**

Run: `cd backend && ruff check app/services/document_generator.py && mypy app/services/document_generator.py`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/document_generator.py backend/tests/unit/test_document_generator.py
git commit -m "Render photo box, hobbies/skills, and personal-requests in rirekisho PDF"
```

---

## Task 7: Shokumu schema fix — role-periods per company

**Files:**
- Modify: `backend/app/services/ai/prompts/shokumu.py`
- Modify: `backend/tests/unit/test_shokumu_prompt.py`
- Modify: `backend/app/services/document_generator.py` (`_render_shokumu`)
- Modify: `backend/tests/unit/test_document_generator.py` (`_shokumu_content` fixture + tests)

- [ ] **Step 1: Update the import and existing fixture helpers**

`backend/tests/unit/test_shokumu_prompt.py` currently has flat fixtures (`_valid_company()` puts `role`/`period_start`/`period_end`/`responsibilities`/`achievements` directly on the company) that four existing tests depend on. Replace the import line:

```python
from app.services.ai.prompts.shokumu import (
    ShokumuCompany,
    ShokumuResult,
    ShokumuRolePeriod,
    ShokumuSkills,
    build_system_prompt,
    build_user_prompt,
)
```

Replace `_valid_company()` (in the `ShokumuCompany schema` section) with:

```python
def _valid_role_period() -> dict:
    return {
        "role": "ソフトウェアエンジニア",
        "period_start": "2015年4月",
        "period_end": "2020年3月",
        "responsibilities": ["バックエンド開発を担当"],
        "achievements": ["システム応答速度を30%改善"],
    }


def _valid_company() -> dict:
    return {
        "company_name": "株式会社テスト",
        "industry": "情報通信業",
        "employee_count": "約500名",
        "roles": [_valid_role_period()],
    }
```

- [ ] **Step 2: Fix the existing tests that assert flat company fields**

Replace these four existing tests in the same section:

```python
def test_shokumu_company_valid() -> None:
    company = ShokumuCompany.model_validate(_valid_company())
    assert company.company_name == "株式会社テスト"
    assert len(company.roles[0].responsibilities) == 1


def test_shokumu_company_empty_responsibilities_rejected() -> None:
    data = _valid_company()
    data["roles"][0]["responsibilities"] = []
    with pytest.raises(ValidationError):
        ShokumuCompany.model_validate(data)


def test_shokumu_company_empty_achievements_allowed() -> None:
    data = _valid_company()
    data["roles"][0]["achievements"] = []
    company = ShokumuCompany.model_validate(data)
    assert company.roles[0].achievements == []


def test_shokumu_company_current_job_uses_genzai() -> None:
    data = _valid_company()
    data["roles"][0]["period_end"] = "現在"
    company = ShokumuCompany.model_validate(data)
    assert company.roles[0].period_end == "現在"
```

`_valid_result()` needs no change — it already just embeds `_valid_company()`, so it picks up the new shape automatically.

- [ ] **Step 3: Write the new failing tests**

Add to the same section, after `test_shokumu_company_current_job_uses_genzai`:

```python
def test_shokumu_company_supports_multiple_role_periods() -> None:
    company = ShokumuCompany(
        company_name="株式会社BLUESTONE",
        industry="情報通信業",
        employee_count="約39名",
        roles=[
            ShokumuRolePeriod(
                role="技術派遣エンジニア",
                period_start="2020年9月",
                period_end="2022年6月",
                responsibilities=["基地局設計を担当"],
                achievements=["設計精度を向上"],
            ),
            ShokumuRolePeriod(
                role="設計契約管理担当",
                period_start="2022年7月",
                period_end="現在",
                responsibilities=["契約管理業務を担当"],
                achievements=[],
            ),
        ],
    )
    assert len(company.roles) == 2
    assert company.roles[0].role == "技術派遣エンジニア"
    assert company.roles[1].period_start == "2022年7月"


def test_shokumu_company_requires_at_least_one_role() -> None:
    with pytest.raises(ValidationError):
        ShokumuCompany(
            company_name="株式会社ABC",
            industry="IT",
            employee_count="100名",
            roles=[],
        )
```

Add to the `System prompt` section, after `test_system_prompt_instructs_reverse_chronological`:

```python
def test_system_prompt_covers_role_change_without_employer_change() -> None:
    prompt = build_system_prompt()
    assert "same employer" in prompt.lower() or "same company" in prompt.lower()
```

- [ ] **Step 4: Run the tests to verify the new/changed ones fail**

Run: `cd backend && python -m pytest tests/unit/test_shokumu_prompt.py -v`
Expected: FAIL — `ShokumuCompany` has no `roles` field yet, `ShokumuRolePeriod` doesn't exist, and the four updated tests fail validation against the still-flat schema.

- [ ] **Step 5: Update the schema**

In `backend/app/services/ai/prompts/shokumu.py`, replace `ShokumuCompany` with:

```python
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
```

- [ ] **Step 6: Update the module docstring's output-schema example**

Replace the `"companies"` block in the docstring at the top of the file:

```python
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
```

Add a line noting the multi-role support (after the existing "Unlike the rigid 履歴書..." sentence):

```python
A company with a promotion, transfer, or duty change during one tenure
should produce multiple entries in that company's "roles" list — one per
distinct role/period — rather than merging them into a single role.
```

- [ ] **Step 7: Update the system prompt**

Replace `build_system_prompt()`'s rules 2-3 and JSON schema in `shokumu.py`:

```python
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
3. If the candidate had a promotion, transfer, or change of duties WITHOUT \
changing employer, represent it as multiple entries in that company's \
"roles" list (one per distinct role/period), not as a separate company \
entry and not merged into one role's responsibilities. Each role within a \
company must be in chronological order (oldest first).
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
```

- [ ] **Step 8: Run the shokumu prompt tests to verify they pass**

Run: `cd backend && python -m pytest tests/unit/test_shokumu_prompt.py -v`
Expected: all pass.

- [ ] **Step 9: Update `_shokumu_content()` and `_render_shokumu` (rendering)**

In `backend/tests/unit/test_document_generator.py`, replace `_shokumu_content()`:

```python
def _shokumu_content() -> dict:
    return {
        "summary": "10年以上の経験を持つエンジニアです。",
        "companies": [
            {
                "company_name": "株式会社ABC",
                "industry": "情報通信業",
                "employee_count": "約500名",
                "roles": [
                    {
                        "role": "ソフトウェアエンジニア",
                        "period_start": "2015年4月",
                        "period_end": "現在",
                        "responsibilities": ["バックエンド開発を担当"],
                        "achievements": ["レスポンス速度を30%改善"],
                    }
                ],
            }
        ],
        "skills": {
            "technical": ["Python", "Java"],
            "languages": ["日本語（N3）", "英語（ビジネスレベル）"],
            "other": ["アジャイル開発"],
        },
        "self_pr": "チームワークを大切にしています。",
        "motivation": "日本のIT業界で貢献したいです。",
    }
```

Add a new test after `test_render_shokumu_handles_empty_achievements`:

```python
def test_render_shokumu_shows_multiple_roles_for_one_company() -> None:
    content = _shokumu_content()
    content["companies"][0]["roles"] = [
        {
            "role": "技術派遣エンジニア",
            "period_start": "2020年9月",
            "period_end": "2022年6月",
            "responsibilities": ["基地局設計を担当"],
            "achievements": [],
        },
        {
            "role": "設計契約管理担当",
            "period_start": "2022年7月",
            "period_end": "現在",
            "responsibilities": ["契約管理業務を担当"],
            "achievements": [],
        },
    ]
    html = _render_shokumu(content)
    assert "技術派遣エンジニア" in html
    assert "設計契約管理担当" in html
    assert html.count("株式会社ABC") == 1  # company name shown once, not per role
```

In `backend/app/services/document_generator.py`, replace `_render_shokumu`'s company-loop body:

```python
def _render_shokumu(c: dict[str, Any]) -> str:
    skills = c.get("skills", {})

    def skill_items(items: list[str]) -> str:
        return "　／　".join(_esc(s) for s in items) if items else "―"

    companies_html = ""
    for company in c.get("companies", []):
        roles_html = ""
        for role in company.get("roles", []):
            responsibilities = "".join(
                f"<li>{_esc(r)}</li>" for r in role.get("responsibilities", [])
            )
            achievements = (
                "".join(f"<li>{_esc(a)}</li>" for a in role.get("achievements", [])) or "<li>―</li>"
            )
            roles_html += f"""
  <table style="margin-bottom:4px;">
    <tr>
      <th style="width:20%;">役職・職種</th>
      <td style="width:46%; font-weight:bold;">{_esc(role.get("role", ""))}</td>
      <th style="width:14%;">在籍期間</th>
      <td>{_esc(role.get("period_start", ""))} 〜 {_esc(role.get("period_end", ""))}</td>
    </tr>
  </table>
  <p class="label">【業務内容】</p>
  <ul style="padding-left:1.2em; margin:2px 0 6px;">{responsibilities}</ul>
  <p class="label">【実績・成果】</p>
  <ul style="padding-left:1.2em; margin:2px 0;">{achievements}</ul>
"""
        companies_html += f"""
<div style="margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #ccc;">
  <table style="margin-bottom:4px;">
    <tr>
      <th style="width:20%;">会社名</th>
      <td style="width:46%; font-weight:bold;">{_esc(company.get("company_name", ""))}</td>
      <th style="width:14%;">業種</th>
      <td>{_esc(company.get("industry", ""))}</td>
    </tr>
    <tr>
      <th>従業員数</th>
      <td colspan="3">{_esc(company.get("employee_count", ""))}</td>
    </tr>
  </table>
  {roles_html}
</div>
"""

    return f"""
<div style="max-width:170mm; margin:0 auto;">
  <h1 style="font-size:15pt; border-bottom:3px solid #333; padding-bottom:4px; margin-bottom:8px;">
    職務経歴書
  </h1>

  <p class="section-title">職務要約</p>
  <p style="white-space:pre-wrap; padding:4px; margin-bottom:10px;">
    {_esc(c.get("summary", ""))}
  </p>

  <p class="section-title">職務経歴</p>
  {companies_html}

  <p class="section-title">スキル</p>
  <table style="margin-bottom:10px;">
    <tr>
      <th style="width:22%;">技術スキル</th>
      <td>{skill_items(skills.get("technical", []))}</td>
    </tr>
    <tr>
      <th>語学</th>
      <td>{skill_items(skills.get("languages", []))}</td>
    </tr>
    <tr>
      <th>その他</th>
      <td>{skill_items(skills.get("other", []))}</td>
    </tr>
  </table>

  <p class="section-title">自己PR</p>
  <p style="white-space:pre-wrap; padding:4px; margin-bottom:10px;">
    {_esc(c.get("self_pr", ""))}
  </p>

  <p class="section-title">志望動機</p>
  <p style="white-space:pre-wrap; padding:4px;">
    {_esc(c.get("motivation", ""))}
  </p>
</div>
"""
```

Note: `test_render_shokumu_handles_empty_achievements` sets `content["companies"][0]["achievements"] = []` — with the new shape that field doesn't exist at the company level anymore. Update that test to set it on the role instead:

```python
def test_render_shokumu_handles_empty_achievements() -> None:
    content = _shokumu_content()
    content["companies"][0]["roles"][0]["achievements"] = []
    html = _render_shokumu(content)
    assert "職務経歴書" in html  # should not crash
```

- [ ] **Step 10: Run the full document-generator test suite**

Run: `cd backend && python -m pytest tests/unit/test_document_generator.py tests/unit/test_shokumu_prompt.py -v`
Expected: all pass.

- [ ] **Step 11: Run ruff and mypy on all touched files**

Run: `cd backend && ruff check app/services/ai/prompts/shokumu.py app/services/document_generator.py && mypy app/services/ai/prompts/shokumu.py app/services/document_generator.py`
Expected: no errors.

- [ ] **Step 12: Run the entire backend test suite**

Run: `cd backend && python -m pytest tests/unit -v`
Expected: all pass.

- [ ] **Step 13: Commit**

```bash
git add backend/app/services/ai/prompts/shokumu.py backend/tests/unit/test_shokumu_prompt.py backend/app/services/document_generator.py backend/tests/unit/test_document_generator.py
git commit -m "Support multiple role-periods per company in shokumu, preserving mid-tenure changes"
```

---

## Task 8: Frontend `PhotoUploader` component + `useUploadPhoto` hook

**Files:**
- Create: `frontend/components/profile/PhotoUploader.tsx`
- Modify: `frontend/hooks/useMe.ts`

- [ ] **Step 1: Add the `useUploadPhoto` hook**

In `frontend/hooks/useMe.ts`, add after `useUpdateProfile`:

```typescript
export function useUploadPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiClient.upload<MeResponse>("/auth/me/photo", form);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["me"], updated);
    },
  });
}
```

- [ ] **Step 2: Create the `PhotoUploader` component**

Create `frontend/components/profile/PhotoUploader.tsx`:

```tsx
"use client";

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { useMe, useUploadPhoto } from "@/hooks/useMe";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";

const ACCEPTED_MIME = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export function PhotoUploader() {
  const { data: me } = useMe();
  const uploadPhoto = useUploadPhoto();
  const [fileError, setFileError] = useState<string | null>(null);
  const { lang } = useLang();

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      setFileError(null);
      if (rejected.length > 0) {
        const firstError = rejected[0]?.errors[0]?.message ?? t("settings", "photoInvalid", lang);
        setFileError(firstError);
        return;
      }
      const file = accepted[0];
      if (!file) return;
      uploadPhoto.mutate(file);
    },
    [uploadPhoto, lang],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_MIME,
    maxSize: MAX_SIZE_BYTES,
    multiple: false,
    disabled: uploadPhoto.isPending,
  });

  const photoUrl = me?.profile?.photo_url ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="flex h-24 w-20 items-center justify-center overflow-hidden rounded-md border bg-muted">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="px-1 text-center text-[10px] text-muted-foreground">
              {t("settings", "photoNone", lang)}
            </span>
          )}
        </div>
        <div
          {...getRootProps()}
          className={[
            "flex-1 cursor-pointer rounded-md border-2 border-dashed p-4 text-center text-sm transition-colors",
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40",
            uploadPhoto.isPending ? "pointer-events-none opacity-60" : "",
          ].join(" ")}
        >
          <input {...getInputProps()} />
          {uploadPhoto.isPending
            ? t("settings", "photoUploading", lang)
            : t("settings", "photoUpload", lang)}
        </div>
      </div>
      {fileError && <p className="text-xs text-destructive">{fileError}</p>}
      {uploadPhoto.isError && (
        <p className="text-xs text-destructive">{t("settings", "photoUploadFail", lang)}</p>
      )}
    </div>
  );
}
```

(The `settings.photo*` translation keys are added in Task 10 — this component is used both in onboarding step 5 and Settings, so its copy lives under the shared `settings` namespace rather than being duplicated.)

- [ ] **Step 3: Type-check**

Run: `cd frontend && npm run type-check`
Expected: fails until Task 10 adds the `settings.photo*` i18n keys (the `t()` calls reference keys that don't exist yet) — this is expected at this point; Task 10 completes it. If your `t()` helper doesn't type-check key names (many don't), this will pass already — verify by running it now regardless.

- [ ] **Step 4: Commit**

```bash
git add frontend/hooks/useMe.ts frontend/components/profile/PhotoUploader.tsx
git commit -m "Add PhotoUploader component and useUploadPhoto hook"
```

---

## Task 9: Onboarding step 5 — add photo, hobbies, skills, personal-requests fields

**Files:**
- Modify: `frontend/app/onboarding/page.tsx`
- Modify: `frontend/lib/i18n.ts` (`onboarding` section)

- [ ] **Step 1: Add i18n keys**

In `frontend/lib/i18n.ts`, in the `onboarding` section, add after the last `s5*` key (near `s5VisaCategory`, before the section ends around line 616 in the original file — find the closing of the `onboarding` object and add just before it, or alongside the other `s5*` keys for locality):

```typescript
    s5GroupExtras: {
      en: "Extras (optional)",
      id: "Tambahan (opsional)",
      ja: "その他（任意）",
    },
    s5Photo: { en: "Photo", id: "Foto", ja: "写真" },
    s5PhotoHint: {
      en: "Used on your generated rirekisho. You can add or change this later in Settings.",
      id: "Digunakan pada rirekisho yang dihasilkan. Bisa ditambah/diganti nanti di Pengaturan.",
      ja: "生成される履歴書に使用されます。後で設定からも追加・変更できます。",
    },
    s5Hobbies: { en: "Hobbies", id: "Hobi", ja: "趣味" },
    s5SpecialSkills: { en: "Special skills", id: "Keahlian khusus", ja: "特技" },
    s5PersonalRequests: {
      en: "Requests to employer",
      id: "Permintaan kepada perusahaan",
      ja: "本人希望記入欄",
    },
    s5PersonalRequestsHint: {
      en: "Leave as-is to use the standard phrase, or edit if you have a specific request.",
      id: "Biarkan apa adanya untuk frasa standar, atau ubah jika punya permintaan khusus.",
      ja: "標準の文言のままでも構いません。特に希望があれば編集してください。",
    },
```

- [ ] **Step 2: Extend the step 5 schema**

In `frontend/app/onboarding/page.tsx`, replace `step5BaseSchema`:

```typescript
const step5BaseSchema = z.object({
  name_kana: z.string().min(1, "Furigana is required"),
  date_of_birth: z.string().min(1, "Date of birth is required"),
  gender: z.enum(["male", "female"] as const),
  phone_number: z.string().min(1, "Phone number is required"),
  mailing_address: z.string().min(1, "Mailing address is required"),
  residence_card_expiration: z.string().min(1, "Residence card expiration date is required"),
  visa_category: z.string().optional(),
  hobbies: z.string().optional(),
  special_skills: z.string().optional(),
  personal_requests: z.string().optional(),
});
```

- [ ] **Step 3: Pass through defaults and submit the new fields**

In the page component, in the `Step5` invocation's `defaults` object (around line 235-243), add:

```typescript
            defaults={{
              name_kana: me?.profile?.name_kana ?? undefined,
              date_of_birth: me?.profile?.date_of_birth ?? undefined,
              gender: me?.profile?.gender ?? undefined,
              phone_number: me?.profile?.phone_number ?? undefined,
              mailing_address: me?.profile?.mailing_address ?? undefined,
              residence_card_expiration: me?.profile?.residence_card_expiration ?? undefined,
              visa_category: me?.profile?.visa_category ?? undefined,
              hobbies: me?.profile?.hobbies ?? undefined,
              special_skills: me?.profile?.special_skills ?? undefined,
              personal_requests: me?.profile?.personal_requests ?? "貴社の規定に従います。",
            }}
```

In the `onNext` handler for step 5 (around line 244-261), add the new fields to the `updateProfile.mutateAsync` call:

```typescript
            onNext={async (data) => {
              setError(null);
              try {
                await updateProfile.mutateAsync({
                  name_kana: data.name_kana,
                  date_of_birth: data.date_of_birth,
                  gender: data.gender as Gender,
                  phone_number: data.phone_number,
                  mailing_address: data.mailing_address,
                  residence_card_expiration: data.residence_card_expiration,
                  ...(data.visa_category ? { visa_category: data.visa_category } : {}),
                  ...(data.hobbies ? { hobbies: data.hobbies } : {}),
                  ...(data.special_skills ? { special_skills: data.special_skills } : {}),
                  ...(data.personal_requests ? { personal_requests: data.personal_requests } : {}),
                  onboarding_step: 5,
                });
                router.push("/dashboard/resumes");
              } catch (err) {
                setError(errorMessage(err, lang));
              }
            }}
```

- [ ] **Step 4: Add the new fields to the `Step5` form JSX**

In the `Step5` component, after the visa-category block (after the `{visaHeld && (...)}` block, around line 606, before the `<div className="flex gap-3">` buttons row), add:

```tsx
      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {t("onboarding", "s5GroupExtras", lang)}
      </p>
      <Field label={t("onboarding", "s5Photo", lang)} hint={t("onboarding", "s5PhotoHint", lang)}>
        <PhotoUploader />
      </Field>
      <Field label={t("onboarding", "s5Hobbies", lang)}>
        <input {...register("hobbies")} className={inputCls} />
      </Field>
      <Field label={t("onboarding", "s5SpecialSkills", lang)}>
        <input {...register("special_skills")} className={inputCls} />
      </Field>
      <Field
        label={t("onboarding", "s5PersonalRequests", lang)}
        hint={t("onboarding", "s5PersonalRequestsHint", lang)}
      >
        <input {...register("personal_requests")} className={inputCls} />
      </Field>
```

This page's local `Field` component (defined at the bottom of the file, currently only accepting `label`/`error`/`children`) doesn't accept a `hint` prop yet — add one, matching the pattern already used in `frontend/app/dashboard/settings/page.tsx`'s `Field` component. Replace the existing `Field` function definition with:

```tsx
function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
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
```

- [ ] **Step 5: Import `PhotoUploader`**

At the top of `frontend/app/onboarding/page.tsx`, add:

```typescript
import { PhotoUploader } from "@/components/profile/PhotoUploader";
```

- [ ] **Step 6: Type-check and lint**

Run: `cd frontend && npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Start the dev servers (backend + frontend) and, in a browser: create or use a test account not yet past onboarding step 5, walk through to step 5, confirm the new Photo/Hobbies/Special skills/Requests fields appear, upload a JPEG photo, fill in hobbies/skills, submit, and confirm no errors and the redirect to `/dashboard/resumes` happens.

- [ ] **Step 8: Commit**

```bash
git add frontend/app/onboarding/page.tsx frontend/lib/i18n.ts
git commit -m "Add photo, hobbies, special skills, and personal-requests fields to onboarding step 5"
```

---

## Task 10: Settings — new "Rirekisho Info" section (closes the post-onboarding edit gap)

**Files:**
- Modify: `frontend/app/dashboard/settings/page.tsx`
- Modify: `frontend/lib/i18n.ts` (`settings` section)

This is the section that lets an **already-onboarded** user (like the one this whole investigation started from) fix their name/DOB/address/phone/visa info, which today is only settable during onboarding and becomes permanently inaccessible once `onboarding_completed` is true.

- [ ] **Step 1: Add i18n keys**

In `frontend/lib/i18n.ts`, in the `settings` section, add after `targetIndustriesHint` (before `preferredLang`):

```typescript
    rirekishoInfo: { en: "Rirekisho info", id: "Info rirekisho", ja: "履歴書情報" },
    rirekishoInfoHint: {
      en: "Used to generate your 履歴書 (rirekisho). Keep this accurate — it's printed verbatim.",
      id: "Digunakan untuk membuat 履歴書 (rirekisho). Pastikan akurat — dicetak apa adanya.",
      ja: "履歴書の生成に使用されます。そのまま印刷されるため、正確に保ってください。",
    },
    fullName: { en: "Full name", id: "Nama lengkap", ja: "氏名" },
    nameKana: { en: "Name (furigana)", id: "Nama (furigana)", ja: "ふりがな" },
    dateOfBirth: { en: "Date of birth", id: "Tanggal lahir", ja: "生年月日" },
    gender: { en: "Gender", id: "Jenis kelamin", ja: "性別" },
    genderMale: { en: "Male", id: "Laki-laki", ja: "男性" },
    genderFemale: { en: "Female", id: "Perempuan", ja: "女性" },
    phone: { en: "Phone number", id: "Nomor telepon", ja: "電話番号" },
    address: { en: "Mailing address", id: "Alamat surat", ja: "住所" },
    visaExpiration: {
      en: "Residence card expiration",
      id: "Masa berlaku kartu izin tinggal",
      ja: "在留カード有効期限",
    },
    visaCategory: { en: "Visa category", id: "Kategori visa", ja: "ビザの種類" },
    photo: { en: "Photo", id: "Foto", ja: "写真" },
    photoNone: { en: "No photo", id: "Belum ada foto", ja: "写真なし" },
    photoUpload: { en: "Upload photo", id: "Unggah foto", ja: "写真をアップロード" },
    photoUploading: { en: "Uploading…", id: "Mengunggah…", ja: "アップロード中…" },
    photoInvalid: {
      en: "Please choose a JPEG or PNG image under 5 MB",
      id: "Pilih gambar JPEG atau PNG di bawah 5 MB",
      ja: "5MB以下のJPEGまたはPNG画像を選択してください",
    },
    photoUploadFail: {
      en: "Photo upload failed. Please try again.",
      id: "Unggah foto gagal. Silakan coba lagi.",
      ja: "写真のアップロードに失敗しました。もう一度お試しください。",
    },
    hobbies: { en: "Hobbies", id: "Hobi", ja: "趣味" },
    specialSkills: { en: "Special skills", id: "Keahlian khusus", ja: "特技" },
    personalRequests: {
      en: "Requests to employer",
      id: "Permintaan kepada perusahaan",
      ja: "本人希望記入欄",
    },
    personalRequestsHint: {
      en: "Leave as-is to use the standard phrase, or edit if you have a specific request.",
      id: "Biarkan apa adanya untuk frasa standar, atau ubah jika punya permintaan khusus.",
      ja: "標準の文言のままでも構いません。特に希望があれば編集してください。",
    },
```

- [ ] **Step 2: Extend the settings form state and schema**

In `frontend/app/dashboard/settings/page.tsx`, extend `profileFormSchema` to validate the new required-when-editing fields loosely (all optional at the schema level, since a user might only update one field at a time — same philosophy as the existing schema, which only validates `years_experience`):

No schema change needed beyond what exists — `years_experience` is the only field with real validation today, and the new fields (strings, a date, an enum) don't need client-side validation beyond what the browser's native `type="date"` input already provides. Leave `profileFormSchema` as-is.

Extend the `form` state's `useEffect` sync (around line 72-84) to include the new fields:

```typescript
  useEffect(() => {
    if (!me?.profile) return;
    const p = me.profile;
    setForm({
      full_name: me.user.full_name ?? undefined,
      nationality: p.nationality ?? undefined,
      japanese_level: p.japanese_level,
      visa_status: p.visa_status,
      preferred_language: p.preferred_language,
      years_experience: p.years_experience ?? undefined,
      target_role: p.target_role ?? [],
      target_industry: p.target_industry ?? [],
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
    });
  }, [me]);
```

`ProfileSection` needs access to `me.user.full_name` for the new `full_name` field — `useMe()` already returns the full `MeResponse`, so `me.user.full_name` is available without any hook change.

- [ ] **Step 3: Add imports**

At the top of `frontend/app/dashboard/settings/page.tsx`, add:

```typescript
import type { Gender } from "@/types/api";
import { PhotoUploader } from "@/components/profile/PhotoUploader";
```

- [ ] **Step 4: Add the new fields to the form JSX**

In `ProfileSection`, insert a new subsection right after the opening `<h2>` and before the existing `<Field label={t("settings", "nationality", lang)}>` block:

```tsx
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{t("settings", "rirekishoInfo", lang)}</h3>
          <p className="text-xs text-muted-foreground">
            {t("settings", "rirekishoInfoHint", lang)}
          </p>
        </div>

        <Field label={t("settings", "fullName", lang)}>
          <input
            type="text"
            value={form.full_name ?? ""}
            onChange={(e) => handleChange("full_name", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field label={t("settings", "nameKana", lang)}>
          <input
            type="text"
            value={form.name_kana ?? ""}
            onChange={(e) => handleChange("name_kana", e.target.value || undefined)}
            placeholder="ヤマダ タロウ"
            className={inputCls}
          />
        </Field>

        <Field label={t("settings", "dateOfBirth", lang)}>
          <input
            type="date"
            value={form.date_of_birth ?? ""}
            onChange={(e) => handleChange("date_of_birth", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field label={t("settings", "gender", lang)}>
          <select
            value={form.gender ?? "male"}
            onChange={(e) => handleChange("gender", e.target.value as Gender)}
            className={inputCls}
          >
            <option value="male">{t("settings", "genderMale", lang)}</option>
            <option value="female">{t("settings", "genderFemale", lang)}</option>
          </select>
        </Field>

        <Field label={t("settings", "phone", lang)}>
          <input
            type="tel"
            value={form.phone_number ?? ""}
            onChange={(e) => handleChange("phone_number", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field label={t("settings", "address", lang)}>
          <input
            type="text"
            value={form.mailing_address ?? ""}
            onChange={(e) => handleChange("mailing_address", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <Field label={t("settings", "visaExpiration", lang)}>
          <input
            type="date"
            value={form.residence_card_expiration ?? ""}
            onChange={(e) =>
              handleChange("residence_card_expiration", e.target.value || undefined)
            }
            className={inputCls}
          />
        </Field>

        {form.visa_status === "held" && (
          <Field label={t("settings", "visaCategory", lang)}>
            <input
              type="text"
              value={form.visa_category ?? ""}
              onChange={(e) => handleChange("visa_category", e.target.value || undefined)}
              className={inputCls}
            />
          </Field>
        )}

        <Field label={t("settings", "photo", lang)}>
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
```

`PhotoUploader` manages its own upload/save (it calls `useUploadPhoto` directly, which hits `POST /auth/me/photo` immediately on drop — not gated behind this form's "Save changes" button, since a photo upload is a distinct action from the rest of the profile fields).

- [ ] **Step 5: Type-check and lint**

Run: `cd frontend && npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Start the dev servers. Log in as a user who has **already completed onboarding**. Go to Settings, confirm the new "Rirekisho info" subsection appears with all fields pre-filled from the current profile, edit a field (e.g. mailing address), save, reload the page, and confirm the edit persisted. Upload a photo and confirm it appears immediately without needing to click "Save changes".

- [ ] **Step 7: Commit**

```bash
git add frontend/app/dashboard/settings/page.tsx frontend/lib/i18n.ts
git commit -m "Add Rirekisho Info section to Settings, closing the post-onboarding edit gap"
```

---

## Task 11: End-to-end verification

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && python -m pytest tests/unit -v`
Expected: all pass.

- [ ] **Step 2: Run ruff, mypy, and the frontend format/lint/type-check**

Run:
```bash
cd backend && ruff check app/ && mypy app/
cd ../frontend && npm run format:check && npm run lint && npm run type-check
```
Expected: no errors.

- [ ] **Step 3: Manual end-to-end pass**

Using the browser (dev servers running):
1. As an already-onboarded test user, go to Settings → Rirekisho info, fill in real name/furigana/DOB/phone/address/visa info, upload a photo, add hobbies and special skills, leave personal requests as the default. Save.
2. Go to Resumes, upload a resume that includes a job with a mid-tenure duty/role change at one employer (or use the same test resume from the earlier e2e pass).
3. Generate a 履歴書. Download the PDF and confirm: the photo appears in the photo box; 特技・趣味 shows the hobbies/skills entered; 本人希望記入欄 shows the boilerplate text; the work-history table shows a separate dated row for the mid-tenure duty change (not collapsed into one line).
4. Generate a 職務経歴書 for the same resume and confirm the company with the duty change shows two role-period blocks under one company header, not two separate companies.

- [ ] **Step 4: Report results**

If anything in Step 3 doesn't match expectations, note exactly what's wrong (which section, what's missing/incorrect) — this is the acceptance check for the whole plan, not just a smoke test.
