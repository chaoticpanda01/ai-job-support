"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { useDocumentStatus, useDocumentDetail } from "@/hooks/useDocuments";
import type { DocumentStatus } from "@/types/api";

interface Props {
  params: Promise<{ id: string }>;
}

export default function DocumentDetailPage({ params }: Props) {
  const { id } = use(params);
  const { data: statusData, isLoading } = useDocumentStatus(id);

  const isDone = statusData?.status === "completed" || statusData?.status === "failed";

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
        <BackLink />
        <p className="text-sm text-destructive">Document not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <BackLink />

      <div className="rounded-lg border bg-card p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">Document Status</h1>
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
  documentId,
}: {
  status: DocumentStatus;
  errorMessage: string | null;
  completedAt: string | null;
  downloadUrl: string | null;
  documentId: string;
}) {
  if (status === "pending" || status === "processing") {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <div>
          <p className="text-sm font-medium">
            {status === "pending" ? "Queued for generation" : "Generating your document…"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            This usually takes 20–60 seconds. The page updates automatically.
          </p>
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-destructive/10 px-4 py-3">
          <p className="text-sm font-medium text-destructive">Generation failed</p>
          {errorMessage && (
            <p className="mt-1 text-xs text-destructive/80">{errorMessage}</p>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          You can try again by creating a new document.
        </p>
        <Link
          href="/dashboard/documents"
          className="inline-flex items-center rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          ← Back to documents
        </Link>
      </div>
    );
  }

  // completed
  return (
    <div className="space-y-4">
      <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
        Document generated successfully
        {completedAt && (
          <span className="ml-1 text-green-700">
            on {new Date(completedAt).toLocaleString()}
          </span>
        )}
      </div>

      {downloadUrl ? (
        <a
          href={downloadUrl}
          download
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Download PDF
        </a>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Preparing download link…
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Download links expire after 15 minutes. Refresh this page to get a new link.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: DocumentStatus }) {
  const styles: Record<DocumentStatus, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    processing: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}
    >
      {status === "processing" && (
        <span className="h-2 w-2 animate-spin rounded-full border border-blue-800 border-t-transparent" />
      )}
      {status}
    </span>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard/documents"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      ← Back to documents
    </Link>
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
