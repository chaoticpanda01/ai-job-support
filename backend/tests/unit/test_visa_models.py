"""Unit tests for visa ORM model definitions (no DB required)."""

from __future__ import annotations

from app.models.visa import VisaConsultation, VisaRoadmap


def test_visa_consultation_has_options_and_active_roadmap_columns() -> None:
    columns = VisaConsultation.__table__.columns
    assert "options" in columns
    assert "active_roadmap_id" in columns
    assert columns["options"].nullable is False


def test_visa_roadmap_table_shape() -> None:
    columns = VisaRoadmap.__table__.columns
    for name in (
        "id",
        "user_id",
        "consultation_id",
        "visa_type",
        "ai_guidance",
        "checklist",
        "completed_steps",
        "created_at",
        "updated_at",
    ):
        assert name in columns, f"missing column: {name}"
    assert columns["visa_type"].nullable is False
    assert columns["checklist"].nullable is False
    assert columns["completed_steps"].nullable is False
    assert columns["ai_guidance"].nullable is True


def test_visa_roadmap_has_unique_constraint_on_consultation_and_visa_type() -> None:
    constraint_names = {c.name for c in VisaRoadmap.__table__.constraints}
    assert "visa_roadmaps_consultation_visa_uk" in constraint_names


def test_visa_consultation_exposes_roadmaps_relationship() -> None:
    assert "roadmaps" in VisaConsultation.__mapper__.relationships
