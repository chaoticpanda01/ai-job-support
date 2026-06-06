"""
Unit tests for DocumentGenerator.

All external I/O (DB, S3, Claude, WeasyPrint) is mocked.
"""

from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.enums import DocumentStatus, DocumentType
from app.services.document_generator import (
    DocumentGenerationError,
    DocumentGenerator,
    GeneratedDocumentOutput,
    _esc,
    _feature_name,
    _render_html,
    _render_rirekisho,
    _render_shokumu,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_document(
    document_type: DocumentType = DocumentType.rirekisho,
    resume_id: uuid.UUID | None = None,
    job_context: dict | None = None,
) -> MagicMock:
    doc = MagicMock()
    doc.id = uuid.uuid4()
    doc.user_id = uuid.uuid4()
    doc.resume_id = resume_id or uuid.uuid4()
    doc.document_type = document_type
    doc.status = DocumentStatus.pending
    doc.job_context = job_context
    return doc


def _mock_resume() -> MagicMock:
    r = MagicMock()
    r.id = uuid.uuid4()
    r.file_url = "resumes/user123/abc.pdf"
    r.mime_type = "application/pdf"
    return r


def _mock_profile() -> MagicMock:
    p = MagicMock()
    p.japanese_level = MagicMock()
    p.japanese_level.value = "N3"
    p.target_role = ["Software Engineer"]
    p.target_industry = ["IT"]
    p.years_experience = 5
    p.target_location = "Tokyo"
    return p


def _rirekisho_content() -> dict:
    return {
        "personal": {
            "name_kanji": "山田 太郎",
            "name_kana": "ヤマダ タロウ",
            "date_of_birth": "1990年1月15日",
            "age": 35,
            "gender": "男性",
            "address": "東京都渋谷区",
            "phone": "090-1234-5678",
            "email": "test@example.com",
        },
        "education": [{"year": 2012, "month": 3, "entry": "○○大学 卒業"}],
        "work_history": [{"year": 2012, "month": 4, "entry": "株式会社ABC 入社"}],
        "qualifications": ["日本語能力試験N3"],
        "self_pr": "チームワークを大切にしています。",
        "motivation": "日本で働きたいと思っています。",
    }


def _shokumu_content() -> dict:
    return {
        "summary": "10年以上の経験を持つエンジニアです。",
        "companies": [
            {
                "company_name": "株式会社ABC",
                "industry": "情報通信業",
                "employee_count": "約500名",
                "period_start": "2015年4月",
                "period_end": "現在",
                "role": "ソフトウェアエンジニア",
                "responsibilities": ["バックエンド開発を担当"],
                "achievements": ["レスポンス速度を30%改善"],
            }
        ],
        "skills": {
            "technical": ["Python", "Java"],
            "languages": ["日本語（N3）", "英語（ビジネスレベル）"],
            "other": ["アジャイル開発"],
        },
        "self_pr": "チームワークを大切にしています。",
        "motivation": "日本のIT業界で貢献したいです。",
    }


# ---------------------------------------------------------------------------
# _esc
# ---------------------------------------------------------------------------

def test_esc_escapes_html_chars() -> None:
    assert _esc("<script>alert('xss')</script>") == "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;"


def test_esc_handles_none() -> None:
    assert _esc(None) == ""


def test_esc_handles_integer() -> None:
    assert _esc(35) == "35"


# ---------------------------------------------------------------------------
# _feature_name
# ---------------------------------------------------------------------------

def test_feature_name_rirekisho() -> None:
    assert _feature_name(DocumentType.rirekisho) == "rirekisho"


def test_feature_name_shokumu() -> None:
    assert _feature_name(DocumentType.shokumukeirekisho) == "shokumu"


# ---------------------------------------------------------------------------
# HTML renderers
# ---------------------------------------------------------------------------

def test_render_rirekisho_contains_key_fields() -> None:
    html = _render_rirekisho(_rirekisho_content())
    assert "履　歴　書" in html
    assert "山田 太郎" in html
    assert "ヤマダ タロウ" in html
    assert "○○大学 卒業" in html
    assert "株式会社ABC 入社" in html
    assert "日本語能力試験N3" in html
    assert "チームワーク" in html


def test_render_shokumu_contains_key_fields() -> None:
    html = _render_shokumu(_shokumu_content())
    assert "職務経歴書" in html
    assert "株式会社ABC" in html
    assert "バックエンド開発を担当" in html
    assert "レスポンス速度を30%改善" in html
    assert "Python" in html
    assert "日本語（N3）" in html


def test_render_html_dispatches_by_type() -> None:
    rirekisho_html = _render_html(DocumentType.rirekisho, _rirekisho_content())
    shokumu_html = _render_html(DocumentType.shokumukeirekisho, _shokumu_content())
    assert "履　歴　書" in rirekisho_html
    assert "職務経歴書" in shokumu_html


def test_render_rirekisho_escapes_html() -> None:
    content = _rirekisho_content()
    content["personal"]["name_kanji"] = "<b>Test</b>"
    html = _render_rirekisho(content)
    assert "<b>Test</b>" not in html
    assert "&lt;b&gt;" in html


def test_render_shokumu_handles_empty_achievements() -> None:
    content = _shokumu_content()
    content["companies"][0]["achievements"] = []
    html = _render_shokumu(content)
    assert "職務経歴書" in html  # should not crash


# ---------------------------------------------------------------------------
# DocumentGenerator.generate — success path (rirekisho)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_generate_rirekisho_returns_output() -> None:
    doc = _mock_document(DocumentType.rirekisho)
    resume = _mock_resume()
    profile = _mock_profile()

    generator = DocumentGenerator()

    with (
        patch("app.services.document_generator.DocumentRepository") as MockDocRepo,
        patch("app.services.document_generator.ResumeRepository") as MockResumeRepo,
        patch("app.services.document_generator.ProfileRepository") as MockProfileRepo,
        patch.object(generator, "_fetch_and_extract", new=AsyncMock(return_value="resume text")),
        patch("app.services.document_generator.usage_tracker.check_budget", new=AsyncMock()),
        patch.object(
            generator, "_call_ai",
            new=AsyncMock(return_value=('{"ok": true}', 1200, 800)),
        ),
        patch.object(
            generator, "_parse_response",
            return_value=_rirekisho_content(),
        ),
        patch("app.services.document_generator.html_to_pdf", return_value=b"%PDF"),
        patch("app.services.document_generator.file_storage.upload_document", return_value="documents/u/rirekisho/abc.pdf"),
        patch("app.services.document_generator.usage_tracker.record", new=AsyncMock()),
    ):
        MockDocRepo.return_value.get = AsyncMock(return_value=doc)
        MockResumeRepo.return_value.get_owned = AsyncMock(return_value=resume)
        MockProfileRepo.return_value.get_by_user_id = AsyncMock(return_value=profile)

        result = await generator.generate(doc.id, doc.user_id, AsyncMock())

    assert isinstance(result, GeneratedDocumentOutput)
    assert result.file_url == "documents/u/rirekisho/abc.pdf"
    assert result.input_tokens == 1200
    assert result.output_tokens == 800


# ---------------------------------------------------------------------------
# DocumentGenerator.generate — failure cases
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_generate_raises_when_document_not_found() -> None:
    generator = DocumentGenerator()
    with patch("app.services.document_generator.DocumentRepository") as MockDocRepo:
        MockDocRepo.return_value.get = AsyncMock(return_value=None)
        with pytest.raises(DocumentGenerationError, match="not found"):
            await generator.generate(uuid.uuid4(), uuid.uuid4(), AsyncMock())


@pytest.mark.asyncio
async def test_generate_raises_when_resume_id_is_null() -> None:
    doc = _mock_document()
    doc.resume_id = None

    generator = DocumentGenerator()
    with patch("app.services.document_generator.DocumentRepository") as MockDocRepo:
        MockDocRepo.return_value.get = AsyncMock(return_value=doc)
        with pytest.raises(DocumentGenerationError, match="deleted"):
            await generator.generate(doc.id, doc.user_id, AsyncMock())


@pytest.mark.asyncio
async def test_generate_raises_when_resume_not_owned() -> None:
    doc = _mock_document()
    generator = DocumentGenerator()

    with (
        patch("app.services.document_generator.DocumentRepository") as MockDocRepo,
        patch("app.services.document_generator.ResumeRepository") as MockResumeRepo,
        patch("app.services.document_generator.ProfileRepository") as MockProfileRepo,
    ):
        MockDocRepo.return_value.get = AsyncMock(return_value=doc)
        MockResumeRepo.return_value.get_owned = AsyncMock(return_value=None)
        MockProfileRepo.return_value.get_by_user_id = AsyncMock(return_value=None)

        with pytest.raises(DocumentGenerationError, match="not found or not owned"):
            await generator.generate(doc.id, doc.user_id, AsyncMock())


@pytest.mark.asyncio
async def test_generate_raises_on_ai_error() -> None:
    from app.services.ai.client import AIError

    doc = _mock_document()
    resume = _mock_resume()
    generator = DocumentGenerator()

    with (
        patch("app.services.document_generator.DocumentRepository") as MockDocRepo,
        patch("app.services.document_generator.ResumeRepository") as MockResumeRepo,
        patch("app.services.document_generator.ProfileRepository") as MockProfileRepo,
        patch.object(generator, "_fetch_and_extract", new=AsyncMock(return_value="text")),
        patch("app.services.document_generator.usage_tracker.check_budget", new=AsyncMock()),
        patch.object(generator, "_call_ai", new=AsyncMock(side_effect=AIError("timeout"))),
    ):
        MockDocRepo.return_value.get = AsyncMock(return_value=doc)
        MockResumeRepo.return_value.get_owned = AsyncMock(return_value=resume)
        MockProfileRepo.return_value.get_by_user_id = AsyncMock(return_value=None)

        with pytest.raises(DocumentGenerationError, match="AI generation failed"):
            await generator.generate(doc.id, doc.user_id, AsyncMock())


@pytest.mark.asyncio
async def test_generate_raises_on_pdf_error() -> None:
    doc = _mock_document()
    resume = _mock_resume()
    generator = DocumentGenerator()

    with (
        patch("app.services.document_generator.DocumentRepository") as MockDocRepo,
        patch("app.services.document_generator.ResumeRepository") as MockResumeRepo,
        patch("app.services.document_generator.ProfileRepository") as MockProfileRepo,
        patch.object(generator, "_fetch_and_extract", new=AsyncMock(return_value="text")),
        patch("app.services.document_generator.usage_tracker.check_budget", new=AsyncMock()),
        patch.object(generator, "_call_ai", new=AsyncMock(return_value=("{}", 100, 50))),
        patch.object(generator, "_parse_response", return_value=_rirekisho_content()),
        patch("app.services.document_generator.html_to_pdf", side_effect=Exception("font missing")),
    ):
        MockDocRepo.return_value.get = AsyncMock(return_value=doc)
        MockResumeRepo.return_value.get_owned = AsyncMock(return_value=resume)
        MockProfileRepo.return_value.get_by_user_id = AsyncMock(return_value=None)

        with pytest.raises(DocumentGenerationError, match="PDF rendering failed"):
            await generator.generate(doc.id, doc.user_id, AsyncMock())
