from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.models.enums import BillingEventType, SubscriptionStatus, SubscriptionTier


class SubscriptionResponse(BaseModel):
    id: UUID
    tier: SubscriptionTier
    status: SubscriptionStatus
    current_period_start: datetime
    current_period_end: datetime
    cancelled_at: datetime | None
    stripe_customer_id: str

    model_config = {"from_attributes": True}


class BillingEventResponse(BaseModel):
    id: UUID
    event_type: BillingEventType
    tier_from: SubscriptionTier | None
    tier_to: SubscriptionTier | None
    amount_jpy: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CheckoutRequest(BaseModel):
    tier: SubscriptionTier  # "basic" or "pro"


class CheckoutResponse(BaseModel):
    url: str


class PortalResponse(BaseModel):
    url: str
