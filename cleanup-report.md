# Visa-choice branch: deferred Minor findings cleanup

Follow-up polish pass on the already-merged, in-production visa-choice
feature (`worktree-visa-review-cleanup` branch), fixing the 8 "Minor"
findings deferred from the final whole-branch code review. No behavior
change to shipped functionality — tests, OpenAPI metadata, dead code,
i18n, a11y, and UI polish only.

## Backend

### 1. Missing test assertions — `backend/tests/unit/test_visa_routes.py`

- `test_create_roadmap_generates_for_an_assessed_visa` (originally
  around line 505): the inline `VisaConsultationRepository.update` mock
  was pulled out to a named `update_mock = AsyncMock(return_value=consultation)`
  variable and patched with it, and a new assertion was added:
  `assert update_mock.await_args.kwargs["active_roadmap_id"] == roadmap.id`
  (line ~546 after the edit). Confirms the newly generated roadmap is
  actually made active, not just returned.
- `test_create_roadmap_budget_exceeded_returns_429` (originally around
  line 686): added `generate_mock = AsyncMock()`, patched
  `app.services.ai.client.ai_client.generate` with it, and asserted
  `generate_mock.await_count == 0` after the 429 assertion. Confirms a
  budget rejection never reaches the AI call.
- `test_create_roadmap_on_someone_elses_consultation_returns_404`
  (originally around line 664): this test previously didn't patch
  `generate` at all. Added the same `generate_mock` patch alongside the
  existing `get_owned` patch and asserted `generate_mock.await_count == 0`
  after the 404 assertion. Confirms an ownership-check 404 never reaches
  the AI call either.

Verified: `.venv/bin/python3 -m pytest tests/unit/test_visa_routes.py -v --no-cov`
→ 23 passed (same count as before, no regressions).

### 2. OpenAPI 200-reuse response — `backend/app/api/v1/visa.py`

`create_roadmap`'s `@router.post(...)` decorator (around line 192) gained
a `responses={200: {"model": VisaRoadmapResponse, "description": "Existing
roadmap returned; no AI call was made."}}` kwarg, alongside the existing
`response_model=VisaRoadmapResponse` / `status_code=status.HTTP_201_CREATED`.
The route already sets `response.status_code = status.HTTP_200_OK` at
runtime when reusing an existing roadmap (line ~243/310 area); this just
makes that alternate response documented in the OpenAPI schema.

### 3. Unused repository method — `backend/app/repositories/visa.py`

Deleted `VisaRoadmapRepository.list_for_consultation` (was at the end of
the file, ~line 59-64). Confirmed zero callers via
`grep -rn "list_for_consultation" backend/app` (only the definition
itself matched) before removing. Nothing else in the class was touched.

Verified: `.venv/bin/python3 -m pytest tests/unit/ -q --no-cov` → 389 passed,
no failures from the removal.

## Frontend

### 4. Dead i18n keys — `frontend/lib/i18n.ts`

Removed 5 keys and their full `{en, id, ja}` objects from inside the
`visa:` block (were at lines ~782-802): `generateBtn`, `generating`
(the one inside `visa:` specifically — the unrelated top-level
`generating` key elsewhere in the file, used by other features, was left
untouched), `noRoadmap`, `noRoadmapSub`, `generateFail`. `recommendedVisa`
and everything else in the block was left in place.

Verified: `npx tsc --noEmit` → no errors (confirms no live
`t("visa", "<removedKey>", lang)` call sites existed).

### 5. Roadmap switcher: stable order, pending feedback, a11y —
`frontend/components/visa/visa-roadmap-switcher.tsx`

- **Stable order**: added a local
  `[...roadmaps].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())`
  before rendering tabs, so they stay in creation order regardless of
  which one was most recently selected. `useVisa.ts`'s `useSelectRoadmap`
  cache update (which appends the switched-to roadmap to the end of the
  array) was read to confirm this was the actual cause, but was left
  unchanged per the instructions — the fix lives entirely in the
  component.
- **Pending feedback**: added an optional `switchingVisaType?: string | null`
  prop. The tab whose `visa_type` matches it is disabled and shows a
  small inline spinner (`h-2 w-2 animate-spin rounded-full border
  border-current border-t-transparent`, matching the compact spinner
  convention already used in `app/dashboard/documents/page.tsx`) before
  its label. Wired from `frontend/app/dashboard/visa/page.tsx`'s
  `<VisaRoadmapSwitcher>` call with
  `switchingVisaType={selectRoadmap.isPending ? (selectRoadmap.variables ?? null) : null}`,
  mirroring the existing `buildingVisaType` prop passed to
  `<VisaOptionsList>` a few lines below it.
- **Accessibility**: added `aria-current={roadmap.id === activeId ? "true" : undefined}`
  to each tab button.

### 6. Option card button accessible name —
`frontend/components/visa/visa-option-card.tsx`

Extracted the button's existing text-resolution ternary into a
`buttonText` local variable (right after the `useLang()` call), and added
`aria-label={`${buttonText} — ${option.visa_type}`}` to the button (was
around line 95-105). The button body now just renders `{buttonText}`.

### 7. Options list: unstable React key —
`frontend/components/visa/visa-options-list.tsx`

Changed `.map((option) => ...)` to `.map((option, index) => ...)` and the
key from `key={option.visa_type}` to `key={`${option.visa_type}-${index}`}`
(was line ~31).

### 8. Header button label flash — `frontend/app/dashboard/visa/page.tsx`

The idle-state ternary (`latest ? reassessBtn : assessBtn`, around line
58-63) now has an added `isLoading` branch inserted before it, rendering
a neutral `<span className="block h-4 w-24 animate-pulse rounded
bg-primary-foreground/30" />` placeholder while the initial fetch is in
flight, instead of guessing "Assess" and then flipping to "Re-assess".
The button's `disabled` prop was also extended to
`assess.isPending || isLoading` so it can't be clicked during that
placeholder state. The existing `assess.isPending` spinner branch (for
after the button is clicked) was left untouched — this only affects the
window before that ever fires.

## Verification (run together, from each package root)

### Backend (`backend/`)

```
.venv/bin/python3 -m pytest
```
→ `389 passed`, `3 failed` — all 3 failures are
`tests/integration/test_rirekisho_generation_e2e.py::test_generate_rirekisho_end_to_end[...]`,
failing with `AIBudgetError` / "The demo has reached today's shared AI
limit (16 requests per 24 hours across all users)" — the known,
pre-existing local-environment characteristic called out in the task,
unrelated to this change. All of `tests/unit/` passed.

```
.venv/bin/python3 -m ruff check .
```
→ `All checks passed!`

```
.venv/bin/python3 -m ruff format --check .
```
→ `126 files already formatted` (one reformat was needed and applied to
`app/repositories/visa.py` after the method deletion left a stray
trailing blank line; re-run confirmed clean).

### Frontend (`frontend/`)

```
npx tsc --noEmit
```
→ no output (no type errors).

```
npm run lint
```
→ `✔ No ESLint warnings or errors`

```
npm run format:check
```
→ `All matched files use Prettier code style!`
