"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslateJob } from "@/hooks/useJobs";

export default function TranslateJobPage() {
  const router = useRouter();
  const [sourceUrl, setSourceUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const translateMutation = useTranslateJob();

  const canSubmit = rawText.trim().length >= 50;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = await translateMutation.mutateAsync({
      raw_text: rawText.trim(),
      ...(sourceUrl.trim() ? { source_url: sourceUrl.trim() } : {}),
    });
    router.push(`/dashboard/jobs/${result.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <Link
          href="/dashboard/jobs"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to jobs
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Translate a Job Posting</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste the full text of a Japanese job posting and we'll translate it into Indonesian,
          extract key details, and score how foreigner-friendly it is.
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
        {/* Source URL */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="source-url">
            Source URL{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="source-url"
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://www.indeed.com/..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-muted-foreground">
            Used to detect duplicate translations. We do not fetch the URL.
          </p>
        </div>

        {/* Raw text */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="raw-text">
            Job posting text <span className="text-destructive">*</span>
          </label>
          <textarea
            id="raw-text"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={16}
            placeholder="Paste the full Japanese job posting text here…"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Minimum 50 characters required.
            </p>
            <p className={`text-xs tabular-nums ${rawText.trim().length < 50 ? "text-muted-foreground" : "text-green-600"}`}>
              {rawText.trim().length} chars
            </p>
          </div>
        </div>

        {translateMutation.error instanceof Error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {translateMutation.error.message}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!canSubmit || translateMutation.isPending}
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {translateMutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                Translating…
              </span>
            ) : (
              "Translate posting"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
