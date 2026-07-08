"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useJob, useMatchJob, useCachedJobMatch } from "@/hooks/useJobs";
import { useResumes } from "@/hooks/useResumes";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { JobMatch, JobPostingDetail } from "@/types/api";

interface Props {
  params: Promise<{ id: string }>;
}

export default function JobDetailPage({ params }: Props) {
  const { id } = use(params);
  const { data: job, isLoading, error } = useJob(id);
  const { lang } = useLang();

  if (isLoading) return <PageSkeleton />;
  if (error || !job) {
    return (
      <div className="space-y-4">
        <Breadcrumbs items={[{ label: t("jobs", "title", lang), href: "/dashboard/jobs" }]} />
        <p className="text-sm text-destructive">{t("jobs", "jobNotFound", lang)}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          { label: t("jobs", "title", lang), href: "/dashboard/jobs" },
          { label: job.translated_title ?? job.original_title ?? t("jobs", "untitled", lang) },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-6 lg:col-span-2">
          <JobHeader job={job} />
          <StructuredInfo job={job} />
          <TranslatedDescription job={job} />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <ScoreCard score={job.foreigner_friendliness_score} />
          <MatchSection jobId={id} />
        </div>
      </div>
    </div>
  );
}

function JobHeader({ job }: { job: JobPostingDetail }) {
  const { lang } = useLang();
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold">
        {job.translated_title ?? job.original_title ?? t("jobs", "untitled", lang)}
      </h1>
      {job.structured_data && (
        <p className="text-sm text-muted-foreground">
          {job.structured_data.company_name}
          {job.structured_data.location && ` · ${job.structured_data.location}`}
        </p>
      )}
      {job.source_url && (
        <p className="text-xs text-muted-foreground">
          {t("jobs", "source", lang)} <span className="font-mono">{job.source_url}</span>
        </p>
      )}
    </div>
  );
}

function StructuredInfo({ job }: { job: JobPostingDetail }) {
  const { lang } = useLang();
  const sd = job.structured_data;
  if (!sd) return null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-medium">{t("jobs", "jobDetails", lang)}</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <InfoRow label={t("jobs", "company", lang)} value={sd.company_name} />
        <InfoRow label={t("jobs", "location", lang)} value={sd.location} />
        <InfoRow label={t("jobs", "employmentType", lang)} value={sd.employment_type} />
        <InfoRow label={t("jobs", "salary", lang)} value={sd.salary_range} />
        <InfoRow
          label={t("jobs", "japaneseRequired", lang)}
          value={
            sd.required_japanese === "none" ? t("jobs", "notRequired", lang) : sd.required_japanese
          }
        />
        <InfoRow
          label={t("jobs", "experience", lang)}
          value={
            sd.required_experience_years === 0
              ? t("jobs", "freshGrads", lang)
              : `${sd.required_experience_years}${t("jobs", "yearsPlus", lang)}`
          }
        />
        <InfoRow
          label={t("jobs", "visaSponsorship", lang)}
          value={
            sd.visa_sponsorship === true
              ? t("common", "yes", lang)
              : sd.visa_sponsorship === false
                ? t("common", "no", lang)
                : t("common", "notMentioned", lang)
          }
        />
      </dl>

      {sd.key_requirements.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("jobs", "keyRequirements", lang)}
          </p>
          <ul className="space-y-1">
            {sd.key_requirements.map((req, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {req}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sd.benefits.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("jobs", "benefits", lang)}
          </p>
          <ul className="space-y-1">
            {sd.benefits.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </>
  );
}

function TranslatedDescription({ job }: { job: JobPostingDetail }) {
  const { lang } = useLang();
  const [expanded, setExpanded] = useState(false);

  if (!job.translated_description && !job.translation_summary) return null;

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-sm font-medium">{t("jobs", "translatedDesc", lang)}</h2>

      {job.translation_summary && (
        <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{t("jobs", "summaryLabel", lang)} </span>
          {job.translation_summary}
        </div>
      )}

      {job.translated_description && (
        <>
          <div
            className={`overflow-hidden whitespace-pre-wrap text-sm leading-relaxed transition-all ${
              expanded ? "" : "max-h-48"
            }`}
          >
            {job.translated_description}
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-primary hover:underline"
          >
            {expanded ? t("jobs", "showLess", lang) : t("jobs", "showFull", lang)}
          </button>
        </>
      )}
    </div>
  );
}

function ScoreCard({ score }: { score: number | null }) {
  const { lang } = useLang();
  if (score === null) return null;

  const rounded = Math.round(score);
  const color =
    rounded >= 70 ? "text-green-600" : rounded >= 50 ? "text-yellow-600" : "text-red-600";
  const label =
    rounded >= 80
      ? t("jobs", "veryAccessible", lang)
      : rounded >= 60
        ? t("jobs", "accessible", lang)
        : rounded >= 40
          ? t("jobs", "challenging", lang)
          : t("jobs", "veryDifficult", lang);

  return (
    <div className="rounded-lg border bg-card p-4 text-center">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("jobs", "foreignerFriendly", lang)}
      </p>
      <p className={`text-5xl font-bold tabular-nums ${color}`}>{rounded}</p>
      <p className={`mt-1 text-sm font-medium ${color}`}>{label}</p>
      <p className="mt-2 text-xs text-muted-foreground">{t("jobs", "outOf100", lang)}</p>
    </div>
  );
}

function MatchSection({ jobId }: { jobId: string }) {
  const { data: resumeList, isLoading: resumesLoading } = useResumes();
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const matchMutation = useMatchJob(jobId);
  const cachedMatch = useCachedJobMatch(jobId, selectedResumeId);
  const { lang } = useLang();

  const resumes = resumeList?.items ?? [];

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <h2 className="text-sm font-medium">{t("jobs", "matchScore", lang)}</h2>

      {resumesLoading && <div className="h-8 animate-pulse rounded bg-muted" />}

      {!resumesLoading && resumes.length === 0 && (
        <p className="text-xs text-muted-foreground">
          <Link href="/dashboard/resumes" className="underline hover:text-foreground">
            {t("jobs", "uploadResumeTo", lang)}
          </Link>{" "}
          {t("jobs", "toScoreJob", lang)}
        </p>
      )}

      {!resumesLoading && resumes.length > 0 && (
        <>
          <select
            value={selectedResumeId}
            onChange={(e) => setSelectedResumeId(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">{t("jobs", "selectResume", lang)}</option>
            {resumes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.file_name}
                {r.is_primary ? ` (${t("common", "primary", lang)})` : ""}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              if (selectedResumeId) {
                matchMutation.mutate({ resume_id: selectedResumeId });
              }
            }}
            disabled={!selectedResumeId || matchMutation.isPending}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {matchMutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                {t("jobs", "scoring", lang)}
              </span>
            ) : (
              t("jobs", "scoreBtn", lang)
            )}
          </button>

          {matchMutation.error instanceof Error && (
            <p className="text-xs text-destructive">{matchMutation.error.message}</p>
          )}
        </>
      )}

      {cachedMatch && <MatchResult match={cachedMatch} />}
    </div>
  );
}

function MatchResult({ match }: { match: JobMatch }) {
  const { lang } = useLang();
  const score = Math.round(match.match_score);
  const scoreColor =
    score >= 70 ? "text-green-600" : score >= 50 ? "text-yellow-600" : "text-red-600";

  const bd = match.match_breakdown;
  const rec = match.recommendations;

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="text-center">
        <p className={`text-4xl font-bold tabular-nums ${scoreColor}`}>{score}</p>
        <p className="text-xs text-muted-foreground">{t("jobs", "overallMatch", lang)}</p>
      </div>

      <div className="space-y-2">
        <SubScore label={t("jobs", "skills", lang)} value={bd.skills_match} />
        <SubScore label={t("jobs", "expLabel", lang)} value={bd.experience_match} />
        <SubScore label={t("jobs", "japanese", lang)} value={bd.language_match} />
        <SubScore label={t("jobs", "cultureFit", lang)} value={bd.culture_fit} />
      </div>

      <p className="text-xs text-muted-foreground">{bd.summary}</p>

      {rec && (
        <div className="space-y-3">
          {rec.strengths.length > 0 && (
            <BulletList
              title={t("jobs", "strengths", lang)}
              items={rec.strengths}
              color="bg-green-500"
            />
          )}
          {rec.gaps.length > 0 && (
            <BulletList title={t("jobs", "gaps", lang)} items={rec.gaps} color="bg-red-500" />
          )}
          {rec.actions.length > 0 && (
            <BulletList
              title={t("jobs", "actions", lang)}
              items={rec.actions}
              color="bg-blue-500"
            />
          )}
        </div>
      )}
    </div>
  );
}

function SubScore({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value);
  const barColor = pct >= 70 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{pct}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className={`h-1.5 rounded-full ${barColor} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function BulletList({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium">{title}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />
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
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="h-10 animate-pulse rounded bg-muted" />
          <div className="h-48 animate-pulse rounded-lg bg-muted" />
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
          <div className="h-48 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  );
}
