"""
WeasyPrint-based PDF generator with a bundled Japanese (CJK) font.

Takes an HTML string and returns PDF bytes. The Japanese font (Noto Sans JP)
ships as WOFF files inside this repo at app/assets/fonts/ and is loaded via
@font-face with a file:// path relative to this module — not a system font.

This is deliberate: production (Render) runs the API on Render's native
Python buildpack (see backend/render.yaml, `runtime: python`), which never
executes the Dockerfile's `apt-get install fonts-noto-cjk` step. A font
that depends on being installed at the OS level
is silently absent there — WeasyPrint doesn't error on a missing font, it
just falls back to a Latin-only font, so Japanese text renders blank while
everything else looks fine. Bundling the font as a repo asset and loading it
by an in-repo file path sidesteps the OS/runtime entirely: it works
identically under Docker, Render's native runtime, or local dev.

This module is synchronous — WeasyPrint is CPU-bound. Call it via
asyncio.to_thread (see app.services.document_generator) or another
thread-pool executor; never call it directly from an async route, or it
blocks the event loop for every other in-flight request.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
_FONT_REGULAR = _FONT_DIR / "NotoSansJP-Regular.woff"
_FONT_BOLD = _FONT_DIR / "NotoSansJP-Bold.woff"

_FONT_CSS_TEMPLATE = """\
@font-face {{
    font-family: 'Noto Sans JP';
    src: url('file://{regular}') format('woff');
    font-weight: 400;
    font-style: normal;
}}
@font-face {{
    font-family: 'Noto Sans JP';
    src: url('file://{bold}') format('woff');
    font-weight: 700;
    font-style: normal;
}}
"""

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
    size: __PAGE_SIZE__;
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


class PDFGenerationError(Exception):
    """Raised when WeasyPrint fails to render the document."""


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

    full_html = f"""<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><title>Document</title></head>
<body>{html_body}</body>
</html>"""

    # FontConfiguration is required for a local @font-face (file:// src) to
    # actually register — without it WeasyPrint silently ignores the custom
    # font and falls back to a Latin-only default, which is exactly the bug
    # this module exists to avoid. It must be the same instance passed to
    # both CSS() and write_pdf().
    font_config = FontConfiguration()

    try:
        pdf_bytes: bytes = HTML(string=full_html).write_pdf(
            stylesheets=[CSS(string=full_css, font_config=font_config)],
            font_config=font_config,
        )
    except Exception as exc:
        logger.error("WeasyPrint rendering failed: %s", exc)
        raise PDFGenerationError(f"PDF rendering failed: {exc}") from exc

    logger.debug("PDF generated: size=%d bytes", len(pdf_bytes))
    return pdf_bytes


def verify_fonts() -> bool:
    """
    Return True if the bundled Noto Sans JP font files are present on disk.
    Checked at app startup and surfaced on GET /health so a missing font
    (e.g. a packaging/deploy step that dropped non-.py files) fails loudly
    instead of silently producing PDFs with blank Japanese text.
    """
    missing = [str(p) for p in (_FONT_REGULAR, _FONT_BOLD) if not p.exists()]
    if missing:
        logger.warning("Missing bundled Noto Sans JP font file(s): %s", missing)
        return False
    return True
