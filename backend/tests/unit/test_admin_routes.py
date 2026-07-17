"""
Unit tests for admin-only endpoints (stats, users, culture topics/glossary).

This router queries the DB session directly (no repository layer, except for
role updates), so tests override the get_db dependency with a mock session
rather than patching individual repository methods.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.database import get_db
from app.main import app
from app.middleware import clerk_auth as clerk_auth_module
from app.models.enums import UserRole
from httpx import ASGITransport, AsyncClient

from tests.conftest import make_user

_FAKE_JWKS: dict[str, Any] = {"keys": []}


def _auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer valid_token"}


@contextmanager
def _bypass_middleware(user: Any) -> Iterator[None]:
    """Let the real ClerkJWTMiddleware run, mocking its I/O boundaries."""
    claims = {"sub": user.clerk_id, "email": user.email, "exp": int(time.time()) + 3600}
    with (
        patch.object(clerk_auth_module, "_get_jwks", new=AsyncMock(return_value=_FAKE_JWKS)),
        patch("app.middleware.clerk_auth._validate_token", new=AsyncMock(return_value=claims)),
        patch("app.middleware.clerk_auth._resolve_user", new=AsyncMock(return_value=user)),
    ):
        yield


@contextmanager
def _fake_db_session(
    *, scalar_results: list[Any] | None = None, scalars_result: list[Any] | None = None
) -> Iterator[MagicMock]:
    """
    Override get_db with a mock session. This router calls db.scalar()/
    scalars()/add()/flush()/delete() directly (no repository layer), so the
    session itself needs to be mocked rather than a repository method.

    scalar_results — consumed in order, one per db.scalar() call in the route.
    scalars_result — returned by db.scalars() (iterated directly by the route).

    id columns use server_default=gen_random_uuid() (DB-generated, not a
    Python-side default — see UUIDPrimaryKeyMixin), so newly-constructed
    ORM objects have id=None until a real flush round-trips to Postgres.
    flush() here fakes that by assigning a UUID to anything just added.
    """
    added: list[Any] = []
    session = MagicMock()
    session.scalar = AsyncMock(side_effect=scalar_results or [])
    session.scalars = AsyncMock(return_value=scalars_result or [])
    session.add = MagicMock(side_effect=added.append)
    session.delete = AsyncMock()

    async def _fake_flush() -> None:
        for obj in added:
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()
        added.clear()

    session.flush = AsyncMock(side_effect=_fake_flush)

    async def _fake_get_db() -> Any:
        yield session

    app.dependency_overrides[get_db] = _fake_get_db
    try:
        yield session
    finally:
        app.dependency_overrides.pop(get_db, None)


def _mock_admin_user_row() -> MagicMock:
    row = MagicMock()
    row.id = uuid.uuid4()
    row.email = "user@example.com"
    row.full_name = "Test User"
    row.role = UserRole.user
    row.subscription_tier = "free"
    row.is_active = True
    row.created_at = datetime.now(tz=UTC)
    return row


def _mock_topic(*, published: bool = True) -> MagicMock:
    topic = MagicMock()
    topic.slug = "workplace-etiquette"
    topic.title = "Workplace Etiquette"
    topic.body = "Some content"
    topic.tags = ["culture"]
    topic.published_at = datetime.now(tz=UTC) if published else None
    return topic


def _mock_glossary_entry() -> MagicMock:
    entry = MagicMock()
    entry.id = uuid.uuid4()
    entry.term_ja = "報連相"
    entry.reading_romaji = "hourensou"
    entry.definition_id = "Report, contact, consult"
    return entry


# ---------------------------------------------------------------------------
# Non-admin access — 403
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stats_forbidden_for_regular_user() -> None:
    user = make_user(role=UserRole.user)

    with _bypass_middleware(user):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/admin/stats", headers=_auth_headers())

    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /admin/stats
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_stats_returns_counts() -> None:
    admin = make_user(role=UserRole.admin)

    with (
        _bypass_middleware(admin),
        _fake_db_session(scalar_results=[10, 8, 5, 3, 2, 20]),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/admin/stats", headers=_auth_headers())

    assert resp.status_code == 200
    data = resp.json()
    assert data["total_users"] == 10
    assert data["active_users"] == 8
    assert data["total_resumes"] == 5
    assert data["total_documents"] == 3
    assert data["total_culture_topics"] == 2
    assert data["total_glossary_entries"] == 20


# ---------------------------------------------------------------------------
# GET /admin/users
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_users_returns_items() -> None:
    admin = make_user(role=UserRole.admin)
    rows = [_mock_admin_user_row(), _mock_admin_user_row()]

    with (
        _bypass_middleware(admin),
        _fake_db_session(scalar_results=[2], scalars_result=rows),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/admin/users", headers=_auth_headers())

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


# ---------------------------------------------------------------------------
# PATCH /admin/users/{id}/role
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_user_role_happy_path() -> None:
    admin = make_user(role=UserRole.admin)
    target = _mock_admin_user_row()

    with (
        _bypass_middleware(admin),
        _fake_db_session(),
        patch("app.api.v1.admin.UserRepository.get", new=AsyncMock(return_value=target)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(
                f"/api/v1/admin/users/{target.id}/role",
                headers=_auth_headers(),
                json={"role": "admin"},
            )

    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"


@pytest.mark.asyncio
async def test_update_user_role_cannot_change_own_role() -> None:
    admin = make_user(role=UserRole.admin)

    with _bypass_middleware(admin):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(
                f"/api/v1/admin/users/{admin.id}/role",
                headers=_auth_headers(),
                json={"role": "user"},
            )

    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_update_user_role_invalid_role_returns_422() -> None:
    admin = make_user(role=UserRole.admin)

    with _bypass_middleware(admin):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(
                f"/api/v1/admin/users/{uuid.uuid4()}/role",
                headers=_auth_headers(),
                json={"role": "superuser"},
            )

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_update_user_role_target_not_found_returns_404() -> None:
    admin = make_user(role=UserRole.admin)

    with (
        _bypass_middleware(admin),
        patch("app.api.v1.admin.UserRepository.get", new=AsyncMock(return_value=None)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(
                f"/api/v1/admin/users/{uuid.uuid4()}/role",
                headers=_auth_headers(),
                json={"role": "admin"},
            )

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /admin/culture/topics
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_all_topics_returns_items() -> None:
    admin = make_user(role=UserRole.admin)
    topics = [_mock_topic(published=True), _mock_topic(published=False)]

    with (
        _bypass_middleware(admin),
        _fake_db_session(scalars_result=topics),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/admin/culture/topics", headers=_auth_headers())

    assert resp.status_code == 200
    assert len(resp.json()) == 2


# ---------------------------------------------------------------------------
# POST /admin/culture/topics
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_topic_happy_path() -> None:
    admin = make_user(role=UserRole.admin)

    with (
        _bypass_middleware(admin),
        _fake_db_session(scalar_results=[None]),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/admin/culture/topics",
                headers=_auth_headers(),
                json={
                    "slug": "new-topic",
                    "title": "New Topic",
                    "body": "Content here",
                    "tags": ["culture"],
                    "published": True,
                },
            )

    assert resp.status_code == 201
    assert resp.json()["slug"] == "new-topic"


@pytest.mark.asyncio
async def test_create_topic_duplicate_slug_returns_409() -> None:
    admin = make_user(role=UserRole.admin)
    existing = _mock_topic()

    with (
        _bypass_middleware(admin),
        _fake_db_session(scalar_results=[existing]),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/admin/culture/topics",
                headers=_auth_headers(),
                json={"slug": "workplace-etiquette", "title": "Dup", "body": "x"},
            )

    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# PATCH /admin/culture/topics/{slug}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_topic_happy_path() -> None:
    admin = make_user(role=UserRole.admin)
    topic = _mock_topic()

    with (
        _bypass_middleware(admin),
        _fake_db_session(scalar_results=[topic]),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(
                "/api/v1/admin/culture/topics/workplace-etiquette",
                headers=_auth_headers(),
                json={"title": "Updated Title"},
            )

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_update_topic_not_found_returns_404() -> None:
    admin = make_user(role=UserRole.admin)

    with (
        _bypass_middleware(admin),
        _fake_db_session(scalar_results=[None]),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(
                "/api/v1/admin/culture/topics/nonexistent",
                headers=_auth_headers(),
                json={"title": "x"},
            )

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /admin/culture/topics/{slug}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_topic_happy_path() -> None:
    admin = make_user(role=UserRole.admin)
    topic = _mock_topic()

    with (
        _bypass_middleware(admin),
        _fake_db_session(scalar_results=[topic]),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(
                "/api/v1/admin/culture/topics/workplace-etiquette", headers=_auth_headers()
            )

    assert resp.status_code == 200
    assert resp.json() == {"detail": "Topic deleted"}


@pytest.mark.asyncio
async def test_delete_topic_not_found_returns_404() -> None:
    admin = make_user(role=UserRole.admin)

    with (
        _bypass_middleware(admin),
        _fake_db_session(scalar_results=[None]),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(
                "/api/v1/admin/culture/topics/nonexistent", headers=_auth_headers()
            )

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /admin/culture/glossary
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_glossary_returns_items() -> None:
    admin = make_user(role=UserRole.admin)
    entries = [_mock_glossary_entry(), _mock_glossary_entry()]

    with (
        _bypass_middleware(admin),
        _fake_db_session(scalars_result=entries),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/admin/culture/glossary", headers=_auth_headers())

    assert resp.status_code == 200
    assert len(resp.json()) == 2


# ---------------------------------------------------------------------------
# POST /admin/culture/glossary
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_glossary_entry_happy_path() -> None:
    admin = make_user(role=UserRole.admin)

    with (
        _bypass_middleware(admin),
        _fake_db_session(scalar_results=[None]),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/admin/culture/glossary",
                headers=_auth_headers(),
                json={
                    "term_ja": "報連相",
                    "reading_romaji": "hourensou",
                    "definition_id": "Report, contact, consult",
                },
            )

    assert resp.status_code == 201
    assert resp.json()["term_ja"] == "報連相"


@pytest.mark.asyncio
async def test_create_glossary_entry_duplicate_returns_409() -> None:
    admin = make_user(role=UserRole.admin)
    existing = _mock_glossary_entry()

    with (
        _bypass_middleware(admin),
        _fake_db_session(scalar_results=[existing]),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/admin/culture/glossary",
                headers=_auth_headers(),
                json={
                    "term_ja": "報連相",
                    "reading_romaji": "hourensou",
                    "definition_id": "dup",
                },
            )

    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# DELETE /admin/culture/glossary/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_glossary_entry_happy_path() -> None:
    admin = make_user(role=UserRole.admin)
    entry = _mock_glossary_entry()

    with (
        _bypass_middleware(admin),
        _fake_db_session(scalar_results=[entry]),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(
                f"/api/v1/admin/culture/glossary/{entry.id}", headers=_auth_headers()
            )

    assert resp.status_code == 200
    assert resp.json() == {"detail": "Entry deleted"}


@pytest.mark.asyncio
async def test_delete_glossary_entry_not_found_returns_404() -> None:
    admin = make_user(role=UserRole.admin)

    with (
        _bypass_middleware(admin),
        _fake_db_session(scalar_results=[None]),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(
                f"/api/v1/admin/culture/glossary/{uuid.uuid4()}", headers=_auth_headers()
            )

    assert resp.status_code == 404
