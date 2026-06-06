from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class VisaChecklistStep(BaseModel):
    id: str
    title: str
    detail: str
    required: bool
    estimated_weeks: int
    resources: list[str]


class VisaChecklistPhase(BaseModel):
    phase: str
    description: str
    steps: list[VisaChecklistStep]


class VisaChecklist(BaseModel):
    phases: list[VisaChecklistPhase]


class VisaConsultationResponse(BaseModel):
    id: UUID
    visa_type: str | None
    ai_guidance: str | None
    checklist: dict[str, Any] | None
    profile_snapshot: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VisaConsultationListItem(BaseModel):
    id: UUID
    visa_type: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
