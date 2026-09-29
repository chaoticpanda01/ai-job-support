"use client";

import Link from "next/link";
import type { Route } from "next";
import { FileText } from "lucide-react";
import { useResumes, useDeleteResume, useSetPrimaryResume } from "@/hooks/useResumes";
import { ResumeUploader } from "@/components/resume/ResumeUploader";
import { RetryButton } from "@/components/retry-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { Resume } from "@/types/api";

export default function ResumesPage() {
  const { data, isLoading, isFetching, error, errorUpdateCount, refetch } = useResumes();
  const { lang } = useLang();

  return (
    <>
      <PageHeader
        eyebrow={t("nav", "groupPrepare", lang)}
        title={t("resumes", "title", lang)}
        description={t("resumes", "sub", lang)}
      />
      <div className="space-y-8">
        <ResumeUploader />

        <section aria-labelledby="your-resumes" className="space-y-4">
          <h2 id="your-resumes" className="text-base font-semibold">
            {t("resumes", "yourResumes", lang)}
          </h2>

          {isLoading && <ResumesSkeleton />}

          {error && (
            <Alert
              announceKey={errorUpdateCount}
              action={<RetryButton retrying={isFetching} onRetry={() => void refetch()} />}
            >
              {t("resumes", "loadError", lang)}
            </Alert>
          )}

          {data && data.items.length === 0 && !isLoading && (
            <EmptyState icon={FileText} title={t("resumes", "noResumes", lang)} />
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
    </>
  );
}

function ResumeCard({ resume }: { resume: Resume }) {
  const deleteMutation = useDeleteResume();
  const setPrimaryMutation = useSetPrimaryResume();
  const { lang } = useLang();
  const confirmDialog = useConfirm();
  const { toast } = useToast();

  const fileSizeKB = Math.round(resume.file_size_bytes / 1024);
  const uploadedAt = new Date(resume.created_at).toLocaleDateString(lang, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  function handleSetPrimary() {
    setPrimaryMutation.mutate(resume.id, {
      onError: () => {
        toast({ variant: "destructive", description: t("common", "updateFailed", lang) });
      },
    });
  }

  async function handleDelete() {
    const ok = await confirmDialog({
      title: t("resumes", "confirmDelete", lang),
      variant: "destructive",
      confirmLabel: t("common", "delete", lang),
      cancelLabel: t("common", "cancel", lang),
    });
    if (!ok) return;

    deleteMutation.mutate(resume.id, {
      onSuccess: () => {
        toast({ variant: "success", description: t("common", "deleted", lang) });
      },
      onError: () => {
        toast({ variant: "destructive", description: t("common", "deleteFailed", lang) });
      },
    });
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <FileIcon mime={resume.mime_type} />
        <div className="min-w-0">
          <Link
            href={`/dashboard/resumes/${resume.id}` as Route}
            className="block truncate text-sm font-medium hover:underline"
          >
            {resume.file_name}
          </Link>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {fileSizeKB} KB · {uploadedAt}
            </span>
            {resume.is_primary && <Badge variant="info">{t("common", "primary", lang)}</Badge>}
          </p>
        </div>
      </div>

      <div className="-ml-3 flex flex-wrap items-center gap-1 sm:ml-0 sm:shrink-0">
        {!resume.is_primary && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSetPrimary}
            loading={setPrimaryMutation.isPending}
          >
            {t("resumes", "setPrimary", lang)}
          </Button>
        )}
        <Button asChild variant="ghost" size="sm">
          <Link href={`/dashboard/resumes/${resume.id}` as Route}>{t("common", "view", lang)}</Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleDelete()}
          loading={deleteMutation.isPending}
          className="text-destructive hover:text-destructive"
        >
          {t("common", "delete", lang)}
        </Button>
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
    <div className="space-y-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-lg" />
      ))}
    </div>
  );
}
