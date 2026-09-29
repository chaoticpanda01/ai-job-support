"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Copy } from "lucide-react";
import { useCachedJobMatch, useJob, useMatchJob } from "@/hooks/useJobs";
import { useResumes } from "@/hooks/useResumes";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { StagePanel } from "@/components/jobs/stage-panel";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage } from "@/lib/api-error";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { jobTitle } from "@/lib/pipeline";
import { JOB_SCORE_BANDS, scoreTone, toneFill, toneText, type Tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import type { JobMatch, JobPostingDetail } from "@/types/api";

interface Props {
  params: Promise<{ id: string }>;
}

const LINK_CLS =
  "rounded font-medium text-indigo underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function JobDetailPage({ params }: Props) {
  const { id } = use(params);
  const { data: job, isLoading, error } = useJob(id);
  const { lang } = useLang();

  if (isLoading) return <PageSkeleton />;
  if (error || !job) {
    return (
      <div className="space-y-4">
        <Breadcrumbs items={[{ label: t("jobs", "title", lang), href: "/dashboard/jobs" }]} />
        <Alert>{t("jobs", "jobNotFound", lang)}</Alert>
      </div>
    );
  }

  // Only the untranslated original title is in the job's own language.
  const titleLang = !job.translated_title && job.original_title ? job.original_language : undefined;
  const title = jobTitle(job) ?? t("jobs", "untitled", lang);
  const sd = job.structured_data;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: t("jobs", "title", lang), href: "/dashboard/jobs" },
          { label: title, lang: titleLang },
        ]}
      />
      <PageHeader
        className="mb-0"
        title={title}
        titleLang={titleLang}
        description={sd ? [sd.company_name, sd.location].filter(Boolean).join(" · ") : undefined}
      />

      {/* The stage panel comes first in the document, so it is first for the
          keyboard and a screen reader as well as on phones. From lg up the grid
          puts it and the cards below it in the right column, and the posting
          spans that column's rows, with the last row taking up any extra height
          so the cards stay together. */}
      <div className="grid items-start gap-6 lg:grid-cols-3 lg:grid-rows-[repeat(4,auto)_1fr]">
        <div className="min-w-0 lg:col-start-3">
          <StagePanel job={job} />
        </div>

        <div className="min-w-0 space-y-6 lg:col-span-2 lg:col-start-1 lg:row-span-5 lg:row-start-1">
          {job.source_url && (
            <p className="text-xs text-muted-foreground">
              {t("jobs", "source", lang)}{" "}
              <span className="break-all font-mono">{job.source_url}</span>
            </p>
          )}
          <DetailsCard job={job} />
          <TranslatedDescription job={job} />
        </div>

        <ScoreCard score={job.foreigner_friendliness_score} />
        <MatchSection jobId={id} />
        <JobIdCard jobId={id} />
      </div>
    </div>
  );
}

function DetailsCard({ job }: { job: JobPostingDetail }) {
  const { lang } = useLang();
  const sd = job.structured_data;
  if (!sd) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("jobs", "jobDetails", lang)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
          <InfoRow label={t("jobs", "company", lang)} value={sd.company_name} />
          <InfoRow label={t("jobs", "location", lang)} value={sd.location} />
          <InfoRow label={t("jobs", "employmentType", lang)} value={sd.employment_type} />
          <InfoRow label={t("jobs", "salary", lang)} value={sd.salary_range} />
          <InfoRow
            label={t("jobs", "japaneseRequired", lang)}
            value={
              sd.required_japanese === "none"
                ? t("jobs", "notRequired", lang)
                : sd.required_japanese
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
        <Bullets
          title={t("jobs", "keyRequirements", lang)}
          items={sd.key_requirements}
          tone="info"
        />
        <Bullets title={t("jobs", "benefits", lang)} items={sd.benefits} tone="success" />
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Bullets({ title, items, tone }: { title: string; items: string[]; tone: Tone }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span
              aria-hidden="true"
              className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", toneFill[tone])}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TranslatedDescription({ job }: { job: JobPostingDetail }) {
  const { lang } = useLang();
  const [expanded, setExpanded] = useState(false);

  if (!job.translated_description && !job.translation_summary) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("jobs", "translatedDesc", lang)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {job.translation_summary && (
          <p className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">
            <span className="font-medium text-foreground">{t("jobs", "summaryLabel", lang)} </span>
            {job.translation_summary}
          </p>
        )}
        {job.translated_description && (
          <>
            <div
              id="job-description"
              className={cn(
                "overflow-hidden whitespace-pre-wrap break-words text-sm leading-relaxed",
                !expanded && "max-h-48",
              )}
            >
              {job.translated_description}
            </div>
            <Button
              variant="link"
              size="sm"
              aria-expanded={expanded}
              aria-controls="job-description"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? t("jobs", "showLess", lang) : t("jobs", "showFull", lang)}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreCard({ score }: { score: number | null }) {
  const { lang } = useLang();
  if (score === null) return null;

  const rounded = Math.round(score);
  const color = toneText[scoreTone(rounded, JOB_SCORE_BANDS)];
  const label =
    rounded >= 80
      ? t("jobs", "veryAccessible", lang)
      : rounded >= 60
        ? t("jobs", "accessible", lang)
        : rounded >= 40
          ? t("jobs", "challenging", lang)
          : t("jobs", "veryDifficult", lang);

  return (
    <Card className="min-w-0 p-5 text-center lg:col-start-3">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("jobs", "foreignerFriendly", lang)}
      </p>
      <p className={cn("text-5xl font-bold tabular-nums", color)}>{rounded}</p>
      <p className={cn("mt-1 text-sm font-medium", color)}>{label}</p>
      <p className="mt-2 text-xs text-muted-foreground">{t("jobs", "outOf100", lang)}</p>
    </Card>
  );
}

function MatchSection({ jobId }: { jobId: string }) {
  const { data: resumeList, isLoading: resumesLoading } = useResumes();
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const matchMutation = useMatchJob(jobId);
  const cachedMatch = useCachedJobMatch(jobId, selectedResumeId);
  const { lang } = useLang();

  const resumes = resumeList?.items ?? [];

  return (
    // The stage panel's "check your match" links land here.
    <Card id="match" className="min-w-0 scroll-mt-20 lg:col-start-3">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("jobs", "matchScore", lang)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {resumesLoading && <Skeleton className="h-10 w-full" />}

        {!resumesLoading && resumes.length === 0 && (
          <p className="text-sm text-muted-foreground">
            <Link href="/dashboard/resumes" className={LINK_CLS}>
              {t("jobs", "uploadResumeTo", lang)}
            </Link>{" "}
            {t("jobs", "toScoreJob", lang)}
          </p>
        )}

        {!resumesLoading && resumes.length > 0 && (
          <>
            <Field label={t("jobs", "matchResumeLabel", lang)}>
              <Select
                value={selectedResumeId}
                onChange={(e) => setSelectedResumeId(e.target.value)}
              >
                <option value="">{t("jobs", "selectResume", lang)}</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.file_name}
                    {r.is_primary ? ` (${t("common", "primary", lang)})` : ""}
                  </option>
                ))}
              </Select>
            </Field>

            <Button
              className="w-full"
              disabled={!selectedResumeId}
              loading={matchMutation.isPending}
              onClick={() => matchMutation.mutate({ resume_id: selectedResumeId })}
            >
              {matchMutation.isPending ? t("jobs", "scoring", lang) : t("jobs", "scoreBtn", lang)}
            </Button>

            {matchMutation.error && (
              <Alert>
                {/* 422 here is a precondition, not a bad request: either the
                    posting has no translation yet or the resume can't be read. */}
                {apiErrorMessage(matchMutation.error, lang, {
                  422: t("jobs", "matchNotPossible", lang),
                })}
              </Alert>
            )}
          </>
        )}

        {cachedMatch && <MatchResult match={cachedMatch} />}
      </CardContent>
    </Card>
  );
}

function MatchResult({ match }: { match: JobMatch }) {
  const { lang } = useLang();
  const score = Math.round(match.match_score);
  const bd = match.match_breakdown;
  const rec = match.recommendations;

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="text-center">
        <p
          className={cn(
            "text-4xl font-bold tabular-nums",
            toneText[scoreTone(score, JOB_SCORE_BANDS)],
          )}
        >
          {score}
        </p>
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
          <Bullets title={t("jobs", "strengths", lang)} items={rec.strengths} tone="success" />
          <Bullets title={t("jobs", "gaps", lang)} items={rec.gaps} tone="danger" />
          <Bullets title={t("jobs", "actions", lang)} items={rec.actions} tone="info" />
        </div>
      )}
    </div>
  );
}

function SubScore({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value);
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{pct}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className={cn("h-1.5 rounded-full", toneFill[scoreTone(pct, JOB_SCORE_BANDS)])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function JobIdCard({ jobId }: { jobId: string }) {
  const { lang } = useLang();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(jobId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="min-w-0 space-y-2 p-5 lg:col-start-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("jobs", "jobId", lang)}
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-secondary px-2 py-1 text-xs">
          {jobId}
        </code>
        <Button variant="secondary" size="sm" onClick={() => void handleCopy()}>
          <Copy aria-hidden="true" />
          {copied ? t("jobs", "copied", lang) : t("jobs", "copy", lang)}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("jobs", "jobIdHint", lang)}</p>
    </Card>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-2/3" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </div>
  );
}
