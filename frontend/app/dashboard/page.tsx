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
import {
  formatRelative,
  recentActivity,
  type ActivityItem,
  type ActivityKind,
} from "@/lib/activity";
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
                  {item.name && <span className="text-muted-foreground"> · {item.name}</span>}
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
