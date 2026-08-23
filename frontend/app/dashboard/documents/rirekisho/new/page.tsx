"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useResumes } from "@/hooks/useResumes";
import { useCreateDocument } from "@/hooks/useDocuments";
import { useMe } from "@/hooks/useMe";
import { DocumentWizard } from "@/components/documents/DocumentWizard";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { ApiClientError } from "@/lib/api-client";

export default function NewRirekishoPage() {
  return (
    <Suspense>
      <NewRirekishoPageInner />
    </Suspense>
  );
}

function NewRirekishoPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialJobPostingId = searchParams.get("job") ?? undefined;
  const { data: resumeList, isLoading: resumesLoading } = useResumes();
  const { data: me, isLoading: meLoading } = useMe();
  const createMutation = useCreateDocument("rirekisho");
  const { lang } = useLang();

  async function handleSubmit(resumeId: string, jobPostingId?: string) {
    const result = await createMutation.mutateAsync({
      resume_id: resumeId,
      ...(jobPostingId ? { job_posting_id: jobPostingId } : {}),
    });
    router.push(`/dashboard/documents/${result.id}`);
  }

  // Explicit, exhaustive status instead of three separate `{!meLoading &&
  // me && ...}` guards — those two conditions being false simultaneously
  // (meLoading finished, me still undefined, i.e. the /auth/me fetch
  // failed) is a real, reachable state, not just a theoretical one. Naming
  // it here means it can't silently render nothing.
  const meStatus = meLoading
    ? "loading"
    : !me
      ? "error"
      : !me.rirekisho_ready
        ? "incomplete"
        : "ready";

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <Link
          href="/dashboard/documents"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          {t("documents", "backToDocuments", lang)}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">{t("documents", "generateRirekisho", lang)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("documents", "rirekishoSub", lang)}</p>
      </div>

      {meStatus === "loading" && (
        <div className="space-y-4 rounded-lg border border-dashed p-6">
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
          <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
        </div>
      )}

      {meStatus === "error" && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-destructive">
          {t("documents", "profileLoadError", lang)}
        </p>
      )}

      {meStatus === "incomplete" && me && (
        <div className="space-y-4 rounded-lg border border-dashed p-6">
          <p className="text-sm font-medium">{t("documents", "profileIncompleteTitle", lang)}</p>
          <p className="text-sm text-muted-foreground">
            {t("documents", "profileIncompleteHint", lang)}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {me.rirekisho_missing_fields.map((f) => (
              <li key={f.key}>{f.label}</li>
            ))}
          </ul>
          <Link
            href="/dashboard/settings#rirekisho-info"
            className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {t("documents", "goToSettings", lang)}
          </Link>
        </div>
      )}

      {meStatus === "ready" && (
        <DocumentWizard
          resumeList={resumeList}
          resumesLoading={resumesLoading}
          {...(initialJobPostingId ? { initialJobPostingId } : {})}
          isPending={createMutation.isPending}
          error={
            createMutation.error instanceof ApiClientError
              ? createMutation.error.detail
              : createMutation.error
                ? t("documents", "createFailed", lang)
                : null
          }
          submitLabel={t("documents", "generateRirekisho", lang)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
