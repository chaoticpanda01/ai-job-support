# Landscape Rirekisho Variant — Design

## Context

The rirekisho (履歴書) template currently renders only in portrait, matching
the standard JIS-style vertical form. This was deliberately deferred during
the 2026-08-24 visual-polish work (see
`docs/superpowers/specs/2026-08-24-rirekisho-visual-polish-design.md`).

This spec adds a second, authentic **横書き (yoko-gaki) landscape** layout as
a per-generation user choice, alongside the existing portrait template.
Shokumukeirekisho (職務経歴書) is unaffected — a landscape 職務経歴書 is not a
real-world convention and is out of scope.

## Goal

Let a user choose portrait or landscape when generating a rirekisho, and
render an authentic two-page landscape layout (personal info + education/work
history on page 1; qualifications, self-PR, motivation, and optional
commute-time/dependents info on page 2) using WeasyPrint, reusing the
existing AI-generated content pipeline unchanged.

## Data Model

### `generated_documents.orientation` (new column)

- New `DocumentOrientation(str, enum.Enum)` in `app/models/enums.py`
  (`portrait = "portrait"`, `landscape = "landscape"`), mapped via
  `sa_document_orientation = SAEnum(DocumentOrientation, name="document_orientation", **_kw)`
  — same pattern as the existing `DocumentType`/`DocumentStatus` enums in
  that file.
- Column: `NOT NULL DEFAULT 'portrait'`.
- Meaningful only for `document_type = rirekisho`; shokumu rows always carry
  the default and ignore it.
- Added via Alembic migration.

### `profiles.commute_time` / `profiles.dependents` (new columns)

- Both `TEXT`, nullable, no default.
- Free-text fields (e.g. `commute_time = "電車で約45分"`,
  `dependents = "2名"`) — deliberately not modeled as a fully structured
  legal form (real paper rirekisho sometimes also has 配偶者/配偶者の扶養義務
  yes/no boxes). Free text covers the box without added UI/schema
  complexity; this is a portfolio project, not a legally precise form
  generator.
- **Optional-field semantics:** no separate include/exclude flag. Settings
  presents each as a checkbox that reveals a text input when checked and
  clears the value when unchecked. At render time, a null/blank value means
  that row is **omitted entirely** from the landscape PDF — not rendered as
  an empty box.
- Not added to `rirekisho_missing_fields` — optional for every user
  regardless of orientation, same as `hobbies`/`special_skills` today.
- Added via the same migration as `orientation`.

## Rendering (`backend/app/utils/pdf_generator.py`, `backend/app/services/document_generator.py`)

### `html_to_pdf` gains a `landscape` parameter

```python
def html_to_pdf(html_body: str, *, landscape: bool = False) -> bytes:
```

`_BASE_CSS`'s `@page` rule becomes a format template:

```python
_BASE_CSS_TEMPLATE = """\
...
@page {{
    size: {page_size};
    margin: 15mm 18mm 15mm 18mm;
}}
...
"""
```

`html_to_pdf` formats `page_size="A4 landscape"` when `landscape=True`, else
`"A4"`. Shokumu and portrait rirekisho call sites are unaffected (default
`False`).

### Shared helpers extracted from `_render_rirekisho`

To avoid duplicating logic between `_render_rirekisho` (portrait) and the
new `_render_rirekisho_landscape`, extract as module-level helpers:

- `_entry_row(entry)` — formats one education/work-history row.
- A helper that builds the concatenated education/work rows + `学歴`/`職歴`
  header rows (currently inline in `_render_rirekisho`).
- The qualifications `<li>` list builder.
- The visa-line string builder.

Both renderers call these helpers; only the surrounding HTML/CSS layout
differs.

### `_render_rirekisho_landscape(c)` — new function

**Page 1** (same section content/order as portrait, just laid out for a wide
page):
- Personal-info table + photo box (reusing the existing table-based
  two-column layout fix from the photo-overlap bug — same underlying
  technique, sized for the wider page).
- 学歴・職歴 table: same structure as portrait (学歴 header + education rows,
  職歴 header + work rows) — **not** interleaved into one merged timeline.

Then a **hard page break** (`page-break-before: always` on the page-2
wrapper `<div>`), so the document is always exactly 2 pages regardless of
content length (unlike portrait, which flows naturally).

**Page 2**:
- 資格・免許 (qualifications)
- 特技・趣味 (hobbies/special skills)
- 自己PR (self-PR)
- 志望動機 (motivation)
- 通勤時間 (commute time) — row omitted entirely if `commute_time` is
  null/blank
- 扶養家族 (dependents) — row omitted entirely if `dependents` is
  null/blank
- 本人希望記入欄 (personal requests)

### Dispatch

`_render_html`/the render call site reads `doc.orientation` and calls
`_render_rirekisho` vs `_render_rirekisho_landscape` when
`document_type == rirekisho`; passes `landscape=True` to `html_to_pdf` in
the landscape case. Shokumu dispatch is unchanged.

## API

### `CreateRirekishoRequest` (`backend/app/schemas/document.py`)

New field:

```python
orientation: Literal["portrait", "landscape"] = "portrait"
```

`CreateShokumuRequest` is untouched.

### `POST /documents/rirekisho` (`backend/app/api/v1/documents.py`)

`create_rirekisho` passes `orientation=body.orientation` when constructing
the `GeneratedDocument` row.

### `DocumentDetailResponse` / `DocumentStatusResponse`

Both gain an `orientation` field, round-tripping the stored column back to
the client (useful if the frontend later wants to label a document
"Landscape" in the list; costs nothing to include now since it's a real
column).

## Frontend

- `DocumentWizard.tsx`: add a portrait/landscape radio choice, shown only on
  the rirekisho creation flow (`rirekisho/new/page.tsx`), defaulting to
  portrait. The shokumu wizard usage is unaffected.
- `useCreateDocument`/api-client request type gains `orientation`.
- Settings page (`#rirekisho-info` section): two new checkbox-gated optional
  fields, "通勤時間 (commute time)" and "扶養家族 (dependents)" — each a
  checkbox that reveals a text input when checked, clears the value when
  unchecked.
- New i18n keys for the wizard toggle and the two settings fields, following
  the existing `t("documents"/"settings", key, lang)` pattern.

## Testing

- **Migration**: Alembic revision adding `orientation` (enum, NOT NULL
  DEFAULT 'portrait') to `generated_documents`, and `commute_time`,
  `dependents` (nullable TEXT) to `profiles`.
- **Unit tests** (`backend/tests/unit/test_pdf_generator.py`,
  `test_document_generator.py`):
  - `html_to_pdf(html, landscape=True)` produces a PDF whose page MediaBox
    width exceeds its height (and portrait remains height > width) —
    verified via `pypdf`, matching the existing PDF-geometry-testing
    technique from the photo-box-overlap regression test.
  - `_render_rirekisho_landscape` produces exactly 2 pages.
  - The page break lands after 学歴・職歴 (page 1 content ends there, page 2
    starts with 資格・免許).
  - Commute-time/dependents rows are present when the field is set and
    absent entirely when blank — verified by asserting the label string's
    presence/absence in the rendered HTML before PDF conversion (cheaper
    than PDF-content-stream parsing for a presence/absence check).
  - Regression test reusing the existing photo-box/personal-info-table
    overlap detection technique, adapted for the landscape page-1 geometry,
    since it's a materially different layout from the portrait fix it was
    written for.
- **E2E test** (`backend/tests/integration/test_rirekisho_generation_e2e.py`):
  extend the existing `with_photo` parametrize with an `orientation` axis
  (or a second parametrize dimension), covering at least one landscape pass
  through the full create → poll → download flow. Per
  `docs/superpowers/plans/2026-08-25-rirekisho-e2e-testing.md`'s established
  constraints, this consumes the same real global AI-call budget as the
  existing E2E tests — same caveats apply (don't run it repeatedly in quick
  local succession).

## Out of scope

- Landscape shokumukeirekisho (not a real-world convention).
- Fully structured legal fields for dependents (配偶者, 配偶者の扶養義務
  yes/no boxes) — commute_time/dependents stay free text.
- True interleaved education/work-history timeline — landscape keeps the
  same 学歴-then-職歴 block structure as portrait.
- A separate include/exclude flag independent of field value — blank is the
  only "excluded" state.
