"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { useDocumentStatus, useDocumentDetail } from "@/hooks/useDocuments";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { isMissingResourceError } from "@/lib/api-client";
import { useLang } from "@/lib/language-context";
import { t, type translations } from "@/lib/i18n";
import type { DocumentErrorCode, DocumentStatus } from "@/types/api";

interface Props {
  params: Promise<{ id: string }>;
}

type DocumentMessageKey = keyof (typeof translations)["documents"];

// Typed as real message keys: t() returns an unknown key as-is, so a typo here
// would show the raw key instead of failing to compile.
const FAILURE_MESSAGE_KEYS: Record<DocumentErrorCode, DocumentMessageKey> = {
  budget_exceeded: "genFailedBudget",
  profile_incomplete: "genFailedProfile",
  resume_missing: "genFailedResume",
  file_unavailable: "genFailedFile",
  unreadable_file: "genFailedUnreadable",
  ai_failed: "genFailedAi",
  pdf_failed: "genFailedPdf",
  upload_failed: "genFailedUpload",
  timed_out: "genFailedTimeout",
  unknown: "genFailedUnknown",
};

/** Message key for a failure code, treating a code this client doesn't know as unknown. */
function failureMessageKey(code: string | null): DocumentMessageKey {
  return code !== null && Object.hasOwn(FAILURE_MESSAGE_KEYS, code)
    ? FAILURE_MESSAGE_KEYS[code as DocumentErrorCode]
    : FAILURE_MESSAGE_KEYS.unknown;
}

export default function DocumentDetailPage({ params }: Props) {
  const { id } = use(params);
  const {
    data: statusData,
    isLoading,
    loadError,
    pollError,
    errorCount,
    isChecking,
    recheck,
  } = useDocumentStatus(id);
  const { lang } = useLang();

  // Fetch detail (with presigned URL) only once the document is completed
  const { data: detail, refetch: refetchDetail } = useDocumentDetail(id, false);

  useEffect(() => {
    if (statusData?.status === "completed") {
      void refetchDetail();
    }
  }, [statusData?.status, refetchDetail]);

  if (isLoading && !statusData) return <PageSkeleton />;

  const breadcrumbs = (
    <Breadcrumbs items={[{ label: t("documents", "title", lang), href: "/dashboard/documents" }]} />
  );

  if (!statusData) {
    // No document to show. A 404 is final, so it gets a plain message; anything
    // else (a network failure, a 500) is worth retrying and must not be
    // reported as a document that doesn't exist.
    return (
      <div className="space-y-4">
        {breadcrumbs}
        {isMissingResourceError(loadError) ? (
          <p className="text-sm text-destructive">{t("documents", "notFound", lang)}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p
              key={errorCount}
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {t("documents", "statusLoadError", lang)}
            </p>
            <RetryButton isChecking={isChecking} onRetry={recheck} />
          </div>
        )}
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

      {/* The document below is real, just possibly out of date: say so rather
          than replacing it with an error. */}
      {pollError && (
        <div className="flex flex-wrap items-center gap-2">
          <p
            key={errorCount}
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {t("documents", "statusPollError", lang)}
          </p>
          <RetryButton isChecking={isChecking} onRetry={recheck} />
        </div>
      )}

      <div className="space-y-6 rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">{t("documents", "statusHeading", lang)}</h1>
          <StatusBadge status={statusData.status} />
        </div>

        <StatusBody
          status={statusData.status}
          errorCode={statusData.error_code}
          completedAt={statusData.completed_at}
          downloadUrl={detail?.download_url ?? null}
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
  errorCode,
  completedAt,
  downloadUrl,
}: {
  status: DocumentStatus;
  errorCode: DocumentErrorCode | null;
  completedAt: string | null;
  downloadUrl: string | null;
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
        <div role="alert" className="rounded-md bg-destructive/10 px-4 py-3">
          <p className="text-sm font-medium text-destructive">
            {t("documents", "genFailed", lang)}
          </p>
          {/* The reason, in the reader's language. The backend's own message is
              English and written for logs, so it is never shown here. */}
          <p className="mt-1 text-xs text-destructive/80">
            {t("documents", failureMessageKey(errorCode), lang)}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">{t("documents", "genFailHint", lang)}</p>
        <div className="flex flex-wrap gap-2">
          {/* The one failure the user fixes somewhere else. */}
          {errorCode === "profile_incomplete" && (
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {t("documents", "goToSettings", lang)}
            </Link>
          )}
          <Link
            href="/dashboard/documents"
            className="inline-flex items-center rounded-md border px-3 py-2 text-sm hover:bg-accent"
          >
            {t("documents", "backToDocuments", lang)}
          </Link>
        </div>
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
            {t("documents", "on", lang)}{" "}
            {new Date(completedAt).toLocaleString(lang, {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
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

function RetryButton({ isChecking, onRetry }: { isChecking: boolean; onRetry: () => void }) {
  const { lang } = useLang();
  // aria-disabled rather than disabled, so the button keeps keyboard focus
  // while the check runs.
  return (
    <button
      type="button"
      onClick={() => {
        if (!isChecking) onRetry();
      }}
      aria-disabled={isChecking}
      className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent aria-disabled:opacity-50"
    >
      {t("common", isChecking ? "retrying" : "tryAgain", lang)}
    </button>
  );
}

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
