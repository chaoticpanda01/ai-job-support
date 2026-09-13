"use client";

import { use } from "react";
import { useAnalyzeResume, useResume, useResumeAnalysis } from "@/hooks/useResumes";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { LiveAnnouncer } from "@/components/live-announcer";
import { useToast } from "@/hooks/use-toast";
import { ApiClientError } from "@/lib/api-client";
import { useLang } from "@/lib/language-context";
import { t, type translations } from "@/lib/i18n";
import type { AnalysisErrorCode, ResumeAnalysis } from "@/types/api";

interface Props {
  params: Promise<{ id: string }>;
}

type ResumeMessageKey = keyof (typeof translations)["resumes"];

// Typed as real message keys: t() returns an unknown key as-is, so a typo here
// would show the raw key instead of failing to compile.
const FAILURE_MESSAGE_KEYS: Record<AnalysisErrorCode, ResumeMessageKey> = {
  budget_exceeded: "analysisFailedBudget",
  unreadable_file: "analysisFailedUnreadable",
  file_unavailable: "analysisFailedFile",
  ai_failed: "analysisFailedAi",
  timed_out: "analysisFailedTimeout",
  unknown: "analysisFailedUnknown",
};

/** Message key for a failure code, treating a code this client doesn't know as unknown. */
function failureMessageKey(code: string | null): ResumeMessageKey {
  return code !== null && Object.hasOwn(FAILURE_MESSAGE_KEYS, code)
    ? FAILURE_MESSAGE_KEYS[code as AnalysisErrorCode]
    : FAILURE_MESSAGE_KEYS.unknown;
}

export default function ResumeDetailPage({ params }: Props) {
  const { id } = use(params);
  const { data: resume, isLoading, error } = useResume(id);
  const {
    data: analysis,
    isLoading: analysisLoading,
    error: analysisError,
    status: analysisStatus,
    statusError,
    statusErrorCount,
    checkingStatus,
    refetchStatus,
    finishing,
  } = useResumeAnalysis(id);
  const analyzeMutation = useAnalyzeResume();
  const { lang } = useLang();
  const { toast } = useToast();

  function handleAnalyze() {
    analyzeMutation.mutate(
      { resumeId: id, language: lang },
      {
        onError: (err) => {
          toast({
            variant: "destructive",
            description: err instanceof ApiClientError ? err.detail : t("common", "error", lang),
          });
        },
      },
    );
  }

  if (isLoading) return <PageSkeleton />;
  if (error || !resume) {
    return (
      <div className="space-y-4">
        <Breadcrumbs
          items={[{ label: t("resumes", "yourResumes", lang), href: "/dashboard/resumes" }]}
        />
        <p className="text-sm text-destructive">{t("resumes", "notFound", lang)}</p>
      </div>
    );
  }

  const fileSizeKB = Math.round(resume.file_size_bytes / 1024);
  const uploadedAt = new Date(resume.created_at).toLocaleDateString(lang, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const pending = !statusError && analysisStatus?.status === "pending";
  // Until the result of a request that just ended arrives, keep the spinner, so
  // the empty state and its Analyse button don't flash up in between.
  const busy = pending || finishing;
  // A failure only matters while there is no analysis to show instead.
  const failed = !analysis && !busy && !statusError && analysisStatus?.status === "failed";
  // Offer Analyse only once the status is known: a request may already be pending.
  const canAnalyse =
    !analysis &&
    !analysisLoading &&
    !analysisError &&
    !busy &&
    analysisStatus !== undefined &&
    !statusError;
  // Keyed to this visit's analyse click, so an analysis that already existed
  // on load is not read out as news. Says "analysing", then "ready" when the
  // result lands. A failure is spoken by its role="alert" message instead.
  const analysisAnnouncement = analyzeMutation.isSuccess
    ? busy
      ? t("resumes", "analysing", lang)
      : analysis
        ? t("resumes", "analysisReady", lang)
        : ""
    : "";

  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          { label: t("resumes", "yourResumes", lang), href: "/dashboard/resumes" },
          { label: resume.file_name },
        ]}
      />

      {/* Resume meta */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">{resume.file_name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {fileSizeKB} KB · {t("resumes", "uploaded", lang)} {uploadedAt}
              {resume.is_primary && (
                <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {t("common", "primary", lang)}
                </span>
              )}
            </p>
          </div>
          {resume.download_url && (
            <a
              href={resume.download_url}
              download
              className="shrink-0 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
            >
              {t("common", "download", lang)}
            </a>
          )}
        </div>
      </div>

      {/* Analysis */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-medium">{t("resumes", "aiAnalysis", lang)}</h2>
          {canAnalyse && (
            <button
              onClick={handleAnalyze}
              disabled={analyzeMutation.isPending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {analyzeMutation.isPending
                ? t("resumes", "queueing", lang)
                : failed
                  ? t("common", "tryAgain", lang)
                  : t("resumes", "analyseBtn", lang)}
            </button>
          )}
        </div>

        <LiveAnnouncer message={analysisAnnouncement} />

        {analysisLoading && (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            <div className="mx-auto mb-3 h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            {t("resumes", "analysing", lang)}
          </div>
        )}

        {analysis && <AnalysisCard analysis={analysis} />}

        {analysisError && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {t("resumes", "analysisLoadError", lang)}
          </p>
        )}

        {statusError && !analysis && (
          <div className="flex flex-wrap items-center gap-2">
            <p
              key={statusErrorCount}
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {t("resumes", "analysisStatusError", lang)}
            </p>
            {/* aria-disabled rather than disabled, so the button keeps keyboard
                focus while the check runs. */}
            <button
              type="button"
              onClick={() => {
                if (!checkingStatus) refetchStatus();
              }}
              aria-disabled={checkingStatus}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent aria-disabled:opacity-50"
            >
              {t("common", checkingStatus ? "retrying" : "tryAgain", lang)}
            </button>
          </div>
        )}

        {failed && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {t("resumes", failureMessageKey(analysisStatus.error_code), lang)}
          </p>
        )}

        {!analysis && !analysisLoading && busy && (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            <div className="mx-auto mb-3 h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            {t("resumes", "analysing", lang)}
          </div>
        )}
      </section>
    </div>
  );
}

function AnalysisCard({ analysis }: { analysis: ResumeAnalysis }) {
  const { lang } = useLang();
  const r = analysis.result;
  const score = r.japan_market_score;
  const scoreColor =
    score >= 81 ? "text-green-600" : score >= 61 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="animate-fade-in space-y-6 rounded-lg border bg-card p-6">
      {/* Score */}
      <div className="flex items-center gap-4">
        <div className={`text-5xl font-bold tabular-nums ${scoreColor}`}>{score}</div>
        <div>
          <p className="text-sm font-medium">{t("resumes", "japanScore", lang)}</p>
          <p className="text-xs text-muted-foreground">{r.summary}</p>
        </div>
      </div>

      <hr />

      {r.strengths.length > 0 && (
        <AnalysisSection
          title={t("resumes", "strengths", lang)}
          items={r.strengths}
          variant="positive"
        />
      )}
      {r.gaps.length > 0 && (
        <AnalysisSection title={t("resumes", "gaps", lang)} items={r.gaps} variant="negative" />
      )}
      {r.recommendations.length > 0 && (
        <AnalysisSection
          title={t("resumes", "recommendations", lang)}
          items={r.recommendations}
          variant="neutral"
        />
      )}

      <div>
        <p className="text-sm font-medium">{t("resumes", "langAssessment", lang)}</p>
        <p className="mt-1 text-sm text-muted-foreground">{r.language_assessment}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("resumes", "jpRequired", lang)}{" "}
          <span className="font-medium text-foreground">
            {r.estimated_japanese_level_required === "none"
              ? t("resumes", "jpNotRequired", lang)
              : r.estimated_japanese_level_required}
          </span>
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("resumes", "analysedAt", lang)}{" "}
        {new Date(analysis.created_at).toLocaleString(lang, {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}{" "}
        · {analysis.ai_model} · {analysis.input_tokens + analysis.output_tokens} tokens
      </p>
    </div>
  );
}

function AnalysisSection({
  title,
  items,
  variant,
}: {
  title: string;
  items: string[];
  variant: "positive" | "negative" | "neutral";
}) {
  const dot =
    variant === "positive" ? "bg-green-500" : variant === "negative" ? "bg-red-500" : "bg-blue-500";

  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      <div className="h-24 animate-pulse rounded-lg bg-muted" />
      <div className="h-64 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
