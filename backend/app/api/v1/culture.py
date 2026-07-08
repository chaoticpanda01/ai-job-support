"""
Culture & workplace topics endpoints.

GET /culture/topics              — list published topics (?tag=X for filtering)
GET /culture/topics/{slug}       — full article by slug
GET /culture/glossary            — all glossary entries
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.dependencies import DbSession
from app.models.culture import CultureGlossary, CultureTopic
from app.schemas.culture import CultureTopicDetail, CultureTopicSummary, GlossaryEntry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/culture", tags=["culture"])


# ---------------------------------------------------------------------------
# Topics
# ---------------------------------------------------------------------------


@router.get("/topics", response_model=list[CultureTopicSummary])
async def list_topics(
    db: DbSession,
    tag: str | None = Query(default=None, description="Filter by tag"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
) -> list[CultureTopicSummary]:
    """List published culture topics, optionally filtered by tag."""
    stmt = (
        select(CultureTopic)
        .where(CultureTopic.published_at.isnot(None))
        .order_by(CultureTopic.published_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if tag:
        stmt = stmt.where(CultureTopic.tags.contains([tag]))

    result = await db.scalars(stmt)
    topics = list(result.all())
    return [CultureTopicSummary.model_validate(t) for t in topics]


@router.get("/topics/{slug}", response_model=CultureTopicDetail)
async def get_topic(slug: str, db: DbSession) -> CultureTopicDetail:
    """Retrieve a single published culture topic by its URL slug."""
    topic = await db.scalar(
        select(CultureTopic).where(
            CultureTopic.slug == slug,
            CultureTopic.published_at.isnot(None),
        )
    )
    if topic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found.")
    return CultureTopicDetail.model_validate(topic)


# ---------------------------------------------------------------------------
# Glossary
# ---------------------------------------------------------------------------


@router.get("/glossary", response_model=list[GlossaryEntry])
async def list_glossary(
    db: DbSession,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[GlossaryEntry]:
    """Return Japanese workplace glossary terms with Indonesian definitions."""
    result = await db.scalars(
        select(CultureGlossary).order_by(CultureGlossary.term_ja).offset(offset).limit(limit)
    )
    entries = list(result.all())
    return [GlossaryEntry.model_validate(e) for e in entries]
