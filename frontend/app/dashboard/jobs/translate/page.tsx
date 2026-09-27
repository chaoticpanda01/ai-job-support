"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
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
      <Breadcrumbs
        items={[
          { label: t("jobs", "title", lang), href: "/dashboard/jobs" },
          { label: t("jobs", "translateTitle", lang) },
        ]}
      />
      <PageHeader
        className="mb-0"
        eyebrow={t("nav", "groupApply", lang)}
        title={t("jobs", "translateTitle", lang)}
        description={t("jobs", "translateSub", lang)}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Field
          label={t("jobs", "sourceUrl", lang)}
          optionalLabel={t("settings", "optional", lang)}
          hint={t("jobs", "sourceUrlHint", lang)}
        >
          <Input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://www.indeed.com/..."
          />
        </Field>

        <div className="space-y-1.5">
          <Field label={t("jobs", "jobText", lang)} hint={t("jobs", "minChars", lang)}>
            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              maxLength={MAX_JOB_TEXT}
              rows={16}
              placeholder={t("jobs", "jobTextPlaceholder", lang)}
              className="resize-y"
            />
          </Field>
          <p
            className={`text-right text-xs tabular-nums ${rawText.trim().length < 50 ? "text-muted-foreground" : "text-success"}`}
          >
            {t("jobs", "charCount", lang)
              .replace("{n}", String(rawText.trim().length))
              .replace("{max}", String(MAX_JOB_TEXT))}
          </p>
        </div>

        {translateMutation.error && <Alert>{apiErrorMessage(translateMutation.error, lang)}</Alert>}

        <div className="flex justify-end">
          <Button type="submit" disabled={!canSubmit} loading={translateMutation.isPending}>
            {translateMutation.isPending
              ? t("jobs", "translating", lang)
              : t("jobs", "translateSubmit", lang)}
          </Button>
        </div>
      </form>
    </div>
  );
}
