"""Unit tests for visa response/request schemas."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from app.schemas.visa import (
    VisaConsultationResponse,
    VisaProgressUpdateRequest,
    VisaRoadmapCreateRequest,
    VisaRoadmapResponse,
)
from pydantic import ValidationError


def _now() -> datetime:
    return datetime.now(tz=UTC)


def test_roadmap_response_round_trips() -> None:
    payload = {
        "id": uuid.uuid4(),
        "visa_type": "技術・人文知識・国際業務",
        "ai_guidance": "Jalur ini realistis.",
        "checklist": {"phases": []},
        "completed_steps": ["step_1_1"],
        "created_at": _now(),
        "updated_at": _now(),
    }
    roadmap = VisaRoadmapResponse.model_validate(payload)
    assert roadmap.completed_steps == ["step_1_1"]


def test_consultation_response_defaults_options_and_roadmaps_to_empty() -> None:
    """A pre-existing consultation row has neither — it must still validate."""
    consultation = VisaConsultationResponse.model_validate(
        {
            "id": uuid.uuid4(),
            "visa_type": "技術・人文知識・国際業務",
            "ai_guidance": "Legacy guidance.",
            "checklist": {"phases": []},
            "options": [],
            "active_roadmap_id": None,
            "roadmaps": [],
            "profile_snapshot": {"nationality": "Indonesian"},
            "created_at": _now(),
            "updated_at": _now(),
        }
    )
    assert consultation.options == []
    assert consultation.roadmaps == []
    assert consultation.active_roadmap_id is None


def test_roadmap_create_request_requires_non_empty_visa_type() -> None:
    with pytest.raises(ValidationError):
        VisaRoadmapCreateRequest.model_validate({"visa_type": ""})


def test_roadmap_create_request_rejects_overlong_visa_type() -> None:
    with pytest.raises(ValidationError):
        VisaRoadmapCreateRequest.model_validate({"visa_type": "x" * 101})


def test_progress_request_accepts_empty_list() -> None:
    assert VisaProgressUpdateRequest.model_validate({"completed_steps": []}).completed_steps == []


def test_progress_request_caps_list_length() -> None:
    """Bound the payload — the column is not a general-purpose store."""
    with pytest.raises(ValidationError):
        VisaProgressUpdateRequest.model_validate({"completed_steps": ["s"] * 501})
