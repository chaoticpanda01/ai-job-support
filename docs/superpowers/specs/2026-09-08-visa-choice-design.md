# Visa Choice — Assessed Options and Multiple Roadmaps — Design

## Context

The visa feature today generates exactly one roadmap. `POST /visa/consultations`
snapshots the profile, calls Gemini once, and the system prompt in
`app/services/ai/prompts/visa.py` instructs the model to *"Choose the single most
appropriate visa category"*. One `visa_type` string comes back with narrative
guidance and a phased checklist, all persisted on a single `visa_consultations`
row. The UI (`frontend/app/dashboard/visa/page.tsx`) renders that as
"Recommended visa category" → guidance → accordion checklist.

In reality a candidate is frequently eligible for several categories with real
trade-offs — 技術・人文知識・国際業務 versus 特定技能1号 versus 高度専門職 — and
choosing between them is the decision that actually matters. The current product
makes that choice on the user's behalf and hides the alternatives.

A second gap: checklist completion is React `useState`
(`page.tsx`, `ChecklistView`). Ticking steps and reloading loses everything.

## Goal

Turn the visa feature from "the AI decides, you read" into "the AI assesses, you
choose":

1. Assess the user's profile against every relevant visa category and return
   several options, each with an eligibility verdict and reasoning.
2. Let the user pick any assessed option and get a full roadmap for it.
3. Keep every roadmap generated, so switching back and forth is free.
4. Persist checklist progress per roadmap.

Everything stays AI-generated and personalised. There is no static, hand-written
visa catalogue to maintain.

## Non-Goals

- No static visa catalogue browsable independently of a profile assessment.
- No side-by-side diffing of two full checklists. The options grid is the
  comparison surface; by the time two checklists exist the "which visa" question
  is already answered.
- No automatic re-assessment when the profile changes, and no stale-roadmap
  notifications.
- No PDF export of a roadmap.

## Data Model

### `visa_consultations` (existing table, two new columns)

A consultation row now means: *the assessment we ran against your profile at time
X*. `profile_snapshot` keeps its existing role.

```
options            JSONB   NOT NULL DEFAULT '[]'
active_roadmap_id  UUID
```

The three legacy columns — `visa_type`, `checklist`, `ai_guidance` — are retained
and left NULL on new rows. Pre-existing rows keep their values and keep
rendering, which is what avoids a data migration. Going forward `visa_type` takes
a narrower meaning on new rows: the AI's *recommended* category, denormalised so
the list view needs no join.

`active_roadmap_id` deliberately carries **no** foreign key constraint. It points
into `visa_roadmaps`, which points back at `visa_consultations`; a circular FK
makes cascade-delete ordering fragile for no real benefit. The API layer
validates it instead — it is only ever set to the ID of a roadmap the endpoint
just fetched or created for that same consultation.

Each entry in `options` is one assessed category:

```json
{
  "visa_type": "技術・人文知識・国際業務 (Engineer/Specialist in Humanities)",
  "eligibility": "eligible",
  "summary": "…why this fits or does not, in Indonesian",
  "key_requirements": ["…"],
  "gaps": ["…"],
  "estimated_months": 6,
  "recommended": true
}
```

- `eligibility` is one of `eligible`, `eligible_with_gaps`, `not_eligible`.
- Exactly one option carries `recommended: true`. The existing single-recommendation
  behaviour is preserved as a default, not removed. When no category is currently
  `eligible`, the recommendation is the nearest achievable path — the option whose
  gaps are the most closable — never an empty recommendation.
- `gaps` is an empty list when `eligibility` is `eligible`.

Stored as JSONB rather than a table: options are an opaque AI-generated document,
written once at assessment time and never mutated.

### `visa_roadmaps` (new table)

```
id               UUID         PRIMARY KEY DEFAULT gen_random_uuid()
user_id          UUID         NOT NULL  -> users(id)                ON DELETE CASCADE
consultation_id  UUID         NOT NULL  -> visa_consultations(id)   ON DELETE CASCADE
visa_type        VARCHAR(100) NOT NULL
ai_guidance      TEXT
checklist        JSONB        NOT NULL
completed_steps  TEXT[]       NOT NULL DEFAULT '{}'
created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()

CONSTRAINT visa_roadmaps_consultation_visa_uk UNIQUE (consultation_id, visa_type)
```

Plus `CREATE INDEX idx_visa_roadmaps_consultation ON visa_roadmaps (consultation_id)`
and a `visa_roadmaps_updated_at` trigger calling `set_updated_at()`, matching every
other table in `database/schema.sql`.

Two decisions worth recording:

**`user_id` is denormalised onto the roadmap.** `BaseRepository.get_owned`
(`app/repositories/base.py`) enforces ownership by putting `user_id` directly in
the WHERE clause rather than fetch-then-check, and returns `None` for both "not
found" and "wrong owner" to prevent ID enumeration. A `visa_roadmaps` row without
`user_id` could not use that pattern, forcing a hand-rolled join plus an
ownership check — precisely where enumeration bugs come from.

**`UNIQUE (consultation_id, visa_type)`** is what makes "switching back is free"
enforceable in the database rather than by hoping the API checks first. It also
makes a double-clicked generate request safe: the loser of the insert race
returns the existing row instead of billing a second AI generation.

`completed_steps` is `TEXT[]` rather than JSONB because it is the one field that
mutates frequently, and an array column supports a cheap single-row `UPDATE`
instead of a read-modify-write of a multi-KB document.

### Migration `0008`

Follows the established idempotent style of
`backend/migrations/versions/0007_add_rirekisho_landscape_orientation.py`:
`DO $$ BEGIN … EXCEPTION WHEN duplicate_column THEN NULL; END $$;` for the two
new columns, and a `CREATE TABLE IF NOT EXISTS` for `visa_roadmaps` with its
index and trigger. `downgrade()` drops the table, then the two columns.

`database/schema.sql` gains the same table definition so a fresh bootstrap and a
migrated database agree.

## AI Layer

The single prompt module `app/services/ai/prompts/visa.py` is replaced by two
flat modules, following the existing one-module-per-concern layout of `prompts/`
(`job_match.py`, `job_translation.py`) rather than introducing a package.

### `prompts/visa_assessment.py`

Retains the visa-category knowledge block from the current system prompt (the
enumeration of 技人国, 特定技能1号/2号, 高度専門職, 経営・管理 and when each
applies), but inverts the instruction: evaluate the candidate against every
category and return each with a verdict, rather than choosing one.

Response schema, parsed via the existing `parse_response(text, Model)` contract:

```python
class VisaOption(BaseModel):
    visa_type: str
    eligibility: Literal["eligible", "eligible_with_gaps", "not_eligible"]
    summary: str
    key_requirements: list[str]
    gaps: list[str]
    estimated_months: int
    recommended: bool

class VisaAssessmentResult(BaseModel):
    options: list[VisaOption]   # 3-5 entries, exactly one recommended
```

No checklists, so the response is small: `max_tokens = 2048`.

### `prompts/visa_roadmap.py`

Takes the profile snapshot **and** the chosen `visa_type`, and generates the
phased checklist for that one category. This is the checklist half of today's
prompt, narrowed to a known visa type. The `VisaChecklistStep` / `VisaChecklistPhase`
/ `VisaChecklist` models move here verbatim from the deleted `visa.py`, wrapped in a
`VisaRoadmapResult` carrying `ai_guidance` and `checklist` (but no `visa_type` — the
caller already knows it). Keeps `max_tokens = 4096`.

Both modules keep the current Indonesian-output rules: `ai_guidance`, phase
names, step titles and details in Bahasa Indonesia; visa category names in their
Japanese official form with an Indonesian gloss.

`backend/tests/unit/test_visa_prompt.py` splits to follow the two modules.

### Budget

`usage_tracker.check_budget` is a whole-app rolling window; `feature` is accepted
for logging symmetry only (documented at `usage_tracker.py`). The two calls
record as `visa_assessment` and `visa_roadmap`, so a user who assesses and then
picks spends two of their window rather than one. This is the real cost of the
two-call split, and the reason a repeat pick of an already-generated roadmap must
not call the AI at all.

## API

| Method | Path | Behaviour |
|---|---|---|
| `POST` | `/visa/consultations` | Runs the assessment. Returns the consultation with `options` populated and no roadmap. `201`. |
| `POST` | `/visa/consultations/{id}/roadmaps` | Body `{visa_type}`. Generates the roadmap, or returns the existing one, and sets it active either way. `201` on create, `200` on reuse. |
| `GET` | `/visa/consultations/latest` | Consultation with `options`, `active_roadmap_id`, and its roadmaps embedded. |
| `GET` | `/visa/consultations/{id}` | Same shape as `latest`. |
| `GET` | `/visa/consultations` | Unchanged list of `VisaConsultationListItem`. |
| `PATCH` | `/visa/roadmaps/{id}/progress` | Body `{completed_steps: [...]}` — the full array, last-write-wins. Returns the updated roadmap. |

### The roadmap endpoint is generate-or-return, and doubles as the switch

There is no separate "set active roadmap" route. The client always states "I want
this visa"; whether that costs an AI call is the server's business. The endpoint:

1. Loads the consultation via `get_owned` — 404 if missing or not owned.
2. Validates `visa_type` against the consultation's own `options`.
3. Returns the existing roadmap if one exists for that pair, setting it active.
4. Otherwise checks budget, calls the AI, inserts the roadmap, sets it active.

### `visa_type` is validated against the consultation's `options`

A free-text `visa_type` from the client would flow directly into an AI prompt —
an injection surface — and would let a caller write arbitrary strings into the
table. Only a category this consultation actually assessed is accepted; anything
else is `422` and no AI call is made.

### Progress sends the whole array, not a per-step toggle

Toggles need server-side reconciliation when two tabs disagree. A full array is
idempotent and matches how the UI already holds state (a `Set<string>` in
`ChecklistView`). Server-side, incoming step IDs are filtered against the step IDs
actually present in that roadmap's `checklist`, so the column cannot be used as
arbitrary storage.

### Response schemas

`VisaRoadmapResponse` — `id`, `visa_type`, `ai_guidance`, `checklist`,
`completed_steps`, `created_at`, `updated_at`.

`VisaConsultationResponse` gains `options: list[VisaOption]`,
`active_roadmap_id: UUID | None`, and `roadmaps: list[VisaRoadmapResponse]`. The
legacy `visa_type` / `checklist` / `ai_guidance` fields stay on the response so
consultations created before this change still render.

### Repository

`VisaConsultationRepository` gains nothing beyond the two new columns. A new
`VisaRoadmapRepository(BaseRepository[VisaRoadmap])` provides
`get_for_consultation_and_type(consultation_id, visa_type)`,
`list_for_consultation(consultation_id)`, and `set_completed_steps(roadmap, steps)`.
The now-unused `VisaConsultationRepository.update_checklist` is removed.

## Frontend

### Three page states

`frontend/app/dashboard/visa/page.tsx` becomes a thin orchestrator over three
states:

1. **No consultation** — empty state; the primary button reads "Assess my visa
   options" rather than "Generate new roadmap".
2. **Options** — the assessed categories as cards: visa name, eligibility badge
   (`eligible` green, `eligible_with_gaps` amber, `not_eligible` grey), the
   Indonesian summary, key requirements, gaps, and estimated timeline. The
   recommended option is lifted to the top, so the previous behaviour remains the
   path of least resistance. A card whose roadmap already exists offers "View
   roadmap"; one that does not offers "Build roadmap" and notes that it costs a
   generation.
3. **Roadmap** — guidance plus the phase accordion, essentially today's view, with
   a switcher strip listing already-built roadmaps and a way back to options.

### Component extraction

`page.tsx` is already ~330 lines holding six components; options plus a switcher
would push it past 500. `frontend/components/visa/` exists and is empty, matching
the `culture/`, `documents/`, `interview/` convention. Moving there:

- `visa-options-list.tsx`, `visa-option-card.tsx`
- `visa-roadmap-view.tsx`, `visa-checklist.tsx` (phase accordion + step row,
  lifted from `page.tsx`)
- `visa-roadmap-switcher.tsx`
- `visa-past-consultations.tsx`

### Hooks

In `frontend/hooks/useVisa.ts`: `useGenerateVisa` becomes `useAssessVisa`; new
`useSelectRoadmap` (POST roadmaps) and `useUpdateProgress`.

Progress is optimistic: the checkbox flips immediately, a debounced PATCH follows
roughly 600ms later, and a failure reverts the box with an inline message. Nobody
should watch a spinner to tick a checkbox.

### i18n

Every new string is added to all three locales in the `visa` block of
`frontend/lib/i18n.ts` (en / id / ja): the three eligibility verdicts, the new
empty-state and options copy, switcher labels, and the generation-cost note.
`recommendedVisa` is retained — "recommended" remains a real concept.

## Error Handling

The two-call split improves failure behaviour: if roadmap generation returns 502,
the assessment survives, so the user retries a single pick rather than
regenerating everything.

- Missing profile → `422`, existing copy ("Complete your profile before
  generating visa guidance.").
- `AIBudgetError` on either call → the existing quota response and UI treatment.
- AI unavailable or unparseable JSON → `502`, retryable, consultation untouched.
- `visa_type` not in the consultation's `options` → `422`. This is a client bug
  rather than a user-facing state, so the UI shows a generic failure message.
- Unknown or unowned consultation / roadmap ID → `404` via `get_owned`.

## Testing

Backend is pytest, extending `backend/tests/unit/test_visa_routes.py` and
splitting `test_visa_prompt.py`. The cases that matter:

- Assessment persists `options` with exactly one `recommended` entry.
- A `visa_type` outside the consultation's `options` is rejected `422` **without**
  an AI call.
- A repeat POST for an already-generated visa returns the stored roadmap, makes
  no AI call, and sets `active_roadmap_id`.
- Progress filters out step IDs not present in that roadmap's checklist.
- Another user's consultation or roadmap ID returns `404`.
- Both prompt modules parse a representative model response into their schema,
  and reject a malformed one.

The frontend has no test infrastructure. The UI is verified in the browser
preview against the running dev server, driven directly rather than handed over
as a manual checklist.
