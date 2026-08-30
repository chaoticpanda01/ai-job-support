"""
Unit tests for document endpoints (POST rirekisho/shokumu, GET list/status/download).

All external I/O (DB, background generation task, S3) is mocked so these run
without a live database.
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
from app.models.enums import DocumentOrientation, DocumentStatus, DocumentType
from app.services.file_storage import StorageError
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
def _fake_db_session() -> Iterator[MagicMock]:
    """
    Override the get_db dependency with a mock session.

    create_rirekisho/create_shokumu call db.add()/db.flush()/db.commit()
    directly (not through a repository), so a real AsyncSession would try to
    open a real DB connection. Overriding the dependency avoids that.
    """
    session = MagicMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()

    async def _fake_get_db() -> Any:
        yield session

    app.dependency_overrides[get_db] = _fake_get_db
    try:
        yield session
    finally:
        app.dependency_overrides.pop(get_db, None)


def _mock_document(
    *,
    document_type: DocumentType = DocumentType.rirekisho,
    status: DocumentStatus = DocumentStatus.completed,
    user_id: uuid.UUID | None = None,
    file_url: str | None = "documents/user123/abc.pdf",
) -> MagicMock:
    doc = MagicMock()
    doc.id = uuid.uuid4()
    doc.user_id = user_id or uuid.uuid4()
    doc.resume_id = uuid.uuid4()
    doc.document_type = document_type
    doc.status = status
    doc.orientation = DocumentOrientation.portrait
    doc.job_context = None
    doc.ai_model = "gemini-2.5-flash"
    doc.input_tokens = 100
    doc.output_tokens = 200
    doc.error_message = None
    doc.completed_at = datetime.now(tz=UTC)
    doc.created_at = datetime.now(tz=UTC)
    doc.content = {"summary": "test"}
    doc.file_url = file_url
    return doc


# ---------------------------------------------------------------------------
# POST /documents/rirekisho
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_rirekisho_returns_pending_status() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        _fake_db_session(),
        patch("app.workers.document_tasks._run_generation", new=AsyncMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/documents/rirekisho",
                headers=_auth_headers(),
                json={"resume_id": str(uuid.uuid4())},
            )

    assert resp.status_code == 202
    data = resp.json()
    assert data["status"] == "pending"


@pytest.mark.asyncio
async def test_create_rirekisho_with_job_posting_id() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        _fake_db_session(),
        patch("app.workers.document_tasks._run_generation", new=AsyncMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/documents/rirekisho",
                headers=_auth_headers(),
                json={"resume_id": str(uuid.uuid4()), "job_posting_id": str(uuid.uuid4())},
            )

    assert resp.status_code == 202


@pytest.mark.asyncio
async def test_create_rirekisho_defaults_to_portrait_orientation() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        _fake_db_session(),
        patch("app.workers.document_tasks._run_generation", new=AsyncMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/documents/rirekisho",
                headers=_auth_headers(),
                json={"resume_id": str(uuid.uuid4())},
            )

    assert resp.status_code == 202
    assert resp.json()["orientation"] == "portrait"


@pytest.mark.asyncio
async def test_create_rirekisho_accepts_landscape_orientation() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        _fake_db_session(),
        patch("app.workers.document_tasks._run_generation", new=AsyncMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/documents/rirekisho",
                headers=_auth_headers(),
                json={"resume_id": str(uuid.uuid4()), "orientation": "landscape"},
            )

    assert resp.status_code == 202
    assert resp.json()["orientation"] == "landscape"


# ---------------------------------------------------------------------------
# POST /documents/shokumu
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_shokumu_returns_pending_status() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        _fake_db_session(),
        patch("app.workers.document_tasks._run_generation", new=AsyncMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/documents/shokumu",
                headers=_auth_headers(),
                json={"resume_id": str(uuid.uuid4())},
            )

    assert resp.status_code == 202
    data = resp.json()
    assert data["status"] == "pending"


# ---------------------------------------------------------------------------
# GET /documents
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_documents_returns_items() -> None:
    user = make_user()
    docs = [_mock_document(user_id=user.id), _mock_document(user_id=user.id)]

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.documents.DocumentRepository.list_by_user",
            new=AsyncMock(return_value=docs),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/documents", headers=_auth_headers())

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


@pytest.mark.asyncio
async def test_list_documents_filtered_by_type() -> None:
    user = make_user()
    docs = [_mock_document(user_id=user.id, document_type=DocumentType.shokumukeirekisho)]

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.documents.DocumentRepository.list_by_user_and_type",
            new=AsyncMock(return_value=docs),
        ) as mock_list,
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/documents",
                headers=_auth_headers(),
                params={"type": "shokumukeirekisho"},
            )

    assert resp.status_code == 200
    mock_list.assert_called_once()


# ---------------------------------------------------------------------------
# GET /documents/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_document_status_returns_status() -> None:
    user = make_user()
    doc = _mock_document(user_id=user.id, status=DocumentStatus.processing)

    with (
        _bypass_middleware(user),
        patch("app.api.v1.documents.DocumentRepository.get_owned", new=AsyncMock(return_value=doc)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/documents/{doc.id}", headers=_auth_headers())

    assert resp.status_code == 200
    assert resp.json()["status"] == "processing"


@pytest.mark.asyncio
async def test_get_document_status_not_found_returns_404() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.documents.DocumentRepository.get_owned", new=AsyncMock(return_value=None)
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/documents/{uuid.uuid4()}", headers=_auth_headers())

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /documents/{id}/download
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_download_completed_document_returns_presigned_url() -> None:
    user = make_user()
    doc = _mock_document(user_id=user.id, status=DocumentStatus.completed)

    with (
        _bypass_middleware(user),
        patch("app.api.v1.documents.DocumentRepository.get_owned", new=AsyncMock(return_value=doc)),
        patch(
            "app.api.v1.documents.file_storage.presigned_url",
            return_value="https://s3.example.com/signed-url",
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/documents/{doc.id}/download", headers=_auth_headers())

    assert resp.status_code == 200
    assert resp.json()["download_url"] == "https://s3.example.com/signed-url"


@pytest.mark.asyncio
async def test_download_pending_document_returns_no_url() -> None:
    user = make_user()
    doc = _mock_document(user_id=user.id, status=DocumentStatus.pending, file_url=None)

    with (
        _bypass_middleware(user),
        patch("app.api.v1.documents.DocumentRepository.get_owned", new=AsyncMock(return_value=doc)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/documents/{doc.id}/download", headers=_auth_headers())

    assert resp.status_code == 200
    assert resp.json()["download_url"] is None


@pytest.mark.asyncio
async def test_download_document_presign_failure_returns_502() -> None:
    user = make_user()
    doc = _mock_document(user_id=user.id, status=DocumentStatus.completed)

    with (
        _bypass_middleware(user),
        patch("app.api.v1.documents.DocumentRepository.get_owned", new=AsyncMock(return_value=doc)),
        patch(
            "app.api.v1.documents.file_storage.presigned_url",
            side_effect=StorageError("S3 unavailable"),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"/api/v1/documents/{doc.id}/download", headers=_auth_headers())

    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_download_document_not_found_returns_404() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.documents.DocumentRepository.get_owned", new=AsyncMock(return_value=None)
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                f"/api/v1/documents/{uuid.uuid4()}/download", headers=_auth_headers()
            )

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /documents/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_document_happy_path() -> None:
    user = make_user()
    doc = _mock_document(user_id=user.id)

    with (
        _bypass_middleware(user),
        patch("app.api.v1.documents.DocumentRepository.get_owned", new=AsyncMock(return_value=doc)),
        patch("app.api.v1.documents.DocumentRepository.delete", new=AsyncMock()),
        patch("app.api.v1.documents.file_storage.delete"),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(f"/api/v1/documents/{doc.id}", headers=_auth_headers())

    assert resp.status_code == 200
    assert resp.json() == {"detail": "Document deleted"}


@pytest.mark.asyncio
async def test_delete_document_storage_failure_still_succeeds() -> None:
    user = make_user()
    doc = _mock_document(user_id=user.id)

    with (
        _bypass_middleware(user),
        patch("app.api.v1.documents.DocumentRepository.get_owned", new=AsyncMock(return_value=doc)),
        patch("app.api.v1.documents.DocumentRepository.delete", new=AsyncMock()),
        patch("app.api.v1.documents.file_storage.delete", side_effect=StorageError("boom")),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(f"/api/v1/documents/{doc.id}", headers=_auth_headers())

    assert resp.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("in_flight_status", [DocumentStatus.pending, DocumentStatus.processing])
async def test_delete_document_rejects_in_flight_status(in_flight_status: DocumentStatus) -> None:
    user = make_user()
    doc = _mock_document(user_id=user.id, status=in_flight_status)

    with (
        _bypass_middleware(user),
        patch("app.api.v1.documents.DocumentRepository.get_owned", new=AsyncMock(return_value=doc)),
        patch("app.api.v1.documents.DocumentRepository.delete", new=AsyncMock()) as mock_delete,
        patch("app.api.v1.documents.file_storage.delete") as mock_storage_delete,
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(f"/api/v1/documents/{doc.id}", headers=_auth_headers())

    assert resp.status_code == 409
    mock_delete.assert_not_called()
    mock_storage_delete.assert_not_called()


@pytest.mark.asyncio
async def test_delete_document_not_found_returns_404() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.documents.DocumentRepository.get_owned", new=AsyncMock(return_value=None)
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(f"/api/v1/documents/{uuid.uuid4()}", headers=_auth_headers())

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_document_with_no_file_url_skips_storage_delete() -> None:
    user = make_user()
    doc = _mock_document(user_id=user.id, file_url=None)

    with (
        _bypass_middleware(user),
        patch("app.api.v1.documents.DocumentRepository.get_owned", new=AsyncMock(return_value=doc)),
        patch("app.api.v1.documents.DocumentRepository.delete", new=AsyncMock()),
        patch("app.api.v1.documents.file_storage.delete") as mock_storage_delete,
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(f"/api/v1/documents/{doc.id}", headers=_auth_headers())

    assert resp.status_code == 200
    mock_storage_delete.assert_not_called()
