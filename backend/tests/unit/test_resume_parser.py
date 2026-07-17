"""Unit tests for resume text extraction."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from app.services.resume_parser import (
    MIME_DOCX,
    MIME_PDF,
    ParseError,
    _clean,
    extract_text,
)

# ---------------------------------------------------------------------------
# _clean
# ---------------------------------------------------------------------------


def test_clean_collapses_blank_lines() -> None:
    raw = "Line 1\n\n\n\nLine 2"
    assert _clean(raw) == "Line 1\n\nLine 2"


def test_clean_collapses_spaces() -> None:
    raw = "Word1    Word2\tWord3"
    assert _clean(raw) == "Word1 Word2 Word3"


def test_clean_strips_control_characters() -> None:
    raw = "Hello\x00\x07World"
    assert _clean(raw) == "HelloWorld"


# ---------------------------------------------------------------------------
# extract_text — PDF
# ---------------------------------------------------------------------------


def test_extract_pdf_returns_text() -> None:
    mock_page = MagicMock()
    mock_page.extract_text.return_value = "Resume content here"
    mock_reader = MagicMock()
    mock_reader.pages = [mock_page]

    with patch("pypdf.PdfReader", return_value=mock_reader):
        result = extract_text(b"fake_pdf_bytes", MIME_PDF)

    assert "Resume content here" in result


def test_extract_pdf_raises_on_empty_text() -> None:
    mock_page = MagicMock()
    mock_page.extract_text.return_value = ""
    mock_reader = MagicMock()
    mock_reader.pages = [mock_page]

    with (
        patch("pypdf.PdfReader", return_value=mock_reader),
        pytest.raises(ParseError, match="No readable text"),
    ):
        extract_text(b"fake_pdf_bytes", MIME_PDF)


def test_extract_pdf_raises_on_reader_error() -> None:
    with (
        patch("pypdf.PdfReader", side_effect=Exception("corrupted")),
        pytest.raises(ParseError, match="PDF extraction failed"),
    ):
        extract_text(b"bad_bytes", MIME_PDF)


# ---------------------------------------------------------------------------
# extract_text — DOCX
# ---------------------------------------------------------------------------


def test_extract_docx_returns_text() -> None:
    mock_para = MagicMock()
    mock_para.text = "Work experience"
    mock_doc = MagicMock()
    mock_doc.paragraphs = [mock_para]
    mock_doc.tables = []

    with patch("docx.Document", return_value=mock_doc):
        result = extract_text(b"fake_docx_bytes", MIME_DOCX)

    assert "Work experience" in result


# ---------------------------------------------------------------------------
# extract_text — unsupported type
# ---------------------------------------------------------------------------


def test_extract_unsupported_mime_raises() -> None:
    with pytest.raises(ParseError, match="Unsupported MIME type"):
        extract_text(b"data", "image/png")


# ---------------------------------------------------------------------------
# Truncation
# ---------------------------------------------------------------------------


def test_extract_truncates_long_text() -> None:
    long_text = "A" * 25_000
    mock_page = MagicMock()
    mock_page.extract_text.return_value = long_text
    mock_reader = MagicMock()
    mock_reader.pages = [mock_page]

    with patch("pypdf.PdfReader", return_value=mock_reader):
        result = extract_text(b"fake_pdf_bytes", MIME_PDF)

    assert len(result) == 20_000
