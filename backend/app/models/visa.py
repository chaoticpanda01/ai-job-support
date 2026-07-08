from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.user import User


class VisaConsultation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Personalised visa roadmap generated from a snapshot of the user's profile.
    profile_snapshot preserves the profile state at generation time so the
    guidance remains consistent even if the user later updates their profile.
    """

    __tablename__ = "visa_consultations"

    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="visa_consultations_user_fk"),
        nullable=False,
        index=True,
    )
    visa_type: Mapped[str | None] = mapped_column(String(100))
    profile_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    checklist: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    ai_guidance: Mapped[str | None] = mapped_column(Text)

    # --- Relationships ---
    user: Mapped["User"] = relationship("User", back_populates="visa_consultations")
