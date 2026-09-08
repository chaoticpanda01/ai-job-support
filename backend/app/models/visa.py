from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import ForeignKey, Index, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.user import User


class VisaConsultation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    A visa assessment run against a snapshot of the user's profile.

    profile_snapshot preserves the profile state at generation time so the
    guidance stays consistent even if the user later updates their profile.

    options holds the assessed visa categories (see VisaOption in
    app/schemas/visa.py). visa_type / checklist / ai_guidance are LEGACY: they
    are populated only on rows created before the multi-roadmap change, and are
    left NULL on new rows, which is what lets old consultations keep rendering
    without a data migration. On new rows visa_type carries the AI's
    *recommended* category, denormalised so list views need no join.
    """

    __tablename__ = "visa_consultations"
    __table_args__ = (Index("idx_visa_consultations_user_id", "user_id"),)

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="visa_consultations_user_fk"),
        nullable=False,
    )
    visa_type: Mapped[str | None] = mapped_column(String(100))
    profile_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    checklist: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    ai_guidance: Mapped[str | None] = mapped_column(Text)
    options: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    # Intentionally NOT a ForeignKey: visa_roadmaps points back at this table,
    # and a circular FK makes cascade-delete ordering fragile. The API layer
    # only ever sets this to a roadmap it just fetched or created for this row.
    active_roadmap_id: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True))

    # --- Relationships ---
    user: Mapped["User"] = relationship("User", back_populates="visa_consultations")
    roadmaps: Mapped[list["VisaRoadmap"]] = relationship(
        "VisaRoadmap",
        back_populates="consultation",
        cascade="all, delete-orphan",
        order_by="VisaRoadmap.created_at",
    )


class VisaRoadmap(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    A generated roadmap for ONE visa category the user chose from a
    consultation's assessed options.

    user_id is denormalised so BaseRepository.get_owned() can enforce ownership
    in the WHERE clause instead of a hand-rolled join + check.

    completed_steps is TEXT[] rather than JSONB because it is the one field
    that mutates frequently — a single-row array UPDATE beats a
    read-modify-write of the whole checklist document.
    """

    __tablename__ = "visa_roadmaps"
    __table_args__ = (
        UniqueConstraint(
            "consultation_id", "visa_type", name="visa_roadmaps_consultation_visa_uk"
        ),
        Index("idx_visa_roadmaps_consultation", "consultation_id"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="visa_roadmaps_user_fk"),
        nullable=False,
    )
    consultation_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey(
            "visa_consultations.id",
            ondelete="CASCADE",
            name="visa_roadmaps_consultation_fk",
        ),
        nullable=False,
    )
    visa_type: Mapped[str] = mapped_column(String(100), nullable=False)
    ai_guidance: Mapped[str | None] = mapped_column(Text)
    checklist: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    completed_steps: Mapped[list[str]] = mapped_column(
        ARRAY(Text()), nullable=False, server_default=text("'{}'")
    )

    # --- Relationships ---
    consultation: Mapped["VisaConsultation"] = relationship(
        "VisaConsultation", back_populates="roadmaps"
    )
