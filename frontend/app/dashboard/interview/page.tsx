"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Mic, Plus } from "lucide-react";
import { RetryButton } from "@/components/retry-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useInterviewSessions } from "@/hooks/useInterview";
import { interviewLanguageName, interviewTitle } from "@/lib/interview-labels";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { INTERVIEW_SCORE_BANDS, scoreTone, toneText } from "@/lib/tones";
import type { InterviewSession } from "@/types/api";

export default function InterviewPage() {
  const {
    data: sessions,
    isLoading,
    isFetching,
    error,
    errorUpdateCount,
    refetch,
  } = useInterviewSessions();
  const { lang } = useLang();

  return (
    <>
      <PageHeader
        eyebrow={t("nav", "groupApply", lang)}
        title={t("interview", "title", lang)}
        description={t("interview", "sub", lang)}
        actions={
          <Button asChild>
            <Link href="/dashboard/interview/new">
              <Plus aria-hidden="true" />
              {t("interview", "newSession", lang)}
            </Link>
          </Button>
        }
      />
      <div className="space-y-6">
        {isLoading && <SessionsSkeleton />}
        {error && (
          <Alert
            announceKey={errorUpdateCount}
            action={<RetryButton retrying={isFetching} onRetry={() => void refetch()} />}
          >
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
  );
}

function SessionCard({ session: s }: { session: InterviewSession }) {
  const { lang } = useLang();
  const score = s.overall_score !== null ? Math.round(s.overall_score) : null;
  const scoreColor =
    score === null ? toneText.neutral : toneText[scoreTone(score, INTERVIEW_SCORE_BANDS)];

  const completedAt = s.completed_at
    ? new Date(s.completed_at).toLocaleDateString(lang, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const langLabel = interviewLanguageName(s.language, lang);

  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">
          {interviewTitle(s.session_type, lang)}
          {s.target_role && (
            <span className="ml-2 font-normal text-muted-foreground">— {s.target_role}</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {langLabel}
          {completedAt && ` · ${completedAt}`}
        </p>
        {s.feedback_summary && (
          <p className="line-clamp-1 text-xs text-muted-foreground">{s.feedback_summary}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 sm:shrink-0">
        {score !== null && (
          <div className="text-right">
            <p className={`text-2xl font-bold tabular-nums ${scoreColor}`}>{score}</p>
            <p className="text-xs text-muted-foreground">{t("interview", "score", lang)}</p>
          </div>
        )}
        <Button asChild variant="ghost" size="sm">
          <Link href={`/dashboard/interview/${s.id}` as Route}>
            {t("interview", "review", lang)}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </li>
  );
}

function SessionsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-lg" />
      ))}
    </div>
  );
}
