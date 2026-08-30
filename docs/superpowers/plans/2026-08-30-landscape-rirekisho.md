# Landscape Rirekisho Variant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user choose portrait or landscape when generating a rirekisho, rendering an authentic two-page 横書き (yoko-gaki) landscape layout via WeasyPrint, reusing the existing AI-generated content pipeline unchanged.

**Architecture:** Add a `DocumentOrientation` enum column to `generated_documents` and two optional free-text profile fields (`commute_time`, `dependents`). Extract the portrait rirekisho renderer's row-building helpers into shared functions, then add a new `_render_rirekisho_landscape` renderer that reuses them. Wire `orientation` through the API request → `GeneratedDocument` row → render dispatch → `html_to_pdf`'s new `landscape` flag. Frontend adds a per-generation orientation radio to the shared `DocumentWizard` and two checkbox-gated optional fields to Settings.

**Tech Stack:** FastAPI, SQLAlchemy async ORM, Alembic, WeasyPrint, pypdf (tests), Next.js/React, TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-30-landscape-rirekisho-design.md`

## Global Constraints

- Shokumukeirekisho is never affected — no orientation field on `CreateShokumuRequest`, shokumu rendering/dispatch unchanged.
- `commute_time`/`dependents` are optional for every user, on every orientation. Never added to `rirekisho_missing_fields()` / the required-field completeness check.
- Blank (`None` or `""`) means the commute-time/dependents row is **omitted entirely** from the landscape PDF — never rendered as an empty box. No separate include/exclude boolean columns.
- Education/work-history stays as two blocks (学歴 header + rows, then 職歴 header + rows) in landscape — never interleaved into one merged timeline.
- The landscape page break (between page 1 and page 2) is a hard CSS `page-break-before: always` — always exactly 2 pages, regardless of content length.
- All new backend enum/column names: `DocumentOrientation` (Python), `document_orientation` (Postgres type), `orientation` (column on `generated_documents`), `commute_time`/`dependents` (columns on `profiles`).

---

## Task 1: Backend data model — orientation enum + new profile fields

**Files:**
- Modify: `backend/app/models/enums.py`
- Modify: `backend/app/models/document.py`
- Modify: `backend/app/models/user.py`
- Modify: `backend/app/schemas/user.py`
- Create: `backend/migrations/versions/0007_add_rirekisho_landscape_orientation.py`
- Modify: `database/schema.sql`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/unit/test_document_generator.py` (sanity test only, no new test file)

**Interfaces:**
- Produces: `DocumentOrientation(str, enum.Enum)` with members `portrait`/`landscape`, `sa_document_orientation` SAEnum wrapper — both consumed by Task 3 (dispatch) and Task 4 (API schemas).
- Produces: `GeneratedDocument.orientation: Mapped[DocumentOrientation]` — consumed by Task 3/4.
- Produces: `Profile.commute_time: Mapped[str | None]`, `Profile.dependents: Mapped[str | None]` — consumed by Task 3 (`_build_rirekisho_personal`) and Task 7 (frontend Settings).

- [ ] **Step 1: Add the `DocumentOrientation` enum**

In `backend/app/models/enums.py`, add after the `DocumentStatus` class (around line 63):

```python
class DocumentOrientation(str, enum.Enum):
    portrait = "portrait"
    landscape = "landscape"
```

Then add the SAEnum wrapper next to `sa_document_status` (around line 162):

```python
sa_document_orientation = SAEnum(DocumentOrientation, name="document_orientation", **_kw)
```

- [ ] **Step 2: Add the `orientation` column to `GeneratedDocument`**

In `backend/app/models/document.py`, update the enums import (line 21-26):

```python
from app.models.enums import (
    DocumentOrientation,
    DocumentStatus,
    DocumentType,
    sa_document_orientation,
    sa_document_status,
    sa_document_type,
)
```

Add the column right after `status` (currently line 79-81):

```python
    status: Mapped[DocumentStatus] = mapped_column(
        sa_document_status, nullable=False, server_default=text("'pending'")
    )
    orientation: Mapped[DocumentOrientation] = mapped_column(
        sa_document_orientation, nullable=False, server_default=text("'portrait'")
    )
```

- [ ] **Step 3: Add `commute_time`/`dependents` to `Profile`**

In `backend/app/models/user.py`, find the "Phase 1 rirekisho completeness fields" block (around line 184-188):

```python
    # --- Phase 1 rirekisho completeness fields ---
    photo_storage_key: Mapped[str | None] = mapped_column(String(500))
    hobbies: Mapped[str | None] = mapped_column(Text)
    special_skills: Mapped[str | None] = mapped_column(Text)
    personal_requests: Mapped[str | None] = mapped_column(Text)
```

Add two more lines after `personal_requests`:

```python
    commute_time: Mapped[str | None] = mapped_column(Text)
    dependents: Mapped[str | None] = mapped_column(Text)
```

- [ ] **Step 4: Add the fields to `ProfileResponse`/`ProfileUpdateRequest`**

In `backend/app/schemas/user.py`, in `ProfileResponse` (after `personal_requests: str | None`, line 66):

```python
    personal_requests: str | None
    commute_time: str | None
    dependents: str | None
```

In `ProfileUpdateRequest` (after `personal_requests: str | None = None`, line 95):

```python
    personal_requests: str | None = None
    commute_time: str | None = None
    dependents: str | None = None
```

- [ ] **Step 5: Write the migration**

Create `backend/migrations/versions/0007_add_rirekisho_landscape_orientation.py`:

```python
"""add document_orientation enum + orientation column; add commute_time/dependents to profiles

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-30

Adds landscape rirekisho variant support: a new document_orientation enum
('portrait'/'landscape') + orientation column on generated_documents (NOT
NULL DEFAULT 'portrait', meaningful only for rirekisho), and two optional
free-text profile fields (commute_time, dependents) used only on the
landscape page 2 -- blank means the row is omitted from the rendered PDF
entirely. See design spec at
docs/superpowers/specs/2026-08-30-landscape-rirekisho-design.md.
"""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE document_orientation AS ENUM ('portrait', 'landscape');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE generated_documents
                ADD COLUMN orientation document_orientation NOT NULL DEFAULT 'portrait';
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN commute_time TEXT;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN dependents TEXT;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)


def downgrade() -> None:
    op.drop_column("profiles", "dependents")
    op.drop_column("profiles", "commute_time")
    op.drop_column("generated_documents", "orientation")
    op.execute("DROP TYPE document_orientation")
```

- [ ] **Step 6: Sync `database/schema.sql`**

`schema.sql` is documentation of the current schema (the baseline migration `0001_baseline.py` executes it directly; migrations 0002+ are incremental and don't re-read it), but it was never updated for migration `0006` — `photo_storage_key`, `hobbies`, `special_skills`, `personal_requests` are missing from the `profiles` table there. Fix that gap in the same edit as adding the new columns, so the file stays an accurate reference.

Add the new enum type next to the other `document_*` types (after line 37, `CREATE TYPE document_status ...`):

```sql
CREATE TYPE document_status     AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE document_orientation AS ENUM ('portrait', 'landscape');
```

Update the `profiles` table (lines 97-124) to add the missing 0006 columns and the two new ones — replace:

```sql
  residence_card_expiration DATE,
  visa_category         VARCHAR(255),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
```

with:

```sql
  residence_card_expiration DATE,
  visa_category         VARCHAR(255),
  photo_storage_key     VARCHAR(500),
  hobbies               TEXT,
  special_skills        TEXT,
  personal_requests     TEXT,
  commute_time          TEXT,
  dependents            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
```

Update the `generated_documents` table (lines 233-252) — replace:

```sql
  status          document_status NOT NULL DEFAULT 'pending',
  job_context     JSONB,
```

with:

```sql
  status          document_status NOT NULL DEFAULT 'pending',
  orientation     document_orientation NOT NULL DEFAULT 'portrait',
  job_context     JSONB,
```

- [ ] **Step 7: Update mock helpers so existing tests keep passing**

In `backend/tests/conftest.py`, in `make_profile()` (after `profile.personal_requests = None`, around line 95):

```python
    profile.personal_requests = None
    profile.commute_time = None
    profile.dependents = None
    return profile
```

In `backend/tests/unit/test_document_generator.py`, in `_mock_profile()` (after `p.personal_requests = None`, around line 89):

```python
    p.personal_requests = None
    p.commute_time = None
    p.dependents = None
    return p
```

Also in `backend/tests/unit/test_document_generator.py`, in `_mock_document()` (after `doc.job_context = job_context`, around line 44), set the new column so the mock reflects a real row's shape:

```python
    doc.job_context = job_context
    doc.orientation = DocumentOrientation.portrait
    return doc
```

This requires adding `DocumentOrientation` to the `app.models.enums` import at the top of the file (line 14):

```python
from app.models.enums import DocumentOrientation, DocumentStatus, DocumentType, Gender, VisaStatus
```

- [ ] **Step 8: Run the full backend test suite to confirm nothing broke**

Run: `cd backend && pytest -q`
Expected: all tests pass (same count as before this task, no new tests added yet — this step is pure regression verification for the schema/model change).

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/enums.py backend/app/models/document.py backend/app/models/user.py backend/app/schemas/user.py backend/migrations/versions/0007_add_rirekisho_landscape_orientation.py database/schema.sql backend/tests/conftest.py backend/tests/unit/test_document_generator.py
git commit -m "Add orientation enum/column and commute_time/dependents profile fields"
```

---

## Task 2: Extract shared rirekisho rendering helpers (pure refactor)

**Files:**
- Modify: `backend/app/services/document_generator.py`

**Interfaces:**
- Produces: `_entry_row(entry)`, `_education_work_rows(c)`, `_qualifications_list_items(c)`, `_visa_line(v)`, `_photo_box_html(photo_data_uri)` — module-level helper functions consumed by Task 3's `_render_rirekisho_landscape`.

This is a pure refactor: `_render_rirekisho`'s HTML output must be byte-for-byte identical before and after. There is no new test to write — the existing test suite (in particular every `test_render_rirekisho_*` test in `backend/tests/unit/test_document_generator.py`) is the safety net.

- [ ] **Step 1: Run the existing renderer tests as a baseline**

Run: `cd backend && pytest tests/unit/test_document_generator.py -k "render_rirekisho" -v`
Expected: all pass (this is the baseline you must not break).

- [ ] **Step 2: Move the `format_wareki_date` import to module level**

In `backend/app/services/document_generator.py`, `_render_rirekisho` currently has this inline import (line 403):

```python
    from app.utils.japanese_date import format_wareki_date
```

Delete that line, and add the import to the top-level imports instead (after `from app.repositories.user import ProfileRepository, UserRepository`, around line 43):

```python
from app.repositories.user import ProfileRepository, UserRepository
from app.services.ai.client import AIError, ai_client
from app.services.ai.response_parser import ResponseParseError, parse_response
from app.services.ai.usage_tracker import AIBudgetError, usage_tracker
from app.services.file_storage import StorageError, file_storage
from app.services.resume_parser import ParseError, extract_text
from app.services.rirekisho_completeness import rirekisho_missing_fields
from app.utils.japanese_date import format_wareki_date
from app.utils.pdf_generator import PDFGenerationError, html_to_pdf
```

- [ ] **Step 3: Extract the five shared helpers**

In `backend/app/services/document_generator.py`, replace the body of `_render_rirekisho` from its start through the `photo_box_inner` assembly (lines 399-450) with:

```python
def _entry_row(entry: dict[str, Any]) -> str:
    year, month = entry.get("year"), entry.get("month")
    date_cell = format_wareki_date(year, month) if year is not None and month is not None else ""
    return f"<tr><td>{date_cell}</td><td>{_esc(entry['entry'])}</td></tr>"


def _education_work_rows(c: dict[str, Any]) -> tuple[str, str]:
    education_rows = "".join(_entry_row(e) for e in c.get("education", []))
    work_rows = "".join(_entry_row(w) for w in c.get("work_history", []))
    return education_rows, work_rows


def _qualifications_list_items(c: dict[str, Any]) -> str:
    return "".join(f"<li>{_esc(q)}</li>" for q in c.get("qualifications", []))


def _visa_line(v: dict[str, Any]) -> str:
    visa_category = v.get("visa_category")
    if visa_category:
        return (
            f"{v.get('nationality', '')}（{visa_category}）"
            f"　有効期限：{v.get('residence_card_expiration', '')}"
        )
    return v.get("nationality", "")


def _photo_box_html(photo_data_uri: str | None) -> tuple[str, str]:
    """Returns (photo_box_style, photo_box_inner)."""
    if photo_data_uri:
        # WeasyPrint silently drops a percentage-sized <img> when its
        # container uses flexbox centering (align-items/justify-content) --
        # a known limitation with replaced elements in flex layouts. Use
        # plain block sizing here instead; flex centering is only safe for
        # the icon+text placeholder case below.
        photo_box_style = "width:30mm; height:40mm; border:1px solid #1e3a5f; overflow:hidden;"
        photo_box_inner = (
            f'<img src="{_esc(photo_data_uri)}" '
            'style="width:100%; height:100%; object-fit:cover; display:block;" />'
        )
    else:
        photo_box_style = (
            "width:30mm; height:40mm; border:1.5px dashed #1e3a5f; "
            "overflow:hidden; display:flex; flex-direction:column; align-items:center; "
            "justify-content:center; text-align:center; gap:2mm; color:#1e3a5f; padding:2px;"
        )
        photo_box_inner = (
            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" '
            'stroke="#1e3a5f" stroke-width="1.5">'
            '<rect x="3" y="6" width="18" height="14" rx="2"/>'
            '<circle cx="12" cy="13" r="3.5"/>'
            '<path d="M9 6l1-2h4l1 2"/></svg>'
            '<div style="font-size:7pt;">写真<br>(縦40×横30mm)</div>'
        )
    return photo_box_style, photo_box_inner


def _render_rirekisho(c: dict[str, Any]) -> str:
    p = c.get("personal", {})
    v = c.get("visa_info", {})

    education_rows, work_rows = _education_work_rows(c)
    qualifications = _qualifications_list_items(c)
    visa_line = _visa_line(v)
    photo_box_style, photo_box_inner = _photo_box_html(p.get("photo_data_uri"))
```

Everything from the `rirekisho_title_style = (...)` line onward (currently starting at line 452) stays exactly as-is — do not touch it.

- [ ] **Step 4: Re-run the same tests and confirm zero diff in behavior**

Run: `cd backend && pytest tests/unit/test_document_generator.py -k "render_rirekisho" -v`
Expected: same tests pass, same count as Step 1 — this refactor changed no observable behavior.

Run the full suite too: `cd backend && pytest -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/document_generator.py
git commit -m "Extract shared rirekisho row-building helpers from _render_rirekisho"
```

---

## Task 3: Landscape renderer + `html_to_pdf` landscape support + dispatch wiring

**Files:**
- Modify: `backend/app/utils/pdf_generator.py`
- Modify: `backend/app/services/ai/prompts/rirekisho.py`
- Modify: `backend/app/services/document_generator.py`
- Test: `backend/tests/unit/test_document_generator.py`

**Interfaces:**
- Consumes: `_entry_row`, `_education_work_rows`, `_qualifications_list_items`, `_visa_line`, `_photo_box_html` from Task 2. `DocumentOrientation` from Task 1.
- Produces: `html_to_pdf(html_body: str, *, landscape: bool = False) -> bytes` — consumed by `DocumentGenerator.generate()` in this task, and by Task 5's tests.
- Produces: `_render_rirekisho_landscape(c: dict[str, Any]) -> str` — consumed by `_render_html` dispatch in this task, and by Task 5's tests.
- Produces: `RirekishoPersonal.commute_time: str | None`, `RirekishoPersonal.dependents: str | None` — consumed by `_render_rirekisho_landscape` (via `content["personal"]`) and by Task 8's E2E test.

- [ ] **Step 1: Add the `landscape` parameter to `html_to_pdf`**

In `backend/app/utils/pdf_generator.py`, replace the `@page` rule inside `_BASE_CSS` (lines 62-65):

```python
@page {
    size: A4;
    margin: 15mm 18mm 15mm 18mm;
}
```

with a placeholder token (not a Python format placeholder — this string is not run through `.format()`, since CSS's own `{`/`}` braces would need escaping everywhere otherwise):

```python
@page {
    size: __PAGE_SIZE__;
    margin: 15mm 18mm 15mm 18mm;
}
```

Then update `html_to_pdf`'s signature and body (currently lines 100-117):

```python
def html_to_pdf(html_body: str, *, landscape: bool = False) -> bytes:
    """
    Render an HTML fragment to PDF bytes.

    html_body should be the <body> content only — this function wraps it
    in a complete HTML document with the bundled font and base styles
    injected. Pass landscape=True to render on an A4-landscape page
    instead of the default A4-portrait page.

    Raises PDFGenerationError on WeasyPrint failure.
    """
    try:
        from weasyprint import CSS, HTML  # type: ignore[import-untyped]
        from weasyprint.text.fonts import FontConfiguration  # type: ignore[import-untyped]
    except ImportError as exc:
        raise PDFGenerationError("weasyprint is not installed") from exc

    font_css = _FONT_CSS_TEMPLATE.format(regular=_FONT_REGULAR, bold=_FONT_BOLD)
    page_size = "A4 landscape" if landscape else "A4"
    full_css = font_css + _BASE_CSS.replace("__PAGE_SIZE__", page_size)
```

The rest of the function (`full_html = ...` onward) is unchanged.

- [ ] **Step 2: Write a failing test for the landscape page size**

Add to `backend/tests/unit/test_pdf_generator.py` (matching the existing captured-CSS-string test pattern in that file):

```python
def test_html_to_pdf_landscape_page_size_is_wider_than_tall() -> None:
    import io

    import pypdf

    pdf_bytes = html_to_pdf("<p>test</p>", landscape=True)
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    box = reader.pages[0].mediabox
    assert box.width > box.height


def test_html_to_pdf_portrait_page_size_is_taller_than_wide() -> None:
    import io

    import pypdf

    pdf_bytes = html_to_pdf("<p>test</p>")
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    box = reader.pages[0].mediabox
    assert box.height > box.width
```

Check the top of `backend/tests/unit/test_pdf_generator.py` for its existing import of `html_to_pdf` and add these two tests near the other `html_to_pdf`-calling tests (append at the end of the file if unsure of section boundaries).

- [ ] **Step 3: Run to verify the first test fails, second passes**

Run: `cd backend && pytest tests/unit/test_pdf_generator.py -k "landscape or portrait_page_size" -v`
Expected: `test_html_to_pdf_landscape_page_size_is_wider_than_tall` FAILS (before Step 1's fix it would pass trivially since `landscape` param doesn't exist yet — actually since Step 1 must run first, run this AFTER Step 1's implementation is in place, to confirm both pass. There is no red state to observe separately here since Step 1 and the test are both required for the feature; this step's real purpose is confirming the implementation is correct, not exercising red-green).

Run: `cd backend && pytest tests/unit/test_pdf_generator.py -k "landscape or portrait_page_size" -v`
Expected: both PASS.

- [ ] **Step 4: Add `commute_time`/`dependents` to `RirekishoPersonal`**

In `backend/app/services/ai/prompts/rirekisho.py`, update `RirekishoPersonal` (around line 58-72) — add two fields after `personal_requests`:

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
    commute_time: str | None = None
    dependents: str | None = None
```

- [ ] **Step 5: Wire `commute_time`/`dependents` into `_build_rirekisho_personal`**

In `backend/app/services/document_generator.py`, in `_build_rirekisho_personal` (around line 338-352), add the two new fields to the `RirekishoPersonal(...)` construction, matching the existing `hobbies`/`special_skills` pattern:

```python
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
            commute_time=profile.commute_time or None,
            dependents=profile.dependents or None,
        )
```

- [ ] **Step 6: Write the failing test for `_build_rirekisho_personal`**

Add to `backend/tests/unit/test_document_generator.py`, after `test_build_rirekisho_personal_uses_custom_personal_requests` (around line 526):

```python
def test_build_rirekisho_personal_includes_commute_time_and_dependents_when_set() -> None:
    from app.services.document_generator import _build_rirekisho_personal

    user = _mock_user()
    profile = _mock_profile()
    profile.commute_time = "電車で約45分"
    profile.dependents = "2名"

    personal = _build_rirekisho_personal(user, profile)
    assert personal["commute_time"] == "電車で約45分"
    assert personal["dependents"] == "2名"


def test_build_rirekisho_personal_omits_commute_time_and_dependents_when_blank() -> None:
    from app.services.document_generator import _build_rirekisho_personal

    user = _mock_user()
    profile = _mock_profile()
    profile.commute_time = None
    profile.dependents = None

    personal = _build_rirekisho_personal(user, profile)
    assert personal["commute_time"] is None
    assert personal["dependents"] is None
```

- [ ] **Step 7: Run to verify both pass**

Run: `cd backend && pytest tests/unit/test_document_generator.py -k "commute_time_and_dependents" -v`
Expected: both PASS (Steps 4-5 already implement the behavior — this confirms it).

- [ ] **Step 8: Write `_render_rirekisho_landscape`**

In `backend/app/services/document_generator.py`, add this new function immediately after `_render_rirekisho` (after its closing `"""` and before `def _render_shokumu`):

```python
def _render_rirekisho_landscape(c: dict[str, Any]) -> str:
    p = c.get("personal", {})
    v = c.get("visa_info", {})

    education_rows, work_rows = _education_work_rows(c)
    qualifications = _qualifications_list_items(c)
    visa_line = _visa_line(v)
    photo_box_style, photo_box_inner = _photo_box_html(p.get("photo_data_uri"))

    commute_time = p.get("commute_time")
    dependents = p.get("dependents")

    commute_row = (
        f'<p class="section-title">通勤時間</p>'
        f'<p style="padding:4px;">{_esc(commute_time)}</p>'
        if commute_time
        else ""
    )
    dependents_row = (
        f'<p class="section-title">扶養家族</p>'
        f'<p style="padding:4px;">{_esc(dependents)}</p>'
        if dependents
        else ""
    )

    rirekisho_title_style = (
        "text-align:center; font-size:16pt; letter-spacing:0.3em; margin-bottom:8px; color:#1e3a5f;"
    )

    return f"""
<div style="max-width:260mm; margin:0 auto;">
  <h1 style="{rirekisho_title_style}">
    履　歴　書
  </h1>

  <table style="margin-bottom:6px;">
    <tr>
      <td style="border:none; padding:0; vertical-align:top;">
        <table>
          <tr>
            <th style="width:10%;">ふりがな</th>
            <td style="width:28%;">{_esc(p.get("name_kana", ""))}</td>
            <th style="width:8%;">性別</th>
            <td style="width:20%;">{_esc(p.get("gender", ""))}</td>
            <th style="width:10%;">生年月日</th>
            <td style="width:24%;">{_esc(p.get("date_of_birth", ""))}（満{p.get("age", "")}歳）</td>
          </tr>
          <tr>
            <th>氏名</th>
            <td colspan="5" style="font-size:13pt; font-weight:bold;">{_esc(p.get("name_kanji", ""))}</td>
          </tr>
          <tr>
            <th>住所</th>
            <td colspan="5">{_esc(p.get("address", ""))}</td>
          </tr>
          <tr>
            <th>電話番号</th>
            <td>{_esc(p.get("phone", ""))}</td>
            <th>メール</th>
            <td colspan="3">{_esc(p.get("email", ""))}</td>
          </tr>
          <tr>
            <th>国籍・ビザ</th>
            <td colspan="5">{_esc(visa_line)}</td>
          </tr>
        </table>
      </td>
      <td style="border:none; padding:0 0 0 8px; width:30mm; vertical-align:top;">
        <div style="{photo_box_style}">
          {photo_box_inner}
        </div>
      </td>
    </tr>
  </table>

  <p class="section-title">学歴・職歴</p>
  <table>
    <thead>
      <tr><th style="width:15%;">年月</th><th>内容</th></tr>
    </thead>
    <tbody>
      <tr><td colspan="2" style="text-align:center; font-weight:bold;">学歴</td></tr>
      {education_rows}
      <tr><td colspan="2" style="text-align:center; font-weight:bold;">職歴</td></tr>
      {work_rows}
      <tr><td colspan="2" style="text-align:right;">以上</td></tr>
    </tbody>
  </table>
</div>

<div style="max-width:260mm; margin:0 auto; page-break-before:always;">
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

  {commute_row}
  {dependents_row}

  <p class="section-title">本人希望記入欄</p>
  <p style="white-space:pre-wrap; padding:4px;">{_esc(p.get("personal_requests", ""))}</p>
</div>
"""
```

- [ ] **Step 9: Wire orientation into `_render_html` and `generate()`**

In `backend/app/services/document_generator.py`, update the `app.models.enums` import at the top (currently `from app.models.enums import DocumentType, Gender, VisaStatus`, around line 40):

```python
from app.models.enums import DocumentOrientation, DocumentType, Gender, VisaStatus
```

Update `_render_html` (currently lines 393-396):

```python
def _render_html(
    document_type: DocumentType, content: dict[str, Any], orientation: DocumentOrientation
) -> str:
    if document_type == DocumentType.rirekisho:
        if orientation == DocumentOrientation.landscape:
            return _render_rirekisho_landscape(content)
        return _render_rirekisho(content)
    return _render_shokumu(content)
```

Update the two call sites in `generate()` (currently lines 173-181):

```python
        # -- Render HTML → PDF. Offloaded to a thread: WeasyPrint is
        # CPU-bound, and this method runs inline on the event loop as a
        # FastAPI background task — calling it directly here would stall
        # every other in-flight request for the duration of rendering.
        html = _render_html(doc.document_type, content, doc.orientation)
        try:
            pdf_bytes = await asyncio.to_thread(
                html_to_pdf, html, landscape=doc.orientation == DocumentOrientation.landscape
            )
        except PDFGenerationError as exc:
            raise DocumentGenerationError(f"PDF rendering failed: {exc}") from exc
```

- [ ] **Step 10: Update the `_render_html` dispatch test**

In `backend/tests/unit/test_document_generator.py`, find `test_render_html_dispatches_by_type` (around line 446) and update its calls to pass an orientation argument:

```python
def test_render_html_dispatches_by_type() -> None:
    html_r = _render_html(DocumentType.rirekisho, _rirekisho_render_content(), DocumentOrientation.portrait)
    assert "履　歴　書" in html_r
    html_s = _render_html(DocumentType.shokumukeirekisho, _shokumu_content(), DocumentOrientation.portrait)
    assert "職務経歴書" in html_s


def test_render_html_dispatches_rirekisho_landscape() -> None:
    html = _render_html(
        DocumentType.rirekisho, _rirekisho_render_content(), DocumentOrientation.landscape
    )
    assert "page-break-before:always" in html
```

Update the `app.services.document_generator` import list at the top of the file (currently lines 15-24) to include `_render_rirekisho_landscape` and `DocumentOrientation`:

```python
from app.models.enums import DocumentOrientation, DocumentStatus, DocumentType, Gender, VisaStatus
from app.services.document_generator import (
    DocumentGenerationError,
    DocumentGenerator,
    GeneratedDocumentOutput,
    _esc,
    _feature_name,
    _render_html,
    _render_rirekisho,
    _render_rirekisho_landscape,
    _render_shokumu,
)
```

- [ ] **Step 11: Run the full backend test suite**

Run: `cd backend && pytest -q`
Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add backend/app/utils/pdf_generator.py backend/app/services/ai/prompts/rirekisho.py backend/app/services/document_generator.py backend/tests/unit/test_pdf_generator.py backend/tests/unit/test_document_generator.py
git commit -m "Add landscape rirekisho renderer and wire orientation through the pipeline"
```

---

## Task 4: API layer — orientation on the create request + responses

**Files:**
- Modify: `backend/app/schemas/document.py`
- Modify: `backend/app/api/v1/documents.py`
- Test: `backend/tests/unit/test_document_schemas.py`
- Test: `backend/tests/unit/test_document_routes.py`

**Interfaces:**
- Consumes: `DocumentOrientation` from Task 1.
- Produces: `CreateRirekishoRequest.orientation: Literal["portrait", "landscape"]` — consumed by Task 6 (frontend request body) and Task 8 (E2E test).
- Produces: `DocumentResponse.orientation`, `DocumentDetailResponse.orientation`, `DocumentStatusResponse.orientation` — consumed by Task 6 (frontend response types).

- [ ] **Step 1: Add `orientation` to `CreateRirekishoRequest` and the response schemas**

In `backend/app/schemas/document.py`, update the import (line 11):

```python
from app.models.enums import DocumentOrientation, DocumentStatus, DocumentType
```

Update `DocumentResponse` (add after `status: DocumentStatus`, around line 28):

```python
class DocumentResponse(_Base):
    id: UUID
    user_id: UUID
    resume_id: UUID | None
    document_type: DocumentType
    status: DocumentStatus
    orientation: DocumentOrientation
    job_context: dict[str, Any] | None
```

Update `CreateRirekishoRequest` (currently lines 56-59):

```python
class CreateRirekishoRequest(_Base):
    resume_id: UUID
    # Optional job posting context — if provided, tailors the document to the role
    job_posting_id: UUID | None = None
    orientation: DocumentOrientation = DocumentOrientation.portrait
```

Update `DocumentStatusResponse` (currently lines 72-76):

```python
class DocumentStatusResponse(_Base):
    id: UUID
    status: DocumentStatus
    orientation: DocumentOrientation
    error_message: str | None
    completed_at: datetime | None
```

`DocumentDetailResponse` extends `DocumentResponse` and needs no separate change — it inherits `orientation`.

- [ ] **Step 2: Wire `orientation` through the routes**

In `backend/app/api/v1/documents.py`, update `create_rirekisho` (currently lines 80-90) to pass the request's orientation through to the new row:

```python
    doc = GeneratedDocument(
        id=uuid4(),
        user_id=current_user.user_id,
        resume_id=body.resume_id,
        document_type=DocumentType.rirekisho,
        status=DocumentStatus.pending,
        orientation=body.orientation,
        job_context=job_context,
    )
    db.add(doc)
    await db.flush()
    await db.commit()

    background_tasks.add_task(_run_generation, doc.id, current_user.user_id)

    logger.info("Enqueued rirekisho: document_id=%s user_id=%s", doc.id, current_user.user_id)
    return DocumentStatusResponse(
        id=doc.id,
        status=doc.status,
        orientation=doc.orientation,
        error_message=doc.error_message,
        completed_at=doc.completed_at,
    )
```

Update `create_shokumu`'s return statement (currently lines 141-146) — shokumu has no orientation choice, so it always returns the row's default:

```python
    return DocumentStatusResponse(
        id=doc.id,
        status=doc.status,
        orientation=doc.orientation,
        error_message=doc.error_message,
        completed_at=doc.completed_at,
    )
```

Update `get_document_status`'s return statement (currently lines 194-199):

```python
    return DocumentStatusResponse(
        id=doc.id,
        status=doc.status,
        orientation=doc.orientation,
        error_message=doc.error_message,
        completed_at=doc.completed_at,
    )
```

Update `download_document`'s `DocumentDetailResponse(...)` construction (currently lines 227-242) — add `orientation=doc.orientation` after `status=doc.status`:

```python
    return DocumentDetailResponse(
        id=doc.id,
        user_id=doc.user_id,
        resume_id=doc.resume_id,
        document_type=doc.document_type,
        status=doc.status,
        orientation=doc.orientation,
        job_context=doc.job_context,
        ai_model=doc.ai_model,
        input_tokens=doc.input_tokens,
        output_tokens=doc.output_tokens,
        error_message=doc.error_message,
        completed_at=doc.completed_at,
        created_at=doc.created_at,
        content=doc.content,
        download_url=download_url,
    )
```

- [ ] **Step 3: Fix existing schema tests broken by the new required field**

In `backend/tests/unit/test_document_schemas.py`, update the import (line 9):

```python
from app.models.enums import DocumentOrientation, DocumentStatus, DocumentType
```

Update `_doc_data()` (currently lines 20-36) to include the new field:

```python
def _doc_data(**overrides: object) -> dict:
    base: dict = {
        "id": uuid.uuid4(),
        "user_id": uuid.uuid4(),
        "resume_id": None,
        "document_type": DocumentType.rirekisho,
        "status": DocumentStatus.pending,
        "orientation": DocumentOrientation.portrait,
        "job_context": None,
        "ai_model": None,
        "input_tokens": None,
        "output_tokens": None,
        "error_message": None,
        "completed_at": None,
        "created_at": datetime.now(tz=UTC),
    }
    base.update(overrides)
    return base
```

Update the two direct `DocumentStatusResponse(...)` constructions (currently lines 114-120 and 124-130):

```python
def test_document_status_response_pending() -> None:
    resp = DocumentStatusResponse(
        id=uuid.uuid4(),
        status=DocumentStatus.pending,
        orientation=DocumentOrientation.portrait,
        error_message=None,
        completed_at=None,
    )
    assert resp.status == DocumentStatus.pending


def test_document_status_response_failed_has_error() -> None:
    resp = DocumentStatusResponse(
        id=uuid.uuid4(),
        status=DocumentStatus.failed,
        orientation=DocumentOrientation.portrait,
        error_message="AI budget exceeded",
        completed_at=datetime.now(tz=UTC),
    )
    assert resp.error_message == "AI budget exceeded"
```

- [ ] **Step 4: Fix the route test's mock document helper**

In `backend/tests/unit/test_document_routes.py`, update the import (line 22):

```python
from app.models.enums import DocumentOrientation, DocumentStatus, DocumentType
```

Update `_mock_document()` (currently lines 71-93) to set the new attribute:

```python
def _mock_document(
    *,
    document_type: DocumentType = DocumentType.rirekisho,
    status: DocumentStatus = DocumentStatus.completed,
    user_id: uuid.UUID | None = None,
    file_url: str | None = "documents/user123/abc.pdf",
) -> MagicMock:
    doc = MagicMock()
    doc.id = uuid.uuid4()
    doc.user_id = user_id or uuid.uuid4()
    doc.resume_id = uuid.uuid4()
    doc.document_type = document_type
    doc.status = status
    doc.orientation = DocumentOrientation.portrait
    doc.job_context = None
    doc.ai_model = "gemini-2.5-flash"
    doc.input_tokens = 100
    doc.output_tokens = 200
    doc.error_message = None
    doc.completed_at = datetime.now(tz=UTC)
    doc.created_at = datetime.now(tz=UTC)
    doc.content = {"summary": "test"}
    doc.file_url = file_url
    return doc
```

- [ ] **Step 5: Write a test proving the request field actually reaches the row**

Add to `backend/tests/unit/test_document_routes.py`, right after `test_create_rirekisho_with_job_posting_id` (currently ending at line 138) and before the `POST /documents/shokumu` section comment:

```python
@pytest.mark.asyncio
async def test_create_rirekisho_defaults_to_portrait_orientation() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        _fake_db_session(),
        patch("app.workers.document_tasks._run_generation", new=AsyncMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/documents/rirekisho",
                headers=_auth_headers(),
                json={"resume_id": str(uuid.uuid4())},
            )

    assert resp.status_code == 202
    assert resp.json()["orientation"] == "portrait"


@pytest.mark.asyncio
async def test_create_rirekisho_accepts_landscape_orientation() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        _fake_db_session(),
        patch("app.workers.document_tasks._run_generation", new=AsyncMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/documents/rirekisho",
                headers=_auth_headers(),
                json={"resume_id": str(uuid.uuid4()), "orientation": "landscape"},
            )

    assert resp.status_code == 202
    assert resp.json()["orientation"] == "landscape"
```

- [ ] **Step 6: Run the full backend test suite**

Run: `cd backend && pytest -q`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/document.py backend/app/api/v1/documents.py backend/tests/unit/test_document_schemas.py backend/tests/unit/test_document_routes.py
git commit -m "Add orientation to the rirekisho create request and document responses"
```

---

## Task 5: Backend unit tests — landscape rendering correctness

**Files:**
- Test: `backend/tests/unit/test_document_generator.py`

**Interfaces:**
- Consumes: `_render_rirekisho_landscape`, `_rirekisho_render_content()` from Tasks 2-3.

- [ ] **Step 1: Write the page-break-location test**

Add to `backend/tests/unit/test_document_generator.py`, in the HTML renderers section (after the existing `_render_rirekisho` tests, before `test_render_shokumu_contains_key_fields`):

```python
# ---------------------------------------------------------------------------
# _render_rirekisho_landscape
# ---------------------------------------------------------------------------


def test_render_rirekisho_landscape_contains_key_fields() -> None:
    html = _render_rirekisho_landscape(_rirekisho_render_content())
    assert "履　歴　書" in html
    assert "山田 太郎" in html
    assert "○○大学 卒業" in html
    assert "株式会社ABC 入社" in html
    assert "日本語能力試験N3" in html


def test_render_rirekisho_landscape_page_break_lands_after_education_work_history() -> None:
    """
    Regression guard for the hard page-break requirement: 学歴・職歴 content
    must appear before the page-break marker, and page-2-only sections
    (資格・免許 onward) must appear after it.
    """
    html = _render_rirekisho_landscape(_rirekisho_render_content())
    break_index = html.index("page-break-before:always")
    education_index = html.index("学歴・職歴")
    qualifications_index = html.index("資格・免許")
    assert education_index < break_index < qualifications_index


def test_render_rirekisho_landscape_shows_commute_time_and_dependents_when_set() -> None:
    content = _rirekisho_render_content()
    content["personal"]["commute_time"] = "電車で約45分"
    content["personal"]["dependents"] = "2名"
    html = _render_rirekisho_landscape(content)
    assert "通勤時間" in html
    assert "電車で約45分" in html
    assert "扶養家族" in html
    assert "2名" in html


def test_render_rirekisho_landscape_omits_commute_time_and_dependents_when_blank() -> None:
    html = _render_rirekisho_landscape(_rirekisho_render_content())
    assert "通勤時間" not in html
    assert "扶養家族" not in html
```

- [ ] **Step 2: Run to verify these pass**

Run: `cd backend && pytest tests/unit/test_document_generator.py -k "landscape" -v`
Expected: all pass.

- [ ] **Step 3: Write the PDF-level page-count test**

Add immediately after the tests from Step 1:

```python
def test_render_rirekisho_landscape_pdf_has_exactly_two_pages() -> None:
    import io

    import pypdf
    from app.utils.pdf_generator import html_to_pdf

    html = _render_rirekisho_landscape(_rirekisho_render_content())
    pdf_bytes = html_to_pdf(html, landscape=True)
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    assert len(reader.pages) == 2
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && pytest tests/unit/test_document_generator.py -k "exactly_two_pages" -v`
Expected: PASS.

- [ ] **Step 5: Write the landscape photo-box/table overlap regression test**

This reuses the same PDF-content-stream-parsing technique as `test_render_rirekisho_photo_box_does_not_overlap_personal_info_table` (Task's sibling test for the portrait renderer) since the landscape template is a materially different layout (wider table, six-column personal-info row) built by hand in Task 3 — the same class of bug (a wide element pushing past the fixed-position photo box) is worth guarding against here independently. Add after the tests from Step 3:

```python
def test_render_rirekisho_landscape_photo_box_does_not_overlap_personal_info_table() -> None:
    """
    Same regression class as
    test_render_rirekisho_photo_box_does_not_overlap_personal_info_table,
    applied to the landscape layout's own (differently-sized) personal-info
    table. See that test's docstring for why border-stroke lines are used
    instead of filled rects, and why the 0.75 content-stream scale factor
    matters for the pt-to-mm conversion.
    """
    import io
    import re

    import pypdf
    from app.utils.pdf_generator import html_to_pdf

    content = _rirekisho_render_content()
    content["personal"]["photo_data_uri"] = (
        "data:image/jpeg;base64,"
        "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
    )
    html = _render_rirekisho_landscape(content)
    pdf_bytes = html_to_pdf(html, landscape=True)

    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    contents = reader.pages[0].get_contents()
    assert contents is not None, "rendered PDF page has no content stream"
    raw = contents.get_data().decode("latin-1")

    scale = 0.75
    pt_to_mm = 25.4 / 72

    rects = [
        (
            float(x) * scale * pt_to_mm,
            float(y) * scale * pt_to_mm,
            float(w) * scale * pt_to_mm,
            float(h) * scale * pt_to_mm,
        )
        for x, y, w, h in re.findall(r"([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re", raw)
    ]
    photo_box_candidates = [(x, y, w, h) for x, y, w, h in rects if 28 <= w <= 32 and 38 <= h <= 42]
    assert photo_box_candidates, "could not locate the photo box's rect in the PDF"
    photo_box_left_edge = min(x for x, _y, _w, _h in photo_box_candidates)
    photo_box_top = min(y for _x, y, _w, _h in photo_box_candidates)
    photo_box_bottom = max(y + h for _x, y, _w, h in photo_box_candidates)

    line_pairs = re.findall(r"([\d.]+) ([\d.]+) m\s*\n([\d.]+) ([\d.]+) l", raw)
    vertical_borders_mm = [
        (
            float(x1) * scale * pt_to_mm,
            min(float(y1), float(y2)) * scale * pt_to_mm,
            max(float(y1), float(y2)) * scale * pt_to_mm,
        )
        for x1, y1, x2, y2 in line_pairs
        if abs(float(x1) - float(x2)) < 0.01
    ]
    assert vertical_borders_mm, "no vertical border lines found -- pdf_generator's output changed"

    def vertically_overlaps_photo_box(y_top: float, y_bottom: float) -> bool:
        return y_top < photo_box_bottom and y_bottom > photo_box_top

    borders_in_band = [
        x
        for x, y_top, y_bottom in vertical_borders_mm
        if vertically_overlaps_photo_box(y_top, y_bottom)
    ]
    assert borders_in_band, "no personal-info table border lines found to compare against"
    max_table_border_x = max(borders_in_band)
    assert max_table_border_x <= photo_box_left_edge + 1, (
        f"personal-info table's rightmost border reaches {max_table_border_x:.1f}mm, "
        f"past the photo box's left edge at {photo_box_left_edge:.1f}mm -- the table "
        "is overlapping the photo box"
    )
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd backend && pytest tests/unit/test_document_generator.py -k "landscape_photo_box" -v`
Expected: PASS. If it fails, check the landscape table's column widths in Task 3 Step 8 sum to well under 100% with the 30mm photo column — the six-column row (`10%+28%+8%+20%+10%+24% = 100%` for the first row) must leave room; verify against the actual rendered geometry rather than guessing.

- [ ] **Step 7: Run the full backend test suite**

Run: `cd backend && pytest -q`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add backend/tests/unit/test_document_generator.py
git commit -m "Add unit tests for the landscape rirekisho renderer"
```

---

## Task 6: Frontend — orientation choice in the document wizard

**Files:**
- Modify: `frontend/types/api.ts`
- Modify: `frontend/components/documents/DocumentWizard.tsx`
- Modify: `frontend/app/dashboard/documents/rirekisho/new/page.tsx`
- Modify: `frontend/lib/i18n.ts`

**Interfaces:**
- Consumes: `CreateRirekishoRequest.orientation`, `DocumentResponse.orientation` (backend, Task 4).
- Produces: `DocumentWizard`'s `showOrientation?: boolean` prop and 3-arg `onSubmit` signature — used only by the rirekisho page in this task; the shokumu page is untouched and keeps its existing 2-arg `handleSubmit`.

- [ ] **Step 1: Add orientation to the frontend API types**

In `frontend/types/api.ts`, add a type alias near `DocumentType` (currently line 153):

```typescript
export type DocumentType = "rirekisho" | "shokumukeirekisho";
export type DocumentOrientation = "portrait" | "landscape";
export type DocumentStatus = "pending" | "processing" | "completed" | "failed";
```

Update `DocumentStatusResponse` (currently lines 156-161):

```typescript
export interface DocumentStatusResponse {
  id: string;
  status: DocumentStatus;
  orientation: DocumentOrientation;
  error_message: string | null;
  completed_at: string | null;
}
```

Update `Document` (currently lines 163-176):

```typescript
export interface Document {
  id: string;
  user_id: string;
  resume_id: string | null;
  document_type: DocumentType;
  status: DocumentStatus;
  orientation: DocumentOrientation;
  job_context: Record<string, unknown> | null;
  ai_model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  error_message: string | null;
  completed_at: string | null;
  created_at: string;
}
```

Update `CreateDocumentRequest` (currently lines 188-191):

```typescript
export interface CreateDocumentRequest {
  resume_id: string;
  job_posting_id?: string;
  orientation?: DocumentOrientation;
}
```

- [ ] **Step 2: Add the orientation radio to `DocumentWizard`**

In `frontend/components/documents/DocumentWizard.tsx`, update the type import (currently line 7):

```typescript
import type { DocumentOrientation, ResumeList } from "@/types/api";
```

Update the `Props` interface (currently lines 13-21):

```typescript
interface Props {
  resumeList: ResumeList | undefined;
  resumesLoading: boolean;
  initialJobPostingId?: string;
  isPending: boolean;
  error: string | null;
  submitLabel: string;
  showOrientation?: boolean;
  onSubmit: (
    resumeId: string,
    jobPostingId?: string,
    orientation?: DocumentOrientation,
  ) => Promise<void>;
}
```

Update the component signature and add orientation state (currently lines 23-35):

```typescript
export function DocumentWizard({
  resumeList,
  resumesLoading,
  initialJobPostingId,
  isPending,
  error,
  submitLabel,
  showOrientation = false,
  onSubmit,
}: Props) {
  const [step, setStep] = useState<Step>("resume");
  const [resumeId, setResumeId] = useState<string>("");
  const [jobPostingId, setJobPostingId] = useState<string>(initialJobPostingId ?? "");
  const [orientation, setOrientation] = useState<DocumentOrientation>("portrait");
  const { lang } = useLang();
```

In the Step 2 block, add the orientation radio group right after the `jobIdInvalid` paragraph and before the `<div className="flex justify-between">` buttons row (currently around line 126-128):

```tsx
        {jobIdInvalid && (
          <p className="text-xs text-destructive">{t("documents", "wizJobIdInvalid", lang)}</p>
        )}

        {showOrientation && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("documents", "wizOrientationLabel", lang)}</p>
            <div className="flex gap-3">
              <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border bg-card p-3 text-sm has-[:checked]:border-primary">
                <input
                  type="radio"
                  name="orientation"
                  value="portrait"
                  checked={orientation === "portrait"}
                  onChange={() => setOrientation("portrait")}
                  className="accent-primary"
                />
                {t("documents", "wizOrientationPortrait", lang)}
              </label>
              <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border bg-card p-3 text-sm has-[:checked]:border-primary">
                <input
                  type="radio"
                  name="orientation"
                  value="landscape"
                  checked={orientation === "landscape"}
                  onChange={() => setOrientation("landscape")}
                  className="accent-primary"
                />
                {t("documents", "wizOrientationLandscape", lang)}
              </label>
            </div>
          </div>
        )}

        <div className="flex justify-between">
```

In the Step 3 confirm block, add a summary row after the `wizJobLabel` `Row` (currently around lines 159-163):

```tsx
        <Row
          label={t("documents", "wizJobLabel", lang)}
          value={jobPostingId || t("documents", "wizNoJobContext", lang)}
        />
        {showOrientation && (
          <Row
            label={t("documents", "wizOrientationLabel", lang)}
            value={
              orientation === "landscape"
                ? t("documents", "wizOrientationLandscape", lang)
                : t("documents", "wizOrientationPortrait", lang)
            }
          />
        )}
      </div>
```

Update the submit button's `onClick` (currently line 180):

```tsx
        <button
          onClick={() =>
            onSubmit(resumeId, jobPostingId || undefined, showOrientation ? orientation : undefined)
          }
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
```

- [ ] **Step 3: Wire it into the rirekisho creation page**

In `frontend/app/dashboard/documents/rirekisho/new/page.tsx`, add a type import (after the existing `import { ApiClientError } from "@/lib/api-client";`, currently line 12):

```typescript
import { ApiClientError } from "@/lib/api-client";
import type { DocumentOrientation } from "@/types/api";
```

Update `handleSubmit` (currently lines 31-37):

```typescript
  async function handleSubmit(
    resumeId: string,
    jobPostingId?: string,
    orientation?: DocumentOrientation,
  ) {
    const result = await createMutation.mutateAsync({
      resume_id: resumeId,
      ...(jobPostingId ? { job_posting_id: jobPostingId } : {}),
      ...(orientation ? { orientation } : {}),
    });
    router.push(`/dashboard/documents/${result.id}`);
  }
```

Update the `<DocumentWizard>` usage (currently lines 101-115) to add `showOrientation`:

```tsx
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
          showOrientation
          onSubmit={handleSubmit}
        />
```

`frontend/app/dashboard/documents/shokumu/new/page.tsx` needs NO changes — its existing 2-parameter `handleSubmit(resumeId, jobPostingId?)` is still a valid value for the widened 3-parameter `onSubmit` prop type (TypeScript allows assigning a function with fewer parameters to a callback type expecting more), and `showOrientation` simply defaults to `false` there.

- [ ] **Step 4: Add the i18n keys**

In `frontend/lib/i18n.ts`, inside the `documents` section, add these three keys after `wizJobIdInvalid` (currently ending around line 958) and before `wizStep3Title`:

```typescript
    wizOrientationLabel: {
      en: "Layout",
      id: "Tata letak",
      ja: "レイアウト",
    },
    wizOrientationPortrait: { en: "Portrait", id: "Potret", ja: "縦書き" },
    wizOrientationLandscape: { en: "Landscape", id: "Lanskap", ja: "横書き" },
```

- [ ] **Step 5: Start the dev server and verify manually**

Use the Browser pane to preview the frontend dev server, navigate to the rirekisho generation wizard, advance to Step 2, and confirm the portrait/landscape radio appears and is reflected in the Step 3 confirmation summary. Then navigate to the shokumu generation wizard and confirm no orientation control appears there.

- [ ] **Step 6: Commit**

```bash
git add frontend/types/api.ts frontend/components/documents/DocumentWizard.tsx frontend/app/dashboard/documents/rirekisho/new/page.tsx frontend/lib/i18n.ts
git commit -m "Add landscape/portrait orientation choice to the rirekisho generation wizard"
```

---

## Task 7: Frontend — commute-time/dependents optional fields in Settings

**Files:**
- Modify: `frontend/types/api.ts`
- Modify: `frontend/app/dashboard/settings/page.tsx`
- Modify: `frontend/lib/i18n.ts`

**Interfaces:**
- Consumes: `ProfileResponse.commute_time`/`dependents`, `ProfileUpdateRequest.commute_time`/`dependents` (backend, Task 1).
- Produces: `OptionalField` component, local to `settings/page.tsx` — not consumed elsewhere.

- [ ] **Step 1: Add the fields to the frontend `Profile`/`ProfileUpdateRequest` types**

In `frontend/types/api.ts`, update `Profile` (add after `personal_requests: string | null;`, currently line 35):

```typescript
  personal_requests: string | null;
  commute_time: string | null;
  dependents: string | null;
```

Update `ProfileUpdateRequest` (add after `personal_requests?: string;`, currently line 89):

```typescript
  personal_requests?: string;
  commute_time?: string;
  dependents?: string;
```

- [ ] **Step 2: Add the `OptionalField` component**

In `frontend/app/dashboard/settings/page.tsx`, add this new component right before the existing `Field` function (currently at line 786):

```tsx
/**
 * A checkbox-gated optional text field: unchecked hides the input and
 * clears its value (an explicit empty string, not undefined — so the
 * clear round-trips through ProfileUpdateRequest's `exclude_none`
 * serialization on save, unlike a field left `undefined`, which is
 * dropped from the update payload and would silently fail to clear a
 * previously-saved value).
 */
function OptionalField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const [revealed, setRevealed] = useState(Boolean(value));
  const id = useId();

  useEffect(() => {
    setRevealed(Boolean(value));
  }, [value]);

  function handleToggle(next: boolean) {
    setRevealed(next);
    if (!next) onChange("");
  }

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={revealed}
          onChange={(e) => handleToggle(e.target.checked)}
          className="accent-primary"
        />
        {label}
      </label>
      {revealed && (
        <input
          id={id}
          type="text"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire the two fields into `RirekishoInfoSection`**

In `frontend/app/dashboard/settings/page.tsx`, update the `next` object inside `RirekishoInfoSection`'s `useEffect` (currently lines 263-275):

```typescript
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
      commute_time: p.commute_time ?? undefined,
      dependents: p.dependents ?? undefined,
      personal_requests: p.personal_requests ?? "貴社の規定に従います。",
    };
```

Add the two `OptionalField`s in the JSX, right after the `specialSkills` `Field` and before `personalRequests` (currently lines 451-459):

```tsx
        <Field label={t("settings", "specialSkills", lang)}>
          <input
            type="text"
            value={form.special_skills ?? ""}
            onChange={(e) => handleChange("special_skills", e.target.value || undefined)}
            className={inputCls}
          />
        </Field>

        <OptionalField
          label={t("settings", "commuteTime", lang)}
          value={form.commute_time}
          onChange={(v) => handleChange("commute_time", v)}
        />

        <OptionalField
          label={t("settings", "dependents", lang)}
          value={form.dependents}
          onChange={(v) => handleChange("dependents", v)}
        />

        <Field
          label={t("settings", "personalRequests", lang)}
          hint={t("settings", "personalRequestsHint", lang)}
        >
```

- [ ] **Step 4: Add the i18n keys**

In `frontend/lib/i18n.ts`, inside the `settings` section, add these two keys after `specialSkills` (currently line 1118) and before `personalRequests`:

```typescript
    commuteTime: { en: "Commute time", id: "Waktu perjalanan", ja: "通勤時間" },
    dependents: {
      en: "Dependents",
      id: "Tanggungan",
      ja: "扶養家族",
    },
```

- [ ] **Step 5: Verify manually in the browser**

Use the Browser pane to preview the frontend dev server, navigate to Settings, scroll to the rirekisho info section, and confirm: both new checkboxes start unchecked (assuming a fresh account with no prior values), checking one reveals a text input, typing and saving persists the value, and unchecking then saving clears it (reload the page after unchecking+saving to confirm the checkbox stays unchecked — this proves the clear round-tripped through the backend, not just the local component state).

- [ ] **Step 6: Commit**

```bash
git add frontend/types/api.ts frontend/app/dashboard/settings/page.tsx frontend/lib/i18n.ts
git commit -m "Add optional commute-time/dependents fields to rirekisho settings"
```

---

## Task 8: E2E test — landscape generation end-to-end

**Files:**
- Modify: `backend/tests/integration/test_rirekisho_generation_e2e.py`

**Interfaces:**
- Consumes: `CreateRirekishoRequest.orientation` (Task 4), `GeneratedDocument.orientation` (Task 1), `_render_rirekisho_landscape` (Task 3, exercised indirectly through the real generation pipeline).

This test consumes the app's real, shared, unmocked global AI-call budget (see the module docstring's NOTE and `[[project_demo_scope_and_security]]`-equivalent context: `AI_GLOBAL_CALL_LIMIT` in `app/services/ai/usage_tracker.py`). The existing 2-case parametrize already spends 2 of that budget per full local run; this task adds exactly ONE more case (photo+landscape combined) rather than a full cross product, to keep the added cost to 1 additional real generation, not 2.

- [ ] **Step 1: Extend `_create_and_await_completion` to accept an orientation**

In `backend/tests/integration/test_rirekisho_generation_e2e.py`, update the helper (currently lines 192-225):

```python
async def _create_and_await_completion(
    client: AsyncClient, resume_id: uuid.UUID, *, orientation: str = "portrait"
) -> str:
    """
    POSTs to create a rirekisho, polls until it completes (or the poll bound
    is exhausted), and confirms the download endpoint reports it ready.
    Returns the document_id. BackgroundTasks execute synchronously as part
    of the same ASGI call when driven through ASGITransport, so the very
    first poll already reflects the final status in practice -- the bound
    is defensive, not a real eventual-consistency wait.
    """
    create_resp = await client.post(
        "/api/v1/documents/rirekisho",
        headers=_auth_headers(),
        json={"resume_id": str(resume_id), "orientation": orientation},
    )
    assert create_resp.status_code == 202
    document_id: str = create_resp.json()["id"]

    status = create_resp.json()["status"]
    for _ in range(_MAX_POLL_ATTEMPTS):
        if status == DocumentStatus.completed.value:
            break
        poll_resp = await client.get(f"/api/v1/documents/{document_id}", headers=_auth_headers())
        status = poll_resp.json()["status"]
    assert status == DocumentStatus.completed.value, (
        f"generation did not complete, final status={status!r}"
    )

    download_resp = await client.get(
        f"/api/v1/documents/{document_id}/download", headers=_auth_headers()
    )
    assert download_resp.status_code == 200
    assert download_resp.json()["download_url"] is not None

    return document_id
```

- [ ] **Step 2: Add the orientation axis to the parametrize and assertions**

Replace the test function (currently lines 228-259):

```python
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "with_photo, orientation",
    [(False, "portrait"), (True, "portrait"), (True, "landscape")],
    ids=["without_photo_portrait", "with_photo_portrait", "with_photo_landscape"],
)
async def test_generate_rirekisho_end_to_end(with_photo: bool, orientation: str) -> None:
    user, resume, photo_key = await _seed_complete_profile_user(with_photo=with_photo)
    try:
        with (
            _bypass_middleware(user),
            patch.object(ai_client, "generate", new=_mock_ai_generate()),
            patch.object(file_storage, "download", new=_mock_file_storage_download(photo_key)),
            patch("app.services.document_generator.extract_text", return_value="resume text"),
            patch.object(file_storage, "upload_document") as mock_upload,
        ):
            mock_upload.return_value = "documents/e2e-test/rirekisho/fake.pdf"

            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                document_id = await _create_and_await_completion(
                    client, resume.id, orientation=orientation
                )

        document_row = await _fetch_document_row(uuid.UUID(document_id))
        assert document_row is not None
        assert document_row.status == DocumentStatus.completed
        assert document_row.file_url is not None
        assert document_row.orientation.value == orientation

        assert mock_upload.called
        pdf_bytes = mock_upload.call_args.kwargs["file_bytes"]
        assert pdf_bytes.startswith(b"%PDF-")
        contains_image = b"/Subtype /Image" in pdf_bytes or b"/Subtype/Image" in pdf_bytes
        assert contains_image == with_photo

        if orientation == "landscape":
            import io

            import pypdf

            reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
            assert len(reader.pages) == 2
    finally:
        await _cleanup_user(user.id)
```

- [ ] **Step 3: Do NOT run this test repeatedly against the local dev database**

Per the project's established constraint, this test consumes the real global AI-call budget. Run it via `pytest --collect-only` to confirm it collects 3 parametrized cases with the expected IDs, and verify the code compiles/imports cleanly with `python -c "import ast; ast.parse(open('tests/integration/test_rirekisho_generation_e2e.py').read())"` from `backend/`. Do not execute the test itself locally more than once. The definitive verification is CI, which provisions a fresh, empty Postgres container per run.

Run: `cd backend && pytest tests/integration/test_rirekisho_generation_e2e.py --collect-only -q`
Expected: 3 tests collected, IDs `without_photo_portrait`, `with_photo_portrait`, `with_photo_landscape`.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/integration/test_rirekisho_generation_e2e.py
git commit -m "Add landscape orientation case to the rirekisho generation E2E test"
```

- [ ] **Step 5: Push and let CI verify the full suite including this E2E test**

This is the first real execution of the new landscape E2E case (local execution was deliberately skipped in Step 3). Push this branch and monitor CI to confirm the full suite — including all three E2E parametrize cases — passes against CI's fresh database.
