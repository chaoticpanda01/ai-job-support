"""
Authentication routes.

POST /auth/webhook  — Clerk webhook: create/update user on Clerk events
GET  /auth/me       — return authenticated user + profile
PUT  /auth/me       — update profile fields
GET  /auth/users    — list all users (admin only)
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import func, select
from svix.webhooks import Webhook, WebhookVerificationError

from app.config import settings
from app.dependencies import AdminUser, AuthUser, DbSession, PaginationDep
from app.models.user import User
from app.repositories.user import ProfileRepository, UserRepository
from app.schemas.user import (
    ClerkWebhookEvent,
    ClerkWebhookUserData,
    MeResponse,
    ProfileUpdateRequest,
    UserListResponse,
    UserResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Clerk webhook
# ---------------------------------------------------------------------------


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def clerk_webhook(request: Request, db: DbSession) -> dict[str, Any]:
    """
    Receives Clerk user lifecycle events and keeps the local users table
    in sync. Verifies the Svix signature before processing.

    Handled events:
      user.created — upsert user row + create profile
      user.updated — sync email, name, email_verified
      user.deleted — deactivate user (soft delete)
    """
    payload = await request.body()
    headers = dict(request.headers)

    # Fail closed with an actionable error if the webhook secret is unset —
    # otherwise Webhook("") raises a bare RuntimeError surfaced as an opaque 500.
    if not settings.clerk_webhook_secret:
        logger.error(
            "Clerk webhook received but CLERK_WEBHOOK_SECRET is not configured — "
            "set it (Clerk dashboard → Webhooks → Signing Secret) to enable user sync."
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook processing is not configured.",
        )

    # Verify Svix signature
    try:
        wh = Webhook(settings.clerk_webhook_secret)
        wh.verify(payload, headers)
    except WebhookVerificationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook signature",
        ) from exc

    event = ClerkWebhookEvent.model_validate_json(payload)
    data = event.data

    user_repo = UserRepository(db)
    profile_repo = ProfileRepository(db)

    # Resolve primary email
    primary_email = _extract_primary_email(data)
    if not primary_email and event.type != "user.deleted":
        logger.warning("Clerk webhook %s: no email found for clerk_id=%s", event.type, data.id)
        return {"detail": "ok"}

    full_name = _build_full_name(data.first_name, data.last_name)
    email_verified = _is_email_verified(data)

    if event.type in ("user.created", "user.updated"):
        user, created = await user_repo.upsert_from_clerk(
            clerk_id=data.id,
            email=primary_email or "",
            full_name=full_name,
            email_verified=email_verified,
        )
        if created:
            await profile_repo.get_or_create(user.id)
            logger.info("Created user id=%s clerk_id=%s", user.id, data.id)
        else:
            logger.info("Updated user id=%s clerk_id=%s", user.id, data.id)

    elif event.type == "user.deleted":
        deleted_user = await user_repo.get_by_clerk_id(data.id)
        if deleted_user is not None:
            await user_repo.update(deleted_user, is_active=False)
            logger.info("Deactivated user id=%s clerk_id=%s", deleted_user.id, data.id)

    return {"detail": "ok"}


# ---------------------------------------------------------------------------
# /me
# ---------------------------------------------------------------------------


@router.get("/me", response_model=MeResponse)
async def get_me(current_user: AuthUser, db: DbSession) -> MeResponse:
    """Return the authenticated user with their profile."""
    user_repo = UserRepository(db)
    user = await user_repo.get_with_profile(current_user.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return MeResponse(
        user=UserResponse.model_validate(user),
        profile=user.profile,
    )


@router.put("/me", response_model=MeResponse)
async def update_me(
    body: ProfileUpdateRequest,
    current_user: AuthUser,
    db: DbSession,
) -> MeResponse:
    """Update the current user's profile."""
    user_repo = UserRepository(db)
    profile_repo = ProfileRepository(db)

    user = await user_repo.get_with_profile(current_user.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    profile, _ = await profile_repo.get_or_create(current_user.user_id)

    update_data = body.model_dump(exclude_none=True)

    # full_name lives on users, not profiles — apply it before the profile
    # fields. exclude_none means an omitted full_name is absent here, so this
    # can set the name but never clear it.
    full_name = update_data.pop("full_name", None)
    if full_name is not None:
        user = await user_repo.update(user, full_name=full_name)

    if update_data:
        # onboarding_step can only advance, never go backward
        if "onboarding_step" in update_data:
            profile = (
                await profile_repo.advance_onboarding_step(
                    current_user.user_id, update_data.pop("onboarding_step")
                )
                or profile
            )
        if update_data:
            profile = await profile_repo.update(profile, **update_data)

    # Re-fetch to get the refreshed user with updated profile
    user = await user_repo.get_with_profile(current_user.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return MeResponse(
        user=UserResponse.model_validate(user),
        profile=profile,
    )


# ---------------------------------------------------------------------------
# Consent
# ---------------------------------------------------------------------------


@router.post("/consent", response_model=MeResponse)
async def record_consent(current_user: AuthUser, db: DbSession) -> MeResponse:
    """
    Record that the user has explicitly consented to AI processing of their
    data (Section 8.4). Stamps consent_given_at with the current UTC time.

    Idempotent — calling again when already consented is a no-op.
    Must be called before any AI feature will process the user's resume.
    """
    user_repo = UserRepository(db)
    profile_repo = ProfileRepository(db)

    await profile_repo.record_consent(current_user.user_id)
    await db.commit()

    user = await user_repo.get_with_profile(current_user.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return MeResponse(
        user=UserResponse.model_validate(user),
        profile=user.profile,
    )


# ---------------------------------------------------------------------------
# Admin — user listing
# ---------------------------------------------------------------------------


@router.get("/users", response_model=UserListResponse)
async def list_users(
    _admin: AdminUser,
    db: DbSession,
    pagination: PaginationDep,
) -> UserListResponse:
    """List all users. Admin only."""
    total_result = await db.scalar(select(func.count()).select_from(User))
    total = total_result or 0

    result = await db.scalars(
        select(User)
        .order_by(User.created_at.desc())
        .offset(pagination.offset)
        .limit(pagination.limit)
    )
    users = list(result.all())

    return UserListResponse(
        items=[UserResponse.model_validate(u) for u in users],
        total=total,
        offset=pagination.offset,
        limit=pagination.limit,
    )


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: UUID,
    _admin: AdminUser,
    db: DbSession,
) -> UserResponse:
    """Get a specific user by ID. Admin only."""
    user_repo = UserRepository(db)
    user = await user_repo.get_with_profile(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserResponse.model_validate(user)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _extract_primary_email(data: ClerkWebhookUserData) -> str | None:
    if not data.email_addresses:
        return None
    return data.email_addresses[0].email_address


def _is_email_verified(data: ClerkWebhookUserData) -> bool:
    if not data.email_addresses:
        return False
    addr = data.email_addresses[0]
    if addr.verification is None:
        return False
    return addr.verification.get("status") == "verified"


def _build_full_name(first: str | None, last: str | None) -> str | None:
    parts = [p for p in (first, last) if p]
    return " ".join(parts) if parts else None
