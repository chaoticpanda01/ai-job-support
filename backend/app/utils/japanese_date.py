"""
Japanese era (和暦) date utilities.

Converts between Western (Gregorian) years and Japanese imperial era names.

Supported eras (covering the range relevant to resumes):
  昭和 (Shōwa)  1926-12-25 → 1989-01-07
  平成 (Heisei)  1989-01-08 → 2019-04-30
  令和 (Reiwa)   2019-05-01 → present

Usage:
    from app.utils.japanese_date import western_to_wareki, format_wareki_date

    western_to_wareki(2024, 3)   → ("令和", 6)
    format_wareki_date(2024, 3)  → "令和6年3月"
    format_wareki_date(1995, 3)  → "平成7年3月"
    wareki_to_western("平成", 7) → 1995
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

# ---------------------------------------------------------------------------
# Era table — sorted oldest first for range lookups
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _Era:
    name_ja: str  # e.g. "令和"
    name_romaji: str  # e.g. "Reiwa"
    start: date  # first day of this era (inclusive)


_ERAS: tuple[_Era, ...] = (
    _Era("昭和", "Showa", date(1926, 12, 25)),
    _Era("平成", "Heisei", date(1989, 1, 8)),
    _Era("令和", "Reiwa", date(2019, 5, 1)),
)


class EraConversionError(ValueError):
    """Raised when a date falls outside all known eras."""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def western_to_wareki(year: int, month: int = 1) -> tuple[str, int]:
    """
    Convert a Western year (+ optional month) to a Japanese era name and year number.

    Returns (era_name_ja, era_year), e.g. ("令和", 6) for 2024.
    Raises EraConversionError if the date predates our earliest supported era.

    Month defaults to 1 so callers that only have a year still get a
    deterministic era — important for rirekisho education entries that only
    record year and month (not a full date).
    """
    d = date(year, month, 1)

    # Walk eras newest-first to find the matching era
    for era in reversed(_ERAS):
        if d >= era.start:
            era_year = year - era.start.year + 1
            return era.name_ja, era_year

    raise EraConversionError(
        f"Year {year}/{month} predates the earliest supported era "
        f"({_ERAS[0].name_ja}, {_ERAS[0].start})."
    )


def wareki_to_western(era_name: str, era_year: int) -> int:
    """
    Convert a Japanese era name and year number to a Western year.

    Accepts both kanji (e.g. "令和") and romaji (e.g. "Reiwa").
    Raises EraConversionError for unknown era names.
    """
    for era in _ERAS:
        if era_name in (era.name_ja, era.name_romaji):
            return era.start.year + era_year - 1
    raise EraConversionError(f"Unknown era name: '{era_name}'")


def format_wareki_date(year: int, month: int, *, include_month: bool = True) -> str:
    """
    Format a Gregorian year/month as a Japanese era date string.

    Examples:
        format_wareki_date(2024, 3)              → "令和6年3月"
        format_wareki_date(1989, 4)              → "平成1年4月"
        format_wareki_date(2024, 3, include_month=False) → "令和6年"

    Falls back to Western year string (e.g. "2024年3月") if the date
    is outside all known eras rather than raising — keeps the PDF renderer
    working even with unusual data.
    """
    try:
        era_name, era_year = western_to_wareki(year, month)
    except EraConversionError:
        if include_month:
            return f"{year}年{month}月"
        return f"{year}年"

    if include_month:
        return f"{era_name}{era_year}年{month}月"
    return f"{era_name}{era_year}年"


def format_wareki_full(year: int, month: int, day: int) -> str:
    """
    Format a full date (year/month/day) in Japanese era notation.

    Example: format_wareki_full(1990, 5, 15) → "平成2年5月15日"
    """
    try:
        era_name, era_year = western_to_wareki(year, month)
    except EraConversionError:
        return f"{year}年{month}月{day}日"
    return f"{era_name}{era_year}年{month}月{day}日"


def current_wareki_date() -> str:
    """Return today's date in Japanese era notation, e.g. '令和7年6月6日'."""
    today = date.today()
    return format_wareki_full(today.year, today.month, today.day)
