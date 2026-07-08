"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { useDocumentStatus, useDocumentDetail } from "@/hooks/useDocuments";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { DocumentStatus } from "@/types/api";

interface Props {
  params: Promise<{ id: string }>;
}

export default function DocumentDetailPage({ params }: Props) {
  const { id } = use(params);
  const { data: statusData, isLoading } = useDocumentStatus(id);
  const { lang } = useLang();

  const isDone = statusData?.status === "completed" || statusData?.status === "failed";
  void isDone;

  // Fetch detail (with presigned URL) only once the document is completed
  const { data: detail, refetch: refetchDetail } = useDocumentDetail(id, false);

  useEffect(() => {
    if (statusData?.status === "completed") {
      void refetchDetail();
    }
  }, [statusData?.status, refetchDetail]);

  if (isLoading && !statusData) return <PageSkeleton />;

  if (!statusData) {
    return (
      <div className="space-y-4">
        <Breadcrumbs
          items={[{ label: t("documents", "title", lang), href: "/dashboard/documents" }]}
        />
        <p className="text-sm text-destructive">{t("documents", "notFound", lang)}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <Breadcrumbs
        items={[
          { label: t("documents", "title", lang), href: "/dashboard/documents" },
          { label: t("documents", "statusHeading", lang) },
        ]}
      />

      <div className="space-y-6 rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">{t("documents", "statusHeading", lang)}</h1>
          <StatusBadge status={statusData.status} />
        </div>

        <StatusBody
          status={statusData.status}
          errorMessage={statusData.error_message}
          completedAt={statusData.completed_at}
          downloadUrl={detail?.download_url ?? null}
          documentId={id}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status body — varies by state
// ---------------------------------------------------------------------------

function StatusBody({
  status,
  errorMessage,
  completedAt,
  downloadUrl,
}: {
  status: DocumentStatus;
  errorMessage: string | null;
  completedAt: string | null;
  downloadUrl: string | null;
  documentId: string;
}) {
  const { lang } = useLang();

  if (status === "pending" || status === "processing") {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <div>
          <p className="text-sm font-medium">
            {status === "pending"
              ? t("documents", "queued", lang)
              : t("documents", "generating", lang)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("documents", "genWait", lang)}</p>
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-destructive/10 px-4 py-3">
          <p className="text-sm font-medium text-destructive">
            {t("documents", "genFailed", lang)}
          </p>
          {errorMessage && <p className="mt-1 text-xs text-destructive/80">{errorMessage}</p>}
        </div>
        <p className="text-sm text-muted-foreground">{t("documents", "genFailHint", lang)}</p>
        <Link
          href="/dashboard/documents"
          className="inline-flex items-center rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          {t("documents", "backToDocuments", lang)}
        </Link>
      </div>
    );
  }

  // completed
  return (
    <div className="space-y-4">
      <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
        {t("documents", "genSuccess", lang)}
        {completedAt && (
          <span className="ml-1 text-green-700">
            {t("documents", "on", lang)} {new Date(completedAt).toLocaleString()}
          </span>
        )}
      </div>

      {downloadUrl ? (
        <a
          href={downloadUrl}
          download
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t("documents", "downloadPdf", lang)}
        </a>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          {t("documents", "preparingLink", lang)}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t("documents", "linkExpiry", lang)}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: DocumentStatus }) {
  const { lang } = useLang();
  const styles: Record<DocumentStatus, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    processing: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
  };
  const labels: Record<DocumentStatus, string> = {
    pending: t("documents", "statusPending", lang),
    processing: t("documents", "statusProcessing", lang),
    completed: t("documents", "statusCompleted", lang),
    failed: t("documents", "statusFailed", lang),
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}
    >
      {status === "processing" && (
        <span className="h-2 w-2 animate-spin rounded-full border border-blue-800 border-t-transparent" />
      )}
      {labels[status]}
    </span>
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      <div className="h-48 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
