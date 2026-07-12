"""Unit tests for pdf_generator. WeasyPrint and subprocess are mocked."""

from __future__ import annotations

import subprocess
from unittest.mock import MagicMock, patch

import pytest
from app.utils.pdf_generator import PDFGenerationError, html_to_pdf, verify_fonts

# ---------------------------------------------------------------------------
# html_to_pdf
# ---------------------------------------------------------------------------


def _fake_weasyprint_modules(html_cls: MagicMock, css_cls: MagicMock) -> dict[str, MagicMock]:
    """
    Build a fake weasyprint package tree for sys.modules.

    html_to_pdf() imports HTML/CSS *inside* the function body (deliberately,
    so test_html_to_pdf_raises_when_weasyprint_not_installed below can
    simulate a missing install via sys.modules). That means HTML/CSS are
    never real attributes of app.utils.pdf_generator to patch directly —
    patching them there raises AttributeError. Substituting the module in
    sys.modules instead works regardless of whether the real weasyprint
    package (and its native Pango/GLib dependencies) can even import in the
    current environment.
    """
    fake_weasyprint = MagicMock()
    fake_weasyprint.HTML = html_cls
    fake_weasyprint.CSS = css_cls
    return {"weasyprint": fake_weasyprint}


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
    and the generated CSS declares a CJK-capable font family."""
    captured_html: list[str] = []
    captured_css: list[str] = []

    mock_html_cls = MagicMock()
    mock_instance = MagicMock()
    mock_instance.write_pdf.return_value = b"pdf"

    def capture_html(**kwargs: str) -> MagicMock:
        captured_html.append(kwargs.get("string", ""))
        return mock_instance

    mock_css_cls = MagicMock()

    def capture_css(**kwargs: str) -> MagicMock:
        captured_css.append(kwargs.get("string", ""))
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
    assert "Noto Sans CJK JP" in captured_css[0]


# ---------------------------------------------------------------------------
# verify_fonts
# ---------------------------------------------------------------------------


def test_verify_fonts_returns_true_when_fc_list_finds_a_font() -> None:
    fake_stdout = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc\n"
    fake_result = MagicMock(returncode=0, stdout=fake_stdout)
    with patch("subprocess.run", return_value=fake_result) as mock_run:
        assert verify_fonts() is True
    mock_run.assert_called_once_with(
        ["fc-list", ":lang=ja"], capture_output=True, text=True, timeout=5, check=False
    )


def test_verify_fonts_returns_false_when_fc_list_output_empty() -> None:
    fake_result = MagicMock(returncode=0, stdout="")
    with patch("subprocess.run", return_value=fake_result):
        assert verify_fonts() is False


def test_verify_fonts_returns_false_on_nonzero_exit() -> None:
    fake_result = MagicMock(returncode=1, stdout="")
    with patch("subprocess.run", return_value=fake_result):
        assert verify_fonts() is False


def test_verify_fonts_returns_false_when_fc_list_not_installed() -> None:
    with patch("subprocess.run", side_effect=FileNotFoundError("fc-list not found")):
        assert verify_fonts() is False


def test_verify_fonts_returns_false_on_timeout() -> None:
    with patch("subprocess.run", side_effect=subprocess.TimeoutExpired(cmd="fc-list", timeout=5)):
        assert verify_fonts() is False
