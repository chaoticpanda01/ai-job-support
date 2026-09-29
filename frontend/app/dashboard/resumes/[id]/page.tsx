"use client";

import { use } from "react";
import { useAnalyzeResume, useResume, useResumeAnalysis } from "@/hooks/useResumes";
import { Loader2 } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { RetryButton } from "@/components/retry-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { RESUME_SCORE_BANDS, scoreTone, toneFill, toneText } from "@/lib/tones";
import { LiveAnnouncer } from "@/components/live-announcer";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
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
            description: apiErrorMessage(err, lang),
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
        <Alert>{t("resumes", "notFound", lang)}</Alert>
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

      <PageHeader
        className="mb-0"
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

      {/* Analysis */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-medium">{t("resumes", "aiAnalysis", lang)}</h2>
          {canAnalyse && (
            <Button onClick={handleAnalyze} loading={analyzeMutation.isPending}>
              {analyzeMutation.isPending
                ? t("resumes", "queueing", lang)
                : failed
                  ? t("common", "tryAgain", lang)
                  : t("resumes", "analyseBtn", lang)}
            </Button>
          )}
        </div>

        <LiveAnnouncer message={analysisAnnouncement} />

        {analysisLoading && (
          <Card className="flex flex-col items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2
              aria-hidden="true"
              className="h-5 w-5 animate-spin motion-reduce:animate-none"
            />
            {t("resumes", "analysing", lang)}
          </Card>
        )}

        {analysis && <AnalysisCard analysis={analysis} />}

        {analysisError && <Alert>{t("resumes", "analysisLoadError", lang)}</Alert>}

        {statusError && !analysis && (
          <Alert
            announceKey={statusErrorCount}
            action={<RetryButton retrying={checkingStatus} onRetry={() => refetchStatus()} />}
          >
            {t("resumes", "analysisStatusError", lang)}
          </Alert>
        )}

        {failed && (
          <Alert>{t("resumes", failureMessageKey(analysisStatus.error_code), lang)}</Alert>
        )}

        {!analysis && !analysisLoading && busy && (
          <Card className="flex flex-col items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2
              aria-hidden="true"
              className="h-5 w-5 animate-spin motion-reduce:animate-none"
            />
            {t("resumes", "analysing", lang)}
          </Card>
        )}
      </section>
    </div>
  );
}

function AnalysisCard({ analysis }: { analysis: ResumeAnalysis }) {
  const { lang } = useLang();
  const r = analysis.result;
  const score = r.japan_market_score;
  const scoreColor = toneText[scoreTone(score, RESUME_SCORE_BANDS)];

  return (
    <Card className="animate-fade-in space-y-6 p-6">
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
    </Card>
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
    toneFill[variant === "positive" ? "success" : variant === "negative" ? "danger" : "info"];

  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
            <span
              aria-hidden="true"
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`}
            />
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
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
