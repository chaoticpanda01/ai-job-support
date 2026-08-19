"""
Pydantic request/response schemas for user and profile endpoints.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import (
    Gender,
    JapaneseLevel,
    PreferredLanguage,
    SubscriptionTier,
    UserRole,
    VisaStatus,
)

# ---------------------------------------------------------------------------
# Shared config
# ---------------------------------------------------------------------------


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------


class ProfileResponse(_Base):
    id: UUID
    user_id: UUID
    nationality: str
    japanese_level: JapaneseLevel
    target_industry: list[str]
    target_role: list[str]
    years_experience: int | None
    current_location: str | None
    target_location: str | None
    visa_status: VisaStatus
    preferred_language: PreferredLanguage
    onboarding_step: int
    onboarding_completed: bool
    consent_given_at: datetime | None
    name_kana: str | None
    date_of_birth: date | None
    gender: Gender | None
    phone_number: str | None
    mailing_address: str | None
    residence_card_expiration: date | None
    visa_category: str | None
    created_at: datetime
    updated_at: datetime


class ProfileUpdateRequest(_Base):
    nationality: str | None = None
    japanese_level: JapaneseLevel | None = None
    target_industry: list[str] | None = None
    target_role: list[str] | None = None
    years_experience: int | None = Field(None, ge=0, le=80)
    current_location: str | None = None
    target_location: str | None = None
    visa_status: VisaStatus | None = None
    preferred_language: PreferredLanguage | None = None
    onboarding_step: int | None = Field(None, ge=0, le=5)
    name_kana: str | None = None
    date_of_birth: date | None = None
    gender: Gender | None = None
    phone_number: str | None = None
    mailing_address: str | None = None
    residence_card_expiration: date | None = None
    visa_category: str | None = None


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------


class UserResponse(_Base):
    id: UUID
    clerk_id: str
    email: EmailStr
    email_verified: bool
    full_name: str | None
    subscription_tier: SubscriptionTier
    role: UserRole
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime
    profile: ProfileResponse | None = None


class MeResponse(_Base):
    """Combined user + profile returned by GET /auth/me."""

    user: UserResponse
    profile: ProfileResponse | None


# ---------------------------------------------------------------------------
# Clerk webhook payloads
# ---------------------------------------------------------------------------


class ClerkEmailAddress(BaseModel):
    email_address: str
    verification: dict[str, Any] | None = None


class ClerkWebhookUserData(BaseModel):
    id: str
    email_addresses: list[ClerkEmailAddress]
    first_name: str | None = None
    last_name: str | None = None
    primary_email_address_id: str | None = None


class ClerkWebhookEvent(BaseModel):
    type: str
    data: ClerkWebhookUserData


# ---------------------------------------------------------------------------
# Admin — user list
# ---------------------------------------------------------------------------


class UserListResponse(_Base):
    items: list[UserResponse]
    total: int
    offset: int
    limit: int
