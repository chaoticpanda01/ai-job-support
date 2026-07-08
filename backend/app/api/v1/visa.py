"""
Visa guidance endpoints.

POST /visa/consultations          — generate a new visa roadmap from current profile
GET  /visa/consultations          — list the user's past consultations (newest first)
GET  /visa/consultations/latest   — shortcut to the most recent consultation
GET  /visa/consultations/{id}     — detail for a specific consultation
"""

from __future__ import annotations

import logging
import time
from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.config import settings
from app.dependencies import AuthUser, DbSession
from app.repositories.user import ProfileRepository
from app.repositories.visa import VisaConsultationRepository
from app.schemas.visa import VisaConsultationListItem, VisaConsultationResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/visa", tags=["visa"])

_VISA_MAX_TOKENS = 4096


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _profile_snapshot(profile) -> dict:  # type: ignore[no-untyped-def]
    """Extract the fields that inform visa guidance from a Profile ORM object."""
    return {
        "nationality": getattr(profile, "nationality", None),
        "japanese_level": profile.japanese_level.value if profile.japanese_level else None,
        "visa_status": profile.visa_status.value if profile.visa_status else None,
        "years_experience": getattr(profile, "years_experience", None),
        "target_role": list(profile.target_role) if profile.target_role else [],
        "target_industry": list(profile.target_industry) if profile.target_industry else [],
        "current_location": getattr(profile, "current_location", None),
        "target_location": getattr(profile, "target_location", None),
        "preferred_language": (
            profile.preferred_language.value if profile.preferred_language else None
        ),
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/consultations",
    response_model=VisaConsultationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_consultation(
    current_user: AuthUser,
    db: DbSession,
) -> VisaConsultationResponse:
    """
    Generate a personalised visa roadmap using the user's current profile.
    Calls Claude, persists the result, and returns the full consultation.
    """
    from app.services.ai.client import AIError, ai_client
    from app.services.ai.prompts.visa import (
        VisaRoadmapResult,
        build_system_prompt,
        build_user_prompt,
    )
    from app.services.ai.response_parser import parse_response
    from app.services.ai.usage_tracker import AIBudgetError, usage_tracker

    profile_repo = ProfileRepository(db)
    visa_repo = VisaConsultationRepository(db)

    profile = await profile_repo.get_by_user_id(current_user.user_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Complete your profile before generating visa guidance.",
        )

    try:
        await usage_tracker.check_budget(current_user.user_id, "visa_guidance", db)
    except AIBudgetError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc

    snapshot = _profile_snapshot(profile)

    t0 = time.monotonic()
    try:
        response_text, input_tokens, output_tokens = await ai_client.generate(
            build_system_prompt(),
            build_user_prompt(snapshot),
            max_tokens=_VISA_MAX_TOKENS,
            feature="visa_guidance",
            json_mode=True,
        )
    except AIError as exc:
        logger.error("Visa AI call failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service unavailable. Please try again.",
        ) from exc
    elapsed = time.monotonic() - t0

    try:
        result = parse_response(response_text, VisaRoadmapResult)
    except Exception as exc:
        logger.error("Visa prompt returned invalid JSON: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI returned an unexpected response. Please try again.",
        ) from exc

    consultation = await visa_repo.create(
        user_id=current_user.user_id,
        profile_snapshot=snapshot,
        visa_type=result.visa_type,
        ai_guidance=result.ai_guidance,
        checklist=result.checklist.model_dump(),
    )
    await db.flush()

    await usage_tracker.record(
        user_id=current_user.user_id,
        feature="visa_guidance",
        model=settings.gemini_default_model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=int(elapsed * 1000),
        db=db,
    )

    return VisaConsultationResponse.model_validate(consultation)


@router.get("/consultations/latest", response_model=VisaConsultationResponse)
async def get_latest_consultation(
    current_user: AuthUser,
    db: DbSession,
) -> VisaConsultationResponse:
    visa_repo = VisaConsultationRepository(db)
    consultation = await visa_repo.get_latest_for_user(current_user.user_id)
    if consultation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No consultations found.")
    return VisaConsultationResponse.model_validate(consultation)


@router.get("/consultations", response_model=list[VisaConsultationListItem])
async def list_consultations(
    current_user: AuthUser,
    db: DbSession,
) -> list[VisaConsultationListItem]:
    visa_repo = VisaConsultationRepository(db)
    consultations = await visa_repo.list_by_user(current_user.user_id, limit=50)
    return [VisaConsultationListItem.model_validate(c) for c in consultations]


@router.get("/consultations/{consultation_id}", response_model=VisaConsultationResponse)
async def get_consultation(
    consultation_id: UUID,
    current_user: AuthUser,
    db: DbSession,
) -> VisaConsultationResponse:
    visa_repo = VisaConsultationRepository(db)
    consultation = await visa_repo.get_owned(consultation_id, current_user.user_id)
    if consultation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found.")
    return VisaConsultationResponse.model_validate(consultation)
