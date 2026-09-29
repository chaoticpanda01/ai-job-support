"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { useDocumentStatus, useDocumentDetail } from "@/hooks/useDocuments";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { RetryButton } from "@/components/retry-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
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
  const {
    data: detail,
    error: detailError,
    errorCount: detailErrorCount,
    isFetching: fetchingDetail,
    refetch: refetchDetail,
  } = useDocumentDetail(id, false);

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
          <Alert>{t("documents", "notFound", lang)}</Alert>
        ) : (
          <Alert
            announceKey={errorCount}
            action={<RetryButton retrying={isChecking} onRetry={recheck} />}
          >
            {t("documents", "statusLoadError", lang)}
          </Alert>
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
        <Alert
          announceKey={errorCount}
          action={<RetryButton retrying={isChecking} onRetry={recheck} />}
        >
          {t("documents", "statusPollError", lang)}
        </Alert>
      )}

      <PageHeader
        className="mb-0"
        title={t("documents", "statusHeading", lang)}
        actions={<DocumentStatusBadge status={statusData.status} />}
      />
      <Card className="p-6">
        <StatusBody
          status={statusData.status}
          errorCode={statusData.error_code}
          completedAt={statusData.completed_at}
          downloadUrl={detail?.download_url ?? null}
          downloadError={detailError !== null}
          downloadErrorCount={detailErrorCount}
          retryingDownload={fetchingDetail}
          onRetryDownload={() => void refetchDetail()}
        />
      </Card>
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
  downloadError,
  downloadErrorCount,
  retryingDownload,
  onRetryDownload,
}: {
  status: DocumentStatus;
  errorCode: DocumentErrorCode | null;
  completedAt: string | null;
  downloadUrl: string | null;
  downloadError: boolean;
  downloadErrorCount: number;
  retryingDownload: boolean;
  onRetryDownload: () => void;
}) {
  const { lang } = useLang();

  if (status === "pending" || status === "processing") {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <Loader2
          aria-hidden="true"
          className="h-10 w-10 animate-spin text-muted-foreground motion-reduce:animate-none"
        />
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
        {/* The reason, in the reader's language. The backend's own message is
            English and written for logs, so it is never shown here. */}
        <Alert title={t("documents", "genFailed", lang)}>
          {t("documents", failureMessageKey(errorCode), lang)}
        </Alert>
        <p className="text-sm text-muted-foreground">{t("documents", "genFailHint", lang)}</p>
        <div className="flex flex-wrap gap-2">
          {/* The one failure the user fixes somewhere else. */}
          {errorCode === "profile_incomplete" && (
            <Button asChild>
              <Link href="/dashboard/settings">{t("documents", "goToSettings", lang)}</Link>
            </Button>
          )}
          <Button asChild variant="secondary">
            <Link href="/dashboard/documents">
              <ArrowLeft aria-hidden="true" />
              {t("documents", "backToDocuments", lang)}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // completed
  return (
    <div className="space-y-4">
      <Alert tone="success">
        {t("documents", "genSuccess", lang)}
        {completedAt && (
          <span className="ml-1">
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
      </Alert>

      {downloadUrl ? (
        <Button asChild className="w-full">
          <a href={downloadUrl} download>
            {t("documents", "downloadPdf", lang)}
          </a>
        </Button>
      ) : downloadError ? (
        // The document was generated; only the link failed. Saying so beats a
        // spinner that never resolves.
        <Alert
          announceKey={downloadErrorCount}
          action={<RetryButton retrying={retryingDownload} onRetry={onRetryDownload} />}
        >
          {t("documents", "linkError", lang)}
        </Alert>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
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

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-48 rounded-lg" />
    </div>
  );
}
