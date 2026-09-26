# Design Foundation, Sidebar Shell and Journey Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the signed-in app a Japanese-inflected "sumi + seal" look, a
sidebar grouped by the user's journey, and a journey Home at `/dashboard`.

**Architecture:**

- **Design tokens** in `globals.css` and `tailwind.config.ts` restyle every
  page at once.
- **shadcn-style primitives** live in `components/ui/`.
- **A pure `lib/journey.ts`** decides which of 8 journey steps are done.
  `hooks/useJourney.ts` feeds it from the existing React Query hooks, and both
  the sidebar and Home read it.
- **No backend changes.**

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind 3.4 +
tailwindcss-animate, class-variance-authority, Radix (Slot, Dialog, Progress),
lucide-react, TanStack Query 5, Clerk 6, vitest 4 + jsdom + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-26-design-foundation-shell-home-design.md`

## Global Constraints

- **Paths**: all frontend commands run from `frontend/`. Tests run with
  `npx vitest run <path>`, and the full suite with `npm test`.
- **Gates before every commit**:
  - `npm test`
  - `npm run lint`
  - `npm run type-check`
  - `npx prettier --check <changed files>`
- **No new npm packages.** Use only what is already installed.
- **Every user-facing string goes through `t()`** in `lib/i18n.ts`, with en,
  id and ja. Placeholders use the existing idiom
  `t(section, key, lang).replace("{n}", value)`, the same as in
  `lib/api-error.ts`.
- **Seal (#C8452C) is a mark only.** It is never the fill of a button or
  badge, and never used for error text. Errors and destructive actions use
  `destructive` (crimson).
- **Text colours must pass WCAG AA (4.5:1).** #8F8A80 is never used for text.
- **Light only.** No `dark:` classes, and the `.dark` block is deleted.
- **Never run `npm run build` while the dev server is running.** It corrupts
  `frontend/.next`.
- **Browser verification**: the user signs in themselves. Never type their
  password.
- **Branch**: work on `ui-foundation-shell-home`. Commit after each task,
  ending messages with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push or
  merge unless the user asks.
- **Match the surrounding code**: comments explain *why*, Prettier with
  printWidth 100, double quotes, and trailing commas.

## File map

| File | Responsibility |
|---|---|
| `frontend/app/globals.css` | Colour tokens (modify) |
| `frontend/tailwind.config.ts` | Token → class mapping, `font-display` (modify) |
| `frontend/app/layout.tsx` | Shippori Mincho font, Clerk appearance (modify) |
| `frontend/components/ui/button.tsx` | Button (create) |
| `frontend/components/ui/badge.tsx` | Badge (create) |
| `frontend/components/ui/card.tsx` | Card parts (create) |
| `frontend/components/ui/progress.tsx` | Progress bar (create) |
| `frontend/components/ui/skeleton.tsx` | Loading block (create) |
| `frontend/components/ui/page-header.tsx` | Page title block (create) |
| `frontend/components/brand-mark.tsx` | Seal logo (create) |
| `frontend/lib/journey.ts` | Pure journey rules (create) |
| `frontend/lib/activity.ts` | Pure recent-activity merge and relative time (create) |
| `frontend/hooks/useJourney.ts` | Journey from existing hooks (create) |
| `frontend/components/ai-quota-meter.tsx` | Sidebar quota meter (create; replaces `ai-quota-badge.tsx`, which is deleted) |
| `frontend/components/app-shell/sidebar-nav.tsx` | Sidebar content, shared by desktop and drawer (create) |
| `frontend/components/app-shell/mobile-top-bar.tsx` | Phone top bar and drawer (create) |
| `frontend/app/dashboard/layout.tsx` | Shell (rewrite) |
| `frontend/app/dashboard/page.tsx` | Home (create) |
| `frontend/app/(auth)/layout.tsx` | BrandMark (modify) |
| `frontend/lib/i18n.ts` | `nav` keys, `aiQuota.meterTitle`, new `journey` and `home` sections (modify) |
| `frontend/app/onboarding/page.tsx`, `frontend/app/page.tsx`, `frontend/app/admin/page.tsx` | Redirects → `/dashboard` (modify) |
| ~25 page and component files | Colour-role sweep (modify, class names only) |
| `frontend/tests/lib/design-tokens.test.ts` | Tokens, contrast, sweep guard (create) |
| `frontend/tests/components/ui.test.tsx` | Primitives (create) |
| `frontend/tests/lib/journey.test.ts` | Journey rules (create) |
| `frontend/tests/lib/activity.test.ts` | Activity merge and relative time (create) |
| `frontend/tests/hooks/useJourney.test.ts` | Hook wiring (create) |
| `frontend/tests/app/dashboard-layout.test.tsx` | Shell (create) |
| `frontend/tests/app/home.test.tsx` | Home (create) |
| `frontend/tests/app/onboarding.test.tsx` | Redirect expectations (modify) |

---

### Task 1: Colour tokens, display font and Clerk theme

**Files:**
- Test: `frontend/tests/lib/design-tokens.test.ts` (create)
- Modify: `frontend/app/globals.css` (the first `@layer base { … }` block, lines 5–63)
- Modify: `frontend/tailwind.config.ts`
- Modify: `frontend/app/layout.tsx`

**Interfaces:**
- **Produces:**
  - The Tailwind colours `seal`, `seal-soft`, `indigo`, `indigo-soft`,
    `track`, `success-soft`, `warning-soft` and `destructive-soft`.
  - The Tailwind font family `font-display`.
  - Existing token names keep working.
- **Later tasks use:** `bg-seal`, `text-seal`, `bg-seal-soft`, `text-indigo`,
  `bg-indigo`, `bg-indigo-soft`, `border-indigo`, `bg-track`,
  `bg-success-soft`, `bg-warning-soft`, `bg-destructive-soft` and
  `font-display`.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/lib/design-tokens.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards on the design tokens in app/globals.css. The contrast pairs are the
 * ones the UI actually sets text on; a token edit that drops one below WCAG
 * AA fails here instead of in an accessibility audit.
 */

const FRONTEND = fileURLToPath(new URL("../..", import.meta.url));
const css = readFileSync(join(FRONTEND, "app/globals.css"), "utf8");
const tailwindConfig = readFileSync(join(FRONTEND, "tailwind.config.ts"), "utf8");

type Hsl = [number, number, number];

/** Every `--name: H S% L%;` declaration. */
function tokens(): Map<string, Hsl> {
  const out = new Map<string, Hsl>();
  for (const m of css.matchAll(/--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%;/g)) {
    out.set(m[1], [Number(m[2]), Number(m[3]), Number(m[4])]);
  }
  return out;
}

function hslToRgb([h, s, l]: Hsl): [number, number, number] {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function luminance(hsl: Hsl): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = hslToRgb(hsl);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg: string, bg: string): number {
  const all = tokens();
  const a = all.get(fg);
  const b = all.get(bg);
  if (!a || !b) throw new Error(`missing token: ${!a ? fg : bg}`);
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("design tokens", () => {
  it("defines every colour token tailwind.config.ts reads", () => {
    const defined = tokens();
    const used = [...tailwindConfig.matchAll(/hsl\(var\(--([\w-]+)\)\)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !defined.has(name))).toEqual([]);
  });

  it("has no dark palette: the app is light only", () => {
    expect(css).not.toMatch(/\.dark\s*\{/);
  });

  it.each([
    ["foreground", "background"],
    ["muted-foreground", "background"],
    ["muted-foreground", "secondary"],
    ["muted-foreground", "card"],
    ["secondary-foreground", "secondary"],
    ["primary-foreground", "primary"],
    ["seal", "background"],
    ["seal", "card"],
    ["indigo", "background"],
    ["indigo", "indigo-soft"],
    ["success", "background"],
    ["success", "success-soft"],
    ["warning", "background"],
    ["warning", "warning-soft"],
    ["destructive", "background"],
    ["destructive", "destructive-soft"],
    ["destructive-foreground", "destructive"],
  ])("%s on %s passes WCAG AA", (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run tests/lib/design-tokens.test.ts`

Expected: FAIL. The dark palette test fails (`.dark {` exists), and the
`seal` / `indigo` / `*-soft` pairs fail with "missing token".

- [ ] **Step 3: Replace the token block in `app/globals.css`**

Replace the whole first `@layer base { :root { … } .dark { … } }` block
(everything before the second `@layer base`) with:

```css
@layer base {
  /* "Sumi + seal": washi off-white, sumi ink, vermilion seal as a mark only,
     indigo for data. Values are HSL channels so Tailwind can add opacity
     (bg-primary/90). Hex equivalents are in
     docs/superpowers/specs/2026-09-26-design-foundation-shell-home-design.md,
     and tests/lib/design-tokens.test.ts checks the text pairs against WCAG AA.
     Light only: nothing in the app sets a dark theme. */
  :root {
    --background: 40 37.5% 96.9%;
    --foreground: 40 5.7% 10.4%;
    --card: 0 0% 100%;
    --card-foreground: 40 5.7% 10.4%;
    --popover: 0 0% 100%;
    --popover-foreground: 40 5.7% 10.4%;
    --primary: 40 5.7% 10.4%;
    --primary-foreground: 40 37.5% 96.9%;
    --secondary: 40 33.3% 92.9%;
    --secondary-foreground: 42 7.2% 27.1%;
    --muted: 40 33.3% 92.9%;
    --muted-foreground: 40 5.9% 39.6%;
    --accent: 40 33.3% 92.9%;
    --accent-foreground: 42 7.2% 27.1%;
    --destructive: 4.2 76.5% 40%;
    --destructive-foreground: 0 0% 100%;
    --destructive-soft: 6.9 76.5% 93.3%;
    --success: 152 39% 30.2%;
    --success-foreground: 0 0% 100%;
    --success-soft: 147.7 30.2% 91.6%;
    --warning: 33.1 91.7% 32.9%;
    --warning-foreground: 0 0% 100%;
    --warning-soft: 38.7 79.5% 92.4%;
    --seal: 9.6 63.9% 47.8%;
    --seal-soft: 12.9 77.8% 92.9%;
    --indigo: 217.2 45.3% 25.1%;
    --indigo-soft: 215.3 43.6% 92.4%;
    --track: 40 28.3% 89.6%;
    --border: 38.6 22.6% 87.8%;
    --input: 40 18.7% 81.2%;
    --ring: 217.2 45.3% 25.1%;
    --radius: 0.5rem;
  }
}
```

Leave the second `@layer base` block (the focus floor and `body`) unchanged.

- [ ] **Step 4: Register the colours and the font in `tailwind.config.ts`**

In `theme.extend.fontFamily`, add after `jp`:

```ts
        // Page titles only (PageHeader). Japanese glyphs fall back to Noto Sans JP.
        display: ["var(--font-display)", "var(--font-noto-sans-jp)", "serif"],
```

In `theme.extend.colors`, replace the `destructive`, `success` and `warning`
entries, and add the four new entries after `card`:

```ts
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          soft: "hsl(var(--destructive-soft))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          soft: "hsl(var(--success-soft))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          soft: "hsl(var(--warning-soft))",
        },
```

```ts
        // A mark, never a button or error colour: see the rules in globals.css.
        seal: {
          DEFAULT: "hsl(var(--seal))",
          soft: "hsl(var(--seal-soft))",
        },
        // Extends Tailwind's indigo scale (indigo-50…900 still exist) with the
        // app's own indigo as DEFAULT, for text-indigo / bg-indigo.
        indigo: {
          DEFAULT: "hsl(var(--indigo))",
          soft: "hsl(var(--indigo-soft))",
        },
        track: "hsl(var(--track))",
```

- [ ] **Step 5: Load Shippori Mincho and theme Clerk in `app/layout.tsx`**

Change the font import and add the font after `notoSansJP`:

```tsx
import { Noto_Sans, Noto_Sans_JP, Shippori_Mincho } from "next/font/google";
```

```tsx
// Page titles only (font-display). next/font self-hosts every unicode-range
// file from Google's CSS, so kanji render in Mincho too; `subsets` only
// chooses what is preloaded.
const shipporiMincho = Shippori_Mincho({
  weight: ["600", "700"],
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

// Clerk draws its sign-in card and account menu with its own theme. These
// match them to the tokens in globals.css (hex, because Clerk can't read CSS
// variables for colour maths).
const clerkAppearance = {
  variables: {
    colorPrimary: "#1C1B19",
    colorBackground: "#FFFFFF",
    colorText: "#1C1B19",
    colorTextSecondary: "#6B675F",
    colorDanger: "#B42318",
    borderRadius: "0.5rem",
    fontFamily: "var(--font-noto-sans), var(--font-noto-sans-jp), sans-serif",
  },
};
```

Then change `<ClerkProvider>` to `<ClerkProvider appearance={clerkAppearance}>`
and the `<html>` className to:

```tsx
      <html
        lang={lang}
        className={`${notoSans.variable} ${notoSansJP.variable} ${shipporiMincho.variable}`}
      >
```

- [ ] **Step 6: Run the tests**

Run: `cd frontend && npx vitest run tests/lib/design-tokens.test.ts && npm test`

Expected: all pass (design-tokens 19 tests, and the existing 330 unchanged).

- [ ] **Step 7: Gates and commit**

```bash
cd frontend && npm run lint && npm run type-check && npx prettier --check app/globals.css tailwind.config.ts app/layout.tsx tests/lib/design-tokens.test.ts
git add app/globals.css tailwind.config.ts app/layout.tsx tests/lib/design-tokens.test.ts
git commit -m "feat(ui): sumi + seal design tokens, Mincho display font, themed Clerk

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Colour-role sweep

`primary` is now ink. The places that used it as an *accent* (links,
highlights, focus rings, tinted panels) switch to indigo. The changes are
class names only.

**Files:**
- Test: `frontend/tests/lib/design-tokens.test.ts` (add one test)
- Modify: every `.tsx` under `frontend/app` and `frontend/components` that
  matches the patterns below (about 25 files)

**Interfaces:**
- **Consumes:** `text-indigo`, `bg-indigo-soft` and `ring-ring` from Task 1.
- **Produces:** nothing new.

- [ ] **Step 1: Write the failing guard test**

Append to `frontend/tests/lib/design-tokens.test.ts`:

```ts
import { readdirSync } from "node:fs";

describe("colour roles", () => {
  // primary is ink: right for fills (bg-primary) and selected borders, wrong
  // for accents, where it turns links and focus rings black. Accents use indigo.
  const ACCENT_MISUSES = [
    /\btext-primary(?![-\w])/,
    /\bring-primary\b/,
    /\bbg-primary\/(?:5|10)\b/,
  ];

  it("uses indigo, not primary, for accents", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "components"]) {
      const files = readdirSync(join(FRONTEND, dir), { recursive: true }) as string[];
      for (const file of files.filter((f) => f.endsWith(".tsx"))) {
        const source = readFileSync(join(FRONTEND, dir, file), "utf8");
        for (const pattern of ACCENT_MISUSES) {
          if (pattern.test(source)) offenders.push(`${dir}/${file}: ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

Move the new `readdirSync` import up into the existing `node:fs` import line,
so the file has a single `import { readFileSync, readdirSync } from "node:fs";`.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run tests/lib/design-tokens.test.ts -t "colour roles"`

Expected: FAIL, listing about 25 files.

- [ ] **Step 3: Apply the sweep**

```bash
cd frontend
files=$(grep -rlE 'text-primary|ring-primary|bg-primary/(5|10)' app components --include='*.tsx')
perl -pi -e 's/\bring-primary\b/ring-ring/g; s/\btext-primary(?![-\w])/text-indigo/g; s/\bbg-primary\/(?:5|10)\b/bg-indigo-soft/g' $files
grep -rnP '\btext-primary(?![-\w])|\bring-primary\b|\bbg-primary/(5|10)\b' app components || echo "sweep clean"
```

Expected last line: `sweep clean`. `text-primary-foreground`, `bg-primary`,
`border-primary*` and `bg-primary-foreground/*` must be untouched. Check
with `git diff --stat` and a skim of `git diff`: only these three kinds of
replacement should appear.

- [ ] **Step 4: Run the full suite**

Run: `cd frontend && npm test`

Expected: all pass. No existing test asserts class names.

- [ ] **Step 5: Gates and commit**

```bash
cd frontend && npm run lint && npm run type-check && npx prettier --check $(git diff --name-only -- app components tests)
git add -A app components tests/lib/design-tokens.test.ts
git commit -m "refactor(ui): move accent uses of primary to indigo

primary is now sumi ink. Links, highlights, tinted panels and focus rings
used it as an accent and would have turned black, so they use indigo.
Ink fills and selected borders keep primary.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Shared UI primitives and BrandMark

**Files:**
- Create: `frontend/components/ui/button.tsx`, `badge.tsx`, `card.tsx`,
  `progress.tsx`, `skeleton.tsx`, `page-header.tsx`
- Create: `frontend/components/brand-mark.tsx`
- Test: `frontend/tests/components/ui.test.tsx`

**Interfaces:**
- **Produces:**
  - `Button`: props `variant?: "primary" | "secondary" | "ghost" |
    "destructive" | "link"`, `size?: "sm" | "md" | "lg" | "icon"`,
    `asChild?: boolean` and `loading?: boolean`, plus native button props.
    It also exports `buttonVariants`.
  - `Badge`: props `variant?: "neutral" | "info" | "success" | "warning" |
    "danger"`, plus span props.
  - `Card`, `CardHeader`, `CardTitle` (`as?: "h2" | "h3" | "h4"`, default
    `h2`), `CardDescription`, `CardContent` and `CardFooter`.
  - `Progress`: props `value: number`, `max?: number` (default 100) and
    `className?`, plus `aria-label` or `aria-labelledby` (one is required).
  - `Skeleton`: div props.
  - `PageHeader`: props `title: ReactNode`, `eyebrow?`, `description?`,
    `actions?`, `children?` and `className?`.
  - `BrandMark`: props `compact?: boolean` and `className?`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/components/ui.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { BrandMark } from "@/components/brand-mark";

describe("Button", () => {
  it("is a plain button by default, so it never submits a form by accident", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
  });

  it("renders its child instead with asChild, keeping the button styling", () => {
    render(
      <Button asChild>
        <a href="/dashboard/resumes">Resumes</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Resumes" });
    expect(link).toHaveAttribute("href", "/dashboard/resumes");
    expect(link.className).toContain("bg-primary");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("is disabled and busy while loading", () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("is not marked busy when idle", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).not.toHaveAttribute("aria-busy");
  });
});

describe("CardTitle", () => {
  it("is an h2 unless told otherwise", () => {
    render(
      <>
        <CardTitle>Default</CardTitle>
        <CardTitle as="h3">Nested</CardTitle>
      </>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Default" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Nested" })).toBeInTheDocument();
  });
});

describe("PageHeader", () => {
  it("renders the title as the page's one h1, with its eyebrow and actions", () => {
    render(
      <PageHeader
        eyebrow="Prepare"
        title="履歴書"
        description="Generate a rirekisho"
        actions={<Button>New</Button>}
      />,
    );
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("履歴書");
    expect(screen.getByText("Prepare")).toBeInTheDocument();
    expect(screen.getByText("Generate a rirekisho")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });
});

describe("Progress", () => {
  it("exposes its value and name to assistive tech", () => {
    render(<Progress value={4} max={8} aria-label="Journey progress" />);
    const bar = screen.getByRole("progressbar", { name: "Journey progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "4");
    expect(bar).toHaveAttribute("aria-valuemax", "8");
  });

  it("clamps a value past max instead of overflowing", () => {
    render(<Progress value={12} max={8} aria-label="Quota" />);
    expect(screen.getByRole("progressbar", { name: "Quota" })).toHaveAttribute(
      "aria-valuenow",
      "8",
    );
  });
});

describe("Skeleton", () => {
  it("is hidden from assistive tech", () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("BrandMark", () => {
  it("names the product even when compact", () => {
    render(<BrandMark compact />);
    expect(screen.getByText("Japan Job Support")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx vitest run tests/components/ui.test.tsx`

Expected: FAIL, "Failed to resolve import `@/components/ui/button`".

- [ ] **Step 3: Implement the primitives**

`frontend/components/ui/button.tsx`:

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "border border-input bg-card text-foreground hover:bg-secondary",
        ghost: "text-foreground hover:bg-secondary",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-indigo underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-11 px-6",
        icon: "h-10 w-10",
      },
    },
    // Compound classes come after the size's, so tailwind-merge lets a link
    // drop the button height and padding.
    compoundVariants: [{ variant: "link", class: "h-auto px-0" }],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render the single child (e.g. a Next Link) with the button's styling. */
  asChild?: boolean;
  /** Show a spinner and disable. Ignored with asChild: a link has nothing to wait for. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, disabled, type, children, ...props },
    ref,
  ) => {
    const classes = cn(buttonVariants({ variant, size }), className);
    if (asChild) {
      return (
        <Slot ref={ref} className={classes} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button
        ref={ref}
        // A bare <button> inside a form submits it; every submit button says so.
        type={type ?? "button"}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && (
          <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
```

`frontend/components/ui/badge.tsx`:

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// No seal variant on purpose: seal is a mark, and a red badge would read as an error.
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        neutral: "bg-secondary text-secondary-foreground",
        info: "bg-indigo-soft text-indigo",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        danger: "bg-destructive-soft text-destructive",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
```

`frontend/components/ui/card.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

// Borders, not shadows: cards sit on the washi background with a 1px line.
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-lg border bg-card text-card-foreground", className)} {...props} />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5", className)} {...props} />;
}

export function CardTitle({
  as: Heading = "h2",
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" | "h4" }) {
  return <Heading className={cn("text-lg font-semibold leading-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-2 p-5 pt-0", className)} {...props} />;
}
```

`frontend/components/ui/progress.tsx`:

```tsx
"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

type ProgressProps = Omit<
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>,
  "value" | "max"
> & {
  value: number;
  max?: number;
} & ({ "aria-label": string } | { "aria-labelledby": string });

export function Progress({ className, value, max = 100, ...props }: ProgressProps) {
  // Radix logs an error for a value outside 0..max, so clamp before passing it on.
  const clamped = Math.min(Math.max(value, 0), max);
  const percent = max > 0 ? (clamped / max) * 100 : 0;
  return (
    <ProgressPrimitive.Root
      value={clamped}
      max={max}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-track", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full bg-indigo transition-[width] motion-reduce:transition-none"
        style={{ width: `${percent}%` }}
      />
    </ProgressPrimitive.Root>
  );
}
```

`frontend/components/ui/skeleton.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-track motion-reduce:animate-none", className)}
      {...props}
    />
  );
}
```

`frontend/components/ui/page-header.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  /** The journey stage, e.g. "Prepare". */
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Extra content under the description, such as a progress bar. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * The page's title block. The title is the page's only <h1>, so every page
 * keeps a single top-level heading that tests and screen readers can find.
 */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-seal">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-2xl font-bold leading-tight sm:text-[28px]">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
```

`frontend/components/brand-mark.tsx`:

```tsx
import { cn } from "@/lib/utils";

/**
 * The seal logo: a vermilion circle with 職 ("job"), and the wordmark. The
 * seal is decorative; the wordmark carries the name, visually hidden when
 * compact so a link wrapping it still has one.
 */
export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-seal font-jp text-[13px] font-bold text-white"
      >
        職
      </span>
      <span className={cn("whitespace-nowrap text-[15px] font-bold", compact && "sr-only")}>
        Japan Job Support
      </span>
    </span>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run tests/components/ui.test.tsx`

Expected: PASS, 10 tests.

- [ ] **Step 5: Gates and commit**

```bash
cd frontend && npm test && npm run lint && npm run type-check && npx prettier --check components/ui components/brand-mark.tsx tests/components/ui.test.tsx
git add components/ui/button.tsx components/ui/badge.tsx components/ui/card.tsx components/ui/progress.tsx components/ui/skeleton.tsx components/ui/page-header.tsx components/brand-mark.tsx tests/components/ui.test.tsx
git commit -m "feat(ui): Button, Badge, Card, Progress, Skeleton, PageHeader and BrandMark

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The journey model

**Files:**
- Create: `frontend/lib/journey.ts`
- Test: `frontend/tests/lib/journey.test.ts`

**Interfaces:**
- **Consumes:** types from `@/types/api`: `MeResponse`, `Resume`,
  `ResumeAnalysis`, `Document`, `JobApplication`, `InterviewSession` and
  `VisaConsultationListItem`.
- **Produces** (exact exports):
  - `type StageId = "prepare" | "apply" | "settleIn"`
  - `type StepId = "profile" | "resumeUploaded" | "resumeAnalysed" |
    "rirekisho" | "shokumu" | "application" | "interview" | "visa"`
  - `type StepState = "done" | "todo" | "unknown"`
  - `interface JourneyStep { id: StepId; stage: StageId; state: StepState;
    href: string }`
  - `interface JourneyStage { id: StageId; steps: JourneyStep[]; done:
    number; total: number; complete: boolean; hasUnknown: boolean }`
  - `interface Journey { stages: JourneyStage[]; doneCount: number; total:
    number; next: JourneyStep | null; allDone: boolean }`
  - `interface JourneyInput { me: MeResponse | undefined; resumes: Resume[]
    | undefined; primaryAnalysis: ResumeAnalysis | null | undefined;
    documents: Document[] | undefined; applications: JobApplication[] |
    undefined; interviewSessions: InterviewSession[] | undefined;
    visaConsultations: VisaConsultationListItem[] | undefined }`
  - `function pickPrimaryResume(resumes: Resume[]): Resume | undefined`
  - `function computeJourney(input: JourneyInput): Journey`

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/lib/journey.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeJourney, pickPrimaryResume, type JourneyInput, type StepId } from "@/lib/journey";
import type {
  Document,
  InterviewSession,
  JobApplication,
  MeResponse,
  Resume,
  ResumeAnalysis,
  VisaConsultationListItem,
} from "@/types/api";

// Only the fields the journey reads; the casts keep fixtures readable.
const resume = (id: string, created_at: string, is_primary = false) =>
  ({ id, created_at, is_primary }) as Resume;
const doc = (document_type: Document["document_type"], status: Document["status"]) =>
  ({ id: `${document_type}-${status}`, document_type, status }) as Document;
const session = (status: InterviewSession["status"]) =>
  ({ id: `s-${status}`, status }) as InterviewSession;
const ANALYSIS = { id: "a1", created_at: "2026-09-02T00:00:00+00:00" } as ResumeAnalysis;

/** A brand-new user: everything loaded, nothing done. */
const NEW_USER: JourneyInput = {
  me: { rirekisho_ready: false } as MeResponse,
  resumes: [],
  primaryAnalysis: null,
  documents: [],
  applications: [],
  interviewSessions: [],
  visaConsultations: [],
};

/** A user who has done every step. */
const FINISHED: JourneyInput = {
  me: { rirekisho_ready: true } as MeResponse,
  resumes: [resume("r1", "2026-09-01T00:00:00+00:00", true)],
  primaryAnalysis: ANALYSIS,
  documents: [doc("rirekisho", "completed"), doc("shokumukeirekisho", "completed")],
  applications: [{ id: "app1" } as JobApplication],
  interviewSessions: [session("completed")],
  visaConsultations: [{ id: "v1" } as VisaConsultationListItem],
};

function stateOf(input: JourneyInput, id: StepId) {
  const step = computeJourney(input).stages.flatMap((s) => s.steps).find((s) => s.id === id);
  if (!step) throw new Error(`no step ${id}`);
  return step.state;
}

describe("computeJourney: what counts as done", () => {
  it.each<[StepId, Partial<JourneyInput>]>([
    ["profile", { me: { rirekisho_ready: true } as MeResponse }],
    ["resumeUploaded", { resumes: [resume("r1", "2026-09-01T00:00:00+00:00")] }],
    [
      "resumeAnalysed",
      { resumes: [resume("r1", "2026-09-01T00:00:00+00:00")], primaryAnalysis: ANALYSIS },
    ],
    ["rirekisho", { documents: [doc("rirekisho", "completed")] }],
    ["shokumu", { documents: [doc("shokumukeirekisho", "completed")] }],
    ["application", { applications: [{ id: "app1" } as JobApplication] }],
    ["interview", { interviewSessions: [session("completed")] }],
    ["visa", { visaConsultations: [{ id: "v1" } as VisaConsultationListItem] }],
  ])("%s is done with its evidence and to do without it", (id, evidence) => {
    expect(stateOf(NEW_USER, id)).toBe("todo");
    expect(stateOf({ ...NEW_USER, ...evidence }, id)).toBe("done");
  });

  it("does not count a document that is still generating or failed", () => {
    const input = {
      ...NEW_USER,
      documents: [doc("rirekisho", "processing"), doc("rirekisho", "failed")],
    };
    expect(stateOf(input, "rirekisho")).toBe("todo");
  });

  it("does not count a rirekisho as a shokumu keirekisho", () => {
    expect(stateOf({ ...NEW_USER, documents: [doc("rirekisho", "completed")] }, "shokumu")).toBe(
      "todo",
    );
  });

  it("does not count an abandoned or unfinished interview", () => {
    const input = { ...NEW_USER, interviewSessions: [session("abandoned"), session("active")] };
    expect(stateOf(input, "interview")).toBe("todo");
  });

  it("treats a resume without an analysis as not analysed", () => {
    const input = {
      ...NEW_USER,
      resumes: [resume("r1", "2026-09-01T00:00:00+00:00")],
      primaryAnalysis: null,
    };
    expect(stateOf(input, "resumeAnalysed")).toBe("todo");
  });
});

describe("computeJourney: sources that failed to load", () => {
  it.each<[keyof JourneyInput, StepId[]]>([
    ["me", ["profile"]],
    ["resumes", ["resumeUploaded", "resumeAnalysed"]],
    ["documents", ["rirekisho", "shokumu"]],
    ["applications", ["application"]],
    ["interviewSessions", ["interview"]],
    ["visaConsultations", ["visa"]],
  ])("an unloaded %s makes %j unknown", (source, steps) => {
    const input = { ...FINISHED, [source]: undefined };
    for (const id of steps) expect(stateOf(input, id)).toBe("unknown");
  });

  it("makes the analysis step unknown when the analysis failed to load", () => {
    expect(stateOf({ ...FINISHED, primaryAnalysis: undefined }, "resumeAnalysed")).toBe("unknown");
  });

  it("never counts an unknown step as done", () => {
    const journey = computeJourney({ ...FINISHED, documents: undefined });
    expect(journey.doneCount).toBe(6);
    expect(journey.allDone).toBe(false);
  });

  it("never picks an unknown step as the next step", () => {
    const journey = computeJourney({ ...NEW_USER, me: undefined });
    expect(journey.next?.id).toBe("resumeUploaded");
  });

  it("flags a stage with an unknown step, so its count isn't shown wrong", () => {
    const stages = computeJourney({ ...FINISHED, documents: undefined }).stages;
    expect(stages.map((s) => [s.id, s.hasUnknown])).toEqual([
      ["prepare", true],
      ["apply", false],
      ["settleIn", false],
    ]);
  });
});

describe("computeJourney: next step and totals", () => {
  it("suggests the first unfinished step in journey order", () => {
    const input = {
      ...NEW_USER,
      me: { rirekisho_ready: true } as MeResponse,
      visaConsultations: [{ id: "v1" } as VisaConsultationListItem],
    };
    expect(computeJourney(input).next?.id).toBe("resumeUploaded");
  });

  it("counts done steps per stage and overall", () => {
    // Apply is half done: a stage is complete only when every step is.
    const journey = computeJourney({ ...FINISHED, interviewSessions: [], visaConsultations: [] });
    expect(journey.stages.map((s) => [s.id, s.done, s.total, s.complete])).toEqual([
      ["prepare", 5, 5, true],
      ["apply", 1, 2, false],
      ["settleIn", 0, 1, false],
    ]);
    expect([journey.doneCount, journey.total]).toEqual([6, 8]);
    expect(journey.next?.id).toBe("interview");
  });

  it("is all done only when all eight steps are done", () => {
    const journey = computeJourney(FINISHED);
    expect(journey.allDone).toBe(true);
    expect(journey.next).toBeNull();
    expect(computeJourney({ ...FINISHED, visaConsultations: [] }).allDone).toBe(false);
  });

  it("has no next step when everything left is unknown", () => {
    const journey = computeJourney({ ...FINISHED, visaConsultations: undefined });
    expect(journey.next).toBeNull();
    expect(journey.allDone).toBe(false);
  });
});

describe("primary resume", () => {
  const older = resume("old", "2026-08-01T00:00:00+00:00");
  const newer = resume("new", "2026-09-01T00:00:00+00:00");

  it("is the one marked primary", () => {
    const marked = resume("marked", "2026-07-01T00:00:00+00:00", true);
    expect(pickPrimaryResume([newer, marked, older])?.id).toBe("marked");
  });

  it("is the newest when none is marked", () => {
    expect(pickPrimaryResume([older, newer])?.id).toBe("new");
  });

  it("is where the analysis step links", () => {
    const step = computeJourney({ ...NEW_USER, resumes: [older, newer] })
      .stages[0].steps.find((s) => s.id === "resumeAnalysed");
    expect(step?.href).toBe("/dashboard/resumes/new");
  });

  it("links the analysis step to the resume list when there is no resume", () => {
    const step = computeJourney(NEW_USER).stages[0].steps.find((s) => s.id === "resumeAnalysed");
    expect(step?.href).toBe("/dashboard/resumes");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx vitest run tests/lib/journey.test.ts`

Expected: FAIL, "Failed to resolve import `@/lib/journey`".

- [ ] **Step 3: Implement `frontend/lib/journey.ts`**

```ts
import type {
  Document,
  DocumentType,
  InterviewSession,
  JobApplication,
  MeResponse,
  Resume,
  ResumeAnalysis,
  VisaConsultationListItem,
} from "@/types/api";

/**
 * The user's move to Japan as eight steps in three stages. Pure: no React, no
 * fetching. hooks/useJourney.ts feeds it; the sidebar and Home render it.
 */

export type StageId = "prepare" | "apply" | "settleIn";
export type StepId =
  | "profile"
  | "resumeUploaded"
  | "resumeAnalysed"
  | "rirekisho"
  | "shokumu"
  | "application"
  | "interview"
  | "visa";
/** "unknown": the data behind the step couldn't be loaded. */
export type StepState = "done" | "todo" | "unknown";

export interface JourneyStep {
  id: StepId;
  stage: StageId;
  state: StepState;
  href: string;
}

export interface JourneyStage {
  id: StageId;
  steps: JourneyStep[];
  done: number;
  total: number;
  complete: boolean;
  /** Any step unknown: the stage's count would be wrong, so it isn't shown. */
  hasUnknown: boolean;
}

export interface Journey {
  stages: JourneyStage[];
  doneCount: number;
  total: number;
  next: JourneyStep | null;
  allDone: boolean;
}

/**
 * Each field is undefined when its source couldn't be loaded. primaryAnalysis
 * is null when the primary resume has no analysis yet.
 */
export interface JourneyInput {
  me: MeResponse | undefined;
  resumes: Resume[] | undefined;
  primaryAnalysis: ResumeAnalysis | null | undefined;
  documents: Document[] | undefined;
  applications: JobApplication[] | undefined;
  interviewSessions: InterviewSession[] | undefined;
  visaConsultations: VisaConsultationListItem[] | undefined;
}

const STAGE_ORDER: StageId[] = ["prepare", "apply", "settleIn"];

/** The resume marked primary, else the newest: the one the analysis step is about. */
export function pickPrimaryResume(resumes: Resume[]): Resume | undefined {
  return (
    resumes.find((r) => r.is_primary) ??
    [...resumes].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0]
  );
}

function stateOf(known: boolean, done: boolean): StepState {
  if (!known) return "unknown";
  return done ? "done" : "todo";
}

function analysisState(
  resumes: Resume[] | undefined,
  primary: Resume | undefined,
  primaryAnalysis: ResumeAnalysis | null | undefined,
): StepState {
  if (resumes === undefined) return "unknown";
  // With no resume there is nothing to analyse yet: "to do", not unknown.
  if (primary === undefined) return "todo";
  if (primaryAnalysis === undefined) return "unknown";
  return primaryAnalysis === null ? "todo" : "done";
}

// Only a finished generation counts: a pending or failed one is not a document yet.
function hasCompleted(documents: Document[], type: DocumentType): boolean {
  return documents.some((d) => d.document_type === type && d.status === "completed");
}

export function computeJourney(input: JourneyInput): Journey {
  const { me, resumes, documents, applications, interviewSessions, visaConsultations } = input;
  const primary = resumes ? pickPrimaryResume(resumes) : undefined;

  // Order is the journey order, and also the dependency order: next is the
  // first "todo", so an analysis is never suggested before an upload.
  const steps: JourneyStep[] = [
    {
      id: "profile",
      stage: "prepare",
      href: "/dashboard/settings",
      state: stateOf(me !== undefined, me?.rirekisho_ready === true),
    },
    {
      id: "resumeUploaded",
      stage: "prepare",
      href: "/dashboard/resumes",
      state: stateOf(resumes !== undefined, (resumes?.length ?? 0) > 0),
    },
    {
      id: "resumeAnalysed",
      stage: "prepare",
      href: primary ? `/dashboard/resumes/${primary.id}` : "/dashboard/resumes",
      state: analysisState(resumes, primary, input.primaryAnalysis),
    },
    {
      id: "rirekisho",
      stage: "prepare",
      href: "/dashboard/documents/rirekisho/new",
      state: stateOf(documents !== undefined, !!documents && hasCompleted(documents, "rirekisho")),
    },
    {
      id: "shokumu",
      stage: "prepare",
      href: "/dashboard/documents/shokumu/new",
      state: stateOf(
        documents !== undefined,
        !!documents && hasCompleted(documents, "shokumukeirekisho"),
      ),
    },
    {
      id: "application",
      stage: "apply",
      href: "/dashboard/jobs",
      state: stateOf(applications !== undefined, (applications?.length ?? 0) > 0),
    },
    {
      id: "interview",
      stage: "apply",
      href: "/dashboard/interview/new",
      state: stateOf(
        interviewSessions !== undefined,
        interviewSessions?.some((s) => s.status === "completed") ?? false,
      ),
    },
    {
      id: "visa",
      stage: "settleIn",
      href: "/dashboard/visa",
      state: stateOf(visaConsultations !== undefined, (visaConsultations?.length ?? 0) > 0),
    },
  ];

  const stages = STAGE_ORDER.map((id): JourneyStage => {
    const own = steps.filter((s) => s.stage === id);
    const done = own.filter((s) => s.state === "done").length;
    return {
      id,
      steps: own,
      done,
      total: own.length,
      complete: done === own.length,
      hasUnknown: own.some((s) => s.state === "unknown"),
    };
  });

  const doneCount = steps.filter((s) => s.state === "done").length;
  return {
    stages,
    doneCount,
    total: steps.length,
    next: steps.find((s) => s.state === "todo") ?? null,
    allDone: doneCount === steps.length,
  };
}
```

Run Prettier on the file (`npx prettier --write lib/journey.ts`) **before**
Step 5, because the mutation patterns below must match the formatted text.

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run tests/lib/journey.test.ts`

Expected: PASS, 30 tests.

- [ ] **Step 5: Mutation check: prove the tests catch broken rules**

Save as `$TMPDIR/mutate-journey.sh` and run it from `frontend/`:

```bash
#!/usr/bin/env bash
# Each mutation must make tests/lib/journey.test.ts fail. A mutation whose
# pattern isn't found aborts: it would otherwise "pass" by mutating nothing.
set -u
f=lib/journey.ts
backup=$(mktemp)
cp "$f" "$backup"
trap 'cp "$backup" "$f"' EXIT
run() { npx vitest run tests/lib/journey.test.ts >/dev/null 2>&1; }
run || { echo "BASELINE FAILS: fix the tests first"; exit 1; }
survivors=0
while IFS='|' read -r from to; do
  [ -z "$from" ] && continue
  python3 - "$f" "$from" "$to" <<'PY' || { echo "PATTERN MISS: $from"; exit 1; }
import sys
path, old, new = sys.argv[1:]
src = open(path).read()
if src.count(old) != 1: sys.exit(1)
open(path, "w").write(src.replace(old, new))
PY
  if run; then echo "SURVIVED: $from -> $to"; survivors=$((survivors + 1)); else echo "killed:   $from"; fi
  cp "$backup" "$f"
done <<'EOF'
me?.rirekisho_ready === true|me !== undefined
stateOf(me !== undefined,|stateOf(true,
(resumes?.length ?? 0) > 0|(resumes?.length ?? 0) >= 0
resumes.find((r) => r.is_primary)|resumes.find((r) => !r.is_primary)
Date.parse(b.created_at) - Date.parse(a.created_at)|Date.parse(a.created_at) - Date.parse(b.created_at)
if (resumes === undefined) return "unknown";|if (resumes === undefined) return "todo";
if (primary === undefined) return "todo";|if (primary === undefined) return "unknown";
if (primaryAnalysis === undefined) return "unknown";|if (primaryAnalysis === undefined) return "todo";
return primaryAnalysis === null ? "todo" : "done";|return primaryAnalysis === null ? "done" : "todo";
hasCompleted(documents, "rirekisho")|hasCompleted(documents, "shokumukeirekisho")
d.status === "completed"|d.status !== "failed"
s.status === "completed"|s.status !== "abandoned"
(applications?.length ?? 0) > 0|(applications?.length ?? 0) >= 0
(visaConsultations?.length ?? 0) > 0|(visaConsultations?.length ?? 0) >= 0
complete: done === own.length|complete: done > 0
hasUnknown: own.some((s) => s.state === "unknown")|hasUnknown: false
steps.find((s) => s.state === "todo")|steps.find((s) => s.state !== "done")
allDone: doneCount === steps.length|allDone: doneCount >= steps.length - 1
EOF
echo "survivors: $survivors"
[ "$survivors" -eq 0 ]
```

Every pattern must match exactly once in the Prettier-formatted file; the
script's `PATTERN MISS` exit tells you if one doesn't. If a mutation
survives, add the test that kills it; never delete the mutation.

Expected: `survivors: 0`, and `git diff lib/journey.ts` empty afterwards.

- [ ] **Step 6: Gates and commit**

```bash
cd frontend && npm test && npm run lint && npm run type-check && npx prettier --check lib/journey.ts tests/lib/journey.test.ts
git add lib/journey.ts tests/lib/journey.test.ts
git commit -m "feat(home): journey model that decides which of the eight steps are done

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `useJourney` hook

**Files:**
- Create: `frontend/hooks/useJourney.ts`
- Test: `frontend/tests/hooks/useJourney.test.ts`

**Interfaces:**
- **Consumes:**
  - `computeJourney`, `pickPrimaryResume`, `Journey`, `JourneyInput` and
    `StepId` from Task 4.
  - The existing hooks:
    - `useMe()` → `{ data?: MeResponse, isLoading }`
    - `useResumes()` → `{ data?: { items: Resume[] }, isLoading }`
    - `useResumeAnalysis(id)` → `{ data?: ResumeAnalysis | null, error,
      isLoading }`
    - `useDocuments()` → `{ data?: { items: Document[] }, isLoading }`
    - `useApplications()` → `{ data?: JobApplication[], isLoading }`
    - `useInterviewSessions()` → `{ data?: InterviewSession[], isLoading }`
    - `useVisaConsultations()` → `{ data?: VisaConsultationListItem[],
      isLoading }`
- **Produces:** `useJourney(): { journey: Journey; input: JourneyInput;
  isLoading: boolean; retry: (step: StepId) => void }`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/hooks/useJourney.test.ts`:

```ts
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Resume } from "@/types/api";

/**
 * The data hooks are mocked: what's under test is how their loading, error
 * and 404 states become journey inputs, and which queries a retry refreshes.
 * The journey rules themselves are tested in tests/lib/journey.test.ts.
 */

type Q = { data?: unknown; error?: unknown; isLoading?: boolean };
const q = vi.hoisted(() => ({
  me: {} as Q,
  resumes: {} as Q,
  analysis: {} as Q,
  analysisResumeIds: [] as string[],
  documents: {} as Q,
  applications: {} as Q,
  interviews: {} as Q,
  visa: {} as Q,
  invalidated: [] as unknown[][],
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: ({ queryKey }: { queryKey: unknown[] }) => {
      q.invalidated.push(queryKey);
      return Promise.resolve();
    },
  }),
}));
vi.mock("@/hooks/useMe", () => ({ useMe: () => q.me }));
vi.mock("@/hooks/useResumes", () => ({
  useResumes: () => q.resumes,
  useResumeAnalysis: (id: string) => {
    q.analysisResumeIds.push(id);
    return q.analysis;
  },
}));
vi.mock("@/hooks/useDocuments", () => ({ useDocuments: () => q.documents }));
vi.mock("@/hooks/useApplications", () => ({ useApplications: () => q.applications }));
vi.mock("@/hooks/useInterview", () => ({ useInterviewSessions: () => q.interviews }));
vi.mock("@/hooks/useVisa", () => ({ useVisaConsultations: () => q.visa }));

const { useJourney } = await import("@/hooks/useJourney");

const loaded = (data: unknown): Q => ({ data, error: null, isLoading: false });
const failed: Q = { data: undefined, error: new Error("down"), isLoading: false };
const loading: Q = { data: undefined, error: null, isLoading: true };

const RESUMES = [
  { id: "old", created_at: "2026-08-01T00:00:00+00:00", is_primary: true },
  { id: "new", created_at: "2026-09-01T00:00:00+00:00", is_primary: false },
] as Resume[];

beforeEach(() => {
  q.me = loaded({ rirekisho_ready: true });
  q.resumes = loaded({ items: RESUMES, total: 2 });
  q.analysis = loaded(null);
  q.analysisResumeIds = [];
  q.documents = loaded({ items: [], total: 0 });
  q.applications = loaded([]);
  q.interviews = loaded([]);
  q.visa = loaded([]);
  q.invalidated = [];
});

function stepState(id: string) {
  const { result } = renderHook(() => useJourney());
  return result.current.journey.stages.flatMap((s) => s.steps).find((s) => s.id === id)?.state;
}

describe("useJourney", () => {
  it("asks for the analysis of the primary resume", () => {
    renderHook(() => useJourney());
    expect(q.analysisResumeIds.at(-1)).toBe("old");
  });

  it("reads a missing analysis (the hook's 404) as not analysed yet", () => {
    q.analysis = loaded(null);
    expect(stepState("resumeAnalysed")).toBe("todo");
  });

  it("reads a failed analysis request as unknown", () => {
    q.analysis = failed;
    expect(stepState("resumeAnalysed")).toBe("unknown");
  });

  it("reads a failed source as unknown", () => {
    q.documents = failed;
    expect(stepState("rirekisho")).toBe("unknown");
    expect(stepState("shokumu")).toBe("unknown");
  });

  it("unwraps the paged lists", () => {
    q.documents = loaded({
      items: [{ id: "d1", document_type: "rirekisho", status: "completed" }],
      total: 1,
    });
    expect(stepState("rirekisho")).toBe("done");
    expect(stepState("resumeUploaded")).toBe("done");
  });

  it.each(["me", "resumes", "analysis", "documents", "applications", "interviews", "visa"] as const)(
    "is loading while %s loads",
    (source) => {
      q[source] = loading;
      const { result } = renderHook(() => useJourney());
      expect(result.current.isLoading).toBe(true);
    },
  );

  it("is not loading once everything has settled, failures included", () => {
    q.visa = failed;
    const { result } = renderHook(() => useJourney());
    expect(result.current.isLoading).toBe(false);
  });

  it.each([
    ["profile", ["me"]],
    ["resumeAnalysed", ["resumes"]],
    ["shokumu", ["documents"]],
    ["application", ["jobs", "applications"]],
    ["interview", ["interview", "sessions"]],
    ["visa", ["visa", "consultations"]],
  ] as const)("retrying %s refreshes the queries behind it", (step, key) => {
    const { result } = renderHook(() => useJourney());
    result.current.retry(step);
    expect(q.invalidated).toEqual([key]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx vitest run tests/hooks/useJourney.test.ts`

Expected: FAIL, "Failed to resolve import `@/hooks/useJourney`".

- [ ] **Step 3: Implement `frontend/hooks/useJourney.ts`**

```ts
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useApplications } from "@/hooks/useApplications";
import { useDocuments } from "@/hooks/useDocuments";
import { useInterviewSessions } from "@/hooks/useInterview";
import { useMe } from "@/hooks/useMe";
import { useResumeAnalysis, useResumes } from "@/hooks/useResumes";
import { useVisaConsultations } from "@/hooks/useVisa";
import {
  computeJourney,
  pickPrimaryResume,
  type Journey,
  type JourneyInput,
  type StepId,
} from "@/lib/journey";

/**
 * The queries behind each step, refreshed by retry(). These are prefixes:
 * ["resumes"] also covers the primary resume's analysis, which lives under
 * ["resumes", id, "analysis"].
 */
const STEP_QUERY_KEYS: Record<StepId, readonly string[]> = {
  profile: ["me"],
  resumeUploaded: ["resumes"],
  resumeAnalysed: ["resumes"],
  rirekisho: ["documents"],
  shokumu: ["documents"],
  application: ["jobs", "applications"],
  interview: ["interview", "sessions"],
  visa: ["visa", "consultations"],
};

export interface UseJourneyResult {
  journey: Journey;
  /** The raw lists, for Home's recent activity. */
  input: JourneyInput;
  isLoading: boolean;
  retry: (step: StepId) => void;
}

/**
 * The user's journey from the app's existing queries. No endpoint of its own:
 * React Query shares these with the pages that own them, so the sidebar and
 * Home cost one set of requests between them.
 */
export function useJourney(): UseJourneyResult {
  const queryClient = useQueryClient();
  const me = useMe();
  const resumes = useResumes();
  const primary = resumes.data ? pickPrimaryResume(resumes.data.items) : undefined;
  // "" disables the query until there is a resume to ask about.
  const analysis = useResumeAnalysis(primary?.id ?? "");
  const documents = useDocuments();
  const applications = useApplications();
  const interviews = useInterviewSessions();
  const visa = useVisaConsultations();

  // undefined means "couldn't load", which journey.ts shows as unknown. The
  // analysis hook turns a 404 into null, meaning "no analysis yet".
  const input: JourneyInput = {
    me: me.data,
    resumes: resumes.data?.items,
    primaryAnalysis:
      analysis.data !== undefined ? analysis.data : analysis.error ? undefined : null,
    documents: documents.data?.items,
    applications: applications.data,
    interviewSessions: interviews.data,
    visaConsultations: visa.data,
  };

  const isLoading =
    me.isLoading ||
    resumes.isLoading ||
    analysis.isLoading ||
    documents.isLoading ||
    applications.isLoading ||
    interviews.isLoading ||
    visa.isLoading;

  return {
    journey: computeJourney(input),
    input,
    isLoading,
    retry: (step) => void queryClient.invalidateQueries({ queryKey: [...STEP_QUERY_KEYS[step]] }),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run tests/hooks/useJourney.test.ts`

Expected: PASS, 19 tests.

- [ ] **Step 5: Gates and commit**

```bash
cd frontend && npm test && npm run lint && npm run type-check && npx prettier --check hooks/useJourney.ts tests/hooks/useJourney.test.ts
git add hooks/useJourney.ts tests/hooks/useJourney.test.ts
git commit -m "feat(home): useJourney composes the journey from the existing queries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Sidebar shell

**Files:**
- Modify: `frontend/lib/i18n.ts`: `nav` keys, and `aiQuota.meterTitle` plus
  its comment
- Create: `frontend/components/ai-quota-meter.tsx`
- Delete: `frontend/components/ai-quota-badge.tsx`
- Create: `frontend/components/app-shell/sidebar-nav.tsx`
- Create: `frontend/components/app-shell/mobile-top-bar.tsx`
- Rewrite: `frontend/app/dashboard/layout.tsx`
- Modify: `frontend/app/(auth)/layout.tsx`
- Test: `frontend/tests/app/dashboard-layout.test.tsx`

**Interfaces:**
- **Consumes:**
  - `useJourney()` from Task 5 (`journey.stages[].{id, done, total,
    complete, hasUnknown}`, `journey.next?.stage`, `isLoading`).
  - `Button` and `Progress` from Task 3, and `BrandMark` from Task 3.
- **Produces:**
  - `SidebarNav({ onNavigate?: () => void })`
  - `MobileTopBar({ open: boolean; onOpenChange: (open: boolean) => void })`
  - `AiQuotaMeter()`
  - The nav i18n keys `home`, `main`, `menu`, `groupPrepare`, `groupApply`,
    `groupSettleIn`, `countSep` and `stepsDone`. Task 7 reuses
    `groupPrepare`, `groupApply`, `groupSettleIn`, `countSep` and
    `stepsDone`.

- [ ] **Step 1: Add the strings to `lib/i18n.ts`**

In `nav`, after `admin`:

```ts
    home: { en: "Home", id: "Beranda", ja: "ホーム" },
    // Landmark name for the sidebar <nav>, and the phone drawer's dialog title.
    main: { en: "Main", id: "Utama", ja: "メイン" },
    menu: { en: "Menu", id: "Menu", ja: "メニュー" },
    groupPrepare: { en: "Prepare", id: "Persiapan", ja: "準備" },
    groupApply: { en: "Apply", id: "Melamar", ja: "応募" },
    groupSettleIn: { en: "Settle in", id: "Menetap", ja: "生活準備" },
    // Joins a stage name and its count for screen readers: "Prepare, 5 of 5 steps done".
    countSep: { en: ", ", id: ", ", ja: "、" },
    stepsDone: {
      en: "{done} of {total} steps done",
      id: "{done} dari {total} langkah selesai",
      ja: "{total}ステップ中{done}完了",
    },
```

In `aiQuota`, change the section comment to
`// AI quota meter — fragments, composed with numbers in ai-quota-meter.tsx`,
and add:

```ts
    meterTitle: { en: "AI calls", id: "Panggilan AI", ja: "AI利用" },
```

- [ ] **Step 2: Write the failing tests**

Create `frontend/tests/app/dashboard-layout.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { computeJourney, type JourneyInput } from "@/lib/journey";
import type { Document, MeResponse, Resume, ResumeAnalysis } from "@/types/api";

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));
const state = vi.hoisted(() => ({
  me: undefined as unknown,
  journey: undefined as unknown,
}));

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@clerk/nextjs", () => ({ UserButton: () => null }));
vi.mock("@/hooks/useMe", () => ({ useMe: () => ({ data: state.me }) }));
vi.mock("@/hooks/useJourney", () => ({ useJourney: () => state.journey }));
vi.mock("@/hooks/useAiQuota", () => ({ useAiQuota: () => ({ data: undefined }) }));

const DashboardLayout = (await import("@/app/dashboard/layout")).default;

const LANG = "en";
const n = (key: string) => t("nav", key, LANG);

/** Prepare finished, nothing in Apply or Settle in. */
const PREPARED: JourneyInput = {
  me: { rirekisho_ready: true } as MeResponse,
  resumes: [{ id: "r1", created_at: "2026-09-01T00:00:00+00:00", is_primary: true } as Resume],
  primaryAnalysis: { id: "a1" } as ResumeAnalysis,
  documents: [
    { id: "d1", document_type: "rirekisho", status: "completed" },
    { id: "d2", document_type: "shokumukeirekisho", status: "completed" },
  ] as Document[],
  applications: [],
  interviewSessions: [],
  visaConsultations: [],
};

function useJourneyResult(input: JourneyInput, isLoading = false) {
  return { journey: computeJourney(input), input, isLoading, retry: vi.fn() };
}

/** The list name a stage group should have: "Prepare, 5 of 5 steps done". */
function groupName(labelKey: string, done: number, total: number) {
  const count = n("stepsDone").replace("{done}", String(done)).replace("{total}", String(total));
  return `${n(labelKey)}${n("countSep")}${count}`;
}

function renderLayout() {
  const ui = () => (
    <LanguageProvider initialLang={LANG}>
      <DashboardLayout>
        <p>page body</p>
      </DashboardLayout>
    </LanguageProvider>
  );
  const view = render(ui());
  return { ...view, rerenderLayout: () => view.rerender(ui()) };
}

beforeEach(() => {
  nav.pathname = "/dashboard";
  state.me = { user: { role: "user", email: "a@example.com", full_name: "Budi Santoso" } };
  state.journey = useJourneyResult(PREPARED);
});

describe("dashboard shell", () => {
  it("renders the page inside the main landmark", () => {
    renderLayout();
    expect(screen.getByRole("main")).toHaveTextContent("page body");
  });

  it("labels the main navigation", () => {
    renderLayout();
    expect(screen.getByRole("navigation", { name: n("main") })).toBeInTheDocument();
  });

  it("names each stage's list with its progress", () => {
    renderLayout();
    expect(screen.getByRole("list", { name: groupName("groupPrepare", 5, 5) })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: groupName("groupApply", 0, 2) })).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: groupName("groupSettleIn", 0, 1) }),
    ).toBeInTheDocument();
  });

  it("hides the counts while the journey loads", () => {
    state.journey = useJourneyResult(PREPARED, true);
    renderLayout();
    expect(screen.getByRole("list", { name: n("groupPrepare") })).toBeInTheDocument();
  });

  it("hides a stage's count when one of its steps couldn't be checked", () => {
    state.journey = useJourneyResult({ ...PREPARED, documents: undefined });
    renderLayout();
    expect(screen.getByRole("list", { name: n("groupPrepare") })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: groupName("groupApply", 0, 2) })).toBeInTheDocument();
  });

  it("marks Home current only on the dashboard itself", () => {
    renderLayout();
    expect(screen.getByRole("link", { name: n("home") })).toHaveAttribute("aria-current", "page");
  });

  it("marks a section current on its sub-pages, and Home not", () => {
    nav.pathname = "/dashboard/resumes/r1";
    renderLayout();
    expect(screen.getByRole("link", { name: n("resumes") })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: n("home") })).not.toHaveAttribute("aria-current");
  });

  it("offers Admin only to admins", () => {
    renderLayout();
    expect(screen.queryByRole("link", { name: n("admin") })).not.toBeInTheDocument();

    state.me = { user: { role: "admin", email: "a@example.com", full_name: null } };
    renderLayout();
    expect(screen.getByRole("link", { name: n("admin") })).toHaveAttribute("href", "/admin");
  });
});

describe("phone drawer", () => {
  it("opens from the menu button as a named dialog", () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: n("openMenu") }));
    expect(screen.getByRole("dialog", { name: n("menu") })).toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the menu button", async () => {
    renderLayout();
    const menuButton = screen.getByRole("button", { name: n("openMenu") });
    fireEvent.click(menuButton);
    const dialog = screen.getByRole("dialog", { name: n("menu") });

    await act(async () => {
      fireEvent.keyDown(dialog, { key: "Escape" });
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(menuButton).toHaveFocus();
  });

  it("closes when the page changes", () => {
    const { rerenderLayout } = renderLayout();
    fireEvent.click(screen.getByRole("button", { name: n("openMenu") }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    nav.pathname = "/dashboard/visa";
    rerenderLayout();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd frontend && npx vitest run tests/app/dashboard-layout.test.tsx`

Expected: FAIL. There's no navigation named "Main", and no list named
"Prepare, …".

- [ ] **Step 4: Create `components/ai-quota-meter.tsx`, and delete `ai-quota-badge.tsx`**

```tsx
"use client";

import { Zap } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useAiQuota } from "@/hooks/useAiQuota";
import { useLang } from "@/lib/language-context";
import { t, type Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** At or below this many remaining calls the count turns ochre. */
const LOW_REMAINING = 2;

/**
 * Render a reset countdown in the active language.
 *
 * Deliberately does not reuse the backend's _format_duration, which emits
 * English-only prose. Pure, single-consumer, so it stays in this file rather
 * than becoming a shared utility.
 */
function formatReset(seconds: number, lang: Language): string {
  const totalMinutes = Math.ceil(seconds / 60);
  if (totalMinutes < 1) return t("aiQuota", "soon", lang);

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const h = t("aiQuota", "hourUnit", lang);
  const m = t("aiQuota", "minuteUnit", lang);

  if (hours === 0) return `${minutes}${m}`;
  if (minutes === 0) return `${hours}${h}`;
  return `${hours}${h}${minutes}${m}`;
}

/**
 * Remaining AI calls, in the sidebar footer.
 *
 * Advisory only. It sits on every dashboard page, so a pending or failed quota
 * fetch renders nothing rather than risking the shell. The authoritative path
 * is unaffected either way: an exhausted quota is still enforced by
 * check_budget and surfaced as a 429.
 */
export function AiQuotaMeter() {
  const { lang } = useLang();
  const { data } = useAiQuota();

  if (!data) return null;

  const { remaining, limit, exhausted, scope, resets_in_seconds } = data;
  const low = !exhausted && remaining <= LOW_REMAINING;
  const reset = formatReset(resets_in_seconds, lang);

  // Japanese sets no space between clauses or between a number and its
  // counter, so the separator is itself translated rather than a literal " ".
  const sep = t("aiQuota", "sep", lang);
  const scopeLabel = t("aiQuota", scope === "global" ? "sharedPool" : "yourQuota", lang);
  const description = exhausted
    ? `${scopeLabel}: ${t("aiQuota", "exhausted", lang)}${sep}${t("aiQuota", "resetsIn", lang)}${sep}${reset}`
    : `${scopeLabel}: ${remaining}${sep}${t("aiQuota", "left", lang)}`;

  return (
    <div className="px-3 py-2" title={description}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-secondary-foreground">
          <Zap aria-hidden="true" className="h-3.5 w-3.5" />
          {t("aiQuota", "meterTitle", lang)}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "font-medium tabular-nums",
            exhausted ? "text-destructive" : low ? "text-warning" : "text-muted-foreground",
          )}
        >
          {remaining}/{limit}
          {exhausted ? ` · ${reset}` : ""}
        </span>
      </div>
      <Progress value={remaining} max={limit} aria-label={description} className="mt-1.5 h-1" />
    </div>
  );
}
```

Then run `git rm components/ai-quota-badge.tsx`.

- [ ] **Step 5: Create `components/app-shell/sidebar-nav.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  BookOpen,
  Briefcase,
  Check,
  FileText,
  Files,
  Globe,
  House,
  Mic,
  Settings,
  Shield,
  Stamp,
  type LucideIcon,
} from "lucide-react";
import { AiQuotaMeter } from "@/components/ai-quota-meter";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useJourney } from "@/hooks/useJourney";
import { useMe } from "@/hooks/useMe";
import { useLang } from "@/lib/language-context";
import { t, type Language } from "@/lib/i18n";
import type { StageId } from "@/lib/journey";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  key: string;
  icon: LucideIcon;
}

const HOME: NavItem = { href: "/dashboard", key: "home", icon: House };

// The same seven sections as before, grouped by where they sit in the move to
// Japan. Spec 3 reshapes "apply" around the job pipeline.
const GROUPS: { stage: StageId; labelKey: string; items: NavItem[] }[] = [
  {
    stage: "prepare",
    labelKey: "groupPrepare",
    items: [
      { href: "/dashboard/resumes", key: "resumes", icon: FileText },
      { href: "/dashboard/documents", key: "documents", icon: Files },
    ],
  },
  {
    stage: "apply",
    labelKey: "groupApply",
    items: [
      { href: "/dashboard/jobs", key: "jobs", icon: Briefcase },
      { href: "/dashboard/interview", key: "interview", icon: Mic },
    ],
  },
  {
    stage: "settleIn",
    labelKey: "groupSettleIn",
    items: [
      { href: "/dashboard/visa", key: "visa", icon: Stamp },
      { href: "/dashboard/culture", key: "culture", icon: BookOpen },
    ],
  },
];

const SETTINGS: NavItem = { href: "/dashboard/settings", key: "settings", icon: Settings };
// /admin sits outside /dashboard and 403s for non-admins, so it is only
// offered to those who can actually use it.
const ADMIN: NavItem = { href: "/admin", key: "admin", icon: Shield };

/** Home only on the dashboard itself; every other section on its sub-pages too. */
function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === HOME.href) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  lang,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  lang: Language;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // Current page: fill, weight and the seal stripe, so it isn't colour alone.
        active
          ? "bg-secondary font-semibold text-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-seal"
          : "text-secondary-foreground",
      )}
    >
      <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
      {t("nav", item.key, lang)}
    </Link>
  );
}

/** ✓ for a finished stage, a seal ring for the stage holding the next step. */
function StageMarker({ n, complete, current }: { n: number; complete: boolean; current: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[10px] font-semibold",
        complete
          ? "border-indigo bg-indigo text-white"
          : current
            ? "border-seal text-seal"
            : "border-muted-foreground text-muted-foreground",
      )}
    >
      {complete ? <Check className="h-3 w-3" strokeWidth={3} /> : n}
    </span>
  );
}

function Account() {
  const { data: me } = useMe();
  const name = me?.user.full_name;
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <UserButton afterSignOutUrl="/sign-in" />
      {me && (
        <div className="min-w-0 text-sm leading-tight">
          <p className="truncate font-medium">{name ?? me.user.email}</p>
          {name && <p className="truncate text-xs text-muted-foreground">{me.user.email}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * The sidebar's content: shown in the fixed desktop sidebar and, on phones,
 * inside the drawer. onNavigate lets the drawer close when a link is used.
 */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { lang } = useLang();
  const pathname = usePathname();
  const { data: me } = useMe();
  const { journey, isLoading } = useJourney();
  const nextStage = journey.next?.stage;

  return (
    <div className="flex h-full flex-col">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="mx-3 mb-2 mt-4 flex h-10 items-center rounded-lg px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BrandMark />
      </Link>

      <nav aria-label={t("nav", "main", lang)} className="flex-1 overflow-y-auto px-3 pb-4">
        <ul>
          <li>
            <NavLink
              item={HOME}
              active={isActive(pathname, HOME.href)}
              lang={lang}
              onNavigate={onNavigate}
            />
          </li>
        </ul>

        {GROUPS.map((group, index) => {
          const stage = journey.stages.find((s) => s.id === group.stage);
          // A count is shown only when it's right: not while loading, and not
          // when one of the stage's steps couldn't be checked.
          const showCount = !isLoading && stage !== undefined && !stage.hasUnknown;
          const headingId = `nav-group-${group.stage}`;
          return (
            <div key={group.stage} className="mt-5">
              <h2
                id={headingId}
                className="mb-1 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground"
              >
                <StageMarker
                  n={index + 1}
                  complete={showCount && stage.complete}
                  current={showCount && nextStage === group.stage}
                />
                <span>{t("nav", group.labelKey, lang)}</span>
                {showCount && (
                  <>
                    <span
                      aria-hidden="true"
                      className="ml-auto font-medium normal-case tracking-normal text-muted-foreground tabular-nums"
                    >
                      {stage.done}/{stage.total}
                    </span>
                    <span className="sr-only">
                      {t("nav", "countSep", lang)}
                      {t("nav", "stepsDone", lang)
                        .replace("{done}", String(stage.done))
                        .replace("{total}", String(stage.total))}
                    </span>
                  </>
                )}
              </h2>
              <ul aria-labelledby={headingId}>
                {group.items.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      item={item}
                      active={isActive(pathname, item.href)}
                      lang={lang}
                      onNavigate={onNavigate}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="space-y-1 border-t px-3 py-3">
        <AiQuotaMeter />
        <div className="flex items-center gap-3 px-3 py-1.5">
          <Globe aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-secondary-foreground" />
          <LanguageSwitcher />
        </div>
        <ul>
          <li>
            <NavLink
              item={SETTINGS}
              active={isActive(pathname, SETTINGS.href)}
              lang={lang}
              onNavigate={onNavigate}
            />
          </li>
          {me?.user.role === "admin" && (
            <li>
              <NavLink
                item={ADMIN}
                active={isActive(pathname, ADMIN.href)}
                lang={lang}
                onNavigate={onNavigate}
              />
            </li>
          )}
        </ul>
        <Account />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `components/app-shell/mobile-top-bar.tsx`**

```tsx
"use client";

import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { UserButton } from "@clerk/nextjs";
import { Menu, X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";

/**
 * Below lg: a slim bar, and the sidebar in a left-side drawer. The drawer is a
 * Radix Dialog, so focus is trapped, Escape closes it, the page behind can't
 * scroll, and focus goes back to the menu button. It only slides in when the
 * OS allows motion.
 */
export function MobileTopBar({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { lang } = useLang();
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-card px-2 lg:hidden">
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("nav", "openMenu", lang)}>
            <Menu aria-hidden="true" />
          </Button>
        </DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/30 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r bg-card shadow-xl focus:outline-none motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:slide-in-from-left"
          >
            <DialogPrimitive.Title className="sr-only">{t("nav", "menu", lang)}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-3"
                aria-label={t("nav", "closeMenu", lang)}
              >
                <X aria-hidden="true" />
              </Button>
            </DialogPrimitive.Close>
            <SidebarNav onNavigate={() => onOpenChange(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <Link
        href="/dashboard"
        className="rounded-lg p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BrandMark compact />
      </Link>

      <div className="flex h-10 w-10 items-center justify-center">
        <UserButton afterSignOutUrl="/sign-in" />
      </div>
    </header>
  );
}
```

- [ ] **Step 7: Rewrite `app/dashboard/layout.tsx`**

```tsx
"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MobileTopBar } from "@/components/app-shell/mobile-top-bar";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the drawer whenever the page changes. Links close it on click too;
  // this also covers back/forward and programmatic navigation. Adjusted during
  // render rather than in an effect, so the old page never shows it open.
  const [shownPath, setShownPath] = useState(pathname);
  if (pathname !== shownPath) {
    setShownPath(pathname);
    setMenuOpen(false);
  }

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r bg-card lg:block">
        <SidebarNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar open={menuOpen} onOpenChange={setMenuOpen} />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 py-8 focus:outline-none sm:px-6 lg:px-10"
        >
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Put BrandMark in `app/(auth)/layout.tsx`**

Replace the header link's content (`<span aria-hidden="true">🏠</span> Japan Job Support`)
with `<BrandMark />`, add `import { BrandMark } from "@/components/brand-mark";`,
and change the link's className to
`"rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"`.

- [ ] **Step 9: Run the tests**

Run: `cd frontend && npx vitest run tests/app/dashboard-layout.test.tsx && npm test`

Expected: dashboard-layout PASS (11 tests), and the full suite green.

If the Escape test's focus assertion fails only because jsdom doesn't run
Radix's focus-return, check that Radix still returns focus in the real
browser (Task 9, step 3), and replace the `toHaveFocus` line with a comment
that points there. Don't drop the dialog-closed assertion.

- [ ] **Step 10: Gates and commit**

```bash
cd frontend && npm run lint && npm run type-check && npx prettier --check lib/i18n.ts components/ai-quota-meter.tsx components/app-shell app/dashboard/layout.tsx "app/(auth)/layout.tsx" tests/app/dashboard-layout.test.tsx
git add lib/i18n.ts components/ai-quota-meter.tsx components/app-shell app/dashboard/layout.tsx "app/(auth)/layout.tsx" tests/app/dashboard-layout.test.tsx
git commit -m "feat(shell): journey-grouped sidebar with an accessible phone drawer

Replaces the eight-link top bar. Groups show each stage's progress, the
current page is marked by more than colour, and the phone drawer is a
Radix dialog (focus trap, Escape, closes on navigation).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Also confirm the deletion is staged: `git status` should show
`deleted: components/ai-quota-badge.tsx`, committed.

---

### Task 7: Journey Home

**Files:**
- Create: `frontend/lib/activity.ts`
- Test: `frontend/tests/lib/activity.test.ts`
- Modify: `frontend/lib/i18n.ts` (new `journey` and `home` sections)
- Create: `frontend/app/dashboard/page.tsx`
- Test: `frontend/tests/app/home.test.tsx`

**Interfaces:**
- **Consumes:**
  - `useJourney()` from Task 5.
  - `JourneyInput`, `JourneyStep`, `Journey`, `StepId` and
    `pickPrimaryResume` from Task 4.
  - `Button`, `Card*`, `Badge`, `Progress`, `Skeleton` and `PageHeader`
    from Task 3.
  - The nav keys `groupPrepare`, `groupApply`, `groupSettleIn`, `countSep`
    and `stepsDone` from Task 6.
- **Produces:**
  - `type ActivityKind = "resumeUploaded" | "resumeAnalysed" | "rirekisho"
    | "shokumu" | "application" | "interview" | "visa"`
  - `interface ActivityItem { key: string; kind: ActivityKind; at: string;
    href: string; detail?: string }`
  - `recentActivity(input: JourneyInput, limit?: number): ActivityItem[]`
  - `formatRelative(iso: string, lang: Language, now?: number): string`

- [ ] **Step 1: Write the failing activity tests**

Create `frontend/tests/lib/activity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatRelative, recentActivity } from "@/lib/activity";
import type { JourneyInput } from "@/lib/journey";
import type {
  Document,
  InterviewSession,
  JobApplication,
  Resume,
  ResumeAnalysis,
  VisaConsultationListItem,
} from "@/types/api";

const EMPTY: JourneyInput = {
  me: undefined,
  resumes: [],
  primaryAnalysis: null,
  documents: [],
  applications: [],
  interviewSessions: [],
  visaConsultations: [],
};

const day = (d: number) => `2026-09-${String(d).padStart(2, "0")}T09:00:00+00:00`;

describe("recentActivity", () => {
  it("merges every source, newest first", () => {
    const items = recentActivity({
      ...EMPTY,
      resumes: [{ id: "r1", file_name: "cv.pdf", created_at: day(1), is_primary: true } as Resume],
      primaryAnalysis: { id: "a1", created_at: day(3) } as ResumeAnalysis,
      documents: [
        { id: "d1", document_type: "rirekisho", status: "completed", completed_at: day(5), created_at: day(4) },
      ] as Document[],
      applications: [
        { id: "app1", job_title: "SRE", created_at: day(2) },
      ] as JobApplication[],
      visaConsultations: [{ id: "v1", created_at: day(6) } as VisaConsultationListItem],
    });
    expect(items.map((i) => i.kind)).toEqual([
      "visa",
      "rirekisho",
      "resumeAnalysed",
      "application",
      "resumeUploaded",
    ]);
    expect(items[0].href).toBe("/dashboard/visa/v1");
    expect(items[1].href).toBe("/dashboard/documents/d1");
    expect(items[2].href).toBe("/dashboard/resumes/r1");
    expect(items[3]).toMatchObject({ href: "/dashboard/jobs/applications", detail: "SRE" });
    expect(items[4]).toMatchObject({ href: "/dashboard/resumes/r1", detail: "cv.pdf" });
  });

  it("keeps only the newest five", () => {
    const resumes = [1, 2, 3, 4, 5, 6, 7].map(
      (d) => ({ id: `r${d}`, file_name: `${d}.pdf`, created_at: day(d) }) as Resume,
    );
    const items = recentActivity({ ...EMPTY, resumes });
    expect(items.map((i) => i.detail)).toEqual(["7.pdf", "6.pdf", "5.pdf", "4.pdf", "3.pdf"]);
  });

  it("lists only finished documents and interviews", () => {
    const items = recentActivity({
      ...EMPTY,
      documents: [
        { id: "d1", document_type: "shokumukeirekisho", status: "failed", completed_at: null, created_at: day(2) },
        { id: "d2", document_type: "shokumukeirekisho", status: "completed", completed_at: null, created_at: day(3) },
      ] as Document[],
      interviewSessions: [
        { id: "s1", status: "abandoned", completed_at: null, created_at: day(4) },
        { id: "s2", status: "completed", completed_at: day(6), created_at: day(5) },
      ] as InterviewSession[],
    });
    expect(items.map((i) => [i.kind, i.at])).toEqual([
      ["interview", day(6)],
      ["shokumu", day(3)],
    ]);
  });

  it("skips sources that failed to load", () => {
    expect(recentActivity({ ...EMPTY, resumes: undefined, documents: undefined })).toEqual([]);
  });
});

describe("formatRelative", () => {
  const now = Date.parse("2026-09-26T12:00:00+00:00");

  it("says days ago in the chosen language", () => {
    expect(formatRelative("2026-09-24T12:00:00+00:00", "en", now)).toBe("2 days ago");
    expect(formatRelative("2026-09-24T12:00:00+00:00", "ja", now)).toBe("一昨日");
  });

  it("uses the largest whole unit", () => {
    expect(formatRelative("2026-09-26T09:00:00+00:00", "en", now)).toBe("3 hours ago");
  });

  it("says now for the last few seconds", () => {
    expect(formatRelative("2026-09-26T11:59:58+00:00", "en", now)).toBe("now");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx vitest run tests/lib/activity.test.ts`

Expected: FAIL, "Failed to resolve import `@/lib/activity`".

- [ ] **Step 3: Implement `frontend/lib/activity.ts`**

```ts
import type { Language } from "@/lib/i18n";
import { pickPrimaryResume, type JourneyInput } from "@/lib/journey";

export type ActivityKind =
  | "resumeUploaded"
  | "resumeAnalysed"
  | "rirekisho"
  | "shokumu"
  | "application"
  | "interview"
  | "visa";

export interface ActivityItem {
  key: string;
  kind: ActivityKind;
  /** ISO timestamp the item is sorted and labelled by. */
  at: string;
  href: string;
  /** A name worth showing beside the label: a file name or job title. */
  detail?: string;
}

/**
 * The latest things the user did, merged across the lists Home already has.
 * Only finished work counts: a failed document or abandoned interview isn't
 * something they did. A source that failed to load contributes nothing.
 */
export function recentActivity(input: JourneyInput, limit = 5): ActivityItem[] {
  const items: ActivityItem[] = [];
  const { resumes, primaryAnalysis, documents, applications, interviewSessions } = input;

  for (const r of resumes ?? []) {
    items.push({
      key: `resume-${r.id}`,
      kind: "resumeUploaded",
      at: r.created_at,
      href: `/dashboard/resumes/${r.id}`,
      detail: r.file_name,
    });
  }
  const primary = resumes ? pickPrimaryResume(resumes) : undefined;
  if (primary && primaryAnalysis) {
    items.push({
      key: `analysis-${primaryAnalysis.id}`,
      kind: "resumeAnalysed",
      at: primaryAnalysis.created_at,
      href: `/dashboard/resumes/${primary.id}`,
    });
  }
  for (const d of documents ?? []) {
    if (d.status !== "completed") continue;
    items.push({
      key: `document-${d.id}`,
      kind: d.document_type === "rirekisho" ? "rirekisho" : "shokumu",
      at: d.completed_at ?? d.created_at,
      href: `/dashboard/documents/${d.id}`,
    });
  }
  for (const a of applications ?? []) {
    items.push({
      key: `application-${a.id}`,
      kind: "application",
      at: a.created_at,
      href: "/dashboard/jobs/applications",
      detail: a.job_title ?? undefined,
    });
  }
  for (const s of interviewSessions ?? []) {
    if (s.status !== "completed") continue;
    items.push({
      key: `interview-${s.id}`,
      kind: "interview",
      at: s.completed_at ?? s.created_at,
      href: `/dashboard/interview/${s.id}`,
    });
  }
  for (const v of input.visaConsultations ?? []) {
    items.push({
      key: `visa-${v.id}`,
      kind: "visa",
      at: v.created_at,
      href: `/dashboard/visa/${v.id}`,
    });
  }

  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "2 days ago" / "一昨日" / "2 hari yang lalu", in the largest whole unit. */
export function formatRelative(iso: string, lang: Language, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, "second");
}
```

- [ ] **Step 4: Run the activity tests**

Run: `cd frontend && npx vitest run tests/lib/activity.test.ts`

Expected: PASS, 7 tests. If the Japanese assertion differs because of the
Node ICU version (e.g. "2 日前"), set the expectation to what
`new Intl.RelativeTimeFormat("ja", { numeric: "auto" }).format(-2, "day")`
returns in this Node, and note that in a comment. CI runs Node 20 as well.

- [ ] **Step 5: Add the `journey` and `home` strings to `lib/i18n.ts`**

Insert these two sections before the legacy `dashboard` section:

```ts
  // ---------------------------------------------------------------------------
  // Journey steps (lib/journey.ts): the board label, then the next-step card's
  // title, reason and button. The uploaded CV is "レジュメ" in Japanese so it
  // doesn't collide with the 履歴書 document on the same board.
  // ---------------------------------------------------------------------------
  journey: {
    profile: { en: "Complete your profile", id: "Lengkapi profilmu", ja: "プロフィールを完成させる" },
    profileTitle: {
      en: "Complete your profile",
      id: "Lengkapi profilmu",
      ja: "プロフィールを完成させましょう",
    },
    profileWhy: {
      en: "Your 履歴書 is filled in from your profile, so missing details make a weaker document.",
      id: "履歴書 diisi dari profilmu, jadi data yang kurang membuat dokumennya lebih lemah.",
      ja: "履歴書はプロフィールから作成されます。不足があると書類の完成度が下がります。",
    },
    profileCta: { en: "Open settings", id: "Buka pengaturan", ja: "設定を開く" },

    resumeUploaded: { en: "Upload a resume", id: "Unggah resume", ja: "レジュメをアップロード" },
    resumeUploadedTitle: {
      en: "Upload your resume",
      id: "Unggah resumemu",
      ja: "レジュメをアップロードしましょう",
    },
    resumeUploadedWhy: {
      en: "The analysis, your documents and job matching all start from it.",
      id: "Analisis, dokumen, dan pencocokan lowongan semuanya dimulai dari sini.",
      ja: "分析・書類作成・求人マッチングはすべてここから始まります。",
    },
    resumeUploadedCta: { en: "Upload resume", id: "Unggah resume", ja: "アップロード" },

    resumeAnalysed: {
      en: "Get your resume analysed",
      id: "Analisis resumemu",
      ja: "レジュメを分析する",
    },
    resumeAnalysedTitle: {
      en: "Get your resume analysed",
      id: "Minta analisis resumemu",
      ja: "レジュメを分析しましょう",
    },
    resumeAnalysedWhy: {
      en: "See how it reads to Japanese employers, and what to strengthen before you apply.",
      id: "Lihat bagaimana perusahaan Jepang membacanya, dan apa yang perlu diperkuat sebelum melamar.",
      ja: "日本の採用担当者にどう見えるか、応募前に何を強化すべきかがわかります。",
    },
    resumeAnalysedCta: { en: "Analyse", id: "Analisis", ja: "分析する" },

    rirekisho: { en: "Create a 履歴書", id: "Buat 履歴書", ja: "履歴書を作成" },
    rirekishoTitle: { en: "Create your 履歴書", id: "Buat 履歴書-mu", ja: "履歴書を作成しましょう" },
    rirekishoWhy: {
      en: "The standard Japanese application form. Nearly every application asks for one.",
      id: "Formulir lamaran standar Jepang. Hampir setiap lamaran memintanya.",
      ja: "日本の標準的な応募書類です。ほぼすべての応募で求められます。",
    },
    rirekishoCta: { en: "Create", id: "Buat", ja: "作成する" },

    shokumu: { en: "Create a 職務経歴書", id: "Buat 職務経歴書", ja: "職務経歴書を作成" },
    shokumuTitle: {
      en: "Create your 職務経歴書",
      id: "Buat 職務経歴書-mu",
      ja: "職務経歴書を作成しましょう",
    },
    shokumuWhy: {
      en: "Most employers ask for it alongside the 履歴書, to see your work history in detail.",
      id: "Kebanyakan perusahaan memintanya bersama 履歴書 untuk melihat riwayat kerjamu secara rinci.",
      ja: "多くの企業が履歴書とあわせて求め、職歴を詳しく確認します。",
    },
    shokumuCta: { en: "Create", id: "Buat", ja: "作成する" },

    application: { en: "Track an application", id: "Lacak lamaran", ja: "応募を記録する" },
    applicationTitle: {
      en: "Track your first application",
      id: "Lacak lamaran pertamamu",
      ja: "最初の応募を記録しましょう",
    },
    applicationWhy: {
      en: "Save a job you're applying for, so its status and notes stay in one place.",
      id: "Simpan lowongan yang kamu lamar agar status dan catatannya ada di satu tempat.",
      ja: "応募する求人を保存すると、状況やメモを一か所で管理できます。",
    },
    applicationCta: { en: "Browse jobs", id: "Lihat lowongan", ja: "求人を見る" },

    interview: { en: "Practise an interview", id: "Latihan wawancara", ja: "面接を練習する" },
    interviewTitle: {
      en: "Practise an interview",
      id: "Latihan wawancara",
      ja: "面接を練習しましょう",
    },
    interviewWhy: {
      en: "A mock interview with feedback, before the real one.",
      id: "Simulasi wawancara dengan masukan, sebelum yang sebenarnya.",
      ja: "本番の前に、フィードバック付きの模擬面接で練習できます。",
    },
    interviewCta: { en: "Start practice", id: "Mulai latihan", ja: "練習を始める" },

    visa: { en: "Check your visa options", id: "Cek opsi visamu", ja: "ビザの選択肢を確認" },
    visaTitle: {
      en: "Check your visa options",
      id: "Cek opsi visamu",
      ja: "ビザの選択肢を確認しましょう",
    },
    visaWhy: {
      en: "Find which visa fits your background, and what you'll need to apply for it.",
      id: "Temukan visa yang cocok dengan latar belakangmu, dan apa yang dibutuhkan untuk mengajukannya.",
      ja: "経歴に合うビザと、申請に必要なものがわかります。",
    },
    visaCta: { en: "Check visa", id: "Cek visa", ja: "確認する" },
  },

  // ---------------------------------------------------------------------------
  // Home (app/dashboard/page.tsx)
  // ---------------------------------------------------------------------------
  home: {
    greeting: { en: "Welcome back", id: "Selamat datang kembali", ja: "おかえりなさい" },
    greetingNamed: {
      en: "Welcome back, {name}",
      id: "Selamat datang kembali, {name}",
      ja: "おかえりなさい、{name}さん",
    },
    progress: {
      en: "{done} of {total} steps · your move to Japan",
      id: "{done} dari {total} langkah · perjalananmu ke Jepang",
      ja: "全{total}ステップ中{done}完了 · 日本への道のり",
    },
    progressLabel: { en: "Journey progress", id: "Progres perjalanan", ja: "進捗状況" },
    nextStep: { en: "Next step", id: "Langkah berikutnya", ja: "次のステップ" },
    // Read after a finished step's struck-through label, which a screen reader can't see.
    stepDone: { en: "(done)", id: "(selesai)", ja: "（完了）" },
    couldntCheck: { en: "Couldn't check", id: "Tidak dapat memeriksa", ja: "確認できませんでした" },
    allDoneTitle: {
      en: "You've completed every step",
      id: "Kamu sudah menyelesaikan semua langkah",
      ja: "すべてのステップを完了しました",
    },
    allDoneBody: {
      en: "Keep preparing with the culture guides: workplace customs, keigo and what interviews look for.",
      id: "Lanjutkan persiapan dengan panduan budaya: kebiasaan kerja, keigo, dan apa yang dicari saat wawancara.",
      ja: "文化ガイドで準備を続けましょう。職場の習慣、敬語、面接で見られるポイントを解説しています。",
    },
    allDoneCta: { en: "Read the culture guides", id: "Baca panduan budaya", ja: "文化ガイドを読む" },
    activityTitle: { en: "Recent activity", id: "Aktivitas terbaru", ja: "最近のアクティビティ" },
    activityResumeUploaded: { en: "Resume uploaded", id: "Resume diunggah", ja: "レジュメをアップロード" },
    activityResumeAnalysed: { en: "Resume analysed", id: "Resume dianalisis", ja: "レジュメを分析" },
    activityRirekisho: { en: "履歴書 generated", id: "履歴書 dibuat", ja: "履歴書を作成" },
    activityShokumu: { en: "職務経歴書 generated", id: "職務経歴書 dibuat", ja: "職務経歴書を作成" },
    activityApplication: { en: "Application added", id: "Lamaran ditambahkan", ja: "応募を追加" },
    activityInterview: {
      en: "Interview practice completed",
      id: "Latihan wawancara selesai",
      ja: "面接練習を完了",
    },
    activityVisa: { en: "Visa options checked", id: "Opsi visa dicek", ja: "ビザを確認" },
  },
```

- [ ] **Step 6: Write the failing Home tests**

Create `frontend/tests/app/home.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderIn } from "../helpers";
import { t, type Language } from "@/lib/i18n";
import { computeJourney, type JourneyInput } from "@/lib/journey";
import type { Document, MeResponse, Resume, ResumeAnalysis, VisaConsultationListItem } from "@/types/api";

const state = vi.hoisted(() => ({ result: undefined as unknown, retries: [] as string[] }));
vi.mock("@/hooks/useJourney", () => ({ useJourney: () => state.result }));

const HomePage = (await import("@/app/dashboard/page")).default;

const me = (full_name: string | null, rirekisho_ready = true) =>
  ({ rirekisho_ready, user: { full_name, email: "a@example.com" } }) as MeResponse;

const MID_JOURNEY: JourneyInput = {
  me: me("Budi Santoso"),
  resumes: [
    { id: "r1", file_name: "cv.pdf", created_at: "2026-09-20T00:00:00+00:00", is_primary: true } as Resume,
  ],
  primaryAnalysis: { id: "a1", created_at: "2026-09-21T00:00:00+00:00" } as ResumeAnalysis,
  documents: [
    {
      id: "d1",
      document_type: "rirekisho",
      status: "completed",
      completed_at: "2026-09-22T00:00:00+00:00",
      created_at: "2026-09-22T00:00:00+00:00",
    },
  ] as Document[],
  applications: [],
  interviewSessions: [],
  visaConsultations: [],
};

const FINISHED: JourneyInput = {
  ...MID_JOURNEY,
  documents: [
    ...(MID_JOURNEY.documents as Document[]),
    {
      id: "d2",
      document_type: "shokumukeirekisho",
      status: "completed",
      completed_at: null,
      created_at: "2026-09-23T00:00:00+00:00",
    } as Document,
  ],
  applications: [{ id: "app1", job_title: "SRE", created_at: "2026-09-24T00:00:00+00:00" }] as never,
  interviewSessions: [
    { id: "s1", status: "completed", completed_at: "2026-09-25T00:00:00+00:00", created_at: "2026-09-25T00:00:00+00:00" },
  ] as never,
  visaConsultations: [{ id: "v1", created_at: "2026-09-25T06:00:00+00:00" } as VisaConsultationListItem],
};

function setJourney(input: JourneyInput, isLoading = false) {
  state.result = {
    journey: computeJourney(input),
    input,
    isLoading,
    retry: (step: string) => state.retries.push(step),
  };
}

beforeEach(() => {
  state.retries = [];
  setJourney(MID_JOURNEY);
});

const j = (key: string, lang: Language = "en") => t("journey", key, lang);
const h = (key: string, lang: Language = "en") => t("home", key, lang);

describe("Home", () => {
  it("greets the user by first name in the page's one h1", () => {
    renderIn("en", <HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      h("greetingNamed").replace("{name}", "Budi"),
    );
  });

  it("greets without a name when none is set", () => {
    setJourney({ ...MID_JOURNEY, me: me(null) });
    renderIn("en", <HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(h("greeting"));
  });

  it("shows overall progress", () => {
    renderIn("en", <HomePage />);
    expect(screen.getByRole("progressbar", { name: h("progressLabel") })).toHaveAttribute(
      "aria-valuenow",
      "4",
    );
    expect(
      screen.getByText(h("progress").replace("{done}", "4").replace("{total}", "8")),
    ).toBeInTheDocument();
  });

  it("suggests the next step with a link to it", () => {
    renderIn("en", <HomePage />);
    expect(screen.getByRole("heading", { name: j("shokumuTitle") })).toBeInTheDocument();
    expect(screen.getByText(j("shokumuWhy"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: j("shokumuCta") })).toHaveAttribute(
      "href",
      "/dashboard/documents/shokumu/new",
    );
  });

  it("lays the steps out by stage, each linking to its page", () => {
    renderIn("en", <HomePage />);
    const prepare = screen.getByRole("list", { name: new RegExp(t("nav", "groupPrepare", "en")) });
    expect(within(prepare).getAllByRole("link")).toHaveLength(5);
    expect(within(prepare).getByRole("link", { name: new RegExp(j("rirekisho")) })).toHaveAttribute(
      "href",
      "/dashboard/documents/rirekisho/new",
    );
  });

  it("tells a screen reader which steps are done", () => {
    renderIn("en", <HomePage />);
    expect(screen.getByRole("link", { name: `${j("rirekisho")} ${h("stepDone")}` })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: j("application") })).toBeInTheDocument();
  });

  it("says when a step couldn't be checked, and retries it", () => {
    setJourney({ ...MID_JOURNEY, visaConsultations: undefined });
    renderIn("en", <HomePage />);
    expect(screen.getByText(h("couldntCheck"))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: new RegExp(t("common", "tryAgain", "en")) }));

    expect(state.retries).toEqual(["visa"]);
  });

  it("celebrates a finished journey instead of suggesting a step", () => {
    setJourney(FINISHED);
    renderIn("en", <HomePage />);
    expect(screen.getByRole("heading", { name: h("allDoneTitle") })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: h("allDoneCta") })).toHaveAttribute(
      "href",
      "/dashboard/culture",
    );
    expect(screen.queryByText(h("nextStep"))).not.toBeInTheDocument();
  });

  it("lists recent activity, newest first, capped at five", () => {
    setJourney(FINISHED);
    renderIn("en", <HomePage />);
    const activity = screen.getByRole("list", { name: h("activityTitle") });
    const rows = within(activity).getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent(h("activityVisa"));
    expect(rows[1]).toHaveTextContent(h("activityInterview"));
  });

  it("shows no activity card for a brand-new user", () => {
    setJourney({
      me: me("Budi Santoso", false),
      resumes: [],
      primaryAnalysis: null,
      documents: [],
      applications: [],
      interviewSessions: [],
      visaConsultations: [],
    });
    renderIn("en", <HomePage />);
    expect(screen.queryByRole("heading", { name: h("activityTitle") })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: j("profileTitle") })).toBeInTheDocument();
  });

  it("shows skeletons, not a half-built board, while loading", () => {
    setJourney(MID_JOURNEY, true);
    renderIn("en", <HomePage />);
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("renders in Japanese", () => {
    renderIn("ja", <HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("おかえりなさい、Budiさん");
    expect(screen.getByRole("heading", { name: j("shokumuTitle", "ja") })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: j("application", "ja") })).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run them to verify they fail**

Run: `cd frontend && npx vitest run tests/app/home.test.tsx`

Expected: FAIL, "Failed to resolve import `@/app/dashboard/page`".

- [ ] **Step 8: Implement `frontend/app/dashboard/page.tsx`**

```tsx
"use client";

import Link from "next/link";
import { ArrowRight, Check, CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useJourney } from "@/hooks/useJourney";
import { formatRelative, recentActivity, type ActivityItem, type ActivityKind } from "@/lib/activity";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { Journey, JourneyStep, StageId, StepId } from "@/lib/journey";
import { cn } from "@/lib/utils";

const STAGE_LABEL: Record<StageId, string> = {
  prepare: "groupPrepare",
  apply: "groupApply",
  settleIn: "groupSettleIn",
};

const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  resumeUploaded: "activityResumeUploaded",
  resumeAnalysed: "activityResumeAnalysed",
  rirekisho: "activityRirekisho",
  shokumu: "activityShokumu",
  application: "activityApplication",
  interview: "activityInterview",
  visa: "activityVisa",
};

export default function HomePage() {
  const { lang } = useLang();
  const { journey, input, isLoading, retry } = useJourney();

  if (isLoading) return <HomeSkeleton />;

  // First word of the name: "Budi" from "Budi Santoso", and for a Japanese
  // name the family name, which is what goes before さん.
  const firstName = input.me?.user.full_name?.trim().split(/\s+/)[0];
  const title = firstName
    ? t("home", "greetingNamed", lang).replace("{name}", firstName)
    : t("home", "greeting", lang);
  const progress = t("home", "progress", lang)
    .replace("{done}", String(journey.doneCount))
    .replace("{total}", String(journey.total));
  const activity = recentActivity(input);

  return (
    <>
      <PageHeader title={title} description={progress}>
        <Progress
          value={journey.doneCount}
          max={journey.total}
          aria-label={t("home", "progressLabel", lang)}
          className="mt-3 max-w-md"
        />
      </PageHeader>

      {journey.next && <NextStepCard step={journey.next} />}
      {journey.allDone && <AllDoneCard />}

      <JourneyBoard journey={journey} onRetry={retry} />

      {activity.length > 0 && <RecentActivity items={activity} />}
    </>
  );
}

function NextStepCard({ step }: { step: JourneyStep }) {
  const { lang } = useLang();
  return (
    <Card className="mb-6 border-l-[3px] border-l-seal">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-seal">
            {t("home", "nextStep", lang)}
          </p>
          <h2 className="text-lg font-semibold">{t("journey", `${step.id}Title`, lang)}</h2>
          <p className="text-sm text-muted-foreground">{t("journey", `${step.id}Why`, lang)}</p>
        </div>
        <Button asChild className="shrink-0 self-start sm:self-auto">
          <Link href={step.href}>
            {t("journey", `${step.id}Cta`, lang)}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function AllDoneCard() {
  const { lang } = useLang();
  return (
    <Card className="mb-6 border-l-[3px] border-l-indigo">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t("home", "allDoneTitle", lang)}</h2>
          <p className="text-sm text-muted-foreground">{t("home", "allDoneBody", lang)}</p>
        </div>
        <Button asChild variant="secondary" className="shrink-0 self-start sm:self-auto">
          <Link href="/dashboard/culture">{t("home", "allDoneCta", lang)}</Link>
        </Button>
      </div>
    </Card>
  );
}

function JourneyBoard({ journey, onRetry }: { journey: Journey; onRetry: (step: StepId) => void }) {
  const { lang } = useLang();
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {journey.stages.map((stage, index) => {
        const headingId = `stage-${stage.id}`;
        const count = t("nav", "stepsDone", lang)
          .replace("{done}", String(stage.done))
          .replace("{total}", String(stage.total));
        return (
          <Card key={stage.id}>
            <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
              <CardTitle
                id={headingId}
                className="text-sm font-semibold uppercase tracking-[0.06em]"
              >
                <span aria-hidden="true" className="mr-2 text-muted-foreground">
                  {index + 1}
                </span>
                {t("nav", STAGE_LABEL[stage.id], lang)}
                {!stage.hasUnknown && (
                  <span className="sr-only">
                    {t("nav", "countSep", lang)}
                    {count}
                  </span>
                )}
              </CardTitle>
              {!stage.hasUnknown && (
                <Badge
                  aria-hidden="true"
                  variant={stage.complete ? "success" : "neutral"}
                  className="tabular-nums"
                >
                  {stage.done}/{stage.total}
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              <ul aria-labelledby={headingId} className="space-y-1">
                {stage.steps.map((step) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    isNext={journey.next?.id === step.id}
                    onRetry={onRetry}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function StepRow({
  step,
  isNext,
  onRetry,
}: {
  step: JourneyStep;
  isNext: boolean;
  onRetry: (step: StepId) => void;
}) {
  const { lang } = useLang();
  const label = t("journey", step.id, lang);

  // A step whose data didn't load: say so, and offer a retry, rather than
  // guessing it's done or not.
  if (step.state === "unknown") {
    return (
      <li className="flex items-center gap-3 rounded-md px-2 py-2 text-sm">
        <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-warning" />
        <span className="min-w-0 flex-1">
          <span className="block">{label}</span>
          <span className="block text-xs text-muted-foreground">
            {t("home", "couldntCheck", lang)}
          </span>
        </span>
        <Button variant="link" size="sm" onClick={() => onRetry(step.id)}>
          {t("common", "tryAgain", lang)}
          <span className="sr-only"> {label}</span>
        </Button>
      </li>
    );
  }

  const done = step.state === "done";
  return (
    <li>
      <Link
        href={step.href}
        className={cn(
          "flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isNext && "bg-seal-soft/60 font-semibold hover:bg-seal-soft",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px]",
            done
              ? "border-indigo bg-indigo text-white"
              : isNext
                ? "border-seal ring-2 ring-seal-soft"
                : "border-muted-foreground",
          )}
        >
          {done && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
        <span className={cn(done && "text-muted-foreground line-through")}>{label}</span>
        {done && <span className="sr-only"> {t("home", "stepDone", lang)}</span>}
      </Link>
    </li>
  );
}

function RecentActivity({ items }: { items: ActivityItem[] }) {
  const { lang } = useLang();
  const now = Date.now();
  return (
    <Card className="mt-6">
      <CardHeader className="pb-2">
        <CardTitle id="recent-activity">{t("home", "activityTitle", lang)}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul aria-labelledby="recent-activity" className="divide-y">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="flex items-baseline justify-between gap-4 rounded-sm py-2.5 text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 truncate">
                  {t("home", ACTIVITY_LABEL[item.kind], lang)}
                  {item.detail && <span className="text-muted-foreground"> · {item.detail}</span>}
                </span>
                <time dateTime={item.at} className="shrink-0 text-xs text-muted-foreground">
                  {formatRelative(item.at, lang, now)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="mt-3 h-4 w-56" />
      <Skeleton className="mt-4 h-1.5 w-full max-w-md" />
      <Skeleton className="mt-8 h-24 w-full" />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Run the tests**

Run: `cd frontend && npx vitest run tests/app/home.test.tsx tests/lib/activity.test.ts && npm test`

Expected: home 12 and activity 7 PASS, and the full suite green, including
the i18n completeness and placeholder tests over the new sections.

- [ ] **Step 10: Gates and commit**

```bash
cd frontend && npm run lint && npm run type-check && npx prettier --check lib/activity.ts lib/i18n.ts app/dashboard/page.tsx tests/lib/activity.test.ts tests/app/home.test.tsx
git add lib/activity.ts lib/i18n.ts app/dashboard/page.tsx tests/lib/activity.test.ts tests/app/home.test.tsx
git commit -m "feat(home): journey Home with next step, stage board and recent activity

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Send users to Home

**Files:**
- Modify: `frontend/tests/app/onboarding.test.tsx:179` and `:442`
- Modify: `frontend/app/onboarding/page.tsx` (the `router.replace` near
  line 82, and the `router.push` near line 270)
- Modify: `frontend/app/page.tsx:10` (`DASHBOARD_ROUTE`)
- Modify: `frontend/app/admin/page.tsx`: both `href="/dashboard/resumes"`
  "← Back to app" links (near lines 117 and 134)

- [ ] **Step 1: Update the test expectations**

In `tests/app/onboarding.test.tsx`, change both
`toEqual(["/dashboard/resumes"])` to `toEqual(["/dashboard"])`: one in
"sends a finished user to the dashboard", the other in the test whose body
submits step 5.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx vitest run tests/app/onboarding.test.tsx`

Expected: FAIL in those 2 tests, with received `["/dashboard/resumes"]`.

- [ ] **Step 3: Change the routes**

- In `app/onboarding/page.tsx`, change `router.replace("/dashboard/resumes")`
  to `router.replace("/dashboard")` and `router.push("/dashboard/resumes")` to
  `router.push("/dashboard")`.
- In `app/page.tsx`, set `const DASHBOARD_ROUTE = "/dashboard";`.
- In `app/admin/page.tsx`, change `href="/dashboard/resumes"` to
  `href="/dashboard"` on the two "← Back to app" links only.

Then verify nothing else still sends users to the old landing spot:

```bash
cd frontend && grep -rn '"/dashboard/resumes"' app components lib
```

Expected: only the sidebar's Resumes item
(`components/app-shell/sidebar-nav.tsx`), the resume detail breadcrumbs
(`app/dashboard/resumes/[id]/page.tsx`), and the jobs-detail "upload a resume"
link (`app/dashboard/jobs/[id]/page.tsx`). Those three really are about
resumes.

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npm test`

Expected: all pass.

- [ ] **Step 5: Gates and commit**

```bash
cd frontend && npm run lint && npm run type-check && npx prettier --check app/onboarding/page.tsx app/page.tsx app/admin/page.tsx tests/app/onboarding.test.tsx
git add app/onboarding/page.tsx app/page.tsx app/admin/page.tsx tests/app/onboarding.test.tsx
git commit -m "feat(home): send signed-in users to Home instead of Resumes

Also fixes .env.example's post-sign-in URL, /dashboard, which had no page.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Full verification in the browser

No code is written in this task unless a check fails. If one does, fix it,
re-run the gates, and commit the fix as its own commit.

- [ ] **Step 1: Full gates**

```bash
cd frontend && npm test && npm run lint && npm run type-check && npm run format:check
```

Expected: all green. Record the test count, which should be 330 plus about
115 new.

- [ ] **Step 2: Start the app**

Start the dev server with `preview_start` (see `.claude/launch.json`). Also
start the backend if Home should show real data. Ask the user to sign in
in the browser pane; never type the password.

- [ ] **Step 3: Desktop checks (≥ 1280px)**

- [ ] The sidebar shows the BrandMark, Home, the three numbered groups with
  counts, and a footer with the quota meter, language switcher, Settings
  and account.
- [ ] Home: a Mincho greeting, progress, the next-step card, the board and
  recent activity match the account's real state.
- [ ] Mincho renders kanji: switch to 日本語 and run
  `[...document.fonts].filter(f => /Shippori/i.test(f.family) && f.status === "loaded").length`
  in the page. Expect > 0 after the title has rendered.
- [ ] Spot-check Resumes, Jobs detail, Interview and Settings under the new
  tokens: links are indigo, buttons ink, nothing unreadable.
- [ ] Keyboard only: Tab from the top reaches the skip link first, then the
  sidebar items in order, each with a visible indigo ring.

- [ ] **Step 4: Phone checks (375 × 812)**

- [ ] The top bar shows ☰, the seal mark and the avatar. There is no
  sidebar.
- [ ] ☰ opens the drawer. Tab stays inside it, Escape closes it, and focus
  returns to ☰.
- [ ] Choosing a link closes the drawer and navigates.
- [ ] Home's columns stack, with no horizontal scroll.

- [ ] **Step 5: Languages**

- [ ] In id and ja, the group names and the longest item fit the 240px
  sidebar, and the Home next-step card and board don't overflow.

- [ ] **Step 6: Clerk**

- [ ] Sign out and view `/sign-in`: the card uses ink and washi, not Clerk's
  purple-blue, and the header shows the BrandMark.

- [ ] **Step 7: Report**

Screenshot desktop Home, phone Home and the open drawer, and send them to
the user. Stop the dev server if the user asks.
