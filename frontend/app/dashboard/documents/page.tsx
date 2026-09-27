"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Files, Plus } from "lucide-react";
import { useState } from "react";
import { useDocuments, useDeleteDocument } from "@/hooks/useDocuments";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { RetryButton } from "@/components/retry-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { Document, DocumentType } from "@/types/api";

export default function DocumentsPage() {
  const [filter, setFilter] = useState<DocumentType | "all">("all");
  const { data, isLoading, isFetching, error, refetch } = useDocuments(
    filter === "all" ? undefined : filter,
  );
  const { lang } = useLang();

  return (
    <>
      <PageHeader
        eyebrow={t("nav", "groupPrepare", lang)}
        title={t("documents", "title", lang)}
        description={t("documents", "sub", lang)}
        actions={
          <>
            <Button asChild>
              <Link href="/dashboard/documents/rirekisho/new" lang="ja">
                <Plus aria-hidden="true" />
                履歴書
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/dashboard/documents/shokumu/new" lang="ja">
                <Plus aria-hidden="true" />
                職務経歴書
              </Link>
            </Button>
          </>
        }
      />
      <div className="space-y-6">
        <ToggleGroup<DocumentType | "all">
          label={t("documents", "filterLabel", lang)}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("documents", "all", lang) },
            { value: "rirekisho", label: "履歴書", lang: "ja" },
            { value: "shokumukeirekisho", label: "職務経歴書", lang: "ja" },
          ]}
        />

        {isLoading && <DocumentsSkeleton />}

        {error && (
          <Alert action={<RetryButton retrying={isFetching} onRetry={() => void refetch()} />}>
            {t("documents", "loadError", lang)}
          </Alert>
        )}

        {data && data.items.length === 0 && !isLoading && (
          <EmptyState
            icon={Files}
            title={t("documents", "noDocuments", lang)}
            description={
              <>
                {t("documents", "generateA", lang)}{" "}
                <Link
                  href="/dashboard/documents/rirekisho/new"
                  lang="ja"
                  className="text-indigo underline underline-offset-2 hover:no-underline"
                >
                  履歴書
                </Link>{" "}
                {t("documents", "orLabel", lang)}{" "}
                <Link
                  href="/dashboard/documents/shokumu/new"
                  lang="ja"
                  className="text-indigo underline underline-offset-2 hover:no-underline"
                >
                  職務経歴書
                </Link>{" "}
                {t("documents", "toGetStarted", lang)}
              </>
            }
          />
        )}

        {data && data.items.length > 0 && (
          <ul className="space-y-3">
            {data.items.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function DocumentCard({ doc }: { doc: Document }) {
  const { lang } = useLang();
  const deleteMutation = useDeleteDocument();
  const confirmDialog = useConfirm();
  const { toast } = useToast();
  const label = doc.document_type === "rirekisho" ? "履歴書" : "職務経歴書";
  const createdAt = new Date(doc.created_at).toLocaleDateString(lang, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  // Matches the backend's own rule (documents.py's delete route rejects
  // pending/processing with 409): only a finished generation is safe to
  // delete, since the background task may still be about to write to or
  // upload a file for this row.
  const canDelete = doc.status === "completed" || doc.status === "failed";

  async function handleDelete() {
    const ok = await confirmDialog({
      title: t("documents", "confirmDelete", lang),
      variant: "destructive",
      confirmLabel: t("common", "delete", lang),
      cancelLabel: t("common", "cancel", lang),
    });
    if (!ok) return;

    deleteMutation.mutate(doc.id, {
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
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
          PDF
        </div>
        <div className="min-w-0">
          <p lang="ja" className="truncate text-sm font-medium">
            {label}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("documents", "created", lang)} {createdAt}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 sm:shrink-0">
        <DocumentStatusBadge status={doc.status} />
        <Button asChild variant="ghost" size="sm">
          <Link href={`/dashboard/documents/${doc.id}` as Route}>
            {t("common", "view", lang)}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleDelete()}
            loading={deleteMutation.isPending}
            className="text-destructive hover:text-destructive"
          >
            {t("common", "delete", lang)}
          </Button>
        )}
      </div>
    </li>
  );
}

function DocumentsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-lg" />
      ))}
    </div>
  );
}
