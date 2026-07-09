"""
Admin-only API routes.

All endpoints require role=admin. Returns 403 for regular users.

GET  /admin/stats              — overview counts
GET  /admin/users              — paginated user list
PATCH /admin/users/{id}/role   — promote/demote user
GET  /admin/culture/topics     — all topics (including unpublished)
POST /admin/culture/topics     — create topic
PATCH /admin/culture/topics/{slug} — update topic
DELETE /admin/culture/topics/{slug} — delete topic
GET  /admin/culture/glossary   — all glossary entries
POST /admin/culture/glossary   — create glossary entry
DELETE /admin/culture/glossary/{id} — delete glossary entry
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from app.dependencies import AdminUser, DbSession, PaginationDep
from app.models.culture import CultureGlossary, CultureTopic
from app.models.document import GeneratedDocument
from app.models.enums import UserRole
from app.models.resume import Resume
from app.models.user import User
from app.repositories.user import UserRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class StatsResponse(BaseModel):
    total_users: int
    active_users: int
    total_resumes: int
    total_documents: int
    total_culture_topics: int
    total_glossary_entries: int


class AdminUserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str | None
    role: str
    subscription_tier: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminUserListResponse(BaseModel):
    items: list[AdminUserResponse]
    total: int


class UpdateRoleRequest(BaseModel):
    role: str


class TopicCreateRequest(BaseModel):
    slug: str
    title: str
    body: str
    tags: list[str] = []
    published: bool = True


class TopicUpdateRequest(BaseModel):
    title: str | None = None
    body: str | None = None
    tags: list[str] | None = None
    published: bool | None = None


class TopicResponse(BaseModel):
    slug: str
    title: str
    tags: list[str]
    published: bool
    published_at: datetime | None

    model_config = {"from_attributes": True}


class GlossaryCreateRequest(BaseModel):
    term_ja: str
    reading_romaji: str
    definition_id: str


class GlossaryResponse(BaseModel):
    id: UUID
    term_ja: str
    reading_romaji: str
    definition_id: str

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=StatsResponse)
async def get_stats(db: DbSession, _admin: AdminUser) -> StatsResponse:
    total_users = await db.scalar(select(func.count()).select_from(User)) or 0
    active_users = (
        await db.scalar(
            select(func.count()).select_from(User).where(User.is_active == True)  # noqa: E712
        )
        or 0
    )
    total_resumes = await db.scalar(select(func.count()).select_from(Resume)) or 0
    total_documents = await db.scalar(select(func.count()).select_from(GeneratedDocument)) or 0
    total_topics = await db.scalar(select(func.count()).select_from(CultureTopic)) or 0
    total_glossary = await db.scalar(select(func.count()).select_from(CultureGlossary)) or 0

    return StatsResponse(
        total_users=total_users,
        active_users=active_users,
        total_resumes=total_resumes,
        total_documents=total_documents,
        total_culture_topics=total_topics,
        total_glossary_entries=total_glossary,
    )


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    db: DbSession,
    _admin: AdminUser,
    pagination: PaginationDep,
) -> AdminUserListResponse:
    total = await db.scalar(select(func.count()).select_from(User)) or 0
    result = await db.scalars(
        select(User)
        .order_by(User.created_at.desc())
        .offset(pagination.offset)
        .limit(pagination.limit)
    )
    users = list(result)
    return AdminUserListResponse(
        items=[AdminUserResponse.model_validate(u) for u in users],
        total=total,
    )


@router.patch("/users/{user_id}/role", response_model=AdminUserResponse)
async def update_user_role(
    user_id: UUID,
    body: UpdateRoleRequest,
    db: DbSession,
    admin: AdminUser,
) -> AdminUserResponse:
    if str(user_id) == str(admin.user_id):
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    try:
        role = UserRole(body.role)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid role: {body.role}") from exc

    repo = UserRepository(db)
    user = await repo.get(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user.role = role
    await db.flush()
    return AdminUserResponse.model_validate(user)


# ---------------------------------------------------------------------------
# Culture topics
# ---------------------------------------------------------------------------


@router.get("/culture/topics", response_model=list[TopicResponse])
async def list_all_topics(db: DbSession, _admin: AdminUser) -> list[TopicResponse]:
    result = await db.scalars(select(CultureTopic).order_by(CultureTopic.title))
    return [
        TopicResponse(
            slug=t.slug,
            title=t.title,
            tags=t.tags,
            published=t.published_at is not None,
            published_at=t.published_at,
        )
        for t in result
    ]


@router.post("/culture/topics", response_model=TopicResponse, status_code=201)
async def create_topic(
    body: TopicCreateRequest,
    db: DbSession,
    _admin: AdminUser,
) -> TopicResponse:
    existing = await db.scalar(select(CultureTopic).where(CultureTopic.slug == body.slug))
    if existing:
        raise HTTPException(status_code=409, detail="Slug already exists")

    topic = CultureTopic(
        slug=body.slug,
        title=body.title,
        body=body.body,
        tags=body.tags,
        published_at=datetime.now(tz=UTC) if body.published else None,
    )
    db.add(topic)
    await db.flush()
    return TopicResponse(
        slug=topic.slug,
        title=topic.title,
        tags=topic.tags,
        published=topic.published_at is not None,
        published_at=topic.published_at,
    )


@router.patch("/culture/topics/{slug}", response_model=TopicResponse)
async def update_topic(
    slug: str,
    body: TopicUpdateRequest,
    db: DbSession,
    _admin: AdminUser,
) -> TopicResponse:
    topic = await db.scalar(select(CultureTopic).where(CultureTopic.slug == slug))
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")

    if body.title is not None:
        topic.title = body.title
    if body.body is not None:
        topic.body = body.body
    if body.tags is not None:
        topic.tags = body.tags
    if body.published is not None:
        topic.published_at = datetime.now(tz=UTC) if body.published else None

    await db.flush()
    return TopicResponse(
        slug=topic.slug,
        title=topic.title,
        tags=topic.tags,
        published=topic.published_at is not None,
        published_at=topic.published_at,
    )


@router.delete("/culture/topics/{slug}", status_code=200)
async def delete_topic(slug: str, db: DbSession, _admin: AdminUser) -> dict[str, str]:
    topic = await db.scalar(select(CultureTopic).where(CultureTopic.slug == slug))
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")
    await db.delete(topic)
    await db.flush()
    return {"detail": "Topic deleted"}


# ---------------------------------------------------------------------------
# Glossary
# ---------------------------------------------------------------------------


@router.get("/culture/glossary", response_model=list[GlossaryResponse])
async def list_glossary(db: DbSession, _admin: AdminUser) -> list[GlossaryResponse]:
    result = await db.scalars(select(CultureGlossary).order_by(CultureGlossary.term_ja))
    return [GlossaryResponse.model_validate(g) for g in result]


@router.post("/culture/glossary", response_model=GlossaryResponse, status_code=201)
async def create_glossary_entry(
    body: GlossaryCreateRequest,
    db: DbSession,
    _admin: AdminUser,
) -> GlossaryResponse:
    existing = await db.scalar(
        select(CultureGlossary).where(CultureGlossary.term_ja == body.term_ja)
    )
    if existing:
        raise HTTPException(status_code=409, detail="Term already exists")

    entry = CultureGlossary(
        term_ja=body.term_ja,
        reading_romaji=body.reading_romaji,
        definition_id=body.definition_id,
    )
    db.add(entry)
    await db.flush()
    return GlossaryResponse.model_validate(entry)


@router.delete("/culture/glossary/{entry_id}", status_code=200)
async def delete_glossary_entry(
    entry_id: UUID,
    db: DbSession,
    _admin: AdminUser,
) -> dict[str, str]:
    entry = await db.scalar(select(CultureGlossary).where(CultureGlossary.id == entry_id))
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.delete(entry)
    await db.flush()
    return {"detail": "Entry deleted"}
