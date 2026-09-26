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
