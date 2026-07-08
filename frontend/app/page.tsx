"use client";

import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SIGN_IN_ROUTE, SIGN_UP_ROUTE } from "@/lib/routes";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";

const DASHBOARD_ROUTE = "/dashboard/resumes";

const FEATURES = [
  { icon: "📄", titleKey: "resume", descKey: "resumeDesc" },
  { icon: "🗂️", titleKey: "docs", descKey: "docsDesc" },
  { icon: "🌐", titleKey: "jobs", descKey: "jobsDesc" },
  { icon: "🎤", titleKey: "interview", descKey: "interviewDesc" },
  { icon: "🛂", titleKey: "visa", descKey: "visaDesc" },
  { icon: "🏯", titleKey: "culture", descKey: "cultureDesc" },
];

const STEPS = [
  { step: "1", titleKey: "step1Title", descKey: "step1Desc" },
  { step: "2", titleKey: "step2Title", descKey: "step2Desc" },
  { step: "3", titleKey: "step3Title", descKey: "step3Desc" },
];

export default function LandingPage() {
  const { lang } = useLang();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navbar */}
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="container flex h-14 items-center justify-between">
          <span className="text-sm font-semibold">Japan Job Support</span>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <SignedOut>
              <Link
                href={SIGN_IN_ROUTE}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("nav", "signIn", lang)}
              </Link>
              <Link
                href={SIGN_UP_ROUTE}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t("nav", "getStarted", lang)}
              </Link>
            </SignedOut>
            <SignedIn>
              <Link
                href={DASHBOARD_ROUTE}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t("nav", "goToDashboard", lang)}
              </Link>
              <UserButton afterSignOutUrl="/sign-in" />
            </SignedIn>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container py-24 text-center">
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 inline-block rounded-full border px-3 py-1 text-xs text-muted-foreground">
            {t("landing", "badge", lang)}
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            {t("landing", "heroTitle1", lang)}{" "}
            <span className="text-primary">{t("landing", "heroTitle2", lang)}</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">{t("landing", "heroSub", lang)}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <SignedOut>
              <Link
                href={SIGN_UP_ROUTE}
                className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t("landing", "ctaPrimary", lang)}
              </Link>
            </SignedOut>
            <SignedIn>
              <Link
                href={DASHBOARD_ROUTE}
                className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t("nav", "goToDashboard", lang)}
              </Link>
            </SignedIn>
            <Link
              href="/dashboard/culture"
              className="rounded-md border px-6 py-3 text-sm font-medium transition-colors hover:bg-accent"
            >
              {t("landing", "ctaSecondary", lang)}
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-muted/40 py-20">
        <div className="container">
          <h2 className="mb-12 text-center text-2xl font-bold">
            {t("landing", "featuresTitle", lang)}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.titleKey} className="rounded-xl border bg-card p-6 shadow-sm">
                <div className="mb-3 text-3xl">{feature.icon}</div>
                <h3 className="mb-2 font-semibold">{t("features", feature.titleKey, lang)}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("features", feature.descKey, lang)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20">
        <div className="container">
          <h2 className="mb-12 text-center text-2xl font-bold">{t("landing", "howTitle", lang)}</h2>
          <div className="mx-auto max-w-2xl space-y-8">
            {STEPS.map((s) => (
              <div key={s.step} className="flex items-start gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {s.step}
                </div>
                <div>
                  <h3 className="font-semibold">{t("landing", s.titleKey, lang)}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("landing", s.descKey, lang)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <SignedOut>
        <section className="border-t bg-muted/40 py-20 text-center">
          <div className="container mx-auto max-w-xl">
            <h2 className="text-2xl font-bold">{t("landing", "ctaTitle", lang)}</h2>
            <p className="mt-3 text-muted-foreground">{t("landing", "ctaSub", lang)}</p>
            <Link
              href={SIGN_UP_ROUTE}
              className="mt-6 inline-block rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t("landing", "ctaBtn", lang)}
            </Link>
          </div>
        </section>
      </SignedOut>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Japan Job Support. {t("landing", "footer", lang)}
      </footer>
    </div>
  );
}
