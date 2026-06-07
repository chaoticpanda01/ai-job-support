"use client";

import { use } from "react";
import Link from "next/link";
import { useResume, useResumeAnalysis, useAnalyzeResume } from "@/hooks/useResumes";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { ResumeAnalysis } from "@/types/api";

interface Props {
  params: Promise<{ id: string }>;
}

export default function ResumeDetailPage({ params }: Props) {
  const { id } = use(params);
  const { data: resume, isLoading, error } = useResume(id);
  const { data: analysis, isLoading: analysisLoading } = useResumeAnalysis(id);
  const analyzeMutation = useAnalyzeResume();
  const { lang } = useLang();

  if (isLoading) return <PageSkeleton />;
  if (error || !resume) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-sm text-destructive">{t("resumes", "notFound", lang)}</p>
      </div>
    );
  }

  const fileSizeKB = Math.round(resume.file_size_bytes / 1024);
  const uploadedAt = new Date(resume.created_at).toLocaleDateString();

  return (
    <div className="space-y-8">
      <BackLink />

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
          {!analysis && !analysisLoading && (
            <button
              onClick={() => analyzeMutation.mutate({ resumeId: id })}
              disabled={analyzeMutation.isPending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {analyzeMutation.isPending
                ? t("resumes", "queueing", lang)
                : t("resumes", "analyseBtn", lang)}
            </button>
          )}
        </div>

        {analysisLoading && (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            <div className="mx-auto mb-3 h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            {t("resumes", "analysing", lang)}
          </div>
        )}

        {analysis && <AnalysisCard analysis={analysis} />}

        {!analysis && !analysisLoading && analyzeMutation.isSuccess && (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            <div className="mx-auto mb-3 h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            {t("resumes", "queued", lang)}
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
    <div className="space-y-6 rounded-lg border bg-card p-6 animate-fade-in">
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
        <AnalysisSection title={t("resumes", "strengths", lang)} items={r.strengths} variant="positive" />
      )}
      {r.gaps.length > 0 && (
        <AnalysisSection title={t("resumes", "gaps", lang)} items={r.gaps} variant="negative" />
      )}
      {r.recommendations.length > 0 && (
        <AnalysisSection title={t("resumes", "recommendations", lang)} items={r.recommendations} variant="neutral" />
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
        {new Date(analysis.created_at).toLocaleString()} · {analysis.ai_model} ·{" "}
        {analysis.input_tokens + analysis.output_tokens} tokens
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
    variant === "positive"
      ? "bg-green-500"
      : variant === "negative"
        ? "bg-red-500"
        : "bg-blue-500";

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

function BackLink() {
  const { lang } = useLang();
  return (
    <Link
      href="/dashboard/resumes"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      {t("resumes", "backToResumes", lang)}
    </Link>
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
