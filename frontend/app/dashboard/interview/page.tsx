"use client";

import Link from "next/link";
import { useInterviewSessions } from "@/hooks/useInterview";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { InterviewSession } from "@/types/api";

export default function InterviewPage() {
  const { data: sessions, isLoading, error } = useInterviewSessions();
  const { lang } = useLang();

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("interview", "title", lang)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("interview", "sub", lang)}</p>
        </div>
        <Link
          href="/dashboard/interview/new"
          className="shrink-0 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t("interview", "newSession", lang)}
        </Link>
      </div>

      {isLoading && <SessionsSkeleton />}

      {error && (
        <p className="text-sm text-destructive">{t("interview", "loadError", lang)}</p>
      )}

      {sessions && sessions.length === 0 && !isLoading && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">{t("interview", "noSessions", lang)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link
              href="/dashboard/interview/new"
              className="underline hover:text-foreground"
            >
              {t("interview", "startFirst", lang)}
            </Link>
          </p>
        </div>
      )}

      {sessions && sessions.length > 0 && (
        <ul className="space-y-3">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionCard({ session: s }: { session: InterviewSession }) {
  const { lang } = useLang();
  const score = s.overall_score !== null ? Math.round(s.overall_score) : null;
  const scoreColor =
    score === null
      ? "text-muted-foreground"
      : score >= 70
        ? "text-green-600"
        : score >= 50
          ? "text-yellow-600"
          : "text-red-600";

  const completedAt = s.completed_at
    ? new Date(s.completed_at).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const langLabel =
    s.language === "ja"
      ? t("interview", "langJa", lang)
      : s.language === "id"
        ? t("interview", "langId", lang)
        : t("interview", "langEn", lang);

  return (
    <li className="flex items-center justify-between rounded-lg border bg-card p-4">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">
          {capitalise(s.session_type)} Interview
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

      <div className="ml-4 flex shrink-0 items-center gap-4">
        {score !== null && (
          <div className="text-right">
            <p className={`text-2xl font-bold tabular-nums ${scoreColor}`}>{score}</p>
            <p className="text-xs text-muted-foreground">{t("interview", "score", lang)}</p>
          </div>
        )}
        <Link
          href={`/dashboard/interview/${s.id}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {t("interview", "review", lang)}
        </Link>
      </div>
    </li>
  );
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

function SessionsSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
      ))}
    </ul>
  );
}
