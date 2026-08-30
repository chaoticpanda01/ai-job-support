"use client";

import { useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { DocumentOrientation, ResumeList } from "@/types/api";

type Step = "resume" | "job" | "confirm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Props {
  resumeList: ResumeList | undefined;
  resumesLoading: boolean;
  initialJobPostingId?: string;
  isPending: boolean;
  error: string | null;
  submitLabel: string;
  showOrientation?: boolean;
  onSubmit: (
    resumeId: string,
    jobPostingId?: string,
    orientation?: DocumentOrientation,
  ) => Promise<void>;
}

export function DocumentWizard({
  resumeList,
  resumesLoading,
  initialJobPostingId,
  isPending,
  error,
  submitLabel,
  showOrientation = false,
  onSubmit,
}: Props) {
  const [step, setStep] = useState<Step>("resume");
  const [resumeId, setResumeId] = useState<string>("");
  const [jobPostingId, setJobPostingId] = useState<string>(initialJobPostingId ?? "");
  const [orientation, setOrientation] = useState<DocumentOrientation>("portrait");
  const { lang } = useLang();

  const resumes = resumeList?.items ?? [];
  const selectedResume = resumes.find((r) => r.id === resumeId);

  // -----------------------------------------------------------------------
  // Step 1 — pick resume
  // -----------------------------------------------------------------------
  if (step === "resume") {
    return (
      <div className="space-y-4">
        <StepHeader current={1} total={3} title={t("documents", "wizStep1Title", lang)} />

        {resumesLoading && <ResumesSkeleton />}

        {!resumesLoading && resumes.length === 0 && (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("documents", "wizNoResumes", lang)}{" "}
            <Link href="/dashboard/resumes" className="underline hover:text-foreground">
              {t("documents", "wizUploadFirst", lang)}
            </Link>
          </p>
        )}

        {!resumesLoading && resumes.length > 0 && (
          <ul className="space-y-2">
            {resumes.map((r) => (
              <li key={r.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-4 hover:bg-accent has-[:checked]:border-primary">
                  <input
                    type="radio"
                    name="resume"
                    value={r.id}
                    checked={resumeId === r.id}
                    onChange={() => setResumeId(r.id)}
                    className="accent-primary"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {Math.round(r.file_size_bytes / 1024)} KB ·{" "}
                      {t("documents", "wizUploaded", lang)}{" "}
                      {new Date(r.created_at).toLocaleDateString()}
                      {r.is_primary && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {t("documents", "wizPrimary", lang)}
                        </span>
                      )}
                    </p>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end">
          <button
            onClick={() => setStep("job")}
            disabled={!resumeId}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {t("documents", "wizNext", lang)}
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Step 2 — optional job context
  // -----------------------------------------------------------------------
  if (step === "job") {
    const jobIdInvalid = jobPostingId.trim() !== "" && !UUID_RE.test(jobPostingId.trim());

    return (
      <div className="space-y-4">
        <StepHeader current={2} total={3} title={t("documents", "wizStep2Title", lang)} />

        <p className="text-sm text-muted-foreground">{t("documents", "wizStep2Sub", lang)}</p>

        <input
          type="text"
          value={jobPostingId}
          onChange={(e) => setJobPostingId(e.target.value)}
          placeholder={t("documents", "wizJobIdPlaceholder", lang)}
          aria-invalid={jobIdInvalid}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {jobIdInvalid && (
          <p className="text-xs text-destructive">{t("documents", "wizJobIdInvalid", lang)}</p>
        )}

        {showOrientation && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("documents", "wizOrientationLabel", lang)}</p>
            <div className="flex gap-3">
              <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border bg-card p-3 text-sm has-[:checked]:border-primary">
                <input
                  type="radio"
                  name="orientation"
                  value="portrait"
                  checked={orientation === "portrait"}
                  onChange={() => setOrientation("portrait")}
                  className="accent-primary"
                />
                {t("documents", "wizOrientationPortrait", lang)}
              </label>
              <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border bg-card p-3 text-sm has-[:checked]:border-primary">
                <input
                  type="radio"
                  name="orientation"
                  value="landscape"
                  checked={orientation === "landscape"}
                  onChange={() => setOrientation("landscape")}
                  className="accent-primary"
                />
                {t("documents", "wizOrientationLandscape", lang)}
              </label>
            </div>
          </div>
        )}

        <div className="flex justify-between">
          <button
            onClick={() => setStep("resume")}
            className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
          >
            {t("common", "back", lang)}
          </button>
          <button
            onClick={() => setStep("confirm")}
            disabled={jobIdInvalid}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {t("documents", "wizNext", lang)}
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Step 3 — confirm + submit
  // -----------------------------------------------------------------------
  return (
    <div className="space-y-4">
      <StepHeader current={3} total={3} title={t("documents", "wizStep3Title", lang)} />

      <div className="space-y-2 rounded-lg border bg-card p-4 text-sm">
        <Row
          label={t("documents", "wizResumeLabel", lang)}
          value={selectedResume?.file_name ?? resumeId}
        />
        <Row
          label={t("documents", "wizJobLabel", lang)}
          value={jobPostingId || t("documents", "wizNoJobContext", lang)}
        />
        {showOrientation && (
          <Row
            label={t("documents", "wizOrientationLabel", lang)}
            value={
              orientation === "landscape"
                ? t("documents", "wizOrientationLandscape", lang)
                : t("documents", "wizOrientationPortrait", lang)
            }
          />
        )}
      </div>

      <p className="text-sm text-muted-foreground">{t("documents", "wizGenWait", lang)}</p>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex justify-between">
        <button
          onClick={() => setStep("job")}
          disabled={isPending}
          className="rounded-md border px-4 py-2 text-sm hover:bg-accent disabled:opacity-40"
        >
          {t("common", "back", lang)}
        </button>
        <button
          onClick={() =>
            onSubmit(resumeId, jobPostingId || undefined, showOrientation ? orientation : undefined)
          }
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              {t("documents", "wizQueuing", lang)}
            </span>
          ) : (
            submitLabel
          )}
        </button>
      </div>
    </div>
  );
}

function StepHeader({ current, total, title }: { current: number; total: number; title: string }) {
  const { lang } = useLang();
  const stepLabel = t("documents", "wizStepOf", lang)
    .replace("{n}", String(current))
    .replace("{t}", String(total));

  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {current}
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{stepLabel}</p>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-6 rounded-full ${i < current ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function ResumesSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <li key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
      ))}
    </ul>
  );
}
