"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useResumes } from "@/hooks/useResumes";
import { useCreateDocument } from "@/hooks/useDocuments";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DocumentWizard } from "@/components/documents/DocumentWizard";
import { PageHeader } from "@/components/ui/page-header";
import { apiErrorMessage } from "@/lib/api-error";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";

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
    let result;
    try {
      result = await createMutation.mutateAsync({
        resume_id: resumeId,
        ...(jobPostingId ? { job_posting_id: jobPostingId } : {}),
      });
    } catch {
      // See the note in the rirekisho page's handleSubmit.
      return;
    }
    router.push(`/dashboard/documents/${result.id}`);
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <Breadcrumbs
        items={[
          { label: t("documents", "title", lang), href: "/dashboard/documents" },
          { label: t("documents", "generateShokumu", lang) },
        ]}
      />
      <PageHeader
        className="mb-0"
        title={t("documents", "generateShokumu", lang)}
        description={t("documents", "shokumuSub", lang)}
      />

      <DocumentWizard
        resumeList={resumeList}
        resumesLoading={resumesLoading}
        {...(initialJobPostingId ? { initialJobPostingId } : {})}
        isPending={createMutation.isPending}
        error={createMutation.error ? apiErrorMessage(createMutation.error, lang) : null}
        submitLabel={t("documents", "generateShokumu", lang)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
