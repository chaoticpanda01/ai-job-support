"""
Unit tests for visa consultation endpoints.

All external I/O (DB, Gemini) is mocked so these run without a live
database or API key.
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
from app.services.ai.client import AIError
from app.services.ai.usage_tracker import AIBudgetError
from httpx import ASGITransport, AsyncClient

from tests.conftest import make_profile, make_user

_FAKE_JWKS: dict[str, Any] = {"keys": []}


def _auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer valid_token"}


@contextmanager
def _bypass_middleware(user: Any) -> Iterator[None]:
    """Let the real ClerkJWTMiddleware run, mocking its I/O boundaries."""
    claims = {"sub": user.clerk_id, "email": user.email, "exp": int(time.time()) + 3600}
    with (
        patch.object(clerk_auth_module, "_get_jwks", new=AsyncMock(return_value=_FAKE_JWKS)),
        patch("app.middleware.clerk_auth.jwt.decode", return_value=claims),
        patch("app.middleware.clerk_auth._resolve_user", new=AsyncMock(return_value=user)),
    ):
        yield


@contextmanager
def _fake_db_session() -> Iterator[MagicMock]:
    """Override get_db with a mock session (create_consultation calls db.flush() directly)."""
    session = MagicMock()
    session.flush = AsyncMock()

    async def _fake_get_db() -> Any:
        yield session

    app.dependency_overrides[get_db] = _fake_get_db
    try:
        yield session
    finally:
        app.dependency_overrides.pop(get_db, None)


def _mock_profile_for_snapshot() -> MagicMock:
    """
    _profile_snapshot() (app/api/v1/visa.py) accesses .japanese_level.value,
    .visa_status.value, .preferred_language.value — real enum instances, not
    the plain strings the shared make_profile() test helper uses.
    """
    from app.models.enums import JapaneseLevel, PreferredLanguage, VisaStatus

    profile = make_profile()
    profile.japanese_level = JapaneseLevel.N3
    profile.visa_status = VisaStatus.none
    profile.preferred_language = PreferredLanguage.id
    profile.target_role = ["Backend Engineer"]
    profile.target_industry = ["IT"]
    return profile


def _mock_consultation(*, user_id: uuid.UUID | None = None) -> MagicMock:
    consultation = MagicMock()
    consultation.id = uuid.uuid4()
    consultation.user_id = user_id or uuid.uuid4()
    consultation.visa_type = "技術・人文知識・国際業務"
    consultation.ai_guidance = "Visa ini cocok untuk Anda."
    consultation.checklist = {"phases": []}
    consultation.profile_snapshot = {"nationality": "Indonesian"}
    consultation.created_at = datetime.now(tz=UTC)
    consultation.updated_at = datetime.now(tz=UTC)
    return consultation


def _valid_ai_response() -> tuple[str, int, int]:
    import json

    payload = {
        "visa_type": "技術・人文知識・国際業務",
        "ai_guidance": "Visa ini cocok untuk Anda karena latar belakang Anda.",
        "checklist": {"phases": []},
    }
    return json.dumps(payload), 100, 50


# ---------------------------------------------------------------------------
# POST /visa/consultations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_consultation_happy_path() -> None:
    user = make_user()
    profile = _mock_profile_for_snapshot()
    consultation = _mock_consultation(user_id=user.id)

    with (
        _bypass_middleware(user),
        _fake_db_session(),
        patch(
            "app.api.v1.visa.ProfileRepository.get_by_user_id",
            new=AsyncMock(return_value=profile),
        ),
        patch("app.services.ai.usage_tracker.usage_tracker.check_budget", new=AsyncMock()),
        patch("app.services.ai.usage_tracker.usage_tracker.record", new=AsyncMock()),
        patch(
            "app.services.ai.client.ai_client.generate",
            new=AsyncMock(return_value=_valid_ai_response()),
        ),
        patch(
            "app.api.v1.visa.VisaConsultationRepository.create",
            new=AsyncMock(return_value=consultation),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/visa/consultations", headers=_auth_headers())

    assert resp.status_code == 201
    assert resp.json()["visa_type"] == "技術・人文知識・国際業務"


@pytest.mark.asyncio
async def test_create_consultation_no_profile_returns_422() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.visa.ProfileRepository.get_by_user_id",
            new=AsyncMock(return_value=None),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/visa/consultations", headers=_auth_headers())

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_consultation_budget_exceeded_returns_429() -> None:
    user = make_user()
    profile = _mock_profile_for_snapshot()

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.visa.ProfileRepository.get_by_user_id",
            new=AsyncMock(return_value=profile),
        ),
        patch(
            "app.services.ai.usage_tracker.usage_tracker.check_budget",
            new=AsyncMock(side_effect=AIBudgetError(used=5, limit=5)),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/visa/consultations", headers=_auth_headers())

    assert resp.status_code == 429


@pytest.mark.asyncio
async def test_create_consultation_ai_error_returns_502() -> None:
    user = make_user()
    profile = _mock_profile_for_snapshot()

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.visa.ProfileRepository.get_by_user_id",
            new=AsyncMock(return_value=profile),
        ),
        patch("app.services.ai.usage_tracker.usage_tracker.check_budget", new=AsyncMock()),
        patch(
            "app.services.ai.client.ai_client.generate",
            new=AsyncMock(side_effect=AIError("Gemini unavailable")),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/visa/consultations", headers=_auth_headers())

    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_create_consultation_invalid_json_returns_502() -> None:
    user = make_user()
    profile = _mock_profile_for_snapshot()

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.visa.ProfileRepository.get_by_user_id",
            new=AsyncMock(return_value=profile),
        ),
        patch("app.services.ai.usage_tracker.usage_tracker.check_budget", new=AsyncMock()),
        patch(
            "app.services.ai.client.ai_client.generate",
            new=AsyncMock(return_value=("not valid json", 10, 5)),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/visa/consultations", headers=_auth_headers())

    assert resp.status_code == 502


# ---------------------------------------------------------------------------
# GET /visa/consultations/latest
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_latest_consultation_found() -> None:
    user = make_user()
    consultation = _mock_consultation(user_id=user.id)

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.visa.VisaConsultationRepository.get_latest_for_user",
            new=AsyncMock(return_value=consultation),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/visa/consultations/latest", headers=_auth_headers())

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_latest_consultation_none_returns_404() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.visa.VisaConsultationRepository.get_latest_for_user",
            new=AsyncMock(return_value=None),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/visa/consultations/latest", headers=_auth_headers())

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /visa/consultations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_consultations_returns_items() -> None:
    user = make_user()
    consultations = [_mock_consultation(user_id=user.id), _mock_consultation(user_id=user.id)]

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.visa.VisaConsultationRepository.list_by_user",
            new=AsyncMock(return_value=consultations),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/visa/consultations", headers=_auth_headers())

    assert resp.status_code == 200
    assert len(resp.json()) == 2


# ---------------------------------------------------------------------------
# GET /visa/consultations/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_consultation_found() -> None:
    user = make_user()
    consultation = _mock_consultation(user_id=user.id)

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.visa.VisaConsultationRepository.get_owned",
            new=AsyncMock(return_value=consultation),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                f"/api/v1/visa/consultations/{consultation.id}", headers=_auth_headers()
            )

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_consultation_not_found_returns_404() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.visa.VisaConsultationRepository.get_owned",
            new=AsyncMock(return_value=None),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                f"/api/v1/visa/consultations/{uuid.uuid4()}", headers=_auth_headers()
            )

    assert resp.status_code == 404
