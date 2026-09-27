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


class DocumentOrientation(str, enum.Enum):
    portrait = "portrait"
    landscape = "landscape"


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


# AnalysisStatus and AnalysisErrorCode are stored as plain VARCHAR on resumes
# rather than as enum types, so a stored value this version doesn't know (e.g.
# after a rollback) loads as a string the status endpoint reports as "unknown",
# instead of failing the whole row load. Keep AnalysisErrorCode in sync with
# frontend/types/api.ts.


class AnalysisStatus(str, enum.Enum):
    """resumes.analysis_status. NULL means none was requested or the latest succeeded."""

    pending = "pending"
    failed = "failed"


class AnalysisErrorCode(str, enum.Enum):
    """Why a resume's latest analysis failed. The client maps each code to a message."""

    budget_exceeded = "budget_exceeded"
    unreadable_file = "unreadable_file"
    file_unavailable = "file_unavailable"
    ai_failed = "ai_failed"
    # Not stored: reported for a pending request that went stale. The task may
    # still finish later and clear it.
    timed_out = "timed_out"
    unknown = "unknown"


class DocumentErrorCode(str, enum.Enum):
    """
    Why a document's generation failed. The client maps each code to a message.
    Stored as plain VARCHAR on generated_documents (same reasoning as
    AnalysisErrorCode above). Keep in sync with frontend/types/api.ts.
    """

    budget_exceeded = "budget_exceeded"
    profile_incomplete = "profile_incomplete"
    resume_missing = "resume_missing"
    file_unavailable = "file_unavailable"
    unreadable_file = "unreadable_file"
    ai_failed = "ai_failed"
    pdf_failed = "pdf_failed"
    upload_failed = "upload_failed"
    # Not stored: reported for a generation that has been running too long. The
    # task may still finish later and replace it.
    timed_out = "timed_out"
    unknown = "unknown"


class InterviewStreamErrorCode(str, enum.Enum):
    """
    Why an interview stream ended early. Sent with the SSE "error" event so the
    client can say what happened in the user's language; the event's message
    stays for logs and for a client that doesn't know the code. Keep in sync
    with InterviewStreamErrorCode in frontend/types/api.ts.
    """

    question_failed = "question_failed"
    answer_not_saved = "answer_not_saved"
    summary_failed = "summary_failed"
    summary_not_saved = "summary_not_saved"


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
    """
    Where a tracked job is in the user's pipeline, declared in stage order (the
    database enum has the same order). The UI shows planning as "Saved" and
    offered as "Offer". rejected, withdrawn and skipped are archived: rejected
    and withdrawn are "Closed" (declining an offer is withdrawing), skipped is
    a saved job the user chose not to apply for.
    """

    planning = "planning"
    preparing = "preparing"
    applied = "applied"
    interviewing = "interviewing"
    offered = "offered"
    accepted = "accepted"
    rejected = "rejected"
    withdrawn = "withdrawn"
    skipped = "skipped"


ARCHIVED_STATUSES: frozenset[ApplicationStatus] = frozenset(
    {ApplicationStatus.rejected, ApplicationStatus.withdrawn, ApplicationStatus.skipped}
)

_AS = ApplicationStatus

# Every move a tracked job can make. Each forward stage can also go back one
# step, to undo a mis-click. An archived job has no moves of its own: it only
# reopens, to the stage it left (see allowed_moves). Mirrored in
# frontend/lib/pipeline.ts; both are pinned to
# tests/fixtures/application_transitions.json.
APPLICATION_TRANSITIONS: dict[ApplicationStatus, frozenset[ApplicationStatus]] = {
    _AS.planning: frozenset({_AS.preparing, _AS.applied, _AS.skipped}),
    _AS.preparing: frozenset({_AS.applied, _AS.withdrawn, _AS.planning}),
    _AS.applied: frozenset({_AS.interviewing, _AS.rejected, _AS.withdrawn, _AS.preparing}),
    _AS.interviewing: frozenset({_AS.offered, _AS.rejected, _AS.withdrawn, _AS.applied}),
    _AS.offered: frozenset({_AS.accepted, _AS.withdrawn, _AS.interviewing}),
    _AS.accepted: frozenset({_AS.withdrawn, _AS.offered}),
    _AS.rejected: frozenset(),
    _AS.withdrawn: frozenset(),
    _AS.skipped: frozenset(),
}


def reopen_target(closed_from: ApplicationStatus | None, *, has_applied: bool) -> ApplicationStatus:
    """
    Where an archived job goes back to: the stage it left. Jobs archived before
    closed_from existed have none, so they return to Applied if the user had
    applied, and to Saved otherwise.
    """
    if closed_from is not None:
        return closed_from
    return _AS.applied if has_applied else _AS.planning


def allowed_moves(
    status: ApplicationStatus,
    *,
    closed_from: ApplicationStatus | None,
    has_applied: bool,
) -> frozenset[ApplicationStatus]:
    """The statuses a job at `status` may move to."""
    if status in ARCHIVED_STATUSES:
        return frozenset({reopen_target(closed_from, has_applied=has_applied)})
    return APPLICATION_TRANSITIONS[status]


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
sa_document_orientation = SAEnum(DocumentOrientation, name="document_orientation", **_kw)
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
