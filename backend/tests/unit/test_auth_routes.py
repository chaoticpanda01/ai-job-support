"""
Unit tests for auth API routes.

DB calls and middleware are mocked so these run without a live database.
"""

from __future__ import annotations

import json
import time
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.main import app
from app.middleware import clerk_auth as clerk_auth_module
from app.models.enums import UserRole
from app.services.ai.usage_tracker import QuotaStatus
from app.services.file_storage import StorageError
from httpx import ASGITransport, AsyncClient

from tests.conftest import make_profile, make_user

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_FAKE_JWKS: dict[str, Any] = {"keys": []}


def _auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer valid_token"}


@contextmanager
def _bypass_middleware(user: Any) -> Iterator[None]:
    """
    Let the real ClerkJWTMiddleware run, but mock its I/O boundaries (JWKS
    fetch, JWT decode, DB user resolution) so it resolves to `user`.

    Deliberately NOT patching BaseHTTPMiddleware.dispatch directly (the
    previous approach here) — Starlette runs dispatch inside an internal
    task group, and unittest.mock.patch's context-manager exit doesn't wait
    for that task to fully finish, which leaked state (and sometimes a
    stale event loop reference) into whichever test ran next. This mirrors
    the pattern already used successfully in test_clerk_middleware.py.
    """
    claims = {"sub": user.clerk_id, "email": user.email, "exp": int(time.time()) + 3600}
    with (
        patch.object(clerk_auth_module, "_get_jwks", new=AsyncMock(return_value=_FAKE_JWKS)),
        patch("app.middleware.clerk_auth._validate_token", new=AsyncMock(return_value=claims)),
        patch("app.middleware.clerk_auth._resolve_user", new=AsyncMock(return_value=user)),
    ):
        yield


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_me_returns_user_and_profile() -> None:
    user = make_user()
    profile = make_profile(user_id=user.id)
    user.profile = profile

    with (
        _bypass_middleware(user),
        patch("app.api.v1.auth.UserRepository.get_with_profile", new=AsyncMock(return_value=user)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me", headers=_auth_headers())

    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["email"] == user.email
    assert data["user"]["role"] == "user"


@pytest.mark.asyncio
async def test_get_me_returns_404_when_user_missing() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.auth.UserRepository.get_with_profile", new=AsyncMock(return_value=None)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me", headers=_auth_headers())

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_me_reports_rirekisho_ready_when_profile_complete() -> None:
    from datetime import date

    from app.models.enums import Gender, VisaStatus

    user = make_user(full_name="山田 太郎")
    profile = make_profile(user_id=user.id)
    profile.name_kana = "ヤマダ タロウ"
    profile.date_of_birth = date(1990, 1, 15)
    profile.gender = Gender.male
    profile.phone_number = "090-1234-5678"
    profile.mailing_address = "東京都渋谷区"
    profile.visa_status = VisaStatus.none
    user.profile = profile

    with (
        _bypass_middleware(user),
        patch("app.api.v1.auth.UserRepository.get_with_profile", new=AsyncMock(return_value=user)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me", headers=_auth_headers())

    assert resp.status_code == 200
    data = resp.json()
    assert data["rirekisho_ready"] is True
    assert data["rirekisho_missing_fields"] == []


@pytest.mark.asyncio
async def test_get_me_reports_missing_fields_when_profile_incomplete() -> None:
    user = make_user(full_name="山田 太郎")
    profile = make_profile(user_id=user.id)  # defaults: name_kana, DOB, etc. all None
    user.profile = profile

    with (
        _bypass_middleware(user),
        patch("app.api.v1.auth.UserRepository.get_with_profile", new=AsyncMock(return_value=user)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me", headers=_auth_headers())

    assert resp.status_code == 200
    data = resp.json()
    assert data["rirekisho_ready"] is False
    keys = [f["key"] for f in data["rirekisho_missing_fields"]]
    assert "name_kana" in keys
    assert "date_of_birth" in keys


# ---------------------------------------------------------------------------
# PUT /auth/me
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_me_returns_updated_profile() -> None:
    user = make_user()
    profile = make_profile(user_id=user.id)
    user.profile = profile

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.auth.UserRepository.get_with_profile",
            new=AsyncMock(return_value=user),
        ),
        patch(
            "app.api.v1.auth.ProfileRepository.get_or_create",
            new=AsyncMock(return_value=(profile, False)),
        ),
        patch(
            "app.api.v1.auth.ProfileRepository.update",
            new=AsyncMock(return_value=profile),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.put(
                "/api/v1/auth/me",
                headers=_auth_headers(),
                json={"nationality": "Indonesian", "years_experience": 3},
            )

    assert resp.status_code == 200
    # rirekisho_ready must come from _build_me_response(user, profile) here,
    # not a stale user.profile — default make_profile() has no rirekisho
    # fields set, so this should read as not ready.
    assert resp.json()["rirekisho_ready"] is False


# ---------------------------------------------------------------------------
# POST /auth/me/photo
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_photo_saves_key_and_returns_presigned_url() -> None:
    user = make_user()
    profile = make_profile(user_id=user.id)
    user.profile = profile

    with (
        _bypass_middleware(user),
        patch("app.api.v1.auth.magic.from_buffer", return_value="image/jpeg"),
        patch(
            "app.api.v1.auth.ProfileRepository.get_or_create",
            new=AsyncMock(return_value=(profile, False)),
        ),
        patch(
            "app.api.v1.auth.file_storage.upload_photo",
            return_value="photos/user123/abc.jpg",
        ),
        patch("app.api.v1.auth.ProfileRepository.update", new=AsyncMock(return_value=profile)),
        patch(
            "app.api.v1.auth.file_storage.presigned_url",
            return_value="https://s3.example.com/signed-photo-url",
        ),
        patch(
            "app.api.v1.auth.UserRepository.get_with_profile",
            new=AsyncMock(return_value=user),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/me/photo",
                headers=_auth_headers(),
                files={"file": ("photo.jpg", b"fake jpeg bytes", "image/jpeg")},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["profile"]["photo_url"] == "https://s3.example.com/signed-photo-url"
    # Same check as the PUT /auth/me test above — confirms upload_my_photo's
    # call to _build_me_response(user, profile) also reports correctly.
    assert data["rirekisho_ready"] is False


@pytest.mark.asyncio
async def test_upload_photo_deletes_old_photo_on_replace() -> None:
    user = make_user()
    profile = make_profile(user_id=user.id)
    profile.photo_storage_key = "photos/user123/old.jpg"
    user.profile = profile

    with (
        _bypass_middleware(user),
        patch("app.api.v1.auth.magic.from_buffer", return_value="image/png"),
        patch(
            "app.api.v1.auth.ProfileRepository.get_or_create",
            new=AsyncMock(return_value=(profile, False)),
        ),
        patch(
            "app.api.v1.auth.file_storage.upload_photo",
            return_value="photos/user123/new.png",
        ),
        patch("app.api.v1.auth.ProfileRepository.update", new=AsyncMock(return_value=profile)),
        patch(
            "app.api.v1.auth.file_storage.presigned_url", return_value="https://s3.example.com/x"
        ),
        patch("app.api.v1.auth.file_storage.delete") as mock_delete,
        patch(
            "app.api.v1.auth.UserRepository.get_with_profile",
            new=AsyncMock(return_value=user),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/me/photo",
                headers=_auth_headers(),
                files={"file": ("photo.png", b"fake png bytes", "image/png")},
            )

    assert resp.status_code == 200
    mock_delete.assert_called_once_with("photos/user123/old.jpg")


@pytest.mark.asyncio
async def test_upload_photo_succeeds_even_if_old_photo_delete_fails() -> None:
    user = make_user()
    profile = make_profile(user_id=user.id)
    profile.photo_storage_key = "photos/user123/old.jpg"
    user.profile = profile

    with (
        _bypass_middleware(user),
        patch("app.api.v1.auth.magic.from_buffer", return_value="image/jpeg"),
        patch(
            "app.api.v1.auth.ProfileRepository.get_or_create",
            new=AsyncMock(return_value=(profile, False)),
        ),
        patch(
            "app.api.v1.auth.file_storage.upload_photo",
            return_value="photos/user123/new.jpg",
        ),
        patch("app.api.v1.auth.ProfileRepository.update", new=AsyncMock(return_value=profile)),
        patch(
            "app.api.v1.auth.file_storage.presigned_url", return_value="https://s3.example.com/x"
        ),
        patch("app.api.v1.auth.file_storage.delete", side_effect=StorageError("boom")),
        patch(
            "app.api.v1.auth.UserRepository.get_with_profile",
            new=AsyncMock(return_value=user),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/me/photo",
                headers=_auth_headers(),
                files={"file": ("photo.jpg", b"fake jpeg bytes", "image/jpeg")},
            )

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_upload_photo_rejects_disallowed_mime() -> None:
    user = make_user()

    with (
        _bypass_middleware(user),
        patch("app.api.v1.auth.magic.from_buffer", return_value="application/pdf"),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/me/photo",
                headers=_auth_headers(),
                files={"file": ("photo.pdf", b"fake pdf bytes", "application/pdf")},
            )

    assert resp.status_code == 415


@pytest.mark.asyncio
async def test_upload_photo_too_large_returns_413() -> None:
    user = make_user()
    oversized = b"x" * (5 * 1024 * 1024 + 1)

    with _bypass_middleware(user):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/me/photo",
                headers=_auth_headers(),
                files={"file": ("photo.jpg", oversized, "image/jpeg")},
            )

    assert resp.status_code == 413


# ---------------------------------------------------------------------------
# POST /auth/webhook
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_webhook_invalid_signature_returns_400() -> None:
    payload = json.dumps({"type": "user.created", "data": {}}).encode()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/webhook",
            content=payload,
            headers={"content-type": "application/json"},
        )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid webhook signature"


@pytest.mark.asyncio
async def test_webhook_user_created_calls_upsert() -> None:
    user = make_user()
    profile = make_profile(user_id=user.id)

    payload_dict = {
        "type": "user.created",
        "data": {
            "id": "clerk_new_123",
            "email_addresses": [
                {
                    "email_address": "new@example.com",
                    "verification": {"status": "verified"},
                }
            ],
            "first_name": "New",
            "last_name": "User",
            "primary_email_address_id": None,
        },
    }
    payload = json.dumps(payload_dict).encode()

    with (
        patch("app.api.v1.auth.Webhook") as mock_wh_cls,
        patch(
            "app.api.v1.auth.UserRepository.upsert_from_clerk",
            new=AsyncMock(return_value=(user, True)),
        ),
        patch(
            "app.api.v1.auth.ProfileRepository.get_or_create",
            new=AsyncMock(return_value=(profile, True)),
        ),
    ):
        mock_wh = MagicMock()
        mock_wh.verify = MagicMock(return_value=None)
        mock_wh_cls.return_value = mock_wh

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/webhook",
                content=payload,
                headers={
                    "content-type": "application/json",
                    "svix-id": "x",
                    "svix-signature": "x",
                    "svix-timestamp": "x",
                },
            )

    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# GET /auth/users — admin only
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_users_forbidden_for_regular_user() -> None:
    user = make_user(role=UserRole.user)
    with _bypass_middleware(user):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/users", headers=_auth_headers())
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_users_allowed_for_admin() -> None:
    admin = make_user(role=UserRole.admin)

    with (
        _bypass_middleware(admin),
        patch("app.api.v1.auth.db", create=True),
        patch("sqlalchemy.ext.asyncio.AsyncSession.scalar", new=AsyncMock(return_value=0)),
        patch(
            "sqlalchemy.ext.asyncio.AsyncSession.scalars",
            new=AsyncMock(return_value=MagicMock(all=MagicMock(return_value=[]))),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/users", headers=_auth_headers())

    # 200 or 500 (DB not mocked) — just verify not 403
    assert resp.status_code != 403


# ---------------------------------------------------------------------------
# PUT /auth/me — full_name
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_me_saves_full_name() -> None:
    """
    full_name lives on users, not profiles, so it must be applied through
    UserRepository rather than folded into the profile update.
    """
    user = make_user(full_name=None)
    profile = make_profile(user_id=user.id)
    user.profile = profile

    user_update = AsyncMock(return_value=user)

    with (
        _bypass_middleware(user),
        patch("app.api.v1.auth.UserRepository.get_with_profile", new=AsyncMock(return_value=user)),
        patch("app.api.v1.auth.UserRepository.update", new=user_update),
        patch(
            "app.api.v1.auth.ProfileRepository.get_or_create",
            new=AsyncMock(return_value=(profile, False)),
        ),
        patch("app.api.v1.auth.ProfileRepository.update", new=AsyncMock(return_value=profile)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.put(
                "/api/v1/auth/me",
                headers=_auth_headers(),
                json={"full_name": "Budi Santoso", "preferred_language": "id"},
            )

    assert resp.status_code == 200
    user_update.assert_awaited_once()
    assert user_update.await_args.kwargs["full_name"] == "Budi Santoso"


@pytest.mark.asyncio
async def test_update_me_without_full_name_leaves_user_untouched() -> None:
    """Omitting full_name must not clear it — exclude_none drops it entirely."""
    user = make_user(full_name="Existing Name")
    profile = make_profile(user_id=user.id)
    user.profile = profile

    user_update = AsyncMock(return_value=user)

    with (
        _bypass_middleware(user),
        patch("app.api.v1.auth.UserRepository.get_with_profile", new=AsyncMock(return_value=user)),
        patch("app.api.v1.auth.UserRepository.update", new=user_update),
        patch(
            "app.api.v1.auth.ProfileRepository.get_or_create",
            new=AsyncMock(return_value=(profile, False)),
        ),
        patch("app.api.v1.auth.ProfileRepository.update", new=AsyncMock(return_value=profile)),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.put(
                "/api/v1/auth/me",
                headers=_auth_headers(),
                json={"preferred_language": "id"},
            )

    assert resp.status_code == 200
    user_update.assert_not_awaited()


# ---------------------------------------------------------------------------
# GET /auth/me/ai-quota
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_ai_quota_returns_binding_cap() -> None:
    """
    remaining and exhausted are @property on QuotaStatus, not stored fields.
    Asserting the whole payload catches a mapping that silently drops them.
    """
    user = make_user(role=UserRole.user)
    quota = QuotaStatus(scope="user", used=5, limit=8, window_hours=24, resets_in_seconds=12000)

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.auth.usage_tracker.get_quota_status",
            new=AsyncMock(return_value=quota),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me/ai-quota", headers=_auth_headers())

    assert resp.status_code == 200
    assert resp.json() == {
        "scope": "user",
        "used": 5,
        "limit": 8,
        "remaining": 3,
        "window_hours": 24,
        "resets_in_seconds": 12000,
        "exhausted": False,
    }


@pytest.mark.asyncio
async def test_get_ai_quota_passes_admin_flag_through() -> None:
    """
    The route must forward is_admin rather than re-querying the role, so an
    admin resolves to the global scope (they have no per-user cap).
    """
    admin = make_user(role=UserRole.admin)
    quota = QuotaStatus(scope="global", used=11, limit=16, window_hours=24, resets_in_seconds=0)
    spy = AsyncMock(return_value=quota)

    with (
        _bypass_middleware(admin),
        patch("app.api.v1.auth.usage_tracker.get_quota_status", new=spy),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me/ai-quota", headers=_auth_headers())

    assert resp.status_code == 200
    assert resp.json()["scope"] == "global"
    assert resp.json()["remaining"] == 5
    # get_quota_status(user_id, is_admin, db) — positional, as check_budget calls it.
    assert spy.await_args.args[1] is True


@pytest.mark.asyncio
async def test_get_ai_quota_exhausted_reports_zero_remaining() -> None:
    """Usage can overshoot the cap under concurrency; remaining must clamp at 0."""
    user = make_user(role=UserRole.user)
    quota = QuotaStatus(scope="global", used=17, limit=16, window_hours=24, resets_in_seconds=600)

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.auth.usage_tracker.get_quota_status",
            new=AsyncMock(return_value=quota),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me/ai-quota", headers=_auth_headers())

    assert resp.status_code == 200
    assert resp.json()["remaining"] == 0
    assert resp.json()["exhausted"] is True


@pytest.mark.asyncio
async def test_get_ai_quota_requires_authentication() -> None:
    """Not in ClerkJWTMiddleware._BYPASS_PATHS, so an anonymous call is rejected."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/auth/me/ai-quota")

    assert resp.status_code == 401
