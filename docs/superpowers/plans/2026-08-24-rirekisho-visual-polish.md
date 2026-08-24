# Rirekisho Visual Polish + Photo Box Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the empty-photo placeholder overflow bug in generated 履歴書 PDFs and apply a shared navy-accent visual polish pass to both 履歴書 and 職務経歴書 PDF templates.

**Architecture:** Pure PDF-template change — no schema, API, or frontend changes. Three independent, additive edits: (1) redesign the no-photo placeholder box in `_render_rirekisho()` to fix overflow and look cleaner, (2) update the shared `_BASE_CSS` in `pdf_generator.py` with a navy accent palette used by both document renderers, (3) update both renderers' `<h1>` title styling to match. Each task is TDD'd against the existing string-based HTML-content tests in `test_document_generator.py` and CSS-capture tests in `test_pdf_generator.py`.

**Tech Stack:** Python, WeasyPrint 63 (pinned, inline SVG works with no new dependency), pytest.

---

### Task 1: Fix photo placeholder overflow bug + icon redesign

**Files:**
- Modify: `backend/app/services/document_generator.py:425-447` (the `photo_data_uri` if/else block inside `_render_rirekisho()`)
- Test: `backend/tests/unit/test_document_generator.py:239-250` (update 2 existing tests), plus 1 new test

**Context:** In `_render_rirekisho()`, when no photo has been uploaded, the box shows 5 lines of guide text (`写真をはる位置<br>1.縦36〜40mm<br>横24〜30mm<br>2.本人単身胸から上<br>3.裏面のりづけ`) inside a 30×40mm box with no `overflow:hidden`. At 8pt this doesn't fit vertically, so the text spills out and overlaps the adjacent table cells in the rendered PDF. Fix: add `overflow:hidden` (defensive) and replace the placeholder content with a short icon + one line of text, per the approved design.

- [ ] **Step 1: Update the two existing tests to match the new placeholder content**

Replace lines 239-250 in `backend/tests/unit/test_document_generator.py`:

```python
def test_render_rirekisho_shows_empty_photo_box_when_no_photo() -> None:
    html = _render_rirekisho(_rirekisho_render_content())
    assert "写真" in html
    assert "(縦40×横30mm)" in html
    assert "<img" not in html


def test_render_rirekisho_photo_placeholder_has_no_overflow() -> None:
    """
    Regression test for the overlap bug: the empty-photo placeholder box
    must clip its content, since the box is only 30x40mm and WeasyPrint
    does not clip overflowing content by default.
    """
    html = _render_rirekisho(_rirekisho_render_content())
    assert "overflow:hidden" in html


def test_render_rirekisho_shows_photo_when_present() -> None:
    content = _rirekisho_render_content()
    content["personal"]["photo_data_uri"] = "data:image/jpeg;base64,ZmFrZQ=="
    html = _render_rirekisho(content)
    assert '<img src="data:image/jpeg;base64,ZmFrZQ=="' in html
    assert "写真をはる位置" not in html
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/unit/test_document_generator.py -k "empty_photo_box or placeholder_has_no_overflow or shows_photo_when_present" -v`
Expected: `test_render_rirekisho_shows_empty_photo_box_when_no_photo` FAILs on `assert "写真" in html` finding the old text instead of the new short text not matching `(縦40×横30mm)`; `test_render_rirekisho_photo_placeholder_has_no_overflow` FAILs with `assert "overflow:hidden" in html` (not present in the placeholder branch yet); `test_render_rirekisho_shows_photo_when_present` still PASSes (unaffected by this task).

- [ ] **Step 3: Implement the fix**

Replace lines 425-447 in `backend/app/services/document_generator.py`:

```python
    photo_data_uri = p.get("photo_data_uri")
    if photo_data_uri:
        # WeasyPrint silently drops a percentage-sized <img> when its
        # container uses flexbox centering (align-items/justify-content) —
        # a known limitation with replaced elements in flex layouts. Use
        # plain block sizing here instead; flex centering is only safe for
        # the icon+text placeholder case below.
        photo_box_style = (
            "width:30mm; height:40mm; flex-shrink:0; border:1px solid #1e3a5f; "
            "overflow:hidden;"
        )
        photo_box_inner = (
            f'<img src="{_esc(photo_data_uri)}" '
            'style="width:100%; height:100%; object-fit:cover; display:block;" />'
        )
    else:
        photo_box_style = (
            "width:30mm; height:40mm; flex-shrink:0; border:1.5px dashed #1e3a5f; "
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/unit/test_document_generator.py -k "empty_photo_box or placeholder_has_no_overflow or shows_photo_when_present or with_photo_actually_embeds" -v`
Expected: PASS (4 tests) — the last one (`test_render_rirekisho_with_photo_actually_embeds_image_in_pdf`) is the existing WeasyPrint-flexbox regression test at line 253; it must still pass unchanged since the photo-present branch's structure (block sizing, no flex) wasn't touched, only its border color.

- [ ] **Step 5: Run the full document_generator test file to check for regressions**

Run: `cd backend && python -m pytest tests/unit/test_document_generator.py -v`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/document_generator.py backend/tests/unit/test_document_generator.py
git commit -m "Fix rirekisho photo placeholder overflow + redesign as icon"
```

---

### Task 2: Navy accent base CSS

**Files:**
- Modify: `backend/app/utils/pdf_generator.py:50-89` (the `_BASE_CSS` string)
- Test: `backend/tests/unit/test_pdf_generator.py` (new test, appended after `test_html_wraps_body_fragment`)

**Context:** `_BASE_CSS` is shared by both 履歴書 and 職務経歴書 via `html_to_pdf()`. Update table borders, header cells, section titles, and labels from flat gray to the navy accent palette approved in the design. Data cell (`td`) text color is intentionally left alone — only labels/headers/borders/dividers change.

- [ ] **Step 1: Write the failing test**

Insert after `test_html_wraps_body_fragment` (after line 124) in `backend/tests/unit/test_pdf_generator.py`:

```python
def test_base_css_uses_navy_accent_palette() -> None:
    """
    Regression test for the navy-accent visual polish pass: table borders,
    header cells, section titles, and labels use the shared accent color
    instead of the old flat grays. Applies to both rirekisho and shokumu
    since they share _BASE_CSS.
    """
    captured_css: list[str] = []

    mock_html_cls = MagicMock()
    mock_instance = MagicMock()
    mock_instance.write_pdf.return_value = b"pdf"
    mock_html_cls.return_value = mock_instance

    mock_css_cls = MagicMock()

    def capture_css(**kwargs: object) -> MagicMock:
        captured_css.append(str(kwargs.get("string", "")))
        return MagicMock()

    mock_css_cls.side_effect = capture_css
    fake_modules = _fake_weasyprint_modules(mock_html_cls, mock_css_cls)

    with patch.dict("sys.modules", fake_modules):
        html_to_pdf("<p>test</p>")

    css = captured_css[0]
    assert "#1e3a5f" in css  # header/section-title accent
    assert "#c8d4e0" in css  # table border tint
    assert "#eef3f8" in css  # header cell background tint
    assert "#5a7a9a" in css  # .label muted accent
    assert "#999" not in css
    assert "#f0f0f0" not in css
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/unit/test_pdf_generator.py -k navy_accent -v`
Expected: FAIL with `assert "#1e3a5f" in css` (none of the new colors exist yet)

- [ ] **Step 3: Implement the palette change**

Replace lines 50-89 in `backend/app/utils/pdf_generator.py`:

```python
_BASE_CSS = """\
* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}
body {
    font-family: 'Noto Sans JP', sans-serif;
    font-size: 10pt;
    line-height: 1.6;
    color: #1a1a1a;
}
@page {
    size: A4;
    margin: 15mm 18mm 15mm 18mm;
}
table {
    border-collapse: collapse;
    width: 100%;
}
th, td {
    border: 1px solid #c8d4e0;
    padding: 4px 6px;
    vertical-align: top;
}
th {
    background-color: #eef3f8;
    color: #1e3a5f;
    font-weight: 700;
    white-space: nowrap;
}
.section-title {
    font-size: 11pt;
    font-weight: 700;
    color: #1e3a5f;
    border-bottom: 2px solid #1e3a5f;
    margin: 12px 0 6px;
    padding-bottom: 2px;
}
.label {
    color: #5a7a9a;
    font-size: 9pt;
}
"""
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && python -m pytest tests/unit/test_pdf_generator.py -k navy_accent -v`
Expected: PASS

- [ ] **Step 5: Run the full pdf_generator test file to check for regressions**

Run: `cd backend && python -m pytest tests/unit/test_pdf_generator.py -v`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/utils/pdf_generator.py backend/tests/unit/test_pdf_generator.py
git commit -m "Apply navy accent color palette to shared PDF base CSS"
```

---

### Task 3: Navy accent document titles

**Files:**
- Modify: `backend/app/services/document_generator.py:451` (`_render_rirekisho()`'s `<h1>`) and `backend/app/services/document_generator.py:574` (`_render_shokumu()`'s `<h1>`)
- Test: `backend/tests/unit/test_document_generator.py` (2 new tests, appended after `test_render_rirekisho_contains_key_fields` and `test_render_shokumu_contains_key_fields` respectively)

**Context:** Both document titles are styled inline (not via `_BASE_CSS`, since their structure differs). Add the navy accent color to both, and change shokumu's title underline from black to navy for consistency with the rest of the palette change in Task 2.

- [ ] **Step 1: Write the failing tests**

Insert after `test_render_rirekisho_contains_key_fields` (after line 213) in `backend/tests/unit/test_document_generator.py`:

```python
def test_render_rirekisho_title_uses_navy_accent() -> None:
    html = _render_rirekisho(_rirekisho_render_content())
    assert '<h1 style="text-align:center; font-size:16pt; letter-spacing:0.3em; ' in html
    assert "color:#1e3a5f" in html
```

Insert after `test_render_shokumu_contains_key_fields` (after line 302, i.e. right after the block ending at line 301's `assert "職務経歴書" in html`) in the same file:

```python
def test_render_shokumu_title_uses_navy_accent() -> None:
    html = _render_shokumu(_shokumu_content())
    assert "border-bottom:3px solid #1e3a5f;" in html
    assert "color:#1e3a5f" in html
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/unit/test_document_generator.py -k "title_uses_navy_accent" -v`
Expected: FAIL — neither `<h1>` has `color:#1e3a5f` yet, and shokumu's `<h1>` still has `border-bottom:3px solid #333;`

- [ ] **Step 3: Implement the title style updates**

In `_render_rirekisho()`, replace the `<h1>` line at `backend/app/services/document_generator.py:451`:

```python
  <h1 style="text-align:center; font-size:16pt; letter-spacing:0.3em; margin-bottom:8px; color:#1e3a5f;">
```

In `_render_shokumu()`, replace the `<h1>` line at `backend/app/services/document_generator.py:574`:

```python
  <h1 style="font-size:15pt; border-bottom:3px solid #1e3a5f; padding-bottom:4px; margin-bottom:8px; color:#1e3a5f;">
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/unit/test_document_generator.py -k "title_uses_navy_accent" -v`
Expected: PASS

- [ ] **Step 5: Run the full document_generator test file to check for regressions**

Run: `cd backend && python -m pytest tests/unit/test_document_generator.py -v`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/document_generator.py backend/tests/unit/test_document_generator.py
git commit -m "Apply navy accent to rirekisho and shokumu document titles"
```

---

### Task 4: Full verification + visual check

**Files:** None modified — verification only.

- [ ] **Step 1: Run the full backend unit test suite**

Run: `cd backend && python -m pytest tests/unit -v`
Expected: all PASS, no regressions in any other test file

- [ ] **Step 2: Run ruff and mypy to confirm formatting/type-checking still pass**

Run: `cd backend && ruff check . && ruff format --check . && mypy app`
Expected: no errors

- [ ] **Step 3: Render a real sample PDF with no photo and inspect it**

```bash
cd backend && python -c "
from app.services.document_generator import _render_rirekisho
from app.utils.pdf_generator import html_to_pdf

content = {
    'personal': {
        'name_kana': 'ヤマダ タロウ', 'name_kanji': '山田 太郎', 'gender': '男性',
        'date_of_birth': '平成2年1月1日', 'age': 36, 'address': '東京都渋谷区1-2-3',
        'phone': '090-1234-5678', 'email': 'test@example.com',
        'hobbies': '', 'special_skills': '', 'personal_requests': '',
    },
    'visa_info': {'nationality': '日本', 'visa_category': None, 'residence_card_expiration': None},
    'education': [], 'work_history': [], 'qualifications': [],
    'self_pr': '', 'motivation': '',
}
html = _render_rirekisho(content)
pdf_bytes = html_to_pdf(html)
with open('/tmp/rirekisho-no-photo-check.pdf', 'wb') as f:
    f.write(pdf_bytes)
print('wrote', len(pdf_bytes), 'bytes')
"
```

Expected: script prints `wrote <N> bytes` with no exception. Then visually open `/tmp/rirekisho-no-photo-check.pdf` and confirm: the photo box shows a small camera icon + "写真 / (縦40×横30mm)" with a dashed navy border, does not overlap the DOB/visa cells, and the table borders/header cells/section titles use the navy accent instead of gray.

- [ ] **Step 4: Render a real sample shokumu PDF and inspect it**

```bash
cd backend && python -c "
from app.services.document_generator import _render_shokumu
from app.utils.pdf_generator import html_to_pdf

content = {
    'summary': 'テスト要約',
    'companies': [{'company_name': 'ABC株式会社', 'industry': 'IT', 'employee_count': '100名',
                   'roles': [{'role': 'エンジニア', 'period_start': '2020年4月', 'period_end': '現在',
                              'responsibilities': ['開発業務'], 'achievements': ['成果1']}]}],
    'skills': {'technical': ['Python'], 'languages': ['日本語'], 'other': []},
    'self_pr': '', 'motivation': '',
}
html = _render_shokumu(content)
pdf_bytes = html_to_pdf(html)
with open('/tmp/shokumu-check.pdf', 'wb') as f:
    f.write(pdf_bytes)
print('wrote', len(pdf_bytes), 'bytes')
"
```

Expected: script prints `wrote <N> bytes`. Visually confirm the navy accent palette applies (borders, header cells, section titles, title underline) with no layout regressions.

No commit for this task — it's verification only, not a code change.

---

## Future work (explicitly out of scope for this plan)

A landscape variant of 履歴書 was discussed and deliberately deferred — it needs its own brainstorming session before a plan is written. Do not build it as part of this plan.
