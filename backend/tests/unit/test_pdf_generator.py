"""Unit tests for pdf_generator. WeasyPrint and filesystem are mocked."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from app.utils.pdf_generator import PDFGenerationError, html_to_pdf, verify_fonts

# ---------------------------------------------------------------------------
# html_to_pdf
# ---------------------------------------------------------------------------


def test_html_to_pdf_returns_bytes() -> None:
    mock_html_cls = MagicMock()
    mock_html_instance = MagicMock()
    mock_html_instance.write_pdf.return_value = b"%PDF-fake"
    mock_html_cls.return_value = mock_html_instance

    mock_css_cls = MagicMock()
    mock_font_config = MagicMock()

    with (
        patch("app.utils.pdf_generator.HTML", mock_html_cls),
        patch("app.utils.pdf_generator.CSS", mock_css_cls),
        patch("app.utils.pdf_generator.FontConfiguration", return_value=mock_font_config),
        patch("app.utils.pdf_generator._resolve_font_path", return_value="/fonts"),
    ):
        result = html_to_pdf("<p>テスト</p>")

    assert result == b"%PDF-fake"
    mock_html_instance.write_pdf.assert_called_once()


def test_html_to_pdf_raises_on_weasyprint_error() -> None:
    mock_html_cls = MagicMock()
    mock_html_instance = MagicMock()
    mock_html_instance.write_pdf.side_effect = Exception("render error")
    mock_html_cls.return_value = mock_html_instance

    with (
        patch("app.utils.pdf_generator.HTML", mock_html_cls),
        patch("app.utils.pdf_generator.CSS", MagicMock()),
        patch("app.utils.pdf_generator.FontConfiguration", MagicMock()),
        patch("app.utils.pdf_generator._resolve_font_path", return_value="/fonts"),
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
    """Ensure the generated HTML contains the body content and lang=ja."""
    captured: list[str] = []

    mock_html_cls = MagicMock()
    mock_instance = MagicMock()
    mock_instance.write_pdf.return_value = b"pdf"

    def capture_html(**kwargs: str) -> MagicMock:
        captured.append(kwargs.get("string", ""))
        return mock_instance

    mock_html_cls.side_effect = capture_html

    with (
        patch("app.utils.pdf_generator.HTML", mock_html_cls),
        patch("app.utils.pdf_generator.CSS", MagicMock()),
        patch("app.utils.pdf_generator.FontConfiguration", MagicMock()),
        patch("app.utils.pdf_generator._resolve_font_path", return_value="/fonts"),
    ):
        html_to_pdf("<p>履歴書</p>")

    assert captured, "HTML() was not called"
    html = captured[0]
    assert 'lang="ja"' in html
    assert "<p>履歴書</p>" in html
    assert "Noto Sans JP" in html


# ---------------------------------------------------------------------------
# verify_fonts
# ---------------------------------------------------------------------------


def test_verify_fonts_returns_true_when_files_exist(tmp_path: Path) -> None:
    (tmp_path / "NotoSansJP-Regular.otf").touch()
    (tmp_path / "NotoSansJP-Bold.otf").touch()

    with patch("app.utils.pdf_generator._resolve_font_path", return_value=str(tmp_path)):
        assert verify_fonts() is True


def test_verify_fonts_returns_false_when_files_missing(tmp_path: Path) -> None:
    # Only create one of the two required files
    (tmp_path / "NotoSansJP-Regular.otf").touch()

    with patch("app.utils.pdf_generator._resolve_font_path", return_value=str(tmp_path)):
        assert verify_fonts() is False


def test_verify_fonts_returns_false_when_dir_empty(tmp_path: Path) -> None:
    with patch("app.utils.pdf_generator._resolve_font_path", return_value=str(tmp_path)):
        assert verify_fonts() is False
