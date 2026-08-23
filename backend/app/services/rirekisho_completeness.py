"""
Pure completeness check for rirekisho (履歴書) generation.

Single source of truth for "what does a profile need before a rirekisho can
be generated". Used today by:
  - document_generator.py, which raises DocumentGenerationError with the
    joined labels before spending any AI budget on a doomed generation.

Designed to also be reused by the /auth/me* routes (a planned follow-up),
which will expose the same missing-field list to the frontend (Settings
page live banner, and the rirekisho generation wizard's pre-flight gate)
so the UI never has to guess or duplicate this logic.
"""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING, TypedDict

from app.models.enums import VisaStatus

if TYPE_CHECKING:
    from app.models.user import Profile, User


class MissingFieldEntry(TypedDict):
    key: str
    label: str


def rirekisho_missing_fields(user: User, profile: Profile | None) -> list[MissingFieldEntry]:
    """
    Returns [] if `user`/`profile` have everything needed to generate a
    rirekisho. Otherwise returns one {"key", "label"} entry per unmet
    requirement, in a fixed order.
    """
    missing: list[MissingFieldEntry] = []

    if not user.full_name:
        missing.append({"key": "full_name", "label": "full name"})

    if profile is None or not profile.name_kana:
        missing.append({"key": "name_kana", "label": "name in kana (ふりがな)"})

    if profile is None or profile.date_of_birth is None:
        missing.append({"key": "date_of_birth", "label": "date of birth"})
    else:
        today = date.today()
        dob = profile.date_of_birth
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        if not (16 <= age <= 80):
            missing.append(
                {
                    "key": "date_of_birth",
                    "label": "a valid date of birth (age must be between 16 and 80)",
                }
            )

    if profile is None or profile.gender is None:
        missing.append({"key": "gender", "label": "gender"})

    if profile is None or not profile.phone_number:
        missing.append({"key": "phone_number", "label": "phone number"})

    if profile is None or not profile.mailing_address:
        missing.append({"key": "mailing_address", "label": "mailing address"})

    if profile is not None and profile.visa_status == VisaStatus.held:
        if not profile.visa_category:
            missing.append({"key": "visa_category", "label": "visa category"})
        if profile.residence_card_expiration is None:
            missing.append(
                {
                    "key": "residence_card_expiration",
                    "label": "residence card expiration date",
                }
            )

    return missing
