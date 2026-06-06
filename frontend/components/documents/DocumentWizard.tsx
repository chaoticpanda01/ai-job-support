"use client";

import { useState } from "react";
import type { ResumeList } from "@/types/api";

type Step = "resume" | "job" | "confirm";

interface Props {
  resumeList: ResumeList | undefined;
  resumesLoading: boolean;
  isPending: boolean;
  error: string | null;
  submitLabel: string;
  onSubmit: (resumeId: string, jobPostingId?: string) => Promise<void>;
}

export function DocumentWizard({
  resumeList,
  resumesLoading,
  isPending,
  error,
  submitLabel,
  onSubmit,
}: Props) {
  const [step, setStep] = useState<Step>("resume");
  const [resumeId, setResumeId] = useState<string>("");
  const [jobPostingId, setJobPostingId] = useState<string>("");

  const resumes = resumeList?.items ?? [];
  const selectedResume = resumes.find((r) => r.id === resumeId);

  // -----------------------------------------------------------------------
  // Step 1 — pick resume
  // -----------------------------------------------------------------------
  if (step === "resume") {
    return (
      <div className="space-y-4">
        <StepHeader current={1} total={3} title="Select a resume" />

        {resumesLoading && <ResumesSkeleton />}

        {!resumesLoading && resumes.length === 0 && (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No resumes found.{" "}
            <a href="/dashboard/resumes" className="underline hover:text-foreground">
              Upload one first.
            </a>
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
                      {Math.round(r.file_size_bytes / 1024)} KB · Uploaded{" "}
                      {new Date(r.created_at).toLocaleDateString()}
                      {r.is_primary && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Primary
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
            Next →
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Step 2 — optional job context
  // -----------------------------------------------------------------------
  if (step === "job") {
    return (
      <div className="space-y-4">
        <StepHeader current={2} total={3} title="Job context (optional)" />

        <p className="text-sm text-muted-foreground">
          Paste a job posting ID to tailor the document to a specific role. You can skip this and
          generate a general-purpose document.
        </p>

        <input
          type="text"
          value={jobPostingId}
          onChange={(e) => setJobPostingId(e.target.value)}
          placeholder="Job posting ID (optional)"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />

        <div className="flex justify-between">
          <button
            onClick={() => setStep("resume")}
            className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
          >
            ← Back
          </button>
          <button
            onClick={() => setStep("confirm")}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Next →
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
      <StepHeader current={3} total={3} title="Confirm and generate" />

      <div className="rounded-lg border bg-card p-4 space-y-2 text-sm">
        <Row label="Resume" value={selectedResume?.file_name ?? resumeId} />
        <Row label="Job context" value={jobPostingId || "None (general-purpose)"} />
      </div>

      <p className="text-sm text-muted-foreground">
        Generation takes 20–60 seconds. You'll be taken to the status page where you can track
        progress and download the PDF when ready.
      </p>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex justify-between">
        <button
          onClick={() => setStep("job")}
          disabled={isPending}
          className="rounded-md border px-4 py-2 text-sm hover:bg-accent disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          onClick={() => onSubmit(resumeId, jobPostingId || undefined)}
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              Queuing…
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
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {current}
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">
          Step {current} of {total}
        </p>
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
