"use client";

import Link from "next/link";
import { useResumes, useDeleteResume, useSetPrimaryResume } from "@/hooks/useResumes";
import { ResumeUploader } from "@/components/resume/ResumeUploader";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { Resume } from "@/types/api";

export default function ResumesPage() {
  const { data, isLoading, error } = useResumes();
  const { lang } = useLang();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{t("resumes", "title", lang)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("resumes", "sub", lang)}</p>
      </div>

      <ResumeUploader />

      <section>
        <h2 className="mb-4 text-base font-medium">{t("resumes", "yourResumes", lang)}</h2>

        {isLoading && <ResumesSkeleton />}

        {error && (
          <p className="text-sm text-destructive">{t("resumes", "loadError", lang)}</p>
        )}

        {data && data.items.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground">{t("resumes", "noResumes", lang)}</p>
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
  const { lang } = useLang();

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
                {t("common", "primary", lang)}
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
            {t("resumes", "setPrimary", lang)}
          </button>
        )}
        <Link
          href={`/dashboard/resumes/${resume.id}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {t("common", "view", lang)}
        </Link>
        <button
          onClick={() => {
            if (confirm(t("resumes", "confirmDelete", lang))) deleteMutation.mutate(resume.id);
          }}
          disabled={deleteMutation.isPending}
          className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-50"
        >
          {t("common", "delete", lang)}
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
