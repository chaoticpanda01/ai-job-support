"""
Stripe client — single access point for all Stripe API calls.

Rules enforced here:
  - Only this file imports `stripe`. All other code calls StripeClient.
  - Webhook signature verification happens here before any payload is trusted.
  - Checkout sessions and customer portal sessions are created with the URLs
    from settings, so callers never hard-code redirect targets.
  - StripeError is re-raised as StripeClientError so callers don't depend on
    the stripe package's exception hierarchy.

Usage:
    from app.services.stripe_client import stripe_client, StripeClientError
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime

import stripe
from stripe import InvalidRequestError, SignatureVerificationError, StripeError

from app.config import settings

logger = logging.getLogger(__name__)


class StripeClientError(Exception):
    """Raised when a Stripe API call fails after retries."""


class StripeWebhookError(Exception):
    """Raised when webhook signature verification fails."""


# ---------------------------------------------------------------------------
# Data transfer objects — avoid leaking stripe SDK types into callers
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CheckoutSessionResult:
    session_id: str
    url: str


@dataclass(frozen=True)
class PortalSessionResult:
    url: str


@dataclass(frozen=True)
class ParsedSubscriptionEvent:
    """Normalised data extracted from a subscription-related Stripe event."""

    stripe_event_id: str
    event_type: str  # raw Stripe event type string
    stripe_subscription_id: str
    stripe_customer_id: str
    price_id: str  # determines tier
    status: str  # Stripe subscription status string
    current_period_start: datetime
    current_period_end: datetime
    cancelled_at: datetime | None


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------


class StripeClient:
    """Thin async-friendly wrapper around the Stripe SDK (which is sync)."""

    def __init__(self) -> None:
        stripe.api_key = settings.stripe_secret_key
        # stripe SDK is thread-safe; no per-request instance needed
        self._price_to_tier: dict[str, str] = {}
        if settings.stripe_price_id_basic:
            self._price_to_tier[settings.stripe_price_id_basic] = "basic"
        if settings.stripe_price_id_pro:
            self._price_to_tier[settings.stripe_price_id_pro] = "pro"

    # ------------------------------------------------------------------
    # Checkout
    # ------------------------------------------------------------------

    def create_checkout_session(
        self,
        customer_email: str,
        price_id: str,
        client_reference_id: str,  # our internal user UUID
        stripe_customer_id: str | None = None,
    ) -> CheckoutSessionResult:
        """
        Create a Stripe Checkout session for a subscription.
        Returns the session ID and redirect URL.
        """
        try:
            params: dict = {
                "mode": "subscription",
                "line_items": [{"price": price_id, "quantity": 1}],
                "success_url": settings.stripe_success_url,
                "cancel_url": settings.stripe_cancel_url,
                "client_reference_id": client_reference_id,
                "allow_promotion_codes": True,
            }
            if stripe_customer_id:
                params["customer"] = stripe_customer_id
            else:
                params["customer_email"] = customer_email

            session = stripe.checkout.Session.create(**params)
            if not session.url:
                raise StripeClientError("Stripe returned a session with no URL.")
            return CheckoutSessionResult(session_id=session.id, url=session.url)
        except InvalidRequestError as exc:
            logger.error("Stripe invalid request: %s", exc)
            raise StripeClientError(str(exc)) from exc
        except StripeError as exc:
            logger.error("Stripe error creating checkout session: %s", exc)
            raise StripeClientError("Failed to create checkout session.") from exc

    # ------------------------------------------------------------------
    # Customer portal
    # ------------------------------------------------------------------

    def create_portal_session(
        self,
        stripe_customer_id: str,
        return_url: str,
    ) -> PortalSessionResult:
        """Create a Stripe Customer Portal session for self-service management."""
        try:
            session = stripe.billing_portal.Session.create(
                customer=stripe_customer_id,
                return_url=return_url,
            )
            return PortalSessionResult(url=session.url)
        except StripeError as exc:
            logger.error("Stripe error creating portal session: %s", exc)
            raise StripeClientError("Failed to create customer portal session.") from exc

    # ------------------------------------------------------------------
    # Webhooks
    # ------------------------------------------------------------------

    def verify_webhook(self, payload: bytes, stripe_signature: str) -> stripe.Event:
        """
        Verify the webhook signature and return the parsed Stripe Event.
        Raises StripeWebhookError if the signature is invalid.
        """
        try:
            return stripe.Webhook.construct_event(
                payload=payload,
                sig_header=stripe_signature,
                secret=settings.stripe_webhook_secret,
            )
        except SignatureVerificationError as exc:
            raise StripeWebhookError("Invalid Stripe webhook signature.") from exc
        except Exception as exc:
            raise StripeWebhookError(f"Webhook parsing failed: {exc}") from exc

    def parse_subscription_event(self, event: stripe.Event) -> ParsedSubscriptionEvent | None:
        """
        Extract normalised subscription data from a Stripe event.
        Returns None for event types we don't handle.
        """
        handled = {
            "customer.subscription.created",
            "customer.subscription.updated",
            "customer.subscription.deleted",
            "invoice.payment_failed",
        }
        if event.type not in handled:
            return None

        sub = event.data.object  # Subscription or Invoice

        # invoice.payment_failed gives us an Invoice, not a Subscription
        if event.type == "invoice.payment_failed":
            invoice = sub
            sub_id = invoice.get("subscription")
            if not sub_id:
                return None
            # Fetch the subscription to get full details
            try:
                sub = stripe.Subscription.retrieve(sub_id)
            except StripeError as exc:
                logger.error("Failed to retrieve subscription %s: %s", sub_id, exc)
                return None

        items = sub.get("items", {}).get("data", [])
        price_id = items[0]["price"]["id"] if items else ""

        cancelled_at_ts = sub.get("canceled_at")
        cancelled_at = datetime.fromtimestamp(cancelled_at_ts, tz=UTC) if cancelled_at_ts else None

        return ParsedSubscriptionEvent(
            stripe_event_id=event.id,
            event_type=event.type,
            stripe_subscription_id=sub["id"],
            stripe_customer_id=sub["customer"],
            price_id=price_id,
            status=sub["status"],
            current_period_start=datetime.fromtimestamp(sub["current_period_start"], tz=UTC),
            current_period_end=datetime.fromtimestamp(sub["current_period_end"], tz=UTC),
            cancelled_at=cancelled_at,
        )

    def tier_for_price(self, price_id: str) -> str:
        """Map a Stripe price ID to our internal tier name. Falls back to 'basic'."""
        return self._price_to_tier.get(price_id, "basic")


# Module-level singleton
stripe_client = StripeClient()
