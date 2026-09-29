"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioCard } from "@/components/ui/radio-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { DocumentOrientation, ResumeList } from "@/types/api";

type Step = "resume" | "job" | "confirm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Props {
  resumeList: ResumeList | undefined;
  resumesLoading: boolean;
  initialJobPostingId?: string;
  isPending: boolean;
  error: string | null;
  submitLabel: string;
  showOrientation?: boolean;
  onSubmit: (
    resumeId: string,
    jobPostingId?: string,
    orientation?: DocumentOrientation,
  ) => Promise<void>;
}

export function DocumentWizard({
  resumeList,
  resumesLoading,
  initialJobPostingId,
  isPending,
  error,
  submitLabel,
  showOrientation = false,
  onSubmit,
}: Props) {
  const [step, setStep] = useState<Step>("resume");
  const [resumeId, setResumeId] = useState<string>("");
  const [jobPostingId, setJobPostingId] = useState<string>(initialJobPostingId ?? "");
  const [orientation, setOrientation] = useState<DocumentOrientation>("portrait");
  // Each step's first button is the same element to React, so after Next the
  // keyboard focus would land on the new step's Back button, and a second
  // Enter would go straight back. A step the reader moves to (goToStep) takes
  // focus to its title instead; nothing moves focus on first render.
  const titleRef = useRef<HTMLParagraphElement>(null);
  const focusTitle = useRef(false);
  function goToStep(next: Step) {
    focusTitle.current = true;
    setStep(next);
  }
  useEffect(() => {
    if (!focusTitle.current) return;
    focusTitle.current = false;
    titleRef.current?.focus();
  }, [step]);
  const { lang } = useLang();

  const resumes = resumeList?.items ?? [];
  const selectedResume = resumes.find((r) => r.id === resumeId);

  // -----------------------------------------------------------------------
  // Step 1 — pick resume
  // -----------------------------------------------------------------------
  if (step === "resume") {
    return (
      <div className="space-y-4">
        <StepHeader
          titleRef={titleRef}
          current={1}
          total={3}
          title={t("documents", "wizStep1Title", lang)}
        />

        {resumesLoading && <ResumesSkeleton />}

        {!resumesLoading && resumes.length === 0 && (
          <EmptyState
            icon={FileText}
            title={t("documents", "wizNoResumes", lang)}
            action={
              <Button asChild variant="secondary">
                <Link href="/dashboard/resumes">{t("documents", "wizUploadFirst", lang)}</Link>
              </Button>
            }
          />
        )}

        {!resumesLoading && resumes.length > 0 && (
          <fieldset>
            <legend className="sr-only">{t("documents", "wizStep1Title", lang)}</legend>
            <ul className="space-y-2">
              {resumes.map((r) => (
                <li key={r.id}>
                  <RadioCard
                    name="resume"
                    value={r.id}
                    checked={resumeId === r.id}
                    onChange={() => setResumeId(r.id)}
                  >
                    <p className="truncate text-sm font-medium">{r.file_name}</p>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {Math.round(r.file_size_bytes / 1024)} KB ·{" "}
                        {t("documents", "wizUploaded", lang)}{" "}
                        {new Date(r.created_at).toLocaleDateString(lang, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      {r.is_primary && (
                        <Badge variant="info">{t("documents", "wizPrimary", lang)}</Badge>
                      )}
                    </p>
                  </RadioCard>
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        <div className="flex justify-end">
          <Button onClick={() => goToStep("job")} disabled={!resumeId}>
            {t("documents", "wizNext", lang)}
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Step 2 — optional job context
  // -----------------------------------------------------------------------
  if (step === "job") {
    const jobIdInvalid = jobPostingId.trim() !== "" && !UUID_RE.test(jobPostingId.trim());

    return (
      <div className="space-y-4">
        <StepHeader
          titleRef={titleRef}
          current={2}
          total={3}
          title={t("documents", "wizStep2Title", lang)}
        />

        <p className="text-sm text-muted-foreground">{t("documents", "wizStep2Sub", lang)}</p>

        <Field
          label={t("documents", "wizJobIdLabel", lang)}
          optionalLabel={t("settings", "optional", lang)}
          error={jobIdInvalid ? t("documents", "wizJobIdInvalid", lang) : undefined}
        >
          <Input
            value={jobPostingId}
            onChange={(e) => setJobPostingId(e.target.value)}
            placeholder={t("documents", "wizJobIdPlaceholder", lang)}
          />
        </Field>

        {showOrientation && (
          <SegmentedControl<DocumentOrientation>
            legend={t("documents", "wizOrientationLabel", lang)}
            name="orientation"
            value={orientation}
            onChange={setOrientation}
            options={[
              { value: "portrait", label: t("documents", "wizOrientationPortrait", lang) },
              { value: "landscape", label: t("documents", "wizOrientationLandscape", lang) },
            ]}
          />
        )}

        <div className="flex justify-between">
          <Button variant="secondary" onClick={() => goToStep("resume")}>
            {t("common", "back", lang)}
          </Button>
          <Button onClick={() => goToStep("confirm")} disabled={jobIdInvalid}>
            {t("documents", "wizNext", lang)}
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Step 3 — confirm + submit
  // -----------------------------------------------------------------------
  return (
    <div className="space-y-4">
      <StepHeader
        titleRef={titleRef}
        current={3}
        total={3}
        title={t("documents", "wizStep3Title", lang)}
      />

      <Card className="space-y-2 p-4 text-sm">
        <Row
          label={t("documents", "wizResumeLabel", lang)}
          value={selectedResume?.file_name ?? resumeId}
        />
        <Row
          label={t("documents", "wizJobLabel", lang)}
          value={jobPostingId || t("documents", "wizNoJobContext", lang)}
        />
        {showOrientation && (
          <Row
            label={t("documents", "wizOrientationLabel", lang)}
            value={
              orientation === "landscape"
                ? t("documents", "wizOrientationLandscape", lang)
                : t("documents", "wizOrientationPortrait", lang)
            }
          />
        )}
      </Card>

      <p className="text-sm text-muted-foreground">{t("documents", "wizGenWait", lang)}</p>

      {error && <Alert>{error}</Alert>}

      <div className="flex justify-between">
        <Button variant="secondary" onClick={() => goToStep("job")} disabled={isPending}>
          {t("common", "back", lang)}
        </Button>
        <Button
          onClick={() =>
            onSubmit(resumeId, jobPostingId || undefined, showOrientation ? orientation : undefined)
          }
          loading={isPending}
        >
          {isPending ? t("documents", "wizQueuing", lang) : submitLabel}
        </Button>
      </div>
    </div>
  );
}

function StepHeader({
  titleRef,
  current,
  total,
  title,
}: {
  titleRef: React.Ref<HTMLParagraphElement>;
  current: number;
  total: number;
  title: string;
}) {
  const { lang } = useLang();
  const stepLabel = t("documents", "wizStepOf", lang)
    .replace("{n}", String(current))
    .replace("{t}", String(total));

  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {current}
      </span>
      <div className="flex-1">
        <p ref={titleRef} tabIndex={-1} className="text-sm font-medium focus:outline-none">
          {title}
        </p>
        <p className="text-xs text-muted-foreground">{stepLabel}</p>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-6 rounded-full ${i < current ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function ResumesSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-lg" />
      ))}
    </div>
  );
}
