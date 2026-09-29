"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Briefcase, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { StageBadge } from "@/components/jobs/stage-badge";
import { RetryButton } from "@/components/retry-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useApplications, useCreateApplication } from "@/hooks/useApplications";
import { useDeleteJob, useJobs } from "@/hooks/useJobs";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { jobTitle } from "@/lib/pipeline";
import { JOB_SCORE_BANDS, scoreTone, toneText } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { JobApplication, JobPosting } from "@/types/api";

const MIN_SCORES = [60, 70, 80];

export default function JobsPage() {
  const { lang } = useLang();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [minScore, setMinScore] = useState<number | undefined>(undefined);
  const jobs = useJobs({ q: search || undefined, min_score: minScore });
  const applications = useApplications();
  const filtered = search !== "" || minScore !== undefined;

  function clearFilters() {
    setQ("");
    setSearch("");
    setMinScore(undefined);
  }

  // Each job's application, or undefined while the pipeline is unknown: a row
  // then shows neither its stage nor Save, rather than offering a duplicate.
  const byJob = applications.data
    ? new Map(applications.data.map((a) => [a.job_posting_id, a]))
    : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title={t("jobs", "title", lang)}
        description={t("jobs", "sub", lang)}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/dashboard/jobs/applications">{t("jobs", "pipelineLink", lang)}</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/jobs/translate">{t("jobs", "translateBtn", lang)}</Link>
            </Button>
          </>
        }
      />

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q.trim());
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label htmlFor="job-search" className="sr-only">
          {t("jobs", "searchLabel", lang)}
        </label>
        <Input
          id="job-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("jobs", "searchPlaceholder", lang)}
          className="sm:flex-1"
        />
        <label htmlFor="job-min-score" className="sr-only">
          {t("jobs", "minScoreLabel", lang)}
        </label>
        <Select
          id="job-min-score"
          value={minScore ?? ""}
          onChange={(e) => setMinScore(e.target.value ? Number(e.target.value) : undefined)}
          className="sm:w-40"
        >
          <option value="">{t("jobs", "allScores", lang)}</option>
          {MIN_SCORES.map((n) => (
            <option key={n} value={n}>{`${n}+`}</option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">
            {t("common", "search", lang)}
          </Button>
          {filtered && (
            <Button type="button" variant="ghost" onClick={clearFilters}>
              {t("common", "clear", lang)}
            </Button>
          )}
        </div>
      </form>

      {jobs.isLoading && <JobsSkeleton />}

      {jobs.error && !jobs.data && (
        <Alert
          action={<RetryButton retrying={jobs.isFetching} onRetry={() => void jobs.refetch()} />}
        >
          {t("jobs", "loadError", lang)}
        </Alert>
      )}

      {jobs.data && jobs.data.items.length === 0 && (
        <EmptyState
          icon={Briefcase}
          title={t("jobs", "noPostings", lang)}
          description={t("jobs", filtered ? "noMatchesHint" : "noPostingsHint", lang)}
          action={
            filtered ? (
              <Button variant="secondary" onClick={clearFilters}>
                {t("common", "clear", lang)}
              </Button>
            ) : (
              <Button asChild>
                <Link href="/dashboard/jobs/translate">{t("jobs", "translateBtn", lang)}</Link>
              </Button>
            )
          }
        />
      )}

      {jobs.data && jobs.data.items.length > 0 && (
        <ul className="space-y-3">
          {jobs.data.items.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              application={byJob?.get(job.id)}
              pipelineKnown={byJob !== undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function JobRow({
  job,
  application,
  pipelineKnown,
}: {
  job: JobPosting;
  application: JobApplication | undefined;
  pipelineKnown: boolean;
}) {
  const { lang } = useLang();
  const confirmDialog = useConfirm();
  const { toast } = useToast();
  const remove = useDeleteJob();
  const save = useCreateApplication();
  const sd = job.structured_data;
  const title = jobTitle(job) ?? t("jobs", "untitled", lang);
  const score =
    job.foreigner_friendliness_score === null ? null : Math.round(job.foreigner_friendliness_score);

  async function handleDelete() {
    const ok = await confirmDialog({
      title: t("jobs", "confirmDelete", lang),
      variant: "destructive",
      confirmLabel: t("common", "delete", lang),
      cancelLabel: t("common", "cancel", lang),
    });
    if (!ok) return;
    remove.mutate(job.id, {
      onSuccess: () => toast({ variant: "success", description: t("common", "deleted", lang) }),
      onError: () =>
        toast({ variant: "destructive", description: t("common", "deleteFailed", lang) }),
    });
  }

  return (
    <li>
      <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <Link
            href={`/dashboard/jobs/${job.id}` as Route}
            // Only the untranslated original title is in the job's own language.
            lang={!job.translated_title && job.original_title ? job.original_language : undefined}
            className="block rounded font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {title}
          </Link>
          {sd && (
            <p className="text-xs text-muted-foreground">
              {[sd.company_name, sd.location, sd.employment_type].filter(Boolean).join(" · ")}
            </p>
          )}
          {job.translation_summary && (
            <p className="line-clamp-2 text-xs text-muted-foreground">{job.translation_summary}</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {sd?.required_japanese && sd.required_japanese !== "none" && (
              <Badge>{sd.required_japanese}</Badge>
            )}
            {sd?.visa_sponsorship === true && (
              <Badge variant="success">{t("jobs", "visaSponsorship", lang)}</Badge>
            )}
            {sd?.salary_range && <Badge>{sd.salary_range}</Badge>}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end">
          {score !== null && (
            <div className="sm:text-right">
              <p
                className={cn(
                  "text-xl font-bold tabular-nums",
                  toneText[scoreTone(score, JOB_SCORE_BANDS)],
                )}
              >
                {score}
              </p>
              <p className="text-xs text-muted-foreground">{t("jobs", "friendliness", lang)}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            {application ? (
              <StageBadge status={application.status} />
            ) : (
              pipelineKnown && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={save.isPending}
                  aria-label={t("jobs", "saveJobLabel", lang).replace("{title}", title)}
                  onClick={() =>
                    save.mutate(
                      { job_posting_id: job.id },
                      {
                        onError: () =>
                          toast({
                            variant: "destructive",
                            description: t("common", "updateFailed", lang),
                          }),
                      },
                    )
                  }
                >
                  {t("jobs", "save", lang)}
                </Button>
              )
            )}
            {job.is_mine && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("jobs", "deleteJobLabel", lang).replace("{title}", title)}
                loading={remove.isPending}
                onClick={() => void handleDelete()}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}

function JobsSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i}>
          <Skeleton className="h-28 w-full" />
        </li>
      ))}
    </ul>
  );
}
