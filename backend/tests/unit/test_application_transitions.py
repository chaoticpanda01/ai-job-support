"""
The job pipeline's transition table (app.models.enums).

The frontend mirrors this table in lib/pipeline.ts to decide which buttons to
show. Both copies are pinned to tests/fixtures/application_transitions.json,
so changing one without the other fails a test on each side.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from app.models.enums import (
    APPLICATION_TRANSITIONS,
    ARCHIVED_STATUSES,
    ApplicationStatus,
    allowed_moves,
    reopen_target,
)

S = ApplicationStatus
FIXTURE = Path(__file__).parent.parent / "fixtures" / "application_transitions.json"


def test_the_statuses_are_declared_in_stage_order() -> None:
    assert [s.value for s in S] == [
        "planning",
        "preparing",
        "applied",
        "interviewing",
        "offered",
        "accepted",
        "rejected",
        "withdrawn",
        "skipped",
    ]


def test_every_status_has_an_entry() -> None:
    assert set(APPLICATION_TRANSITIONS) == set(S)


def test_the_table_matches_the_fixture_the_frontend_reads() -> None:
    expected = json.loads(FIXTURE.read_text())
    actual = {
        status.value: sorted(move.value for move in moves)
        for status, moves in APPLICATION_TRANSITIONS.items()
    }
    assert actual == expected


@pytest.mark.parametrize(
    ("start", "end"),
    [
        (S.planning, S.preparing),
        (S.planning, S.applied),
        (S.planning, S.skipped),
        (S.preparing, S.planning),
        (S.applied, S.rejected),
        (S.interviewing, S.offered),
        (S.offered, S.accepted),
        (S.offered, S.withdrawn),
        (S.accepted, S.withdrawn),
    ],
)
def test_a_forward_stage_can_make_its_moves(
    start: ApplicationStatus, end: ApplicationStatus
) -> None:
    assert end in allowed_moves(start, closed_from=None, has_applied=False)


@pytest.mark.parametrize(
    ("start", "end"),
    [
        (S.planning, S.offered),
        (S.planning, S.withdrawn),
        (S.planning, S.rejected),
        (S.preparing, S.interviewing),
        (S.applied, S.planning),
        (S.offered, S.rejected),
        (S.accepted, S.planning),
    ],
)
def test_a_move_off_the_table_is_refused(start: ApplicationStatus, end: ApplicationStatus) -> None:
    assert end not in allowed_moves(start, closed_from=None, has_applied=True)


def test_archived_statuses_have_no_moves_of_their_own() -> None:
    assert {S.rejected, S.withdrawn, S.skipped} == ARCHIVED_STATUSES
    for status in ARCHIVED_STATUSES:
        assert APPLICATION_TRANSITIONS[status] == frozenset()


def test_an_archived_job_reopens_only_where_it_left() -> None:
    assert allowed_moves(S.rejected, closed_from=S.interviewing, has_applied=True) == {
        S.interviewing
    }


@pytest.mark.parametrize(("has_applied", "target"), [(True, S.applied), (False, S.planning)])
def test_a_job_archived_before_closed_from_existed_falls_back(
    has_applied: bool, target: ApplicationStatus
) -> None:
    assert reopen_target(None, has_applied=has_applied) == target
    assert allowed_moves(S.withdrawn, closed_from=None, has_applied=has_applied) == {target}
