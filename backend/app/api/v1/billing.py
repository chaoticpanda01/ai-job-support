"""
Billing endpoints.

POST /billing/checkout          — create a Stripe Checkout session (returns redirect URL)
POST /billing/portal            — create a Stripe Customer Portal session (returns redirect URL)
POST /billing/webhook           — Stripe webhook handler (no auth — verified by signature)
GET  /billing/subscription      — current subscription status for the authenticated user
GET  /billing/events            — billing event history for the authenticated user
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, status

from app.config import settings
from app.dependencies import AuthUser, DbSession, PaginationDep
from app.models.enums import (
    BillingEventType,
    SubscriptionStatus,
    SubscriptionTier,
)
from app.repositories.billing import (
    BillingEventRepository,
    SubscriptionRepository,
)
from app.repositories.user import UserRepository
from app.schemas.billing import (
    BillingEventResponse,
    CheckoutRequest,
    CheckoutResponse,
    PortalResponse,
    SubscriptionResponse,
)
from app.services.stripe_client import StripeClientError, StripeWebhookError, stripe_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])

# Return URL for the Customer Portal — user lands back on the billing page
_PORTAL_RETURN_PATH = "/dashboard/billing"


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout_session(
    body: CheckoutRequest,
    current_user: AuthUser,
    db: DbSession,
) -> CheckoutResponse:
    """
    Create a Stripe Checkout session for the requested tier.
    Returns the URL to redirect the user to Stripe's hosted checkout page.
    """
    if body.tier == SubscriptionTier.free:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot checkout to the free tier.",
        )

    price_id = (
        settings.stripe_price_id_basic
        if body.tier == SubscriptionTier.basic
        else settings.stripe_price_id_pro
    )
    if not price_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Stripe price for {body.tier.value} tier is not configured.",
        )

    # Attach existing customer if the user already has a subscription record
    sub_repo = SubscriptionRepository(db)
    existing = await sub_repo.get_active_for_user(current_user.user_id)
    stripe_customer_id = existing.stripe_customer_id if existing else None

    try:
        result = stripe_client.create_checkout_session(
            customer_email=current_user.email,
            price_id=price_id,
            client_reference_id=str(current_user.user_id),
            stripe_customer_id=stripe_customer_id,
        )
    except StripeClientError as exc:
        logger.error("Checkout session creation failed for user %s: %s", current_user.user_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not create checkout session. Please try again.",
        ) from exc

    return CheckoutResponse(url=result.url)


# ---------------------------------------------------------------------------
# Customer Portal
# ---------------------------------------------------------------------------


@router.post("/portal", response_model=PortalResponse)
async def create_portal_session(
    request: Request,
    current_user: AuthUser,
    db: DbSession,
) -> PortalResponse:
    """
    Create a Stripe Customer Portal session so the user can manage their
    subscription, update payment methods, and view invoices.
    Requires an active subscription (and therefore a Stripe customer ID).
    """
    sub_repo = SubscriptionRepository(db)
    subscription = await sub_repo.get_active_for_user(current_user.user_id)
    if subscription is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active subscription found.",
        )

    return_url = str(request.base_url).rstrip("/") + _PORTAL_RETURN_PATH

    try:
        result = stripe_client.create_portal_session(
            stripe_customer_id=subscription.stripe_customer_id,
            return_url=return_url,
        )
    except StripeClientError as exc:
        logger.error("Portal session creation failed for user %s: %s", current_user.user_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not open billing portal. Please try again.",
        ) from exc

    return PortalResponse(url=result.url)


# ---------------------------------------------------------------------------
# Stripe webhook
# ---------------------------------------------------------------------------


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(request: Request, db: DbSession) -> dict:
    """
    Stripe webhook handler.

    Security: Stripe-Signature header is verified before any payload is trusted.
    Idempotency: stripe_event_id unique constraint prevents double-processing.

    Handled events:
      customer.subscription.created  — upsert subscription, log, send email
      customer.subscription.updated  — upsert subscription, log (upgrade/downgrade)
      customer.subscription.deleted  — cancel subscription, log, send email
      invoice.payment_failed         — log, send payment-failed email
    """
    payload = await request.body()
    stripe_sig = request.headers.get("stripe-signature", "")

    try:
        event = stripe_client.verify_webhook(payload, stripe_sig)
    except StripeWebhookError as exc:
        logger.warning("Stripe webhook rejected: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook signature.",
        ) from exc

    parsed = stripe_client.parse_subscription_event(event)
    if parsed is None:
        # Unhandled event type — acknowledge and ignore
        return {"detail": "ok"}

    # Idempotency check
    event_repo = BillingEventRepository(db)
    if await event_repo.exists_by_stripe_event_id(parsed.stripe_event_id):
        logger.info("Duplicate Stripe event %s — skipping.", parsed.stripe_event_id)
        return {"detail": "ok"}

    sub_repo = SubscriptionRepository(db)

    # Resolve user via existing subscription row
    existing_sub = await sub_repo.get_by_stripe_id(parsed.stripe_subscription_id)
    user_id: UUID | None = existing_sub.user_id if existing_sub else None

    # On first subscription creation, resolve user via client_reference_id
    # (set during checkout — contains our internal user UUID)
    if user_id is None and event.type == "customer.subscription.created":
        # Retrieve the checkout session that created this subscription
        try:
            import stripe as _stripe

            sessions = _stripe.checkout.Session.list(
                subscription=parsed.stripe_subscription_id, limit=1
            )
            if sessions.data:
                ref = sessions.data[0].client_reference_id
                if ref:
                    user_id = UUID(ref)
        except Exception as exc:
            logger.error("Could not resolve user from checkout session: %s", exc)

    if user_id is None:
        logger.error(
            "Cannot process Stripe event %s — no user found for subscription %s.",
            parsed.stripe_event_id,
            parsed.stripe_subscription_id,
        )
        return {"detail": "ok"}

    # Map Stripe status → our SubscriptionStatus enum
    status_map: dict[str, SubscriptionStatus] = {
        "active": SubscriptionStatus.active,
        "trialing": SubscriptionStatus.trialing,
        "past_due": SubscriptionStatus.past_due,
        "canceled": SubscriptionStatus.cancelled,
        "cancelled": SubscriptionStatus.cancelled,
    }
    sub_status = status_map.get(parsed.status, SubscriptionStatus.active)

    # Map price → tier
    tier_str = stripe_client.tier_for_price(parsed.price_id)
    tier = SubscriptionTier(tier_str)

    # Determine billing event type
    billing_event_type = _classify_event(
        stripe_event_type=parsed.event_type,
        existing_tier=existing_sub.tier if existing_sub else None,
        new_tier=tier,
    )

    # --- Persist subscription ---
    await sub_repo.upsert_from_stripe(
        user_id=user_id,
        stripe_subscription_id=parsed.stripe_subscription_id,
        stripe_customer_id=parsed.stripe_customer_id,
        tier=tier,
        status=sub_status,
        current_period_start=parsed.current_period_start,
        current_period_end=parsed.current_period_end,
    )

    # --- Persist billing event ---
    await event_repo.create(
        user_id=user_id,
        stripe_event_id=parsed.stripe_event_id,
        event_type=billing_event_type,
        tier_from=existing_sub.tier if existing_sub else None,
        tier_to=tier,
    )

    await db.flush()

    # --- Send transactional email (best-effort — never fail the webhook) ---
    user_repo = UserRepository(db)
    user = await user_repo.get(user_id)
    if user and user.email:
        from app.services.email_service import EmailServiceError, email_service

        first_name = (user.full_name or "").split()[0] if user.full_name else ""
        try:
            if billing_event_type == BillingEventType.subscribed:
                await email_service.send_subscription_started(
                    to=user.email,
                    first_name=first_name,
                    tier=tier.value,
                    user_id=user_id,
                    db=db,
                )
            elif billing_event_type == BillingEventType.cancelled:
                await email_service.send_subscription_cancelled(
                    to=user.email,
                    first_name=first_name,
                    user_id=user_id,
                    db=db,
                )
            elif billing_event_type == BillingEventType.payment_failed:
                await email_service.send_payment_failed(
                    to=user.email,
                    first_name=first_name,
                    user_id=user_id,
                    db=db,
                )
        except EmailServiceError as exc:
            logger.error("Email failed for billing event %s: %s", parsed.stripe_event_id, exc)

    return {"detail": "ok"}


# ---------------------------------------------------------------------------
# Read endpoints
# ---------------------------------------------------------------------------


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_subscription(
    current_user: AuthUser,
    db: DbSession,
) -> SubscriptionResponse:
    """Return the current user's active subscription, or 404 if on the free tier."""
    sub_repo = SubscriptionRepository(db)
    subscription = await sub_repo.get_active_for_user(current_user.user_id)
    if subscription is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active subscription. User is on the free tier.",
        )
    return SubscriptionResponse.model_validate(subscription)


@router.get("/events", response_model=list[BillingEventResponse])
async def list_billing_events(
    current_user: AuthUser,
    db: DbSession,
    pagination: PaginationDep,
) -> list[BillingEventResponse]:
    """Return the authenticated user's billing event history, newest first."""
    event_repo = BillingEventRepository(db)
    events = await event_repo.list_for_user(
        current_user.user_id,
        offset=pagination.offset,
        limit=pagination.limit,
    )
    return [BillingEventResponse.model_validate(e) for e in events]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _classify_event(
    stripe_event_type: str,
    existing_tier: SubscriptionTier | None,
    new_tier: SubscriptionTier,
) -> BillingEventType:
    if stripe_event_type == "invoice.payment_failed":
        return BillingEventType.payment_failed
    if stripe_event_type == "customer.subscription.deleted":
        return BillingEventType.cancelled
    if existing_tier is None:
        return BillingEventType.subscribed
    tier_order = {SubscriptionTier.free: 0, SubscriptionTier.basic: 1, SubscriptionTier.pro: 2}
    if tier_order.get(new_tier, 0) > tier_order.get(existing_tier, 0):
        return BillingEventType.upgraded
    if tier_order.get(new_tier, 0) < tier_order.get(existing_tier, 0):
        return BillingEventType.downgraded
    return BillingEventType.renewed
