"""
Repository layer — one repository class per table group.

Usage in FastAPI route handlers:

    from app.dependencies import DbSession, AuthUser
    from app.repositories.resume import ResumeRepository

    @router.get("/resumes/{id}")
    async def get_resume(id: UUID, db: DbSession, user: AuthUser):
        repo = ResumeRepository(db)
        resume = await repo.get_owned(id, user.user_id)
        if resume is None:
            raise HTTPException(404)
        return resume
"""

from app.repositories.ai_usage import AIUsageRepository
from app.repositories.billing import (
    BillingEventRepository,
    NotificationLogRepository,
    SubscriptionLimitRepository,
    SubscriptionRepository,
)
from app.repositories.document import DocumentRepository
from app.repositories.interview import InterviewMessageRepository, InterviewSessionRepository
from app.repositories.job import (
    JobApplicationRepository,
    JobMatchRepository,
    JobPostingRepository,
    SavedJobRepository,
)
from app.repositories.resume import ResumeAnalysisRepository, ResumeRepository
from app.repositories.user import ProfileRepository, UserRepository
from app.repositories.visa import VisaConsultationRepository

__all__ = [
    "AIUsageRepository",
    "BillingEventRepository",
    "NotificationLogRepository",
    "SubscriptionLimitRepository",
    "SubscriptionRepository",
    "DocumentRepository",
    "InterviewMessageRepository",
    "InterviewSessionRepository",
    "JobApplicationRepository",
    "JobMatchRepository",
    "JobPostingRepository",
    "SavedJobRepository",
    "ResumeAnalysisRepository",
    "ResumeRepository",
    "ProfileRepository",
    "UserRepository",
    "VisaConsultationRepository",
]
