"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslateJob } from "@/hooks/useJobs";
import { apiErrorMessage } from "@/lib/api-error";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";

// Matches TranslateJobRequest.raw_text's max_length in backend/app/schemas/job.py.
// Enforced here too: a 422 from exceeding it is a field-level error, and the
// page can only report the status, so the limit is better shown than explained.
const MAX_JOB_TEXT = 20_000;

export default function TranslateJobPage() {
  const router = useRouter();
  const [sourceUrl, setSourceUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const translateMutation = useTranslateJob();
  const { lang } = useLang();

  const canSubmit = rawText.trim().length >= 50;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    translateMutation.mutate(
      {
        raw_text: rawText.trim(),
        ...(sourceUrl.trim() ? { source_url: sourceUrl.trim() } : {}),
      },
      // mutate, not mutateAsync: a rejected mutateAsync promise had no catch,
      // so every failed translation also raised an unhandled rejection.
      { onSuccess: (result) => router.push(`/dashboard/jobs/${result.id}`) },
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <Link
          href="/dashboard/jobs"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          {t("jobs", "backToJobs", lang)}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">{t("jobs", "translateTitle", lang)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("jobs", "translateSub", lang)}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Source URL */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="source-url">
            {t("jobs", "sourceUrl", lang)}{" "}
            <span className="font-normal text-muted-foreground">
              ({t("common", "optional", lang)})
            </span>
          </label>
          <input
            id="source-url"
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://www.indeed.com/..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-muted-foreground">{t("jobs", "sourceUrlHint", lang)}</p>
        </div>

        {/* Raw text */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="raw-text">
            {t("jobs", "jobText", lang)} <span className="text-destructive">*</span>
          </label>
          <textarea
            id="raw-text"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            maxLength={MAX_JOB_TEXT}
            rows={16}
            placeholder={t("jobs", "jobTextPlaceholder", lang)}
            className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{t("jobs", "minChars", lang)}</p>
            <p
              className={`text-xs tabular-nums ${rawText.trim().length < 50 ? "text-muted-foreground" : "text-green-600"}`}
            >
              {t("jobs", "charCount", lang)
                .replace("{n}", String(rawText.trim().length))
                .replace("{max}", String(MAX_JOB_TEXT))}
            </p>
          </div>
        </div>

        {translateMutation.error && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {apiErrorMessage(translateMutation.error, lang)}
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
                {t("jobs", "translating", lang)}
              </span>
            ) : (
              t("jobs", "translateSubmit", lang)
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
