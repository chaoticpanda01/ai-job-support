"""Unit tests for pdf_generator. WeasyPrint and the filesystem are mocked."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from app.utils.pdf_generator import PDFGenerationError, html_to_pdf, verify_fonts

# ---------------------------------------------------------------------------
# html_to_pdf
# ---------------------------------------------------------------------------


def _fake_weasyprint_modules(html_cls: MagicMock, css_cls: MagicMock) -> dict[str, MagicMock]:
    """
    Build a fake weasyprint package tree for sys.modules.

    html_to_pdf() imports HTML/CSS/FontConfiguration *inside* the function
    body (deliberately, so test_html_to_pdf_raises_when_weasyprint_not_installed
    below can simulate a missing install via sys.modules). That means HTML/CSS
    are never real attributes of app.utils.pdf_generator to patch directly —
    patching them there raises AttributeError. Substituting the modules in
    sys.modules instead works regardless of whether the real weasyprint
    package (and its native Pango/GLib dependencies) can even import in the
    current environment.
    """
    fake_weasyprint = MagicMock()
    fake_weasyprint.HTML = html_cls
    fake_weasyprint.CSS = css_cls
    fake_fonts_module = MagicMock()
    fake_fonts_module.FontConfiguration = MagicMock()
    return {
        "weasyprint": fake_weasyprint,
        "weasyprint.text": MagicMock(),
        "weasyprint.text.fonts": fake_fonts_module,
    }


def test_html_to_pdf_returns_bytes() -> None:
    mock_html_cls = MagicMock()
    mock_html_instance = MagicMock()
    mock_html_instance.write_pdf.return_value = b"%PDF-fake"
    mock_html_cls.return_value = mock_html_instance

    mock_css_cls = MagicMock()
    fake_modules = _fake_weasyprint_modules(mock_html_cls, mock_css_cls)

    with patch.dict("sys.modules", fake_modules):
        result = html_to_pdf("<p>テスト</p>")

    assert result == b"%PDF-fake"
    mock_html_instance.write_pdf.assert_called_once()
    # font_config must be passed to write_pdf — without it WeasyPrint
    # silently ignores the bundled @font-face (see html_to_pdf's docstring).
    assert mock_html_instance.write_pdf.call_args.kwargs.get("font_config") is not None


def test_html_to_pdf_raises_on_weasyprint_error() -> None:
    mock_html_cls = MagicMock()
    mock_html_instance = MagicMock()
    mock_html_instance.write_pdf.side_effect = Exception("render error")
    mock_html_cls.return_value = mock_html_instance

    fake_modules = _fake_weasyprint_modules(mock_html_cls, MagicMock())

    with (
        patch.dict("sys.modules", fake_modules),
        pytest.raises(PDFGenerationError, match="PDF rendering failed"),
    ):
        html_to_pdf("<p>bad</p>")


def test_html_to_pdf_raises_when_weasyprint_not_installed() -> None:
    with (
        patch.dict("sys.modules", {"weasyprint": None}),
        pytest.raises(PDFGenerationError, match="weasyprint is not installed"),
    ):
        html_to_pdf("<p>test</p>")


def test_html_wraps_body_fragment() -> None:
    """Ensure the generated HTML contains the body content and lang=ja,
    and the generated CSS declares the bundled Noto Sans JP font with a
    font_config shared between CSS() and write_pdf()."""
    captured_html: list[str] = []
    captured_css: list[str] = []
    captured_css_kwargs: list[dict[str, object]] = []

    mock_html_cls = MagicMock()
    mock_instance = MagicMock()
    mock_instance.write_pdf.return_value = b"pdf"

    def capture_html(**kwargs: str) -> MagicMock:
        captured_html.append(kwargs.get("string", ""))
        return mock_instance

    mock_css_cls = MagicMock()

    def capture_css(**kwargs: object) -> MagicMock:
        captured_css.append(str(kwargs.get("string", "")))
        captured_css_kwargs.append(kwargs)
        return MagicMock()

    mock_html_cls.side_effect = capture_html
    mock_css_cls.side_effect = capture_css
    fake_modules = _fake_weasyprint_modules(mock_html_cls, mock_css_cls)

    with patch.dict("sys.modules", fake_modules):
        html_to_pdf("<p>履歴書</p>")

    assert captured_html, "HTML() was not called"
    html = captured_html[0]
    assert 'lang="ja"' in html
    assert "<p>履歴書</p>" in html

    assert captured_css, "CSS() was not called"
    assert "Noto Sans JP" in captured_css[0]
    assert "NotoSansJP-Regular.woff" in captured_css[0]
    assert "NotoSansJP-Bold.woff" in captured_css[0]
    # CSS() must receive the same font_config instance later passed to
    # write_pdf() — that's what makes the bundled @font-face register.
    assert captured_css_kwargs[0].get("font_config") is not None


# ---------------------------------------------------------------------------
# verify_fonts
# ---------------------------------------------------------------------------


def test_verify_fonts_returns_true_when_bundled_files_exist(tmp_path: Path) -> None:
    regular = tmp_path / "NotoSansJP-Regular.woff"
    bold = tmp_path / "NotoSansJP-Bold.woff"
    regular.touch()
    bold.touch()

    with (
        patch("app.utils.pdf_generator._FONT_REGULAR", regular),
        patch("app.utils.pdf_generator._FONT_BOLD", bold),
    ):
        assert verify_fonts() is True


def test_verify_fonts_returns_false_when_a_file_is_missing(tmp_path: Path) -> None:
    regular = tmp_path / "NotoSansJP-Regular.woff"
    bold = tmp_path / "NotoSansJP-Bold.woff"
    regular.touch()
    # bold is never created

    with (
        patch("app.utils.pdf_generator._FONT_REGULAR", regular),
        patch("app.utils.pdf_generator._FONT_BOLD", bold),
    ):
        assert verify_fonts() is False


def test_verify_fonts_returns_false_when_both_files_missing(tmp_path: Path) -> None:
    with (
        patch("app.utils.pdf_generator._FONT_REGULAR", tmp_path / "missing-regular.woff"),
        patch("app.utils.pdf_generator._FONT_BOLD", tmp_path / "missing-bold.woff"),
    ):
        assert verify_fonts() is False


def test_verify_fonts_returns_true_for_the_actual_bundled_files() -> None:
    """No mocking — the real bundled font files must actually be checked
    into the repo at the path pdf_generator.py expects."""
    assert verify_fonts() is True
