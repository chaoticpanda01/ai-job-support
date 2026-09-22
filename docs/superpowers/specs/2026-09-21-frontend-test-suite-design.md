# Frontend Test Suite — Design

## Context

The backend has 34 test files and 482 tests with a 70% coverage floor. The frontend has none: no test script, no runner, no testing libraries. CI runs type-check, lint, format-check and build for it, all of which prove the code compiles and is formatted — none of which prove it behaves.

This gap became concrete over the last several changes. Four throwaway harnesses were written to verify i18n and error-handling work — 401 assertions across document-failure states, culture-page load failures, the HTTP status→message table, and the chat widget — and each was deleted after use. Two separate code reviews flagged the same thing: checks written and thrown away are the argument for a runner, not against one. Three of those harnesses also produced false failures from stale regexes matching reformatted source, which is what hand-rolled structural assertions do as code moves.

The harnesses covered real behaviour that unit-level assertions can reach: which branch a page renders for a given query state, which translated message a status maps to, whether a polling hook stops polling. That content is worth keeping. This spec converts it into a permanent suite and establishes how frontend tests are written in this repo.

## Scope

**In scope:** a vitest suite that ports the four existing harnesses, plus the tooling, configuration and CI step to run it.

**Explicitly out of scope:**

- ~~Tests for code the harnesses did not cover — `useResumes`' analysis polling, the interview session page, the settings page (900 lines), the jobs detail page (500 lines). Writing tests for code nobody is currently changing is a separate decision.~~ **Superseded 2026-09-22** — all of these are now covered; see Status below. The reasoning stands for what it was: this exclusion is what let the first pass land without stalling on four large pages.
- A coverage threshold. A floor would force the above before the suite could go green.
- Browser-level E2E (Playwright). No flow here needs a real browser, and Clerk sign-in is blocked in the preview browser this project uses.
- Backend-side contract tests. The frontend suite asserts the shared enums match (see Invariants); moving those assertions into pytest is a later option, not this pass.
- Testing react-query, Radix, or react-dropzone. Their behaviour is theirs; this suite tests the policies built on top of them.

## Status

Written 2026-09-21 for the first pass, which landed 107 tests. Updated
2026-09-22: the four exclusions above have since been covered, in seven
commits from `eef1f88` to `e05d23c`.

| Added                                                               | Tests |
| ------------------------------------------------------------------- | ----- |
| `useResumes`' analysis polling (12) and the resume detail page (37) | 49    |
| The interview session page, including a Japanese session            | 50    |
| The settings page and its backend contract                          | 37    |
| The jobs detail page                                                | 47    |
| The onboarding wizard                                               | 28    |
| New invariants (`AnalysisErrorCode`, the rirekisho rules)           | 6     |

107 + 217 = 324 tests across 15 files. Still no coverage floor, still no Playwright,
still nothing testing react-query or Radix themselves — those exclusions
were not about sequencing and remain deliberate.

Three production bugs were found by writing these tests rather than by
using the app, all in error paths: unhandled promise rejections on a
failed save or delete, a `signOut` failure after a successful account
deletion that left the reader on a settings page for an account that no
longer existed, and a stale "Saved" indicator beside a failed retry.

## Architecture

### Dependencies

Five devDependencies: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`.

**Every one must support the Node version this project targets.** `package.json` declares `engines.node >=20.9.0`, CI runs Node 20 and the Docker images are `node:20-alpine`. npm does not enforce a dependency's `engines` — it only warns — so an incompatible one installs fine and then fails at runtime inside jsdom with `webidl.util.markAsUncloneable is not a function`. The first attempt at this suite took the latest of everything and broke CI exactly that way: vitest 5, jsdom 30 and jest-dom 7 all require Node 22+. The working set is vitest 4, `@vitejs/plugin-react` 4, jsdom 26, jest-dom 6 and `@testing-library/react` 16. Check `engines.node` before bumping any of them.

`@testing-library/user-event` is deliberately excluded. The only interaction any ported test needs is a single click, and `fireEvent` ships inside `@testing-library/react`.

`@testing-library/react` 16.x supports React 19, which this project uses.

### Configuration

`frontend/vitest.config.ts`:

- `@vitejs/plugin-react` for JSX.
- `environment: "jsdom"` for the whole suite. A split node/jsdom workspace would run the non-DOM tests marginally faster; at this size the difference is milliseconds and costs a second config.
- `setupFiles: ["tests/setup.ts"]`, which imports the jest-dom matchers.
- An `@/` alias resolving to the frontend root, mirroring `tsconfig.json`'s paths, so tests import exactly as source does.

`frontend/package.json` gains `"test": "vitest run"` and `"test:watch": "vitest"`. `npm test` is the frontend's `pytest`.

`frontend/tsconfig.json` needs no change: its `include` is already `["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]`, which covers `tests/` and `vitest.config.ts` alike. The consequence is that CI's `npm run type-check` will type-check the tests, so they have to be as well-typed as source. Vitest's globals are **not** enabled: each file imports `{ describe, it, expect, vi }` from `vitest` explicitly, which avoids adding a `types` entry to tsconfig and leaves the existing configuration untouched entirely.

Test files must also pass `npm run lint` and `npm run format:check` like any other source file.

### Layout

`frontend/tests/`, mirroring the source tree, matching the backend's separate `tests/` tree rather than colocating `*.test.tsx` beside source. Colocation is the Vite default, but in an App Router project it means dropping test files inside route directories, where directory contents are semantically meaningful.

```
tests/setup.ts
tests/helpers.tsx
tests/lib/api-error.test.ts
tests/lib/file-rejection.test.ts
tests/lib/i18n.test.ts
tests/hooks/useDocuments.test.ts
tests/hooks/useInterview.test.ts
tests/hooks/useResumes.test.ts
tests/components/chat-widget.test.tsx
tests/app/culture.test.tsx
tests/app/documents-detail.test.tsx
tests/app/interview-session.test.tsx
tests/app/jobs-detail.test.tsx
tests/app/onboarding.test.tsx
tests/app/resume-detail.test.tsx
tests/app/settings.test.tsx
tests/invariants.test.ts
```

### Render helper

`tests/helpers.tsx` exports `renderIn(lang, ui)`, wrapping the subject in the real `LanguageProvider` with `initialLang`.

It deliberately does not use the app's full `Providers` component. `Providers` constructs its own `QueryClient` with `retry: 1`, which would make every error-path test wait on a retry before asserting. The pages under test receive data through hooks, and those hooks are mocked, so no `QueryClientProvider` is needed at all.

### Mocking boundaries

Three kinds of test, one boundary each.

**Page tests** mock the hook module (`vi.mock("@/hooks/useDocuments")`) and drive the page by returning the state under test — `{data, isLoading, loadError, pollError, errorCount, isChecking, recheck}`. The page renders through real React into real DOM, so assertions use `screen.getByRole("alert")` rather than walking a hand-built tree.

**Hook policy tests** mock `@tanstack/react-query` to capture the options object passed to `useQuery`, then call `refetchInterval` and `retry` directly.

This boundary is chosen deliberately, and its limit should be stated plainly: it tests _this project's polling policy_ — stop when the document reaches a terminal state, stop when the query has given up, do not retry a 404 — not react-query's scheduler. Running a real client with fake timers would test the library instead, and would be slower and prone to timer flake.

**The chat widget** mocks `@clerk/nextjs` so `SignedIn` and `SignedOut` render their children, and stubs `global.fetch` per test. This is the one test that interacts: `fireEvent.click` on the send button, then asserts the assistant bubble that appears. That path is how the 429-without-`Retry-After` defect was found.

`lib/i18n`, `lib/api-error` and `lib/file-rejection` are never mocked. They are the units under test; mocking them would leave the suite asserting its own stubs.

## Test files

**`lib/api-error.test.ts`** — every status the API actually returns (400, 401, 403, 404, 409, 413, 415, 422, 429, 500, 502, 503, inventoried from `backend/app/api` and `backend/app/middleware`) yields a distinct real message in all three languages and never contains the backend's own text; a non-`ApiClientError` yields the connection message; overrides replace only the status they name and do not apply to a failure that never reached the server; the rate-limit countdown rounds up at 30s, 60s, 90s, 3540s, 3600s and 7800s, and falls back to the vague message with no header.

**`lib/file-rejection.test.ts`** — `file-too-large`, `file-invalid-type` and `too-many-files` in three languages; an unknown code and a missing rejection both stay neutral rather than guessing "wrong file type"; the limit renders in MB from a byte input.

**`lib/i18n.test.ts`** — every string carries en, id and ja (deliberate empty strings allowed, where a language needs no separator); `{n}` and `{max}` placeholders survive in every language of a string that has them; the ten keys orphaned by the error-message migration are absent.

**`hooks/useDocuments.test.ts`** — polls while pending or processing, stops on completed or failed, stops once the query has given up, does not retry a 404 or 422, gives up after two attempts, and separates a first-load failure (`loadError`) from a failure after data arrived (`pollError`).

**`hooks/useInterview.test.ts`** — each `InterviewStreamErrorCode` maps to a real translated message; an HTTP failure carries its status and `Retry-After` rather than the response body.

**`components/chat-widget.test.tsx`** — renders every visible string and aria-label in three languages; the greeting follows the current language rather than the one active at mount; a 429 with `Retry-After` uses the chat wording and names no duration, a 429 without one falls back to the shared message; a 502 is explained by status; a 200 whose body will not parse is not reported as a connection failure; an empty reply leaves no blank bubble.

**`app/documents-detail.test.tsx`** — a 404 renders "not found" with no retry, any other failure renders an announced alert with Try again; each of the ten `DocumentErrorCode` values renders its own translated message; an unrecognised code and a null code both fall back to the generic failure; `profile_incomplete` links to Settings and other codes do not; a failed download link is distinguished from one still being prepared.

**`app/culture.test.tsx`** — loading renders the skeleton, a failed load renders an announced alert with a retry and not the empty state, a genuinely empty result renders the empty state, a loaded result renders the list; the glossary tab reports failures through the same component.

## Invariants

`tests/invariants.test.ts` holds the repo-wide guards. These are lint-shaped tests that read source files as data, and the file says so in its docstring — they are not unit tests and should not be mistaken for them.

- No file under `app/` or `components/` renders a response `detail` or a raw `error.message`. `step.detail` (a visa roadmap field) and `body.detail` (the chat widget's own parse) are excluded by name.
- `DocumentErrorCode` in `frontend/types/api.ts` matches `DocumentErrorCode` in `backend/app/models/enums.py`.
- `InterviewStreamErrorCode` matches likewise, and every `_sse_error` call in `backend/app/api/v1/interview.py` passes a code.
- `AnalysisErrorCode` matches (added 2026-09-22). It carried the same "keep in sync" comment as the other two and was the only one of the three unguarded.
- The Settings page's required-field rules match `backend/app/services/rirekisho_completeness.py` (added 2026-09-22): the same set of required keys, the same age range a date of birth must fall in, a label for every required key, and a `case` arm in `isFieldMissing` for every required key — its `default` returns false, so a key with no arm is silently never missing.

Reading the Python source from a TypeScript test is unusual and worth justifying: these enums and rules are contracts with no shared schema, and a mismatch degrades silently — the client falls back to "unknown", or a banner reports a profile ready that generation will reject, and no one notices. The alternative is generating the TS unions from the Python enums, which is more machinery than these assertions warrant at this size.

These guards parse source as text, so a rename can empty the parse and leave a loop over nothing passing forever. Every one of them asserts its extraction is non-empty before using it, and each narrows to the declaration it cares about rather than scanning a whole file. That defence was added after a review found one guard without it. The file now holds 11 tests.

## CI

One step in the existing `frontend` job in `.github/workflows/ci.yml`, between _Format check_ and _Build_:

```yaml
- name: Test
  run: npm test
```

Blocking, matching the backend's pytest step. No coverage threshold.

## Risks and decisions taken

**Deduplication reduces the headline count.** The four harnesses total 401 checks, but translation-completeness appears in three of them and several structural regexes become single real assertions. 107 tests landed, built from roughly 100 `expect` call sites; `it.each` and in-test `for` loops mean many of those sites each run several times across languages or cases, so the assertion count run is well above the test count. A drop in the test-file headline number is expected and is not a loss of coverage.

**Mocking react-query means the scheduler is untested.** Accepted; stated in the test file so the next reader knows what the green tick does and does not mean.

**jsdom is not a browser.** Layout, real focus behaviour and actual screen-reader output are out of reach. Assertions use roles and accessible names, which is what jsdom models faithfully.

**The invariants file reads source text.** It will need updating when files move. That is the cost of catching a whole class of regression that no type or unit test can see.

## Success criteria

- `npm test` passes locally and in CI.
- `npm run type-check`, `npm run lint` and `npm run format:check` pass over `tests/` as over any other source.
- Every behaviour the four harnesses verified is asserted somewhere in the suite.
- Deleting the `role="alert"` from a failure branch, or renaming a translation key used through a typed map, makes the suite fail.
