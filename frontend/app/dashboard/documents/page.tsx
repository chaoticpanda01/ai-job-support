"use client";

import Link from "next/link";
import { useState } from "react";
import { useDocuments } from "@/hooks/useDocuments";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { Document, DocumentStatus, DocumentType } from "@/types/api";

export default function DocumentsPage() {
  const [filter, setFilter] = useState<DocumentType | "all">("all");
  const { data, isLoading, error } = useDocuments(filter === "all" ? undefined : filter);
  const { lang } = useLang();

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("documents", "title", lang)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("documents", "sub", lang)}</p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Link
            href="/dashboard/documents/rirekisho/new"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            + 履歴書
          </Link>
          <Link
            href="/dashboard/documents/shokumu/new"
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            + 職務経歴書
          </Link>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b">
        {(["all", "rirekisho", "shokumukeirekisho"] as const).map((tp) => (
          <button
            key={tp}
            onClick={() => setFilter(tp)}
            className={`px-3 py-2 text-sm transition-colors ${
              filter === tp
                ? "border-b-2 border-primary font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tp === "all"
              ? t("documents", "all", lang)
              : tp === "rirekisho"
                ? "履歴書"
                : "職務経歴書"}
          </button>
        ))}
      </div>

      {isLoading && <DocumentsSkeleton />}

      {error && <p className="text-sm text-destructive">{t("documents", "loadError", lang)}</p>}

      {data && data.items.length === 0 && !isLoading && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">{t("documents", "noDocuments", lang)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("documents", "generateA", lang)}{" "}
            <Link
              href="/dashboard/documents/rirekisho/new"
              className="underline hover:text-foreground"
            >
              履歴書
            </Link>{" "}
            {t("documents", "orLabel", lang)}{" "}
            <Link
              href="/dashboard/documents/shokumu/new"
              className="underline hover:text-foreground"
            >
              職務経歴書
            </Link>{" "}
            {t("documents", "toGetStarted", lang)}
          </p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <ul className="space-y-3">
          {data.items.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DocumentCard({ doc }: { doc: Document }) {
  const { lang } = useLang();
  const label = doc.document_type === "rirekisho" ? "履歴書" : "職務経歴書";
  const createdAt = new Date(doc.created_at).toLocaleDateString();

  return (
    <li className="flex items-center justify-between rounded-lg border bg-card p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
          PDF
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">
            {t("documents", "created", lang)} {createdAt}
          </p>
        </div>
      </div>

      <div className="ml-4 flex shrink-0 items-center gap-3">
        <StatusBadge status={doc.status} />
        <Link
          href={`/dashboard/documents/${doc.id}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {t("common", "view", lang)} →
        </Link>
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  const { lang } = useLang();
  const styles: Record<DocumentStatus, string> = {
    pending: "bg-warning/10 text-warning",
    processing: "bg-primary/10 text-primary",
    completed: "bg-success/10 text-success",
    failed: "bg-destructive/10 text-destructive",
  };
  const labels: Record<DocumentStatus, string> = {
    pending: t("documents", "statusPending", lang),
    processing: t("documents", "statusProcessing", lang),
    completed: t("documents", "statusCompleted", lang),
    failed: t("documents", "statusFailed", lang),
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status === "processing" && (
        <span className="h-2 w-2 animate-spin rounded-full border border-primary border-t-transparent" />
      )}
      {labels[status]}
    </span>
  );
}

function DocumentsSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
      ))}
    </ul>
  );
}
