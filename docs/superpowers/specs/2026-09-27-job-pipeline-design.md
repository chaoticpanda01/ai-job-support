# Job pipeline (spec 3)

**Date:** 2026-09-27
**Status:** Approved in brainstorming; awaiting spec review
**Builds on:**
- [2026-09-26-design-foundation-shell-home-design.md](2026-09-26-design-foundation-shell-home-design.md),
  whose roadmap confirmed the pipeline's flow and named this spec.
- [2026-09-27-page-migration-design.md](2026-09-27-page-migration-design.md),
  which moved every other page onto the design system and left these three
  pages to this spec.

## Goal

Turn the job tracker into one flow that each saved job travels, with each
stage pointing to the tool that helps with it.

Today:
- **Tracker:** the application tracker is a six-column kanban
  (`/dashboard/jobs/applications`) with "→ status" buttons.
- **No rules:** the backend accepts any status change, so a job can go from
  Offered straight back to Planning.
- **No help:** nothing tells the user what to do at each stage. Tailored
  documents, interview practice and the visa page are not linked from the
  tracker.
- **Not on the design system:** the Jobs list, Job detail and tracker pages
  are the last ones off it. `tests/design-guard.test.ts` still exempts them
  (`NOT_YET_MIGRATED`), plus one string (`jobs.jobBoard`).

## Decisions made in brainstorming

| Question | Decision |
|---|---|
| Stage help | Link to existing tools, pre-filled from the job. No new AI features. |
| Stored statuses | Keep today's values and add `skipped`, `preparing`, `accepted`. The UI maps values to stages. |
| Reopen | Returns to the stage the job left, stored in a new `closed_from` column. |
| Pages | Keep three pages: Jobs (found), Job detail (with a stage panel), Pipeline board. |

## The flow

From the foundation spec's roadmap:

1. Found → **Saved** (match score)
   - Apply or skip? Skip → **Skipped** (can be reopened).
2. **Preparing**: tailored 履歴書 / 職務経歴書 for the job, plus gap tips.
3. **Applied**
   - Called back? No → **Closed**.
4. **Interviewing**: practice pre-filled with the role and company.
   - Offer? No → **Closed**.
5. **Offer**: a visa check.
   - Accept? Yes → **Accepted**. Decline → **Closed**.

Withdraw is available at every stage. Closed and Skipped jobs can be reopened.

## 1. Data model and backend

### Statuses

`application_status` gains three values. None are renamed.

| Stored | Shown as | Kind |
|---|---|---|
| `planning` | Saved | forward |
| `preparing` (new) | Preparing | forward |
| `applied` | Applied | forward |
| `interviewing` | Interviewing | forward |
| `offered` | Offer | forward |
| `accepted` (new) | Accepted | end |
| `rejected` | Closed, reason "Not selected" | archived |
| `withdrawn` | Closed, reason "Withdrew" (declining an offer counts as withdrawing) | archived |
| `skipped` (new) | Skipped | archived |

"Forward" stages are the six board columns, in the order above, ending with
Accepted. "Archived" statuses are listed under the board, not in a column.

### `closed_from`

A new nullable column, `job_applications.closed_from application_status`.

- It is set to the current status when a job moves to `rejected`, `withdrawn`
  or `skipped`.
- It is cleared when the job is reopened.
- **Reopen target:** `closed_from`. Rows archived before this change have no
  `closed_from`, so they fall back to `applied` if `applied_at` is set, and
  to `planning` otherwise.

### Transitions

The backend enforces these moves. Any other move is a 422 with the detail
`Can't move an application from '<from>' to '<to>'.`

| From | Allowed moves |
|---|---|
| `planning` | `preparing`, `applied`, `skipped` |
| `preparing` | `applied`, `withdrawn`, back to `planning` |
| `applied` | `interviewing`, `rejected`, `withdrawn`, back to `preparing` |
| `interviewing` | `offered`, `rejected`, `withdrawn`, back to `applied` |
| `offered` | `accepted`, `withdrawn`, back to `interviewing` |
| `accepted` | `withdrawn`, back to `offered` |
| `rejected`, `withdrawn`, `skipped` | the reopen target only |

- **Skipping Preparing:** Saved can go straight to Applied. Some users apply
  without tailored documents.
- **Back moves:** each forward stage can go back one step, to correct a
  mis-click. `planning` has no back move.
- **Same status:** a PATCH with the current status is a no-op, not a 422, so a
  double-submitted click is harmless.
- **Where it lives:** the table is a single constant in `backend/app/models/enums.py`
  (`APPLICATION_TRANSITIONS: dict[ApplicationStatus, frozenset[ApplicationStatus]]`),
  next to the enum. A function `allowed_moves(app) -> frozenset[ApplicationStatus]`
  resolves the reopen target for archived rows.

### API

No new endpoints. Changes to the existing ones in `backend/app/api/v1/jobs.py`
and `backend/app/schemas/job.py`:

- `UpdateApplicationRequest.status` becomes `ApplicationStatus | None` instead of
  `str | None`. Pydantic then rejects unknown values with a 422, so the manual
  `ApplicationStatus(body.status)` parse goes.
- `PATCH /jobs/applications/{id}`:
  - checks the move against `allowed_moves`
  - sets or clears `closed_from`
  - keeps setting `applied_at` the first time a job reaches `applied`
- `JobApplicationResponse` gains `closed_from: str | None`.
- `POST /jobs/applications` still creates at `planning` ("Saved") and still
  returns the existing application if there is one.
- The `?status=` filter on `GET` accepts the new values, because it parses
  through the enum.
- **Transitions for the frontend:** the table is also written to
  `backend/tests/fixtures/application_transitions.json`. A backend test checks
  that the JSON matches `APPLICATION_TRANSITIONS`, and a frontend test checks
  it matches `lib/pipeline.ts`, which pins the two copies together.

### Migration

New revision `0011_application_pipeline.py`, in the same idempotent style as
0009 and 0010:

- `ALTER TYPE application_status ADD VALUE IF NOT EXISTS` for `preparing`,
  `accepted` and `skipped`. Each value is added `BEFORE`/`AFTER` so the
  enum's order matches the stage order: `planning, preparing, applied,
  interviewing, offered, accepted, rejected, withdrawn, skipped`.
- `ADD COLUMN closed_from application_status`, guarded by `duplicate_column`.
- **Downgrade:** drops the column, and maps rows with a new value back:
  - `preparing` → `planning`
  - `accepted` → `offered`
  - `skipped` → `withdrawn`

  Postgres can't drop enum values, so the three values stay in the type. The
  migration's docstring says so.
- `database/schema.sql` gets the same enum values and column.
- The model's docstring (`JobApplication`) is updated to describe the new
  transitions.

## 2. Shared frontend pieces

### `lib/pipeline.ts`

Plain logic, with no React and no fetching, like `lib/journey.ts`.

- `ApplicationStatus` in `types/api.ts` gains the three values, and
  `JobApplication` gains `closed_from: ApplicationStatus | null`.
- `FORWARD_STAGES`: the six forward statuses, in order.
- `ARCHIVED`: `rejected`, `withdrawn`, `skipped`.
- `TRANSITIONS`: mirrors the backend table.
- `movesFor(app)`: the allowed moves for one application. It resolves the
  reopen target.
- `reopenTarget(app)`: `closed_from`, or the fallback described in section 1.
- `STAGE_LABEL` and `STAGE_TONE` for each status:
  - `planning` and `preparing`: neutral
  - `applied` and `interviewing`: info
  - `offered`: warning
  - `accepted`: success
  - `rejected`: danger
  - `withdrawn` and `skipped`: neutral
- `stageAction(status, job)` returns the stage's next-action line and links:

| Stage | Next action | Links |
|---|---|---|
| Saved | "Check how well you match, then start preparing." | the match section on the job page (`#match`) |
| Preparing | "Tailor your documents to this job." | `/dashboard/documents/rirekisho/new?job=ID`, `/dashboard/documents/shokumu/new?job=ID`, the match gaps (`#match`) |
| Applied | "Wait to hear back, then record the answer." | none: the move buttons are the action |
| Interviewing | "Practise for this interview." | `/dashboard/interview/new?role=…&company=…` |
| Offer | "Check your visa options before you accept." | `/dashboard/visa` |
| Accepted | "Get ready for the move." | `/dashboard/visa`, `/dashboard/culture` |

`role` is the job's translated title (or original title), and `company` is
`structured_data.company_name`. Each is left out when missing, and each is
URL-encoded.

### Interview prefill

`app/dashboard/interview/new/page.tsx` reads `role` and `company` from the URL
(`useSearchParams`) as the initial values of its target-role and
target-company fields.
- **Suspense:** the page's content is wrapped in the `Suspense` boundary that
  `useSearchParams` needs, as the 履歴書 page does.
- **Editable:** the prefill is only a starting value; the user can still
  change or clear both fields.

### Documents for this job

The Preparing stage marks each tailored document the user already has for
this job:
- **Match:** a completed document whose `job_context.job_posting_id` is this
  job. `Document.job_context` is already typed `Record<string, unknown> | null`,
  so the check reads the key and tests that it is a string equal to the job's
  id. No type change.
- **Data:** the list comes from `useDocuments()`, so there is no backend change.

### `components/jobs/stage-badge.tsx`

`StageBadge({ status })`: a `Badge` with the stage's label and tone. For
`rejected` and `withdrawn` the label is "Closed · Not selected" or
"Closed · Withdrew".

### `components/jobs/stage-panel.tsx`

`StagePanel({ job, application })` is a `Card` on the Job detail page. Its
contents depend on the application:

- **No application:**
  - the line "Save this job to track it through your applications."
  - a **Save to pipeline** button, which calls `useCreateApplication`
- **Forward stage:**
  - **Stepper:** a compact stepper over the six forward stages. The current
    one is marked with `aria-current="step"`, and the others are plain text.
  - **Next action:** the stage's line, and its links as `Button asChild`
    links. For Preparing, a document already made for this job shows a check
    icon and "Made".
  - **Move buttons:**
    - the main forward move as the primary `Button`, e.g. "Mark as applied"
    - other moves (Not selected, Skip, Withdraw, Decline offer) as secondary
      buttons
    - the back move as a ghost "Back to Applied"
- **Archived:**
  - the `StageBadge`
  - "Moved here on <date>." using `updated_at`
  - a **Reopen** button, labelled with the target stage ("Reopen at
    Interviewing")

**Confirmation:** Skip, Withdraw and Decline ask first, through `useConfirm`.
Forward and back moves don't.

**Pending and errors:**
- **While a move is pending:** its button shows `loading`, and the other move
  buttons are disabled.
- **On failure:** an `Alert` in the panel shows `apiErrorMessage(error)`, and
  the stage doesn't change.

## 3. Pages

### Jobs list (`/dashboard/jobs`)

- **Header:** a `PageHeader` whose actions are "Pipeline" (secondary, to
  `/dashboard/jobs/applications`) and "Translate a posting" (primary).
- **Filters:**
  - search uses `Input` with a visible or sr-only label, and the minimum score
    uses `Select`
  - Search and Clear are `Button`s
  - the "Score ≥ 60" options become `t()` strings with no `≥` glyph ("60+")
- **Job cards:** each job is a `Card` row:
  - the title links to the job
  - company, location and employment type
  - the summary, clamped to two lines
  - `Badge`s for the Japanese level, visa sponsorship and salary
  - the friendliness score with `toneText[scoreTone(score, JOB_SCORE_BANDS)]`,
    where `JOB_SCORE_BANDS = { good: 70, fair: 50 }` is added to `lib/tones.ts`
- **Stage or Save:** the card's right side shows the job's `StageBadge` if it
  is tracked. Otherwise it shows a **Save** button that creates the
  application; while pending it shows `loading`, and afterwards the badge.
  - **Stage source:** `useApplications()`, matched by `job_posting_id`.
  - **Applications unavailable:** while applications are loading or failed,
    neither the badge nor Save shows, and the list still renders.
- **Delete:** only on jobs with `is_mine`, as a ghost icon button (lucide
  `Trash2`) with an accessible name. Confirmation and toasts are unchanged.
- **States:**
  - loading: `Skeleton` rows
  - failure: `Alert` with `RetryButton`
  - no jobs: `EmptyState` with a "Translate a posting" action
- **Phones:** below `sm` the rows stack, like the list rows in spec 2.

### Job detail (`/dashboard/jobs/[id]`)

The two-column layout stays.

- **Left:**
  - `PageHeader` with the title, keeping its `lang` rule
  - company and location as the description
  - the source URL
  - the details `Card` (`dl`)
  - the translated description `Card`
- **Right:**
  - `StagePanel` first
  - then the friendliness score `Card`
  - then the match section (`id="match"`, the target of the stage links)
  - then the job ID card, now with only the ID and Copy, because the
    document links move into `StagePanel`
- **Removed:** the "Add to tracker" button, the "Tracking: X" label and the
  two document links in the job ID card.
- **Bullets:** the dots use the tone fills, not `bg-primary`.
- **Not found:** an `Alert` under the breadcrumbs, as on other detail pages.

### Pipeline (`/dashboard/jobs/applications`)

- **Header:** title "Pipeline", and the action "Find jobs" to `/dashboard/jobs`.
- **lg and up:** a six-column grid, one column per forward stage. Each column
  has a heading with the stage name and a count.
- **Below lg:** each stage is a section with an `h2` and a count, stacked
  vertically. An empty stage shows its heading and "Nothing here yet" on one
  line. There is no horizontal scrolling.
- **Card:**
  - the title (link to the job)
  - the company
  - the applied date, for `applied` and later
  - notes clamped to one line
  - the main forward move as a small `Button`, none for `accepted`
  - icon buttons (lucide `Pencil`, `Trash2`) to edit notes and remove, each
    with an accessible name that includes the job title
  - other moves are on the job's `StagePanel`
- **Notes:** edited inline with `Textarea` plus Save and Cancel buttons. Esc
  cancels, and after saving or cancelling, focus returns to the Pencil button.
- **Archived:**
  - **Disclosure:** a `Button` with `aria-expanded` and a count ("Archived
    (4)"), closed by default.
  - **List:** Closed and Skipped jobs, each with the title, `StageBadge`,
    date and **Reopen**.
- **Moves are optimistic:**
  - the card changes stage in the query cache at once
  - a failed move restores it and shows an error toast
  - after a move, focus goes to the moved card's title link in its new place
    (by `id`)
- **States:**
  - loading: `Skeleton`
  - failure: `Alert` with `RetryButton`
  - no applications: `EmptyState` whose action is "Find jobs"

### Home

- **Journey:** in `lib/journey.ts`, the `application` step is done only when
  some application has `applied_at` set, or has a status of `applied` or
  later: `interviewing`, `offered`, `accepted`, or `rejected`/`withdrawn`
  with `applied_at`. Saving a job is not applying.
- **Summary:** under the Apply column's steps, a one-line pipeline summary
  counts the forward stages that have jobs, e.g. "3 saved · 1 applied · 1
  interviewing". It links to Pipeline and is hidden when there are no
  forward-stage applications. The `·` separator is a text character, not
  an icon glyph.

## 4. Guard and text

- `tests/design-guard.test.ts`:
  - `NOT_YET_MIGRATED` and `STRINGS_NOT_YET_MIGRATED` end up empty, and are
    deleted along with the code that reads them.
  - The guard's doc comment is updated to match: every page is checked, and
    only `ALLOWED` holds exceptions.
- `lib/i18n.ts`, in en, ja and id:
  - **Added:** stage names, closed reasons, the next-action lines, the move
    labels, "Save to pipeline", "Reopen at {stage}", "Archived ({n})", the
    Home summary, and `pipelineTitle`/`pipelineSub`.
  - **Deleted:** `colPlanning`…`colWithdrawn`, `tracker`, `trackingLabel`,
    `addToTracker`, `addingToTracker`, `jobBoard`, `appTitle` and `appSub`
    (replaced by `pipelineTitle`/`pipelineSub`), and any other key left
    unused. `tests/invariants.test.ts` or a grep in the plan confirms none is
    still referenced.
  - **Kept:** `generateRirekishoForJob` and `generateShokumuForJob`, which
    `StagePanel` uses for its Preparing links.
  - **No glyphs:** new strings contain no arrow or emoji glyphs.
- **Sidebar:** the label stays "Jobs".

## Testing

**Backend** (`backend/tests`):
- **Unit, the transition table:**
  - every allowed move passes
  - a sample of disallowed moves fails
  - archived rows reopen to `closed_from`, or to the fallback when there is
    none
  - the table matches `fixtures/application_transitions.json`
- **Routes** (`test_job_routes.py`, mocked session):
  - an invalid move is a 422 with the detail
  - a same-status PATCH is a no-op
  - moving to `rejected` sets `closed_from`
  - reopening clears it
  - `applied_at` is set once
  - an unknown status is a 422 from the schema
- **Integration** (real Postgres, like `test_job_posting_visibility.py`):
  - after the migration, rows can be written with each new value and with
    `closed_from`
  - the enum's order is the stage order

**Frontend** (`frontend/tests`):
- **`lib/pipeline`:**
  - `movesFor`, `reopenTarget` and its fallback
  - `stageAction` links, including URL-encoding and leaving out missing role
    or company
  - the table matches the backend's JSON fixture
- **`StagePanel`:**
  - Save when there is no application
  - the move buttons for each stage
  - Skip, Withdraw and Decline confirmation
  - a pending move and an error
  - Reopen labelled with its target
  - the Preparing check for an existing document
- **Jobs list:**
  - Save becomes a badge
  - delete only on `is_mine`
  - `EmptyState`, `Alert` with retry
  - the page still renders when applications fail
- **Job detail:** `StagePanel` is present, and the old tracker block and
  document links are gone.
- **Pipeline:**
  - the forward columns and counts
  - the Archived disclosure and Reopen
  - notes editing and focus return
  - an optimistic move and its rollback
  - focus after a move
- **Interview new:** the `role` and `company` prefill.
- **Journey:** a saved-only application doesn't complete the `application`
  step, but a job at Applied does, and so does one closed after applying.
- **Home:** the pipeline summary and its hiding.
- **Design guard:** every page passes with the exemptions gone.

Each new test is mutation-checked, as in spec 2: undo the change and the
test fails.

**Manual, in the browser**, at 375px and desktop, spending no AI quota:
- save a job from the list
- move it through every stage on the Job detail page
- skip one job and close another, then reopen both
- the stacked Pipeline on a phone and the Archived disclosure
- keyboard focus after a move and after editing notes
- switch to 日本語 and check the stage names fit the columns

## Out of scope

- A visa check for a specific job, and any new AI feature.
- Drag and drop on the board.
- Due dates, reminders and status history (only `closed_from` is stored).
- Renaming stored status values.
- Changing the sidebar or the Jobs URLs.
