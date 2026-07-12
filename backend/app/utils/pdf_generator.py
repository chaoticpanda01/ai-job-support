"""
WeasyPrint-based PDF generator with Japanese (CJK) font support.

Takes an HTML string and returns PDF bytes. WeasyPrint renders text via
Pango, which resolves font families through the system's fontconfig
database — so any CJK-capable font already installed on the system (the
Dockerfile installs `fonts-noto-cjk` via apt) is picked up by family name
automatically. This deliberately avoids hardcoding a font file path/name via
@font-face: OS package managers change the exact install path and filenames
between versions, and a stale hardcoded path fails *silently* — WeasyPrint
just drops the unresolvable @font-face and falls back to a Latin-only font,
so Japanese text renders as blank while everything else looks fine. Letting
fontconfig resolve the family name is what the Dockerfile's own
`fc-list :lang=ja` build check already validates, so the app and the build
check are now looking at the same thing.

This module is synchronous — WeasyPrint is CPU-bound. Call from a Celery
worker or a thread-pool executor; never call directly from an async route.
"""

from __future__ import annotations

import logging
import subprocess

logger = logging.getLogger(__name__)

# Font stack: prefer whichever CJK-capable family fontconfig resolves first
# (Debian's fonts-noto-cjk package registers "Noto Sans CJK JP"), falling
# back to generic sans-serif for any environment that lacks CJK fonts —
# Latin text still renders there, only Japanese glyphs would be missing.
_BASE_CSS = """\
* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}
body {
    font-family: 'Noto Sans CJK JP', 'Noto Sans JP', 'Noto Sans', sans-serif;
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
    border: 1px solid #999;
    padding: 4px 6px;
    vertical-align: top;
}
th {
    background-color: #f0f0f0;
    font-weight: 700;
    white-space: nowrap;
}
.section-title {
    font-size: 11pt;
    font-weight: 700;
    border-bottom: 2px solid #333;
    margin: 12px 0 6px;
    padding-bottom: 2px;
}
.label {
    color: #555;
    font-size: 9pt;
}
"""


class PDFGenerationError(Exception):
    """Raised when WeasyPrint fails to render the document."""


def html_to_pdf(html_body: str) -> bytes:
    """
    Render an HTML fragment to PDF bytes.

    html_body should be the <body> content only — this function wraps it
    in a complete HTML document with the correct font-family and base
    styles injected.

    Raises PDFGenerationError on WeasyPrint failure.
    """
    try:
        from weasyprint import CSS, HTML  # type: ignore[import-untyped]
    except ImportError as exc:
        raise PDFGenerationError("weasyprint is not installed") from exc

    full_html = f"""<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><title>Document</title></head>
<body>{html_body}</body>
</html>"""

    try:
        pdf_bytes: bytes = HTML(string=full_html).write_pdf(
            stylesheets=[CSS(string=_BASE_CSS)],
        )
    except Exception as exc:
        logger.error("WeasyPrint rendering failed: %s", exc)
        raise PDFGenerationError(f"PDF rendering failed: {exc}") from exc

    logger.debug("PDF generated: size=%d bytes", len(pdf_bytes))
    return pdf_bytes


def verify_fonts() -> bool:
    """
    Return True if fontconfig can resolve a Japanese-capable font on this
    system. Checked at app startup and surfaced on GET /health so a missing
    or misconfigured CJK font fails loudly instead of silently producing
    PDFs with blank Japanese text (see html_to_pdf's font-family stack,
    which relies on fontconfig resolving one of these families).
    """
    try:
        result = subprocess.run(  # noqa: S603 — hardcoded, non-user-controlled command
            ["fc-list", ":lang=ja"],  # noqa: S607 — fc-list resolved via PATH is expected here
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        logger.warning("Could not run fc-list to verify Japanese font support: %s", exc)
        return False

    if result.returncode != 0 or not result.stdout.strip():
        logger.warning("No Japanese-capable font found via fontconfig (fc-list :lang=ja empty)")
        return False
    return True
