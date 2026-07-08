"""
Email service — Resend-backed transactional email sender.

Rules enforced here:
  - Only this file imports `resend`. All other code calls email_service.
  - Every send is logged to notification_log via NotificationLogRepository.
  - Before sending, was_sent_recently() is checked to prevent duplicate
    emails within the cooldown window (default: 1 hour per template per user).
  - All methods are async-friendly wrappers; the Resend SDK is called in a
    thread pool via asyncio.to_thread() so the event loop is never blocked.
  - Failures are logged and re-raised as EmailServiceError so callers can
    decide whether to surface them to the user or swallow them silently.

Template IDs match the Resend dashboard names. They are constants here so
a typo causes an AttributeError at import time, not a silent wrong email.

Usage:
    from app.services.email_service import email_service, EmailServiceError
"""

from __future__ import annotations

import asyncio
import logging
from uuid import UUID

import resend
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.enums import NotificationChannel
from app.repositories.billing import NotificationLogRepository

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Template IDs — must match Resend dashboard exactly
# ---------------------------------------------------------------------------


class Templates:
    WELCOME = "welcome_v1"
    SUBSCRIPTION_START = "subscription_started_v1"
    SUBSCRIPTION_CANCEL = "subscription_cancelled_v1"
    PAYMENT_FAILED = "payment_failed_v1"
    ACCOUNT_DELETED = "account_deleted_v1"


# Default cooldown: don't re-send the same template to the same user within 1 hour.
_DEFAULT_COOLDOWN_SECONDS = 3600


class EmailServiceError(Exception):
    """Raised when an email cannot be sent after all retry attempts."""


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class EmailService:
    def __init__(self) -> None:
        resend.api_key = settings.resend_api_key
        self._from = f"{settings.email_from_name} <{settings.email_from_address}>"

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _send(
        self,
        *,
        to: str,
        template_id: str,
        variables: dict,
        user_id: UUID | None,
        db: AsyncSession,
        cooldown_seconds: int = _DEFAULT_COOLDOWN_SECONDS,
    ) -> None:
        """
        Core send path:
          1. Check cooldown (skip if recently sent).
          2. Call Resend API in a thread pool.
          3. Log the send to notification_log.
        """
        log_repo = NotificationLogRepository(db)

        if user_id is not None:
            already_sent = await log_repo.was_sent_recently(user_id, template_id, cooldown_seconds)
            if already_sent:
                logger.info(
                    "Skipping %s to user %s — sent within cooldown window.",
                    template_id,
                    user_id,
                )
                return

        provider_id: str | None = None

        try:
            response = await asyncio.to_thread(
                resend.Emails.send,
                {
                    "from": self._from,
                    "to": [to],
                    "subject": _subject_for(template_id),
                    "html": _render_template(template_id, variables),
                },
            )
            provider_id = response.get("id") if isinstance(response, dict) else None
        except Exception as exc:
            logger.error("Resend send failed for template %s: %s", template_id, exc)
            raise EmailServiceError(f"Failed to send email ({template_id}).") from exc
        finally:
            await log_repo.record(
                user_id=user_id,
                channel=NotificationChannel.email,
                template_id=template_id,
                provider_id=provider_id,
            )
            await db.flush()

    # ------------------------------------------------------------------
    # Public API — one method per email type
    # ------------------------------------------------------------------

    async def send_welcome(
        self, *, to: str, first_name: str, user_id: UUID, db: AsyncSession
    ) -> None:
        await self._send(
            to=to,
            template_id=Templates.WELCOME,
            variables={"first_name": first_name or "there"},
            user_id=user_id,
            db=db,
        )

    async def send_subscription_started(
        self,
        *,
        to: str,
        first_name: str,
        tier: str,
        user_id: UUID,
        db: AsyncSession,
    ) -> None:
        await self._send(
            to=to,
            template_id=Templates.SUBSCRIPTION_START,
            variables={"first_name": first_name or "there", "tier": tier.capitalize()},
            user_id=user_id,
            db=db,
        )

    async def send_subscription_cancelled(
        self,
        *,
        to: str,
        first_name: str,
        user_id: UUID,
        db: AsyncSession,
    ) -> None:
        await self._send(
            to=to,
            template_id=Templates.SUBSCRIPTION_CANCEL,
            variables={"first_name": first_name or "there"},
            user_id=user_id,
            db=db,
        )

    async def send_payment_failed(
        self,
        *,
        to: str,
        first_name: str,
        user_id: UUID,
        db: AsyncSession,
    ) -> None:
        # Payment failures can recur; use a shorter cooldown (24 h) so the
        # user gets a reminder each day the payment remains failed.
        await self._send(
            to=to,
            template_id=Templates.PAYMENT_FAILED,
            variables={"first_name": first_name or "there"},
            user_id=user_id,
            db=db,
            cooldown_seconds=86400,
        )

    async def send_account_deleted(
        self,
        *,
        to: str,
        first_name: str,
        user_id: UUID | None,
        db: AsyncSession,
    ) -> None:
        # user_id may be None if the user row is already gone when this fires.
        # cooldown=0 ensures we always send it (deletion is a one-time event).
        await self._send(
            to=to,
            template_id=Templates.ACCOUNT_DELETED,
            variables={"first_name": first_name or "there"},
            user_id=user_id,
            db=db,
            cooldown_seconds=0,
        )


# ---------------------------------------------------------------------------
# Template rendering — inline HTML fallbacks used when Resend template IDs
# aren't wired up yet (e.g. local dev). Replace with Resend template API
# calls once templates are configured in the dashboard.
# ---------------------------------------------------------------------------

_SUBJECTS: dict[str, str] = {
    Templates.WELCOME: "Welcome to Japan Job Support!",
    Templates.SUBSCRIPTION_START: "Your subscription is now active",
    Templates.SUBSCRIPTION_CANCEL: "Your subscription has been cancelled",
    Templates.PAYMENT_FAILED: "Action required: payment failed",
    Templates.ACCOUNT_DELETED: "Your account has been deleted",
}


def _subject_for(template_id: str) -> str:
    return _SUBJECTS.get(template_id, "Japan Job Support")


def _render_template(template_id: str, variables: dict) -> str:
    """
    Minimal inline HTML for each template. In production, swap these out for
    Resend's template API (set `template` key instead of `html` in the payload).
    """
    name = variables.get("first_name", "there")

    if template_id == Templates.WELCOME:
        return (
            f"<p>Hi {name},</p>"
            "<p>Welcome to Japan Job Support! Your account is ready. "
            "Start by uploading your resume and translating your first job posting.</p>"
            "<p>がんばって！</p>"
        )
    if template_id == Templates.SUBSCRIPTION_START:
        tier = variables.get("tier", "Basic")
        return (
            f"<p>Hi {name},</p>"
            f"<p>Your <strong>{tier}</strong> subscription is now active. "
            "Enjoy full access to all features.</p>"
        )
    if template_id == Templates.SUBSCRIPTION_CANCEL:
        return (
            f"<p>Hi {name},</p>"
            "<p>Your subscription has been cancelled. You'll retain access until the end "
            "of your current billing period. We hope to see you again!</p>"
        )
    if template_id == Templates.PAYMENT_FAILED:
        return (
            f"<p>Hi {name},</p>"
            "<p>We couldn't process your payment. Please update your payment method "
            "to keep your subscription active.</p>"
        )
    if template_id == Templates.ACCOUNT_DELETED:
        return (
            f"<p>Hi {name},</p>"
            "<p>Your Japan Job Support account has been permanently deleted. "
            "All your data has been removed. We're sorry to see you go.</p>"
        )
    return f"<p>Hi {name},</p><p>A message from Japan Job Support.</p>"


# Module-level singleton
email_service = EmailService()
