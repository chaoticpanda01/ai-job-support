# Landing Page Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/` as a split-hero, journey-structured landing page that
shows the product, with auth buttons decided on the server so they are
there on first paint.

**Architecture:** `app/page.tsx` becomes a server component. It reads Clerk's
`auth()` and renders a client `LandingPage` with `signedIn`. Four decorative
live previews live in `components/landing/previews.tsx`. They are built from
the shared primitives and the app's real strings, and each is exposed to
assistive tech as one described image. The copy lives in a rewritten
`landing` section of `lib/i18n.ts` (en/id/ja).

**Tech Stack:** Next.js 15 App Router (server + client components),
React 19, Clerk 6 (`@clerk/nextjs/server`'s `auth`), Tailwind 3.4,
lucide-react, vitest + jsdom + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-26-landing-page-design.md`. It
builds on `docs/superpowers/specs/2026-09-26-design-foundation-shell-home-design.md`.

## Global Constraints

- All frontend commands run from `frontend/`. Tests run with
  `npx vitest run <path>`, and the full suite with `npm test`.
- **Gates before every commit**: `npm test`, `npm run lint`,
  `npm run type-check` and `npm run format:check`.
- No new npm packages.
- Every user-facing string goes through `t()` with en, id and ja.
  Placeholders use `t(...).replace("{x}", value)`.
- Data that is not translated: the author `chaoticpanda01`, the stack
  string `Next.js · FastAPI · PostgreSQL · Gemini · Clerk`, the URL
  `https://github.com/chaoticpanda01/ai-job-support`, and the sample name
  `Budi`.
- Seal (`text-seal`, `border-seal`, `bg-seal`) is a mark only: never a
  button, badge fill or error colour.
- No emoji anywhere on the page.
- Every product claim follows the spec's checked copy. Job translation and
  visa guidance are in Indonesian, and the copy says so.
- tsconfig has `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`,
  and `typedRoutes` is on: link hrefs must be `Route`-typed literals or come
  from `lib/routes.ts`.
- **Never run `npm run build` while the dev server is running.** The user
  signs in themselves, and their password is never typed.
- Work on branch `ui-foundation-shell-home`. Commit after each task,
  ending messages with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push or
  merge unless asked.

## File map

| File | Responsibility |
|---|---|
| `frontend/components/landing/previews.tsx` | `HomePreview`, `ScorePreview`, `JobPreview`, `VisaPreview` (create) |
| `frontend/components/landing/landing-page.tsx` | Client page: header, hero, journey, facts, about, final prompt, footer (create) |
| `frontend/app/page.tsx` | Server component: `auth()`, `metadata`, renders `LandingPage` (rewrite) |
| `frontend/app/layout.tsx` | `motion-safe:scroll-smooth` on `<html>` (modify) |
| `frontend/components/brand-mark.tsx` | `compact` also accepts `"mobile"` (modify) |
| `frontend/lib/i18n.ts` | `landing` section rewritten; `features` section and `nav.getStarted` / `nav.goToDashboard` deleted (modify) |
| `frontend/tests/components/landing-previews.test.tsx` | Previews (create) |
| `frontend/tests/app/landing.test.tsx` | Page (create) |
| `frontend/tests/components/ui.test.tsx` | BrandMark `"mobile"` case (modify) |

---

### Task 1: The four product previews

**Files:**
- Modify: `frontend/lib/i18n.ts`: add the preview keys *to the existing* `landing` section. The old keys stay until Task 2.
- Create: `frontend/components/landing/previews.tsx`
- Test: `frontend/tests/components/landing-previews.test.tsx`

**Interfaces:**
- **Consumes:**
  - `Badge` (`variant?: "neutral" | "info" | …`) and `Progress`
    (`value`, `max?`, `aria-label`, `className?`) from `components/ui`.
  - `t` and `useLang`.
  - `StepId` from `lib/journey`.
  - The existing keys:
    - `home.greetingNamed`, `home.progress` and `home.nextStep`
    - `journey.<stepId>`, `journey.shokumuTitle` and `journey.shokumuWhy`
    - `nav.home`, `nav.groupPrepare`, `nav.groupApply` and `nav.groupSettleIn`
    - `nav.resumes`, `nav.documents`, `nav.jobs`, `nav.interview`,
      `nav.visa` and `nav.culture`
- **Produces:** `HomePreview()`, `ScorePreview()`, `JobPreview()` and
  `VisaPreview()`. Each takes no props and renders one
  `role="img"` element named by `landing.preview{Home,Score,Job,Visa}Label`.

- [ ] **Step 1: Add the preview strings**

In `lib/i18n.ts`, add these to the end of the `landing` section, after
`step3Desc`:

```ts
    // Product previews (components/landing/previews.tsx). Each preview is one
    // image to screen readers; the label is all they hear of it.
    previewHomeLabel: {
      en: "Preview of the Home page: the next step is to create your 職務経歴書",
      id: "Pratinjau halaman Beranda: langkah berikutnya adalah membuat 職務経歴書",
      ja: "ホーム画面のプレビュー：次のステップは職務経歴書の作成",
    },
    previewScoreLabel: {
      en: "Preview of a resume analysis: Japan-market score 72",
      id: "Pratinjau analisis resume: skor pasar Jepang 72",
      ja: "レジュメ分析のプレビュー：日本市場スコア72",
    },
    previewJobLabel: {
      en: "Preview of a translated job posting: Backend Engineer in Tokyo, foreigner-friendliness 85",
      id: "Pratinjau lowongan yang diterjemahkan: Backend Engineer di Tokyo, keramahan bagi pekerja asing 85",
      ja: "翻訳された求人のプレビュー：東京のバックエンドエンジニア、外国人フレンドリー度85",
    },
    previewVisaLabel: {
      en: "Preview of a visa roadmap: step 2 of 5",
      id: "Pratinjau peta jalan visa: langkah 2 dari 5",
      ja: "ビザロードマップのプレビュー：5ステップ中2",
    },
    scoreTitle: { en: "Japan-market score", id: "Skor pasar Jepang", ja: "日本市場スコア" },
    scoreStrengths: { en: "Strengths", id: "Kekuatan", ja: "強み" },
    scoreImprove: { en: "To improve", id: "Perlu ditingkatkan", ja: "改善点" },
    jobTitle: {
      en: "Backend Engineer · Tokyo",
      id: "Backend Engineer · Tokyo",
      ja: "バックエンドエンジニア・東京",
    },
    jobTranslated: {
      en: "Translated from Japanese",
      id: "Diterjemahkan dari bahasa Jepang",
      ja: "日本語から翻訳",
    },
    jobVisa: { en: "Visa sponsorship", id: "Sponsor visa", ja: "ビザサポートあり" },
    jobFriendliness: {
      en: "Foreigner-friendliness",
      id: "Keramahan bagi pekerja asing",
      ja: "外国人フレンドリー度",
    },
    visaName: {
      en: "Engineer / Specialist in Humanities",
      id: "Engineer / Specialist in Humanities",
      ja: "技術・人文知識・国際業務",
    },
    visaStep: {
      en: "Roadmap · step 2 of 5",
      id: "Peta jalan · langkah 2 dari 5",
      ja: "ロードマップ・5ステップ中2",
    },
    visaItem1: { en: "Degree certificate", id: "Ijazah", ja: "卒業証明書" },
    visaItem2: {
      en: "Certificate of Eligibility",
      id: "Certificate of Eligibility (COE)",
      ja: "在留資格認定証明書",
    },
    visaItem3: { en: "Employment contract", id: "Kontrak kerja", ja: "雇用契約書" },
```

- [ ] **Step 2: Write the failing tests**

Create `frontend/tests/components/landing-previews.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderIn } from "../helpers";
import { t, type Language } from "@/lib/i18n";
import {
  HomePreview,
  JobPreview,
  ScorePreview,
  VisaPreview,
} from "@/components/landing/previews";

const PREVIEWS = [
  ["HomePreview", HomePreview, "previewHomeLabel"],
  ["ScorePreview", ScorePreview, "previewScoreLabel"],
  ["JobPreview", JobPreview, "previewJobLabel"],
  ["VisaPreview", VisaPreview, "previewVisaLabel"],
] as const;

const FOCUSABLE = "a, button, input, select, textarea, [tabindex]";

describe.each(PREVIEWS)("%s", (_, Preview, labelKey) => {
  it.each<Language>(["en", "ja"])("is one image, described in %s", (lang) => {
    renderIn(lang, <Preview />);
    expect(screen.getByRole("img", { name: t("landing", labelKey, lang) })).toBeInTheDocument();
  });

  it("hides its insides from assistive tech and keyboard", () => {
    renderIn("en", <Preview />);
    const image = screen.getByRole("img");
    // A progress bar inside would otherwise be announced on its own.
    expect(within(image).queryAllByRole("progressbar")).toEqual([]);
    expect(image.querySelectorAll(FOCUSABLE)).toHaveLength(0);
  });
});

describe("HomePreview", () => {
  it("uses the app's own journey strings, so it follows the language", () => {
    renderIn("ja", <HomePreview />);
    const image = screen.getByRole("img");
    expect(image).toHaveTextContent(t("journey", "shokumuTitle", "ja"));
    expect(image).toHaveTextContent("おかえりなさい、Budiさん");
    expect(image).toHaveTextContent(t("nav", "groupSettleIn", "ja"));
  });

  it("shows the same progress as its next step implies: 4 of 8", () => {
    renderIn("en", <HomePreview />);
    expect(screen.getByRole("img")).toHaveTextContent(
      t("home", "progress", "en").replace("{done}", "4").replace("{total}", "8"),
    );
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd frontend && npx vitest run tests/components/landing-previews.test.tsx`

Expected: FAIL, "Failed to resolve import `@/components/landing/previews`".

- [ ] **Step 4: Implement `frontend/components/landing/previews.tsx`**

```tsx
"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { StepId } from "@/lib/journey";
import { cn } from "@/lib/utils";

/** A made-up user, so the preview reads like a real account. A name, so not translated. */
const SAMPLE_NAME = "Budi";

/**
 * A decorative product shot. To assistive tech it is one image, described by
 * `label`; everything inside is aria-hidden, and nothing in it is focusable or
 * clickable. These float (a landing-page product shot), so they take a shadow.
 */
function PreviewFrame({
  label,
  raised = false,
  className,
  children,
}: {
  label: string;
  raised?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "overflow-hidden rounded-lg border bg-card text-card-foreground",
        raised
          ? "shadow-[0_22px_48px_rgba(28,27,25,0.13)]"
          : "shadow-[0_14px_30px_rgba(28,27,25,0.09)]",
      )}
    >
      <div aria-hidden="true" className={cn("select-none", className)}>
        {children}
      </div>
    </div>
  );
}

/** Placeholder text lines, for content the preview only needs to suggest. */
function Lines({ widths }: { widths: string[] }) {
  return (
    <>
      {widths.map((width) => (
        <div key={width} className="mt-1.5 h-2 rounded bg-secondary" style={{ width }} />
      ))}
    </>
  );
}

type Mark = "done" | "next" | "todo";

/** The same done / next / to-do markers as Home's board. */
function StepMark({ mark }: { mark: Mark }) {
  return (
    <span
      className={cn(
        "flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full border",
        mark === "done"
          ? "border-indigo bg-indigo text-white"
          : mark === "next"
            ? "border-seal"
            : "border-muted-foreground",
      )}
    >
      {mark === "done" && <Check className="h-2 w-2" strokeWidth={4} />}
    </span>
  );
}

// Prepare 4 of 5 with 職務経歴書 next: the 4 of 8 in the progress line.
const HOME_STAGES: { labelKey: string; steps: [StepId, Mark][] }[] = [
  {
    labelKey: "groupPrepare",
    steps: [
      ["profile", "done"],
      ["resumeUploaded", "done"],
      ["resumeAnalysed", "done"],
      ["rirekisho", "done"],
      ["shokumu", "next"],
    ],
  },
  {
    labelKey: "groupApply",
    steps: [
      ["application", "todo"],
      ["interview", "todo"],
    ],
  },
  { labelKey: "groupSettleIn", steps: [["visa", "todo"]] },
];

const SIDEBAR_GROUPS = [
  { labelKey: "groupPrepare", items: ["resumes", "documents"] },
  { labelKey: "groupApply", items: ["jobs", "interview"] },
  { labelKey: "groupSettleIn", items: ["visa", "culture"] },
];

/** A miniature of Home: sidebar, greeting, progress, next step and the board. */
export function HomePreview() {
  const { lang } = useLang();
  const label = t("landing", "previewHomeLabel", lang);
  return (
    <PreviewFrame label={label} raised className="flex text-[10px] leading-snug">
      <div className="hidden w-28 shrink-0 border-r p-2 sm:block">
        <span className="mb-2 flex h-5 w-5 items-center justify-center rounded-full bg-seal font-jp text-[10px] font-bold text-white">
          職
        </span>
        <p className="relative rounded bg-secondary px-2 py-1 font-semibold before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-r before:bg-seal">
          {t("nav", "home", lang)}
        </p>
        {SIDEBAR_GROUPS.map((group) => (
          <div key={group.labelKey} className="mt-2">
            <p className="px-2 text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("nav", group.labelKey, lang)}
            </p>
            {group.items.map((key) => (
              <p key={key} className="px-2 py-0.5 text-secondary-foreground">
                {t("nav", key, lang)}
              </p>
            ))}
          </div>
        ))}
      </div>
      <div className="min-w-0 flex-1 bg-background p-3">
        <p className="font-display text-sm font-bold">
          {t("home", "greetingNamed", lang).replace("{name}", SAMPLE_NAME)}
        </p>
        <p className="text-muted-foreground">
          {t("home", "progress", lang).replace("{done}", "4").replace("{total}", "8")}
        </p>
        <Progress value={4} max={8} aria-label={label} className="mt-1.5 h-1 w-3/5" />
        <div className="mt-2.5 rounded-md border border-l-2 border-l-seal bg-card p-2">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-seal">
            {t("home", "nextStep", lang)}
          </p>
          <p className="font-semibold">{t("journey", "shokumuTitle", lang)}</p>
          <p className="text-muted-foreground">{t("journey", "shokumuWhy", lang)}</p>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {HOME_STAGES.map((stage, index) => (
            <div key={stage.labelKey} className="min-w-0 rounded-md border bg-card p-1.5">
              <p className="mb-1 truncate text-[8px] font-semibold uppercase tracking-wider">
                {index + 1} {t("nav", stage.labelKey, lang)}
              </p>
              {stage.steps.map(([id, mark]) => (
                <p key={id} className="flex items-center gap-1 py-0.5">
                  <StepMark mark={mark} />
                  <span
                    className={cn(
                      "truncate",
                      mark === "done" && "text-muted-foreground line-through",
                      mark === "next" && "font-semibold",
                    )}
                  >
                    {t("journey", id, lang)}
                  </span>
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>
    </PreviewFrame>
  );
}

/** A resume analysis result: the Japan-market score and its two lists. */
export function ScorePreview() {
  const { lang } = useLang();
  const label = t("landing", "previewScoreLabel", lang);
  return (
    <PreviewFrame label={label} className="p-4 text-xs">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">{t("landing", "scoreTitle", lang)}</p>
        <p className="text-3xl font-bold tabular-nums text-indigo">72</p>
      </div>
      <Progress value={72} aria-label={label} className="mt-2" />
      <p className="mt-4 text-muted-foreground">{t("landing", "scoreStrengths", lang)}</p>
      <Lines widths={["90%", "72%"]} />
      <p className="mt-3 text-muted-foreground">{t("landing", "scoreImprove", lang)}</p>
      <Lines widths={["80%"]} />
    </PreviewFrame>
  );
}

/** A translated posting with its foreigner-friendliness score. */
export function JobPreview() {
  const { lang } = useLang();
  const label = t("landing", "previewJobLabel", lang);
  return (
    <PreviewFrame label={label} className="p-4 text-xs">
      <p className="font-semibold">{t("landing", "jobTitle", lang)}</p>
      <p className="text-muted-foreground">{t("landing", "jobTranslated", lang)}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge variant="info">{t("landing", "jobVisa", lang)}</Badge>
        <Badge>N2</Badge>
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <span>{t("landing", "jobFriendliness", lang)}</span>
        <span className="text-lg font-bold tabular-nums text-indigo">85</span>
      </div>
      <Progress value={85} aria-label={label} className="mt-1.5" />
      <Lines widths={["88%", "64%"]} />
    </PreviewFrame>
  );
}

const VISA_ITEMS: [string, boolean][] = [
  ["visaItem1", true],
  ["visaItem2", false],
  ["visaItem3", false],
];

/** A visa roadmap step with its document checklist. */
export function VisaPreview() {
  const { lang } = useLang();
  const label = t("landing", "previewVisaLabel", lang);
  return (
    <PreviewFrame label={label} className="p-4 text-xs">
      <p className="font-semibold">{t("landing", "visaName", lang)}</p>
      <p className="text-muted-foreground">{t("landing", "visaStep", lang)}</p>
      <Progress value={2} max={5} aria-label={label} className="mt-2" />
      <ul className="mt-4 space-y-2">
        {VISA_ITEMS.map(([key, done]) => (
          <li key={key} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                done ? "border-indigo bg-indigo text-white" : "border-muted-foreground",
              )}
            >
              {done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
            </span>
            <span className={cn(done && "text-muted-foreground line-through")}>
              {t("landing", key, lang)}
            </span>
          </li>
        ))}
      </ul>
    </PreviewFrame>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run tests/components/landing-previews.test.tsx`

Expected: PASS, 14 tests.

- [ ] **Step 6: Prove the hiding test bites**

In `previews.tsx`, temporarily change
`<div aria-hidden="true" className={cn("select-none", className)}>` to
`<div className={cn("select-none", className)}>`. Run the test file again.
The "hides its insides" test must fail for all four previews: each contains
a `Progress`, which becomes visible to assistive tech. Then revert and
re-run: PASS.

- [ ] **Step 7: Gates and commit**

```bash
cd frontend && npm test && npm run lint && npm run type-check && npm run format:check
git add lib/i18n.ts components/landing/previews.tsx tests/components/landing-previews.test.tsx
git commit -m "feat(landing): four live product previews built from the app's own parts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The landing page, with auth buttons decided on the server

**Files:**
- Modify: `frontend/components/brand-mark.tsx` (the `compact` prop also takes `"mobile"`)
- Modify: `frontend/tests/components/ui.test.tsx` (the BrandMark `"mobile"` case)
- Modify: `frontend/lib/i18n.ts`: replace the old landing keys, delete the `features` section, and delete `nav.getStarted` and `nav.goToDashboard`
- Create: `frontend/components/landing/landing-page.tsx`
- Rewrite: `frontend/app/page.tsx`
- Modify: `frontend/app/layout.tsx` (`<html>` className)
- Test: `frontend/tests/app/landing.test.tsx`

**Interfaces:**
- **Consumes:**
  - The previews from Task 1.
  - `Button` (`asChild`, `size`, `variant`) and `BrandMark`.
  - `LanguageSwitcher`.
  - `SIGN_IN_ROUTE` and `SIGN_UP_ROUTE` from `lib/routes`.
  - The keys `nav.signIn`, `nav.groupPrepare`, `nav.groupApply` and
    `nav.groupSettleIn`.
- **Produces:**
  - `LandingPage({ signedIn }: { signedIn: boolean })`.
  - The default export of `app/page.tsx`: an async server component.
  - `metadata` exported from `app/page.tsx`.
  - `BrandMark({ compact?: boolean | "mobile"; className? })`.

- [ ] **Step 1: The BrandMark "mobile" case**

Append to the `BrandMark` describe block in `tests/components/ui.test.tsx`:

```tsx
  it("hides only the wordmark's text below sm when compact is 'mobile'", () => {
    render(
      <Link href="/">
        <BrandMark compact="mobile" />
      </Link>,
    );
    const link = screen.getByRole("link", { name: "Japan Job Support" });
    const wordmark = within(link).getByText("Japan Job Support");
    expect(wordmark).toHaveClass("sr-only", "sm:not-sr-only");
  });
```

Add `within` to that file's `@testing-library/react` import. Run
`npx vitest run tests/components/ui.test.tsx`: it fails, because the class is
missing. Then change `components/brand-mark.tsx`:

```tsx
/**
 * The seal logo: a vermilion circle with 職 ("job"), and the wordmark. The
 * seal is decorative; the wordmark carries the name, visually hidden when
 * compact (always, or with "mobile" only below the sm breakpoint) so a link
 * wrapping it still has one.
 */
export function BrandMark({
  compact = false,
  className,
}: {
  compact?: boolean | "mobile";
  className?: string;
}) {
```

and the wordmark's className to:

```tsx
      <span
        className={cn(
          "whitespace-nowrap text-[15px] font-bold",
          compact === true && "sr-only",
          compact === "mobile" && "sr-only sm:not-sr-only",
        )}
      >
```

Re-run: PASS (12 tests in `ui.test.tsx`).

- [ ] **Step 2: Replace the landing strings**

In `lib/i18n.ts`, do three things:

1. **Delete** the whole `features: { … }` section, including its comment
   banner.
2. **Delete** `getStarted` and `goToDashboard` from `nav`. Only the old
   landing page used them; `nav.signIn` stays, because the chat widget uses
   it.
3. **Replace** these keys in `landing`: `badge`, `heroTitle1`,
   `heroTitle2`, `heroSub`, `ctaPrimary`, `ctaSecondary`, `featuresTitle`,
   `howTitle`, `ctaTitle`, `ctaSub`, `ctaBtn`, `footer`, `step1Title`,
   `step1Desc`, `step2Title`, `step2Desc`, `step3Title` and `step3Desc`.
   Keep the Task 1 preview keys, and put these before them:

```ts
    eyebrow: {
      en: "For Indonesian professionals",
      id: "Untuk profesional Indonesia",
      ja: "インドネシアのプロフェッショナルへ",
    },
    heroTitle: {
      en: "Your move to Japan, one step at a time.",
      id: "Pindah kerja ke Jepang, selangkah demi selangkah.",
      ja: "日本で働くまでを、一歩ずつ。",
    },
    heroLead: {
      en: "Build your 履歴書, practise interviews in Japanese, and find the right visa, with the whole app in English, Bahasa Indonesia or 日本語.",
      id: "Buat 履歴書-mu, latihan wawancara dalam bahasa Jepang, dan temukan visa yang tepat, dengan seluruh aplikasi dalam bahasa Inggris, Bahasa Indonesia, atau 日本語.",
      ja: "履歴書の作成、日本語での面接練習、最適なビザ探しまで。アプリはすべて英語・インドネシア語・日本語で使えます。",
    },
    startFree: { en: "Start free", id: "Mulai gratis", ja: "無料で始める" },
    goToDashboard: { en: "Go to your dashboard", id: "Ke dasbor kamu", ja: "ダッシュボードへ" },
    seeHow: { en: "See how it works", id: "Lihat cara kerjanya", ja: "使い方を見る" },
    journeyTitle: {
      en: "From your resume to your visa",
      id: "Dari resume sampai visa",
      ja: "レジュメからビザまで",
    },
    journeyLead: {
      en: "Three stages, the same ones you'll follow in the app.",
      id: "Tiga tahap, sama seperti yang akan kamu ikuti di aplikasi.",
      ja: "アプリで進むのと同じ、3つのステージ。",
    },
    prepareTitle: {
      en: "Documents Japanese employers expect",
      id: "Dokumen yang diharapkan perusahaan Jepang",
      ja: "日本企業が求める応募書類",
    },
    prepareLead: {
      en: "See your resume the way a Japanese recruiter reads it, then turn it into the forms they ask for.",
      id: "Lihat resumemu seperti perekrut Jepang membacanya, lalu ubah menjadi formulir yang mereka minta.",
      ja: "日本の採用担当者の目線でレジュメを見直し、求められる書類の形に仕上げます。",
    },
    prepareTool1: {
      en: "Resume analysis with a Japan-market score",
      id: "Analisis resume dengan skor pasar Jepang",
      ja: "日本市場スコア付きのレジュメ分析",
    },
    prepareTool2: {
      en: "履歴書 in JIS format, as a portrait or landscape PDF",
      id: "履歴書 format JIS, sebagai PDF potret atau lanskap",
      ja: "JIS規格の履歴書（縦・横どちらのPDFにも対応）",
    },
    prepareTool3: {
      en: "職務経歴書 written from your work history",
      id: "職務経歴書 yang disusun dari riwayat kerjamu",
      ja: "職歴から作成する職務経歴書",
    },
    applyTitle: {
      en: "Postings you can actually read",
      id: "Lowongan yang benar-benar bisa kamu pahami",
      ja: "ちゃんと読める求人情報",
    },
    applyLead: {
      en: "Paste a Japanese job ad and read it in Bahasa Indonesia, scored for how open it is to foreign hires.",
      id: "Tempel iklan lowongan berbahasa Jepang dan baca dalam Bahasa Indonesia, lengkap dengan skor keterbukaan bagi pekerja asing.",
      ja: "日本語の求人を貼り付けると、インドネシア語で読めて、外国人採用への前向きさもスコアで分かります。",
    },
    applyTool1: {
      en: "Translation with a foreigner-friendliness score",
      id: "Terjemahan dengan skor keramahan bagi pekerja asing",
      ja: "外国人フレンドリー度付きの翻訳",
    },
    applyTool2: {
      en: "A match score against your resume",
      id: "Skor kecocokan dengan resumemu",
      ja: "レジュメとのマッチ度",
    },
    applyTool3: {
      en: "Mock interviews with written feedback, in Japanese too",
      id: "Simulasi wawancara dengan masukan tertulis, juga dalam bahasa Jepang",
      ja: "フィードバック付きの模擬面接（日本語にも対応）",
    },
    settleTitle: {
      en: "The visa, and the workplace",
      id: "Visa dan dunia kerja",
      ja: "ビザと職場",
    },
    settleLead: {
      en: "Find the visa that fits your background, and learn how a Japanese workplace runs.",
      id: "Temukan visa yang cocok dengan latar belakangmu, dan pelajari cara kerja di perusahaan Jepang.",
      ja: "経歴に合うビザを見つけ、日本の職場の仕組みを学べます。",
    },
    settleTool1: {
      en: "Visa options with a step-by-step roadmap and checklist",
      id: "Pilihan visa dengan peta jalan dan daftar periksa langkah demi langkah",
      ja: "ステップごとのロードマップとチェックリスト付きのビザ診断",
    },
    settleTool2: {
      en: "Culture guides and a workplace glossary",
      id: "Panduan budaya dan glosarium dunia kerja",
      ja: "文化ガイドと職場用語集",
    },
    // Visually hidden heading for the facts strip, so the outline has no gap.
    factsTitle: { en: "Why it's different", id: "Apa bedanya", ja: "ここが違う" },
    fact1Title: { en: "Three languages", id: "Tiga bahasa", ja: "3つの言語" },
    fact1Text: {
      en: "Every screen in English, Bahasa Indonesia or 日本語, and your resume feedback too.",
      id: "Setiap layar dalam bahasa Inggris, Bahasa Indonesia, atau 日本語, termasuk masukan untuk resumemu.",
      ja: "すべての画面が英語・インドネシア語・日本語に対応。レジュメへのフィードバックも。",
    },
    fact2Title: { en: "JIS-format 履歴書", id: "履歴書 format JIS", ja: "JIS規格の履歴書" },
    fact2Text: {
      en: "Real PDFs, portrait or landscape, ready to send.",
      id: "PDF asli, potret atau lanskap, siap dikirim.",
      ja: "縦・横どちらでも、そのまま送れるPDF。",
    },
    fact3Title: {
      en: "Interviews in Japanese",
      id: "Wawancara dalam bahasa Jepang",
      ja: "日本語での面接",
    },
    fact3Text: {
      en: "Practise the real thing, with feedback on each answer.",
      id: "Latihan seperti aslinya, dengan masukan untuk setiap jawaban.",
      ja: "本番さながらの練習と、回答ごとのフィードバック。",
    },
    fact4Title: { en: "Free to try", id: "Gratis dicoba", ja: "無料で試せる" },
    fact4Text: {
      en: "Sign up and start with your resume. No payment details needed.",
      id: "Daftar dan mulai dari resumemu. Tanpa data pembayaran.",
      ja: "登録してレジュメから始めるだけ。支払い情報は不要です。",
    },
    aboutTitle: { en: "About this project", id: "Tentang proyek ini", ja: "このプロジェクトについて" },
    // {name} is the author's handle, set in bold by the page.
    aboutBuiltBy: {
      en: "Built by {name} as a portfolio project.",
      id: "Dibuat oleh {name} sebagai proyek portofolio.",
      ja: "{name}がポートフォリオとして制作したプロジェクトです。",
    },
    aboutCode: { en: "View the code on GitHub", id: "Lihat kodenya di GitHub", ja: "GitHubでコードを見る" },
    opensNewTab: { en: "(opens in a new tab)", id: "(terbuka di tab baru)", ja: "（新しいタブで開きます）" },
    finalTitle: { en: "Start with your resume", id: "Mulai dari resumemu", ja: "まずはレジュメから" },
    finalLead: {
      en: "Upload it and see how a Japanese recruiter would read it.",
      id: "Unggah dan lihat bagaimana perekrut Jepang akan membacanya.",
      ja: "アップロードして、日本の採用担当者の視点で確認しましょう。",
    },
    footer: {
      en: "© {year} · Built for Indonesian professionals",
      id: "© {year} · Dibuat untuk profesional Indonesia",
      ja: "© {year} · インドネシアのプロフェッショナルのために",
    },
```

Then check nothing still reads the deleted keys:

```bash
cd frontend && grep -rnE 't\("features"|"getStarted"|"goToDashboard"|"heroTitle1"|"ctaPrimary"|"step1Title"' app components lib | grep -v lib/i18n.ts
```

Expected: only `app/page.tsx`, which Step 5 rewrites.

- [ ] **Step 3: Write the failing page tests**

Create `frontend/tests/app/landing.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderIn } from "../helpers";
import { t, type Language } from "@/lib/i18n";

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: session.userId }) }));
vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <button type="button">Open user menu</button>,
}));

const pageModule = await import("@/app/page");
const Page = pageModule.default;

const l = (key: string, lang: Language = "en") => t("landing", key, lang);

/** Render the page as the server would for the current session. */
async function renderLanding(lang: Language = "en") {
  return renderIn(lang, await Page());
}

beforeEach(() => {
  session.userId = null;
});

describe("landing page: signed out", () => {
  it("offers sign in and sign up, everywhere it matters", async () => {
    await renderLanding();
    expect(screen.getByRole("link", { name: t("nav", "signIn", "en") })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    const startFree = screen.getAllByRole("link", { name: l("startFree") });
    // Header, hero and the final prompt.
    expect(startFree).toHaveLength(3);
    for (const link of startFree) expect(link).toHaveAttribute("href", "/sign-up");
    expect(screen.queryByRole("link", { name: l("goToDashboard") })).not.toBeInTheDocument();
  });

  it("ends with the final prompt", async () => {
    await renderLanding();
    expect(screen.getByRole("heading", { level: 2, name: l("finalTitle") })).toBeInTheDocument();
  });
});

describe("landing page: signed in", () => {
  beforeEach(() => {
    session.userId = "user_123";
  });

  it("goes to the dashboard instead of asking to sign up", async () => {
    await renderLanding();
    const dashboard = screen.getAllByRole("link", { name: l("goToDashboard") });
    expect(dashboard.length).toBeGreaterThanOrEqual(2); // header and hero
    for (const link of dashboard) expect(link).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("link", { name: l("startFree") })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: t("nav", "signIn", "en") })).not.toBeInTheDocument();
  });

  it("has no final sign-up prompt", async () => {
    await renderLanding();
    expect(screen.queryByRole("heading", { name: l("finalTitle") })).not.toBeInTheDocument();
  });
});

describe("landing page: structure", () => {
  it("has one h1, the headline", async () => {
    await renderLanding();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(l("heroTitle"));
  });

  it("titles every section with an h2", async () => {
    await renderLanding();
    const h2s = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(h2s).toEqual([
      l("journeyTitle"),
      l("factsTitle"),
      l("aboutTitle"),
      l("finalTitle"),
    ]);
  });

  it("titles each stage with an h3", async () => {
    await renderLanding();
    for (const key of ["prepareTitle", "applyTitle", "settleTitle"]) {
      expect(screen.getByRole("heading", { level: 3, name: l(key) })).toBeInTheDocument();
    }
  });

  it("shows the product: four described previews", async () => {
    await renderLanding();
    for (const key of ["previewHomeLabel", "previewScoreLabel", "previewJobLabel", "previewVisaLabel"]) {
      expect(screen.getByRole("img", { name: l(key) })).toBeInTheDocument();
    }
  });

  it("jumps to the journey from 'See how it works'", async () => {
    const { container } = await renderLanding();
    expect(screen.getByRole("link", { name: l("seeHow") })).toHaveAttribute("href", "#how");
    expect(container.querySelector("#how")).toBeInTheDocument();
  });

  it("credits the project and links its code in a new tab, saying so", async () => {
    await renderLanding();
    const about = screen.getByRole("region", { name: l("aboutTitle") });
    expect(about).toHaveTextContent("chaoticpanda01");
    expect(about).toHaveTextContent("Next.js · FastAPI · PostgreSQL · Gemini · Clerk");
    const code = within(about).getByRole("link", { name: new RegExp(l("aboutCode")) });
    expect(code).toHaveAttribute("href", "https://github.com/chaoticpanda01/ai-job-support");
    expect(code).toHaveAttribute("target", "_blank");
    expect(code.getAttribute("rel")).toContain("noopener");
    expect(code).toHaveAccessibleName(`${l("aboutCode")} ${l("opensNewTab")}`);
  });

  it("uses no emoji", async () => {
    const { container } = await renderLanding();
    // \p{Emoji_Presentation} and the emoji variation selector: the old 📄 and
    // 🗂️. Not Extended_Pictographic, which also matches the footer's ©.
    expect(container.textContent).not.toMatch(/\p{Emoji_Presentation}|️/u);
  });

  it("exports a title and description for search and link previews", () => {
    expect(pageModule.metadata.title).toBeTruthy();
    expect(pageModule.metadata.description).toBeTruthy();
  });
});

describe.each<Language>(["ja", "id"])("landing page in %s", (lang) => {
  it("translates the headline and the previews", async () => {
    await renderLanding(lang);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(l("heroTitle", lang));
    expect(screen.getByRole("img", { name: l("previewHomeLabel", lang) })).toBeInTheDocument();
  });

  it("shows no raw string keys", async () => {
    const { container } = await renderLanding(lang);
    // t() prints the key when a string is missing; these are the keys the
    // page builds at runtime.
    expect(container.textContent).not.toMatch(
      /\b(?:prepare|apply|settle)(?:Title|Lead|Tool\d)\b|\bfact\d(?:Title|Text)\b/,
    );
  });
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `cd frontend && npx vitest run tests/app/landing.test.tsx`

Expected: FAIL. The current `app/page.tsx` is a client component, so it
renders no previews, no "Start free" ×3, and so on.

- [ ] **Step 5: Implement `components/landing/landing-page.tsx`**

```tsx
"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import {
  ArrowDown,
  BookOpen,
  ExternalLink,
  FileSearch,
  FileText,
  Files,
  Languages,
  Mic,
  Stamp,
  Target,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import {
  HomePreview,
  JobPreview,
  ScorePreview,
  VisaPreview,
} from "@/components/landing/previews";
import { useLang } from "@/lib/language-context";
import { t, type Language } from "@/lib/i18n";
import { SIGN_IN_ROUTE, SIGN_UP_ROUTE } from "@/lib/routes";
import { cn } from "@/lib/utils";

// Facts about the project, not copy: not translated.
const AUTHOR = "chaoticpanda01";
const STACK = "Next.js · FastAPI · PostgreSQL · Gemini · Clerk";
const GITHUB_URL = "https://github.com/chaoticpanda01/ai-job-support";

interface Stage {
  n: number;
  /** The app's own stage name (nav.group*), so page and app agree. */
  labelKey: string;
  /** Prefix of this stage's landing strings: {prefix}Title, {prefix}Lead, {prefix}ToolN. */
  prefix: "prepare" | "apply" | "settle";
  tools: [string, LucideIcon][];
  Preview: ComponentType;
  /** Preview on the left on wide screens, so the rows alternate. */
  flip?: boolean;
}

const STAGES: Stage[] = [
  {
    n: 1,
    labelKey: "groupPrepare",
    prefix: "prepare",
    tools: [
      ["prepareTool1", FileSearch],
      ["prepareTool2", FileText],
      ["prepareTool3", Files],
    ],
    Preview: ScorePreview,
  },
  {
    n: 2,
    labelKey: "groupApply",
    prefix: "apply",
    tools: [
      ["applyTool1", Languages],
      ["applyTool2", Target],
      ["applyTool3", Mic],
    ],
    Preview: JobPreview,
    flip: true,
  },
  {
    n: 3,
    labelKey: "groupSettleIn",
    prefix: "settle",
    tools: [
      ["settleTool1", Stamp],
      ["settleTool2", BookOpen],
    ],
    Preview: VisaPreview,
  },
];

const FACTS = [1, 2, 3, 4] as const;

/**
 * The public landing page. `signedIn` comes from the server (app/page.tsx),
 * so the right buttons are in the first paint; Clerk's <SignedIn>/<SignedOut>
 * would render nothing until its script loads.
 */
export function LandingPage({ signedIn }: { signedIn: boolean }) {
  const { lang } = useLang();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader signedIn={signedIn} lang={lang} />
      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        <Hero signedIn={signedIn} lang={lang} />
        <Journey lang={lang} />
        <Facts lang={lang} />
        <About lang={lang} />
        {!signedIn && <FinalPrompt lang={lang} />}
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}

function SiteHeader({ signedIn, lang }: { signedIn: boolean; lang: Language }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandMark compact="mobile" />
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          {signedIn ? (
            <>
              {/* Below sm the hero's own button is right under the header. */}
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/dashboard">{t("landing", "goToDashboard", lang)}</Link>
              </Button>
              <UserButton afterSignOutUrl="/sign-in" />
            </>
          ) : (
            <>
              <Link
                href={SIGN_IN_ROUTE}
                className="whitespace-nowrap rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("nav", "signIn", lang)}
              </Link>
              <Button asChild size="sm">
                <Link href={SIGN_UP_ROUTE}>{t("landing", "startFree", lang)}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero({ signedIn, lang }: { signedIn: boolean; lang: Language }) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:gap-14 lg:py-24">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-seal">
          {t("landing", "eyebrow", lang)}
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold leading-[1.15] sm:text-5xl">
          {t("landing", "heroTitle", lang)}
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {t("landing", "heroLead", lang)}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            {signedIn ? (
              <Link href="/dashboard">{t("landing", "goToDashboard", lang)}</Link>
            ) : (
              <Link href={SIGN_UP_ROUTE}>{t("landing", "startFree", lang)}</Link>
            )}
          </Button>
          <Button asChild size="lg" variant="secondary">
            <a href="#how">
              {t("landing", "seeHow", lang)}
              <ArrowDown aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>
      <HomePreview />
    </section>
  );
}

function Journey({ lang }: { lang: Language }) {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-16 border-y bg-card">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <h2 id="how-title" className="text-center font-display text-3xl font-bold">
          {t("landing", "journeyTitle", lang)}
        </h2>
        <p className="mt-3 text-center text-muted-foreground">{t("landing", "journeyLead", lang)}</p>
        <div className="mt-14 space-y-16 lg:space-y-24">
          {STAGES.map((stage) => (
            <StageRow key={stage.prefix} stage={stage} lang={lang} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StageRow({ stage, lang }: { stage: Stage; lang: Language }) {
  const { Preview } = stage;
  return (
    <div className="grid items-center gap-8 md:grid-cols-2 md:gap-14">
      {/* Text comes first in the DOM, so phones read it before the preview. */}
      <div className={cn(stage.flip && "md:order-2")}>
        <p className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-seal text-xs font-bold text-seal"
          >
            {stage.n}
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-seal">
            {t("nav", stage.labelKey, lang)}
          </span>
        </p>
        <h3 className="mt-3 text-xl font-semibold">{t("landing", `${stage.prefix}Title`, lang)}</h3>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          {t("landing", `${stage.prefix}Lead`, lang)}
        </p>
        <ul className="mt-5 space-y-2.5">
          {stage.tools.map(([key, Icon]) => (
            <li key={key} className="flex gap-3 text-sm">
              <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-indigo" />
              {t("landing", key, lang)}
            </li>
          ))}
        </ul>
      </div>
      <Preview />
    </div>
  );
}

function Facts({ lang }: { lang: Language }) {
  return (
    <section aria-labelledby="facts-title" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h2 id="facts-title" className="sr-only">
        {t("landing", "factsTitle", lang)}
      </h2>
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {FACTS.map((n) => (
          <div key={n} className="border-t pt-4">
            <h3 className="font-semibold">{t("landing", `fact${n}Title`, lang)}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {t("landing", `fact${n}Text`, lang)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function About({ lang }: { lang: Language }) {
  // "{name}" sits at different places per language; split around it so the
  // handle can be bold wherever it falls.
  const [before = "", after = ""] = t("landing", "aboutBuiltBy", lang).split("{name}");
  return (
    <section aria-labelledby="about-title" className="border-y bg-card">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2
            id="about-title"
            className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
          >
            {t("landing", "aboutTitle", lang)}
          </h2>
          <p className="mt-1.5 text-sm">
            {before}
            <strong>{AUTHOR}</strong>
            {after} <span className="text-muted-foreground">{STACK}</span>
          </p>
        </div>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 self-start whitespace-nowrap rounded text-sm font-semibold text-indigo hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:self-auto"
        >
          {t("landing", "aboutCode", lang)}
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only"> {t("landing", "opensNewTab", lang)}</span>
        </a>
      </div>
    </section>
  );
}

function FinalPrompt({ lang }: { lang: Language }) {
  return (
    <section aria-labelledby="final-title" className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
      <h2 id="final-title" className="font-display text-3xl font-bold">
        {t("landing", "finalTitle", lang)}
      </h2>
      <p className="mt-3 text-muted-foreground">{t("landing", "finalLead", lang)}</p>
      <Button asChild size="lg" className="mt-8">
        <Link href={SIGN_UP_ROUTE}>{t("landing", "startFree", lang)}</Link>
      </Button>
    </section>
  );
}

function SiteFooter({ lang }: { lang: Language }) {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <BrandMark compact="mobile" />
        <p>{t("landing", "footer", lang).replace("{year}", String(new Date().getFullYear()))}</p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 6: Rewrite `app/page.tsx` as a server component**

```tsx
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { LandingPage } from "@/components/landing/landing-page";

// English only: metadata is static, and search engines and link previews
// don't carry the visitor's language cookie.
export const metadata: Metadata = {
  title: { absolute: "Japan Job Support: your move to Japan, one step at a time" },
  description:
    "Build your 履歴書, practise interviews in Japanese and find the right visa. A free career guide for Indonesian professionals moving to Japan.",
};

/**
 * Decides signed in or out on the server, so the landing page's buttons are
 * right on first paint instead of appearing once Clerk's script has loaded.
 * clerkMiddleware already runs on "/" (see middleware.ts), which auth() needs.
 */
export default async function LandingRoute() {
  const { userId } = await auth();
  return <LandingPage signedIn={userId !== null} />;
}
```

- [ ] **Step 7: Smooth scrolling only when motion is allowed**

In `app/layout.tsx`, add `motion-safe:scroll-smooth` to the `<html>`
className:

```tsx
      <html
        lang={lang}
        className={`${notoSans.variable} ${notoSansJP.variable} ${shipporiMincho.variable} motion-safe:scroll-smooth`}
      >
```

- [ ] **Step 8: Run the tests**

Run: `cd frontend && npx vitest run tests/app/landing.test.tsx tests/components && npm test`

Expected: landing PASS (16 tests), and the full suite green, including the
i18n completeness and placeholder tests (`{name}` and `{year}` are in all
three languages).

If `toHaveAccessibleName` sees a doubled space between "View the code on
GitHub" and "(opens in a new tab)" (jsdom joins inline elements
differently), compare the normalised name instead:
`expect(code.textContent?.replace(/\s+/g, " ").trim()).toBe(...)`. Keep the
assertion that the new-tab text is in the name.

- [ ] **Step 9: Prove the tests catch mistakes**

Apply each mutation, run `npx vitest run tests/app/landing.test.tsx`,
confirm it FAILS, and restore the file before the next one:

| File | Change | Must fail |
|---|---|---|
| `app/page.tsx` | `userId !== null` → `userId === null` | signed-out / signed-in tests |
| `components/landing/landing-page.tsx` | `{!signedIn && <FinalPrompt lang={lang} />}` → `<FinalPrompt lang={lang} />` | "has no final sign-up prompt" |
| `components/landing/landing-page.tsx` | delete `rel="noopener noreferrer"` | "credits the project…" |
| `components/landing/landing-page.tsx` | delete the `<span className="sr-only"> {t("landing", "opensNewTab", lang)}</span>` | "credits the project…" |
| `lib/i18n.ts` | rename `settleTool2` to `settleToolTwo` (all three languages untouched otherwise) | "shows no raw string keys" |

After the last one, `git diff --stat` should show only this task's intended
changes.

- [ ] **Step 10: Gates and commit**

```bash
cd frontend && npm test && npm run lint && npm run type-check && npm run format:check
git add components/brand-mark.tsx tests/components/ui.test.tsx lib/i18n.ts components/landing/landing-page.tsx app/page.tsx app/layout.tsx tests/app/landing.test.tsx
git commit -m "feat(landing): journey landing page with auth buttons decided on the server

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Verify in the browser

No code is written in this task unless a check fails. If one does, fix it,
re-run the gates, and commit the fix as its own commit.

- [ ] **Step 1: Buttons in the first paint, signed out**

The dev server must be running (`preview_start` "frontend"). Then:

```bash
curl -s http://localhost:3000/ | grep -o 'Start free\|Sign in\|Go to your dashboard' | sort | uniq -c
```

Expected: "Start free" (3) and "Sign in" (1) are in the server's HTML, and
"Go to your dashboard" is absent. With no cookies, curl is signed out.

- [ ] **Step 2: Signed in, desktop (1280×860)**

In the browser pane, open `/` (the user is signed in):

- [ ] The header shows the seal and wordmark, the language switch, "Go to
  your dashboard" and the avatar, **with no gap** on reload.
- [ ] The hero is split, with the Mincho headline and the Home preview.
- [ ] The journey rows alternate: preview right, then left, then right.
- [ ] The facts, the about strip (the GitHub link opens a new tab) and the
  footer are present, and there is no final prompt.

- [ ] **Step 3: Phone (375×812)**

- [ ] No horizontal scroll: `document.documentElement.scrollWidth === innerWidth`.
- [ ] The header fits: the seal only, the language switch and the avatar.
- [ ] The hero stacks: text, buttons, then the preview, whose mini sidebar
  is hidden.
- [ ] The journey rows stack with the text first; the facts go to one
  column; the about strip stacks.

- [ ] **Step 4: Languages**

- [ ] Switch to 日本語, then Indonesian. The headline wraps cleanly, nothing
  overflows, and the previews translate.

- [ ] **Step 5: Keyboard and motion**

- [ ] Tab from the top: skip link → brand → language buttons → header
  button(s) → hero buttons → GitHub link. Nothing inside a preview takes
  focus.
- [ ] "See how it works" scrolls smoothly to the journey.
  `getComputedStyle(document.documentElement).scrollBehavior` is `smooth`,
  and `matchMedia("(prefers-reduced-motion: reduce)").matches` is `false`.
  The browser pane can't emulate reduced motion, so the other half is
  covered by the CSS itself: check the compiled stylesheet wraps the rule in
  `@media (prefers-reduced-motion: no-preference)`. Run
  `[...document.styleSheets].flatMap(s => [...s.cssRules]).filter(r => r.cssText.includes('prefers-reduced-motion: no-preference') && r.cssText.includes('scroll-behavior')).length > 0`.

- [ ] **Step 6: Report**

Take screenshots of desktop signed in, phone signed in, and the Japanese
hero, and show them to the user.
