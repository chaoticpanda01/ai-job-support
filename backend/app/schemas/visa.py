from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.services.ai.prompts.visa_assessment import VisaOption

__all__ = [
    "VisaConsultationListItem",
    "VisaConsultationResponse",
    "VisaOption",
    "VisaProgressUpdateRequest",
    "VisaRoadmapCreateRequest",
    "VisaRoadmapResponse",
]


class VisaRoadmapResponse(BaseModel):
    id: UUID
    visa_type: str
    ai_guidance: str | None
    checklist: dict[str, Any]
    completed_steps: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VisaConsultationResponse(BaseModel):
    id: UUID
    # visa_type / ai_guidance / checklist are legacy: populated only on
    # consultations created before the multi-roadmap change, so those keep
    # rendering. New rows carry the recommended category in visa_type and
    # leave the other two NULL.
    visa_type: str | None
    ai_guidance: str | None
    checklist: dict[str, Any] | None
    options: list[VisaOption]
    active_roadmap_id: UUID | None
    roadmaps: list[VisaRoadmapResponse]
    profile_snapshot: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VisaConsultationListItem(BaseModel):
    id: UUID
    visa_type: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class VisaRoadmapCreateRequest(BaseModel):
    """Body of POST /visa/consultations/{id}/roadmaps."""

    visa_type: str = Field(min_length=1, max_length=100)


class VisaProgressUpdateRequest(BaseModel):
    """
    Body of PATCH /visa/roadmaps/{id}/progress — the FULL set of completed step
    IDs, not a delta. Idempotent and last-write-wins, which avoids reconciling
    per-step toggles across two open tabs. The route filters these against the
    roadmap's actual checklist before storing.
    """

    completed_steps: list[str] = Field(max_length=500)
