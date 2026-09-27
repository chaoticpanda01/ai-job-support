# Page migration (spec 2)

**Date:** 2026-09-27
**Status:** Approved in brainstorming; awaiting spec review
**Builds on:**
- [2026-09-26-design-foundation-shell-home-design.md](2026-09-26-design-foundation-shell-home-design.md),
  which set out the tokens, primitives, `PageHeader`, the sidebar groups,
  and this spec as roadmap item 3.
- [2026-09-26-settings-page-design.md](2026-09-26-settings-page-design.md),
  which added the form controls (`Field`, `Input`, `Select`, `Textarea`,
  `Switch`, `SegmentedControl`, `TagInput`).

The landing page and Settings are already migrated.

## Goal

Make every remaining page look and behave like one product: Home, Settings
and the landing page, not a set of hand-styled screens. Today the pages
share none of the new parts, and each one repeats the same patterns by
hand:

- **Title**: an `<h1 className="text-2xl font-semibold">` on every page.
  Only Home uses `PageHeader`.
- **Empty states**: six hand-written dashed boxes
  (`border-dashed p-10 text-center`) on Resumes, Documents, Interview, Visa
  and Culture (two).
- **Errors**: `role="alert"` boxes styled with `bg-destructive/10`, three of
  them on Visa alone.
- **Loading**: `animate-pulse` list items instead of `Skeleton`.
- **Status colours**:
  - Four local `StatusBadge`/`statusColor` helpers.
  - 58 uses of Tailwind palette classes (`text-green-600`, `bg-blue-100`,
    …) outside the tokens.
- **Controls**: about 45 raw `<input>`, `<select>` and `<textarea>`
  elements, 21 of them in onboarding.
- **Glyphs**: emoji and arrow glyphs used as icons (🏠 🤖 💬 ✕ ✓ ← →).

## Decisions made in brainstorming

1. **Jobs list, Jobs detail and Applications are left out.** Spec 3 (the job
   pipeline) rebuilds them on the new parts, so migrating them now would be
   redone. The job-posting translate tool (`/dashboard/jobs/translate`) is
   not part of the pipeline and is in scope.
2. **Consistent, not redesigned.** Each page keeps its layout and flow and
   moves onto the shared parts. Obvious rough edges found on the way are
   fixed. No page gets a new structure.
3. **Structure A.** The shared parts come first, then the pages area by
   area, all in one spec and one plan, with one commit per area.
4. **Onboarding step 2 asks for the app language**, not "Preferred
   language", matching Settings (see [Onboarding](#onboarding)).

## 1. Shared parts

### Tones

The pages use colour for five meanings: neutral, informational, good, fair
and bad. `Badge` already has exactly these as variants: `neutral`, `info`,
`success`, `warning` and `danger`. Every pair it uses passes WCAG AA in
`tests/lib/design-tokens.test.ts`. So `Tone` is that union, and pages stop
naming colours.

`frontend/lib/tones.ts`:

- **`type Tone`**: `"neutral" | "info" | "success" | "warning" | "danger"`.
  `Badge`'s variant prop takes the same values.
- **`toneText`**, **`toneSoft`** and **`toneFill`**:
  `Record<Tone, string>` class maps, for the few places that are not
  badges.
  - `toneText`: score numbers, e.g. `success → "text-success"`.
  - `toneSoft`: tinted boxes, e.g. `success → "bg-success-soft"`.
  - `toneFill`: bars and dots, e.g. `success → "bg-success"`.
  - `neutral` maps to `text-muted-foreground`, `bg-secondary` and
    `bg-muted-foreground`, and `info` to the indigo tokens.
- **`scoreTone(score, { good, fair })`**: returns `success` when
  `score >= good`, `warning` when `score >= fair`, and `danger` otherwise.
  Each caller keeps its own thresholds, because they differ today and
  changing them would change what a score means:
  - resume analysis: `{ good: 81, fair: 61 }`
  - interview scores and progress: `{ good: 70, fair: 50 }`
- **`DOCUMENT_STATUS_TONE`**: `Record<DocumentStatus, Tone>`, with pending →
  warning, processing → info, completed → success, failed → danger.
- **`SESSION_STATUS_TONE`**: `Record<InterviewStatus, Tone>`, with active →
  success, completed → info and abandoned → neutral.

These replace the local helpers in `documents/page.tsx`,
`documents/[id]/page.tsx`, `interview/page.tsx`, `interview/[id]/page.tsx`
and `resumes/[id]/page.tsx`.

### New components in `components/ui/`

| Component | Does | Replaces |
|---|---|---|
| `EmptyState({ icon, title, description?, action? })` | A dashed card, centred, with a lucide icon (`aria-hidden`) in a soft circle, the title as a `<p className="font-medium">`, an optional muted line, and an optional action (usually `Button asChild` around a `Link`). | The six dashed boxes |
| `Alert({ tone, title?, children, action? })` | A tinted box (`toneSoft` background, `toneText` text) with a lucide icon: `AlertCircle` for danger, `AlertTriangle` for warning, `CheckCircle2` for success and `Info` for info. There is an optional bold title and an optional action, such as a Retry `Button`. `danger` uses `role="alert"`; the other tones use `role="status"`. | The `bg-destructive/10` error boxes and the green "ready" box on documents detail |
| `ToggleGroup<T>({ label, value, options, onChange })` | A `role="group"` of buttons named by `label`, each with `aria-pressed`, styled like the language switcher. It filters; it does not switch panels. | The Documents status filter |
| `Tabs` (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`) | Thin styled wrappers over `@radix-ui/react-tabs`, which is already installed and used by Admin. It gives arrow-key roving focus and tab/tabpanel roles. | Culture's Topics/Glossary switch and Admin's hand-styled tab list |

Existing parts are reused as they are: `PageHeader`, `Card`, `Button`
(`asChild`, `loading`), `Badge`, `Skeleton`, `Progress`, `Breadcrumbs` and
the form controls. No new npm packages are added.

### Palette → token

All 58 palette uses in scope map onto tokens. Most go through `Badge`,
`Alert` or the tone maps rather than being swapped class for class.

| Today | Becomes |
|---|---|
| `bg-green-50`, `bg-green-100` | `bg-success-soft` |
| `bg-amber-100`, `bg-yellow-100` | `bg-warning-soft` |
| `bg-red-100` | `bg-destructive-soft` |
| `bg-blue-100` | `bg-indigo-soft` |
| `text-green-600/700/800` | `text-success` |
| `text-amber-700`, `text-yellow-600/800` | `text-warning` |
| `text-red-600/800` | `text-destructive` |
| `text-blue-800` | `text-indigo` |
| `bg-green-500`, `bg-amber-500`, `bg-yellow-500`, `bg-red-500`, `bg-blue-500` (bars, dots) | `bg-success`, `bg-warning`, `bg-warning`, `bg-destructive`, `bg-indigo` |
| `border-blue-800 border-t-transparent` spinner | lucide `Loader2` with `animate-spin motion-reduce:animate-none`, as in `Button` |

### Glyphs → lucide

| Today | Becomes | Where |
|---|---|---|
| `←` / `→` in link text | `ArrowLeft` / `ArrowRight` | Admin, interview session, documents list, visa roadmap switcher |
| 🏠 | `Home` | Admin |
| 🤖 | `Bot` | Chat widget |
| ✕ | `X` | Chat widget |
| 💬 | `MessageCircle` | Chat widget |
| ✓ | `Check` | Visa checklist |

Icons are `aria-hidden`, and the visible text or an `aria-label` carries the
meaning, as today.

## 2. The migration recipe

Every page in scope gets the same five steps:

1. **Title**:
   - The hand-written `<h1>` becomes `PageHeader` with its title,
     description and actions.
   - List pages set the eyebrow to their sidebar group:
     - Prepare: Resumes, Documents
     - Apply: Interview, the translate tool
     - Settle in: Visa, Culture
   - Detail pages keep `Breadcrumbs` above the header.
2. **States**:
   - Loading uses `Skeleton`, shaped like the content it stands in for.
   - A failed load uses `Alert tone="danger"`, with a Retry action wherever
     the query exposes `refetch`.
   - "Nothing yet" uses `EmptyState`, with the action that fixes it where
     there is one: Upload a resume, Create a document, Start a practice
     session, Check my visa options.
3. **Colour and glyphs**:
   - Status and score colours come from `Badge` and the tone helpers.
   - Emoji and arrow glyphs become lucide icons.
4. **Controls and buttons**:
   - Raw controls become `Field` with `Input`, `Select`, `Textarea`,
     `TagInput`, `Switch` or `SegmentedControl`.
   - Hand-styled buttons and button-like links become `Button`, or
     `Button asChild` around a `Link`.
   - Busy states use `loading`.
5. **Containers**: hand-styled boxes (`rounded-lg border bg-card p-…`)
   become `Card` where they are cards. Plain list rows may keep their
   classes.

Behaviour, routes, data fetching and copy stay the same, apart from the
exceptions listed here.

## 3. By area

### Prepare: Resumes and Documents

- **Resumes list, detail, and `ResumeUploader`**:
  - The analysis score colour comes from `scoreTone(score, { good: 81, fair: 61 })`.
  - The positive, negative and neutral bars use `toneFill`: success,
    danger and info.
- **Documents list**:
  - The status filter becomes `ToggleGroup`.
  - Status badges come from `DOCUMENT_STATUS_TONE`.
  - The "View →" link gets `ArrowRight`.
- **Documents detail**:
  - The status badge is `Badge` with a `Loader2` while processing.
  - The green "ready" box becomes `Alert tone="success"`.
- **履歴書 and 職務経歴書 wizards, and `DocumentWizard`**:
  - The four raw controls become form primitives.
  - The 履歴書 wizard's error line in a dashed box becomes
    `Alert tone="danger"`, and its two dashed panels become `Card`s.
  - `DocumentWizard`'s dashed "nothing to pick" line becomes `EmptyState`.

### Apply: Interview and the translate tool

- **Interview list**: the score colour comes from
  `scoreTone(score, { good: 70, fair: 50 })`.
- **New session**: the four raw controls become form primitives.
- **Session** (650 lines):
  - The status badge comes from `SESSION_STATUS_TONE`.
  - Score and progress bars use `scoreTone` with `toneFill` and
    `toneText`.
  - The strengths and improvements dots use `toneFill.success` and
    `toneFill.warning`.
  - The live dot is `toneFill.success`, and the back glyph gets
    `ArrowLeft`.
- **Translate tool**: the two raw controls become primitives, and the
  success text uses `text-success`.

### Settle in: Visa and Culture

- **Visa**:
  - The three error boxes become `Alert`s.
  - `visa-option-card` and `visa-checklist` take their colours from the
    tones.
  - The checklist ✓ becomes `Check`.
  - The roadmap switcher's back link gets `ArrowLeft`.
  - The detail page and past consultations get the recipe.
- **Culture**:
  - Topics and Glossary become `Tabs`.
  - The glossary search box becomes `Input` inside `Field`, with a visually
    hidden label.
  - The topic grid's cards become `Card`.
  - The detail page gets the recipe.

### Onboarding

The five-step wizard keeps its steps, fields, validation and saves:

- **Shared parts**: its local `Field`, `SubmitBtn` and class strings give
  way to the shared `Field`, `Input`, `Select`, `Textarea` and `Button`.
  Each step's heading becomes `PageHeader`. Only one step renders at a
  time, so there is still one `<h1>`.
- **Step 2, language**:
  - The "Preferred language" `<select>` (hard-coded English option names,
    default `id`) becomes an **app language** choice: a `SegmentedControl`
    of the three languages, each in its own name (`LANGUAGES` in
    `lib/i18n.ts`).
  - It starts on the current app language, and choosing one calls
    `setLang` at once, so the rest of onboarding switches language as in
    Settings.
  - On Continue, the step still saves `preferred_language`, set to that
    language, so the backend field stays filled and consistent.
  - The label and hint use new `onboarding` strings ("App language",
    "Changes the app straight away").
- **Step 4, roles and industries**:
  - Target roles and target industries become `TagInput`, like Settings.
    Today they are comma-separated text.
  - They save the same string arrays. The zod rule "at least one" moves
    from a non-empty string to a non-empty array, with the same messages.

### Admin

Admin is an internal page and stays English-only; translating it is out of
scope.

- It gets `PageHeader`, and `Tabs` in place of the hand-styled Radix tab
  list.
- The five raw controls become form primitives.
- `Button` replaces the hand-styled buttons.
- The 🏠 and ← glyphs become `Home` and `ArrowLeft`.

### The rest

- **Error screens**: `app/error.tsx`, `app/dashboard/error.tsx`,
  `components/error-fallback.tsx`, `app/not-found.tsx` and
  `components/not-found-content.tsx` get `Button` and tokens where they
  hand-style them. `app/global-error.tsx` renders outside the app's CSS and
  is left alone.
- **Chat widget**:
  - 🤖, 💬 and ✕ become `Bot`, `MessageCircle` and `X`.
  - Its raw `<textarea>` or `<input>` becomes the shared primitive.
  - It keeps its `--save-bar-offset` behaviour.
- **`PhotoUploader`**: already restyled for Settings. Its hidden dropzone
  `<input>` is allowed (see the guard).

## 4. The guard

`frontend/tests/design-guard.test.ts` scans every `.tsx` file under `app/`
and `components/`, except `components/ui/`. It fails on any of these:

- **Palette classes**: any Tailwind palette colour class, matching
  `(text|bg|border|ring|from|to|via|fill|stroke|divide|outline|placeholder|accent|decoration)-(red|green|blue|…|stone)-NNN`.
- **Glyphs**: any emoji or arrow glyph in a JSX text or string literal
  (← → ✓ ✕ and the emoji ranges).
- **Raw controls**: a raw `<input`, `<select` or `<textarea`, except
  `<input {...getInputProps()} />` (react-dropzone's hidden file input).
- **Headings**: an `<h1` outside `PageHeader`, except:
  - `components/not-found-content.tsx` and `components/error-fallback.tsx`,
    which are full-screen states with their own layout.
  - `components/landing/landing-page.tsx`, which is already migrated and
    uses its own hero `h1`.

  The auth pages have no `<h1>` of their own (Clerk renders theirs).

It has two lists, each entry with a one-line reason:

- **`ALLOWED`**: permanent exceptions (the ones above).
- **`NOT_YET_MIGRATED`**: every in-scope file at first. Each area task
  deletes its own entries when it is done, so an area cannot be half
  migrated and still pass. After the last task, only these remain, marked
  "rebuilt in spec 3":
  - `app/dashboard/jobs/page.tsx`
  - `app/dashboard/jobs/[id]/page.tsx`
  - `app/dashboard/jobs/applications/page.tsx`

The guard also fails if a `NOT_YET_MIGRATED` entry no longer has any
violation, so stale entries cannot linger. It is mutation-checked: inject
one palette class, one glyph, one raw control and one stray `<h1>` into a
migrated file, and each must fail.

## 5. Accessibility

- `EmptyState`:
  - Its icon is `aria-hidden`.
  - Its title is text, not a heading, so it doesn't break the page's
    heading order.
  - The action is a real link or button.
- `Alert`: `role="alert"` only for failures, so success and info messages
  are not announced as errors.
- `ToggleGroup`:
  - A named group with `aria-pressed` buttons.
  - The pressed state is shown by more than colour: weight and fill, as in
    the language switcher.
- `Tabs`: Radix's tablist semantics, with arrow keys and Home/End.
- Every migrated control goes through `Field`, so it has a label, and its
  hint and error are wired with `aria-describedby`/`aria-invalid`.
- Focus rings stay visible on every migrated control, using the global
  `:focus-visible` outline or the component's ring.

## Testing

Tests use the existing vitest + RTL setup:
`cd frontend && npm test`.

- **`tests/lib/tones.test.ts`**:
  - Every `DocumentStatus` and `InterviewStatus` maps to a tone.
  - `scoreTone` is correct at, just above and just below each threshold,
    for both threshold sets.
  - Every `Tone` has an entry in each class map.
- **`tests/components/ui.test.tsx`** (extended):
  - `EmptyState` renders its title, description and action.
  - `Alert`: `danger` is `role="alert"`, the other tones are
    `role="status"`, and the action renders.
  - `ToggleGroup`: `aria-pressed` follows the value, and clicking calls
    `onChange`.
  - `Tabs`: ArrowRight moves focus and selection, and the panel follows.
- **`tests/design-guard.test.ts`**: as in [The guard](#4-the-guard),
  mutation-checked.
- **Page tests**:
  - Existing tests are kept and changed only where the markup
    legitimately changed: a heading via `PageHeader`, a filter as
    `aria-pressed` buttons, tabs as `role="tab"`. These are:
    `culture`, `documents-detail`, `interview-session`, `new-document`,
    `onboarding`, `resume-detail` and `chat-widget`.
  - New tests for pages that have none, covering the loading skeleton, the
    empty state (with its action) and the error alert (with Retry calling
    `refetch`) for:
    - the Resumes list
    - the Documents list
    - the Interview list
    - Visa
  - Onboarding gains tests for:
    - the app-language step: it starts on the current language, choosing
      one switches the page, and Continue saves `preferred_language`
    - the tag inputs: roles save as an array, and none gives the
      "at least one" error
  - Each area's key behaviours are mutation-checked (the tone mapping, the
    empty-state action, Retry, the language save) before its commit.
- **Strings**: new empty-state titles, descriptions and action labels,
  Retry, and the onboarding language strings go through `t()` in en, id and
  ja, reusing existing keys where they fit. The i18n completeness test
  covers them.
- **Gates** before every commit: `npm test`, `npm run lint`,
  `npm run type-check` and `npm run format:check`.

## Verification in the browser

After each area, with the dev server via `preview_start` (the user signs in
themselves, and Claude never runs `npm run build` while the dev server is
up):

1. **Desktop (1280px) and phone (375px)**:
   - The page header.
   - Each state the account can show.
   - No horizontal scroll.
2. **Languages**: 日本語 and Indonesian, with nothing overflowing.
3. **Keyboard**: a pass through the area's controls, with visible focus.
4. **One real action**, where it is safe and reversible:
   - Documents: the filter.
   - Culture: the tabs.
   - Interview: open a past session.
   - Onboarding: the language step, on a test account or by checking the
     request body only.

Reload sparingly: each hot reload re-sends every dashboard request, and
repeated reloads trip the API's per-minute rate limit.

## Out of scope

- Jobs list, Jobs detail and Applications (spec 3).
- Page redesigns, new features, and changes to routes or data fetching.
- Translating the Admin page.
- `app/global-error.tsx`.
- Dark mode.
- Backend changes of any kind.
