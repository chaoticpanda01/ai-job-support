"""
Python enumerations mirroring every PostgreSQL ENUM in schema.sql.

Rules:
- Each Python enum is a subclass of (str, enum.Enum) so values are
  JSON-serializable and compare equal to plain strings.
- Each SAEnum wraps the Python enum with create_type=False because
  the baseline migration creates the types from schema.sql.
  Alembic will NOT attempt to CREATE or DROP these types.
"""

import enum

from sqlalchemy import Enum as SAEnum

# ---------------------------------------------------------------------------
# Python Enums
# ---------------------------------------------------------------------------


class SubscriptionTier(str, enum.Enum):
    free = "free"
    basic = "basic"
    pro = "pro"


class JapaneseLevel(str, enum.Enum):
    N1 = "N1"
    N2 = "N2"
    N3 = "N3"
    N4 = "N4"
    N5 = "N5"
    none = "none"


class PreferredLanguage(str, enum.Enum):
    id = "id"
    en = "en"
    ja = "ja"


class VisaStatus(str, enum.Enum):
    none = "none"
    pending = "pending"
    held = "held"


class Gender(str, enum.Enum):
    male = "male"
    female = "female"


class DocumentType(str, enum.Enum):
    rirekisho = "rirekisho"
    shokumukeirekisho = "shokumukeirekisho"
    # cover_letter deferred post-MVP — add here and re-run ALTER TYPE when ready


class DocumentStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class JobSourcePlatform(str, enum.Enum):
    indeed_jp = "indeed_jp"
    rikunabi = "rikunabi"
    mynavi = "mynavi"
    hellowork = "hellowork"
    manual = "manual"


class InterviewType(str, enum.Enum):
    behavioral = "behavioral"
    technical = "technical"
    general = "general"
    culture_fit = "culture_fit"


class InterviewStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    abandoned = "abandoned"


class MessageRole(str, enum.Enum):
    interviewer = "interviewer"
    user = "user"
    feedback = "feedback"


class AnalysisType(str, enum.Enum):
    general = "general"
    job_match = "job_match"
    gap_analysis = "gap_analysis"


class OriginalLanguage(str, enum.Enum):
    ja = "ja"
    en = "en"
    id = "id"


class NotificationChannel(str, enum.Enum):
    email = "email"
    push = "push"


class NotificationStatus(str, enum.Enum):
    sent = "sent"
    delivered = "delivered"
    bounced = "bounced"
    failed = "failed"


class SubscriptionStatus(str, enum.Enum):
    active = "active"
    past_due = "past_due"
    cancelled = "cancelled"
    trialing = "trialing"


class BillingEventType(str, enum.Enum):
    subscribed = "subscribed"
    renewed = "renewed"
    upgraded = "upgraded"
    downgraded = "downgraded"
    cancelled = "cancelled"
    payment_failed = "payment_failed"
    refunded = "refunded"


class ApplicationStatus(str, enum.Enum):
    planning = "planning"
    applied = "applied"
    interviewing = "interviewing"
    offered = "offered"
    rejected = "rejected"
    withdrawn = "withdrawn"


class UserRole(str, enum.Enum):
    user = "user"
    admin = "admin"


# ---------------------------------------------------------------------------
# SQLAlchemy Enum type objects
# create_type=False: types exist in DB via baseline migration; never re-create.
# ---------------------------------------------------------------------------

_kw = {"create_type": False, "validate_strings": True}

sa_user_role = SAEnum(UserRole, name="user_role", **_kw)
sa_subscription_tier = SAEnum(SubscriptionTier, name="subscription_tier", **_kw)
sa_japanese_level = SAEnum(JapaneseLevel, name="japanese_level", **_kw)
sa_preferred_language = SAEnum(PreferredLanguage, name="preferred_language", **_kw)
sa_visa_status = SAEnum(VisaStatus, name="visa_status", **_kw)
sa_gender = SAEnum(Gender, name="gender", **_kw)
sa_document_type = SAEnum(DocumentType, name="document_type", **_kw)
sa_document_status = SAEnum(DocumentStatus, name="document_status", **_kw)
sa_job_source_platform = SAEnum(JobSourcePlatform, name="job_source_platform", **_kw)
sa_interview_type = SAEnum(InterviewType, name="interview_type", **_kw)
sa_interview_status = SAEnum(InterviewStatus, name="interview_status", **_kw)
sa_message_role = SAEnum(MessageRole, name="message_role", **_kw)
sa_analysis_type = SAEnum(AnalysisType, name="analysis_type", **_kw)
sa_original_language = SAEnum(OriginalLanguage, name="original_language", **_kw)
sa_notification_channel = SAEnum(NotificationChannel, name="notification_channel", **_kw)
sa_notification_status = SAEnum(NotificationStatus, name="notification_status", **_kw)
sa_subscription_status = SAEnum(SubscriptionStatus, name="subscription_status", **_kw)
sa_billing_event_type = SAEnum(BillingEventType, name="billing_event_type", **_kw)
sa_application_status = SAEnum(ApplicationStatus, name="application_status", **_kw)
