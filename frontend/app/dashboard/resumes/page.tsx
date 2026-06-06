"use client";

import Link from "next/link";
import { useResumes, useDeleteResume, useSetPrimaryResume } from "@/hooks/useResumes";
import { ResumeUploader } from "@/components/resume/ResumeUploader";
import type { Resume } from "@/types/api";

export default function ResumesPage() {
  const { data, isLoading, error } = useResumes();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Resumes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload your resume to get started. We'll analyse it for the Japanese job market.
        </p>
      </div>

      <ResumeUploader />

      <section>
        <h2 className="mb-4 text-base font-medium">Your resumes</h2>

        {isLoading && <ResumesSkeleton />}

        {error && (
          <p className="text-sm text-destructive">Failed to load resumes. Please refresh.</p>
        )}

        {data && data.items.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground">No resumes yet. Upload one above.</p>
        )}

        {data && data.items.length > 0 && (
          <ul className="space-y-3">
            {data.items.map((resume) => (
              <ResumeCard key={resume.id} resume={resume} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ResumeCard({ resume }: { resume: Resume }) {
  const deleteMutation = useDeleteResume();
  const setPrimaryMutation = useSetPrimaryResume();

  const fileSizeKB = Math.round(resume.file_size_bytes / 1024);
  const uploadedAt = new Date(resume.created_at).toLocaleDateString();

  return (
    <li className="flex items-center justify-between rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3 min-w-0">
        <FileIcon mime={resume.mime_type} />
        <div className="min-w-0">
          <Link
            href={`/dashboard/resumes/${resume.id}`}
            className="truncate text-sm font-medium hover:underline"
          >
            {resume.file_name}
          </Link>
          <p className="text-xs text-muted-foreground">
            {fileSizeKB} KB · {uploadedAt}
            {resume.is_primary && (
              <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                Primary
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="ml-4 flex shrink-0 gap-2">
        {!resume.is_primary && (
          <button
            onClick={() => setPrimaryMutation.mutate(resume.id)}
            disabled={setPrimaryMutation.isPending}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Set primary
          </button>
        )}
        <Link
          href={`/dashboard/resumes/${resume.id}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          View
        </Link>
        <button
          onClick={() => {
            if (confirm("Delete this resume?")) deleteMutation.mutate(resume.id);
          }}
          disabled={deleteMutation.isPending}
          className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

function FileIcon({ mime }: { mime: string }) {
  const isPdf = mime === "application/pdf";
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
      {isPdf ? "PDF" : "DOC"}
    </div>
  );
}

function ResumesSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <li key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
      ))}
    </ul>
  );
}
