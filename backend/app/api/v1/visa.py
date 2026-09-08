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

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.dependencies import AuthUser, DbSession
from app.models.user import Profile
from app.repositories.user import ProfileRepository
from app.repositories.visa import VisaConsultationRepository, VisaRoadmapRepository
from app.schemas.visa import (
    VisaConsultationListItem,
    VisaConsultationResponse,
    VisaRoadmapCreateRequest,
    VisaRoadmapResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/visa", tags=["visa"])

_ASSESSMENT_MAX_TOKENS = 2048
_ROADMAP_MAX_TOKENS = 4096


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


@router.post(
    "/consultations/{consultation_id}/roadmaps",
    response_model=VisaRoadmapResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_roadmap(
    consultation_id: UUID,
    payload: VisaRoadmapCreateRequest,
    current_user: AuthUser,
    db: DbSession,
    response: Response,
) -> VisaRoadmapResponse:
    """
    Build the roadmap for one of this consultation's assessed visa categories,
    or return the one already built for it. Either way the roadmap becomes the
    consultation's active one, so this endpoint doubles as the "switch visa"
    action — whether that costs an AI call is the server's business, not the
    client's.
    """
    from app.services.ai.client import AIError, ai_client
    from app.services.ai.prompts.visa_roadmap import (
        VisaRoadmapResult,
        build_system_prompt,
        build_user_prompt,
    )
    from app.services.ai.response_parser import parse_response
    from app.services.ai.usage_tracker import AIBudgetError, usage_tracker

    visa_repo = VisaConsultationRepository(db)
    roadmap_repo = VisaRoadmapRepository(db)

    consultation = await visa_repo.get_owned(consultation_id, current_user.user_id)
    if consultation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found.")

    # A free-text visa_type would flow straight into an AI prompt and into the
    # table. Only a category this assessment actually produced is acceptable.
    assessed = {
        option.get("visa_type")
        for option in (consultation.options or [])
        if isinstance(option, dict)
    }
    if payload.visa_type not in assessed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="That visa category was not part of this assessment.",
        )

    existing = await roadmap_repo.get_for_consultation_and_type(consultation_id, payload.visa_type)
    if existing is not None:
        await visa_repo.update(consultation, active_roadmap_id=existing.id)
        response.status_code = status.HTTP_200_OK
        return VisaRoadmapResponse.model_validate(existing)

    try:
        await usage_tracker.check_budget(current_user.user_id, "visa_roadmap", db)
    except AIBudgetError as exc:
        raise exc.to_http_exception() from exc

    t0 = time.monotonic()
    try:
        response_text, input_tokens, output_tokens = await ai_client.generate(
            build_system_prompt(),
            build_user_prompt(consultation.profile_snapshot, payload.visa_type),
            max_tokens=_ROADMAP_MAX_TOKENS,
            feature="visa_roadmap",
            json_mode=True,
        )
    except AIError as exc:
        logger.error("Visa roadmap AI call failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service unavailable. Please try again.",
        ) from exc
    elapsed = time.monotonic() - t0

    try:
        result = parse_response(response_text, VisaRoadmapResult)
    except Exception as exc:
        logger.error("Visa roadmap returned invalid JSON: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI returned an unexpected response. Please try again.",
        ) from exc

    try:
        # Savepoint: two rapid clicks both pass the "existing is None" check
        # above, and the unique constraint lets exactly one insert win. Without
        # begin_nested() the loser's IntegrityError would poison the whole
        # request transaction instead of falling through to the existing row.
        async with db.begin_nested():
            roadmap = await roadmap_repo.create(
                user_id=current_user.user_id,
                consultation_id=consultation_id,
                visa_type=payload.visa_type,
                ai_guidance=result.ai_guidance,
                checklist=result.checklist.model_dump(),
                completed_steps=[],
            )
    except IntegrityError:
        raced = await roadmap_repo.get_for_consultation_and_type(consultation_id, payload.visa_type)
        if raced is None:
            raise
        await visa_repo.update(consultation, active_roadmap_id=raced.id)
        response.status_code = status.HTTP_200_OK
        return VisaRoadmapResponse.model_validate(raced)

    await visa_repo.update(consultation, active_roadmap_id=roadmap.id)

    await usage_tracker.record(
        user_id=current_user.user_id,
        feature="visa_roadmap",
        model=settings.gemini_default_model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=int(elapsed * 1000),
        db=db,
    )

    return VisaRoadmapResponse.model_validate(roadmap)


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
