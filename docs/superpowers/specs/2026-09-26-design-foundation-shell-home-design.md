# Design foundation, sidebar shell and journey Home

**Date:** 2026-09-26
**Status:** Approved in brainstorming; awaiting spec review
**Scope:** Spec 1 of 3 in the UI redesign (see [Roadmap](#roadmap))

## Goal

Make the signed-in app look deliberate and professional, with a Japanese
identity, and make it smarter about where the user is in their move to Japan.

The frontend today has no shared UI primitives. The primary button alone
exists in 7+ hand-copied class strings that have drifted apart. The theme is
the stock shadcn blue on slate, icons are emoji (🏠, ☰, ✕), navigation is
eight flat links in a top bar that collapses into an unmanaged drawer below
1024px, and there is no dashboard home: sign-in, onboarding and the landing
page all drop the user on Resumes.

This spec delivers:

1. **Design tokens and type**: the "sumi + seal" palette and Shippori Mincho
   page titles.
2. **Shared components** that the shell and Home use.
3. **A sidebar shell** grouped by the user's journey.
4. **A journey Home** at `/dashboard`.
5. **A colour-role sweep**, so existing pages stay coherent under the new
   tokens.

## Decisions made in brainstorming

| Question | Decision |
|---|---|
| Visual direction | Japanese-inflected: sumi ink + vermilion seal, indigo for data |
| Navigation | Grouped sidebar: Prepare → Apply → Settle in |
| Home | Journey home: next step + three-column board + recent activity |
| Headings | Shippori Mincho for page titles only; Noto Sans everywhere else |
| Dark mode | Light only; delete the unused `.dark` palette |
| Components | shadcn-style React components (cva), no new packages |
| Rollout | Separate specs; this one first, then the job pipeline, then page migration |

## 1. Tokens and type

### Colours

Values replace those in `frontend/app/globals.css` (`:root`, HSL without
`hsl()` as today) and are registered in `frontend/tailwind.config.ts`.
Existing token names keep their meaning for fills, so every page picks up
the new look without being edited.

| Token | Hex | HSL | Role |
|---|---|---|---|
| `background` | #FAF8F4 | 40 37% 97% | Washi off-white page |
| `foreground` | #1C1B19 | 40 6% 10% | Sumi ink text |
| `card`, `popover` | #FFFFFF | 0 0% 100% | Surfaces |
| `card-foreground`, `popover-foreground` | #1C1B19 | 40 6% 10% | |
| `primary` | #1C1B19 | 40 6% 10% | Ink: primary buttons |
| `primary-foreground` | #FAF8F4 | 40 37% 97% | |
| `secondary`, `muted`, `accent` | #F3EFE7 | 40 33% 93% | Warm grey surfaces, hovers, active nav |
| `secondary-foreground`, `accent-foreground` | #4A4740 | 42 7% 27% | |
| `muted-foreground` | #6B675F | 40 6% 40% | Secondary text |
| `border` | #E7E2D9 | 39 23% 88% | |
| `input` | #D8D2C6 | 40 19% 81% | Control borders |
| `ring` | #23395D | 217 45% 25% | Focus = indigo |
| **new** `seal` | #C8452C | 10 64% 48% | Vermilion accent (see rules) |
| **new** `seal-soft` | #FBE5DF | — | Next-step highlight tint |
| **new** `indigo` | #23395D | 217 45% 25% | Data, links, progress, done |
| **new** `indigo-soft` | #E3EAF4 | 215 44% 92% | Tinted panels, info badge |
| `destructive` | #B42318 | 4 76% 40% | Crimson: errors, delete |
| `destructive-foreground` | #FFFFFF | | |
| `success` | #2F6B4F | 152 39% 30% | Matcha |
| `warning` | #A15C07 | 33 92% 33% | Ochre |
| `--radius` | 0.5rem | | unchanged |

Soft badge backgrounds: success #E3F0E9, warning #FBF0DC, danger #FBE4E1.
Skeleton and progress track: #ECE7DD.

**Contrast (measured, WCAG 2.x):** muted-foreground on background 5.31, on
secondary 4.91. Seal on background 4.56, on white 4.83. Ochre on background
4.89, matcha 5.93. White on crimson 6.57. Indigo on indigo-soft 9.56. Badges:
neutral 8.08, success 5.37, warning 4.59, danger 5.41. #8F8A80 (used in the
brainstorm mocks) is 3.24 and **must not be used for text**.

**Rules:**

- **Seal is a mark, never a fill for actions or errors.** It is used for the
  brand mark, the active-nav stripe, the next-step card's edge, eyebrow
  labels, and the current-stage ring. Errors and destructive buttons use
  crimson, so red never means two things. No seal button or badge variant
  exists.
- **Indigo means data and navigation affordance**: scores, progress bars,
  completed steps, links, and focus rings.
- **Borders over shadows.** Cards are white on washi with a 1px border.
  Shadows only appear on floating layers (menus, dialogs, toasts, the drawer).
- **Light only.** The `.dark` block in `globals.css` is deleted. Tailwind's
  `darkMode` setting may stay; nothing sets the class.

### Type

- **Shippori Mincho**, weights 600 and 700, is loaded with `next/font/google`
  in `app/layout.tsx` beside the Noto fonts. It is exposed as the CSS
  variable `--font-display` and the Tailwind family `font-display`. It is
  used only by `PageHeader`'s title (and later the landing hero in spec 2).
- **Noto Sans / Noto Sans JP** stay the body font, unchanged.
- **Scale:**

  | Role | Size and style |
  |---|---|
  | Page title | 28px Mincho 700 (24px below `sm`) |
  | Section heading | 18px / 600 |
  | Body | 14px |
  | Meta | 12px |
  | Eyebrow | 11px uppercase, tracking 0.08em, `text-seal`, 600 |

## 2. Shared components

These live in `frontend/components/ui/`, follow the pattern of the existing
`dialog.tsx` and `toast.tsx` (forwardRef, `cn()`, cva variants), and use
only installed packages: `class-variance-authority`, `@radix-ui/react-slot`,
`@radix-ui/react-progress`, `tailwind-merge` and `lucide-react`.

Spec 1 builds only what the shell and Home use. Input, Textarea, Select,
Label and EmptyState arrive in spec 2 with the pages that consume them.

| Component | API |
|---|---|
| `button.tsx` | `variant`: `primary` (ink) · `secondary` (white, `input` border) · `ghost` · `destructive` · `link` (indigo, underline). `size`: `sm` · `md` · `lg` · `icon`. `asChild` via Radix Slot, to render a Next `Link`. `loading`: shows a spinner, sets `disabled` and `aria-busy="true"`, and keeps the label visible. Defaults: `primary`, `md`, `type="button"`. |
| `badge.tsx` | `variant`: `neutral` · `info` · `success` · `warning` · `danger`. |
| `card.tsx` | `Card`, `CardHeader`, `CardTitle` (renders `h2` by default; `as` prop for level), `CardDescription`, `CardContent`, `CardFooter`. |
| `progress.tsx` | Radix Progress with an indigo indicator. Requires `aria-label` or `aria-labelledby`; `value` and `max` are passed through. |
| `page-header.tsx` | Props `eyebrow?`, `title`, `description?`, `actions?`. The title renders as the page's single `<h1>` in `font-display`. |
| `skeleton.tsx` | A warm-grey `animate-pulse` block that respects `motion-reduce`. |
| `components/brand-mark.tsx` | A seal circle with 職 plus the wordmark. The `compact` prop shows the mark only. The mark is `aria-hidden`; the wordmark (or `sr-only` text when compact) carries the name. |

## 3. App shell

Rewrite `frontend/app/dashboard/layout.tsx`. The children's content is
untouched.

### Desktop (≥ lg, 1024px)

A fixed 240px sidebar with the main column beside it. **There is no desktop
top bar.**

```
[BrandMark]
Home
(1) PREPARE  n/5      Resumes, Documents
(2) APPLY    n/2      Jobs, Interview
(3) SETTLE IN n/1     Visa, Culture
─────────────
AI today: X of Y left  [progress bar]
Language switcher
Settings
Admin                (only if me.user.role === "admin", as today)
Account (Clerk UserButton with name + email)
```

- **Items**: a lucide icon (`aria-hidden`) plus a label, 40px row height,
  14px text, 8px radius.
  - **Icons**: Home `House` · Resumes `FileText` · Documents `Files` · Jobs
    `Briefcase` · Interview `Mic` · Visa `Stamp` · Culture `BookOpen` ·
    Settings `Settings` · Admin `Shield` · Language `Globe`.
- **Active item**: `bg-secondary`, `font-semibold`, a 3px seal stripe on the
  left, and `aria-current="page"`. Home is active only on exactly
  `/dashboard`. Every other item is active on its href or a sub-path of it,
  as today.
- **Group headings** carry a numbered stage marker and a done/total count
  from `useJourney()` (section 4):
  - A fully done stage shows an indigo filled ✓.
  - The stage containing the next step gets a seal ring.
  - Other stages get a neutral ring.
  - While loading, no count is shown.
  - When any step in the stage is `unknown`, the count is hidden rather than
    shown wrong.
- **Semantics**: one `<nav aria-label={t("nav","main")}>`. Each group is a
  `<ul aria-labelledby>` pointing at its heading. The heading's accessible
  text includes the count, e.g. "Prepare, 5 of 5 steps done", via `sr-only`
  text; the visual "5/5" is `aria-hidden`.
- **Focus**: every item shows a 2px indigo ring under `focus-visible`. The
  existing `SkipLink` still jumps to `#main-content`.
- **AI quota**: `AiQuotaBadge` is restyled as "AI today: X of Y left" with a
  small `Progress`. It keeps its current data source and behaviour.

### Below lg

- A slim sticky top bar with a menu button (lucide `Menu`, labelled with the
  existing `nav.openMenu`), the compact `BrandMark` linking to `/dashboard`,
  and the Clerk `UserButton`.
- The menu opens the same sidebar content in a left-side sheet built on the
  existing Radix `Dialog` primitives, with a titled dialog (`sr-only` title).
  - Focus is trapped, Esc closes it, the body can't scroll, and focus returns
    to the menu button.
  - It closes whenever `pathname` changes.
  - It slides in from the left with `motion-safe:` animation classes only.
- This replaces today's hand-rolled `menuOpen` `<nav id="mobile-nav">`.

### Elsewhere

- **Auth layout** (`app/(auth)/layout.tsx`): `BrandMark` replaces
  "🏠 Japan Job Support".
- **Clerk theming**: `ClerkProvider` in `app/layout.tsx` gets
  `appearance={{ variables: { colorPrimary: "#1C1B19", colorBackground:
  "#FFFFFF", colorText: "#1C1B19", colorTextSecondary: "#6B675F",
  colorDanger: "#B42318", borderRadius: "0.5rem", fontFamily:
  "var(--font-noto-sans), var(--font-noto-sans-jp), sans-serif" } }}`. The
  sign-in and sign-up cards and the account menu then match the app.
- **i18n** (`lib/i18n.ts`, en / id / ja), new keys:

  | Key | en | id | ja |
  |---|---|---|---|
  | `nav.home` | Home | Beranda | ホーム |
  | `nav.main` | Main | Utama | メイン |
  | `nav.groupPrepare` | Prepare | Persiapan | 準備 |
  | `nav.groupApply` | Apply | Melamar | 応募 |
  | `nav.groupSettleIn` | Settle in | Menetap | 生活準備 |
  | `nav.stepsDone` | "{done} of {total} steps done" | (translated) | (translated) |
  | `nav.aiQuotaLeft` | (quota label) | (translated) | (translated) |

  `t()` has no interpolation today, and word order differs between the
  languages (ja puts the name before さん). So `lib/i18n.ts` gains
  `tf(section, key, lang, vars)`, which calls `t()` and replaces each
  `{var}` with `vars[var]`, leaving unknown placeholders intact. It is
  covered in `tests/lib/i18n.test.ts`.

## 4. Journey Home

### The model: `frontend/lib/journey.ts`

A pure module with no React and no fetching.

```ts
type StepId =
  | "profile" | "resumeUploaded" | "resumeAnalysed"
  | "rirekisho" | "shokumu"
  | "application" | "interview"
  | "visa";
type StageId = "prepare" | "apply" | "settleIn";
type StepState = "done" | "todo" | "unknown";

interface JourneyStep { id: StepId; stage: StageId; state: StepState; href: string }
interface JourneyStage { id: StageId; steps: JourneyStep[]; done: number; total: number; complete: boolean }
interface Journey {
  stages: JourneyStage[];
  doneCount: number;
  total: number;
  next: JourneyStep | null;
  allDone: boolean;
}

// Each input is `undefined` when its query failed or is still loading.
// The hook passes loading separately.
function computeJourney(input: JourneyInput): Journey;
```

**Step rules, in order.** The order also serves as the dependency order.

| # | Stage | Step | `done` when | `href` |
|---|---|---|---|---|
| 1 | prepare | profile | `me.rirekisho_ready === true` | `/dashboard/settings` |
| 2 | prepare | resumeUploaded | at least one resume | `/dashboard/resumes` |
| 3 | prepare | resumeAnalysed | the primary resume has an analysis | `/dashboard/resumes/{id}` of that resume |
| 4 | prepare | rirekisho | a `rirekisho` document with `status === "completed"` | `/dashboard/documents/rirekisho/new` |
| 5 | prepare | shokumu | a `shokumukeirekisho` document with `status === "completed"` | `/dashboard/documents/shokumu/new` |
| 6 | apply | application | at least one application | `/dashboard/jobs` |
| 7 | apply | interview | an interview session with `status === "completed"` | `/dashboard/interview/new` |
| 8 | settleIn | visa | at least one visa consultation | `/dashboard/visa` |

- **Primary resume**: the resume with `is_primary`, else the most recently
  created. With no resumes, step 3 is `todo` and links to `/dashboard/resumes`.
- **Unknown**: if a step's source data is `undefined` because its query
  errored, the step is `unknown`. It never counts as done and is never
  `next`. Step 3 is also `unknown` when the resume list is unknown.
- **Next step**: the first `todo` step in table order. If none is `todo`
  (all `done`, or the rest `unknown`), `next` is `null`. `allDone` is true
  only when all 8 steps are `done`.

### The hook: `frontend/hooks/useJourney.ts`

This hook composes the existing hooks, with no new endpoints:

- `useMe`
- `useResumes`
- `useResumeAnalysis(primaryResumeId)` (disabled until an id exists, as
  today)
- `useDocuments()`
- `useApplications()`
- `useInterviewSessions()`
- `useVisaConsultations()`

It returns `{ journey, isLoading, retry(stepId) }`, where retry refetches the
queries behind a step, plus the raw lists that recent activity needs. React
Query's cache means the sidebar and Home share one set of requests.

### The page: `frontend/app/dashboard/page.tsx`

- **Header** (`PageHeader`):
  - **Title**: the greeting with the first word of `me.user.full_name`,
    localised:
    - ja: おかえりなさい、{name}さん
    - en: Welcome back, {name}
    - id: Selamat datang kembali, {name}
    - With no name, the greeting has no name.
  - **Description**: "{done} of {total} steps · your move to Japan".
  - Below it, a `Progress` bar.
- **Next-step card**: shown when `next` exists. It's a `Card` with a seal
  left edge and `seal-soft` eyebrow "Next step". It holds a per-step title,
  a one-line reason and a `Button asChild` link to the step's `href`. For
  example, shokumu reads: "Create your 職務経歴書", "Most employers ask for
  it alongside the 履歴書.", "Create".
- **All-done card**: shown when `allDone` is true. It says the user has
  completed every step and links to `/dashboard/culture`.
- **Board**: three `Card` columns (`md:grid-cols-3`, stacked below `md`), one
  per stage, each headed with its name and "n/total".
  - A `done` step is an indigo check with struck-through label text, still a
    link.
  - A `todo` step is an empty ring; the `next` one gets a seal ring and bold
    text.
  - An `unknown` step says "Couldn't check" with a small `Button
    variant="link"` "Retry", which calls `retry(stepId)`.
- **Recent activity**: a `Card` with up to 5 events merged from the lists
  and sorted newest first:

  | Event | Timestamp |
  |---|---|
  | Resume uploaded | `created_at` |
  | Resume analysed (primary resume only) | `created_at` |
  | Document generated | completed documents, `completed_at` if present, else `created_at` (`Document` has no `updated_at`) |
  | Application added | `created_at` |
  | Interview completed | `completed_at` |
  | Visa checked | `created_at` |

  Each event links to its item, with a relative time from
  `Intl.RelativeTimeFormat(lang, { numeric: "auto" })`. With no events,
  the card isn't rendered.
- **Loading**: `Skeleton` blocks in the shape of the header, card and three
  columns.
- **Copy**: all of it goes through `t()` in en / id / ja: step titles, next-step
  titles, reasons and CTAs, greetings, "Couldn't check", "Retry", activity
  labels and the all-done text.

### Routing

These all change from `/dashboard/resumes` to `/dashboard`:

- Onboarding's two redirects in `app/onboarding/page.tsx`: the returning-user
  `router.replace` and the completion `router.push`.
- `DASHBOARD_ROUTE` in `app/page.tsx`.
- The admin page's back link(s) in `app/admin/page.tsx`. The "go to resumes"
  links that are about resumes stay.

`.env.example` already uses `/dashboard` as the post-sign-in URL. That URL
404s today and resolves once Home exists.

## 5. Colour-role sweep

`primary` currently serves both as a fill and as an accent. Once it becomes
ink, the accent uses would turn black. This mechanical, class-name-only
sweep runs across `frontend/app` and `frontend/components`:

| From | Count (2026-09-26) | To |
|---|---|---|
| `ring-primary`, `ring-primary/30` | 14 | `ring-ring` (keep any opacity suffix) |
| `text-primary` (not `-foreground`) | 14 | `text-indigo` |
| `bg-primary/5`, `bg-primary/10` | 15 | `bg-indigo-soft` |

`bg-primary`, `text-primary-foreground`, `border-primary*` and
`bg-primary-foreground/*` stay: ink fills and ink selected borders are
intended.

The 69 hard-coded palette classes (`text-green-600`, `bg-red-500`, …) are
**not** touched here. Each needs a per-case decision, and they are left to
spec 2.

## Testing

Tests use the existing vitest + RTL setup under `frontend/tests/`, with
`cd frontend && npm test`.

- **`tests/lib/journey.test.ts`**
  - Each of the 8 rules, both done and todo.
  - A primary resume versus the most recent one.
  - Each source failing, which gives `unknown` (not counted, never `next`).
  - `next` order and dependency, `allDone`, and `next === null` when the
    rest are unknown.
  - Mutation-check the rules (flip each condition; a test must fail), with
    the harness failing loudly on a pattern miss and a baseline run, as in
    the earlier page-test work.
- **`tests/components/ui.test.tsx`**
  - Button: `asChild` renders an `<a href>`; `loading` sets `disabled` and
    `aria-busy`; the default `type` is `button`.
  - PageHeader renders exactly one `h1` with the title.
  - Progress exposes `aria-valuenow` and its label.
  - BrandMark's accessible name.
- **`tests/app/dashboard-layout.test.tsx`**
  - The nav landmark name and group lists labelled with counts
    ("Prepare, 5 of 5 steps done").
  - Counts are hidden while loading or unknown.
  - `aria-current` is exact for Home and by prefix for the others.
  - Admin appears only for admins.
  - The drawer opens from the menu button, closes on Esc (focus returns),
    and closes on a pathname change.
- **`tests/app/home.test.tsx`**
  - The next-step card for a mid-journey user.
  - The all-done card.
  - An unknown step with Retry calling a refetch.
  - The greeting with and without a name.
  - Recent activity ordering and the 5-item cap.
  - The board rendered in Japanese.
- **Updated**: `tests/app/onboarding.test.tsx`, where the two
  `/dashboard/resumes` expectations become `/dashboard`.
  `tests/app/jobs-detail.test.tsx`'s `/dashboard/resumes` link is about
  resumes and stays.
- **`tests/lib/i18n.test.ts`**: `tf()` replaces known placeholders and
  leaves unknown ones intact.
- **Invariants**: the existing i18n completeness test covers every new key.
- **Gates**: `npm test`, `npm run lint`, `npm run type-check` and
  `npm run format:check` all pass.

## Verification in the browser

Run the dev server via `preview_start`. The user signs in themselves; the
password is never typed by Claude. Never run `npm run build` while the dev
server is up.

1. Desktop width: sidebar, Home in each state available on the account, and
   a spot check of Resumes, Jobs detail, Interview and Settings under the new
   tokens and the sweep.
2. Phone width (375px): the top bar, the drawer's open, Esc and
   navigate-closes behaviour, and the stacked Home board.
3. Keyboard only: tab order through the sidebar, visible focus rings, the
   drawer focus trap and return.
4. Switch the language to 日本語 and Indonesian. The Mincho title renders,
   nothing overflows the 240px sidebar, and the group names fit.

## Out of scope

- Restyling page interiors, emoji inside pages, the hard-coded colours, form
  controls, EmptyState, and the landing page (spec 2).
- The job pipeline (spec 3).
- Dark mode.
- A collapsible or icon-rail sidebar.
- Backend changes of any kind.

## Roadmap

1. **Spec 1: this document.**
2. **Spec 3: job pipeline** (next, before spec 2, because it rebuilds the jobs
   and applications pages). Each saved job travels one flow, and the kanban
   columns are its stages:
   1. Found → **Saved** (match score)
      - ◆ *Apply or skip?* Skip → **Skipped** (revivable).
   2. **Preparing**: tailored 履歴書 / 職務経歴書 for the job, plus gap tips.
   3. **Applied**
      - ◆ *Called back?* No → **Closed**.
   4. **Interviewing**: practice pre-filled with the role and company.
      - ◆ *Offer?* No → **Closed**.
   5. **Offer**: a visa check for this job.
      - ◆ *Accept?* Yes → **Accepted**; decline → **Closed**.

   Withdraw is available at every stage, and Closed or Skipped jobs can be
   reopened. It needs `skipped`, `preparing` and `accepted` added to the
   `application_status` enum (backend and migration). Home's Apply column
   then becomes a pipeline summary. The flow was confirmed in brainstorming;
   everything else about it is for that spec's own brainstorm.
3. **Spec 2: page migration.** Every existing page and the landing page move
   onto the components, emoji become lucide icons, the hard-coded colours map
   to tokens, and form controls and EmptyState are added.
