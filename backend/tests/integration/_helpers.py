"""
Shared setup for the integration tests: a real, DB-backed user the auth
middleware will accept, and cleanup.

These run against the local dev database (DATABASE_URL). Everything a
helper creates must be removed by the caller -- see cleanup_user.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date
from typing import Any
from unittest.mock import AsyncMock, patch

from app.database import AsyncSessionFactory
from app.middleware import clerk_auth as clerk_auth_module
from app.models.enums import Gender
from app.models.resume import Resume
from app.models.user import Profile, User
from sqlalchemy import delete

FAKE_JWKS: dict[str, Any] = {"keys": []}


def auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer valid_token"}


@contextmanager
def bypass_middleware(user: User) -> Iterator[None]:
    """
    Let the real ClerkJWTMiddleware run, mocking only its network/DB-lookup
    boundary (_resolve_user) so it resolves to the given real, DB-backed
    user without a real Clerk round-trip. Mirrors
    tests/unit/test_document_routes.py's _bypass_middleware.
    """
    claims = {"sub": user.clerk_id, "email": user.email, "exp": int(time.time()) + 3600}
    with (
        patch.object(clerk_auth_module, "_get_jwks", new=AsyncMock(return_value=FAKE_JWKS)),
        patch("app.middleware.clerk_auth._validate_token", new=AsyncMock(return_value=claims)),
        patch("app.middleware.clerk_auth._resolve_user", new=AsyncMock(return_value=user)),
    ):
        yield


async def seed_complete_profile_user(*, with_photo: bool) -> tuple[User, Resume, str | None]:
    """
    Insert a real User + Profile (complete enough to pass
    rirekisho_missing_fields()) + Resume, directly via the app's own
    session factory. Returns the persisted User, Resume, and the photo
    storage key (or None) -- returned directly rather than via
    user.profile.photo_storage_key, since the session (and the object's
    relationship-loading capability) closes at the end of this function;
    accessing an unloaded relationship on a detached async ORM object
    later would raise DetachedInstanceError.
    """
    unique = uuid.uuid4().hex
    photo_storage_key = f"photos/{unique}/photo.jpg" if with_photo else None
    async with AsyncSessionFactory() as session:
        user = User(
            clerk_id=f"clerk_e2e_test_{unique}",
            email=f"e2e-{unique}@example.com",
            full_name="山田 太郎",
            email_verified=True,
        )
        session.add(user)
        await session.flush()

        profile = Profile(
            user_id=user.id,
            name_kana="ヤマダ タロウ",
            date_of_birth=date(1990, 1, 15),
            gender=Gender.male,
            phone_number="090-1234-5678",
            mailing_address="東京都渋谷区1-2-3",
            photo_storage_key=photo_storage_key,
        )
        session.add(profile)

        resume = Resume(
            user_id=user.id,
            file_name="resume.pdf",
            file_url=f"resumes/{unique}/resume.pdf",
            file_size_bytes=12345,
            mime_type="application/pdf",
        )
        session.add(resume)

        await session.commit()
        await session.refresh(user)
        await session.refresh(resume)
        return user, resume, photo_storage_key


async def cleanup_user(user_id: uuid.UUID) -> None:
    """Deletes the User row -- cascades (ondelete=CASCADE) to Profile/Resume/GeneratedDocument."""
    async with AsyncSessionFactory() as session:
        await session.execute(delete(User).where(User.id == user_id))
        await session.commit()
