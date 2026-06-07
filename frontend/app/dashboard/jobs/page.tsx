"use client";

import { useState } from "react";
import Link from "next/link";
import { useJobs, useDeleteJob } from "@/hooks/useJobs";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { JobPosting } from "@/types/api";

export default function JobsPage() {
  const [q, setQ] = useState("");
  const [minScore, setMinScore] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState("");
  const { lang } = useLang();

  const { data, isLoading, error } = useJobs({
    q: search || undefined,
    min_score: minScore,
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(q);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("jobs", "title", lang)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("jobs", "sub", lang)}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/dashboard/jobs/applications"
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            {t("jobs", "tracker", lang)}
          </Link>
          <Link
            href="/dashboard/jobs/translate"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {t("jobs", "translateBtn", lang)}
          </Link>
        </div>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("jobs", "searchPlaceholder", lang)}
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <select
          value={minScore ?? ""}
          onChange={(e) =>
            setMinScore(e.target.value ? Number(e.target.value) : undefined)
          }
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">{t("jobs", "allScores", lang)}</option>
          <option value="60">Score ≥ 60</option>
          <option value="70">Score ≥ 70</option>
          <option value="80">Score ≥ 80</option>
        </select>
        <button
          type="submit"
          className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
        >
          {t("common", "search", lang)}
        </button>
        {(search || minScore !== undefined) && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setSearch("");
              setMinScore(undefined);
            }}
            className="rounded-md border px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            {t("common", "clear", lang)}
          </button>
        )}
      </form>

      {isLoading && <JobsSkeleton />}

      {error && (
        <p className="text-sm text-destructive">{t("jobs", "loadError", lang)}</p>
      )}

      {data && data.items.length === 0 && !isLoading && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">{t("jobs", "noPostings", lang)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link
              href="/dashboard/jobs/translate"
              className="underline hover:text-foreground"
            >
              {t("jobs", "translateLink", lang)}
            </Link>{" "}
            {t("jobs", "toGetStarted", lang)}
          </p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <ul className="space-y-3">
          {data.items.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </ul>
      )}
    </div>
  );
}

function JobCard({ job }: { job: JobPosting }) {
  const deleteMutation = useDeleteJob();
  const { lang } = useLang();
  const sd = job.structured_data;
  const score = job.foreigner_friendliness_score;
  const scoreColor =
    score === null
      ? "text-muted-foreground"
      : score >= 70
        ? "text-green-600"
        : score >= 50
          ? "text-yellow-600"
          : "text-red-600";

  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <Link
            href={`/dashboard/jobs/${job.id}`}
            className="block truncate text-sm font-medium hover:underline"
          >
            {job.translated_title ?? job.original_title ?? t("jobs", "untitled", lang)}
          </Link>
          {sd && (
            <p className="text-xs text-muted-foreground">
              {sd.company_name}
              {sd.location && ` · ${sd.location}`}
              {sd.employment_type && ` · ${sd.employment_type}`}
            </p>
          )}
          {job.translation_summary && (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {job.translation_summary}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {sd?.required_japanese && sd.required_japanese !== "none" && (
              <Tag>{sd.required_japanese}</Tag>
            )}
            {sd?.visa_sponsorship === true && (
              <Tag variant="positive">{t("jobs", "visaSponsorship", lang)}</Tag>
            )}
            {sd?.salary_range && <Tag>{sd.salary_range}</Tag>}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {score !== null && (
            <div className="text-right">
              <span className={`text-xl font-bold tabular-nums ${scoreColor}`}>
                {Math.round(score)}
              </span>
              <p className="text-xs text-muted-foreground">{t("jobs", "friendliness", lang)}</p>
            </div>
          )}
          <div className="flex gap-2">
            <Link
              href={`/dashboard/jobs/${job.id}`}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t("common", "view", lang)} →
            </Link>
            <button
              onClick={() => {
                if (confirm(t("jobs", "confirmDelete", lang))) {
                  deleteMutation.mutate(job.id);
                }
              }}
              disabled={deleteMutation.isPending}
              className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-50"
            >
              {t("common", "delete", lang)}
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function Tag({
  children,
  variant = "neutral",
}: {
  children: React.ReactNode;
  variant?: "neutral" | "positive";
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        variant === "positive"
          ? "bg-green-100 text-green-800"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {children}
    </span>
  );
}

function JobsSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
      ))}
    </ul>
  );
}
