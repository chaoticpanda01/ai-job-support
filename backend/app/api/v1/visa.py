"""
Visa guidance endpoints.

POST  /visa/consultations                    — assess the profile, return visa options
GET   /visa/consultations                    — list the user's past assessments (newest first)
GET   /visa/consultations/latest             — shortcut to the most recent assessment
GET   /visa/consultations/{id}               — detail for a specific assessment
POST  /visa/consultations/{id}/roadmaps      — build (or return) the roadmap for a chosen visa
PATCH /visa/roadmaps/{id}/progress           — save checklist progress for a roadmap
"""

from __future__ import annotations

import logging
import time
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.config import settings
from app.dependencies import AuthUser, DbSession
from app.models.user import Profile
from app.repositories.user import ProfileRepository
from app.repositories.visa import VisaConsultationRepository
from app.schemas.visa import VisaConsultationListItem, VisaConsultationResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/visa", tags=["visa"])

_ASSESSMENT_MAX_TOKENS = 2048


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _profile_snapshot(profile: Profile) -> dict[str, Any]:
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
    Assess the user's current profile against every relevant Japanese work visa
    category. Calls Gemini, persists the scored options, and returns them.
    """
    from app.services.ai.client import AIError, ai_client
    from app.services.ai.prompts.visa_assessment import (
        VisaAssessmentResult,
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
        await usage_tracker.check_budget(current_user.user_id, "visa_assessment", db)
    except AIBudgetError as exc:
        raise exc.to_http_exception() from exc

    snapshot = _profile_snapshot(profile)

    t0 = time.monotonic()
    try:
        response_text, input_tokens, output_tokens = await ai_client.generate(
            build_system_prompt(),
            build_user_prompt(snapshot),
            max_tokens=_ASSESSMENT_MAX_TOKENS,
            feature="visa_assessment",
            json_mode=True,
        )
    except AIError as exc:
        logger.error("Visa assessment AI call failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service unavailable. Please try again.",
        ) from exc
    elapsed = time.monotonic() - t0

    try:
        result = parse_response(response_text, VisaAssessmentResult)
    except Exception as exc:
        logger.error("Visa assessment returned invalid JSON: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI returned an unexpected response. Please try again.",
        ) from exc

    # VisaAssessmentResult guarantees exactly one recommended option.
    recommended = next(o for o in result.options if o.recommended)

    consultation = await visa_repo.create(
        user_id=current_user.user_id,
        profile_snapshot=snapshot,
        # Denormalised so the list view needs no join. checklist/ai_guidance
        # stay NULL on new rows — roadmaps own that content now.
        visa_type=recommended.visa_type,
        options=[o.model_dump() for o in result.options],
    )
    await db.flush()

    await usage_tracker.record(
        user_id=current_user.user_id,
        feature="visa_assessment",
        model=settings.gemini_default_model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=int(elapsed * 1000),
        db=db,
    )

    # Built explicitly rather than via model_validate(consultation): the
    # response serialises .roadmaps, and touching that relationship on a
    # just-created (and refreshed) instance lazy-loads under asyncio and raises
    # MissingGreenlet. A brand-new assessment has no roadmaps by definition.
    return VisaConsultationResponse(
        id=consultation.id,
        visa_type=consultation.visa_type,
        ai_guidance=None,
        checklist=None,
        options=result.options,
        active_roadmap_id=None,
        roadmaps=[],
        profile_snapshot=snapshot,
        created_at=consultation.created_at,
        updated_at=consultation.updated_at,
    )


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
    consultation = await visa_repo.get_owned_with_roadmaps(consultation_id, current_user.user_id)
    if consultation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found.")
    return VisaConsultationResponse.model_validate(consultation)
