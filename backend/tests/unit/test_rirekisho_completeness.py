"""
Unit tests for rirekisho_missing_fields().

Pure function, no I/O — tests use the same make_user/make_profile factories
as test_auth_routes.py.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.models.enums import Gender, VisaStatus
from app.services.rirekisho_completeness import rirekisho_missing_fields

from tests.conftest import make_profile, make_user


def _complete_profile():
    p = make_profile()
    p.name_kana = "ヤマダ タロウ"
    p.date_of_birth = date(1990, 1, 15)
    p.gender = Gender.male
    p.phone_number = "090-1234-5678"
    p.mailing_address = "東京都渋谷区"
    p.visa_status = VisaStatus.none
    return p


def test_complete_profile_returns_no_missing_fields() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    assert rirekisho_missing_fields(user, profile) == []


def test_missing_full_name() -> None:
    user = make_user(full_name=None)
    profile = _complete_profile()
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "full_name" in keys


def test_missing_name_kana() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    profile.name_kana = None
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "name_kana" in keys


def test_missing_date_of_birth() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    profile.date_of_birth = None
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "date_of_birth" in keys


def test_age_below_16_is_invalid() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    today = date.today()
    profile.date_of_birth = date(today.year - 15, today.month, today.day)
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "date_of_birth" in keys


def test_age_exactly_16_is_valid() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    today = date.today()
    profile.date_of_birth = date(today.year - 16, today.month, today.day) - timedelta(days=1)
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "date_of_birth" not in keys


def test_age_exactly_80_is_valid() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    today = date.today()
    profile.date_of_birth = date(today.year - 80, today.month, today.day)
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "date_of_birth" not in keys


def test_age_81_is_invalid() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    today = date.today()
    profile.date_of_birth = date(today.year - 81, today.month, today.day)
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "date_of_birth" in keys


def test_missing_gender() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    profile.gender = None
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "gender" in keys


def test_missing_phone_number() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    profile.phone_number = None
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "phone_number" in keys


def test_missing_mailing_address() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    profile.mailing_address = None
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "mailing_address" in keys


def test_visa_held_requires_category_and_expiration() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    profile.visa_status = VisaStatus.held
    profile.visa_category = None
    profile.residence_card_expiration = None
    keys = [m["key"] for m in rirekisho_missing_fields(user, profile)]
    assert "visa_category" in keys
    assert "residence_card_expiration" in keys


def test_visa_held_with_both_fields_present_is_complete() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    profile.visa_status = VisaStatus.held
    profile.visa_category = "技術・人文知識・国際業務"
    profile.residence_card_expiration = date(2030, 1, 1)
    assert rirekisho_missing_fields(user, profile) == []


def test_visa_not_held_does_not_require_category_or_expiration() -> None:
    user = make_user(full_name="山田 太郎")
    profile = _complete_profile()
    profile.visa_status = VisaStatus.pending
    profile.visa_category = None
    profile.residence_card_expiration = None
    assert rirekisho_missing_fields(user, profile) == []


def test_profile_none_reports_every_profile_dependent_field() -> None:
    user = make_user(full_name="山田 太郎")
    keys = [m["key"] for m in rirekisho_missing_fields(user, None)]
    assert keys == [
        "name_kana",
        "date_of_birth",
        "gender",
        "phone_number",
        "mailing_address",
    ]
