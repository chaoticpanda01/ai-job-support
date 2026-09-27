# Page Migration (Spec 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every remaining page, except Jobs list, Jobs detail and
Applications, onto the design system:
- the shared components and form controls
- tones instead of palette colours
- lucide icons instead of glyphs
- `EmptyState` and `Alert` for the empty and failed states

A guard test stops the old patterns coming back.

**Architecture:**
- **Pure mapping**: `lib/tones.ts` turns data (statuses, scores) into five
  tones, which `Badge` already renders.
- **Shared parts**:
  - New components in `components/ui/`: `EmptyState`, `Alert`,
    `ToggleGroup`, `Tabs`, `RadioCard` and `Checkbox`.
  - Two app-level parts: `RetryButton` and `DocumentStatusBadge`.
- **Migration by area**: pages move area by area, following one recipe.
- **The guard**: `tests/design-guard.test.ts` scans the source for banned
  patterns. It starts with every unmigrated file on an exemption list, and
  each area task deletes its own entries.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind 3.4,
`@radix-ui/react-tabs` (already installed), lucide-react, react-hook-form +
zod (onboarding), TanStack Query 5, vitest + jsdom + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-27-page-migration-design.md`

## Global Constraints

- **Commands**: all frontend commands run from `frontend/`. Run a single
  test file with `npx vitest run <path>`, and the whole suite with
  `npm test`.
- **Gates before every commit**: `npm test`, `npm run lint`,
  `npm run type-check` and `npm run format:check`.
- **Packages**: no new npm packages.
- **Strings**: every user-facing string goes through `t()` in en, id and
  ja, except on Admin, which stays English-only. Placeholders use
  `t(...).replace("{x}", value)`.
- **Type-checking**: `tsconfig` has `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes` and `typedRoutes` on. Cast dynamic hrefs
  with `as Route`.
- **Colour and theme**:
  - Seal is a mark only, never text.
  - Accents use indigo, not `text-primary`.
  - Text colours pass WCAG AA.
  - Light theme only.
- **Scope**:
  - Jobs list, Jobs detail and Applications (`app/dashboard/jobs/page.tsx`,
    `app/dashboard/jobs/[id]/page.tsx`,
    `app/dashboard/jobs/applications/page.tsx`) are **not touched**.
  - `app/global-error.tsx` is not touched.
- **Behaviour** stays the same apart from:
  - onboarding step 2 (the app language)
  - roles and industries in onboarding step 4, and tags in Admin, as
    `TagInput`
  - the fixes named in each task
- **Browser checks**:
  - Never run `npm run build` while the dev server runs.
  - The user signs in themselves.
  - Reload sparingly, because hot reloads trip the API's per-minute rate
    limit.
- **Branch and commits**:
  - Work on `ui-foundation-shell-home`.
  - Commit after each task, ending the message with
    `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Commit, push or merge only when the user asks.
- **zsh**: `$var` does not word-split in zsh. Write test paths out in full
  in shell loops, or use arrays.

## Amendment (made during Task 3): glyphs inside translated strings

The browser check in Task 3 found arrows inside the copy itself, for
example "← Back to documents" and "Next →". The file scan can't see these,
because they live in `lib/i18n.ts`.

The guard now also scans every translated string, with its own
`STRINGS_NOT_YET_MIGRATED` list. Each task strips the arrow from its
strings, and the page draws it as a lucide icon instead (`ArrowLeft` before
the text, `ArrowRight` after it). The task then deletes the keys from the
list.

| Task | Strings |
|---|---|
| 3 (done) | `documents.backToDocuments`, `documents.wizNext`; deleted the unused `resumes.backToResumes` and `visa.backToVisa` |
| 4 | `interview.review` (strip, then `ArrowRight` in the Review button). `interview.backToList` and `jobs.backToJobs` become unused once their pages use `Breadcrumbs`: check with `grep` and delete them. |
| 5 | `culture.backToCulture` (strip; `BackLink` already gets `ArrowLeft`) |
| 6 | `onboarding.s1DangerZone`. Settings has no "Danger zone" any more; its card is "Delete account". It becomes: en "Settings, under Delete account"; id "Pengaturan, di bagian Hapus akun"; ja "設定の「アカウントを削除」". |
| spec 3 | `jobs.jobBoard` stays until spec 3 rebuilds Applications. Task 8 pins it as the only entry left. |

Task 8's pin also asserts
`Object.keys(STRINGS_NOT_YET_MIGRATED)` equals `["jobs.jobBoard"]`.

Two more findings from Task 3's browser check:

- **"Optional" tags**: `Field`'s `optionalLabel` takes
  `t("settings", "optional", lang)` ("Optional"), as Settings does, not
  `t("common", "optional", lang)`, which is lowercase "optional". This
  applies to every `optionalLabel` in Tasks 4–7.
- **Focus in multi-step flows**: after a step change, focus moves to the new
  step's title (`tabIndex={-1}`, focused in an effect on the step). Without
  that, React reuses the old step's first button as the new step's Back
  button, so the keyboard focus sits on Back. `DocumentWizard` does this.
  Task 6 does the same for onboarding's steps, focusing the new step's
  `PageHeader` title, with a test like the new-document one.
- **List rows on phones**: a row with a long name and two or three actions
  squeezed its meta line into a one-word column at 375px. Rows use
  `flex flex-col gap-3 … sm:flex-row sm:items-center sm:justify-between sm:gap-4`,
  with the actions in `flex flex-wrap items-center gap-1 sm:shrink-0`, and
  a truncating name link is `block truncate`. The Resumes and Documents
  lists do this, and Task 4's Interview list should do the same.

## The recipe (every page in scope)

1. **Title**:
   - The hand-written `<h1>` becomes `PageHeader`.
   - List pages set `eyebrow` to their sidebar group:
     `t("nav", "groupPrepare" | "groupApply" | "groupSettleIn", lang)`.
   - Sub-pages that had a "← back" text link get `Breadcrumbs` instead,
     like the detail pages.
   - Layout: `PageHeader` carries its own `mb-8`, so it sits **outside**
     the page's `space-y-*` wrapper:

     ```tsx
     return (
       <>
         <PageHeader … />
         <div className="space-y-8">…</div>
       </>
     );
     ```

     When `PageHeader` must sit inside a spaced container (onboarding
     steps), pass `className="mb-0"`.
2. **States**:
   - Loading uses `Skeleton`.
   - A failed load uses `<Alert tone="danger">`, with
     `action={<RetryButton … />}` wherever the query exposes `refetch`.
   - "Nothing yet" uses `EmptyState`.
3. **Colour and glyphs**:
   - `Badge variant={tone}`, `toneText`, `toneSoft` and `toneFill` replace
     palette colours.
   - lucide icons replace glyphs.
4. **Controls and buttons**:
   - `Field` wraps `Input`, `Select`, `Textarea`, `TagInput`,
     `SegmentedControl`, `RadioCard` or `Checkbox`.
   - `Button`, or `Button asChild` around a `Link`, replaces hand-styled
     buttons.
   - Busy states use `loading`.
   - Spinners (`animate-spin rounded-full border…`) become
     `<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />`.
5. **Containers**: hand-styled `rounded-lg border bg-card p-…` boxes
   become `Card` (with the same padding class).

## File map

| File | Responsibility |
|---|---|
| `frontend/lib/tones.ts` | `Tone`, class maps, `scoreTone`, score bands, status/eligibility tone maps (create) |
| `frontend/components/ui/empty-state.tsx`, `alert.tsx`, `toggle-group.tsx`, `tabs.tsx`, `radio-card.tsx`, `checkbox.tsx` | Shared parts (create) |
| `frontend/components/retry-button.tsx` | Translated Try again / Retrying button (create) |
| `frontend/components/documents/document-status-badge.tsx` | Document status badge (create) |
| `frontend/tests/design-guard.test.ts` | The guard (create) |
| `frontend/tests/lib/tones.test.ts`, `frontend/tests/components/ui.test.tsx` | Unit tests (create / extend) |
| Pages and components per task | Migrated (modify) |
| `frontend/lib/i18n.ts` | New strings per task (modify) |

---

### Task 1: Tones and the shared parts

**Files:**
- Create: `frontend/lib/tones.ts`
- Create: `frontend/components/ui/empty-state.tsx`, `frontend/components/ui/alert.tsx`,
  `frontend/components/ui/toggle-group.tsx`, `frontend/components/ui/tabs.tsx`,
  `frontend/components/ui/radio-card.tsx`, `frontend/components/ui/checkbox.tsx`
- Create: `frontend/components/retry-button.tsx`,
  `frontend/components/documents/document-status-badge.tsx`
- Test: `frontend/tests/lib/tones.test.ts` (create), `frontend/tests/components/ui.test.tsx` (extend)

**Interfaces:**
- **Consumes:**
  - `Badge` (`variant: "neutral" | "info" | "success" | "warning" | "danger"`)
  - `Button` (`variant`, `size`, `loading`, `asChild`)
  - `cn`, `useLang`, `t`
  - the types `DocumentStatus`, `InterviewStatus` and `VisaEligibility`
- **Produces:**
  - `type Tone`
  - `toneText`, `toneSoft`, `toneFill: Record<Tone, string>`
  - `interface ScoreBands { good: number; fair: number }`, with
    `RESUME_SCORE_BANDS` and `INTERVIEW_SCORE_BANDS`
  - `scoreTone(score: number, bands: ScoreBands): Tone`
  - `DOCUMENT_STATUS_TONE`, `SESSION_STATUS_TONE` and `ELIGIBILITY_TONE`
  - `EmptyState({ icon: LucideIcon; title; description?; action?; className? })`
  - `Alert({ tone?: Tone (default "danger"); title?; children; action?; className? })`
  - `ToggleGroup<T extends string>({ label: string; value: T; options: { value: T; label: ReactNode; lang?: string }[]; onChange: (v: T) => void; className? })`
    - Calls `onChange` even for the pressed option.
  - `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` (Radix wrappers)
  - `RadioCard({ name; value; checked; onChange: () => void; children; className? })`
  - `Checkbox` (a forwardRef native checkbox; all input props except
    `type`)
  - `RetryButton({ retrying: boolean; onRetry: () => void; size?: "sm" | "md" })`
  - `DocumentStatusBadge({ status: DocumentStatus })`

- [ ] **Step 1: Write the failing tone tests**

Create `frontend/tests/lib/tones.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_STATUS_TONE,
  ELIGIBILITY_TONE,
  INTERVIEW_SCORE_BANDS,
  RESUME_SCORE_BANDS,
  SESSION_STATUS_TONE,
  scoreTone,
  toneFill,
  toneSoft,
  toneText,
  type Tone,
} from "@/lib/tones";

const TONES: Tone[] = ["neutral", "info", "success", "warning", "danger"];

describe("tone class maps", () => {
  it.each([
    ["toneText", toneText],
    ["toneSoft", toneSoft],
    ["toneFill", toneFill],
  ])("%s has a token class for every tone", (_name, map) => {
    for (const tone of TONES) {
      expect(map[tone]).toMatch(/^(text|bg)-[a-z-]+$/);
    }
  });
});

describe("scoreTone", () => {
  it.each([
    [81, "success"],
    [80, "warning"],
    [61, "warning"],
    [60, "danger"],
  ] as const)("reads a resume score of %i as %s", (score, tone) => {
    expect(scoreTone(score, RESUME_SCORE_BANDS)).toBe(tone);
  });

  it.each([
    [70, "success"],
    [69, "warning"],
    [50, "warning"],
    [49, "danger"],
  ] as const)("reads an interview score of %i as %s", (score, tone) => {
    expect(scoreTone(score, INTERVIEW_SCORE_BANDS)).toBe(tone);
  });
});

describe("status tones", () => {
  it("gives every document status its tone", () => {
    expect(DOCUMENT_STATUS_TONE).toEqual({
      pending: "warning",
      processing: "info",
      completed: "success",
      failed: "danger",
    });
  });

  it("gives every interview status its tone", () => {
    expect(SESSION_STATUS_TONE).toEqual({
      active: "success",
      completed: "info",
      abandoned: "neutral",
    });
  });

  it("gives every visa eligibility its tone", () => {
    expect(ELIGIBILITY_TONE).toEqual({
      eligible: "success",
      eligible_with_gaps: "warning",
      not_eligible: "neutral",
    });
  });
});
```

- [ ] **Step 2: Write the failing component tests**

Append to `frontend/tests/components/ui.test.tsx`. Keep its existing
imports; add these to them:

```tsx
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { FileText } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { RadioCard } from "@/components/ui/radio-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup } from "@/components/ui/toggle-group";
```

(If `render`, `screen` or `fireEvent` are already imported, merge rather
than duplicate.) Then append:

```tsx
describe("EmptyState", () => {
  it("shows its title, description and action, and hides its icon", () => {
    const { container } = render(
      <EmptyState
        icon={FileText}
        title="No resumes yet"
        description="Upload one to get started."
        action={<a href="/upload">Upload</a>}
      />,
    );
    expect(screen.getByText("No resumes yet")).toBeInTheDocument();
    expect(screen.getByText("Upload one to get started.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload" })).toBeInTheDocument();
    // The title is text, not a heading: it must not break the page's outline.
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Alert", () => {
  it("announces a failure as an alert, and keeps its action out of the message", () => {
    render(
      <Alert tone="danger" action={<button type="button">Try again</button>}>
        Could not load.
      </Alert>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Try again");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it.each(["success", "info", "warning", "neutral"] as const)(
    "announces a %s message politely, as a status",
    (tone) => {
      render(<Alert tone={tone}>Done.</Alert>);
      expect(screen.getByRole("status")).toHaveTextContent("Done.");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("shows a title above the message", () => {
    render(
      <Alert tone="danger" title="Generation failed">
        The resume could not be read.
      </Alert>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Generation failedThe resume could not be read.",
    );
  });
});

describe("ToggleGroup", () => {
  function Harness() {
    const [value, setValue] = useState<"all" | "a">("all");
    return (
      <ToggleGroup
        label="Filter by type"
        value={value}
        options={[
          { value: "all", label: "All" },
          { value: "a", label: "履歴書", lang: "ja" },
        ]}
        onChange={setValue}
      />
    );
  }

  it("is a named group whose pressed button follows the value", () => {
    render(<Harness />);
    const group = screen.getByRole("group", { name: "Filter by type" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "履歴書" }));
    expect(screen.getByRole("button", { name: "履歴書" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "履歴書" })).toHaveAttribute("lang", "ja");
  });

  it("reports a click on the pressed option too, so a caller can toggle it off", () => {
    const seen: string[] = [];
    render(
      <ToggleGroup
        label="Tags"
        value="a"
        options={[{ value: "a", label: "A" }]}
        onChange={(v) => seen.push(v)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    expect(seen).toEqual(["a"]);
  });
});

describe("Tabs", () => {
  it("renders tabs whose panel follows the selected tab", () => {
    function Harness() {
      const [tab, setTab] = useState("one");
      return (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="Sections">
            <TabsTrigger value="one">One</TabsTrigger>
            <TabsTrigger value="two">Two</TabsTrigger>
          </TabsList>
          <TabsContent value="one">First panel</TabsContent>
          <TabsContent value="two">Second panel</TabsContent>
        </Tabs>
      );
    }
    render(<Harness />);
    expect(screen.getByRole("tablist", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("First panel");
    // Radix selects on mousedown, not click.
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Two" }), { button: 0 });
    expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Second panel");
  });
});

describe("RadioCard", () => {
  it("is a radio named by its card's content", () => {
    const picked: string[] = [];
    render(
      <fieldset>
        <legend>Resume</legend>
        <RadioCard name="resume" value="r1" checked={false} onChange={() => picked.push("r1")}>
          <p>cv.pdf</p>
        </RadioCard>
      </fieldset>,
    );
    fireEvent.click(screen.getByRole("radio", { name: "cv.pdf" }));
    expect(picked).toEqual(["r1"]);
  });
});

describe("Checkbox", () => {
  it("is a native checkbox that keeps the props it is given", () => {
    render(<Checkbox aria-label="Publish" defaultChecked />);
    expect(screen.getByRole("checkbox", { name: "Publish" })).toBeChecked();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd frontend && npx vitest run tests/lib/tones.test.ts tests/components/ui.test.tsx`

Expected: FAIL, "Failed to resolve import `@/lib/tones`" (and
`@/components/ui/alert`).

- [ ] **Step 4: Implement `frontend/lib/tones.ts`**

```ts
import type { DocumentStatus, InterviewStatus, VisaEligibility } from "@/types/api";

/**
 * The five meanings colour carries in the app. Badge's variants use the same
 * names, and every pair below is covered by the contrast tests in
 * tests/lib/design-tokens.test.ts. Pages say what a thing means (a tone), not
 * which colour it is.
 */
export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

/** Text in a tone: score numbers, short labels. */
export const toneText: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  info: "text-indigo",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

/** A tinted background, for boxes; pair it with toneText. */
export const toneSoft: Record<Tone, string> = {
  neutral: "bg-secondary",
  info: "bg-indigo-soft",
  success: "bg-success-soft",
  warning: "bg-warning-soft",
  danger: "bg-destructive-soft",
};

/** A solid fill, for bars and dots. */
export const toneFill: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-indigo",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

/** Where a score turns from fair to good, and from poor to fair. */
export interface ScoreBands {
  good: number;
  fair: number;
}

/** The resume analysis' japan_market_score. */
export const RESUME_SCORE_BANDS: ScoreBands = { good: 81, fair: 61 };

/** Interview answer scores, progress bars and the session's overall score. */
export const INTERVIEW_SCORE_BANDS: ScoreBands = { good: 70, fair: 50 };

export function scoreTone(score: number, bands: ScoreBands): Tone {
  if (score >= bands.good) return "success";
  if (score >= bands.fair) return "warning";
  return "danger";
}

export const DOCUMENT_STATUS_TONE: Record<DocumentStatus, Tone> = {
  pending: "warning",
  processing: "info",
  completed: "success",
  failed: "danger",
};

export const SESSION_STATUS_TONE: Record<InterviewStatus, Tone> = {
  active: "success",
  completed: "info",
  abandoned: "neutral",
};

export const ELIGIBILITY_TONE: Record<VisaEligibility, Tone> = {
  eligible: "success",
  eligible_with_gaps: "warning",
  not_eligible: "neutral",
};
```

- [ ] **Step 5: Implement the components**

`frontend/components/ui/empty-state.tsx`:

```tsx
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Nothing here yet", with the way forward. The title is text, not a heading,
 * so an empty list doesn't add a level to the page's outline.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-lg border border-dashed bg-card px-6 py-10 text-center",
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <p className="mt-4 font-medium">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
```

`frontend/components/ui/alert.tsx`:

```tsx
import * as React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import { toneSoft, toneText, type Tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

const ICONS: Record<Tone, LucideIcon> = {
  neutral: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

/**
 * A message in a tinted box. Only a failure is role="alert"; anything else is
 * a polite role="status", so good news isn't read out as an error. The role
 * sits on the message alone, so the action's label isn't announced with it.
 */
export function Alert({
  tone = "danger",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const Icon = ICONS[tone];
  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-2 rounded-md px-4 py-3 text-sm",
        toneSoft[tone],
        toneText[tone],
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div role={tone === "danger" ? "alert" : "status"} className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        <div className={title ? "mt-0.5" : undefined}>{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
```

`frontend/components/ui/toggle-group.tsx`:

```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ToggleOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** For a label in another language than the page, e.g. 履歴書. */
  lang?: string;
}

/**
 * A row of pressable buttons that filters a list, like the language switcher:
 * a named group, and aria-pressed on each. It reports every click, including
 * on the pressed option, so a caller can treat that as "clear".
 */
export function ToggleGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: ToggleOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            lang={option.lang}
            aria-pressed={pressed}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
              // Pressed is a solid fill and heavier type, not only a colour.
              pressed
                ? "border-primary bg-primary font-semibold text-primary-foreground"
                : "border-input bg-card font-medium text-secondary-foreground hover:bg-secondary",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
```

`frontend/components/ui/tabs.tsx`:

```tsx
"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/** Radix tabs: tablist/tab/tabpanel roles, arrow keys, Home and End. */
export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("mb-6 flex gap-1 border-b", className)} {...props} />;
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        // The selected tab is marked by the seal underline, like the sidebar
        // and the Settings menu, and by its darker text.
        "-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none data-[state=active]:border-seal data-[state=active]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    />
  );
}
```

`frontend/components/ui/radio-card.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * One choice in a list of rich options (a resume, an interview type): a
 * native radio in a card, named by the card's content. Put a group of them in
 * a <fieldset> with a <legend>.
 */
export function RadioCard({
  name,
  value,
  checked,
  onChange,
  children,
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-secondary has-[:checked]:border-primary has-[:checked]:bg-secondary motion-reduce:transition-none",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
      />
      <div className="min-w-0 flex-1">{children}</div>
    </label>
  );
}
```

`frontend/components/ui/checkbox.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

/** A native checkbox in the app's colour. Label it with a <label> or aria-*. */
export const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      "h-4 w-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
Checkbox.displayName = "Checkbox";
```

`frontend/components/retry-button.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";

/**
 * "Try again" for a failed load. While it runs it is Button's loading state:
 * aria-disabled and aria-busy, never disabled, so keyboard focus stays on it.
 */
export function RetryButton({
  retrying,
  onRetry,
  size = "sm",
}: {
  retrying: boolean;
  onRetry: () => void;
  size?: "sm" | "md";
}) {
  const { lang } = useLang();
  return (
    <Button type="button" variant="secondary" size={size} loading={retrying} onClick={onRetry}>
      {t("common", retrying ? "retrying" : "tryAgain", lang)}
    </Button>
  );
}
```

`frontend/components/documents/document-status-badge.tsx`:

```tsx
"use client";

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { DOCUMENT_STATUS_TONE } from "@/lib/tones";
import type { DocumentStatus } from "@/types/api";

const LABEL_KEYS: Record<DocumentStatus, string> = {
  pending: "statusPending",
  processing: "statusProcessing",
  completed: "statusCompleted",
  failed: "statusFailed",
};

/** A generated document's status, shared by the Documents list and detail pages. */
export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const { lang } = useLang();
  return (
    <Badge variant={DOCUMENT_STATUS_TONE[status]}>
      {status === "processing" && (
        <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin motion-reduce:animate-none" />
      )}
      {t("documents", LABEL_KEYS[status], lang)}
    </Badge>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `cd frontend && npx vitest run tests/lib/tones.test.ts tests/components/ui.test.tsx`

Expected: PASS.

- [ ] **Step 7: Prove the tests bite**

Apply each change, run the two files, confirm the named test fails, and
restore:

| File | Change | Must fail |
|---|---|---|
| `lib/tones.ts` | `score >= bands.good` → `score > bands.good` | "reads a resume score of 81 as success" |
| `lib/tones.ts` | `processing: "info"` → `processing: "warning"` | "gives every document status its tone" |
| `components/ui/alert.tsx` | `tone === "danger" ? "alert" : "status"` → `"alert"` | "announces a success message politely…" |
| `components/ui/alert.tsx` | move `role=…` from the message `div` to the outer `div` | "…keeps its action out of the message" |
| `components/ui/toggle-group.tsx` | `aria-pressed={pressed}` → removed | "is a named group whose pressed button follows the value" |
| `components/ui/empty-state.tsx` | `<p className="mt-4 font-medium">` → `<h2 className="mt-4 font-medium">` (and its closing tag) | "shows its title, description and action…" |

- [ ] **Step 8: Gates and commit**

```bash
cd frontend && npm test && npm run lint && npm run type-check && npm run format:check
git add lib/tones.ts components/ui/empty-state.tsx components/ui/alert.tsx components/ui/toggle-group.tsx components/ui/tabs.tsx components/ui/radio-card.tsx components/ui/checkbox.tsx components/retry-button.tsx components/documents/document-status-badge.tsx tests/lib/tones.test.ts tests/components/ui.test.tsx
git commit -m "feat(ui): tones, EmptyState, Alert, ToggleGroup, Tabs, RadioCard, Checkbox

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The design guard

**Files:**
- Create: `frontend/tests/design-guard.test.ts`

**Interfaces:**
- **Produces:**
  - `ALLOWED` and `NOT_YET_MIGRATED`, the two lists every later task
    edits.
  - Rule names: `"palette" | "glyph" | "rawControl" | "h1"`.

- [ ] **Step 1: Write the guard**

Create `frontend/tests/design-guard.test.ts`:

```ts
// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Keeps the pages on the design system. Every .tsx file under app/ and
 * components/ (components/ui/ excepted: it is the design system) is scanned
 * for the four things the page migration removed. A file still waiting to be
 * migrated is listed in NOT_YET_MIGRATED; a permanent, reasoned exception is
 * listed in ALLOWED. Read as data, not imported, like tests/invariants.test.ts.
 */

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), "..");

type Rule = "palette" | "glyph" | "rawControl" | "h1";

const RULES: Record<Rule, RegExp> = {
  // A Tailwind palette colour instead of a token: text-green-600, bg-blue-100…
  palette:
    /\b(?:text|bg|border|ring|from|to|via|fill|stroke|divide|outline|placeholder|accent|decoration)-(?:red|green|blue|yellow|amber|orange|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|lime|gray|slate|zinc|neutral|stone)-\d{2,3}\b/,
  // An arrow, dingbat or emoji used as an icon: ← → ✓ ✕ 🏠 🤖 💬…
  glyph: /[\u2190-\u21FF\u2600-\u27BF\u{1F300}-\u{1FAFF}]/u,
  // A control built by hand instead of the form primitives. react-dropzone's
  // hidden file input is the one raw <input> allowed.
  rawControl: /<(?:input|select|textarea)\b(?!\s*\{\.\.\.getInputProps\(\)\}\s*\/>)/,
  // A page title outside PageHeader.
  h1: /<h1\b/,
};

/** Permanent exceptions. Each names the rules it may break and why. */
const ALLOWED: Record<string, { rules: Rule[]; reason: string }> = {
  "components/landing/landing-page.tsx": {
    rules: ["h1"],
    reason: "The landing hero is its own h1, outside the app shell.",
  },
  "components/error-fallback.tsx": {
    rules: ["h1"],
    reason: "A full-screen error state with its own layout.",
  },
  "components/not-found-content.tsx": {
    rules: ["h1"],
    reason: "A full-screen not-found state with its own layout.",
  },
};

/** Files the migration hasn't reached. Each area task deletes its own. */
const NOT_YET_MIGRATED: Record<string, string> = {
  // Task 3: Prepare
  "app/dashboard/resumes/page.tsx": "Prepare, task 3",
  "app/dashboard/resumes/[id]/page.tsx": "Prepare, task 3",
  "app/dashboard/documents/page.tsx": "Prepare, task 3",
  "app/dashboard/documents/[id]/page.tsx": "Prepare, task 3",
  "app/dashboard/documents/rirekisho/new/page.tsx": "Prepare, task 3",
  "app/dashboard/documents/shokumu/new/page.tsx": "Prepare, task 3",
  "components/documents/DocumentWizard.tsx": "Prepare, task 3",
  // Task 4: Apply
  "app/dashboard/interview/page.tsx": "Apply, task 4",
  "app/dashboard/interview/new/page.tsx": "Apply, task 4",
  "app/dashboard/interview/[id]/page.tsx": "Apply, task 4",
  "app/dashboard/jobs/translate/page.tsx": "Apply, task 4",
  // Task 5: Settle in
  "app/dashboard/visa/page.tsx": "Settle in, task 5",
  "app/dashboard/visa/[id]/page.tsx": "Settle in, task 5",
  "components/visa/visa-checklist.tsx": "Settle in, task 5",
  "components/visa/visa-option-card.tsx": "Settle in, task 5",
  "components/visa/visa-roadmap-switcher.tsx": "Settle in, task 5",
  "app/dashboard/culture/page.tsx": "Settle in, task 5",
  "app/dashboard/culture/[slug]/page.tsx": "Settle in, task 5",
  // Task 6: Onboarding
  "app/onboarding/page.tsx": "Onboarding, task 6",
  // Task 7: the rest
  "app/admin/page.tsx": "Admin, task 7",
  "components/chat-widget.tsx": "Chat widget, task 7",
  // Rebuilt by spec 3 (the job pipeline), not migrated here.
  "app/dashboard/jobs/page.tsx": "Rebuilt in spec 3",
  "app/dashboard/jobs/[id]/page.tsx": "Rebuilt in spec 3",
  "app/dashboard/jobs/applications/page.tsx": "Rebuilt in spec 3",
};

function sourceFiles(): string[] {
  const files: string[] = [];
  for (const dir of ["app", "components"]) {
    for (const entry of readdirSync(join(FRONTEND, dir), { recursive: true })) {
      const path = `${dir}/${String(entry).split("\\").join("/")}`;
      if (path.endsWith(".tsx") && !path.startsWith("components/ui/")) files.push(path);
    }
  }
  return files.sort();
}

/** Comments may say anything: "→" in a note is not an icon. URLs keep their //. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function violations(source: string): Rule[] {
  const code = stripComments(source);
  return (Object.keys(RULES) as Rule[]).filter((rule) => RULES[rule].test(code));
}

const read = (file: string) => readFileSync(join(FRONTEND, file), "utf8");
const FILES = sourceFiles();

describe("the design guard", () => {
  it("scans the app's source files", () => {
    // A guard that finds no files passes while checking nothing.
    expect(FILES.length).toBeGreaterThan(40);
    expect(FILES).toContain("app/dashboard/page.tsx");
  });

  it("catches each kind of violation, and ignores comments and the dropzone input", () => {
    expect(violations('<p className="text-green-600">x</p>')).toEqual(["palette"]);
    expect(violations("<span>🏠</span>")).toEqual(["glyph"]);
    expect(violations("<a>View →</a>")).toEqual(["glyph"]);
    expect(violations('<input type="text" />')).toEqual(["rawControl"]);
    expect(violations("<textarea rows={3} />")).toEqual(["rawControl"]);
    expect(violations("<h1>Title</h1>")).toEqual(["h1"]);
    expect(violations("<input {...getInputProps()} />")).toEqual([]);
    expect(violations("// a note → about text-red-500\n/* <h1> */")).toEqual([]);
    expect(violations('<a href="https://example.com">x</a>')).toEqual([]);
    // Tokens and CJK text are fine.
    expect(violations('<p lang="ja" className="bg-indigo-soft text-success">履歴書・職務経歴書</p>')).toEqual([]);
  });

  it.each(FILES.filter((file) => !(file in NOT_YET_MIGRATED)))(
    "%s is on the design system",
    (file) => {
      const allowed = ALLOWED[file]?.rules ?? [];
      expect(violations(read(file)).filter((rule) => !allowed.includes(rule))).toEqual([]);
    },
  );

  it.each(Object.keys(NOT_YET_MIGRATED))("%s still needs migrating", (file) => {
    // Once a file is clean its entry must go, so the list can't hide a
    // regression in a file everyone thinks is done.
    expect(violations(read(file)).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(ALLOWED))("%s still needs its exception", (file, { rules }) => {
    const found = violations(read(file));
    for (const rule of rules) expect(found).toContain(rule);
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd frontend && npx vitest run tests/design-guard.test.ts`

Expected: PASS. Every listed file still has a violation. Every other file
(Home, Settings, the shell, the landing page within its exception, the
uploaders) is clean.

If a file outside both lists fails, stop. Either it belongs in
`NOT_YET_MIGRATED` (add it, with the task that will fix it), or the regex
has a false positive (fix the regex and add the case to "catches each kind
of violation").

- [ ] **Step 3: Prove the guard bites**

For each row: apply the change, run the guard, confirm the named test
fails, and restore.

| Change | Must fail |
|---|---|
| In `components/settings/profile-card.tsx`, add `className="text-green-600"` to the first `<Field>`'s `Input` | "components/settings/profile-card.tsx is on the design system" |
| In `app/dashboard/page.tsx`, add `<span>→</span>` inside the returned JSX | "app/dashboard/page.tsx is on the design system" |
| In `components/settings/account-card.tsx`, add `<input type="text" />` inside the card | "components/settings/account-card.tsx is on the design system" |
| In `components/settings/settings-card.tsx`, change `<h2` to `<h1` (and its closing tag) | "components/settings/settings-card.tsx is on the design system" |
| In the guard, add `"app/dashboard/page.tsx": "x"` to `NOT_YET_MIGRATED` | "app/dashboard/page.tsx still needs migrating" |

- [ ] **Step 4: Gates and commit**

```bash
cd frontend && npm test && npm run lint && npm run type-check && npm run format:check
git add tests/design-guard.test.ts
git commit -m "test: a guard that keeps pages on the design system

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Prepare (Resumes and Documents)

**Files:**
- Modify:
  - `frontend/app/dashboard/resumes/page.tsx` and `frontend/app/dashboard/resumes/[id]/page.tsx`
  - `frontend/components/resume/ResumeUploader.tsx`
  - `frontend/app/dashboard/documents/page.tsx` and `frontend/app/dashboard/documents/[id]/page.tsx`
  - `frontend/app/dashboard/documents/rirekisho/new/page.tsx` and `frontend/app/dashboard/documents/shokumu/new/page.tsx`
  - `frontend/components/documents/DocumentWizard.tsx`
  - `frontend/lib/i18n.ts` (`documents` section)
  - `frontend/tests/design-guard.test.ts` (delete the seven Prepare entries)
  - `frontend/tests/app/new-document.test.tsx`
- Create: `frontend/tests/app/resumes-list.test.tsx`, `frontend/tests/app/documents-list.test.tsx`

**Interfaces:**
- **Consumes, from Task 1:**
  - `Alert`, `EmptyState`, `ToggleGroup` and `RadioCard`
  - `RetryButton` and `DocumentStatusBadge`
  - `scoreTone`, `RESUME_SCORE_BANDS`, `toneText` and `toneFill`
- **Consumes, existing:**
  - `PageHeader`, `Card`, `Button`, `Badge`, `Skeleton`, `Field`, `Input`,
    `SegmentedControl` and `Breadcrumbs`
  - `missingFieldLabel` (`lib/rirekisho-completeness`)
- **Produces:** nothing new for later tasks.

**Fix included:** the 履歴書 page's "Go to Settings" link points at
`/dashboard/settings#rirekisho-info`, an anchor the new Settings page
doesn't have. It becomes `/dashboard/settings#profile`. Its list of missing
fields shows the backend's English `label`; it becomes
`missingFieldLabel(f.key, lang)`, in the reader's language.

- [ ] **Step 1: Strings**

In `lib/i18n.ts`'s `documents` section, add:

```ts
    filterLabel: { en: "Filter by type", id: "Filter menurut jenis", ja: "種類で絞り込む" },
    wizJobIdLabel: { en: "Job posting ID", id: "ID lowongan", ja: "求人ID" },
```

- [ ] **Step 2: Write the failing list-page tests**

Create `frontend/tests/app/resumes-list.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, type RenderResult } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";

const resumes = vi.hoisted(() => ({ current: {} as Record<string, unknown>, refetches: 0 }));

vi.mock("@/hooks/useResumes", () => ({
  useResumes: () => resumes.current,
  useDeleteResume: () => ({ mutate: () => {}, isPending: false }),
  useSetPrimaryResume: () => ({ mutate: () => {}, isPending: false }),
}));
// Pulls in react-dropzone and the upload hook; the list doesn't depend on it.
vi.mock("@/components/resume/ResumeUploader", () => ({ ResumeUploader: () => null }));
vi.mock("@/components/confirm-dialog-provider", () => ({
  useConfirm: () => () => Promise.resolve(false),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));

const ResumesPage = (await import("@/app/dashboard/resumes/page")).default;

const LANG = "ja";
const r = (key: Parameters<typeof t>[1]) => t("resumes", key, LANG);

function query(over: Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: () => {
      resumes.refetches += 1;
      return Promise.resolve();
    },
    ...over,
  };
}

async function renderPage(over: Record<string, unknown>): Promise<RenderResult> {
  resumes.current = query(over);
  let view: RenderResult | null = null;
  await act(async () => {
    view = renderIn(LANG, <ResumesPage />);
  });
  return view as unknown as RenderResult;
}

const RESUME = {
  id: "r1",
  file_name: "cv.pdf",
  file_size_bytes: 2048,
  mime_type: "application/pdf",
  is_primary: true,
  created_at: "2026-09-01T00:00:00Z",
};

beforeEach(() => {
  resumes.refetches = 0;
});

describe("the resumes list", () => {
  it("is titled under Prepare", async () => {
    await renderPage({ data: { items: [], total: 0 } });
    expect(screen.getByRole("heading", { level: 1, name: r("title") })).toBeInTheDocument();
    expect(screen.getByText(t("nav", "groupPrepare", LANG))).toBeInTheDocument();
  });

  it("shows a skeleton while loading", async () => {
    const { container } = await renderPage({ isLoading: true });
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("says so when there are no resumes", async () => {
    await renderPage({ data: { items: [], total: 0 } });
    expect(screen.getByText(r("noResumes"))).toBeInTheDocument();
  });

  it("explains a failed load, and retries it", async () => {
    await renderPage({ error: new ApiClientError(500, "boom") });
    expect(screen.getByRole("alert")).toHaveTextContent(r("loadError"));
    fireEvent.click(screen.getByRole("button", { name: t("common", "tryAgain", LANG) }));
    expect(resumes.refetches).toBe(1);
  });

  it("marks the primary resume", async () => {
    await renderPage({ data: { items: [RESUME], total: 1 } });
    expect(screen.getByText(t("common", "primary", LANG))).toBeInTheDocument();
  });
});
```

Create `frontend/tests/app/documents-list.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";

const docs = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  filters: [] as Array<string | undefined>,
  refetches: 0,
}));

vi.mock("@/hooks/useDocuments", () => ({
  useDocuments: (type?: string) => {
    docs.filters.push(type);
    return docs.current;
  },
  useDeleteDocument: () => ({ mutate: () => {}, isPending: false }),
}));
vi.mock("@/components/confirm-dialog-provider", () => ({
  useConfirm: () => () => Promise.resolve(false),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));

const DocumentsPage = (await import("@/app/dashboard/documents/page")).default;

const LANG = "ja";
const d = (key: Parameters<typeof t>[1]) => t("documents", key, LANG);

function query(over: Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: () => {
      docs.refetches += 1;
      return Promise.resolve();
    },
    ...over,
  };
}

async function renderPage(over: Record<string, unknown>) {
  docs.current = query(over);
  await act(async () => {
    renderIn(LANG, <DocumentsPage />);
  });
}

const DOC = {
  id: "d1",
  document_type: "rirekisho",
  status: "processing",
  created_at: "2026-09-01T00:00:00Z",
};

beforeEach(() => {
  docs.filters = [];
  docs.refetches = 0;
});

describe("the documents list", () => {
  it("is titled under Prepare", async () => {
    await renderPage({ data: { items: [], total: 0 } });
    expect(screen.getByRole("heading", { level: 1, name: d("title") })).toBeInTheDocument();
    expect(screen.getByText(t("nav", "groupPrepare", LANG))).toBeInTheDocument();
  });

  it("filters by type from a pressed-button group", async () => {
    await renderPage({ data: { items: [], total: 0 } });
    const group = screen.getByRole("group", { name: d("filterLabel") });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: d("all") })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "履歴書" }));
    expect(screen.getByRole("button", { name: "履歴書" })).toHaveAttribute("aria-pressed", "true");
    expect(docs.filters.at(-1)).toBe("rirekisho");
  });

  it("says so when there are no documents, with links to make one", async () => {
    await renderPage({ data: { items: [], total: 0 } });
    expect(screen.getByText(d("noDocuments"))).toBeInTheDocument();
    // The header's two buttons and the empty state's two links.
    expect(screen.getAllByRole("link", { name: /履歴書/ }).length).toBeGreaterThanOrEqual(2);
  });

  it("explains a failed load, and retries it", async () => {
    await renderPage({ error: new ApiClientError(500, "boom") });
    expect(screen.getByRole("alert")).toHaveTextContent(d("loadError"));
    fireEvent.click(screen.getByRole("button", { name: t("common", "tryAgain", LANG) }));
    expect(docs.refetches).toBe(1);
  });

  it("shows each document's status", async () => {
    await renderPage({ data: { items: [DOC], total: 1 } });
    expect(screen.getByText(d("statusProcessing"))).toBeInTheDocument();
  });
});
```

In `frontend/tests/app/new-document.test.tsx`, make `useMe` controllable,
then add a describe for the 履歴書 page's profile states:

```tsx
// replaces the existing vi.mock("@/hooks/useMe", …)
const me = vi.hoisted(() => ({ current: {} as Record<string, unknown>, refetches: 0 }));
vi.mock("@/hooks/useMe", () => ({ useMe: () => me.current }));
```

In `beforeEach`, add:

```tsx
  me.refetches = 0;
  me.current = {
    data: { rirekisho_ready: true, rirekisho_missing_fields: [] },
    isLoading: false,
    isFetching: false,
    refetch: () => {
      me.refetches += 1;
      return Promise.resolve();
    },
  };
```

Append:

```tsx
describe("the new 履歴書 page, before the profile is ready", () => {
  it("lists what is missing in the reader's language, and links to the profile", async () => {
    me.current = {
      ...me.current,
      data: {
        rirekisho_ready: false,
        rirekisho_missing_fields: [{ key: "phone_number", label: "Phone number" }],
      },
    };
    await act(async () => {
      renderIn(LANG, <Rirekisho />);
    });
    expect(screen.getByText(t("settings", "phone", LANG))).toBeInTheDocument();
    expect(screen.queryByText("Phone number")).not.toBeInTheDocument();
    // The Settings page's cards are #profile, #visa, …; #rirekisho-info is gone.
    expect(screen.getByRole("link", { name: d("goToSettings") })).toHaveAttribute(
      "href",
      "/dashboard/settings#profile",
    );
  });

  it("explains a profile that can't be loaded, and retries it", async () => {
    me.current = { ...me.current, data: undefined };
    await act(async () => {
      renderIn(LANG, <Rirekisho />);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(d("profileLoadError"));
    fireEvent.click(screen.getByRole("button", { name: t("common", "tryAgain", LANG) }));
    expect(me.refetches).toBe(1);
  });
});
```

Run: `cd frontend && npx vitest run tests/app/resumes-list.test.tsx tests/app/documents-list.test.tsx tests/app/new-document.test.tsx`

Expected: the new tests FAIL. There is no eyebrow, no `group`, no Retry, a
`/dashboard/settings#rirekisho-info` href, and the English label. The three
existing new-document tests still PASS.

- [ ] **Step 3: Migrate the Resumes list**

Replace the default export and helpers of `app/dashboard/resumes/page.tsx`,
from `export default function ResumesPage` to the end of the file. Keep
`ResumeCard`'s handlers (`handleSetPrimary`, `handleDelete`) exactly as
they are, and replace only its returned JSX:

```tsx
export default function ResumesPage() {
  const { data, isLoading, isFetching, error, refetch } = useResumes();
  const { lang } = useLang();

  return (
    <>
      <PageHeader
        eyebrow={t("nav", "groupPrepare", lang)}
        title={t("resumes", "title", lang)}
        description={t("resumes", "sub", lang)}
      />
      <div className="space-y-8">
        <ResumeUploader />

        <section aria-labelledby="your-resumes" className="space-y-4">
          <h2 id="your-resumes" className="text-base font-semibold">
            {t("resumes", "yourResumes", lang)}
          </h2>

          {isLoading && <ResumesSkeleton />}

          {error && (
            <Alert
              action={<RetryButton retrying={isFetching} onRetry={() => void refetch()} />}
            >
              {t("resumes", "loadError", lang)}
            </Alert>
          )}

          {data && data.items.length === 0 && !isLoading && (
            <EmptyState icon={FileText} title={t("resumes", "noResumes", lang)} />
          )}

          {data && data.items.length > 0 && (
            <ul className="space-y-3">
              {data.items.map((resume) => (
                <ResumeCard key={resume.id} resume={resume} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
```

`ResumeCard`'s JSX:

```tsx
  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4">
      <div className="flex min-w-0 items-center gap-3">
        <FileIcon mime={resume.mime_type} />
        <div className="min-w-0">
          <Link
            href={`/dashboard/resumes/${resume.id}` as Route}
            className="truncate text-sm font-medium hover:underline"
          >
            {resume.file_name}
          </Link>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {fileSizeKB} KB · {uploadedAt}
            </span>
            {resume.is_primary && <Badge variant="info">{t("common", "primary", lang)}</Badge>}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {!resume.is_primary && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSetPrimary}
            loading={setPrimaryMutation.isPending}
          >
            {t("resumes", "setPrimary", lang)}
          </Button>
        )}
        <Button asChild variant="ghost" size="sm">
          <Link href={`/dashboard/resumes/${resume.id}` as Route}>{t("common", "view", lang)}</Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleDelete()}
          loading={deleteMutation.isPending}
          className="text-destructive hover:text-destructive"
        >
          {t("common", "delete", lang)}
        </Button>
      </div>
    </li>
  );
```

`FileIcon` stays. `ResumesSkeleton`:

```tsx
function ResumesSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-lg" />
      ))}
    </div>
  );
}
```

Imports to add:
- `import type { Route } from "next";`
- `import { FileText } from "lucide-react";`
- `import { Alert } from "@/components/ui/alert";`
- `import { Badge } from "@/components/ui/badge";`
- `import { Button } from "@/components/ui/button";`
- `import { EmptyState } from "@/components/ui/empty-state";`
- `import { PageHeader } from "@/components/ui/page-header";`
- `import { Skeleton } from "@/components/ui/skeleton";`
- `import { RetryButton } from "@/components/retry-button";`

- [ ] **Step 4: Migrate `ResumeUploader`**

In `components/resume/ResumeUploader.tsx`:

- Replace `<UploadIcon />` with
  `<Upload aria-hidden="true" className="h-10 w-10 text-muted-foreground" />`,
  and delete the `UploadIcon` function.
- Replace the dropzone's `<button …>` with the following. The hidden
  `<input {...getInputProps()} />` stays: the guard allows it.

  ```tsx
  <Button type="button" className="mt-4" loading={uploadMutation.isPending}>
    {uploadMutation.isPending ? t("resumes", "uploading", lang) : t("resumes", "chooseFile", lang)}
  </Button>
  ```

- Replace the error `<p role="alert" …>` with
  `<Alert>{displayError}</Alert>`.
- Imports: `Upload` from `lucide-react`, `Alert` and `Button`.

- [ ] **Step 5: Migrate Resume detail**

In `app/dashboard/resumes/[id]/page.tsx`:

1. **Not found**: replace
   `<p className="text-sm text-destructive">{t("resumes", "notFound", lang)}</p>`
   with `<Alert>{t("resumes", "notFound", lang)}</Alert>`.
2. **Meta card to header**: replace the `{/* Resume meta */}` card
   (`<div className="rounded-lg border bg-card p-6">…</div>`) with:

   ```tsx
      <PageHeader
        title={resume.file_name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {fileSizeKB} KB · {t("resumes", "uploaded", lang)} {uploadedAt}
            </span>
            {resume.is_primary && <Badge variant="info">{t("common", "primary", lang)}</Badge>}
          </span>
        }
        actions={
          resume.download_url ? (
            <Button asChild variant="secondary">
              <a href={resume.download_url} download>
                {t("common", "download", lang)}
              </a>
            </Button>
          ) : undefined
        }
      />
   ```

   The page root stays
   `<div className="space-y-8">`, with the `Breadcrumbs` first, then
   `PageHeader`, then the analysis `<section>`. Pass `className="mb-0"` to
   the `PageHeader`, since it is inside `space-y-8`.
3. **Analyse button**:

   ```tsx
            <Button onClick={handleAnalyze} loading={analyzeMutation.isPending}>
              {analyzeMutation.isPending
                ? t("resumes", "queueing", lang)
                : failed
                  ? t("common", "tryAgain", lang)
                  : t("resumes", "analyseBtn", lang)}
            </Button>
   ```

4. **The two "analysing" boxes**: both `<div className="rounded-lg border bg-card p-6 …">`
   boxes with a spinner become:

   ```tsx
          <Card className="flex flex-col items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin motion-reduce:animate-none" />
            {t("resumes", "analysing", lang)}
          </Card>
   ```

5. **Alerts**:
   - `analysisError` becomes `<Alert>{t("resumes", "analysisLoadError", lang)}</Alert>`.
   - `failed` becomes
     `<Alert>{t("resumes", failureMessageKey(analysisStatus.error_code), lang)}</Alert>`.
   - The `statusError` block (its `<div>`, `<p>` and `<button>`) becomes:

     ```tsx
          <Alert
            key={statusErrorCount}
            action={<RetryButton retrying={checkingStatus} onRetry={() => refetchStatus()} />}
          >
            {t("resumes", "analysisStatusError", lang)}
          </Alert>
     ```

6. **`AnalysisCard`**:
   - The outer `<div className="animate-fade-in space-y-6 rounded-lg border bg-card p-6">`
     becomes `<Card className="animate-fade-in space-y-6 p-6">`.
   - `scoreColor` becomes
     `const scoreColor = toneText[scoreTone(score, RESUME_SCORE_BANDS)];`.
7. **`AnalysisSection`**: `dot` becomes

   ```tsx
  const dot = toneFill[variant === "positive" ? "success" : variant === "negative" ? "danger" : "info"];
   ```

   and the dot span gets `aria-hidden="true"`.
8. **`PageSkeleton`**:

   ```tsx
function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
   ```

Imports to add:
- `Loader2` from `lucide-react`
- `Alert`, `Badge`, `Button`, `Card`, `PageHeader` and `Skeleton`
- `RetryButton`
- `RESUME_SCORE_BANDS`, `scoreTone`, `toneFill` and `toneText` from
  `@/lib/tones`

- [ ] **Step 6: Migrate the Documents list**

Replace `DocumentsPage`'s return in `app/dashboard/documents/page.tsx`. Keep
the component's first line, but take `isFetching` and `refetch` from
`useDocuments` as well:

```tsx
  const { data, isLoading, isFetching, error, refetch } = useDocuments(
    filter === "all" ? undefined : filter,
  );
  const { lang } = useLang();

  return (
    <>
      <PageHeader
        eyebrow={t("nav", "groupPrepare", lang)}
        title={t("documents", "title", lang)}
        description={t("documents", "sub", lang)}
        actions={
          <>
            <Button asChild>
              <Link href="/dashboard/documents/rirekisho/new" lang="ja">
                <Plus aria-hidden="true" />
                履歴書
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/dashboard/documents/shokumu/new" lang="ja">
                <Plus aria-hidden="true" />
                職務経歴書
              </Link>
            </Button>
          </>
        }
      />
      <div className="space-y-6">
        <ToggleGroup<DocumentType | "all">
          label={t("documents", "filterLabel", lang)}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("documents", "all", lang) },
            { value: "rirekisho", label: "履歴書", lang: "ja" },
            { value: "shokumukeirekisho", label: "職務経歴書", lang: "ja" },
          ]}
        />

        {isLoading && <DocumentsSkeleton />}

        {error && (
          <Alert action={<RetryButton retrying={isFetching} onRetry={() => void refetch()} />}>
            {t("documents", "loadError", lang)}
          </Alert>
        )}

        {data && data.items.length === 0 && !isLoading && (
          <EmptyState
            icon={Files}
            title={t("documents", "noDocuments", lang)}
            description={
              <>
                {t("documents", "generateA", lang)}{" "}
                <Link
                  href="/dashboard/documents/rirekisho/new"
                  lang="ja"
                  className="text-indigo underline underline-offset-2 hover:no-underline"
                >
                  履歴書
                </Link>{" "}
                {t("documents", "orLabel", lang)}{" "}
                <Link
                  href="/dashboard/documents/shokumu/new"
                  lang="ja"
                  className="text-indigo underline underline-offset-2 hover:no-underline"
                >
                  職務経歴書
                </Link>{" "}
                {t("documents", "toGetStarted", lang)}
              </>
            }
          />
        )}

        {data && data.items.length > 0 && (
          <ul className="space-y-3">
            {data.items.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
```

In `DocumentCard`'s JSX:
- Replace `<StatusBadge status={doc.status} />` with
  `<DocumentStatusBadge status={doc.status} />`.
- The "View →" link becomes:

  ```tsx
        <Button asChild variant="ghost" size="sm">
          <Link href={`/dashboard/documents/${doc.id}` as Route}>
            {t("common", "view", lang)}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
  ```

- The delete `<button>` becomes
  `<Button variant="ghost" size="sm" onClick={() => void handleDelete()} loading={deleteMutation.isPending} className="text-destructive hover:text-destructive">`.
- Delete the local `StatusBadge`.

`DocumentsSkeleton` uses `Skeleton` with 3 rows, like `ResumesSkeleton`.

Imports: `Route`, `ArrowRight`, `Files`, `Plus`, `Alert`, `Button`,
`EmptyState`, `PageHeader`, `Skeleton`, `ToggleGroup`, `RetryButton` and
`DocumentStatusBadge`. Remove `DocumentStatus`.

- [ ] **Step 7: Migrate Documents detail**

In `app/dashboard/documents/[id]/page.tsx`:

1. **No-status branch**:
   - The 404 `<p>` becomes `<Alert>{t("documents", "notFound", lang)}</Alert>`.
   - The retryable block becomes:

     ```tsx
          <Alert key={errorCount} action={<RetryButton retrying={isChecking} onRetry={recheck} />}>
            {t("documents", "statusLoadError", lang)}
          </Alert>
     ```

2. **`pollError` block**: the same shape, with `statusPollError`.
3. **Main card**: replace the whole
   `<div className="space-y-6 rounded-lg border bg-card p-6">…</div>` with:

   ```tsx
      <PageHeader
        className="mb-0"
        title={t("documents", "statusHeading", lang)}
        actions={<DocumentStatusBadge status={statusData.status} />}
      />
      <Card className="p-6">
        <StatusBody … />   {/* same props as today */}
      </Card>
   ```

4. **`StatusBody`**:
   - **pending/processing**: the spinner becomes
     `<Loader2 aria-hidden="true" className="h-10 w-10 animate-spin text-muted-foreground motion-reduce:animate-none" />`.
   - **failed**: the red box becomes

     ```tsx
        <Alert title={t("documents", "genFailed", lang)}>
          {t("documents", failureMessageKey(errorCode), lang)}
        </Alert>
     ```

     Its two links become `<Button asChild>` (Go to Settings) and
     `<Button asChild variant="secondary">` (Back to documents), each around
     its `Link`.
   - **completed**: the green box becomes:

     ```tsx
      <Alert tone="success">
        {t("documents", "genSuccess", lang)}
        {completedAt && (
          <span className="ml-1">
            {t("documents", "on", lang)}{" "}
            {new Date(completedAt).toLocaleString(lang, {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </Alert>
     ```

     The download `<a>` becomes
     `<Button asChild className="w-full"><a href={downloadUrl} download>{t("documents", "downloadPdf", lang)}</a></Button>`.
     The link error becomes
     `<Alert key={downloadErrorCount} action={<RetryButton retrying={retryingDownload} onRetry={onRetryDownload} />}>{t("documents", "linkError", lang)}</Alert>`.
     The "preparing link" spinner becomes `Loader2` at `h-4 w-4`.
5. **Local helpers**: delete the local `RetryButton` and `StatusBadge`
   functions.
6. **`PageSkeleton`**: two `Skeleton`s, `h-4 w-24` and `h-48 rounded-lg`,
   inside `mx-auto max-w-lg space-y-6`.

Imports: `Loader2`, `Alert`, `Button`, `Card`, `PageHeader`, `Skeleton`,
`RetryButton` and `DocumentStatusBadge`. Remove `DocumentStatus` if unused.

- [ ] **Step 8: Migrate the two new-document pages**

`app/dashboard/documents/rirekisho/new/page.tsx`:

1. **Header**: replace the header `<div>` (the back link, `<h1>` and `<p>`)
   with:

   ```tsx
      <Breadcrumbs
        items={[
          { label: t("documents", "title", lang), href: "/dashboard/documents" },
          { label: t("documents", "generateRirekisho", lang) },
        ]}
      />
      <PageHeader
        className="mb-0"
        title={t("documents", "generateRirekisho", lang)}
        description={t("documents", "rirekishoSub", lang)}
      />
   ```

   The root stays `<div className="mx-auto max-w-lg space-y-8">`, and the
   `Breadcrumbs`' `mb-2` sits inside it.
2. **`useMe`**: also take `refetch` and `isFetching`:
   `const { data: me, isLoading: meLoading, isFetching: meFetching, refetch: refetchMe } = useMe();`.
3. **`loading`**:

   ```tsx
        <Card className="space-y-4 p-6">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-9 w-32" />
        </Card>
   ```

4. **`error`**:

   ```tsx
        <Alert
          action={<RetryButton retrying={meFetching} onRetry={() => void refetchMe()} />}
        >
          {t("documents", "profileLoadError", lang)}
        </Alert>
   ```

5. **`incomplete`**:

   ```tsx
        <Card className="space-y-4 p-6">
          <p className="text-sm font-medium">{t("documents", "profileIncompleteTitle", lang)}</p>
          <p className="text-sm text-muted-foreground">
            {t("documents", "profileIncompleteHint", lang)}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {me.rirekisho_missing_fields.map((f) => (
              <li key={f.key}>{missingFieldLabel(f.key, lang)}</li>
            ))}
          </ul>
          <Button asChild>
            <Link href="/dashboard/settings#profile">{t("documents", "goToSettings", lang)}</Link>
          </Button>
        </Card>
   ```

`app/dashboard/documents/shokumu/new/page.tsx` gets the same header change,
with `generateShokumu` and `shokumuSub`.

Imports: `Breadcrumbs`, `PageHeader`, `Card`, `Skeleton`, `Alert`, `Button`
and `RetryButton`, plus `missingFieldLabel` from
`@/lib/rirekisho-completeness` for the 履歴書 page.

- [ ] **Step 9: Migrate `DocumentWizard`**

In `components/documents/DocumentWizard.tsx`:

1. **Step 1, no resumes**: the empty case becomes:

   ```tsx
          <EmptyState
            icon={FileText}
            title={t("documents", "wizNoResumes", lang)}
            action={
              <Button asChild variant="secondary">
                <Link href="/dashboard/resumes">{t("documents", "wizUploadFirst", lang)}</Link>
              </Button>
            }
          />
   ```

2. **Step 1, the resume list**: it becomes a radio group of cards:

   ```tsx
          <fieldset>
            <legend className="sr-only">{t("documents", "wizStep1Title", lang)}</legend>
            <ul className="space-y-2">
              {resumes.map((r) => (
                <li key={r.id}>
                  <RadioCard
                    name="resume"
                    value={r.id}
                    checked={resumeId === r.id}
                    onChange={() => setResumeId(r.id)}
                  >
                    <p className="truncate text-sm font-medium">{r.file_name}</p>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {Math.round(r.file_size_bytes / 1024)} KB ·{" "}
                        {t("documents", "wizUploaded", lang)}{" "}
                        {new Date(r.created_at).toLocaleDateString(lang, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      {r.is_primary && (
                        <Badge variant="info">{t("documents", "wizPrimary", lang)}</Badge>
                      )}
                    </p>
                  </RadioCard>
                </li>
              ))}
            </ul>
          </fieldset>
   ```

3. **Step 2, the job ID**: it becomes a labelled field:

   ```tsx
        <Field
          label={t("documents", "wizJobIdLabel", lang)}
          optionalLabel={t("common", "optional", lang)}
          error={jobIdInvalid ? t("documents", "wizJobIdInvalid", lang) : undefined}
        >
          <Input
            value={jobPostingId}
            onChange={(e) => setJobPostingId(e.target.value)}
            placeholder={t("documents", "wizJobIdPlaceholder", lang)}
          />
        </Field>
   ```

   Delete the separate `jobIdInvalid` `<p>`: `Field` shows the error and
   sets `aria-invalid`.
4. **Step 2, orientation**:

   ```tsx
        {showOrientation && (
          <SegmentedControl<DocumentOrientation>
            legend={t("documents", "wizOrientationLabel", lang)}
            name="orientation"
            value={orientation}
            onChange={setOrientation}
            options={[
              { value: "portrait", label: t("documents", "wizOrientationPortrait", lang) },
              { value: "landscape", label: t("documents", "wizOrientationLandscape", lang) },
            ]}
          />
        )}
   ```

5. **Buttons**: every `<button>` becomes `Button`.
   - Next: `<Button onClick={…} disabled={…}>`.
   - Back: `<Button variant="secondary" …>`.
   - Submit:

     ```tsx
        <Button
          onClick={() =>
            onSubmit(resumeId, jobPostingId || undefined, showOrientation ? orientation : undefined)
          }
          loading={isPending}
        >
          {isPending ? t("documents", "wizQueuing", lang) : submitLabel}
        </Button>
     ```

6. **Step 3**:
   - The summary box becomes `<Card className="space-y-2 p-4 text-sm">`.
   - The error `<p role="alert">` becomes `<Alert>{error}</Alert>`.
7. **`ResumesSkeleton`**: uses `Skeleton` (`h-16 rounded-lg`, 2 rows).

Imports: `FileText`, `Alert`, `Badge`, `Button`, `Card`, `EmptyState`,
`Field`, `Input`, `RadioCard`, `SegmentedControl` and `Skeleton`.

- [ ] **Step 10: Update the guard**

In `tests/design-guard.test.ts`, delete the seven `// Task 3: Prepare`
entries from `NOT_YET_MIGRATED`, along with their comment line.

- [ ] **Step 11: Run the tests**

Run: `cd frontend && npx vitest run tests/app/resumes-list.test.tsx tests/app/documents-list.test.tsx tests/app/new-document.test.tsx tests/app/resume-detail.test.tsx tests/app/documents-detail.test.tsx tests/design-guard.test.ts`

Expected: PASS.

If an existing assertion in `resume-detail` or `documents-detail` fails,
check it against the recipe:
- **Change the test** only when the markup legitimately changed. For
  example, the Analyse button is now `aria-busy` rather than `disabled`
  while queueing.
- **Otherwise the migration broke behaviour**: fix the page.

- [ ] **Step 12: Prove the key behaviours are guarded**

Apply each change, run the file, confirm it fails, and restore:

| File | Change | Must fail |
|---|---|---|
| `app/dashboard/resumes/page.tsx` | `onRetry={() => void refetch()}` → `onRetry={() => {}}` | resumes-list "explains a failed load, and retries it" |
| `app/dashboard/documents/page.tsx` | `onChange={setFilter}` → `onChange={() => {}}` | documents-list "filters by type…" |
| `app/dashboard/documents/rirekisho/new/page.tsx` | `missingFieldLabel(f.key, lang)` → `f.label` | new-document "lists what is missing in the reader's language…" |
| `app/dashboard/documents/rirekisho/new/page.tsx` | `#profile` → `#rirekisho-info` | the same test |
| `app/dashboard/resumes/page.tsx` | revert the `PageHeader` to a plain `<h1>` | the guard's "app/dashboard/resumes/page.tsx is on the design system" |

- [ ] **Step 13: Gates, browser check and commit**

```bash
cd frontend && npm test && npm run lint && npm run type-check && npm run format:check
```

In the browser (desktop and 375px), check:
- Resumes, Resume detail, Documents (try the filter), Documents detail, and
  both new-document wizards.
- Each page in 日本語 and Indonesian.
- A keyboard pass through the wizard's radio cards and segmented control.

```bash
git add lib/i18n.ts app/dashboard/resumes app/dashboard/documents components/resume/ResumeUploader.tsx components/documents/DocumentWizard.tsx tests/app/resumes-list.test.tsx tests/app/documents-list.test.tsx tests/app/new-document.test.tsx tests/app/resume-detail.test.tsx tests/app/documents-detail.test.tsx tests/design-guard.test.ts
git commit -m "feat(prepare): Resumes and Documents on the design system

Also points the 履歴書 page's Settings link at #profile (the old anchor is
gone) and names the missing fields in the reader's language.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Apply (Interview and the translate tool)

**Files:**
- Modify:
  - `frontend/app/dashboard/interview/page.tsx`
  - `frontend/app/dashboard/interview/new/page.tsx`
  - `frontend/app/dashboard/interview/[id]/page.tsx`
  - `frontend/app/dashboard/jobs/translate/page.tsx`
  - `frontend/lib/i18n.ts` (`interview` section)
  - `frontend/tests/design-guard.test.ts`
  - `frontend/tests/app/interview-session.test.tsx`, only if an assertion
    legitimately changes
- Create: `frontend/tests/app/interview-list.test.tsx`,
  `frontend/tests/app/interview-new.test.tsx`

**Interfaces:**
- **Consumes, from Task 1:**
  - `Alert`, `EmptyState`, `RadioCard` and `RetryButton`
  - `scoreTone`, `INTERVIEW_SCORE_BANDS`, `SESSION_STATUS_TONE`, `toneText`
    and `toneFill`
- **Consumes, existing:** `PageHeader`, `Breadcrumbs`, `Card`, `Button`,
  `Badge`, `Skeleton`, `Field`, `Input`, `Select` and `Textarea`.
- **Produces:** a new `ALLOWED` entry in the guard, for the session page's
  compact `<h1>`.

**Fix included:** the new-session page's role and company boxes have only a
placeholder, and no label. Each gets a real `Field` label.

- [ ] **Step 1: Strings**

In `lib/i18n.ts`'s `interview` section, add:

```ts
    roleLabel: { en: "Target role", id: "Peran target", ja: "希望職種" },
    companyLabel: { en: "Target company", id: "Perusahaan target", ja: "希望企業" },
```

- [ ] **Step 2: Write the failing tests**

Create `frontend/tests/app/interview-list.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";

const sessions = vi.hoisted(() => ({ current: {} as Record<string, unknown>, refetches: 0 }));
vi.mock("@/hooks/useInterview", () => ({ useInterviewSessions: () => sessions.current }));

const InterviewPage = (await import("@/app/dashboard/interview/page")).default;

const LANG = "ja";
const iv = (key: Parameters<typeof t>[1]) => t("interview", key, LANG);

async function renderPage(over: Record<string, unknown>) {
  sessions.current = {
    data: undefined,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: () => {
      sessions.refetches += 1;
      return Promise.resolve();
    },
    ...over,
  };
  await act(async () => {
    renderIn(LANG, <InterviewPage />);
  });
}

const SESSION = {
  id: "s1",
  session_type: "general",
  language: "ja",
  status: "completed",
  target_role: null,
  target_company: null,
  overall_score: 82,
  feedback_summary: null,
  completed_at: "2026-09-01T00:00:00Z",
  created_at: "2026-09-01T00:00:00Z",
};

beforeEach(() => {
  sessions.refetches = 0;
});

describe("the interview list", () => {
  it("is titled under Apply, with a way to start a session", async () => {
    await renderPage({ data: [] });
    expect(screen.getByRole("heading", { level: 1, name: iv("title") })).toBeInTheDocument();
    expect(screen.getByText(t("nav", "groupApply", LANG))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: iv("newSession") })).toHaveAttribute(
      "href",
      "/dashboard/interview/new",
    );
  });

  it("offers a first session when there are none", async () => {
    await renderPage({ data: [] });
    expect(screen.getByText(iv("noSessions"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: iv("startFirst") })).toHaveAttribute(
      "href",
      "/dashboard/interview/new",
    );
  });

  it("explains a failed load, and retries it", async () => {
    await renderPage({ error: new ApiClientError(500, "boom") });
    expect(screen.getByRole("alert")).toHaveTextContent(iv("loadError"));
    fireEvent.click(screen.getByRole("button", { name: t("common", "tryAgain", LANG) }));
    expect(sessions.refetches).toBe(1);
  });

  it("colours a good score as good", async () => {
    await renderPage({ data: [SESSION] });
    expect(screen.getByText("82")).toHaveClass("text-success");
  });
});
```

Create `frontend/tests/app/interview-new.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderIn } from "../helpers";
import { t } from "@/lib/i18n";

const interview = vi.hoisted(() => ({ created: [] as unknown[] }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
// Only useInterview is replaced; streamErrorMessage stays the real one.
vi.mock("@/hooks/useInterview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useInterview")>()),
  useInterview: () => ({
    sessionId: null,
    state: { isStreaming: false, error: null },
    createSession: (request: unknown) => interview.created.push(request),
  }),
}));

const NewInterviewPage = (await import("@/app/dashboard/interview/new/page")).default;

const LANG = "ja";
const iv = (key: Parameters<typeof t>[1]) => t("interview", key, LANG);

async function renderPage() {
  await act(async () => {
    renderIn(LANG, <NewInterviewPage />);
  });
}

beforeEach(() => {
  interview.created = [];
});

describe("the new interview session page", () => {
  it("labels every field", async () => {
    await renderPage();
    expect(screen.getByRole("group", { name: iv("interviewType") })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: iv("interviewLang") })).toBeInTheDocument();
    // These had only placeholders before.
    expect(screen.getByRole("textbox", { name: new RegExp(iv("roleLabel")) })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: new RegExp(iv("companyLabel")) }),
    ).toBeInTheDocument();
  });

  it("picks an interview type from its card", async () => {
    await renderPage();
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1] as HTMLElement);
    expect(radios[1]).toBeChecked();
  });

  it("starts the session with the role typed into its labelled box", async () => {
    await renderPage();
    fireEvent.change(screen.getByRole("textbox", { name: new RegExp(iv("roleLabel")) }), {
      target: { value: "Backend Engineer" },
    });
    fireEvent.click(screen.getByRole("button", { name: iv("startBtn") }));
    expect(interview.created).toEqual([
      expect.objectContaining({ session_type: "general", target_role: "Backend Engineer" }),
    ]);
  });
});
```

Run: `cd frontend && npx vitest run tests/app/interview-list.test.tsx tests/app/interview-new.test.tsx`

Expected: FAIL. There is no eyebrow, no Retry, the score class is
`text-green-600`, and there is no `group` and no role/company labels.

- [ ] **Step 3: Migrate the Interview list**

In `app/dashboard/interview/page.tsx`:

1. **Page**: take `isFetching` and `refetch` from `useInterviewSessions()`,
   then return:

   ```tsx
    <>
      <PageHeader
        eyebrow={t("nav", "groupApply", lang)}
        title={t("interview", "title", lang)}
        description={t("interview", "sub", lang)}
        actions={
          <Button asChild>
            <Link href="/dashboard/interview/new">{t("interview", "newSession", lang)}</Link>
          </Button>
        }
      />
      <div className="space-y-6">
        {isLoading && <SessionsSkeleton />}
        {error && (
          <Alert action={<RetryButton retrying={isFetching} onRetry={() => void refetch()} />}>
            {t("interview", "loadError", lang)}
          </Alert>
        )}
        {sessions && sessions.length === 0 && !isLoading && (
          <EmptyState
            icon={Mic}
            title={t("interview", "noSessions", lang)}
            action={
              <Button asChild variant="secondary">
                <Link href="/dashboard/interview/new">{t("interview", "startFirst", lang)}</Link>
              </Button>
            }
          />
        )}
        {sessions && sessions.length > 0 && (
          <ul className="space-y-3">
            {sessions.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </ul>
        )}
      </div>
    </>
   ```

2. **`SessionCard`**:
   - `scoreColor` becomes

     ```tsx
  const scoreColor =
    score === null ? toneText.neutral : toneText[scoreTone(score, INTERVIEW_SCORE_BANDS)];
     ```

   - The Review link becomes
     `<Button asChild variant="ghost" size="sm"><Link href={`/dashboard/interview/${s.id}` as Route}>{t("interview", "review", lang)}</Link></Button>`.
3. **`SessionsSkeleton`**: 3 × `<Skeleton className="h-20 rounded-lg" />`.

Imports: `Route`, `Mic`, `Alert`, `Button`, `EmptyState`, `PageHeader`,
`Skeleton`, `RetryButton`, and `INTERVIEW_SCORE_BANDS`, `scoreTone` and
`toneText`.

- [ ] **Step 4: Migrate New session**

In `app/dashboard/interview/new/page.tsx`, replace the return with:

```tsx
  return (
    <div className="mx-auto max-w-lg space-y-8">
      <Breadcrumbs
        items={[
          { label: t("interview", "title", lang), href: "/dashboard/interview" },
          { label: t("interview", "newTitle", lang) },
        ]}
      />
      <PageHeader
        className="mb-0"
        title={t("interview", "newTitle", lang)}
        description={t("interview", "newSub", lang)}
      />

      <div className="space-y-6">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">
            {t("interview", "interviewType", lang)}
          </legend>
          <ul className="space-y-2">
            {INTERVIEW_TYPES.map((type) => (
              <li key={type}>
                <RadioCard
                  name="session_type"
                  value={type}
                  checked={sessionType === type}
                  onChange={() => setSessionType(type)}
                >
                  <p className="text-sm font-medium">{interviewTypeLabel(type, lang)}</p>
                  <p className="text-xs text-muted-foreground">
                    {interviewTypeDescription(type, lang)}
                  </p>
                </RadioCard>
              </li>
            ))}
          </ul>
        </fieldset>

        <Field label={t("interview", "interviewLang", lang)}>
          <Select
            value={language}
            onChange={(e) => setLanguage(e.target.value as InterviewLanguage)}
          >
            {INTERVIEW_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {interviewLanguageOption(code, lang)}
              </option>
            ))}
          </Select>
        </Field>

        <fieldset className="space-y-4">
          <legend className="text-sm font-medium">
            {t("interview", "context", lang)}{" "}
            <span className="font-normal text-muted-foreground">
              ({t("interview", "contextHint", lang)})
            </span>
          </legend>
          <Field label={t("interview", "roleLabel", lang)} optionalLabel={t("common", "optional", lang)}>
            <Input
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder={t("interview", "rolePlaceholder", lang)}
            />
          </Field>
          <Field
            label={t("interview", "companyLabel", lang)}
            optionalLabel={t("common", "optional", lang)}
          >
            <Input
              value={targetCompany}
              onChange={(e) => setTargetCompany(e.target.value)}
              placeholder={t("interview", "companyPlaceholder", lang)}
            />
          </Field>
        </fieldset>

        {state.error && <Alert>{streamErrorMessage(state.error, lang)}</Alert>}

        <Button className="w-full" onClick={handleStart} loading={state.isStreaming || ready}>
          {state.isStreaming || ready
            ? t("interview", "starting", lang)
            : t("interview", "startBtn", lang)}
        </Button>
      </div>
    </div>
  );
```

Imports: `Breadcrumbs`, `PageHeader`, `Alert`, `Button`, `Field`, `Input`,
`RadioCard` and `Select`. Remove `Link` if unused.

- [ ] **Step 5: Migrate the Session page**

In `app/dashboard/interview/[id]/page.tsx`:

1. **Header back link**:

   ```tsx
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href="/dashboard/interview" aria-label={t("interview", "backToSessions", lang)}>
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
   ```

2. **Header title**: the `<p className="text-sm font-medium">` holding
   `interviewTitle(...)` becomes
   `<h1 className="text-sm font-medium">…</h1>`. The chat screen had no
   `<h1>`; this compact header is its title.
3. **End and Stop**:
   `<Button variant="secondary" size="sm" onClick={handleEnd}>` and
   `<Button variant="ghost" size="sm" onClick={handleStop}>`, with the same
   labels.
4. **Stream error**: `<p role="alert" className="text-center …">` becomes
   `<Alert>{streamErrorMessage(state.error, lang)}</Alert>`.
5. **Answer box**: the `<textarea …>` becomes `<Textarea …>`. Keep every
   prop (`id`, `maxLength`, `ref`, `value`, `onChange`, `onKeyDown`,
   `placeholder`, `rows={3}`, `disabled`), and use
   `className="min-h-0 flex-1 resize-none"`. The sr-only `<label>` stays.
6. **Send**:

   ```tsx
            <Button
              className="self-end"
              onClick={handleSend}
              disabled={!input.trim()}
              loading={state.isStreaming}
            >
              {t("interview", "send", lang)}
            </Button>
   ```

7. **`LoadProblemNotice`**: its body becomes:

   ```tsx
  const retry = canRetry ? <RetryButton retrying={retrying} onRetry={onRetry} /> : undefined;
  return (
    <Alert
      key={failureCount}
      tone={offline ? "neutral" : "danger"}
      action={retry}
      className={variant === "inline" ? "mx-auto w-fit" : undefined}
    >
      {t("interview", PROBLEM_MESSAGE_KEYS[variant][problem], lang)}
    </Alert>
  );
   ```

   `Alert` keeps the roles the tests expect: `status` when offline, `alert`
   otherwise.
8. **`EvalCard`**:
   - The outer div becomes `<Card className="space-y-3 p-4">`.
   - `text-green-700` becomes `toneText.success`, and `text-amber-700`
     becomes `toneText.warning`.
   - The grammar dot `bg-amber-500` becomes `toneFill.warning`, with
     `aria-hidden="true"`.
9. **`ScoreBar`**: `color` becomes
   `const color = toneFill[scoreTone(pct, INTERVIEW_SCORE_BANDS)];`.
10. **`SummaryCard`**:
    - `scoreColor` becomes
      `toneText[scoreTone(score, INTERVIEW_SCORE_BANDS)]`.
    - `dot="bg-green-500"` becomes `dot={toneFill.success}`, and
      `dot="bg-amber-500"` becomes `dot={toneFill.warning}`.
    - The back link becomes
      `<Button asChild><Link href="/dashboard/interview">{t("interview", "backToSessions", lang)}</Link></Button>`.
    - In `BulletList`, the dot span gets `aria-hidden="true"`.
11. **`StatusPill`**:

    ```tsx
function StatusPill({ status }: { status: InterviewStatus }) {
  const { lang } = useLang();
  const label =
    status === "active"
      ? t("interview", "statusActive", lang)
      : status === "completed"
        ? t("interview", "statusCompleted", lang)
        : t("interview", "statusAbandoned", lang);
  return (
    <Badge variant={SESSION_STATUS_TONE[status]}>
      {status === "active" && (
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 animate-pulse rounded-full motion-reduce:animate-none ${toneFill.success}`}
        />
      )}
      {label}
    </Badge>
  );
}
    ```

    Its caller already passes `"completed"` or `session.status`, which is
    typed `InterviewStatus`.
12. **`PageSkeleton`**: replace the `animate-pulse` divs with `Skeleton`s
    of the same sizes. Keep `rounded-2xl` on the bubbles, and `ml-auto` on
    every other one.

Imports:
- `ArrowLeft` from lucide
- `Alert`, `Badge`, `Button`, `Card`, `Skeleton` and `Textarea`
- `RetryButton`
- `INTERVIEW_SCORE_BANDS`, `SESSION_STATUS_TONE`, `scoreTone`, `toneFill`
  and `toneText`
- the `InterviewStatus` type

- [ ] **Step 6: Migrate the translate tool**

In `app/dashboard/jobs/translate/page.tsx`, replace the header block with:

```tsx
      <Breadcrumbs
        items={[
          { label: t("jobs", "title", lang), href: "/dashboard/jobs" },
          { label: t("jobs", "translateTitle", lang) },
        ]}
      />
      <PageHeader
        className="mb-0"
        eyebrow={t("nav", "groupApply", lang)}
        title={t("jobs", "translateTitle", lang)}
        description={t("jobs", "translateSub", lang)}
      />
```

Replace the two fields with:

```tsx
        <Field
          label={t("jobs", "sourceUrl", lang)}
          optionalLabel={t("common", "optional", lang)}
          hint={t("jobs", "sourceUrlHint", lang)}
        >
          <Input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://www.indeed.com/..."
          />
        </Field>

        <div className="space-y-1.5">
          <Field label={t("jobs", "jobText", lang)} hint={t("jobs", "minChars", lang)}>
            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              maxLength={MAX_JOB_TEXT}
              rows={16}
              placeholder={t("jobs", "jobTextPlaceholder", lang)}
              className="resize-y"
            />
          </Field>
          <p
            className={`text-right text-xs tabular-nums ${rawText.trim().length < 50 ? "text-muted-foreground" : "text-success"}`}
          >
            {t("jobs", "charCount", lang)
              .replace("{n}", String(rawText.trim().length))
              .replace("{max}", String(MAX_JOB_TEXT))}
          </p>
        </div>
```

The red `*` goes. As in Settings, only the optional field is marked, and
the URL field now says "Optional".

The error becomes `<Alert>{apiErrorMessage(translateMutation.error, lang)}</Alert>`.
The submit button becomes:

```tsx
          <Button type="submit" disabled={!canSubmit} loading={translateMutation.isPending}>
            {translateMutation.isPending
              ? t("jobs", "translating", lang)
              : t("jobs", "translateSubmit", lang)}
          </Button>
```

Imports: `Breadcrumbs`, `PageHeader`, `Alert`, `Button`, `Field`, `Input`
and `Textarea`. Remove `Link` if unused.

- [ ] **Step 7: Update the guard**

In `tests/design-guard.test.ts`:

- Delete the four `// Task 4: Apply` entries and their comment.
- Add to `ALLOWED`:

  ```ts
  "app/dashboard/interview/[id]/page.tsx": {
    rules: ["h1"],
    reason: "A full-height chat screen: its compact header stands in for PageHeader.",
  },
  ```

- [ ] **Step 8: Run the tests**

Run: `cd frontend && npx vitest run tests/app/interview-list.test.tsx tests/app/interview-new.test.tsx tests/app/interview-session.test.tsx tests/design-guard.test.ts`

Expected: PASS. In `interview-session.test.tsx`, the Send button is now
`aria-busy` while streaming instead of showing a bare spinner. Change an
assertion only where it checked that markup; the roles
(`alert`/`status`), labels and behaviour must still hold.

- [ ] **Step 9: Prove the key behaviours are guarded**

| File | Change | Must fail |
|---|---|---|
| `app/dashboard/interview/page.tsx` | `toneText[scoreTone(score, INTERVIEW_SCORE_BANDS)]` → `toneText.neutral` | interview-list "colours a good score as good" |
| `app/dashboard/interview/page.tsx` | `onRetry={() => void refetch()}` → `onRetry={() => {}}` | interview-list "explains a failed load, and retries it" |
| `app/dashboard/interview/new/page.tsx` | delete the role `Field`'s `label` prop (and pass `label=""`) | interview-new "labels every field" |
| `app/dashboard/interview/[id]/page.tsx` | `tone={offline ? "neutral" : "danger"}` → `tone="danger"` | interview-session's offline test (`getByRole("status")`) |
| `tests/design-guard.test.ts` | delete the new `ALLOWED` entry | "app/dashboard/interview/[id]/page.tsx is on the design system" |

- [ ] **Step 10: Gates, browser check and commit**

```bash
cd frontend && npm test && npm run lint && npm run type-check && npm run format:check
```

In the browser, check:
- The Interview list.
- New session: tab through the radio cards, arrow between types, and
  check the labels.
- Open a past session, check its eval and summary colours, and use the
  back icon.
- The translate tool.
- All of these at desktop and 375px, in 日本語 and Indonesian.

```bash
git add lib/i18n.ts app/dashboard/interview app/dashboard/jobs/translate tests/app/interview-list.test.tsx tests/app/interview-new.test.tsx tests/app/interview-session.test.tsx tests/design-guard.test.ts
git commit -m "feat(apply): Interview and the translate tool on the design system

Also labels the new-session role and company boxes, which had only
placeholders, and gives the session screen its h1.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Settle in (Visa and Culture)

**Files:**
- Modify:
  - `frontend/app/dashboard/visa/page.tsx` and `frontend/app/dashboard/visa/[id]/page.tsx`
  - `frontend/components/visa/visa-checklist.tsx`,
    `frontend/components/visa/visa-option-card.tsx`,
    `frontend/components/visa/visa-roadmap-switcher.tsx` and
    `frontend/components/visa/visa-roadmap-view.tsx`
  - `frontend/app/dashboard/culture/page.tsx` and `frontend/app/dashboard/culture/[slug]/page.tsx`
  - `frontend/lib/i18n.ts` (`culture` section)
  - `frontend/tests/app/culture.test.tsx`
  - `frontend/tests/design-guard.test.ts`
- Create: `frontend/tests/app/visa.test.tsx`

**Interfaces:**
- **Consumes, from Task 1:**
  - `Alert`, `EmptyState`, `ToggleGroup`, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`,
    `Checkbox` and `RetryButton`
  - `ELIGIBILITY_TONE`, `toneSoft`, `toneText`
- **Consumes, existing:** `PageHeader`, `Breadcrumbs`, `Card`, `Button`,
  `Badge`, `Skeleton` and `Input`.
- **Produces:** nothing new.

**Fix included:** Visa's failed load now has a Retry. Today it only says the
load failed.

- [ ] **Step 1: Strings**

In `lib/i18n.ts`'s `culture` section, add:

```ts
    sectionsLabel: { en: "Culture sections", id: "Bagian budaya", ja: "カルチャーのセクション" },
    tagsLabel: { en: "Filter by tag", id: "Filter menurut tag", ja: "タグで絞り込む" },
```

- [ ] **Step 2: Write the failing tests**

Create `frontend/tests/app/visa.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";

const visa = vi.hoisted(() => ({ latest: {} as Record<string, unknown>, refetches: 0 }));

vi.mock("@/hooks/useVisa", () => ({
  useLatestVisaConsultation: () => visa.latest,
  useVisaConsultations: () => ({ data: [] }),
  useAssessVisa: () => ({ mutate: () => {}, isPending: false, error: null }),
  useSelectRoadmap: () => ({ mutate: () => {}, isPending: false, error: null, variables: undefined }),
}));

const VisaPage = (await import("@/app/dashboard/visa/page")).default;

const LANG = "ja";
const v = (key: Parameters<typeof t>[1]) => t("visa", key, LANG);

async function renderPage(over: Record<string, unknown>) {
  visa.latest = {
    data: undefined,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: () => {
      visa.refetches += 1;
      return Promise.resolve();
    },
    ...over,
  };
  await act(async () => {
    renderIn(LANG, <VisaPage />);
  });
}

beforeEach(() => {
  visa.refetches = 0;
});

describe("the visa page", () => {
  it("is titled under Settle in", async () => {
    await renderPage({ error: new ApiClientError(404, "none") });
    expect(screen.getByRole("heading", { level: 1, name: v("title") })).toBeInTheDocument();
    expect(screen.getByText(t("nav", "groupSettleIn", LANG))).toBeInTheDocument();
  });

  it("explains there is no assessment yet", async () => {
    await renderPage({ error: new ApiClientError(404, "none") });
    expect(screen.getByText(v("noAssessment"))).toBeInTheDocument();
    expect(screen.getByText(v("noAssessmentSub"))).toBeInTheDocument();
  });

  it("explains a failed load, and retries it", async () => {
    await renderPage({ error: new ApiClientError(500, "boom") });
    expect(screen.getByRole("alert")).toHaveTextContent(v("loadFail"));
    fireEvent.click(screen.getByRole("button", { name: t("common", "tryAgain", LANG) }));
    expect(visa.refetches).toBe(1);
  });
});
```

In `frontend/tests/app/culture.test.tsx`:
- Change the glossary tab switch from
  `fireEvent.click(screen.getByRole("button", { name: t("culture", "glossaryTab", "ja") }))`
  to
  `fireEvent.mouseDown(screen.getByRole("tab", { name: t("culture", "glossaryTab", "ja") }), { button: 0 })`.
  Radix tabs select on mousedown.
- Append these tests, which use the file's existing `renderCulture(topics, glossary)`
  helper and its `LOADED` and `EMPTY` fixtures.

```tsx
describe("culture page, tabs and tag filter", () => {
  it("switches between topics and the glossary with real tabs", async () => {
    renderCulture(LOADED, EMPTY);
    expect(screen.getByRole("tablist", { name: t("culture", "sectionsLabel", "ja") })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: t("culture", "topicsTab", "ja") })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("filters topics by tag from a pressed-button group, and clears on a second press", async () => {
    renderCulture(LOADED, EMPTY);
    const group = screen.getByRole("group", { name: t("culture", "tagsLabel", "ja") });
    const keigo = within(group).getByRole("button", { name: "keigo" });
    fireEvent.click(keigo);
    expect(keigo).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(keigo);
    expect(within(group).getByRole("button", { name: t("culture", "allTags", "ja") })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
```

Add `within` to the file's `@testing-library/react` import.

Run: `cd frontend && npx vitest run tests/app/visa.test.tsx tests/app/culture.test.tsx`

Expected: FAIL. There is no eyebrow, no Retry on Visa, no `tablist`, and
no `group`.

- [ ] **Step 3: Migrate Visa**

In `app/dashboard/visa/page.tsx`:

1. **Query**: take `isFetching` and `refetch` from
   `useLatestVisaConsultation()`.
2. **Return**: wrap it in a fragment.
   - The header `<div>` becomes a `PageHeader`:

     ```tsx
      <PageHeader
        eyebrow={t("nav", "groupSettleIn", lang)}
        title={t("visa", "title", lang)}
        description={t("visa", "sub", lang)}
        actions={
          <Button
            onClick={() => {
              setViewingVisaType(null);
              setAnnouncement(t("visa", "assessing", lang));
              assess.mutate(undefined, {
                onSuccess: () => setAnnouncement(t("visa", "assessmentReady", lang)),
                onError: () => setAnnouncement(""),
              });
            }}
            disabled={isLoading}
            loading={assess.isPending}
          >
            {assess.isPending
              ? t("visa", "assessing", lang)
              : latest
                ? t("visa", "reassessBtn", lang)
                : t("visa", "assessBtn", lang)}
          </Button>
        }
      />
     ```

     The rest goes in `<div className="space-y-8">`.
   - While loading, the button shows `assessBtn`, disabled. The shimmer bar
     inside the button goes.
3. **The three error `<p role="alert">`s**: each becomes
   `<Alert>…same content and comments…</Alert>`. The `loadFailed` one gets
   `action={<RetryButton retrying={isFetching} onRetry={() => void refetch()} />}`.
4. **Empty**:

   ```tsx
        <EmptyState
          icon={Stamp}
          title={t("visa", "noAssessment", lang)}
          description={t("visa", "noAssessmentSub", lang)}
        />
   ```

   There's no action: the header's Assess button is the action, one step
   above.
5. **`RoadmapSkeleton`**: `Skeleton`s of the same heights, all
   `rounded-lg`.

In `app/dashboard/visa/[id]/page.tsx`:
- The `<h1>` block becomes
  `<PageHeader className="mb-0" title={t("visa", "roadmapTitle", lang)} description={`${t("visa", "generated", lang)} ${date}`} />`,
  with the existing date formatting moved into a `const date`.
- The not-found `<p>` becomes `<Alert>`.
- The two `rounded-lg border bg-card p-5` boxes become `<Card className="p-5">`,
  and the phase boxes become `<Card className="overflow-hidden">`.
- The skeleton uses `Skeleton`.

In `components/visa/visa-roadmap-view.tsx`, the `rounded-lg border bg-card p-5`
box becomes `<Card className="p-5">`.

In `components/visa/visa-checklist.tsx`:
- **`PhaseNumber`**:

  ```tsx
function PhaseNumber({ index, done }: { index: number; done: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        done ? `${toneSoft.success} ${toneText.success}` : "bg-indigo-soft text-indigo"
      }`}
    >
      {done ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : index + 1}
    </span>
  );
}
  ```

- **The step checkbox**: the `<input type="checkbox" …>` becomes
  `<Checkbox aria-labelledby={titleId} checked={checked} onChange={onToggle} disabled={!onToggle} className="mt-0.5" />`.
- **The optional pill**: becomes
  `<Badge>{t("visa", "optional", lang)}</Badge>`.
- **The phase container**: becomes `<Card className="overflow-hidden">`.
- **Show more/less**: the button becomes
  `<Button variant="link" size="sm" className="mt-1 h-auto p-0 text-xs" onClick={…}>`.

In `components/visa/visa-option-card.tsx`:
- Delete `ELIGIBILITY_STYLES`.
- The eligibility `<span>` becomes
  `<Badge variant={ELIGIBILITY_TONE[option.eligibility]} className="mt-2">`.
- The recommended pill becomes
  `<Badge variant="info">{t("visa", "recommendedBadge", lang)}</Badge>`.
- `text-amber-700` becomes `text-warning`.
- The button becomes `<Button onClick={onSelect} loading={isBuilding}>{buttonText}</Button>`.
- The outer div becomes
  `<Card className={cn("p-5", option.recommended && "border-primary ring-1 ring-ring/30")}>`.

In `components/visa/visa-roadmap-switcher.tsx`:
- The back button becomes:

  ```tsx
      <Button variant="secondary" size="sm" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        {t("visa", "backToOptions", lang)}
      </Button>
  ```

- The per-chip spinner becomes
  `<Loader2 aria-hidden="true" className="h-3 w-3 animate-spin motion-reduce:animate-none" />`.

- [ ] **Step 4: Migrate Culture**

In `app/dashboard/culture/page.tsx`, the return becomes:

```tsx
  return (
    <>
      <PageHeader
        eyebrow={t("nav", "groupSettleIn", lang)}
        title={t("culture", "title", lang)}
        description={t("culture", "sub", lang)}
      />
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "topics" | "glossary")}>
        <TabsList aria-label={t("culture", "sectionsLabel", lang)}>
          <TabsTrigger value="topics">{t("culture", "topicsTab", lang)}</TabsTrigger>
          <TabsTrigger value="glossary">{t("culture", "glossaryTab", lang)}</TabsTrigger>
        </TabsList>

        <TabsContent value="topics" className="space-y-6">
          <ToggleGroup<string>
            label={t("culture", "tagsLabel", lang)}
            value={selectedTag ?? "all"}
            onChange={(value) =>
              // A second press on the selected tag clears it, as before.
              setSelectedTag(value === "all" || value === selectedTag ? undefined : value)
            }
            options={[
              { value: "all", label: t("culture", "allTags", lang) },
              ...COMMON_TAGS.map((tag) => {
                const tagLang = japaneseLangOf(tag);
                return { value: tag, label: tag, ...(tagLang ? { lang: tagLang } : {}) };
              }),
            ]}
          />
          {topicsLoading && <TopicsSkeleton />}
          {topicsError && (
            <Alert
              action={
                <RetryButton retrying={topicsFetching} onRetry={() => void refetchTopics()} />
              }
            >
              {t("culture", "topicsLoadError", lang)}
            </Alert>
          )}
          {topics && topics.length === 0 && (
            <EmptyState icon={BookOpen} title={t("culture", "noTopics", lang)} />
          )}
          {topics && topics.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2">
              {topics.map((topic) => (
                <TopicCard key={topic.id} topic={topic} />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="glossary" className="space-y-6">
          {glossaryLoading && <GlossarySkeleton />}
          {glossaryError && (
            <Alert
              action={
                <RetryButton retrying={glossaryFetching} onRetry={() => void refetchGlossary()} />
              }
            >
              {t("culture", "glossaryLoadError", lang)}
            </Alert>
          )}
          {glossary && glossary.length === 0 && (
            <EmptyState icon={Languages} title={t("culture", "noGlossary", lang)} />
          )}
          {glossary && glossary.length > 0 && <GlossaryTable entries={glossary} />}
        </TabsContent>
      </Tabs>
    </>
  );
```

Then:
- Delete `LoadFailure`.
- In `TopicCard`, the tag `<span>`s become
  `<Badge key={tag} lang={japaneseLangOf(tag)}>{tag}</Badge>`, and
  `hover:bg-accent` on the link becomes `hover:bg-secondary`.
- In `GlossaryTable`, the search `<label>` and `<input>` become:

  ```tsx
      <Input
        type="search"
        aria-label={t("culture", "searchLabel", lang)}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("culture", "searchPlaceholder", lang)}
        className="max-w-sm"
      />
  ```

  This uses an `aria-label` rather than `Field`, because the page shows no
  visible label here today.
- The skeletons use `Skeleton`.

Imports: `BookOpen`, `Languages`, `Alert`, `Badge`, `EmptyState`, `Input`,
`PageHeader`, `Skeleton`, `Tabs`, `TabsContent`, `TabsList`,
`TabsTrigger`, `ToggleGroup` and `RetryButton`.

In `app/dashboard/culture/[slug]/page.tsx`:
- The title block becomes:

  ```tsx
      <PageHeader
        className="mb-0"
        title={topic.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{date}</span>
            {topic.tags.map((tag) => (
              <Badge key={tag} lang={japaneseLangOf(tag)}>
                {tag}
              </Badge>
            ))}
          </span>
        }
      />
  ```

- The article box becomes `<Card className="p-6">`.
- `BackLink` becomes
  `<Button asChild variant="ghost"><Link href="/dashboard/culture"><ArrowLeft aria-hidden="true" />{t("culture", "backToCulture", lang)}</Link></Button>`.
- The not-found `<p>` becomes `<Alert>`.
- `ArticleSkeleton` uses `Skeleton`.

- [ ] **Step 5: Update the guard**

Delete the seven `// Task 5: Settle in` entries and their comment from
`NOT_YET_MIGRATED`.

- [ ] **Step 6: Run the tests**

Run: `cd frontend && npx vitest run tests/app/visa.test.tsx tests/app/culture.test.tsx tests/design-guard.test.ts`

Expected: PASS.

- [ ] **Step 7: Prove the key behaviours are guarded**

| File | Change | Must fail |
|---|---|---|
| `app/dashboard/visa/page.tsx` | `onRetry={() => void refetch()}` → `onRetry={() => {}}` | visa "explains a failed load, and retries it" |
| `app/dashboard/culture/page.tsx` | `value === "all" \|\| value === selectedTag ? undefined : value` → `value === "all" ? undefined : value` | culture "…clears on a second press" |
| `app/dashboard/culture/page.tsx` | `aria-label={t("culture", "sectionsLabel", lang)}` → removed | culture "switches between topics and the glossary with real tabs" |
| `components/visa/visa-checklist.tsx` | revert `<Check …/>` to `"✓"` | the guard's "components/visa/visa-checklist.tsx is on the design system" |

- [ ] **Step 8: Gates, browser check and commit**

```bash
cd frontend && npm test && npm run lint && npm run type-check && npm run format:check
```

In the browser, check:
- Visa: the options list, a roadmap, the checklist ticks, and the back
  button.
- Culture: the tabs (by keyboard, arrow keys), the tag filter pressed and
  pressed again, the glossary search, and a topic page.
- Both at desktop and 375px, in 日本語 and Indonesian.

```bash
git add lib/i18n.ts app/dashboard/visa app/dashboard/culture components/visa tests/app/visa.test.tsx tests/app/culture.test.tsx tests/design-guard.test.ts
git commit -m "feat(settle-in): Visa and Culture on the design system

Culture gets real tabs and a pressed-button tag filter; Visa's failed load
gets a Retry.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: Onboarding

**Files:**
- Modify:
  - `frontend/app/onboarding/page.tsx`
  - `frontend/components/ui/segmented-control.tsx` (an optional `lang` per
    option)
  - `frontend/lib/i18n.ts` (`onboarding` section)
  - `frontend/tests/app/onboarding.test.tsx`
  - `frontend/tests/components/form-controls.test.tsx`
  - `frontend/tests/design-guard.test.ts`

**Interfaces:**
- **Consumes, from Task 1:** `Alert` and `Checkbox`.
- **Consumes, existing:**
  - `PageHeader`, `Button`, `Field`, `Input`, `Select`, `SegmentedControl`
    and `TagInput`
  - `useLang` (`{ lang, setLang }`) and `LANGUAGES` (`lib/i18n`)
  - react-hook-form's `Controller`
- **Produces:** `SegmentOption<T>` gains `lang?: string`.

**Behaviour changes, from the spec:**
- **Step 2**: asks for the **app language**, starting on the current one.
  Choosing one calls `setLang` at once. Continue saves `preferred_language`
  set to that language.
- **Step 4**: target industries and target roles become `TagInput`. They
  save the same string arrays, and the "at least one" rule moves from a
  non-empty string to a non-empty array.

- [ ] **Step 1: Strings**

In `lib/i18n.ts`'s `onboarding` section, add:

```ts
    s2AppLang: { en: "App language", id: "Bahasa aplikasi", ja: "表示言語" },
    s2AppLangHint: {
      en: "Changes the app straight away. You can change it later in Settings.",
      id: "Langsung mengubah bahasa aplikasi. Bisa diubah nanti di Pengaturan.",
      ja: "すぐにアプリに反映されます。あとで設定から変更できます。",
    },
```

`s2Lang` is deleted in Step 5, once nothing uses it (check with
`grep -rn '"s2Lang"' app components lib`).

- [ ] **Step 2: Let a segment carry its own language**

Test first. Append to the `SegmentedControl` describe in
`tests/components/form-controls.test.tsx`:

```tsx
  it("marks a segment's language when it differs from the page", () => {
    render(
      <SegmentedControl
        legend="App language"
        name="lang"
        value="en"
        onChange={() => {}}
        options={[
          { value: "en", label: "English" },
          { value: "ja", label: "日本語", lang: "ja" },
        ]}
      />,
    );
    expect(screen.getByText("日本語")).toHaveAttribute("lang", "ja");
  });
```

Run it and see it fail. Then in `components/ui/segmented-control.tsx`:
- Add `lang?: string;` to `SegmentOption<T>`.
- Add `lang={option.lang}` to the segment's label `<span>`.

Run it again and see it pass.

- [ ] **Step 3: Write the failing onboarding tests**

In `tests/app/onboarding.test.tsx`:

1. In "saves the name against onboarding_step 1, not 2", change
   `preferred_language: "id"` to `preferred_language: "ja"`. The page
   renders in `LANG = "ja"`, and step 2 now saves the app language.
2. In "saves preferences against onboarding_step 4…", change the roles
   value from `"Backend Engineer"` to `"Backend Engineer,"`. The comma
   commits the tag; the test submits the form directly, so no blur commits
   it. The industries value `" IT , Finance ,, "` stays as it is: its
   commas commit both tags.
3. Append:

```tsx
describe("onboarding, the app language step", () => {
  it("asks for the app language, starting on the current one", async () => {
    await toStep2();
    expect(screen.getByRole("group", { name: o("s2AppLang") })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "日本語" })).toBeChecked();
    // The old setting, a select of languages named in English, is gone.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("switches the app at once, and saves the language it was switched to", async () => {
    const { container } = await toStep2();
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    // The step is in English now.
    expect(
      screen.getByRole("heading", { level: 1, name: t("onboarding", "s2Title", "en") }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(new RegExp(t("onboarding", "s2Name", "en"))), {
      target: { value: "Budi Santoso" },
    });
    await submit(container);
    expect(updateProfile.saves[0]).toMatchObject({ preferred_language: "en" });
  });
});

describe("onboarding, roles and industries as tags", () => {
  it("adds a role as a tag on Enter", async () => {
    await toStep4();
    const roles = screen.getByLabelText(new RegExp(o("s4Roles")));
    fireEvent.change(roles, { target: { value: "SRE" } });
    fireEvent.keyDown(roles, { key: "Enter" });
    expect(
      screen.getByRole("button", { name: t("settings", "removeTag", LANG).replace("{tag}", "SRE") }),
    ).toBeInTheDocument();
  });
});
```

`toStep2` and `toStep4` are the helpers the file already has. Hoist them
out of their `describe` if the new describes can't reach them.

Run: `cd frontend && npx vitest run tests/app/onboarding.test.tsx`

Expected: the new tests and the two edited ones FAIL.

- [ ] **Step 4: Migrate onboarding**

In `app/onboarding/page.tsx`:

1. **Imports**:
   - Remove `cloneElement`, `isValidElement`, `useId` and `ReactElement`.
   - Add `Controller` from `react-hook-form`.
   - Add `LANGUAGES` and `type Language` from `@/lib/i18n`.
   - Add `PageHeader`, `Alert`, `Button`, `Checkbox`, `Field`, `Input`,
     `Select`, `SegmentedControl` and `TagInput`.
2. **Schemas**:

   ```ts
const step2Schema = z.object({
  full_name: z.string().min(1, "Name is required"),
});
   ```

   and in `step4Schema`:

   ```ts
  target_industry: z.array(z.string()).min(1, "Enter at least one industry"),
  target_role: z.array(z.string()).min(1, "Enter at least one role"),
   ```

3. **Page, step 2's `onNext`**: send the app language:

   ```tsx
                await updateProfile.mutateAsync({
                  full_name: data.full_name,
                  preferred_language: lang,
                  onboarding_step: 1,
                });
   ```

4. **Page, step 4's `onNext`**: the arrays pass straight through:
   `target_industry: data.target_industry` and
   `target_role: data.target_role`. Delete the `.split(",")` chains.
5. **Page error box**: becomes `{error && <Alert className="mb-4">{error}</Alert>}`.
6. **`Step1Consent`**:
   - The heading block becomes
     `<PageHeader className="mb-0" title={t("onboarding", "s1Title", lang)} description={t("onboarding", "s1Sub", lang)} />`.
   - The checkbox:

     ```tsx
      <label className="flex cursor-pointer items-start gap-3">
        <Checkbox
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-sm">{t("onboarding", "s1Checkbox", lang)}</span>
      </label>
     ```

   - The button:

     ```tsx
      <Button className="w-full" onClick={() => void onNext()} disabled={!checked} loading={loading}>
        {loading ? t("common", "saving", lang) : t("onboarding", "s1Btn", lang)}
      </Button>
     ```

7. **`Step2`**:

   ```tsx
function Step2({ onNext, onBack, loading }: { onNext: (data: Step2Data) => Promise<void>; onBack: () => void; loading: boolean }) {
  const { lang, setLang } = useLang();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step2Data>({ resolver: zodResolver(step2Schema) });

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <PageHeader
        className="mb-0"
        title={t("onboarding", "s2Title", lang)}
        description={t("onboarding", "s2Sub", lang)}
      />

      <Field label={t("onboarding", "s2Name", lang)} error={errors.full_name?.message}>
        <Input {...register("full_name")} placeholder="Budi Santoso" />
      </Field>

      <div className="space-y-1.5">
        {/* The app's own language, as in Settings: it switches at once. */}
        <SegmentedControl<Language>
          legend={t("onboarding", "s2AppLang", lang)}
          name="app_language"
          value={lang}
          onChange={setLang}
          options={LANGUAGES.map(({ code, name }) => ({ value: code, label: name, lang: code }))}
        />
        <p className="text-xs text-muted-foreground">{t("onboarding", "s2AppLangHint", lang)}</p>
      </div>

      <StepButtons onBack={onBack} loading={loading} label={t("common", "continue", lang)} />
    </form>
  );
}
   ```

8. **`Step3`**:
   - The heading becomes `PageHeader` (`className="mb-0"`).
   - Each `<input {...register(x)} … className={inputCls} />` becomes
     `<Input {...register(x)} … />`, keeping the same placeholders, and
     `type`/`min`/`max` on years.
   - The buttons become `<StepButtons … />`.
9. **`Step4`**:
   - `useForm` also takes `control`.
   - `defaultValues` becomes
     `{ japanese_level: "none", visa_status: "none", target_industry: [], target_role: [] }`.
   - The heading becomes `PageHeader`.
   - The two `<select>`s become `<Select {...register(x)}>`, with the same
     options.
   - The two inputs become:

     ```tsx
      <Controller
        control={control}
        name="target_industry"
        render={({ field }) => (
          <Field label={t("onboarding", "s4Industries", lang)} error={errors.target_industry?.message}>
            <TagInput
              value={field.value}
              onChange={field.onChange}
              placeholder={t("settings", "addIndustry", lang)}
              removeLabel={t("settings", "removeTag", lang)}
            />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="target_role"
        render={({ field }) => (
          <Field label={t("onboarding", "s4Roles", lang)} error={errors.target_role?.message}>
            <TagInput
              value={field.value}
              onChange={field.onChange}
              placeholder={t("settings", "addRole", lang)}
              removeLabel={t("settings", "removeTag", lang)}
            />
          </Field>
        )}
      />
     ```

   - The buttons become `<StepButtons … />`.
10. **`Step5`**:
    - The heading becomes `PageHeader`.
    - Every `<input>` becomes `<Input {...register(x)} … />`, and the
      gender `<select>` becomes `<Select {...register("gender")}>`.
    - The photo row can't go through `Field`, because `PhotoUploader` takes
      no `id`. It becomes the Settings pattern:

      ```tsx
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("onboarding", "s5Photo", lang)}</p>
        <PhotoUploader />
        <p className="text-xs text-muted-foreground">{t("onboarding", "s5PhotoHint", lang)}</p>
      </div>
      ```

    - Hints now sit **below** their control, as `Field` renders them.
    - The buttons become
      `<StepButtons onBack={onBack} loading={loading} label={t("onboarding", "completeBtn", lang)} />`.
11. **Shared helpers**: delete the local `Field`, `SubmitBtn`, `inputCls`
    and `secondaryBtnCls`. Add:

    ```tsx
function StepButtons({ onBack, loading, label }: { onBack: () => void; loading: boolean; label: string }) {
  const { lang } = useLang();
  return (
    <div className="flex gap-3">
      <Button type="button" variant="secondary" className="w-full" onClick={onBack}>
        {t("common", "back", lang)}
      </Button>
      <Button type="submit" className="w-full" loading={loading}>
        {loading ? t("common", "saving", lang) : label}
      </Button>
    </div>
  );
}
    ```

12. **The progress bar**: stays as it is. It already uses tokens.

- [ ] **Step 5: Delete `s2Lang`, and update the guard**

Run `grep -rn '"s2Lang"' app components lib`. If nothing is printed,
delete `s2Lang` from `lib/i18n.ts`.

Delete the `// Task 6: Onboarding` entry and its comment from
`NOT_YET_MIGRATED`.

- [ ] **Step 6: Run the tests**

Run: `cd frontend && npx vitest run tests/app/onboarding.test.tsx tests/components/form-controls.test.tsx tests/design-guard.test.ts`

Expected: PASS. That includes "will not save empty preference lists",
which now runs on empty arrays.

- [ ] **Step 7: Prove the key behaviours are guarded**

| File | Change | Must fail |
|---|---|---|
| `app/onboarding/page.tsx` | `preferred_language: lang` → `preferred_language: "id"` | "switches the app at once, and saves the language…" |
| `app/onboarding/page.tsx` | `onChange={setLang}` → `onChange={() => {}}` | the same test |
| `app/onboarding/page.tsx` | `z.array(z.string()).min(1, "Enter at least one industry")` → `z.array(z.string())` | "will not save empty preference lists" |
| `app/onboarding/page.tsx` | in the industry `Controller`, `onChange={field.onChange}` → `onChange={() => {}}` | "saves preferences against onboarding_step 4…" |

- [ ] **Step 8: Gates, browser check and commit**

```bash
cd frontend && npm test && npm run lint && npm run type-check && npm run format:check
```

Browser: `/onboarding` redirects a finished account to `/dashboard`, so
check the migrated steps on a test account that hasn't finished onboarding,
if the user has one. Otherwise rely on the tests, and check only that
`/onboarding` still redirects cleanly. Never change the user's own
account's onboarding state to test this.

```bash
git add lib/i18n.ts app/onboarding/page.tsx components/ui/segmented-control.tsx tests/app/onboarding.test.tsx tests/components/form-controls.test.tsx tests/design-guard.test.ts
git commit -m "feat(onboarding): the shared parts, the app language and tag inputs

Step 2 asks for the app language, as Settings does, and still saves
preferred_language; roles and industries become tags.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: Admin, the error screens and the chat widget

**Files:**
- Modify:
  - `frontend/app/admin/page.tsx`
  - `frontend/components/error-fallback.tsx` and `frontend/components/not-found-content.tsx`
  - `frontend/components/chat-widget.tsx`
  - `frontend/tests/components/chat-widget.test.tsx`, only if an assertion
    legitimately changes
  - `frontend/tests/design-guard.test.ts`

**Interfaces:**
- **Consumes, from Task 1:** `Alert`, `Checkbox` and
  `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`.
- **Consumes, existing:** `PageHeader`, `Card`, `Button`, `Badge`,
  `Skeleton`, `Field`, `Input`, `Textarea` and `TagInput`.
- **Produces:** nothing new.

**Admin stays English-only.** Its strings are not moved into `t()`. Its
retry buttons are plain `Button`s labelled "Try again", matching the
page's English confirm-dialog labels, rather than the translated
`RetryButton`.

- [ ] **Step 1: Migrate Admin**

In `app/admin/page.tsx`:

1. **Imports**:
   - Replace `import * as Tabs from "@radix-ui/react-tabs";` with
     `import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";`.
   - Add `ArrowLeft` and `Home` from lucide, and `PageHeader`, `Alert`,
     `Badge`, `Button`, `Card`, `Checkbox`, `Field`, `Input`, `Skeleton`,
     `TagInput` and `Textarea`.
2. **Access denied**:

   ```tsx
        <PageHeader
          className="mb-0"
          title="Admin access required"
          description="Your account doesn't have permission to view this page."
        />
        <Button asChild variant="secondary">
          <Link href="/dashboard">
            <ArrowLeft aria-hidden="true" />
            Back to app
          </Link>
        </Button>
   ```

3. **Loading**: the `<p>Loading…</p>` becomes
   `<Skeleton className="h-8 w-48" />`, with an sr-only
   `<span className="sr-only">Loading…</span>` beside it, since `Skeleton`
   is `aria-hidden`.
4. **Header bar**:
   - The two links become
     `<Button asChild variant="ghost" size="sm"><Link href="/"><Home aria-hidden="true" />Home</Link></Button>`
     and the same with `ArrowLeft` and "Back to app" for `/dashboard`.
   - Delete the `<span className="font-semibold">Admin Panel</span>`.
   - The role pill becomes `<Badge variant="info">Admin</Badge>`.
5. **Main**: add the title, then the tabs:

   ```tsx
        <PageHeader title="Admin panel" description="Users, culture topics and the glossary." />
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList aria-label="Admin sections">
            {(["stats", "users", "culture", "glossary"] as Tab[]).map((section) => (
              <TabsTrigger key={section} value={section} className="capitalize">
                {section}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="stats">
            <StatsTab />
          </TabsContent>
          {/* users, culture, glossary: the same */}
        </Tabs>
   ```

6. **Each tab's loading and error lines**:
   - Loading becomes the same `Skeleton` and sr-only pair.
   - Errors become:

     ```tsx
    <Alert
      action={
        <Button variant="secondary" size="sm" loading={isFetching} onClick={() => void refetch()}>
          Try again
        </Button>
      }
    >
      Failed to load stats. Are you an admin?
    </Alert>
     ```

   Take `isFetching` and `refetch` from each tab's query hook, and keep
   each tab's message text.
7. **Stat cards**: `<div className="rounded-xl border bg-card p-6 shadow-sm">`
   becomes `<Card className="p-6">`. The tables' wrappers become
   `<Card className="overflow-hidden">` or `<Card className="overflow-x-auto">`,
   matching today's overflow class.
8. **Pills**:
   - role: `<Badge variant={user.role === "admin" ? "info" : "neutral"}>`
   - active: `<Badge variant={user.is_active ? "success" : "danger"}>`
   - topic status: `<Badge variant={topic.published ? "success" : "neutral"}>`
   - topic tags: `<Badge>`
9. **Buttons**:
   - The "+ New topic" and "+ New entry" toggles become `<Button onClick={…}>`.
   - "Create topic" and "Add entry" become `<Button loading={x.isPending} onClick={…}>`.
   - The table's text buttons (Make admin/Demote, Publish/Unpublish) become
     `<Button variant="link" size="sm">`.
   - Delete becomes
     `<Button variant="link" size="sm" className="text-destructive">`.
10. **New topic form**:
    - The card becomes `<Card className="space-y-3 p-6">`.
    - Slug and title become
      `<Field label={field === "slug" ? "Slug" : "Title"}><Input value={form[field]} onChange={…} /></Field>`.
    - Body becomes
      `<Field label="Body (Markdown)"><Textarea rows={6} className="font-mono" value={form.body} onChange={…} /></Field>`.
    - Tags become a list:
      - The form state's `tags` changes from `""` to `[] as string[]`, both
        in `useState` and in the reset in `createTopic.onSuccess`.
      - The field:

        ```tsx
          <Field label="Tags">
            <TagInput
              value={form.tags}
              onChange={(tags) => setForm({ ...form, tags })}
              placeholder="Add a tag…"
              removeLabel="Remove {tag}"
            />
          </Field>
        ```

      - The create call sends `createTopic.mutate(form)`, with no
        `.split(",")`.
    - Publish becomes:

      ```tsx
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.published}
              onChange={(e) => setForm({ ...form, published: e.target.checked })}
            />
            Publish immediately
          </label>
      ```

11. **New glossary entry form**: the card becomes `Card`, and each
    label/input pair becomes `<Field label={label}><Input … /></Field>`.

- [ ] **Step 2: Migrate the error screens**

In `components/error-fallback.tsx`:
- The Try again `<button>` becomes
  `<Button type="button" onClick={reset}>`.
- The Home link becomes
  `<Button asChild variant="secondary"><Link href="/">{t("common", "goHome", lang)}</Link></Button>`.
- The `<h1>` stays: the guard's `ALLOWED` entry covers it.

In `components/not-found-content.tsx`, make the same changes to its links
and buttons. Read the file first, and change only hand-styled buttons and
links.

- [ ] **Step 3: Migrate the chat widget**

In `components/chat-widget.tsx`:

- **Signed-out 🤖**: becomes
  `<Bot aria-hidden="true" className="h-8 w-8 text-muted-foreground" />`.
- **Sign-in link**: becomes
  `<Button asChild><Link href={SIGN_IN_ROUTE}>{t("nav", "signIn", lang)}</Link></Button>`.
- **Header 🤖**: becomes
  `<Bot aria-hidden="true" className="h-5 w-5 text-primary-foreground" />`.
- **Header ✕**:

  ```tsx
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("chat", "closeChat", lang)}
                className="rounded-md p-1 text-primary-foreground/70 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
  ```

- **Input**: `<textarea …>` becomes `<Textarea …>`. Keep every prop, and
  use `className="min-h-0 flex-1 resize-none rounded-lg"`.
- **Send**: becomes
  `<Button size="sm" onClick={sendMessage} disabled={loading || !input.trim() || rateLimited}>`.
- **Toggle**: its content `{open ? "✕" : "💬"}` becomes

  ```tsx
        {open ? (
          <X aria-hidden="true" className="h-6 w-6 text-primary-foreground" />
        ) : (
          <MessageCircle aria-hidden="true" className="h-6 w-6 text-primary-foreground" />
        )}
  ```

  and `text-2xl` is removed from its class.
- **Offset**: the container's `bottom-[calc(1.5rem+var(--save-bar-offset,0px))]`
  and its comment stay.

Imports: `Bot`, `MessageCircle` and `X` from lucide, plus `Button` and
`Textarea`.

- [ ] **Step 4: Update the guard**

Delete the `// Task 7: the rest` entries (`app/admin/page.tsx` and
`components/chat-widget.tsx`) and their comment from `NOT_YET_MIGRATED`.

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run tests/components/chat-widget.test.tsx tests/design-guard.test.ts`

Expected: PASS. The chat tests find the box by its `aria-label`, which is
unchanged.

- [ ] **Step 6: Prove the guard covers this area**

| File | Change | Must fail |
|---|---|---|
| `components/chat-widget.tsx` | put `"💬"` back in the toggle | "components/chat-widget.tsx is on the design system" |
| `app/admin/page.tsx` | put `<span aria-hidden="true">🏠</span>` back | "app/admin/page.tsx is on the design system" |

- [ ] **Step 7: Gates, browser check and commit**

```bash
cd frontend && npm test && npm run lint && npm run type-check && npm run format:check
```

In the browser, check:
- Admin: each tab, and the new-topic form open (don't submit it).
- The chat widget: open, send nothing, close with ✕, check the icons, and
  check it still rises above the Settings save bar.
- The not-found page, via a bad URL.

```bash
git add app/admin/page.tsx components/error-fallback.tsx components/not-found-content.tsx components/chat-widget.tsx tests/components/chat-widget.test.tsx tests/design-guard.test.ts
git commit -m "feat(ui): Admin, the error screens and the chat widget on the design system

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Lock it in, and the final browser pass

**Files:**
- Modify: `frontend/tests/design-guard.test.ts`

- [ ] **Step 1: Pin what is left**

Append to the guard's `describe`:

```ts
  it("has migrated everything except the pages spec 3 rebuilds", () => {
    expect(Object.keys(NOT_YET_MIGRATED).sort()).toEqual([
      "app/dashboard/jobs/[id]/page.tsx",
      "app/dashboard/jobs/applications/page.tsx",
      "app/dashboard/jobs/page.tsx",
    ]);
  });
```

Run: `cd frontend && npx vitest run tests/design-guard.test.ts`

Expected: PASS. If it fails, an earlier task left an entry behind. Go back
and migrate that file; do not edit this list.

- [ ] **Step 2: Whole-app browser pass**

At desktop (1280px) and phone (375px) widths, go through every migrated
page once, in English, 日本語 and Indonesian:

1. **Headers**: every page has one `PageHeader`, with an eyebrow on the
   list pages.
2. **States**: an empty state or alert, where the account can show one.
3. **Overflow**: no horizontal scroll (`scrollWidth === innerWidth`).
4. **Keyboard**: Tab reaches every control with a visible focus ring. The
   tabs (Culture, Admin) move with the arrow keys.

Take one screenshot per area and show them to the user.

- [ ] **Step 3: Gates and commit**

```bash
cd frontend && npm test && npm run lint && npm run type-check && npm run format:check
git add tests/design-guard.test.ts
git commit -m "test: pin the design guard to the pages left for spec 3

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
