"""
WeasyPrint-based PDF generator with Noto Sans JP support.

Takes an HTML string and returns PDF bytes. All CJK characters are rendered
via Noto Sans JP, which the Dockerfile installs at /usr/share/fonts/noto.

The font path is read from settings.pdf_font_path so it can be overridden
in tests (point to a local font directory on the developer's machine).

This module is synchronous — WeasyPrint is CPU-bound. Call from a Celery
worker or a thread-pool executor; never call directly from an async route.
"""

from __future__ import annotations

import logging
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

# CSS injected into every document to load Noto Sans JP from the local
# filesystem. The @font-face src uses a file:// URI so WeasyPrint does not
# make network requests.
_FONT_CSS_TEMPLATE = """\
@font-face {{
    font-family: 'Noto Sans JP';
    src: url('file://{font_path}/NotoSansJP-Regular.otf') format('opentype');
    font-weight: 400;
    font-style: normal;
}}
@font-face {{
    font-family: 'Noto Sans JP';
    src: url('file://{font_path}/NotoSansJP-Bold.otf') format('opentype');
    font-weight: 700;
    font-style: normal;
}}
"""

# Base page styles shared by all document templates
_BASE_CSS = """\
* {{
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}}
body {{
    font-family: 'Noto Sans JP', sans-serif;
    font-size: 10pt;
    line-height: 1.6;
    color: #1a1a1a;
}}
@page {{
    size: A4;
    margin: 15mm 18mm 15mm 18mm;
}}
table {{
    border-collapse: collapse;
    width: 100%;
}}
th, td {{
    border: 1px solid #999;
    padding: 4px 6px;
    vertical-align: top;
}}
th {{
    background-color: #f0f0f0;
    font-weight: 700;
    white-space: nowrap;
}}
.section-title {{
    font-size: 11pt;
    font-weight: 700;
    border-bottom: 2px solid #333;
    margin: 12px 0 6px;
    padding-bottom: 2px;
}}
.label {{
    color: #555;
    font-size: 9pt;
}}
"""


class PDFGenerationError(Exception):
    """Raised when WeasyPrint fails to render the document."""


def html_to_pdf(html_body: str) -> bytes:
    """
    Render an HTML fragment to PDF bytes.

    html_body should be the <body> content only — this function wraps it
    in a complete HTML document with the correct font declarations and
    base styles injected.

    Raises PDFGenerationError on WeasyPrint failure.
    """
    try:
        from weasyprint import HTML, CSS  # type: ignore[import-untyped]
        from weasyprint.text.fonts import FontConfiguration  # type: ignore[import-untyped]
    except ImportError as exc:
        raise PDFGenerationError("weasyprint is not installed") from exc

    font_path = _resolve_font_path()
    font_css = _FONT_CSS_TEMPLATE.format(font_path=font_path)
    full_css = font_css + _BASE_CSS

    full_html = f"""<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><title>Document</title></head>
<body>{html_body}</body>
</html>"""

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
    Return True if the expected Noto Sans JP font files exist on disk.
    Called at startup (or in CI) to detect missing font installations early.
    """
    font_path = Path(_resolve_font_path())
    required = ["NotoSansJP-Regular.otf", "NotoSansJP-Bold.otf"]
    missing = [f for f in required if not (font_path / f).exists()]
    if missing:
        logger.warning("Missing Noto Sans JP fonts: %s in %s", missing, font_path)
        return False
    return True


def _resolve_font_path() -> str:
    """Return the font directory, falling back to a common system path."""
    configured = settings.pdf_font_path
    if Path(configured).exists():
        return configured
    # Common fallback for macOS development environments
    fallback = "/Library/Fonts"
    logger.debug("Font path %s not found, falling back to %s", configured, fallback)
    return fallback
