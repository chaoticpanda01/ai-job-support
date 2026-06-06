from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class CultureTopicSummary(BaseModel):
    id: UUID
    slug: str
    title: str
    tags: list[str]
    published_at: datetime

    model_config = {"from_attributes": True}


class CultureTopicDetail(BaseModel):
    id: UUID
    slug: str
    title: str
    body: str
    tags: list[str]
    published_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class GlossaryEntry(BaseModel):
    id: UUID
    term_ja: str
    reading_romaji: str | None
    definition_id: str

    model_config = {"from_attributes": True}
