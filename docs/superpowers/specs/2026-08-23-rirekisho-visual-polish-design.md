# Rirekisho Visual Polish + Photo Box Fix — Design

## Context

A real generated 履歴書 (rirekisho) PDF sample surfaced two problems:

1. **Rendering bug:** when no photo has been uploaded, the placeholder box in the personal-info header shows 5 lines of guide text (`写真をはる位置 / 1.縦36〜40mm / 横24〜30mm / 2.本人単身胸から上 / 3.裏面のりづけ`) inside a fixed 30×40mm box with no `overflow:hidden`. At 8pt the text doesn't fit vertically, so it spills out of the box and visually overlaps the adjacent 生年月日 / 国籍・ビザ table cells — this is the "photo is in the way" problem.
2. **Visual style:** the document overall reads as a plain grayscale HTML table (border `#999`, header background `#f0f0f0`, section-title underline `#333`) — functional but visually flat for what should look like a professional, polished document.

Both 履歴書 and 職務経歴書 (shokumu) are rendered via the same WeasyPrint pipeline and share `_BASE_CSS` in `backend/app/utils/pdf_generator.py`, so the style changes below apply to both documents for visual consistency.

## Scope

**In scope:**
- Fix the photo-placeholder overflow bug
- Redesign the empty-photo placeholder box (icon + short label, replacing the dense guide text)
- Apply a navy-accent color palette to shared base styles (both rirekisho and shokumu)
- Update both documents' `<h1>` title styling to match the new palette

**Out of scope (explicit future work, not built in this pass):**
- A landscape variant of 履歴書. Standard 履歴書 forms in Japan (JIS-style, リクナビ, マイナビ) are portrait — this is the near-universal convention Japanese HR reviewers expect, and a landscape rirekisho would read as breaking format rather than as a modern alternative. A landscape *shokumukeirekisho* was considered and explicitly rejected as unusual/unheard of. If a landscape rirekisho variant is wanted later, it needs its own brainstorming session — this spec keeps the current work strictly portrait.
- Any change to the API, database schema, or frontend (this is a PDF-template-only change; no `Document` fields or endpoints are touched).

## Design

### 1. Photo placeholder box (fixes both the bug and the "too simple" complaint)

Located in `backend/app/services/document_generator.py`, `_render_rirekisho()`, the `else` branch (no `photo_data_uri`) around line 439.

Replace the current dense-text placeholder with:
- `overflow:hidden` added to the box style (defensive — matches the photo-uploaded case, and the shorter content below should not need it in practice)
- `1.5px dashed #1e3a5f` border instead of `1px solid #333`
- A small inline SVG camera-outline icon (WeasyPrint 63, the pinned version, renders inline SVG without any new dependency)
- One short line of text: `写真` on its own line, then `(縦40×横30mm)` below it, both in `#1e3a5f`, `font-size:7pt`

This intentionally drops the posture (`本人単身胸から上`) and adhesive (`裏面のりづけ`) instructions that were in the original guide text, in exchange for a clean, uncluttered box — confirmed acceptable.

New style/markup for the no-photo branch:

```python
photo_box_style = (
    "width:30mm; height:40mm; flex-shrink:0; border:1.5px dashed #1e3a5f; "
    "overflow:hidden; display:flex; flex-direction:column; align-items:center; "
    "justify-content:center; text-align:center; gap:2mm; color:#1e3a5f; padding:2px;"
)
photo_box_inner = (
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" stroke-width="1.5">'
    '<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/>'
    '<path d="M9 6l1-2h4l1 2"/></svg>'
    '<div style="font-size:7pt;">写真<br>(縦40×横30mm)</div>'
)
```

The photo-uploaded branch (`if photo_data_uri:`) keeps its existing `overflow:hidden` and `object-fit:cover` behavior, but its border color updates from `#333` to `#1e3a5f` for palette consistency:

```python
photo_box_style = (
    "width:30mm; height:40mm; flex-shrink:0; border:1px solid #1e3a5f; overflow:hidden;"
)
```

### 2. Shared navy-accent palette (`_BASE_CSS` in `backend/app/utils/pdf_generator.py`)

Applies to both 履歴書 and 職務経歴書 since they share this stylesheet.

| Element | Current | New |
|---|---|---|
| `th, td` border | `1px solid #999` | `1px solid #c8d4e0` |
| `th` background | `#f0f0f0` | `#eef3f8` |
| `th` text color | (inherits body `#1a1a1a`) | `#1e3a5f` |
| `.section-title` border-bottom | `2px solid #333` | `2px solid #1e3a5f` |
| `.section-title` text color | (inherits body `#1a1a1a`) | `#1e3a5f` |
| `.label` text color | `#555` | `#5a7a9a` |

Data cell (`td`) text color is intentionally left unchanged (`#1a1a1a`, inherited from `body`) — only labels, headers, borders, and section dividers pick up the accent. This keeps the result restrained ("polished," not "colorful"), matching the approved mockup.

### 3. Document title styling

Both renderers' `<h1>` are inline-styled per document in `document_generator.py` (not in `_BASE_CSS`, since they differ in structure between the two documents):

- `_render_rirekisho()`: add `color:#1e3a5f;` to the existing `<h1>` inline style (`text-align:center; font-size:16pt; letter-spacing:0.3em; margin-bottom:8px;`)
- `_render_shokumu()`: change the `<h1>` inline style's `border-bottom:3px solid #333;` to `border-bottom:3px solid #1e3a5f;` and add `color:#1e3a5f;`

## Testing

No new unit-testable logic is introduced (this is pure CSS/markup string construction inside functions already covered by `backend/tests/unit/test_document_routes.py` and the rirekisho rendering path exercised in existing tests). Verification is visual:
1. Regenerate a sample rirekisho PDF with a real profile that has **no** uploaded photo — confirm the placeholder box no longer overlaps adjacent cells and shows the icon + short label.
2. Regenerate a sample rirekisho PDF **with** an uploaded photo — confirm the photo still renders correctly with the updated navy border.
3. Regenerate a sample shokumu PDF — confirm the navy accent palette applies (borders, header cells, section titles, title underline) without layout regressions.

## Files touched

- `backend/app/utils/pdf_generator.py` — `_BASE_CSS` color updates
- `backend/app/services/document_generator.py` — `_render_rirekisho()` photo box (both branches) + `<h1>` style; `_render_shokumu()` `<h1>` style

No schema, API, or frontend changes.
