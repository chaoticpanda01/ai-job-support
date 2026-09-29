# Job Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the job tracker into a pipeline. Each saved job moves through
Saved → Preparing → Applied → Interviewing → Offer → Accepted, with Closed
and Skipped branches that can be reopened. Each stage links to the tool that
helps with it.

**Architecture:**
- **Backend:** the backend owns the rules. The status enum gains three
  values and a `closed_from` column, and `PATCH /jobs/applications/{id}`
  enforces a transition table defined next to the enum.
- **Frontend logic:** the frontend mirrors that table in `lib/pipeline.ts`,
  a plain-logic module. A JSON fixture pins the two copies together.
- **Pages:** the Jobs list, Job detail and Pipeline board are rebuilt on the
  design system around two new components, `StageBadge` and `StagePanel`.
  Once they are rebuilt, the design guard loses its last exemptions.

**Tech Stack:**
- **Backend:** FastAPI, SQLAlchemy 2 async, Alembic and Postgres, tested
  with pytest.
- **Frontend:** Next.js 15 App Router (typedRoutes), React 19, Tailwind 3.4
  design tokens and TanStack Query 5, tested with vitest, jsdom and Testing
  Library.

**Spec:** [docs/superpowers/specs/2026-09-27-job-pipeline-design.md](../specs/2026-09-27-job-pipeline-design.md)

## Global Constraints

- **Status values:** the stored values stay `planning`, `applied`, `interviewing`, `offered`, `rejected` and `withdrawn`; three are added: `preparing`, `accepted`, `skipped`. Nothing is renamed.
- **Enum order:** `planning, preparing, applied, interviewing, offered, accepted, rejected, withdrawn, skipped`.
- **Invalid move:** a 422 with the detail `Can't move an application from '<from>' to '<to>'.` Sending the current status is a no-op, not a 422.
- **No new endpoints:** reopening is a PATCH to the reopen target (`closed_from`, or `applied` if `applied_at` is set, else `planning`).
- **No new npm or pip packages.** No new AI features, and no AI calls during verification.
- **Design system:** design tokens only. There must be no Tailwind palette colours, no `text-primary`, `ring-primary*` or `bg-primary/5|10`, no emoji or arrow glyphs (in code or in i18n strings), and no raw `<input>`, `<select>` or `<textarea>`. `tests/design-guard.test.ts` and `tests/lib/design-tokens.test.ts` enforce this.
- **Text:** every new string is in `lib/i18n.ts` in `en`, `id` and `ja`, with the same `{placeholders}` in all three.
- **Enum member lines** in `backend/app/models/enums.py` stay exactly `    name = "value"` with no trailing comment. `frontend/tests/invariants.test.ts` parses them with `^ {4}(\w+) = "(\w+)"$`.
- **Types:** TypeScript has `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` on. Props that may receive `undefined` are typed `?: T | undefined`, and hrefs built at runtime are cast `as Route`.
- **Never run `npm run build`** while the dev server runs. The user signs in to the app themselves. Commit only when the user asks.
- **Formatting:** code in this plan is written to Prettier's style, but run `npx prettier --write <changed files>` (frontend) and `.venv/bin/ruff format <changed files>` (backend) before the format checks, and don't hand-fix formatting.
- **Checks:**
  - Frontend, from `frontend/`: `npm test`, `npm run lint`, `npm run type-check` and `npm run format:check`.
  - Backend, from `backend/`: `.venv/bin/ruff check .`, `.venv/bin/ruff format --check .`, `.venv/bin/mypy app` and `.venv/bin/python -m pytest -q`.

## Plan amendments (decided while writing the plan)

1. **`allowed_moves` signature.** The spec names `allowed_moves(app)`.
   `enums.py` can't import the model without a cycle, so the function takes
   plain values instead:
   - `allowed_moves(status, *, closed_from, has_applied)`
   - `reopen_target(closed_from, *, has_applied)`
2. **Pipeline board columns.** Six columns at `lg` (1024px) leave about
   115px per column beside the sidebar, which is too narrow for a card. The
   board is therefore:
   - one stacked column below `sm`
   - two columns from `sm`, three from `xl`
   - all six from `2xl` (1536px)

   Stages still stack and never scroll sideways.
3. **Interview company prefill.** The Interviewing link's `company` uses
   `structured_data.company_name`, falling back to `original_company` when
   there is no structured data.
4. **Moves on the board.** Moves are made through one `useUpdateApplication`
   held by the page, with `mutateAsync`. A card unmounts from its old column
   the moment the optimistic update moves it, and a mutation's per-call
   callbacks don't fire after the calling component unmounts. The page stays
   mounted, so its awaited promise always reports a refused move.

5. **Job detail on phones (made during Task 5).** The plan's two-column grid
   overflowed a 375px screen (a grid item's minimum width is its content's),
   and put the stage panel 1,600px down the page, below the whole posting.
   The columns got `min-w-0`, the description `break-words`, and below `lg`
   the right column's cards join the grid (`max-lg:contents`, with
   `lg:space-y-6`) so the stage panel comes first. From `lg` up nothing
   changes. The `StagePanel` mock in `jobs-detail.test.tsx` carries the job id
   as a `data-job-id` attribute rather than text, because the ID card already
   prints it and `getByText` then found two.

---

## File map

**Backend**
- Modify `backend/app/models/enums.py`:
  - add the three statuses in stage order
  - add `ARCHIVED_STATUSES`, `APPLICATION_TRANSITIONS`, `reopen_target()` and `allowed_moves()`
- Modify `backend/app/models/job.py`: the `closed_from` column and the docstring.
- Create `backend/migrations/versions/0011_application_pipeline.py`.
- Modify `database/schema.sql`: the enum values and the column.
- Create `backend/tests/fixtures/application_transitions.json`.
- Create `backend/tests/unit/test_application_transitions.py`.
- Create `backend/tests/integration/test_application_pipeline.py`.
- Modify `backend/app/schemas/job.py`: typed `status`, and `closed_from` in the response.
- Modify `backend/app/api/v1/jobs.py`: enforce moves, set `closed_from`, return it.
- Modify `backend/tests/unit/test_job_routes.py`.

**Frontend**
- Modify `frontend/types/api.ts`: `ApplicationStatus` and `JobApplication.closed_from`.
- Create `frontend/lib/pipeline.ts`.
- Modify `frontend/lib/tones.ts`: `JOB_SCORE_BANDS`.
- Modify `frontend/lib/i18n.ts`: new keys (each task adds its own), then the deletions (Task 9).
- Modify `frontend/hooks/useApplications.ts`: optimistic `useUpdateApplication`.
- Create `frontend/components/jobs/stage-badge.tsx` and `frontend/components/jobs/stage-panel.tsx`.
- Rewrite `frontend/app/dashboard/jobs/[id]/page.tsx`, `frontend/app/dashboard/jobs/page.tsx` and `frontend/app/dashboard/jobs/applications/page.tsx`.
- Modify `frontend/app/dashboard/interview/new/page.tsx`: the `role`/`company` prefill.
- Modify `frontend/lib/journey.ts` and `frontend/app/dashboard/page.tsx`: the applied rule and the pipeline summary.
- Modify `frontend/tests/design-guard.test.ts`: drop the exemptions.
- Tests:
  - `frontend/tests/lib/pipeline.test.ts`
  - `frontend/tests/lib/tones.test.ts`
  - `frontend/tests/invariants.test.ts`
  - `frontend/tests/components/stage-panel.test.tsx`
  - `frontend/tests/hooks/useApplications.test.tsx`
  - `frontend/tests/app/jobs-detail.test.tsx`
  - `frontend/tests/app/jobs-list.test.tsx`
  - `frontend/tests/app/pipeline.test.tsx`
  - `frontend/tests/app/interview-new.test.tsx`
  - `frontend/tests/lib/journey.test.ts`
  - `frontend/tests/app/home.test.tsx`

---

### Task 1: Statuses, transitions and the migration (backend)

**Files:**
- Modify: `backend/app/models/enums.py` (class `ApplicationStatus`, around line 201)
- Modify: `backend/app/models/job.py` (class `JobApplication`, around line 215)
- Modify: `database/schema.sql` (line 49 enum, lines 311-324 table)
- Create: `backend/migrations/versions/0011_application_pipeline.py`
- Create: `backend/tests/fixtures/application_transitions.json`
- Test: `backend/tests/unit/test_application_transitions.py`
- Test: `backend/tests/integration/test_application_pipeline.py`

**Interfaces:**
- Produces:
  - **`ApplicationStatus` members, in order:** `planning`, `preparing`, `applied`, `interviewing`, `offered`, `accepted`, `rejected`, `withdrawn`, `skipped`.
  - **`ARCHIVED_STATUSES: frozenset[ApplicationStatus]`** = {rejected, withdrawn, skipped}.
  - **`APPLICATION_TRANSITIONS: dict[ApplicationStatus, frozenset[ApplicationStatus]]`.**
  - **`reopen_target(closed_from: ApplicationStatus | None, *, has_applied: bool) -> ApplicationStatus`.**
  - **`allowed_moves(status: ApplicationStatus, *, closed_from: ApplicationStatus | None, has_applied: bool) -> frozenset[ApplicationStatus]`.**
  - **`JobApplication.closed_from: Mapped[ApplicationStatus | None]`.**
  - **The fixture file**, `backend/tests/fixtures/application_transitions.json`. It maps each status value to a sorted list of the values it can move to. Task 3 reads it from the frontend.

- [ ] **Step 1: Write the fixture file**

Create `backend/tests/fixtures/application_transitions.json`:

```json
{
  "planning": ["applied", "preparing", "skipped"],
  "preparing": ["applied", "planning", "withdrawn"],
  "applied": ["interviewing", "preparing", "rejected", "withdrawn"],
  "interviewing": ["applied", "offered", "rejected", "withdrawn"],
  "offered": ["accepted", "interviewing", "withdrawn"],
  "accepted": ["offered", "withdrawn"],
  "rejected": [],
  "withdrawn": [],
  "skipped": []
}
```

- [ ] **Step 2: Write the failing unit tests**

Create `backend/tests/unit/test_application_transitions.py`:

```python
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
def test_a_forward_stage_can_make_its_moves(start: ApplicationStatus, end: ApplicationStatus) -> None:
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
    assert ARCHIVED_STATUSES == {S.rejected, S.withdrawn, S.skipped}
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/unit/test_application_transitions.py -q`
Expected: FAIL with `ImportError: cannot import name 'APPLICATION_TRANSITIONS'`.

- [ ] **Step 4: Add the statuses and the table to `enums.py`**

Replace the `ApplicationStatus` class in `backend/app/models/enums.py` with:

```python
class ApplicationStatus(str, enum.Enum):
    """
    Where a tracked job is in the user's pipeline, declared in stage order (the
    database enum has the same order). The UI shows planning as "Saved" and
    offered as "Offer". rejected, withdrawn and skipped are archived: rejected
    and withdrawn are "Closed" (declining an offer is withdrawing), skipped is
    a saved job the user chose not to apply for.
    """

    planning = "planning"
    preparing = "preparing"
    applied = "applied"
    interviewing = "interviewing"
    offered = "offered"
    accepted = "accepted"
    rejected = "rejected"
    withdrawn = "withdrawn"
    skipped = "skipped"


ARCHIVED_STATUSES: frozenset[ApplicationStatus] = frozenset(
    {ApplicationStatus.rejected, ApplicationStatus.withdrawn, ApplicationStatus.skipped}
)

_AS = ApplicationStatus

# Every move a tracked job can make. Each forward stage can also go back one
# step, to undo a mis-click. An archived job has no moves of its own: it only
# reopens, to the stage it left (see allowed_moves). Mirrored in
# frontend/lib/pipeline.ts; both are pinned to
# tests/fixtures/application_transitions.json.
APPLICATION_TRANSITIONS: dict[ApplicationStatus, frozenset[ApplicationStatus]] = {
    _AS.planning: frozenset({_AS.preparing, _AS.applied, _AS.skipped}),
    _AS.preparing: frozenset({_AS.applied, _AS.withdrawn, _AS.planning}),
    _AS.applied: frozenset({_AS.interviewing, _AS.rejected, _AS.withdrawn, _AS.preparing}),
    _AS.interviewing: frozenset({_AS.offered, _AS.rejected, _AS.withdrawn, _AS.applied}),
    _AS.offered: frozenset({_AS.accepted, _AS.withdrawn, _AS.interviewing}),
    _AS.accepted: frozenset({_AS.withdrawn, _AS.offered}),
    _AS.rejected: frozenset(),
    _AS.withdrawn: frozenset(),
    _AS.skipped: frozenset(),
}


def reopen_target(
    closed_from: ApplicationStatus | None, *, has_applied: bool
) -> ApplicationStatus:
    """
    Where an archived job goes back to: the stage it left. Jobs archived before
    closed_from existed have none, so they return to Applied if the user had
    applied, and to Saved otherwise.
    """
    if closed_from is not None:
        return closed_from
    return _AS.applied if has_applied else _AS.planning


def allowed_moves(
    status: ApplicationStatus,
    *,
    closed_from: ApplicationStatus | None,
    has_applied: bool,
) -> frozenset[ApplicationStatus]:
    """The statuses a job at `status` may move to."""
    if status in ARCHIVED_STATUSES:
        return frozenset({reopen_target(closed_from, has_applied=has_applied)})
    return APPLICATION_TRANSITIONS[status]
```

- [ ] **Step 5: Run the unit tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/unit/test_application_transitions.py -q`
Expected: PASS (all tests).

- [ ] **Step 6: Add the column to the model**

In `backend/app/models/job.py`, class `JobApplication`:

1. Replace the class docstring's transitions paragraph:

   ```python
       """
       Tracks a user's application pipeline per job.

       Status transitions are APPLICATION_TRANSITIONS in app.models.enums:
           planning → preparing → applied → interviewing → offered → accepted,
           each forward stage can step back one, and rejected, withdrawn or
           skipped archive a job. closed_from records the stage an archived
           job left, so reopening returns it there.
       """
   ```

2. After the `notes` column, add:

   ```python
       # The stage an archived job (rejected, withdrawn, skipped) left, so
       # reopening returns it there. NULL for any other status, and for jobs
       # archived before this column existed.
       closed_from: Mapped[ApplicationStatus | None] = mapped_column(sa_application_status)
   ```

   `sa_application_status` and `ApplicationStatus` are already imported in this module (the `status` column uses them).

- [ ] **Step 7: Write the migration**

Create `backend/migrations/versions/0011_application_pipeline.py`:

```python
"""add the job pipeline statuses and job_applications.closed_from

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-27

The tracker becomes a pipeline: Saved (planning) -> Preparing -> Applied ->
Interviewing -> Offer (offered) -> Accepted, with Closed (rejected, withdrawn)
and Skipped branches that can be reopened. This adds the three new statuses in
stage order, and closed_from, which records the stage an archived job left so
reopening can return it there.

Postgres cannot drop an enum value, so the downgrade moves rows off the new
values and drops the column, but the three values stay in the type.
"""

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'preparing' AFTER 'planning'")
    op.execute("ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'accepted' AFTER 'offered'")
    op.execute("ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'skipped' AFTER 'withdrawn'")
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE job_applications ADD COLUMN closed_from application_status;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)


def downgrade() -> None:
    op.execute("UPDATE job_applications SET status = 'planning' WHERE status = 'preparing'")
    op.execute("UPDATE job_applications SET status = 'offered' WHERE status = 'accepted'")
    op.execute("UPDATE job_applications SET status = 'withdrawn' WHERE status = 'skipped'")
    op.drop_column("job_applications", "closed_from")
```

- [ ] **Step 8: Update `database/schema.sql`**

Line 49 becomes:

```sql
CREATE TYPE application_status   AS ENUM ('planning', 'preparing', 'applied', 'interviewing', 'offered', 'accepted', 'rejected', 'withdrawn', 'skipped');
```

In `CREATE TABLE job_applications`, after the `notes TEXT,` line add:

```sql
  closed_from     application_status,
```

- [ ] **Step 9: Apply the migration to the local database**

Run: `cd backend && .venv/bin/alembic upgrade head`
Expected: output ends with `Running upgrade 0010 -> 0011, add the job pipeline statuses and job_applications.closed_from`.

- [ ] **Step 10: Write the integration test**

Create `backend/tests/integration/test_application_pipeline.py`:

```python
"""
The migrated application_status enum and job_applications.closed_from, against
real Postgres. The route tests mock the session, so they can't show that the
database accepts the new values; this does.

Seeded rows are deleted explicitly: job_postings.submitted_by is ON DELETE SET
NULL, so deleting the user alone would leave the posting behind.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from app.database import AsyncSessionFactory
from app.models.enums import ApplicationStatus, JobSourcePlatform, OriginalLanguage
from app.models.job import JobApplication, JobPosting
from app.models.user import User
from sqlalchemy import delete, select, text

pytestmark = pytest.mark.asyncio


class _World:
    user_id: uuid.UUID
    posting_id: uuid.UUID
    application_id: uuid.UUID


@pytest.fixture
async def world() -> AsyncIterator[_World]:
    w = _World()
    token = uuid.uuid4().hex[:12]
    try:
        async with AsyncSessionFactory() as session:
            user = User(clerk_id=f"clerk_pipeline_{token}", email=f"p-{token}@example.com")
            session.add(user)
            await session.flush()
            posting = JobPosting(
                source_url=None,
                source_platform=JobSourcePlatform.manual,
                original_language=OriginalLanguage.ja,
                original_description="a private paste",
                submitted_by=user.id,
            )
            session.add(posting)
            await session.flush()
            application = JobApplication(user_id=user.id, job_posting_id=posting.id)
            session.add(application)
            await session.commit()
            w.user_id, w.posting_id, w.application_id = user.id, posting.id, application.id
        yield w
    finally:
        async with AsyncSessionFactory() as session:
            await session.execute(delete(JobPosting).where(JobPosting.id == w.posting_id))
            await session.execute(delete(User).where(User.id == w.user_id))
            await session.commit()


async def test_the_enum_lists_the_stages_in_order() -> None:
    async with AsyncSessionFactory() as session:
        values = (
            await session.execute(text("SELECT enum_range(NULL::application_status)::text[]"))
        ).scalar_one()
    assert values == [s.value for s in ApplicationStatus]


@pytest.mark.parametrize(
    ("status", "closed_from"),
    [
        (ApplicationStatus.preparing, None),
        (ApplicationStatus.accepted, None),
        (ApplicationStatus.skipped, ApplicationStatus.planning),
        (ApplicationStatus.rejected, ApplicationStatus.interviewing),
    ],
)
async def test_a_row_holds_the_new_statuses_and_closed_from(
    world: _World, status: ApplicationStatus, closed_from: ApplicationStatus | None
) -> None:
    async with AsyncSessionFactory() as session:
        row = await session.get(JobApplication, world.application_id)
        assert row is not None
        row.status = status
        row.closed_from = closed_from
        await session.commit()

    async with AsyncSessionFactory() as session:
        stored = await session.scalar(
            select(JobApplication).where(JobApplication.id == world.application_id)
        )
    assert stored is not None
    assert stored.status == status
    assert stored.closed_from == closed_from
```

- [ ] **Step 11: Run the backend checks**

Run: `cd backend && .venv/bin/python -m pytest tests/unit/test_application_transitions.py tests/integration/test_application_pipeline.py -q && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/mypy app`
Expected: all PASS, no lint or type errors. If `ruff format --check` reports files, run `.venv/bin/ruff format <file>` on the files this task touched and re-run.

- [ ] **Step 12: Commit**

```bash
git add backend/app/models/enums.py backend/app/models/job.py backend/migrations/versions/0011_application_pipeline.py database/schema.sql backend/tests/fixtures/application_transitions.json backend/tests/unit/test_application_transitions.py backend/tests/integration/test_application_pipeline.py
git commit -m "feat(jobs): pipeline statuses, transitions and closed_from"
```

---

### Task 2: Enforce the moves in the API (backend)

**Files:**
- Modify: `backend/app/schemas/job.py:154-175`
- Modify: `backend/app/api/v1/jobs.py` (`_application_response`, `list_applications` docstring, `update_application`; module docstring lines 10-14)
- Test: `backend/tests/unit/test_job_routes.py` (`_mock_application` at line 141, PATCH tests from line 694)

**Interfaces:**
- Consumes: `ARCHIVED_STATUSES`, `ApplicationStatus` and `allowed_moves` from Task 1.
- Produces:
  - **Response:** `JobApplicationResponse.closed_from: str | None`.
  - **Request:** `UpdateApplicationRequest.status: ApplicationStatus | None`.
  - **PATCH behaviour:** as in the spec.

- [ ] **Step 1: Give the mock application a `closed_from`**

In `_mock_application` in `backend/tests/unit/test_job_routes.py`, after `application.applied_at = None`, add:

```python
    application.closed_from = None
```

A `MagicMock` attribute would otherwise be a mock, and building the response would fail.

- [ ] **Step 2: Write the failing route tests**

Add these after `test_update_application_notes_only` in `backend/tests/unit/test_job_routes.py`:

```python
async def _patch_status(
    application: MagicMock, status: str
) -> tuple[Any, AsyncMock]:
    """PATCH a status as the application's owner; returns the response and the update mock."""
    user = make_user()
    application.user_id = user.id
    update = AsyncMock(return_value=application)
    with (
        _bypass_middleware(user),
        _fake_db_session(scalar_results=[application, application]),
        patch("app.repositories.job.JobApplicationRepository.update", new=update),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(
                f"/api/v1/jobs/applications/{application.id}",
                headers=_auth_headers(),
                json={"status": status},
            )
    return resp, update


@pytest.mark.asyncio
async def test_update_application_refuses_a_move_off_the_table() -> None:
    application = _mock_application()  # planning

    resp, update = await _patch_status(application, "offered")

    assert resp.status_code == 422
    assert resp.json()["detail"] == "Can't move an application from 'planning' to 'offered'."
    update.assert_not_awaited()


@pytest.mark.asyncio
async def test_update_application_to_its_own_status_changes_nothing() -> None:
    application = _mock_application()  # planning

    resp, update = await _patch_status(application, "planning")

    assert resp.status_code == 200
    update.assert_not_awaited()


@pytest.mark.asyncio
async def test_update_application_records_where_a_closed_job_came_from() -> None:
    application = _mock_application()
    application.status = ApplicationStatus.interviewing
    application.applied_at = datetime.now(tz=UTC)

    resp, update = await _patch_status(application, "rejected")

    assert resp.status_code == 200
    update.assert_awaited_once_with(
        application,
        status=ApplicationStatus.rejected,
        closed_from=ApplicationStatus.interviewing,
    )


@pytest.mark.asyncio
async def test_update_application_reopens_where_it_left_and_clears_closed_from() -> None:
    application = _mock_application()
    application.status = ApplicationStatus.rejected
    application.closed_from = ApplicationStatus.interviewing
    application.applied_at = datetime.now(tz=UTC)

    resp, update = await _patch_status(application, "interviewing")

    assert resp.status_code == 200
    update.assert_awaited_once_with(
        application, status=ApplicationStatus.interviewing, closed_from=None
    )


@pytest.mark.asyncio
async def test_update_application_will_not_reopen_somewhere_else() -> None:
    application = _mock_application()
    application.status = ApplicationStatus.rejected
    application.closed_from = ApplicationStatus.interviewing

    resp, _ = await _patch_status(application, "offered")

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_update_application_reopens_an_old_closed_job_at_applied() -> None:
    # Closed before closed_from existed, after applying.
    application = _mock_application()
    application.status = ApplicationStatus.withdrawn
    application.applied_at = datetime.now(tz=UTC)

    resp, update = await _patch_status(application, "applied")

    assert resp.status_code == 200
    update.assert_awaited_once_with(
        application, status=ApplicationStatus.applied, closed_from=None
    )


@pytest.mark.asyncio
async def test_update_application_sets_applied_at_the_first_time_only() -> None:
    application = _mock_application()  # planning, never applied

    resp, update = await _patch_status(application, "applied")

    assert resp.status_code == 200
    kwargs = update.await_args.kwargs
    assert kwargs["status"] == ApplicationStatus.applied
    assert isinstance(kwargs["applied_at"], datetime)


@pytest.mark.asyncio
async def test_update_application_returns_closed_from() -> None:
    application = _mock_application()
    application.status = ApplicationStatus.skipped
    application.closed_from = ApplicationStatus.planning

    resp, _ = await _patch_status(application, "skipped")  # a no-op, returns the row

    assert resp.json()["closed_from"] == "planning"
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/unit/test_job_routes.py -q -k "update_application"`
Expected:
- `refuses_a_move_off_the_table`, `will_not_reopen_somewhere_else` and `records_where…` FAIL, because moves aren't checked and no `closed_from` is passed.
- `returns_closed_from` FAILS with a `KeyError`.

- [ ] **Step 4: Type the request and add the response field**

In `backend/app/schemas/job.py`:

1. Add the import next to the others:

   ```python
   from app.models.enums import ApplicationStatus
   ```

2. In `JobApplicationResponse`, after `notes: str | None`, add:

   ```python
       # The stage an archived job left; reopening returns it there.
       closed_from: str | None = None
   ```

3. Replace `UpdateApplicationRequest` with:

   ```python
   class UpdateApplicationRequest(_Base):
       # Typed, so an unknown status is a 422 before the route runs.
       status: ApplicationStatus | None = None
       notes: str | None = None
   ```

- [ ] **Step 5: Enforce the moves in the route**

In `backend/app/api/v1/jobs.py`:

1. In `_application_response`, add after `notes=app.notes,`:

   ```python
           closed_from=app.closed_from.value if app.closed_from else None,
   ```

2. In the module docstring, replace the PATCH line with:

   ```
   PATCH  /jobs/applications/{id}       — move along the pipeline / update notes
   ```

3. In `list_applications`'s docstring, replace the status list line with:

   ```
       Optional ?status= filter, any ApplicationStatus value.
   ```

4. Replace the body of `update_application` from its docstring down to (but not including) `if body.notes is not None:` with:

   ```python
       """
       Update the status and/or notes of a tracked application.

       A status change must be one of the moves in APPLICATION_TRANSITIONS
       (app.models.enums), or a 422 names the refused move. Sending the current
       status again changes nothing, so a repeated click is harmless. Archiving
       records the stage the job left in closed_from; reopening returns it there
       and clears it.
       """
       from datetime import datetime

       from sqlalchemy import select
       from sqlalchemy.orm import selectinload

       from app.models.enums import ARCHIVED_STATUSES, ApplicationStatus, allowed_moves
       from app.models.job import JobApplication

       app = await db.scalar(
           select(JobApplication)
           .where(
               JobApplication.id == application_id,
               JobApplication.user_id == current_user.user_id,
           )
           .options(selectinload(JobApplication.job_posting))
       )
       if app is None:
           raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")

       kwargs: dict[str, Any] = {}
       new_status = body.status
       if new_status is not None and new_status != app.status:
           moves = allowed_moves(
               app.status, closed_from=app.closed_from, has_applied=app.applied_at is not None
           )
           if new_status not in moves:
               raise HTTPException(
                   status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                   detail=(
                       f"Can't move an application from '{app.status.value}' "
                       f"to '{new_status.value}'."
                   ),
               )
           kwargs["status"] = new_status
           if new_status in ARCHIVED_STATUSES:
               kwargs["closed_from"] = app.status
           elif app.status in ARCHIVED_STATUSES:
               kwargs["closed_from"] = None
           if new_status == ApplicationStatus.applied and app.applied_at is None:
               kwargs["applied_at"] = datetime.now(tz=UTC)

   ```

   The rest of the function is unchanged: the `if body.notes is not None:` block, the `if kwargs:` update and refetch, and the return.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/unit/test_job_routes.py -q`
Expected: all PASS. The existing `test_update_application_invalid_status_returns_422` still passes, now through Pydantic.

- [ ] **Step 7: Run the backend checks**

Run: `cd backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/mypy app`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/job.py backend/app/api/v1/jobs.py backend/tests/unit/test_job_routes.py
git commit -m "feat(jobs): enforce pipeline moves and return closed_from"
```

---

### Task 3: The pipeline module (frontend)

**Files:**
- Modify: `frontend/types/api.ts:314-343`
- Create: `frontend/lib/pipeline.ts`
- Modify: `frontend/lib/tones.ts` (after `INTERVIEW_SCORE_BANDS`)
- Modify: `frontend/lib/i18n.ts` (the `jobs` section)
- Test: `frontend/tests/lib/pipeline.test.ts` (create), `frontend/tests/lib/tones.test.ts`, `frontend/tests/invariants.test.ts`

**Interfaces:**
- Consumes: `backend/tests/fixtures/application_transitions.json` (Task 1).
- Produces (all exported from `@/lib/pipeline`):
  - **Stages:**
    - `FORWARD_STAGES: readonly ["planning","preparing","applied","interviewing","offered","accepted"]`
    - `type ForwardStatus`
    - `ARCHIVED_STATUSES: readonly ["rejected","withdrawn","skipped"]`
    - `isForward(status: ApplicationStatus): status is ForwardStatus`
  - **Moves:**
    - `TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]>`
    - `reopenTarget(app: Pick<JobApplication,"closed_from"|"applied_at">): ApplicationStatus`
    - `movesFor(app: Pick<JobApplication,"status"|"closed_from"|"applied_at">): ApplicationStatus[]`
    - `splitMoves(status: ForwardStatus): { next: ApplicationStatus | null; back: ApplicationStatus | null; others: ApplicationStatus[] }`
  - **Labels:**
    - `STAGE_LABEL: Record<ApplicationStatus, string>` (i18n keys in `jobs`)
    - `STAGE_TONE: Record<ApplicationStatus, Tone>`
    - `stageName(status, lang): string`
    - `MOVE_LABEL: Record<ApplicationStatus, string>` (keys)
    - `moveLabel(from, to, lang): string`
    - `confirmKey(from, to): string | null`
  - **Actions and helpers:**
    - `type StageLink = { labelKey: string; href: Route; documentType?: DocumentType }`
    - `stageAction(status: ForwardStatus, job: JobPosting): { lineKey: string; links: StageLink[] }`
    - `jobTitle(job: Pick<JobPosting,"translated_title"|"original_title">): string | null`
    - `tailoredDocuments(documents: readonly Document[], jobId: string): Set<DocumentType>`
    - `hasApplied(app: Pick<JobApplication,"status"|"applied_at">): boolean`
    - `forwardCounts(apps: readonly JobApplication[]): { status: ForwardStatus; count: number }[]`
  - **Elsewhere:**
    - `JOB_SCORE_BANDS: ScoreBands` in `@/lib/tones`
    - `JobApplication.closed_from: ApplicationStatus | null` in `@/types/api`

- [ ] **Step 1: Update the types**

In `frontend/types/api.ts`, replace the `ApplicationStatus` union with:

```ts
export type ApplicationStatus =
  | "planning"
  | "preparing"
  | "applied"
  | "interviewing"
  | "offered"
  | "accepted"
  | "rejected"
  | "withdrawn"
  | "skipped";
```

In `JobApplication`, after `notes: string | null;` add:

```ts
  /** The stage an archived job (rejected, withdrawn, skipped) left; reopening returns it there. */
  closed_from: ApplicationStatus | null;
```

- [ ] **Step 2: Write the failing tests**

In `frontend/tests/invariants.test.ts`, inside `describe("the error code contracts match the backend", …)` after the `InterviewStreamErrorCode matches` test, add:

```ts
  it("ApplicationStatus matches, in stage order", () => {
    const tsMembers = tsUnionMembers(apiTypes, "ApplicationStatus");
    const pyMembers = pythonEnumMembers(enums, "ApplicationStatus");
    expect(tsMembers.length).toBeGreaterThan(0);
    expect(tsMembers).toEqual(pyMembers);
  });
```

The describe block already reads the two files as `enums` and `apiTypes`.

In `frontend/tests/lib/tones.test.ts`, add `JOB_SCORE_BANDS` to the existing `@/lib/tones` import, and add:

```ts
describe("job score bands", () => {
  it.each([
    [70, "success"],
    [69, "warning"],
    [50, "warning"],
    [49, "danger"],
  ] as const)("calls %i %s", (score, tone) => {
    expect(scoreTone(score, JOB_SCORE_BANDS)).toBe(tone);
  });
});
```

(`scoreTone` returns `success` at or above `good`, `warning` at or above `fair`, else `danger`.)

Create `frontend/tests/lib/pipeline.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LANGUAGES, t } from "@/lib/i18n";
import {
  ARCHIVED_STATUSES,
  FORWARD_STAGES,
  MOVE_LABEL,
  STAGE_LABEL,
  TRANSITIONS,
  confirmKey,
  forwardCounts,
  hasApplied,
  movesFor,
  moveLabel,
  reopenTarget,
  splitMoves,
  stageAction,
  tailoredDocuments,
} from "@/lib/pipeline";
import type { Document, JobApplication, JobPosting } from "@/types/api";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "backend",
  "tests",
  "fixtures",
  "application_transitions.json",
);

const JOB = {
  id: "job-1",
  translated_title: "Backend Engineer",
  original_title: "バックエンドエンジニア",
  original_company: "株式会社テスト",
  structured_data: { company_name: "Test K.K." },
} as JobPosting;

function app(over: Partial<JobApplication>): JobApplication {
  return {
    id: "a1",
    user_id: "u1",
    job_posting_id: "job-1",
    status: "planning",
    applied_at: null,
    notes: null,
    closed_from: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    job_title: "Backend Engineer",
    job_company: "Test K.K.",
    ...over,
  };
}

describe("the transition table", () => {
  it("matches the backend's, through the shared fixture", () => {
    const expected = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, string[]>;
    const actual = Object.fromEntries(
      Object.entries(TRANSITIONS).map(([status, moves]) => [status, [...moves].sort()]),
    );
    expect(actual).toEqual(expected);
  });

  it("splits the stages into the board's columns and the archive", () => {
    expect([...FORWARD_STAGES, ...ARCHIVED_STATUSES].sort()).toEqual(
      Object.keys(TRANSITIONS).sort(),
    );
  });
});

describe("reopening", () => {
  it("returns a job to the stage it left", () => {
    expect(reopenTarget(app({ closed_from: "interviewing", applied_at: null }))).toBe(
      "interviewing",
    );
  });

  it.each([
    ["2026-09-01T00:00:00Z", "applied"],
    [null, "planning"],
  ] as const)("falls back when closed_from is missing (applied_at %s)", (applied_at, target) => {
    expect(reopenTarget(app({ closed_from: null, applied_at }))).toBe(target);
  });

  it("is the only move an archived job has", () => {
    expect(movesFor(app({ status: "rejected", closed_from: "applied" }))).toEqual(["applied"]);
  });
});

describe("splitting a stage's moves into buttons", () => {
  it("has no back move from Saved", () => {
    expect(splitMoves("planning")).toEqual({
      next: "preparing",
      back: null,
      others: ["applied", "skipped"],
    });
  });

  it("puts the next stage first and the previous one last", () => {
    expect(splitMoves("applied")).toEqual({
      next: "interviewing",
      back: "preparing",
      others: ["rejected", "withdrawn"],
    });
  });

  it("has no next stage after Accepted", () => {
    expect(splitMoves("accepted")).toEqual({ next: null, back: "offered", others: ["withdrawn"] });
  });
});

describe("move labels", () => {
  it("names a back move after its stage", () => {
    expect(moveLabel("applied", "preparing", "en")).toBe("Back to Preparing");
  });

  it("names a reopen after its target", () => {
    expect(moveLabel("rejected", "interviewing", "en")).toBe("Reopen at Interviewing");
  });

  it("calls withdrawing from an offer declining it", () => {
    expect(moveLabel("offered", "withdrawn", "en")).toBe("Decline offer");
    expect(moveLabel("applied", "withdrawn", "en")).toBe("Withdraw");
  });

  it("asks before skipping, withdrawing or declining, and only then", () => {
    expect(confirmKey("planning", "skipped")).toBe("confirmSkip");
    expect(confirmKey("applied", "withdrawn")).toBe("confirmWithdraw");
    expect(confirmKey("offered", "withdrawn")).toBe("confirmDecline");
    expect(confirmKey("applied", "rejected")).toBeNull();
    expect(confirmKey("planning", "preparing")).toBeNull();
  });
});

describe("each stage's next action", () => {
  it("links Preparing to both tailored documents and the gaps", () => {
    const { lineKey, links } = stageAction("preparing", JOB);
    expect(lineKey).toBe("nextPreparing");
    expect(links.map((l) => l.href)).toEqual([
      "/dashboard/documents/rirekisho/new?job=job-1",
      "/dashboard/documents/shokumu/new?job=job-1",
      "/dashboard/jobs/job-1#match",
    ]);
    expect(links.map((l) => l.documentType)).toEqual([
      "rirekisho",
      "shokumukeirekisho",
      undefined,
    ]);
  });

  it("pre-fills interview practice with the role and company, encoded", () => {
    const [link] = stageAction("interviewing", JOB).links;
    expect(link?.href).toBe("/dashboard/interview/new?role=Backend+Engineer&company=Test+K.K.");
  });

  it("leaves out what the job doesn't say", () => {
    const bare = {
      ...JOB,
      translated_title: null,
      original_title: null,
      original_company: null,
      structured_data: null,
    } as JobPosting;
    expect(stageAction("interviewing", bare).links[0]?.href).toBe("/dashboard/interview/new");
  });

  it("falls back to the original company when nothing was extracted", () => {
    const href = stageAction("interviewing", { ...JOB, structured_data: null }).links[0]?.href;
    expect(href).toContain("company=%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BE%E3%83%86%E3%82%B9%E3%83%88");
  });

  it("has no links while waiting to hear back", () => {
    expect(stageAction("applied", JOB).links).toEqual([]);
  });
});

describe("documents made for a job", () => {
  const doc = (over: Partial<Document>) =>
    ({
      document_type: "rirekisho",
      status: "completed",
      job_context: { job_posting_id: "job-1" },
      ...over,
    }) as Document;

  it("counts only finished documents made for this job", () => {
    const made = tailoredDocuments(
      [
        doc({}),
        doc({ document_type: "shokumukeirekisho", status: "pending" }),
        doc({ document_type: "shokumukeirekisho", job_context: { job_posting_id: "job-2" } }),
        doc({ document_type: "shokumukeirekisho", job_context: { job_posting_id: 7 } }),
        doc({ document_type: "shokumukeirekisho", job_context: null }),
      ],
      "job-1",
    );
    expect([...made]).toEqual(["rirekisho"]);
  });
});

describe("having applied", () => {
  it.each([
    [{ status: "planning", applied_at: null }, false],
    [{ status: "preparing", applied_at: null }, false],
    [{ status: "skipped", applied_at: null }, false],
    [{ status: "applied", applied_at: null }, true],
    [{ status: "accepted", applied_at: null }, true],
    [{ status: "rejected", applied_at: "2026-09-01T00:00:00Z" }, true],
    [{ status: "withdrawn", applied_at: null }, false],
  ] as const)("%o → %s", (over, expected) => {
    expect(hasApplied(app(over))).toBe(expected);
  });
});

describe("counting the pipeline", () => {
  it("counts each forward stage that has jobs, in stage order", () => {
    const counts = forwardCounts([
      app({ id: "1", status: "applied" }),
      app({ id: "2", status: "planning" }),
      app({ id: "3", status: "planning" }),
      app({ id: "4", status: "rejected" }),
    ]);
    expect(counts).toEqual([
      { status: "planning", count: 2 },
      { status: "applied", count: 1 },
    ]);
  });
});

describe("the strings it looks up", () => {
  // t() falls back to printing the key, so a typo would ship on screen.
  const keys = [
    ...Object.values(STAGE_LABEL),
    ...Object.values(MOVE_LABEL),
    ...FORWARD_STAGES.flatMap((stage) => {
      const action = stageAction(stage, JOB);
      return [action.lineKey, ...action.links.map((l) => l.labelKey)];
    }),
    "backTo",
    "reopenAt",
    "moveDecline",
    "confirmSkip",
    "confirmWithdraw",
    "confirmDecline",
  ];

  it.each(LANGUAGES.map((l) => l.code))("has every one of them in %s", (lang) => {
    expect(keys.filter((key) => t("jobs", key, lang) === key)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run tests/lib/pipeline.test.ts tests/lib/tones.test.ts tests/invariants.test.ts`
Expected:
- `pipeline.test.ts` fails to import `@/lib/pipeline`.
- `tones.test.ts` fails because `JOB_SCORE_BANDS` is undefined.
- The invariant passes already: the TS union and the Python enum both changed in earlier steps.

- [ ] **Step 4: Add `JOB_SCORE_BANDS`**

In `frontend/lib/tones.ts`, after `INTERVIEW_SCORE_BANDS`:

```ts
/** A job's foreigner-friendliness and match scores. */
export const JOB_SCORE_BANDS: ScoreBands = { good: 70, fair: 50 };
```

- [ ] **Step 5: Add the strings**

In `frontend/lib/i18n.ts`, insert these entries at the end of the `jobs` section, just before the `  },` line that closes it (the line before `  interview: {`):

```ts
    // The job pipeline (lib/pipeline.ts). planning shows as "Saved", offered as "Offer".
    stagePlanning: { en: "Saved", id: "Disimpan", ja: "保存済み" },
    stagePreparing: { en: "Preparing", id: "Persiapan", ja: "準備中" },
    stageApplied: { en: "Applied", id: "Sudah melamar", ja: "応募済み" },
    stageInterviewing: { en: "Interviewing", id: "Wawancara", ja: "面接中" },
    stageOffered: { en: "Offer", id: "Tawaran", ja: "内定" },
    stageAccepted: { en: "Accepted", id: "Diterima", ja: "内定承諾" },
    stageRejected: {
      en: "Closed · Not selected",
      id: "Ditutup · Tidak terpilih",
      ja: "終了・不採用",
    },
    stageWithdrawn: {
      en: "Closed · Withdrew",
      id: "Ditutup · Mengundurkan diri",
      ja: "終了・辞退",
    },
    stageSkipped: { en: "Skipped", id: "Dilewati", ja: "見送り" },
    nextPlanning: {
      en: "Check how well you match, then start preparing.",
      id: "Periksa kecocokan Anda, lalu mulai persiapan.",
      ja: "マッチ度を確認してから準備を始めましょう。",
    },
    nextPreparing: {
      en: "Tailor your documents to this job.",
      id: "Sesuaikan dokumen Anda dengan lowongan ini.",
      ja: "この求人に合わせて書類を作成しましょう。",
    },
    nextApplied: {
      en: "Wait to hear back, then record the answer.",
      id: "Tunggu kabar, lalu catat hasilnya.",
      ja: "連絡を待ち、結果を記録しましょう。",
    },
    nextInterviewing: {
      en: "Practise for this interview.",
      id: "Berlatih untuk wawancara ini.",
      ja: "この面接の練習をしましょう。",
    },
    nextOffered: {
      en: "Check your visa options before you accept.",
      id: "Periksa pilihan visa Anda sebelum menerima.",
      ja: "承諾する前にビザの選択肢を確認しましょう。",
    },
    nextAccepted: {
      en: "Get ready for the move.",
      id: "Bersiaplah untuk pindah.",
      ja: "来日の準備を始めましょう。",
    },
    actionSeeMatch: { en: "Check your match", id: "Periksa kecocokan", ja: "マッチ度を確認" },
    actionSeeGaps: {
      en: "See what to improve",
      id: "Lihat yang perlu ditingkatkan",
      ja: "改善点を見る",
    },
    actionPractise: {
      en: "Practise this interview",
      id: "Latihan wawancara ini",
      ja: "この面接を練習する",
    },
    actionVisa: { en: "Check visa options", id: "Periksa pilihan visa", ja: "ビザを確認する" },
    actionCulture: { en: "Workplace culture", id: "Budaya kerja", ja: "職場文化" },
    moveStartPreparing: { en: "Start preparing", id: "Mulai persiapan", ja: "準備を始める" },
    moveApplied: { en: "Mark as applied", id: "Tandai sudah melamar", ja: "応募済みにする" },
    moveInterviewing: { en: "Got an interview", id: "Dapat wawancara", ja: "面接が決まった" },
    moveOffered: { en: "Got an offer", id: "Dapat tawaran", ja: "内定をもらった" },
    moveAccepted: { en: "Accept offer", id: "Terima tawaran", ja: "内定を承諾する" },
    moveRejected: { en: "Not selected", id: "Tidak terpilih", ja: "不採用だった" },
    moveWithdraw: { en: "Withdraw", id: "Mengundurkan diri", ja: "辞退する" },
    moveDecline: { en: "Decline offer", id: "Tolak tawaran", ja: "内定を辞退する" },
    moveSkip: { en: "Skip", id: "Lewati", ja: "見送る" },
    backTo: { en: "Back to {stage}", id: "Kembali ke {stage}", ja: "{stage}に戻す" },
    reopenAt: { en: "Reopen at {stage}", id: "Buka lagi di {stage}", ja: "{stage}で再開する" },
    confirmSkip: {
      en: "Skip this job?",
      id: "Lewati lowongan ini?",
      ja: "この求人を見送りますか？",
    },
    confirmWithdraw: {
      en: "Withdraw from this job?",
      id: "Mengundurkan diri dari lowongan ini?",
      ja: "この応募を辞退しますか？",
    },
    confirmDecline: {
      en: "Decline this offer?",
      id: "Tolak tawaran ini?",
      ja: "この内定を辞退しますか？",
    },
```

- [ ] **Step 6: Write `lib/pipeline.ts`**

Create `frontend/lib/pipeline.ts`:

```ts
import type { Route } from "next";
import { t, type Language } from "@/lib/i18n";
import type { Tone } from "@/lib/tones";
import type {
  ApplicationStatus,
  Document,
  DocumentType,
  JobApplication,
  JobPosting,
} from "@/types/api";

/**
 * The job pipeline: where each tracked job is and where it can go next.
 * Plain logic, like lib/journey.ts. The backend enforces the same table
 * (APPLICATION_TRANSITIONS in backend/app/models/enums.py); both are pinned
 * to backend/tests/fixtures/application_transitions.json.
 */

/** The board's columns, in order. */
export const FORWARD_STAGES = [
  "planning",
  "preparing",
  "applied",
  "interviewing",
  "offered",
  "accepted",
] as const satisfies readonly ApplicationStatus[];
export type ForwardStatus = (typeof FORWARD_STAGES)[number];

/** Listed under the board, not in a column. */
export const ARCHIVED_STATUSES = [
  "rejected",
  "withdrawn",
  "skipped",
] as const satisfies readonly ApplicationStatus[];

export function isForward(status: ApplicationStatus): status is ForwardStatus {
  return (FORWARD_STAGES as readonly ApplicationStatus[]).includes(status);
}

/**
 * Every move a job can make. Each forward stage can also go back one step, to
 * undo a mis-click. An archived job only reopens (see movesFor).
 */
export const TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  planning: ["preparing", "applied", "skipped"],
  preparing: ["applied", "withdrawn", "planning"],
  applied: ["interviewing", "rejected", "withdrawn", "preparing"],
  interviewing: ["offered", "rejected", "withdrawn", "applied"],
  offered: ["accepted", "withdrawn", "interviewing"],
  accepted: ["withdrawn", "offered"],
  rejected: [],
  withdrawn: [],
  skipped: [],
};

/**
 * Where an archived job goes back to: the stage it left. Jobs archived before
 * closed_from existed have none, so they return to Applied if the user had
 * applied, and to Saved otherwise.
 */
export function reopenTarget(app: Pick<JobApplication, "closed_from" | "applied_at">) {
  return app.closed_from ?? (app.applied_at ? "applied" : "planning");
}

export function movesFor(
  app: Pick<JobApplication, "status" | "closed_from" | "applied_at">,
): ApplicationStatus[] {
  return isForward(app.status) ? [...TRANSITIONS[app.status]] : [reopenTarget(app)];
}

/** A forward stage's moves, sorted into the stage panel's three kinds of button. */
export function splitMoves(status: ForwardStatus): {
  next: ApplicationStatus | null;
  back: ApplicationStatus | null;
  others: ApplicationStatus[];
} {
  const index = FORWARD_STAGES.indexOf(status);
  const moves = TRANSITIONS[status];
  const nextStage = FORWARD_STAGES[index + 1];
  const backStage = index > 0 ? FORWARD_STAGES[index - 1] : undefined;
  const next = nextStage !== undefined && moves.includes(nextStage) ? nextStage : null;
  const back = backStage !== undefined && moves.includes(backStage) ? backStage : null;
  return { next, back, others: moves.filter((move) => move !== next && move !== back) };
}

/** i18n keys (jobs section). */
export const STAGE_LABEL: Record<ApplicationStatus, string> = {
  planning: "stagePlanning",
  preparing: "stagePreparing",
  applied: "stageApplied",
  interviewing: "stageInterviewing",
  offered: "stageOffered",
  accepted: "stageAccepted",
  rejected: "stageRejected",
  withdrawn: "stageWithdrawn",
  skipped: "stageSkipped",
};

export const STAGE_TONE: Record<ApplicationStatus, Tone> = {
  planning: "neutral",
  preparing: "neutral",
  applied: "info",
  interviewing: "info",
  offered: "warning",
  accepted: "success",
  rejected: "danger",
  withdrawn: "neutral",
  skipped: "neutral",
};

export function stageName(status: ApplicationStatus, lang: Language): string {
  return t("jobs", STAGE_LABEL[status], lang);
}

/** The label of a forward move, keyed by where it goes (i18n keys, jobs section). */
export const MOVE_LABEL: Record<ApplicationStatus, string> = {
  // Only ever a back move, which moveLabel names after its stage.
  planning: "stagePlanning",
  preparing: "moveStartPreparing",
  applied: "moveApplied",
  interviewing: "moveInterviewing",
  offered: "moveOffered",
  accepted: "moveAccepted",
  rejected: "moveRejected",
  withdrawn: "moveWithdraw",
  skipped: "moveSkip",
};

export function moveLabel(from: ApplicationStatus, to: ApplicationStatus, lang: Language) {
  if (!isForward(from)) {
    return t("jobs", "reopenAt", lang).replace("{stage}", stageName(to, lang));
  }
  if (isForward(to) && FORWARD_STAGES.indexOf(to) < FORWARD_STAGES.indexOf(from)) {
    return t("jobs", "backTo", lang).replace("{stage}", stageName(to, lang));
  }
  if (from === "offered" && to === "withdrawn") return t("jobs", "moveDecline", lang);
  return t("jobs", MOVE_LABEL[to], lang);
}

/** The confirmation title for a move that ends the job's run, or null for one that doesn't. */
export function confirmKey(from: ApplicationStatus, to: ApplicationStatus): string | null {
  if (to === "skipped") return "confirmSkip";
  if (to === "withdrawn") return from === "offered" ? "confirmDecline" : "confirmWithdraw";
  return null;
}

export interface StageLink {
  labelKey: string;
  href: Route;
  /** Set on a tailored-document link, so the panel can mark one already made. */
  documentType?: DocumentType;
}

export function jobTitle(job: Pick<JobPosting, "translated_title" | "original_title">) {
  return job.translated_title ?? job.original_title;
}

/** What to do at a stage, and where to do it, pre-filled from the job. */
export function stageAction(
  status: ForwardStatus,
  job: JobPosting,
): { lineKey: string; links: StageLink[] } {
  const match = `/dashboard/jobs/${job.id}#match` as Route;
  switch (status) {
    case "planning":
      return { lineKey: "nextPlanning", links: [{ labelKey: "actionSeeMatch", href: match }] };
    case "preparing":
      return {
        lineKey: "nextPreparing",
        links: [
          {
            labelKey: "generateRirekishoForJob",
            href: `/dashboard/documents/rirekisho/new?job=${job.id}` as Route,
            documentType: "rirekisho",
          },
          {
            labelKey: "generateShokumuForJob",
            href: `/dashboard/documents/shokumu/new?job=${job.id}` as Route,
            documentType: "shokumukeirekisho",
          },
          { labelKey: "actionSeeGaps", href: match },
        ],
      };
    case "applied":
      return { lineKey: "nextApplied", links: [] };
    case "interviewing": {
      const params = new URLSearchParams();
      const role = jobTitle(job);
      const company = job.structured_data?.company_name || job.original_company;
      if (role) params.set("role", role);
      if (company) params.set("company", company);
      const query = params.toString();
      return {
        lineKey: "nextInterviewing",
        links: [
          {
            labelKey: "actionPractise",
            href: `/dashboard/interview/new${query ? `?${query}` : ""}` as Route,
          },
        ],
      };
    }
    case "offered":
      return {
        lineKey: "nextOffered",
        links: [{ labelKey: "actionVisa", href: "/dashboard/visa" }],
      };
    case "accepted":
      return {
        lineKey: "nextAccepted",
        links: [
          { labelKey: "actionVisa", href: "/dashboard/visa" },
          { labelKey: "actionCulture", href: "/dashboard/culture" },
        ],
      };
  }
}

/** The document types already generated, successfully, for this job. */
export function tailoredDocuments(
  documents: readonly Document[],
  jobId: string,
): Set<DocumentType> {
  const made = new Set<DocumentType>();
  for (const doc of documents) {
    const target = doc.job_context?.["job_posting_id"];
    if (doc.status === "completed" && typeof target === "string" && target === jobId) {
      made.add(doc.document_type);
    }
  }
  return made;
}

const APPLIED_OR_LATER: readonly ApplicationStatus[] = [
  "applied",
  "interviewing",
  "offered",
  "accepted",
];

/** Whether the user applied for this job: saving or preparing is not applying. */
export function hasApplied(app: Pick<JobApplication, "status" | "applied_at">): boolean {
  return app.applied_at !== null || APPLIED_OR_LATER.includes(app.status);
}

/** How many jobs sit in each forward stage, leaving out empty ones, in stage order. */
export function forwardCounts(
  apps: readonly JobApplication[],
): { status: ForwardStatus; count: number }[] {
  return FORWARD_STAGES.map((status) => ({
    status,
    count: apps.filter((a) => a.status === status).length,
  })).filter(({ count }) => count > 0);
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run tests/lib/pipeline.test.ts tests/lib/tones.test.ts tests/invariants.test.ts tests/lib/i18n.test.ts`
Expected: all PASS.

- [ ] **Step 8: Mutation-check the fixture pin**

In `lib/pipeline.ts`, temporarily delete `"skipped"` from `planning`'s moves. Run `npx vitest run tests/lib/pipeline.test.ts`: "matches the backend's" must fail. Restore the file.

- [ ] **Step 9: Run the frontend checks**

Run: `cd frontend && npm test && npm run lint && npm run type-check && npm run format:check`
Expected: all PASS. Pages that read `ApplicationStatus` by key compile unchanged, because their records are `Partial<…>` or indexed by existing keys. If `type-check` reports a `Record<ApplicationStatus, …>` missing keys in `app/dashboard/jobs/applications/page.tsx`, add the three new statuses to that record with `"bg-secondary border-border"`, `"bg-success-soft border-success/30"` and `"bg-secondary border-border"`. Task 7 rewrites that page anyway.

- [ ] **Step 10: Commit**

```bash
git add frontend/types/api.ts frontend/lib/pipeline.ts frontend/lib/tones.ts frontend/lib/i18n.ts frontend/tests/lib/pipeline.test.ts frontend/tests/lib/tones.test.ts frontend/tests/invariants.test.ts
git commit -m "feat(jobs): the pipeline module, mirroring the backend's moves"
```

---

### Task 4: StageBadge and StagePanel

**Files:**
- Create: `frontend/components/jobs/stage-badge.tsx`
- Create: `frontend/components/jobs/stage-panel.tsx`
- Modify: `frontend/lib/i18n.ts` (the `jobs` section)
- Test: `frontend/tests/components/stage-panel.test.tsx` (create)

**Interfaces:**
- Consumes:
  - from `@/lib/pipeline` (Task 3): `FORWARD_STAGES`, `ForwardStatus`, `STAGE_TONE`, `confirmKey`, `isForward`, `moveLabel`, `reopenTarget`, `splitMoves`, `stageAction`, `stageName`, `tailoredDocuments`
  - `useApplications`, `useCreateApplication` and `useUpdateApplication` from `@/hooks/useApplications`
  - `useDocuments` from `@/hooks/useDocuments`
- Produces:
  - `StageBadge({ status }: { status: ApplicationStatus })`
  - `StagePanel({ job }: { job: JobPostingDetail })`. It fetches its own data, and its heading is an `h2` named `t("jobs","stagePanelTitle")`.

- [ ] **Step 1: Add the strings**

Append to the `jobs` section of `frontend/lib/i18n.ts`, after the Task 3 entries:

```ts
    stagePanelTitle: { en: "Your application", id: "Lamaran Anda", ja: "応募状況" },
    stageStepsLabel: { en: "Application stages", id: "Tahapan lamaran", ja: "応募の段階" },
    savePrompt: {
      en: "Save this job to track it through your applications.",
      id: "Simpan lowongan ini untuk melacak lamaran Anda.",
      ja: "この求人を保存して、応募状況を管理しましょう。",
    },
    saveToPipeline: { en: "Save to pipeline", id: "Simpan ke pipeline", ja: "パイプラインに保存" },
    movedOn: {
      en: "Moved here on {date}.",
      id: "Dipindahkan ke sini pada {date}.",
      ja: "{date}にこの段階へ移動しました。",
    },
    docMade: { en: "Made", id: "Sudah dibuat", ja: "作成済み" },
    stageLoadError: {
      en: "Couldn't load your application for this job.",
      id: "Tidak dapat memuat lamaran Anda untuk lowongan ini.",
      ja: "この求人の応募状況を読み込めませんでした。",
    },
```

- [ ] **Step 2: Write the failing tests**

Create `frontend/tests/components/stage-panel.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import type { Document, JobApplication, JobPostingDetail } from "@/types/api";

const apps = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const docs = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const create = vi.hoisted(() => ({ calls: [] as unknown[], error: null as unknown }));
const update = vi.hoisted(() => ({ calls: [] as unknown[], error: null as unknown, hold: false }));
const confirm = vi.hoisted(() => ({ answer: true, titles: [] as string[] }));

vi.mock("@/hooks/useApplications", () => ({
  useApplications: () => apps.current,
  useCreateApplication: () => ({
    isPending: false,
    error: create.error,
    mutate: (vars: unknown, opts?: { onSuccess?: () => void }) => {
      create.calls.push(vars);
      opts?.onSuccess?.();
    },
  }),
  useUpdateApplication: () => ({
    error: update.error,
    mutate: (vars: unknown, opts?: { onSuccess?: () => void; onSettled?: () => void }) => {
      update.calls.push(vars);
      if (update.hold) return;
      opts?.onSuccess?.();
      opts?.onSettled?.();
    },
  }),
}));
vi.mock("@/hooks/useDocuments", () => ({ useDocuments: () => docs.current }));
vi.mock("@/components/confirm-dialog-provider", () => ({
  useConfirm: () => (options: { title: string }) => {
    confirm.titles.push(options.title);
    return Promise.resolve(confirm.answer);
  },
}));

const { StagePanel } = await import("@/components/jobs/stage-panel");

const LANG = "en";
const j = (key: string) => t("jobs", key, LANG);

const JOB = {
  id: "job-1",
  translated_title: "Backend Engineer",
  original_title: null,
  original_company: null,
  original_language: "ja",
  structured_data: { company_name: "Test K.K." },
} as JobPostingDetail;

function app(over: Partial<JobApplication> = {}): JobApplication {
  return {
    id: "a1",
    user_id: "u1",
    job_posting_id: "job-1",
    status: "planning",
    applied_at: null,
    notes: null,
    closed_from: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    job_title: "Backend Engineer",
    job_company: "Test K.K.",
    ...over,
  };
}

function renderPanel(applications: JobApplication[] | undefined = [], extra = {}) {
  apps.current = { data: applications, isLoading: applications === undefined, error: null, ...extra };
  return renderIn(LANG, <StagePanel job={JOB} />);
}

const button = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  docs.current = { data: { items: [], total: 0 } };
  create.calls = [];
  create.error = null;
  update.calls = [];
  update.error = null;
  update.hold = false;
  confirm.answer = true;
  confirm.titles = [];
});

describe("stage panel, a job that isn't tracked", () => {
  it("offers to save it", () => {
    renderPanel([]);
    fireEvent.click(button(j("saveToPipeline")));
    expect(create.calls).toEqual([{ job_posting_id: "job-1" }]);
  });

  it("ignores an application for another job", () => {
    renderPanel([app({ job_posting_id: "job-2", status: "applied" })]);
    expect(button(j("saveToPipeline"))).toBeInTheDocument();
  });

  it("offers nothing until it knows whether the job is tracked", () => {
    // Offering Save while the list loads invites a duplicate.
    renderPanel(undefined);
    expect(screen.queryByRole("button", { name: j("saveToPipeline") })).not.toBeInTheDocument();
  });

  it("offers a retry when the applications failed to load", () => {
    const refetch = vi.fn(() => Promise.resolve());
    renderPanel(undefined, { isLoading: false, error: new ApiClientError(500, "boom"), refetch });
    expect(screen.getByRole("alert")).toHaveTextContent(j("stageLoadError"));
    fireEvent.click(button(t("common", "tryAgain", LANG)));
    expect(refetch).toHaveBeenCalled();
  });
});

describe("stage panel, a job in the pipeline", () => {
  it("shows Saved's moves, with no way back", () => {
    renderPanel([app()]);
    expect(button("Start preparing")).toBeInTheDocument();
    expect(button("Mark as applied")).toBeInTheDocument();
    expect(button("Skip")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Back to/ })).not.toBeInTheDocument();
  });

  it("shows Applied's moves and what to do there", () => {
    renderPanel([app({ status: "applied", applied_at: "2026-09-10T00:00:00Z" })]);
    expect(screen.getByText(j("nextApplied"))).toBeInTheDocument();
    for (const name of ["Got an interview", "Not selected", "Withdraw", "Back to Preparing"]) {
      expect(button(name)).toBeInTheDocument();
    }
  });

  it("marks the current stage in the stepper", () => {
    renderPanel([app({ status: "interviewing" })]);
    const steps = screen.getByRole("list", { name: j("stageStepsLabel") });
    const current = steps.querySelector('[aria-current="step"]');
    expect(current).toHaveTextContent(j("stageInterviewing"));
    expect(steps.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  });

  it("moves forward without asking, then puts focus on the panel heading", async () => {
    renderPanel([app()]);
    await act(async () => fireEvent.click(button("Start preparing")));
    expect(confirm.titles).toEqual([]);
    expect(update.calls).toEqual([{ id: "a1", data: { status: "preparing" } }]);
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: j("stagePanelTitle") }),
    );
  });

  it("asks before skipping, and does nothing when declined", async () => {
    confirm.answer = false;
    renderPanel([app()]);
    await act(async () => fireEvent.click(button("Skip")));
    expect(confirm.titles).toEqual([j("confirmSkip")]);
    expect(update.calls).toEqual([]);
  });

  it("calls withdrawing from an offer declining it, and asks first", async () => {
    renderPanel([app({ status: "offered", applied_at: "2026-09-10T00:00:00Z" })]);
    await act(async () => fireEvent.click(button("Decline offer")));
    expect(confirm.titles).toEqual([j("confirmDecline")]);
    expect(update.calls).toEqual([{ id: "a1", data: { status: "withdrawn" } }]);
  });

  it("shows a move in progress and holds the other moves", async () => {
    update.hold = true;
    renderPanel([app()]);
    await act(async () => fireEvent.click(button("Start preparing")));
    expect(button("Start preparing")).toHaveAttribute("aria-busy", "true");
    expect(button("Skip")).toBeDisabled();
  });

  it("explains a refused move", () => {
    update.error = new ApiClientError(422, "Can't move");
    renderPanel([app()]);
    expect(screen.getByRole("alert")).toHaveTextContent(t("common", "errorInvalidInput", LANG));
  });
});

describe("stage panel, each stage's help", () => {
  it("links Preparing to the documents for this job, marking one already made", () => {
    docs.current = {
      data: {
        items: [
          {
            document_type: "rirekisho",
            status: "completed",
            job_context: { job_posting_id: "job-1" },
          },
          {
            document_type: "shokumukeirekisho",
            status: "completed",
            job_context: { job_posting_id: "job-2" },
          },
        ] as Document[],
        total: 2,
      },
    };
    renderPanel([app({ status: "preparing" })]);

    const rirekisho = screen.getByRole("link", { name: j("generateRirekishoForJob") });
    const shokumu = screen.getByRole("link", { name: j("generateShokumuForJob") });
    expect(rirekisho).toHaveAttribute("href", "/dashboard/documents/rirekisho/new?job=job-1");
    expect(within(rirekisho.closest("li") as HTMLElement).getByText(j("docMade"))).toBeVisible();
    expect(within(shokumu.closest("li") as HTMLElement).queryByText(j("docMade"))).toBeNull();
  });

  it("pre-fills interview practice with the role and company", () => {
    renderPanel([app({ status: "interviewing" })]);
    expect(screen.getByRole("link", { name: j("actionPractise") })).toHaveAttribute(
      "href",
      "/dashboard/interview/new?role=Backend+Engineer&company=Test+K.K.",
    );
  });
});

describe("stage panel, an archived job", () => {
  it("shows why it closed and reopens it where it left", async () => {
    renderPanel([app({ status: "rejected", closed_from: "interviewing" })]);
    expect(screen.getByText(j("stageRejected"))).toBeInTheDocument();
    await act(async () => fireEvent.click(button("Reopen at Interviewing")));
    expect(confirm.titles).toEqual([]);
    expect(update.calls).toEqual([{ id: "a1", data: { status: "interviewing" } }]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run tests/components/stage-panel.test.tsx`
Expected: FAIL, because `@/components/jobs/stage-panel` doesn't exist.

- [ ] **Step 4: Write `StageBadge`**

Create `frontend/components/jobs/stage-badge.tsx`:

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/language-context";
import { STAGE_TONE, stageName } from "@/lib/pipeline";
import type { ApplicationStatus } from "@/types/api";

/** A job's pipeline stage, coloured by what it means. Closed ones name the reason. */
export function StageBadge({ status }: { status: ApplicationStatus }) {
  const { lang } = useLang();
  return <Badge variant={STAGE_TONE[status]}>{stageName(status, lang)}</Badge>;
}
```

- [ ] **Step 5: Write `StagePanel`**

Create `frontend/components/jobs/stage-panel.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { StageBadge } from "@/components/jobs/stage-badge";
import { RetryButton } from "@/components/retry-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useApplications,
  useCreateApplication,
  useUpdateApplication,
} from "@/hooks/useApplications";
import { useDocuments } from "@/hooks/useDocuments";
import { apiErrorMessage } from "@/lib/api-error";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import {
  FORWARD_STAGES,
  confirmKey,
  isForward,
  moveLabel,
  reopenTarget,
  splitMoves,
  stageAction,
  stageName,
  tailoredDocuments,
  type ForwardStatus,
} from "@/lib/pipeline";
import { cn } from "@/lib/utils";
import type { ApplicationStatus, JobApplication, JobPostingDetail } from "@/types/api";

/**
 * Where this job is in the user's pipeline, what to do at that stage, and the
 * moves it can make. A move replaces the buttons, so focus then goes to the
 * panel's heading instead of being dropped to <body>.
 */
export function StagePanel({ job }: { job: JobPostingDetail }) {
  const { lang } = useLang();
  const applications = useApplications();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeading = () => headingRef.current?.focus();
  const application = applications.data?.find((a) => a.job_posting_id === job.id);

  let body: React.ReactNode;
  if (applications.data === undefined && applications.error) {
    body = (
      <Alert
        action={
          <RetryButton
            retrying={applications.isFetching}
            onRetry={() => void applications.refetch()}
          />
        }
      >
        {t("jobs", "stageLoadError", lang)}
      </Alert>
    );
  } else if (applications.data === undefined) {
    body = <Skeleton className="h-24 w-full" />;
  } else if (!application) {
    body = <SavePrompt jobId={job.id} onSaved={focusHeading} />;
  } else if (isForward(application.status)) {
    body = (
      <ForwardStage
        job={job}
        application={application}
        status={application.status}
        onMoved={focusHeading}
      />
    );
  } else {
    body = <ArchivedStage application={application} onMoved={focusHeading} />;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <h2 ref={headingRef} tabIndex={-1} className="text-base font-semibold focus:outline-none">
          {t("jobs", "stagePanelTitle", lang)}
        </h2>
      </CardHeader>
      <CardContent className="space-y-4">{body}</CardContent>
    </Card>
  );
}

function SavePrompt({ jobId, onSaved }: { jobId: string; onSaved: () => void }) {
  const { lang } = useLang();
  const create = useCreateApplication();
  return (
    <>
      <p className="text-sm text-muted-foreground">{t("jobs", "savePrompt", lang)}</p>
      <Button
        className="w-full"
        loading={create.isPending}
        onClick={() => create.mutate({ job_posting_id: jobId }, { onSuccess: onSaved })}
      >
        {t("jobs", "saveToPipeline", lang)}
      </Button>
      {create.error && <Alert>{apiErrorMessage(create.error, lang)}</Alert>}
    </>
  );
}

/** Moves one application, asking first when the move ends its run. */
function useMove(application: JobApplication, onMoved: () => void) {
  const { lang } = useLang();
  const confirmDialog = useConfirm();
  const update = useUpdateApplication();
  const [pending, setPending] = useState<ApplicationStatus | null>(null);

  async function move(to: ApplicationStatus) {
    const key = confirmKey(application.status, to);
    if (key) {
      const ok = await confirmDialog({
        title: t("jobs", key, lang),
        variant: "destructive",
        confirmLabel: moveLabel(application.status, to, lang),
        cancelLabel: t("common", "cancel", lang),
      });
      if (!ok) return;
    }
    setPending(to);
    update.mutate(
      { id: application.id, data: { status: to } },
      { onSuccess: onMoved, onSettled: () => setPending(null) },
    );
  }

  return { move, pending, error: update.error };
}

function ForwardStage({
  job,
  application,
  status,
  onMoved,
}: {
  job: JobPostingDetail;
  application: JobApplication;
  status: ForwardStatus;
  onMoved: () => void;
}) {
  const { lang } = useLang();
  const { move, pending, error } = useMove(application, onMoved);
  const documents = useDocuments();
  const made = tailoredDocuments(documents.data?.items ?? [], job.id);
  const action = stageAction(status, job);
  const { next, back, others } = splitMoves(status);

  const moveButton = (to: ApplicationStatus, variant: "primary" | "secondary" | "ghost") => (
    <Button
      key={to}
      variant={variant}
      size="sm"
      loading={pending === to}
      disabled={pending !== null && pending !== to}
      onClick={() => void move(to)}
    >
      {moveLabel(status, to, lang)}
    </Button>
  );

  return (
    <>
      <StageBadge status={status} />
      <Stepper current={status} />
      <p className="text-sm">{t("jobs", action.lineKey, lang)}</p>
      {action.links.length > 0 && (
        <ul className="space-y-1.5">
          {action.links.map((link) => (
            <li key={link.href} className="flex flex-wrap items-center gap-2">
              <Button asChild variant="link" size="sm">
                <Link href={link.href}>{t("jobs", link.labelKey, lang)}</Link>
              </Button>
              {link.documentType && made.has(link.documentType) && (
                <Badge variant="success">
                  <Check aria-hidden="true" className="h-3 w-3" />
                  {t("jobs", "docMade", lang)}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        {next && moveButton(next, "primary")}
        {others.map((to) => moveButton(to, "secondary"))}
        {back && moveButton(back, "ghost")}
      </div>
      {error && <Alert>{apiErrorMessage(error, lang)}</Alert>}
    </>
  );
}

/** Six bars, filled up to the current stage. The labels are for screen readers. */
function Stepper({ current }: { current: ForwardStatus }) {
  const { lang } = useLang();
  const index = FORWARD_STAGES.indexOf(current);
  return (
    <ol aria-label={t("jobs", "stageStepsLabel", lang)} className="grid grid-cols-6 gap-1">
      {FORWARD_STAGES.map((stage, i) => (
        <li key={stage} aria-current={stage === current ? "step" : undefined}>
          <span
            aria-hidden="true"
            className={cn("block h-1.5 rounded-full", i <= index ? "bg-indigo" : "bg-muted")}
          />
          <span className="sr-only">{stageName(stage, lang)}</span>
        </li>
      ))}
    </ol>
  );
}

function ArchivedStage({
  application,
  onMoved,
}: {
  application: JobApplication;
  onMoved: () => void;
}) {
  const { lang } = useLang();
  const { move, pending, error } = useMove(application, onMoved);
  const target = reopenTarget(application);
  const date = new Date(application.updated_at).toLocaleDateString(lang, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <>
      <StageBadge status={application.status} />
      <p className="text-sm text-muted-foreground">
        {t("jobs", "movedOn", lang).replace("{date}", date)}
      </p>
      <Button
        variant="secondary"
        size="sm"
        loading={pending === target}
        onClick={() => void move(target)}
      >
        {moveLabel(application.status, target, lang)}
      </Button>
      {error && <Alert>{apiErrorMessage(error, lang)}</Alert>}
    </>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run tests/components/stage-panel.test.tsx`
Expected: all PASS.

- [ ] **Step 7: Mutation-check two behaviours**

1. Remove `{ onSuccess: onMoved, ` from `useMove`'s `mutate` call, leaving `{ onSettled: … }`. The focus test must fail. Restore.
2. Change `if (key) {` to `if (false) {`. The skip and decline tests must fail. Restore.

- [ ] **Step 8: Run the frontend checks**

Run: `cd frontend && npm test && npm run lint && npm run type-check && npm run format:check`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/components/jobs/stage-badge.tsx frontend/components/jobs/stage-panel.tsx frontend/lib/i18n.ts frontend/tests/components/stage-panel.test.tsx
git commit -m "feat(jobs): StagePanel, the job's place in the pipeline"
```

---

### Task 5: Job detail on the design system, and the interview prefill

**Files:**
- Modify: `frontend/components/ui/page-header.tsx` (a `titleLang` prop)
- Rewrite: `frontend/app/dashboard/jobs/[id]/page.tsx`
- Modify: `frontend/app/dashboard/interview/new/page.tsx`
- Modify: `frontend/tests/design-guard.test.ts` (drop the `[id]` exemption)
- Test: `frontend/tests/app/jobs-detail.test.tsx`, `frontend/tests/app/interview-new.test.tsx`, `frontend/tests/components/ui.test.tsx`

**Interfaces:**
- Consumes:
  - `StagePanel` (Task 4)
  - `jobTitle` (Task 3)
  - `JOB_SCORE_BANDS` (Task 3)
  - `scoreTone`, `toneFill`, `toneText` and `Tone` from `@/lib/tones`
- Produces:
  - `PageHeader` gains `titleLang?: string | undefined`, set as the `<h1>`'s `lang`.
  - The match section is a `Card` with `id="match"`: the target of `StagePanel`'s `#match` links.
  - `/dashboard/interview/new?role=…&company=…` pre-fills the two fields.

- [ ] **Step 1: Write the failing tests**

In `frontend/tests/components/ui.test.tsx`, inside `describe("PageHeader", …)`, add:

```tsx
  it("tags the title's language when it isn't the page's", () => {
    render(<PageHeader title="バックエンドエンジニア" titleLang="ja" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute("lang", "ja");
  });
```

(The file already imports `render` and `screen` from `@testing-library/react`.)

In `frontend/tests/app/jobs-detail.test.tsx`:

1. Delete the `applicationsQuery` and `createApplication` hoisted objects, the `vi.mock("@/hooks/useApplications", …)` block, and their two resets in `beforeEach`.

2. After the `vi.mock("@/hooks/useResumes", …)` line, add:

   ```tsx
   // The panel has its own tests (tests/components/stage-panel.test.tsx).
   vi.mock("@/components/jobs/stage-panel", () => ({
     StagePanel: ({ job }: { job: { id: string } }) => (
       <section aria-label="stage panel">{job.id}</section>
     ),
   }));
   ```

3. Replace the whole `describe("job detail page, the job id card", …)` block and the whole `describe("job detail page, the tracker", …)` block with:

   ```tsx
   describe("job detail page, the job id card", () => {
     it("offers the id to copy, and no longer the document links", async () => {
       await renderPage(loadedJob());

       expect(screen.getByText(JOB_ID)).toBeInTheDocument();
       // The tailored document links moved into the stage panel.
       expect(
         screen.queryByRole("link", { name: j("generateRirekishoForJob") }),
       ).not.toBeInTheDocument();
     });

     it("confirms a copy", async () => {
       const writeText = vi.fn().mockResolvedValue(undefined);
       Object.defineProperty(navigator, "clipboard", {
         value: { writeText },
         configurable: true,
       });
       await renderPage(loadedJob());

       await act(async () => {
         fireEvent.click(screen.getByRole("button", { name: j("copy") }));
       });

       expect(writeText).toHaveBeenCalledWith(JOB_ID);
       expect(screen.getByRole("button", { name: j("copied") })).toBeInTheDocument();
     });
   });

   describe("job detail page, the pipeline", () => {
     it("shows the stage panel for this job", async () => {
       await renderPage(loadedJob());

       expect(screen.getByRole("region", { name: "stage panel" })).toHaveTextContent(JOB_ID);
       expect(screen.queryByText(j("addToTracker"))).not.toBeInTheDocument();
     });

     it("gives the match section the anchor the stage links point at", async () => {
       const { container } = await renderPage(loadedJob());

       expect(container.querySelector("#match")).toHaveTextContent(j("matchScore"));
     });
   });

   describe("job detail page, a missing posting", () => {
     it("says so in an alert", async () => {
       await renderPage({ data: undefined, isLoading: false, error: new ApiClientError(404, "x") });

       expect(screen.getByRole("alert")).toHaveTextContent(j("jobNotFound"));
     });
   });
   ```

In `frontend/tests/app/interview-new.test.tsx`:

1. Replace the `next/navigation` mock with:

   ```tsx
   const search = vi.hoisted(() => ({ current: "" }));
   vi.mock("next/navigation", () => ({
     useRouter: () => ({ push: () => {} }),
     useSearchParams: () => new URLSearchParams(search.current),
   }));
   ```

2. Add `search.current = "";` to `beforeEach`.

3. Add this test inside `describe("the new interview session page", …)`:

   ```tsx
   it("fills in the role and company a job's stage panel sent", async () => {
     search.current = "role=Backend+Engineer&company=Test+K.K.";
     await renderPage();

     expect(screen.getByRole("textbox", { name: new RegExp(iv("roleLabel")) })).toHaveValue(
       "Backend Engineer",
     );
     expect(screen.getByRole("textbox", { name: new RegExp(iv("companyLabel")) })).toHaveValue(
       "Test K.K.",
     );
   });
   ```

In `frontend/tests/design-guard.test.ts`, delete the `"app/dashboard/jobs/[id]/page.tsx": "Rebuilt in spec 3",` entry from `NOT_YET_MIGRATED`. In the `"has migrated everything except the pages spec 3 rebuilds"` test, delete `"app/dashboard/jobs/[id]/page.tsx",` from the expected list.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run tests/app/jobs-detail.test.tsx tests/app/interview-new.test.tsx tests/components/ui.test.tsx tests/design-guard.test.ts`
Expected, all FAIL:
- the stage panel test, the `#match` test and the alert test
- the prefill test
- the `titleLang` test
- the guard's `app/dashboard/jobs/[id]/page.tsx is on the design system`

- [ ] **Step 3: Add `titleLang` to `PageHeader`**

In `frontend/components/ui/page-header.tsx`:

1. Add to `PageHeaderProps`, after `titleRef`:

   ```tsx
     /** The title's language, when it isn't the page's (an untranslated job title). */
     titleLang?: string | undefined;
   ```

2. Add `titleLang,` to the destructured props.

3. Add `lang={titleLang}` to the `<h1>`, after `tabIndex={…}`.

- [ ] **Step 4: Rewrite the Job detail page**

Replace `frontend/app/dashboard/jobs/[id]/page.tsx` with:

```tsx
"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Copy } from "lucide-react";
import { useCachedJobMatch, useJob, useMatchJob } from "@/hooks/useJobs";
import { useResumes } from "@/hooks/useResumes";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { StagePanel } from "@/components/jobs/stage-panel";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage } from "@/lib/api-error";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { jobTitle } from "@/lib/pipeline";
import { JOB_SCORE_BANDS, scoreTone, toneFill, toneText, type Tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { JobMatch, JobPostingDetail } from "@/types/api";

interface Props {
  params: Promise<{ id: string }>;
}

const LINK_CLS =
  "rounded font-medium text-indigo underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function JobDetailPage({ params }: Props) {
  const { id } = use(params);
  const { data: job, isLoading, error } = useJob(id);
  const { lang } = useLang();

  if (isLoading) return <PageSkeleton />;
  if (error || !job) {
    return (
      <div className="space-y-4">
        <Breadcrumbs items={[{ label: t("jobs", "title", lang), href: "/dashboard/jobs" }]} />
        <Alert>{t("jobs", "jobNotFound", lang)}</Alert>
      </div>
    );
  }

  // Only the untranslated original title is in the job's own language.
  const titleLang =
    !job.translated_title && job.original_title ? job.original_language : undefined;
  const title = jobTitle(job) ?? t("jobs", "untitled", lang);
  const sd = job.structured_data;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: t("jobs", "title", lang), href: "/dashboard/jobs" },
          { label: title, lang: titleLang },
        ]}
      />
      <PageHeader
        className="mb-0"
        title={title}
        titleLang={titleLang}
        description={sd ? [sd.company_name, sd.location].filter(Boolean).join(" · ") : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {job.source_url && (
            <p className="text-xs text-muted-foreground">
              {t("jobs", "source", lang)}{" "}
              <span className="break-all font-mono">{job.source_url}</span>
            </p>
          )}
          <DetailsCard job={job} />
          <TranslatedDescription job={job} />
        </div>

        <div className="space-y-6">
          <StagePanel job={job} />
          <ScoreCard score={job.foreigner_friendliness_score} />
          <MatchSection jobId={id} />
          <JobIdCard jobId={id} />
        </div>
      </div>
    </div>
  );
}

function DetailsCard({ job }: { job: JobPostingDetail }) {
  const { lang } = useLang();
  const sd = job.structured_data;
  if (!sd) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("jobs", "jobDetails", lang)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
          <InfoRow label={t("jobs", "company", lang)} value={sd.company_name} />
          <InfoRow label={t("jobs", "location", lang)} value={sd.location} />
          <InfoRow label={t("jobs", "employmentType", lang)} value={sd.employment_type} />
          <InfoRow label={t("jobs", "salary", lang)} value={sd.salary_range} />
          <InfoRow
            label={t("jobs", "japaneseRequired", lang)}
            value={
              sd.required_japanese === "none"
                ? t("jobs", "notRequired", lang)
                : sd.required_japanese
            }
          />
          <InfoRow
            label={t("jobs", "experience", lang)}
            value={
              sd.required_experience_years === 0
                ? t("jobs", "freshGrads", lang)
                : `${sd.required_experience_years}${t("jobs", "yearsPlus", lang)}`
            }
          />
          <InfoRow
            label={t("jobs", "visaSponsorship", lang)}
            value={
              sd.visa_sponsorship === true
                ? t("common", "yes", lang)
                : sd.visa_sponsorship === false
                  ? t("common", "no", lang)
                  : t("common", "notMentioned", lang)
            }
          />
        </dl>
        <Bullets title={t("jobs", "keyRequirements", lang)} items={sd.key_requirements} tone="info" />
        <Bullets title={t("jobs", "benefits", lang)} items={sd.benefits} tone="success" />
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Bullets({ title, items, tone }: { title: string; items: string[]; tone: Tone }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span
              aria-hidden="true"
              className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", toneFill[tone])}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TranslatedDescription({ job }: { job: JobPostingDetail }) {
  const { lang } = useLang();
  const [expanded, setExpanded] = useState(false);

  if (!job.translated_description && !job.translation_summary) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("jobs", "translatedDesc", lang)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {job.translation_summary && (
          <p className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">
            <span className="font-medium text-foreground">{t("jobs", "summaryLabel", lang)} </span>
            {job.translation_summary}
          </p>
        )}
        {job.translated_description && (
          <>
            <div
              id="job-description"
              className={cn(
                "overflow-hidden whitespace-pre-wrap text-sm leading-relaxed",
                !expanded && "max-h-48",
              )}
            >
              {job.translated_description}
            </div>
            <Button
              variant="link"
              size="sm"
              aria-expanded={expanded}
              aria-controls="job-description"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? t("jobs", "showLess", lang) : t("jobs", "showFull", lang)}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreCard({ score }: { score: number | null }) {
  const { lang } = useLang();
  if (score === null) return null;

  const rounded = Math.round(score);
  const color = toneText[scoreTone(rounded, JOB_SCORE_BANDS)];
  const label =
    rounded >= 80
      ? t("jobs", "veryAccessible", lang)
      : rounded >= 60
        ? t("jobs", "accessible", lang)
        : rounded >= 40
          ? t("jobs", "challenging", lang)
          : t("jobs", "veryDifficult", lang);

  return (
    <Card className="p-5 text-center">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("jobs", "foreignerFriendly", lang)}
      </p>
      <p className={cn("text-5xl font-bold tabular-nums", color)}>{rounded}</p>
      <p className={cn("mt-1 text-sm font-medium", color)}>{label}</p>
      <p className="mt-2 text-xs text-muted-foreground">{t("jobs", "outOf100", lang)}</p>
    </Card>
  );
}

function MatchSection({ jobId }: { jobId: string }) {
  const { data: resumeList, isLoading: resumesLoading } = useResumes();
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const matchMutation = useMatchJob(jobId);
  const cachedMatch = useCachedJobMatch(jobId, selectedResumeId);
  const { lang } = useLang();

  const resumes = resumeList?.items ?? [];

  return (
    // The stage panel's "check your match" links land here.
    <Card id="match" className="scroll-mt-20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("jobs", "matchScore", lang)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {resumesLoading && <Skeleton className="h-10 w-full" />}

        {!resumesLoading && resumes.length === 0 && (
          <p className="text-sm text-muted-foreground">
            <Link href="/dashboard/resumes" className={LINK_CLS}>
              {t("jobs", "uploadResumeTo", lang)}
            </Link>{" "}
            {t("jobs", "toScoreJob", lang)}
          </p>
        )}

        {!resumesLoading && resumes.length > 0 && (
          <>
            <Field label={t("jobs", "matchResumeLabel", lang)}>
              <Select
                value={selectedResumeId}
                onChange={(e) => setSelectedResumeId(e.target.value)}
              >
                <option value="">{t("jobs", "selectResume", lang)}</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.file_name}
                    {r.is_primary ? ` (${t("common", "primary", lang)})` : ""}
                  </option>
                ))}
              </Select>
            </Field>

            <Button
              className="w-full"
              disabled={!selectedResumeId}
              loading={matchMutation.isPending}
              onClick={() => matchMutation.mutate({ resume_id: selectedResumeId })}
            >
              {matchMutation.isPending ? t("jobs", "scoring", lang) : t("jobs", "scoreBtn", lang)}
            </Button>

            {matchMutation.error && (
              <Alert>
                {/* 422 here is a precondition, not a bad request: either the
                    posting has no translation yet or the resume can't be read. */}
                {apiErrorMessage(matchMutation.error, lang, {
                  422: t("jobs", "matchNotPossible", lang),
                })}
              </Alert>
            )}
          </>
        )}

        {cachedMatch && <MatchResult match={cachedMatch} />}
      </CardContent>
    </Card>
  );
}

function MatchResult({ match }: { match: JobMatch }) {
  const { lang } = useLang();
  const score = Math.round(match.match_score);
  const bd = match.match_breakdown;
  const rec = match.recommendations;

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="text-center">
        <p
          className={cn(
            "text-4xl font-bold tabular-nums",
            toneText[scoreTone(score, JOB_SCORE_BANDS)],
          )}
        >
          {score}
        </p>
        <p className="text-xs text-muted-foreground">{t("jobs", "overallMatch", lang)}</p>
      </div>

      <div className="space-y-2">
        <SubScore label={t("jobs", "skills", lang)} value={bd.skills_match} />
        <SubScore label={t("jobs", "expLabel", lang)} value={bd.experience_match} />
        <SubScore label={t("jobs", "japanese", lang)} value={bd.language_match} />
        <SubScore label={t("jobs", "cultureFit", lang)} value={bd.culture_fit} />
      </div>

      <p className="text-xs text-muted-foreground">{bd.summary}</p>

      {rec && (
        <div className="space-y-3">
          <Bullets title={t("jobs", "strengths", lang)} items={rec.strengths} tone="success" />
          <Bullets title={t("jobs", "gaps", lang)} items={rec.gaps} tone="danger" />
          <Bullets title={t("jobs", "actions", lang)} items={rec.actions} tone="info" />
        </div>
      )}
    </div>
  );
}

function SubScore({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value);
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{pct}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className={cn("h-1.5 rounded-full", toneFill[scoreTone(pct, JOB_SCORE_BANDS)])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function JobIdCard({ jobId }: { jobId: string }) {
  const { lang } = useLang();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(jobId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="space-y-2 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("jobs", "jobId", lang)}
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-secondary px-2 py-1 text-xs">
          {jobId}
        </code>
        <Button variant="secondary" size="sm" onClick={() => void handleCopy()}>
          <Copy aria-hidden="true" />
          {copied ? t("jobs", "copied", lang) : t("jobs", "copy", lang)}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("jobs", "jobIdHint", lang)}</p>
    </Card>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-2/3" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Pre-fill the interview form**

In `frontend/app/dashboard/interview/new/page.tsx`:

1. Change the imports:
   - `import { useEffect, useState } from "react";` becomes `import { Suspense, useEffect, useState } from "react";`
   - `import { useRouter } from "next/navigation";` becomes `import { useRouter, useSearchParams } from "next/navigation";`

2. Rename `export default function NewInterviewPage()` to `function NewInterviewForm()`, and add above it:

   ```tsx
   // useSearchParams needs a Suspense boundary, as on the new-document pages.
   export default function NewInterviewPage() {
     return (
       <Suspense>
         <NewInterviewForm />
       </Suspense>
     );
   }
   ```

3. In `NewInterviewForm`, add `const searchParams = useSearchParams();` after `const router = useRouter();`, and replace the two field states with:

   ```tsx
     // A job's stage panel links here with the role and company filled in.
     const [targetRole, setTargetRole] = useState(() => searchParams.get("role") ?? "");
     const [targetCompany, setTargetCompany] = useState(() => searchParams.get("company") ?? "");
   ```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run tests/app/jobs-detail.test.tsx tests/app/interview-new.test.tsx tests/components/ui.test.tsx tests/design-guard.test.ts`
Expected: all PASS.

- [ ] **Step 7: Run the frontend checks**

Run: `cd frontend && npm test && npm run lint && npm run type-check && npm run format:check`
Expected: all PASS.

- [ ] **Step 8: Check it in the browser**

With the dev servers running (preview `frontend` and `backend`), open a job's page at desktop width and at 375px. Check:
- **Not tracked:** the stage panel shows **Save to pipeline**.
- **Saving:** clicking Save shows Saved with its moves, and focus lands on the panel heading.
- **Moving:** Start preparing shows the document links, then Back to Saved returns.
- **Links:** the `#match` link scrolls to the match card.
- **Phone width:** nothing overflows sideways.

Don't press Score: it spends AI quota. Leave the test job where you found it, or delete its application afterwards from the Pipeline page once Task 7 lands.

- [ ] **Step 9: Commit**

```bash
git add frontend/components/ui/page-header.tsx "frontend/app/dashboard/jobs/[id]/page.tsx" frontend/app/dashboard/interview/new/page.tsx frontend/tests/design-guard.test.ts frontend/tests/app/jobs-detail.test.tsx frontend/tests/app/interview-new.test.tsx frontend/tests/components/ui.test.tsx
git commit -m "feat(jobs): Job detail on the design system, with the stage panel"
```

---

### Task 6: The Jobs list on the design system

**Files:**
- Rewrite: `frontend/app/dashboard/jobs/page.tsx`
- Modify: `frontend/lib/i18n.ts` (the `jobs` section)
- Modify: `frontend/tests/design-guard.test.ts` (drop the `jobs/page.tsx` exemption)
- Test: `frontend/tests/app/jobs-list.test.tsx` (create)

**Interfaces:**
- Consumes:
  - `StageBadge` (Task 4)
  - `jobTitle` (Task 3)
  - `JOB_SCORE_BANDS` (Task 3)
  - `useJobs` and `useDeleteJob` from `@/hooks/useJobs`
  - `useApplications` and `useCreateApplication` from `@/hooks/useApplications`
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the strings**

Append to the `jobs` section of `frontend/lib/i18n.ts`:

```ts
    pipelineLink: { en: "Pipeline", id: "Pipeline", ja: "パイプライン" },
    save: { en: "Save", id: "Simpan", ja: "保存" },
    saveJobLabel: { en: "Save {title}", id: "Simpan {title}", ja: "{title}を保存" },
    deleteJobLabel: { en: "Delete {title}", id: "Hapus {title}", ja: "{title}を削除" },
    noPostingsHint: {
      en: "Translate a Japanese job posting to start your list.",
      id: "Terjemahkan lowongan kerja berbahasa Jepang untuk memulai daftar Anda.",
      ja: "日本語の求人を翻訳して、リストを作りましょう。",
    },
```

- [ ] **Step 2: Write the failing tests**

Create `frontend/tests/app/jobs-list.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import type { JobApplication, JobPosting } from "@/types/api";

const jobs = vi.hoisted(() => ({ current: {} as Record<string, unknown>, params: [] as unknown[] }));
const apps = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const created = vi.hoisted(() => ({ calls: [] as unknown[] }));
const deleted = vi.hoisted(() => ({ calls: [] as unknown[] }));
const confirm = vi.hoisted(() => ({ answer: true }));

vi.mock("@/hooks/useJobs", () => ({
  useJobs: (params: unknown) => {
    jobs.params.push(params);
    return jobs.current;
  },
  useDeleteJob: () => ({
    isPending: false,
    mutate: (id: string, opts?: { onSuccess?: () => void }) => {
      deleted.calls.push(id);
      opts?.onSuccess?.();
    },
  }),
}));
vi.mock("@/hooks/useApplications", () => ({
  useApplications: () => apps.current,
  useCreateApplication: () => ({
    isPending: false,
    mutate: (vars: unknown) => created.calls.push(vars),
  }),
}));
vi.mock("@/components/confirm-dialog-provider", () => ({
  useConfirm: () => () => Promise.resolve(confirm.answer),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));

const JobsPage = (await import("@/app/dashboard/jobs/page")).default;

const LANG = "en";
const j = (key: string) => t("jobs", key, LANG);

function job(over: Partial<JobPosting> = {}): JobPosting {
  return {
    id: "job-1",
    source_url: null,
    source_platform: "manual",
    original_title: "バックエンドエンジニア",
    original_company: "株式会社テスト",
    original_language: "ja",
    translated_title: "Backend Engineer",
    translation_summary: "A backend role in Shibuya.",
    foreigner_friendliness_score: 85,
    structured_data: {
      company_name: "Test K.K.",
      location: "Tokyo",
      employment_type: "Full-time",
      salary_range: "6-9M JPY",
      required_japanese: "N2",
      required_experience_years: 3,
      key_requirements: [],
      benefits: [],
      visa_sponsorship: true,
    },
    cached_until: null,
    is_mine: false,
    created_at: "2026-09-22T00:00:00Z",
    ...over,
  };
}

const loaded = (items: JobPosting[]) => ({
  data: { items, total: items.length },
  isLoading: false,
  error: null,
  isFetching: false,
  refetch: () => Promise.resolve(),
});

function renderPage() {
  return renderIn(LANG, <JobsPage />);
}

beforeEach(() => {
  jobs.current = loaded([job()]);
  jobs.params = [];
  apps.current = { data: [], isLoading: false };
  created.calls = [];
  deleted.calls = [];
  confirm.answer = true;
});

describe("jobs list, loading and failing", () => {
  it("shows a skeleton while jobs load", () => {
    jobs.current = { data: undefined, isLoading: true, error: null };
    const { container } = renderPage();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("offers a retry when the jobs fail to load", () => {
    const refetch = vi.fn(() => Promise.resolve());
    jobs.current = {
      data: undefined,
      isLoading: false,
      error: new ApiClientError(500, "boom"),
      isFetching: false,
      refetch,
    };
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent(j("loadError"));
    fireEvent.click(screen.getByRole("button", { name: t("common", "tryAgain", LANG) }));
    expect(refetch).toHaveBeenCalled();
  });

  it("points at translating a posting when there are none", () => {
    jobs.current = loaded([]);
    renderPage();
    expect(screen.getByText(j("noPostings"))).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: j("translateBtn") })) {
      expect(link).toHaveAttribute("href", "/dashboard/jobs/translate");
    }
  });
});

describe("jobs list, a job", () => {
  it("links to it and shows its company and score", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Backend Engineer" })).toHaveAttribute(
      "href",
      "/dashboard/jobs/job-1",
    );
    expect(screen.getByText("Test K.K. · Tokyo · Full-time")).toBeInTheDocument();
    expect(screen.getByText("85")).toHaveClass("text-success");
  });

  it("saves a job that isn't in the pipeline", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Save Backend Engineer" }));
    expect(created.calls).toEqual([{ job_posting_id: "job-1" }]);
  });

  it("shows a tracked job's stage instead of Save", () => {
    apps.current = {
      data: [{ id: "a1", job_posting_id: "job-1", status: "applied" } as JobApplication],
      isLoading: false,
    };
    renderPage();
    expect(screen.getByText(j("stageApplied"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Save/ })).not.toBeInTheDocument();
  });

  it("offers neither while the pipeline is unknown, and still lists the jobs", () => {
    apps.current = { data: undefined, isLoading: false, error: new ApiClientError(500, "x") };
    renderPage();
    expect(screen.getByRole("link", { name: "Backend Engineer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Save/ })).not.toBeInTheDocument();
  });

  it("offers to delete only the user's own pastes, after confirming", async () => {
    jobs.current = loaded([
      job(),
      job({ id: "job-2", translated_title: "Data Engineer", is_mine: true }),
    ]);
    renderPage();
    expect(
      screen.queryByRole("button", { name: "Delete Backend Engineer" }),
    ).not.toBeInTheDocument();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Delete Data Engineer" })),
    );
    expect(deleted.calls).toEqual(["job-2"]);
  });
});

describe("jobs list, searching", () => {
  it("searches for the typed text", () => {
    renderPage();
    fireEvent.change(screen.getByRole("searchbox", { name: j("searchLabel") }), {
      target: { value: "python" },
    });
    fireEvent.click(screen.getByRole("button", { name: t("common", "search", LANG) }));
    expect(jobs.params.at(-1)).toEqual({ q: "python" });
  });
});
```

In `frontend/tests/design-guard.test.ts`, delete the `"app/dashboard/jobs/page.tsx": "Rebuilt in spec 3",` entry from `NOT_YET_MIGRATED`, and delete `"app/dashboard/jobs/page.tsx",` from the pinned list in `"has migrated everything except the pages spec 3 rebuilds"`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run tests/app/jobs-list.test.tsx tests/design-guard.test.ts`
Expected: most list tests FAIL, because the old page has no Save, no retry and different labels. The guard's `app/dashboard/jobs/page.tsx is on the design system` also FAILS.

- [ ] **Step 4: Rewrite the page**

Replace `frontend/app/dashboard/jobs/page.tsx` with:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Briefcase, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { StageBadge } from "@/components/jobs/stage-badge";
import { RetryButton } from "@/components/retry-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useApplications, useCreateApplication } from "@/hooks/useApplications";
import { useDeleteJob, useJobs } from "@/hooks/useJobs";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { jobTitle } from "@/lib/pipeline";
import { JOB_SCORE_BANDS, scoreTone, toneText } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { JobApplication, JobPosting } from "@/types/api";

const MIN_SCORES = [60, 70, 80];

export default function JobsPage() {
  const { lang } = useLang();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [minScore, setMinScore] = useState<number | undefined>(undefined);
  const jobs = useJobs({ q: search || undefined, min_score: minScore });
  const applications = useApplications();
  const filtered = search !== "" || minScore !== undefined;

  // Each job's application, or undefined while the pipeline is unknown: a row
  // then shows neither its stage nor Save, rather than offering a duplicate.
  const byJob = applications.data
    ? new Map(applications.data.map((a) => [a.job_posting_id, a]))
    : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title={t("jobs", "title", lang)}
        description={t("jobs", "sub", lang)}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/dashboard/jobs/applications">{t("jobs", "pipelineLink", lang)}</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/jobs/translate">{t("jobs", "translateBtn", lang)}</Link>
            </Button>
          </>
        }
      />

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q.trim());
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label htmlFor="job-search" className="sr-only">
          {t("jobs", "searchLabel", lang)}
        </label>
        <Input
          id="job-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("jobs", "searchPlaceholder", lang)}
          className="sm:flex-1"
        />
        <label htmlFor="job-min-score" className="sr-only">
          {t("jobs", "minScoreLabel", lang)}
        </label>
        <Select
          id="job-min-score"
          value={minScore ?? ""}
          onChange={(e) => setMinScore(e.target.value ? Number(e.target.value) : undefined)}
          className="sm:w-40"
        >
          <option value="">{t("jobs", "allScores", lang)}</option>
          {MIN_SCORES.map((n) => (
            <option key={n} value={n}>{`${n}+`}</option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">
            {t("common", "search", lang)}
          </Button>
          {filtered && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQ("");
                setSearch("");
                setMinScore(undefined);
              }}
            >
              {t("common", "clear", lang)}
            </Button>
          )}
        </div>
      </form>

      {jobs.isLoading && <JobsSkeleton />}

      {jobs.error && !jobs.data && (
        <Alert
          action={<RetryButton retrying={jobs.isFetching} onRetry={() => void jobs.refetch()} />}
        >
          {t("jobs", "loadError", lang)}
        </Alert>
      )}

      {jobs.data && jobs.data.items.length === 0 && (
        <EmptyState
          icon={Briefcase}
          title={t("jobs", "noPostings", lang)}
          description={t("jobs", "noPostingsHint", lang)}
          action={
            <Button asChild>
              <Link href="/dashboard/jobs/translate">{t("jobs", "translateBtn", lang)}</Link>
            </Button>
          }
        />
      )}

      {jobs.data && jobs.data.items.length > 0 && (
        <ul className="space-y-3">
          {jobs.data.items.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              application={byJob?.get(job.id)}
              pipelineKnown={byJob !== undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function JobRow({
  job,
  application,
  pipelineKnown,
}: {
  job: JobPosting;
  application: JobApplication | undefined;
  pipelineKnown: boolean;
}) {
  const { lang } = useLang();
  const confirmDialog = useConfirm();
  const { toast } = useToast();
  const remove = useDeleteJob();
  const save = useCreateApplication();
  const sd = job.structured_data;
  const title = jobTitle(job) ?? t("jobs", "untitled", lang);
  const score = job.foreigner_friendliness_score === null
    ? null
    : Math.round(job.foreigner_friendliness_score);

  async function handleDelete() {
    const ok = await confirmDialog({
      title: t("jobs", "confirmDelete", lang),
      variant: "destructive",
      confirmLabel: t("common", "delete", lang),
      cancelLabel: t("common", "cancel", lang),
    });
    if (!ok) return;
    remove.mutate(job.id, {
      onSuccess: () => toast({ variant: "success", description: t("common", "deleted", lang) }),
      onError: () =>
        toast({ variant: "destructive", description: t("common", "deleteFailed", lang) }),
    });
  }

  return (
    <li>
      <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <Link
            href={`/dashboard/jobs/${job.id}` as Route}
            // Only the untranslated original title is in the job's own language.
            lang={!job.translated_title && job.original_title ? job.original_language : undefined}
            className="block rounded font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {title}
          </Link>
          {sd && (
            <p className="text-xs text-muted-foreground">
              {[sd.company_name, sd.location, sd.employment_type].filter(Boolean).join(" · ")}
            </p>
          )}
          {job.translation_summary && (
            <p className="line-clamp-2 text-xs text-muted-foreground">{job.translation_summary}</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {sd?.required_japanese && sd.required_japanese !== "none" && (
              <Badge>{sd.required_japanese}</Badge>
            )}
            {sd?.visa_sponsorship === true && (
              <Badge variant="success">{t("jobs", "visaSponsorship", lang)}</Badge>
            )}
            {sd?.salary_range && <Badge>{sd.salary_range}</Badge>}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end">
          {score !== null && (
            <div className="sm:text-right">
              <p
                className={cn(
                  "text-xl font-bold tabular-nums",
                  toneText[scoreTone(score, JOB_SCORE_BANDS)],
                )}
              >
                {score}
              </p>
              <p className="text-xs text-muted-foreground">{t("jobs", "friendliness", lang)}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            {application ? (
              <StageBadge status={application.status} />
            ) : (
              pipelineKnown && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={save.isPending}
                  aria-label={t("jobs", "saveJobLabel", lang).replace("{title}", title)}
                  onClick={() =>
                    save.mutate(
                      { job_posting_id: job.id },
                      {
                        onError: () =>
                          toast({
                            variant: "destructive",
                            description: t("common", "updateFailed", lang),
                          }),
                      },
                    )
                  }
                >
                  {t("jobs", "save", lang)}
                </Button>
              )
            )}
            {job.is_mine && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("jobs", "deleteJobLabel", lang).replace("{title}", title)}
                loading={remove.isPending}
                onClick={() => void handleDelete()}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}

function JobsSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i}>
          <Skeleton className="h-28 w-full" />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run tests/app/jobs-list.test.tsx tests/design-guard.test.ts`
Expected: all PASS.

- [ ] **Step 6: Mutation-check the pipeline guard**

Change `pipelineKnown && (` to `(`. "offers neither while the pipeline is unknown" must fail. Restore.

- [ ] **Step 7: Run the frontend checks**

Run: `cd frontend && npm test && npm run lint && npm run type-check && npm run format:check`
Expected: all PASS.

- [ ] **Step 8: Check it in the browser**

Open `/dashboard/jobs` at desktop width and at 375px. Check:
- Rows stack on a phone, with no sideways scroll.
- Save turns into a Saved badge.
- Only your own pastes show the delete icon.
- Search and Clear work.

- [ ] **Step 9: Commit**

```bash
git add frontend/app/dashboard/jobs/page.tsx frontend/lib/i18n.ts frontend/tests/app/jobs-list.test.tsx frontend/tests/design-guard.test.ts
git commit -m "feat(jobs): the Jobs list on the design system, with Save and stages"
```

---

### Task 7: The Pipeline board, with optimistic moves

**Files:**
- Modify: `frontend/hooks/useApplications.ts` (`useUpdateApplication`)
- Rewrite: `frontend/app/dashboard/jobs/applications/page.tsx`
- Modify: `frontend/lib/i18n.ts` (the `jobs` section)
- Modify: `frontend/tests/design-guard.test.ts` (drop the last page exemption and `jobs.jobBoard`)
- Test: `frontend/tests/hooks/useApplications.test.tsx` (create), `frontend/tests/app/pipeline.test.tsx` (create)

**Interfaces:**
- Consumes:
  - `FORWARD_STAGES`, `ForwardStatus`, `isForward`, `moveLabel`, `reopenTarget`, `splitMoves` and `stageName` (Task 3)
  - `StageBadge` (Task 4)
- Produces: `useUpdateApplication()` updates every `["jobs","applications",…]` query at once, and restores them if the request fails. `StagePanel` benefits too.

- [ ] **Step 1: Add the strings**

Append to the `jobs` section of `frontend/lib/i18n.ts`:

```ts
    pipelineTitle: { en: "Pipeline", id: "Pipeline", ja: "応募パイプライン" },
    pipelineSub: {
      en: "Every job you've saved, from first look to offer.",
      id: "Semua lowongan yang Anda simpan, dari awal hingga tawaran.",
      ja: "保存した求人を、最初の確認から内定まで管理します。",
    },
    findJobs: { en: "Find jobs", id: "Cari lowongan", ja: "求人を探す" },
    stageEmpty: { en: "Nothing here yet", id: "Belum ada", ja: "まだありません" },
    archived: { en: "Archived ({n})", id: "Diarsipkan ({n})", ja: "アーカイブ（{n}）" },
    editNotesFor: {
      en: "Edit notes for {title}",
      id: "Ubah catatan untuk {title}",
      ja: "{title}のメモを編集",
    },
    removeFor: { en: "Remove {title}", id: "Hapus {title}", ja: "{title}を削除" },
    saveNotes: { en: "Save notes", id: "Simpan catatan", ja: "メモを保存" },
    pipelineEmpty: {
      en: "No jobs in your pipeline yet",
      id: "Belum ada lowongan di pipeline Anda",
      ja: "パイプラインにまだ求人がありません",
    },
    pipelineEmptyHint: {
      en: "Save a job from the job list to start tracking it.",
      id: "Simpan lowongan dari daftar untuk mulai melacaknya.",
      ja: "求人リストから保存すると、ここで管理できます。",
    },
```

Delete the `jobBoard` entry from the `jobs` section; the new board doesn't use it. Run `grep -rn '"jobBoard"' frontend/app frontend/components` first: it must print nothing once Step 5 replaces the page. Do the delete after Step 5 if it still prints the old page.

- [ ] **Step 2: Write the failing hook test**

Create `frontend/tests/hooks/useApplications.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { useUpdateApplication } from "@/hooks/useApplications";
import type { JobApplication } from "@/types/api";

const KEY = ["jobs", "applications", "all"];
const APP = { id: "a1", status: "planning", notes: null } as JobApplication;

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(KEY, [APP]);
  const { result } = renderHook(() => useUpdateApplication(), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  const status = () => client.getQueryData<JobApplication[]>(KEY)?.[0]?.status;
  return { result, status };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useUpdateApplication", () => {
  it("moves the job in the cached lists before the server answers", async () => {
    vi.spyOn(apiClient, "patch").mockReturnValue(new Promise(() => {}));
    const { result, status } = setup();

    act(() => result.current.mutate({ id: "a1", data: { status: "preparing" } }));

    await waitFor(() => expect(status()).toBe("preparing"));
  });

  it("puts it back when the server refuses the move", async () => {
    vi.spyOn(apiClient, "patch").mockRejectedValue(new ApiClientError(422, "no"));
    const { result, status } = setup();

    act(() => result.current.mutate({ id: "a1", data: { status: "offered" } }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(status()).toBe("planning");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend && npx vitest run tests/hooks/useApplications.test.tsx`
Expected: "moves the job … before the server answers" FAILS: the status stays `planning`, because the cache isn't touched until the refetch.

- [ ] **Step 4: Make the update optimistic**

In `frontend/hooks/useApplications.ts`, change the react-query import to `import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";` and replace `useUpdateApplication` with:

```ts
/**
 * A move shows at once in every cached list; one the server refuses is put
 * back. The refetch afterwards brings in what the server set (applied_at,
 * closed_from).
 */
export function useUpdateApplication() {
  const queryClient = useQueryClient();
  return useMutation<
    JobApplication,
    Error,
    { id: string; data: UpdateApplicationRequest },
    { previous: [QueryKey, JobApplication[] | undefined][] }
  >({
    mutationFn: ({ id, data }) => apiClient.patch<JobApplication>(`/jobs/applications/${id}`, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: QK });
      const previous = queryClient.getQueriesData<JobApplication[]>({ queryKey: QK });
      queryClient.setQueriesData<JobApplication[]>({ queryKey: QK }, (apps) =>
        apps?.map((app) => (app.id === id ? { ...app, ...data } : app)),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      for (const [key, apps] of context?.previous ?? []) queryClient.setQueryData(key, apps);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QK });
    },
  });
}
```

Run `npx vitest run tests/hooks/useApplications.test.tsx`. Expected: PASS.

- [ ] **Step 5: Write the failing page tests**

Create `frontend/tests/app/pipeline.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within, type RenderResult } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import { LanguageProvider } from "@/lib/language-context";
import type { JobApplication } from "@/types/api";

const apps = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const update = vi.hoisted(() => ({ calls: [] as unknown[], fail: false }));
const removed = vi.hoisted(() => ({ calls: [] as unknown[] }));
const toasts = vi.hoisted(() => ({ calls: [] as Array<{ variant?: string; description?: string }> }));

vi.mock("@/hooks/useApplications", () => ({
  useApplications: () => apps.current,
  useUpdateApplication: () => ({
    mutateAsync: (vars: unknown) => {
      update.calls.push(vars);
      return update.fail ? Promise.reject(new Error("refused")) : Promise.resolve(vars);
    },
  }),
  useDeleteApplication: () => ({
    isPending: false,
    mutate: (id: string) => removed.calls.push(id),
  }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: (toast: { variant?: string; description?: string }) => toasts.calls.push(toast) }),
}));
vi.mock("@/components/confirm-dialog-provider", () => ({
  useConfirm: () => () => Promise.resolve(true),
}));

const PipelinePage = (await import("@/app/dashboard/jobs/applications/page")).default;

const LANG = "en";
const j = (key: string) => t("jobs", key, LANG);

function app(over: Partial<JobApplication> = {}): JobApplication {
  return {
    id: "a1",
    user_id: "u1",
    job_posting_id: "job-1",
    status: "planning",
    applied_at: null,
    notes: null,
    closed_from: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    job_title: "Backend Engineer",
    job_company: "Test K.K.",
    ...over,
  };
}

function setApps(list: JobApplication[] | undefined, extra: Record<string, unknown> = {}) {
  apps.current = { data: list, isLoading: list === undefined, error: null, ...extra };
}

let view: RenderResult;
function renderPage() {
  view = renderIn(LANG, <PipelinePage />);
  return view;
}
function rerender() {
  view.rerender(
    <LanguageProvider initialLang={LANG}>
      <PipelinePage />
    </LanguageProvider>,
  );
}

const region = (stage: string) => screen.getByRole("region", { name: j(stage) });

beforeEach(() => {
  setApps([app()]);
  update.calls = [];
  update.fail = false;
  removed.calls = [];
  toasts.calls = [];
});

describe("pipeline board, loading and empty", () => {
  it("shows a skeleton while it loads", () => {
    setApps(undefined);
    const { container } = renderPage();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("offers a retry when it fails to load", () => {
    const refetch = vi.fn(() => Promise.resolve());
    setApps(undefined, {
      isLoading: false,
      error: new ApiClientError(500, "x"),
      isFetching: false,
      refetch,
    });
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent(j("appLoadError"));
    fireEvent.click(screen.getByRole("button", { name: t("common", "tryAgain", LANG) }));
    expect(refetch).toHaveBeenCalled();
  });

  it("points at the job list when nothing is saved", () => {
    setApps([]);
    renderPage();
    expect(screen.getByText(j("pipelineEmpty"))).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: j("findJobs") })) {
      expect(link).toHaveAttribute("href", "/dashboard/jobs");
    }
  });
});

describe("pipeline board, the stages", () => {
  it("lays out every forward stage with its count", () => {
    setApps([
      app({ id: "a1" }),
      app({ id: "a2", job_title: "Data Engineer" }),
      app({ id: "a3", status: "applied", applied_at: "2026-09-10T00:00:00Z" }),
    ]);
    renderPage();
    expect(within(region("stagePlanning")).getByText("2")).toBeInTheDocument();
    expect(within(region("stageApplied")).getByText("1")).toBeInTheDocument();
    expect(within(region("stageOffered")).getByText(j("stageEmpty"))).toBeInTheDocument();
  });

  it("moves a card to the next stage", async () => {
    renderPage();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start preparing" })));
    expect(update.calls).toEqual([{ id: "a1", data: { status: "preparing" } }]);
  });

  it("puts focus on the moved card in its new place", async () => {
    renderPage();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start preparing" })));
    setApps([app({ status: "preparing" })]);
    act(() => rerender());
    expect(document.activeElement).toBe(
      within(region("stagePreparing")).getByRole("link", { name: "Backend Engineer" }),
    );
  });

  it("says when a move was refused", async () => {
    update.fail = true;
    renderPage();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start preparing" })));
    expect(toasts.calls).toContainEqual({
      variant: "destructive",
      description: t("common", "updateFailed", LANG),
    });
  });

  it("has no forward move once an offer is accepted", () => {
    setApps([app({ status: "accepted", applied_at: "2026-09-10T00:00:00Z" })]);
    renderPage();
    const card = within(region("stageAccepted"));
    expect(card.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Edit notes for Backend Engineer",
      "Remove Backend Engineer",
    ]);
  });
});

describe("pipeline board, a card's notes and removal", () => {
  it("edits notes in place and returns focus to the edit button", async () => {
    renderPage();
    const pencil = screen.getByRole("button", { name: "Edit notes for Backend Engineer" });
    fireEvent.click(pencil);
    fireEvent.change(screen.getByRole("textbox", { name: j("notesLabel") }), {
      target: { value: "Call on Friday" },
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: j("saveNotes") })));
    expect(update.calls).toEqual([{ id: "a1", data: { notes: "Call on Friday" } }]);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(pencil);
  });

  it("cancels notes with Escape", () => {
    renderPage();
    const pencil = screen.getByRole("button", { name: "Edit notes for Backend Engineer" });
    fireEvent.click(pencil);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(pencil);
  });

  it("removes a card after confirming", async () => {
    renderPage();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Remove Backend Engineer" })),
    );
    expect(removed.calls).toEqual(["a1"]);
  });
});

describe("pipeline board, archived jobs", () => {
  beforeEach(() => {
    setApps([
      app({ id: "a1", status: "rejected", closed_from: "interviewing" }),
      app({ id: "a2", status: "skipped", closed_from: "planning", job_title: "Data Engineer" }),
    ]);
  });

  it("keeps them folded away until asked", () => {
    renderPage();
    const toggle = screen.getByRole("button", { name: "Archived (2)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /^Reopen/ })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(j("stageRejected"))).toBeInTheDocument();
  });

  it("reopens one where it left", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Archived (2)" }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Reopen at Interviewing" })),
    );
    expect(update.calls).toEqual([{ id: "a1", data: { status: "interviewing" } }]);
  });
});
```

In `frontend/tests/design-guard.test.ts`:
1. Delete the `"app/dashboard/jobs/applications/page.tsx": "Rebuilt in spec 3",` entry from `NOT_YET_MIGRATED`.
2. Delete the `"jobs.jobBoard": "Rebuilt in spec 3",` entry from `STRINGS_NOT_YET_MIGRATED`.
3. In `"has migrated everything except the pages spec 3 rebuilds"`, make both expectations empty: `toEqual([])` for the page list, and `toEqual([])` for the strings.

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run tests/app/pipeline.test.tsx tests/design-guard.test.ts`
Expected: FAIL. The old page has no regions or Archived toggle, and uses `→ status` glyph buttons.

- [ ] **Step 7: Rewrite the board**

Replace `frontend/app/dashboard/jobs/applications/page.tsx` with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Briefcase, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { StageBadge } from "@/components/jobs/stage-badge";
import { RetryButton } from "@/components/retry-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useApplications,
  useDeleteApplication,
  useUpdateApplication,
} from "@/hooks/useApplications";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import {
  FORWARD_STAGES,
  isForward,
  moveLabel,
  reopenTarget,
  splitMoves,
  stageName,
  type ForwardStatus,
} from "@/lib/pipeline";
import { cn } from "@/lib/utils";
import type { ApplicationStatus, JobApplication } from "@/types/api";

type MoveFn = (app: JobApplication, to: ApplicationStatus) => void;

const titleId = (applicationId: string) => `application-${applicationId}`;

export default function PipelinePage() {
  const { lang } = useLang();
  const applications = useApplications();
  // Held here, not in the cards: a moved card unmounts from its old column
  // straight away, and a mutation's per-call callbacks don't fire after that.
  const update = useUpdateApplication();
  const { toast } = useToast();
  // The card to focus once it shows at the given status.
  const [focus, setFocus] = useState<{ id: string; status: ApplicationStatus } | null>(null);

  const all = applications.data;

  // A move re-renders the card in another column; focus follows it there, so
  // keyboard users keep their place.
  useEffect(() => {
    if (focus === null) return;
    const link = document.getElementById(titleId(focus.id));
    if (link?.dataset["status"] === focus.status) {
      link.focus();
      setFocus(null);
    }
  }, [focus, all]);

  const move: MoveFn = (app, to) => {
    setFocus({ id: app.id, status: to });
    update.mutateAsync({ id: app.id, data: { status: to } }).catch(() => {
      // The hook has put the card back; follow it there and say why.
      setFocus({ id: app.id, status: app.status });
      toast({ variant: "destructive", description: t("common", "updateFailed", lang) });
    });
  };

  let body: React.ReactNode;
  if (all === undefined && applications.error) {
    body = (
      <Alert
        action={
          <RetryButton
            retrying={applications.isFetching}
            onRetry={() => void applications.refetch()}
          />
        }
      >
        {t("jobs", "appLoadError", lang)}
      </Alert>
    );
  } else if (all === undefined) {
    body = <BoardSkeleton />;
  } else if (all.length === 0) {
    body = (
      <EmptyState
        icon={Briefcase}
        title={t("jobs", "pipelineEmpty", lang)}
        description={t("jobs", "pipelineEmptyHint", lang)}
        action={
          <Button asChild>
            <Link href="/dashboard/jobs">{t("jobs", "findJobs", lang)}</Link>
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        {/* Stacked on phones; all six side by side only where each gets ~180px. */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {FORWARD_STAGES.map((stage) => (
            <StageColumn
              key={stage}
              stage={stage}
              apps={all.filter((a) => a.status === stage)}
              onMove={move}
            />
          ))}
        </div>
        <Archived apps={all.filter((a) => !isForward(a.status))} onMove={move} />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title={t("jobs", "pipelineTitle", lang)}
        description={t("jobs", "pipelineSub", lang)}
        actions={
          <Button asChild variant="secondary">
            <Link href="/dashboard/jobs">{t("jobs", "findJobs", lang)}</Link>
          </Button>
        }
      />
      {body}
    </div>
  );
}

function StageColumn({
  stage,
  apps,
  onMove,
}: {
  stage: ForwardStatus;
  apps: JobApplication[];
  onMove: MoveFn;
}) {
  const { lang } = useLang();
  const headingId = `stage-${stage}`;
  return (
    <section aria-labelledby={headingId} className="rounded-lg border bg-secondary p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id={headingId} className="text-sm font-semibold">
          {stageName(stage, lang)}
        </h2>
        <Badge className="tabular-nums">{apps.length}</Badge>
      </div>
      {apps.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("jobs", "stageEmpty", lang)}</p>
      ) : (
        <ul className="space-y-2">
          {apps.map((app) => (
            <PipelineCard key={app.id} app={app} onMove={onMove} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TitleLink({ app }: { app: JobApplication }) {
  const { lang } = useLang();
  return (
    <Link
      id={titleId(app.id)}
      data-status={app.status}
      href={`/dashboard/jobs/${app.job_posting_id}` as Route}
      className="line-clamp-2 rounded font-medium leading-snug hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {app.job_title ?? t("jobs", "untitled", lang)}
    </Link>
  );
}

function PipelineCard({ app, onMove }: { app: JobApplication; onMove: MoveFn }) {
  const { lang } = useLang();
  const confirmDialog = useConfirm();
  const { toast } = useToast();
  const update = useUpdateApplication();
  const remove = useDeleteApplication();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(app.notes ?? "");
  const [saving, setSaving] = useState(false);
  const pencilRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const title = app.job_title ?? t("jobs", "untitled", lang);
  const next = isForward(app.status) ? splitMoves(app.status).next : null;

  // Closing the notes editor puts focus back on the button that opened it.
  useEffect(() => {
    if (wasEditing.current && !editing) pencilRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  function cancel() {
    setNotes(app.notes ?? "");
    setEditing(false);
  }

  async function saveNotes() {
    setSaving(true);
    try {
      await update.mutateAsync({ id: app.id, data: { notes } });
      setEditing(false);
    } catch {
      toast({ variant: "destructive", description: t("common", "updateFailed", lang) });
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    const ok = await confirmDialog({
      title: t("jobs", "confirmRemove", lang),
      variant: "destructive",
      confirmLabel: t("common", "delete", lang),
      cancelLabel: t("common", "cancel", lang),
    });
    if (!ok) return;
    remove.mutate(app.id, {
      onSuccess: () => toast({ variant: "success", description: t("common", "deleted", lang) }),
      onError: () =>
        toast({ variant: "destructive", description: t("common", "deleteFailed", lang) }),
    });
  }

  const appliedDate = app.applied_at
    ? new Date(app.applied_at).toLocaleDateString(lang, { day: "numeric", month: "short" })
    : null;
  const notesId = `notes-${app.id}`;

  return (
    <li className="space-y-2 rounded-md border bg-card p-3 text-sm">
      <div className="min-w-0">
        <TitleLink app={app} />
        {app.job_company && <p className="text-xs text-muted-foreground">{app.job_company}</p>}
      </div>

      {appliedDate && (
        <p className="text-xs text-muted-foreground">
          {t("jobs", "appliedOn", lang)} {appliedDate}
        </p>
      )}

      {editing ? (
        <div className="space-y-2">
          <label htmlFor={notesId} className="sr-only">
            {t("jobs", "notesLabel", lang)}
          </label>
          <Textarea
            id={notesId}
            value={notes}
            rows={3}
            autoFocus
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancel();
            }}
            className="text-xs"
          />
          <div className="flex gap-2">
            <Button size="sm" loading={saving} onClick={() => void saveNotes()}>
              {t("jobs", "saveNotes", lang)}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel}>
              {t("common", "cancel", lang)}
            </Button>
          </div>
        </div>
      ) : (
        app.notes && <p className="line-clamp-1 text-xs text-muted-foreground">{app.notes}</p>
      )}

      <div className="flex items-center gap-1">
        {next && (
          <Button size="sm" variant="secondary" onClick={() => onMove(app, next)}>
            {moveLabel(app.status, next, lang)}
          </Button>
        )}
        <div className="ml-auto flex gap-1">
          <Button
            ref={pencilRef}
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t("jobs", "editNotesFor", lang).replace("{title}", title)}
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t("jobs", "removeFor", lang).replace("{title}", title)}
            loading={remove.isPending}
            onClick={() => void handleRemove()}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
    </li>
  );
}

function Archived({ apps, onMove }: { apps: JobApplication[]; onMove: MoveFn }) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  if (apps.length === 0) return null;

  return (
    <section className="space-y-3">
      <Button variant="ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ChevronDown
          aria-hidden="true"
          className={cn("transition-transform motion-reduce:transition-none", open && "rotate-180")}
        />
        {t("jobs", "archived", lang).replace("{n}", String(apps.length))}
      </Button>
      {open && (
        <ul className="divide-y rounded-lg border bg-card">
          {apps.map((app) => {
            const target = reopenTarget(app);
            const date = new Date(app.updated_at).toLocaleDateString(lang, {
              day: "numeric",
              month: "short",
            });
            return (
              <li
                key={app.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <TitleLink app={app} />
                  <div className="flex flex-wrap items-center gap-2">
                    <StageBadge status={app.status} />
                    <span className="text-xs text-muted-foreground">{date}</span>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => onMove(app, target)}>
                  {moveLabel(app.status, target, lang)}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function BoardSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {FORWARD_STAGES.map((stage) => (
        <Skeleton key={stage} className="h-40 w-full" />
      ))}
    </div>
  );
}
```

Now do Step 1's `jobBoard` deletion. `grep -rn '"jobBoard"' frontend/app frontend/components` must print nothing.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run tests/app/pipeline.test.tsx tests/hooks/useApplications.test.tsx tests/design-guard.test.ts tests/components/stage-panel.test.tsx`
Expected: all PASS.

- [ ] **Step 9: Mutation-check the focus**

In the page's focus effect, change `link.focus();` to `void link;`. "puts focus on the moved card in its new place" must fail. Restore.

- [ ] **Step 10: Run the frontend checks**

Run: `cd frontend && npm test && npm run lint && npm run type-check && npm run format:check`
Expected: all PASS.

- [ ] **Step 11: Check it in the browser**

Open `/dashboard/jobs/applications` at desktop width, at 1280px and at 375px. With the job saved in Task 5:
- **Moving:** move it forward with its card button. It moves at once, and focus lands on its title in the new column.
- **Archiving:** Skip it from the job's stage panel, then open Archived and Reopen it at Saved.
- **Notes:** edit its notes; Escape and Save both return focus to the pencil.
- **Phone width:** stages stack, with no sideways scroll.

Leave the job where you found it, or Remove it if you created it for this check.

- [ ] **Step 12: Commit**

```bash
git add frontend/hooks/useApplications.ts frontend/app/dashboard/jobs/applications/page.tsx frontend/lib/i18n.ts frontend/tests/hooks/useApplications.test.tsx frontend/tests/app/pipeline.test.tsx frontend/tests/design-guard.test.ts
git commit -m "feat(jobs): the Pipeline board, with optimistic moves and an archive"
```

---

### Task 8: Home counts applying, and summarises the pipeline

**Files:**
- Modify: `frontend/lib/journey.ts` (the `application` step, around line 145)
- Modify: `frontend/app/dashboard/page.tsx` (`JourneyBoard`)
- Modify: `frontend/lib/i18n.ts` (the `home` section)
- Test: `frontend/tests/lib/journey.test.ts`, `frontend/tests/app/home.test.tsx`

**Interfaces:**
- Consumes: `hasApplied`, `forwardCounts` and `stageName` (Task 3).
- Produces: none.

- [ ] **Step 1: Add the strings**

Insert at the end of the `home` section of `frontend/lib/i18n.ts`, just before the `  },` that closes it (the line before `  dashboard: {`):

```ts
    pipelineCount: { en: "{n} {stage}", id: "{n} {stage}", ja: "{stage} {n}件" },
```

- [ ] **Step 2: Write the failing tests**

In `frontend/tests/lib/journey.test.ts`:

1. Line 39 (`ALL_DONE`'s applications) becomes:

   ```ts
     applications: [{ id: "app1", status: "applied", applied_at: null } as JobApplication],
   ```

2. Line 66 becomes:

   ```ts
       ["application", { applications: [{ id: "app1", status: "applied", applied_at: null } as JobApplication] }],
   ```

3. Add inside `describe("computeJourney: what counts as done", …)`:

   ```ts
     it("doesn't count saving or preparing a job as applying", () => {
       const saved = [
         { id: "a1", status: "planning", applied_at: null },
         { id: "a2", status: "preparing", applied_at: null },
         { id: "a3", status: "skipped", applied_at: null },
       ] as JobApplication[];
       expect(stateOf({ ...NEW_USER, applications: saved }, "application")).toBe("todo");
     });

     it("counts a job closed after applying", () => {
       const closed = [
         { id: "a1", status: "rejected", applied_at: "2026-09-10T00:00:00Z" },
       ] as JobApplication[];
       expect(stateOf({ ...NEW_USER, applications: closed }, "application")).toBe("done");
     });
   ```

   `stateOf(input, id)` and `NEW_USER` are the file's existing helpers, used by the `it.each` above.

In `frontend/tests/app/home.test.tsx`:

1. `FINISHED`'s application becomes:

   ```ts
       { id: "app1", job_title: "SRE", status: "applied", applied_at: "2026-09-24T00:00:00+00:00", created_at: "2026-09-24T00:00:00+00:00" },
   ```

2. Add inside `describe("Home", …)`:

   ```tsx
     it("summarises the pipeline under Apply, linking to it", () => {
       setJourney({
         ...MID_JOURNEY,
         applications: [
           { id: "a1", status: "planning", applied_at: null },
           { id: "a2", status: "planning", applied_at: null },
           { id: "a3", status: "applied", applied_at: "2026-09-24T00:00:00+00:00" },
           { id: "a4", status: "rejected", applied_at: null },
         ] as never,
       });
       renderIn("en", <HomePage />);
       expect(screen.getByRole("link", { name: "2 Saved · 1 Applied" })).toHaveAttribute(
         "href",
         "/dashboard/jobs/applications",
       );
     });

     it("shows no summary when nothing is in the pipeline", () => {
       setJourney({
         ...MID_JOURNEY,
         applications: [{ id: "a4", status: "rejected", applied_at: null }] as never,
       });
       renderIn("en", <HomePage />);
       expect(screen.queryByRole("link", { name: /Saved|Applied/ })).not.toBeInTheDocument();
     });
   ```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run tests/lib/journey.test.ts tests/app/home.test.tsx`
Expected, both FAIL:
- "doesn't count saving or preparing a job as applying", because any application counts today
- "summarises the pipeline", because no summary exists yet

- [ ] **Step 4: Count only applying**

In `frontend/lib/journey.ts`:

1. Add the import:

   ```ts
   import { hasApplied } from "@/lib/pipeline";
   ```

2. Replace the `application` step's `state:` line with:

   ```ts
         // Saving or preparing a job is not applying; any job applied for counts,
         // including one closed afterwards.
         state: stateOf(applications !== undefined, applications?.some(hasApplied) ?? false),
   ```

- [ ] **Step 5: Add the summary to Home**

In `frontend/app/dashboard/page.tsx`:

1. Add the imports:

   ```tsx
   import { forwardCounts, stageName } from "@/lib/pipeline";
   import type { JobApplication } from "@/types/api";
   ```

2. Pass the applications to the board. `<JourneyBoard journey={journey} onRetry={retry} retrying={retrying} />` becomes `<JourneyBoard journey={journey} applications={input.applications} onRetry={retry} retrying={retrying} />`.

3. In `JourneyBoard`'s props, add `applications,` to the destructuring and `applications: JobApplication[] | undefined;` to the type.

4. Inside `<CardContent>`, after the closing `</ul>`, add:

   ```tsx
                 {stage.id === "apply" && <PipelineSummary applications={applications} />}
   ```

5. Add this component after `JourneyBoard`:

   ```tsx
   /** Under Apply: how many jobs sit at each pipeline stage, linking to the board. */
   function PipelineSummary({ applications }: { applications: JobApplication[] | undefined }) {
     const { lang } = useLang();
     const counts = forwardCounts(applications ?? []);
     if (counts.length === 0) return null;
     const summary = counts
       .map(({ status, count }) =>
         t("home", "pipelineCount", lang)
           .replace("{n}", String(count))
           .replace("{stage}", stageName(status, lang)),
       )
       .join(" · ");
     return (
       <p className="mt-3 border-t pt-3 text-sm">
         <Link
           href="/dashboard/jobs/applications"
           className="rounded font-medium text-indigo underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
         >
           {summary}
         </Link>
       </p>
     );
   }
   ```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run tests/lib/journey.test.ts tests/app/home.test.tsx tests/lib/activity.test.ts`
Expected: all PASS.

- [ ] **Step 7: Run the frontend checks**

Run: `cd frontend && npm test && npm run lint && npm run type-check && npm run format:check`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/lib/journey.ts frontend/app/dashboard/page.tsx frontend/lib/i18n.ts frontend/tests/lib/journey.test.ts frontend/tests/app/home.test.tsx
git commit -m "feat(home): count applying, not saving, and summarise the pipeline"
```

---

### Task 9: Retire the guard's exemptions and the old strings, then verify

**Files:**
- Modify: `frontend/tests/design-guard.test.ts`
- Modify: `frontend/lib/i18n.ts` (the `jobs` section: delete unused keys)

**Interfaces:**
- Consumes: everything above.
- Produces: none.

- [ ] **Step 1: Delete the exemption machinery**

In `frontend/tests/design-guard.test.ts`:

1. Delete the `NOT_YET_MIGRATED` constant and the comment above it.
2. Delete the `STRINGS_NOT_YET_MIGRATED` constant and its comment.
3. Delete the `"%s still needs migrating"` test, the `"the string %s still needs its glyph removed"` test and the `"has migrated everything except the pages spec 3 rebuilds"` test.
4. Change `it.each(FILES.filter((file) => !(file in NOT_YET_MIGRATED)))(` to `it.each(FILES)(`.
5. Change `expect(glyphStrings().filter((key) => !(key in STRINGS_NOT_YET_MIGRATED))).toEqual([]);` to `expect(glyphStrings()).toEqual([]);`.
6. In the file's top doc comment, replace the sentence mentioning `NOT_YET_MIGRATED` with: `A permanent, reasoned exception is listed in ALLOWED; every other page must pass.`

Run `grep -n "NOT_YET_MIGRATED" frontend/tests/design-guard.test.ts`. Expected: no output.

- [ ] **Step 2: Delete the unused `jobs` strings**

Run this from the repo root to list `jobs` keys nothing references:

```bash
cd frontend && python3 - <<'PY'
import re, subprocess
src = open("lib/i18n.ts").read()
start = src.index("\n  jobs: {")
end = src.index("\n  interview: {")
keys = re.findall(r"^    ([a-zA-Z0-9]+): \{", src[start:end], re.M)
used = subprocess.run(["grep", "-rhoE", r'"jobs", "[a-zA-Z0-9]+"|"[a-zA-Z0-9]+"', "app", "components", "lib", "hooks"], capture_output=True, text=True).stdout
for key in keys:
    if f'"{key}"' not in used and f"'{key}'" not in used:
        print(key)
PY
```

`lib/pipeline.ts` refers to its keys as plain strings, so they count as used. Delete each printed key's entry from the `jobs` section. Expect the list to include:
- `colPlanning`, `colApplied`, `colInterviewing`, `colOffered`, `colRejected` and `colWithdrawn`
- `tracker`, `trackingLabel`, `addToTracker` and `addingToTracker`
- `appTitle` and `appSub`
- `translateLink` and `toGetStarted`
- `generateForThisJob`

If `npm test` then fails because a test still looks up a deleted key, that test is checking UI that no longer exists: delete or rewrite that assertion. Re-run the script: it must print nothing.

- [ ] **Step 3: Run every check**

Run:
- `cd frontend && npm test && npm run lint && npm run type-check && npm run format:check`
- `cd backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/mypy app`

Expected: all PASS.

- [ ] **Step 4: Browser pass (no AI quota)**

With the dev servers running, check at 375px and at desktop width:
1. **Save:** save a job from `/dashboard/jobs`. Its row shows Saved.
2. **Move:** on its page, move it Saved → Preparing → Applied → Interviewing → Offer → Accepted, then back one step.
   - Each stage's links point where the spec says.
   - The Interviewing link opens New interview with the role and company filled in. **Don't start the session.**
3. **Close and reopen:** mark a second job Not selected from Applied, and skip a third. In Pipeline → Archived, reopen both; they land on Applied and Saved.
4. **Phone layout:** at 375px the board's stages stack with no sideways scroll, and Archived opens and closes.
5. **Keyboard:** Tab to a card's move button and press Enter. Focus lands on that card's title in its new column. Esc out of a notes edit returns focus to the pencil.
6. **Language:** switch to 日本語. Stage names fit their column headings and badges. Switch back to English.
7. **Home:** the Apply column shows the pipeline summary, and the "application" step is done only once a job reached Applied.

Put the jobs back as they were (or Remove the ones created for the check), and reset the language cookie to `en`.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/design-guard.test.ts frontend/lib/i18n.ts
git commit -m "test(design): the guard covers every page, with the job pipeline done"
```
