"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useResumes } from "@/hooks/useResumes";
import { useCreateDocument } from "@/hooks/useDocuments";
import { DocumentWizard } from "@/components/documents/DocumentWizard";

export default function NewShokumuPage() {
  const router = useRouter();
  const { data: resumeList, isLoading: resumesLoading } = useResumes();
  const createMutation = useCreateDocument("shokumukeirekisho");

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
          ← Back to documents
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Generate 職務経歴書</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We'll convert your resume into a Japanese-format 職務経歴書 (shokumukeirekisho) PDF.
        </p>
      </div>

      <DocumentWizard
        resumeList={resumeList}
        resumesLoading={resumesLoading}
        isPending={createMutation.isPending}
        error={createMutation.error instanceof Error ? createMutation.error.message : null}
        submitLabel="Generate 職務経歴書"
        onSubmit={handleSubmit}
      />
    </div>
  );
}
