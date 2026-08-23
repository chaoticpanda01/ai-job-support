"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useResumes } from "@/hooks/useResumes";
import { useCreateDocument } from "@/hooks/useDocuments";
import { DocumentWizard } from "@/components/documents/DocumentWizard";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { ApiClientError } from "@/lib/api-client";

export default function NewShokumuPage() {
  return (
    <Suspense>
      <NewShokumuPageInner />
    </Suspense>
  );
}

function NewShokumuPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialJobPostingId = searchParams.get("job") ?? undefined;
  const { data: resumeList, isLoading: resumesLoading } = useResumes();
  const createMutation = useCreateDocument("shokumukeirekisho");
  const { lang } = useLang();

  async function handleSubmit(resumeId: string, jobPostingId?: string) {
    const result = await createMutation.mutateAsync({
      resume_id: resumeId,
      ...(jobPostingId ? { job_posting_id: jobPostingId } : {}),
    });
    router.push(`/dashboard/documents/${result.id}`);
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <Link
          href="/dashboard/documents"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          {t("documents", "backToDocuments", lang)}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">{t("documents", "generateShokumu", lang)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("documents", "shokumuSub", lang)}</p>
      </div>

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
        submitLabel={t("documents", "generateShokumu", lang)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
