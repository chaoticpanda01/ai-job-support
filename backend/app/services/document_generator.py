"""
Document generation service.

Orchestrates the full pipeline for generating a Japanese career document:

  1. Load the GeneratedDocument row + Resume + Profile from DB
  2. Fetch resume file bytes from S3 and extract plain text
  3. Call the appropriate prompt builder (rirekisho / shokumu)
  4. Check AI usage budget
  5. Call Claude via AIClient
  6. Parse and validate the JSON response
  7. Render structured JSON → HTML template
  8. Convert HTML → PDF bytes via WeasyPrint
  9. Upload PDF to S3
  10. Return GeneratedDocumentOutput (caller writes it to DB)

This service is synchronous-friendly: it is called from a Celery task via
asyncio.run(). It does NOT update the document status — that is the task's
responsibility so that failed partial runs can be recorded cleanly.
"""

from __future__ import annotations

import io
import logging
import time
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.enums import DocumentType
from app.repositories.document import DocumentRepository
from app.repositories.resume import ResumeRepository
from app.repositories.user import ProfileRepository
from app.services.ai.client import AIError, ai_client
from app.services.ai.response_parser import ResponseParseError, parse_response
from app.services.ai.usage_tracker import AIBudgetError, usage_tracker
from app.services.file_storage import StorageError, file_storage
from app.services.resume_parser import ParseError, extract_text
from app.utils.pdf_generator import PDFGenerationError, html_to_pdf

logger = logging.getLogger(__name__)


class DocumentGenerationError(Exception):
    """Raised when any step of the pipeline fails."""


@dataclass
class GeneratedDocumentOutput:
    content: dict[str, Any]
    file_url: str
    ai_model: str
    input_tokens: int
    output_tokens: int


class DocumentGenerator:
    """
    Stateless service — one instance shared across tasks.
    Each `generate()` call is fully self-contained.
    """

    async def generate(
        self,
        document_id: UUID,
        user_id: UUID,
        db: AsyncSession,
    ) -> GeneratedDocumentOutput:
        """
        Run the full generation pipeline for a single document.
        Raises DocumentGenerationError with a human-readable message on any failure.
        """
        # -- Load document row
        doc_repo = DocumentRepository(db)
        doc = await doc_repo.get(document_id)
        if doc is None:
            raise DocumentGenerationError(f"Document {document_id} not found")

        if doc.resume_id is None:
            raise DocumentGenerationError(
                "Source resume was deleted before generation could complete"
            )

        # -- Load resume
        resume_repo = ResumeRepository(db)
        resume = await resume_repo.get_owned(doc.resume_id, user_id)
        if resume is None:
            raise DocumentGenerationError(
                f"Resume {doc.resume_id} not found or not owned by user {user_id}"
            )

        # -- Load profile (optional — used for prompt enrichment)
        profile_repo = ProfileRepository(db)
        profile = await profile_repo.get_by_user_id(user_id)
        profile_data: dict[str, Any] | None = None
        if profile is not None:
            profile_data = {
                "japanese_level": profile.japanese_level.value,
                "target_role": profile.target_role,
                "target_industry": profile.target_industry,
                "years_experience": profile.years_experience,
                "target_location": profile.target_location,
            }

        # -- Fetch resume bytes from S3 and extract text
        resume_text = await self._fetch_and_extract(resume.file_url, resume.mime_type)

        # -- Resolve job posting text from job_context if present
        job_posting_text: str | None = None
        if doc.job_context:
            job_posting_text = doc.job_context.get("translated_description")

        # -- Budget check
        feature = _feature_name(doc.document_type)
        try:
            await usage_tracker.check_budget(user_id, feature, db)
        except AIBudgetError as exc:
            raise DocumentGenerationError(str(exc)) from exc

        # -- Build prompts and call Claude
        t0 = time.monotonic()
        try:
            response_text, input_tokens, output_tokens = await self._call_ai(
                doc.document_type,
                resume_text,
                profile_data,
                job_posting_text,
            )
        except AIError as exc:
            raise DocumentGenerationError(f"AI generation failed: {exc}") from exc
        latency_ms = int((time.monotonic() - t0) * 1000)

        # -- Parse response
        content = self._parse_response(doc.document_type, response_text)

        # -- Render HTML → PDF
        html = _render_html(doc.document_type, content)
        try:
            pdf_bytes = html_to_pdf(html)
        except PDFGenerationError as exc:
            raise DocumentGenerationError(f"PDF rendering failed: {exc}") from exc

        # -- Upload PDF to S3
        try:
            s3_key = file_storage.upload_document(
                file_bytes=pdf_bytes,
                user_id=user_id,
                document_type=doc.document_type.value,
            )
        except StorageError as exc:
            raise DocumentGenerationError(f"S3 upload failed: {exc}") from exc

        # -- Record usage (never raises)
        await usage_tracker.record(
            user_id=user_id,
            feature=feature,
            model=settings.gemini_default_model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
            db=db,
        )

        return GeneratedDocumentOutput(
            content=content,
            file_url=s3_key,
            ai_model=settings.gemini_default_model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _fetch_and_extract(self, s3_key: str, mime_type: str) -> str:
        """Fetch resume bytes from S3 and extract plain text."""
        try:
            file_bytes = file_storage.download(s3_key)
        except StorageError as exc:
            raise DocumentGenerationError("Failed to fetch resume file. Please try again.") from exc

        try:
            return extract_text(file_bytes, mime_type)
        except ParseError as exc:
            raise DocumentGenerationError(
                "Could not read this resume file. Please re-upload it in a supported format."
            ) from exc

    async def _call_ai(
        self,
        document_type: DocumentType,
        resume_text: str,
        profile_data: dict[str, Any] | None,
        job_posting_text: str | None,
    ) -> tuple[str, int, int]:
        if document_type == DocumentType.rirekisho:
            from app.services.ai.prompts.rirekisho import (
                build_system_prompt,
                build_user_prompt,
            )
            max_tokens = 2500
        else:
            from app.services.ai.prompts.shokumu import (  # type: ignore[assignment]
                build_system_prompt,
                build_user_prompt,
            )
            max_tokens = 3000

        system = build_system_prompt()
        user = build_user_prompt(
            resume_text,
            profile_data=profile_data,
            job_posting_text=job_posting_text,
        )
        return await ai_client.generate(
            system,
            user,
            max_tokens=max_tokens,
            feature=_feature_name(document_type),
        )

    def _parse_response(
        self, document_type: DocumentType, response_text: str
    ) -> dict[str, Any]:
        try:
            if document_type == DocumentType.rirekisho:
                from app.services.ai.prompts.rirekisho import RirekishoResult
                result = parse_response(response_text, RirekishoResult)
            else:
                from app.services.ai.prompts.shokumu import ShokumuResult
                result = parse_response(response_text, ShokumuResult)
        except ResponseParseError as exc:
            raise DocumentGenerationError(f"Response validation failed: {exc}") from exc

        return result.model_dump()


# ---------------------------------------------------------------------------
# HTML renderers
# ---------------------------------------------------------------------------

def _render_html(document_type: DocumentType, content: dict[str, Any]) -> str:
    if document_type == DocumentType.rirekisho:
        return _render_rirekisho(content)
    return _render_shokumu(content)


def _render_rirekisho(c: dict[str, Any]) -> str:
    p = c.get("personal", {})

    from app.utils.japanese_date import format_wareki_date

    education_rows = "".join(
        f"<tr><td>{format_wareki_date(e['year'], e['month'])}</td>"
        f"<td>{_esc(e['entry'])}</td></tr>"
        for e in c.get("education", [])
    )
    work_rows = "".join(
        f"<tr><td>{format_wareki_date(w['year'], w['month'])}</td>"
        f"<td>{_esc(w['entry'])}</td></tr>"
        for w in c.get("work_history", [])
    )
    qualifications = "".join(
        f"<li>{_esc(q)}</li>" for q in c.get("qualifications", [])
    )

    return f"""
<div style="max-width:170mm; margin:0 auto;">
  <h1 style="text-align:center; font-size:16pt; letter-spacing:0.3em; margin-bottom:8px;">
    履　歴　書
  </h1>

  <table style="margin-bottom:6px;">
    <tr>
      <th style="width:16%;">ふりがな</th>
      <td style="width:42%;">{_esc(p.get('name_kana', ''))}</td>
      <th style="width:12%;">性別</th>
      <td style="width:30%;">{_esc(p.get('gender', ''))}</td>
    </tr>
    <tr>
      <th>氏名</th>
      <td style="font-size:13pt; font-weight:bold;">{_esc(p.get('name_kanji', ''))}</td>
      <th>生年月日</th>
      <td>{_esc(p.get('date_of_birth', ''))}（{p.get('age', '')}歳）</td>
    </tr>
    <tr>
      <th>住所</th>
      <td colspan="3">{_esc(p.get('address', ''))}</td>
    </tr>
    <tr>
      <th>電話番号</th>
      <td>{_esc(p.get('phone', ''))}</td>
      <th>メール</th>
      <td>{_esc(p.get('email', ''))}</td>
    </tr>
  </table>

  <p class="section-title">学歴・職歴</p>
  <table>
    <thead>
      <tr><th style="width:22%;">年月</th><th>内容</th></tr>
    </thead>
    <tbody>
      <tr><td colspan="2" style="text-align:center; font-weight:bold;">学歴</td></tr>
      {education_rows}
      <tr><td colspan="2" style="text-align:center; font-weight:bold;">職歴</td></tr>
      {work_rows}
      <tr><td colspan="2" style="text-align:right;">以上</td></tr>
    </tbody>
  </table>

  <p class="section-title">資格・免許</p>
  <ul style="padding-left:1.2em; margin:4px 0;">{qualifications}</ul>

  <p class="section-title">自己PR</p>
  <p style="white-space:pre-wrap; padding:4px;">{_esc(c.get('self_pr', ''))}</p>

  <p class="section-title">志望動機</p>
  <p style="white-space:pre-wrap; padding:4px;">{_esc(c.get('motivation', ''))}</p>
</div>
"""


def _render_shokumu(c: dict[str, Any]) -> str:
    skills = c.get("skills", {})

    def skill_items(items: list[str]) -> str:
        return "　／　".join(_esc(s) for s in items) if items else "―"

    companies_html = ""
    for company in c.get("companies", []):
        responsibilities = "".join(
            f"<li>{_esc(r)}</li>" for r in company.get("responsibilities", [])
        )
        achievements = "".join(
            f"<li>{_esc(a)}</li>" for a in company.get("achievements", [])
        )
        companies_html += f"""
<div style="margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #ccc;">
  <table style="margin-bottom:4px;">
    <tr>
      <th style="width:20%;">会社名</th>
      <td style="width:46%; font-weight:bold;">{_esc(company.get('company_name', ''))}</td>
      <th style="width:14%;">業種</th>
      <td>{_esc(company.get('industry', ''))}</td>
    </tr>
    <tr>
      <th>従業員数</th>
      <td>{_esc(company.get('employee_count', ''))}</td>
      <th>在籍期間</th>
      <td>{_esc(company.get('period_start', ''))} 〜 {_esc(company.get('period_end', ''))}</td>
    </tr>
    <tr>
      <th>役職・職種</th>
      <td colspan="3">{_esc(company.get('role', ''))}</td>
    </tr>
  </table>
  <p class="label">【業務内容】</p>
  <ul style="padding-left:1.2em; margin:2px 0 6px;">{responsibilities}</ul>
  <p class="label">【実績・成果】</p>
  <ul style="padding-left:1.2em; margin:2px 0;">{achievements if achievements else '<li>―</li>'}</ul>
</div>
"""

    return f"""
<div style="max-width:170mm; margin:0 auto;">
  <h1 style="font-size:15pt; border-bottom:3px solid #333; padding-bottom:4px; margin-bottom:8px;">
    職務経歴書
  </h1>

  <p class="section-title">職務要約</p>
  <p style="white-space:pre-wrap; padding:4px; margin-bottom:10px;">
    {_esc(c.get('summary', ''))}
  </p>

  <p class="section-title">職務経歴</p>
  {companies_html}

  <p class="section-title">スキル</p>
  <table style="margin-bottom:10px;">
    <tr>
      <th style="width:22%;">技術スキル</th>
      <td>{skill_items(skills.get('technical', []))}</td>
    </tr>
    <tr>
      <th>語学</th>
      <td>{skill_items(skills.get('languages', []))}</td>
    </tr>
    <tr>
      <th>その他</th>
      <td>{skill_items(skills.get('other', []))}</td>
    </tr>
  </table>

  <p class="section-title">自己PR</p>
  <p style="white-space:pre-wrap; padding:4px; margin-bottom:10px;">
    {_esc(c.get('self_pr', ''))}
  </p>

  <p class="section-title">志望動機</p>
  <p style="white-space:pre-wrap; padding:4px;">
    {_esc(c.get('motivation', ''))}
  </p>
</div>
"""


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _feature_name(document_type: DocumentType) -> str:
    return "rirekisho" if document_type == DocumentType.rirekisho else "shokumu"


def _esc(value: Any) -> str:
    """HTML-escape a string value safely."""
    import html
    return html.escape(str(value)) if value is not None else ""


# Singleton
document_generator = DocumentGenerator()
