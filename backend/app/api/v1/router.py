"""
Aggregates all v1 API sub-routers.

Add new routers here as phases are implemented.
"""

from fastapi import APIRouter

from app.api.v1 import (
    account,
    admin,
    auth,
    chat,
    culture,
    documents,
    interview,
    jobs,
    resumes,
    visa,
)

# Billing is intentionally excluded — platform is fully free.
# To restore: import billing and add router.include_router(billing.router)
# import app.api.v1.billing  (kept in place as backup)

router = APIRouter()

router.include_router(auth.router)
router.include_router(resumes.router)
router.include_router(documents.router)
router.include_router(jobs.router)
router.include_router(interview.router)
router.include_router(visa.router)
router.include_router(culture.router)
router.include_router(account.router)
router.include_router(admin.router)
router.include_router(chat.router)
