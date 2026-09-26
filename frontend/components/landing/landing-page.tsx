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
import { HomePreview, JobPreview, ScorePreview, VisaPreview } from "@/components/landing/previews";
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
        <p className="mt-3 text-center text-muted-foreground">
          {t("landing", "journeyLead", lang)}
        </p>
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
    <section
      aria-labelledby="final-title"
      className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6"
    >
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
