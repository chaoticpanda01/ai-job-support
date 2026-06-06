"""
Import every model so they are registered with Base.metadata before
Alembic autogenerate or any metadata.create_all() call.

Adding a new model file? Import it here.
"""

from app.models.base import Base
from app.models.enums import (
    AnalysisType,
    ApplicationStatus,
    BillingEventType,
    DocumentStatus,
    DocumentType,
    InterviewStatus,
    InterviewType,
    JapaneseLevel,
    JobSourcePlatform,
    MessageRole,
    NotificationChannel,
    NotificationStatus,
    OriginalLanguage,
    PreferredLanguage,
    SubscriptionStatus,
    SubscriptionTier,
    UserRole,
    VisaStatus,
)
from app.models.user import Profile, User
from app.models.resume import Resume, ResumeAnalysis
from app.models.document import GeneratedDocument
from app.models.job import JobApplication, JobMatch, JobPosting, SavedJob
from app.models.interview import InterviewMessage, InterviewSession
from app.models.visa import VisaConsultation
from app.models.culture import CultureGlossary, CultureTopic
from app.models.billing import BillingEvent, NotificationLog, Subscription, SubscriptionLimit
from app.models.ai_usage import AIUsageLog

__all__ = [
    "Base",
    "AnalysisType",
    "ApplicationStatus",
    "BillingEventType",
    "DocumentStatus",
    "DocumentType",
    "InterviewStatus",
    "InterviewType",
    "JapaneseLevel",
    "JobSourcePlatform",
    "MessageRole",
    "NotificationChannel",
    "NotificationStatus",
    "OriginalLanguage",
    "PreferredLanguage",
    "SubscriptionStatus",
    "SubscriptionTier",
    "UserRole",
    "VisaStatus",
    "User",
    "Profile",
    "Resume",
    "ResumeAnalysis",
    "GeneratedDocument",
    "JobPosting",
    "JobMatch",
    "SavedJob",
    "JobApplication",
    "InterviewSession",
    "InterviewMessage",
    "VisaConsultation",
    "CultureTopic",
    "CultureGlossary",
    "Subscription",
    "BillingEvent",
    "NotificationLog",
    "SubscriptionLimit",
    "AIUsageLog",
]
