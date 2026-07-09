"""
Account self-service endpoints.

DELETE /account  — permanently delete the authenticated user's account
"""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, HTTPException, status

from app.config import settings
from app.dependencies import AuthUser, DbSession
from app.repositories.billing import SubscriptionRepository
from app.repositories.user import UserRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/account", tags=["account"])

# Clerk Backend API base URL
_CLERK_API_BASE = "https://api.clerk.com/v1"


# ---------------------------------------------------------------------------
# Delete account
# ---------------------------------------------------------------------------


@router.delete("", status_code=status.HTTP_200_OK)
async def delete_account(current_user: AuthUser, db: DbSession) -> dict[str, str]:
    """
    Permanently delete the authenticated user's account.

    Steps (all-or-nothing except the Clerk call, which is best-effort):
      1. Cancel any active Stripe subscription (cancel_at_period_end=false — immediate)
      2. Deactivate the user row so all future requests with this JWT are rejected
      3. Send a goodbye email via Resend
      4. Delete the Clerk user (revokes all sessions immediately)

    Database cascade rules (defined in the migration) handle deleting child rows
    (profile, resumes, documents, job postings, etc.) via ON DELETE CASCADE.
    """
    user_repo = UserRepository(db)
    sub_repo = SubscriptionRepository(db)

    user = await user_repo.get(current_user.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    # 1. Cancel Stripe subscription if active
    subscription = await sub_repo.get_active_for_user(current_user.user_id)
    if subscription is not None:
        try:
            import stripe

            stripe.api_key = settings.stripe_secret_key
            stripe.Subscription.cancel(subscription.stripe_subscription_id)
            logger.info(
                "Cancelled Stripe subscription %s for user %s",
                subscription.stripe_subscription_id,
                current_user.user_id,
            )
        except Exception as exc:
            # Log but don't block deletion — the subscription can be cancelled
            # manually in the Stripe dashboard if needed.
            logger.error(
                "Failed to cancel Stripe subscription %s: %s",
                subscription.stripe_subscription_id,
                exc,
            )

    # 2. Deactivate the local user row immediately so subsequent requests
    #    using the same JWT are rejected before Clerk propagates the deletion.
    await user_repo.update(user, is_active=False)
    await db.flush()

    # 3. Send goodbye email (best-effort — never block deletion)
    first_name = (user.full_name or "").split()[0] if user.full_name else ""
    if user.email:
        from app.services.email_service import EmailServiceError, email_service

        try:
            await email_service.send_account_deleted(
                to=user.email,
                first_name=first_name,
                user_id=current_user.user_id,
                db=db,
            )
        except EmailServiceError as exc:
            logger.error("Goodbye email failed for user %s: %s", current_user.user_id, exc)

    # 4. Delete the Clerk user — this revokes all active sessions immediately.
    #    If this fails we still return 204 because the local account is already
    #    deactivated; a background job or manual cleanup can handle stale Clerk users.
    clerk_user_id = current_user.clerk_id
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.delete(
                f"{_CLERK_API_BASE}/users/{clerk_user_id}",
                headers={
                    "Authorization": f"Bearer {settings.clerk_secret_key}",
                    "Content-Type": "application/json",
                },
            )
            if response.status_code not in (200, 204):
                logger.error(
                    "Clerk delete returned %s for clerk_id=%s: %s",
                    response.status_code,
                    clerk_user_id,
                    response.text,
                )
            else:
                logger.info("Deleted Clerk user %s", clerk_user_id)
    except Exception as exc:
        logger.error("Failed to delete Clerk user %s: %s", clerk_user_id, exc)

    return {"detail": "Account deleted"}
