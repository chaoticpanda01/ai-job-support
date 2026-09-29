"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { StageBadge } from "@/components/jobs/stage-badge";
import { RetryButton } from "@/components/retry-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useApplications,
  useCreateApplication,
  useUpdateApplication,
} from "@/hooks/useApplications";
import { useDocuments } from "@/hooks/useDocuments";
import { apiErrorMessage } from "@/lib/api-error";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import {
  FORWARD_STAGES,
  confirmKey,
  isForward,
  moveLabel,
  reopenTarget,
  splitMoves,
  stageAction,
  stageName,
  tailoredDocuments,
  type ForwardStatus,
} from "@/lib/pipeline";
import { cn } from "@/lib/utils";
import type { ApplicationStatus, JobApplication, JobPostingDetail } from "@/types/api";

/**
 * Where this job is in the user's pipeline, what to do at that stage, and the
 * moves it can make. A move replaces the buttons, so focus then goes to the
 * panel's heading instead of being dropped to <body>.
 */
export function StagePanel({ job }: { job: JobPostingDetail }) {
  const { lang } = useLang();
  const applications = useApplications();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeading = () => headingRef.current?.focus();
  const application = applications.data?.find((a) => a.job_posting_id === job.id);

  let body: React.ReactNode;
  if (applications.data === undefined && applications.error) {
    body = (
      <Alert
        action={
          <RetryButton
            retrying={applications.isFetching}
            onRetry={() => void applications.refetch()}
          />
        }
      >
        {t("jobs", "stageLoadError", lang)}
      </Alert>
    );
  } else if (applications.data === undefined) {
    body = <Skeleton className="h-24 w-full" />;
  } else if (!application) {
    body = <SavePrompt jobId={job.id} onSaved={focusHeading} />;
  } else if (isForward(application.status)) {
    body = (
      <ForwardStage
        job={job}
        application={application}
        status={application.status}
        onMoved={focusHeading}
      />
    );
  } else {
    body = <ArchivedStage application={application} onMoved={focusHeading} />;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <h2 ref={headingRef} tabIndex={-1} className="text-base font-semibold focus:outline-none">
          {t("jobs", "stagePanelTitle", lang)}
        </h2>
      </CardHeader>
      <CardContent className="space-y-4">{body}</CardContent>
    </Card>
  );
}

function SavePrompt({ jobId, onSaved }: { jobId: string; onSaved: () => void }) {
  const { lang } = useLang();
  const create = useCreateApplication();
  return (
    <>
      <p className="text-sm text-muted-foreground">{t("jobs", "savePrompt", lang)}</p>
      <Button
        className="w-full"
        loading={create.isPending}
        onClick={() => create.mutate({ job_posting_id: jobId }, { onSuccess: onSaved })}
      >
        {t("jobs", "saveToPipeline", lang)}
      </Button>
      {create.error && <Alert>{apiErrorMessage(create.error, lang)}</Alert>}
    </>
  );
}

/** Moves one application, asking first when the move ends its run. */
function useMove(application: JobApplication, onMoved: () => void) {
  const { lang } = useLang();
  const confirmDialog = useConfirm();
  const update = useUpdateApplication();
  const [pending, setPending] = useState<ApplicationStatus | null>(null);

  async function move(to: ApplicationStatus) {
    const key = confirmKey(application.status, to);
    if (key) {
      const ok = await confirmDialog({
        title: t("jobs", key, lang),
        variant: "destructive",
        confirmLabel: moveLabel(application.status, to, lang),
        cancelLabel: t("common", "cancel", lang),
      });
      if (!ok) return;
    }
    setPending(to);
    update.mutate(
      { id: application.id, data: { status: to } },
      { onSuccess: onMoved, onSettled: () => setPending(null) },
    );
  }

  return { move, pending, error: update.error };
}

function ForwardStage({
  job,
  application,
  status,
  onMoved,
}: {
  job: JobPostingDetail;
  application: JobApplication;
  status: ForwardStatus;
  onMoved: () => void;
}) {
  const { lang } = useLang();
  const { move, pending, error } = useMove(application, onMoved);
  const documents = useDocuments();
  const made = tailoredDocuments(documents.data?.items ?? [], job.id);
  const action = stageAction(status, job);
  const { next, back, others } = splitMoves(status);

  const moveButton = (to: ApplicationStatus, variant: "primary" | "secondary" | "ghost") => (
    <Button
      key={to}
      variant={variant}
      size="sm"
      loading={pending === to}
      disabled={pending !== null && pending !== to}
      onClick={() => void move(to)}
    >
      {moveLabel(status, to, lang)}
    </Button>
  );

  return (
    <>
      <StageBadge status={status} />
      <Stepper current={status} />
      <p className="text-sm">{t("jobs", action.lineKey, lang)}</p>
      {action.links.length > 0 && (
        <ul className="space-y-1.5">
          {action.links.map((link) => (
            <li key={link.href} className="flex flex-wrap items-center gap-2">
              <Button asChild variant="link" size="sm">
                <Link href={link.href}>{t("jobs", link.labelKey, lang)}</Link>
              </Button>
              {link.documentType && made.has(link.documentType) && (
                <Badge variant="success">
                  <Check aria-hidden="true" className="h-3 w-3" />
                  {t("jobs", "docMade", lang)}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        {next && moveButton(next, "primary")}
        {others.map((to) => moveButton(to, "secondary"))}
        {back && moveButton(back, "ghost")}
      </div>
      {error && <Alert>{apiErrorMessage(error, lang)}</Alert>}
    </>
  );
}

/** Six bars, filled up to the current stage. The labels are for screen readers. */
function Stepper({ current }: { current: ForwardStatus }) {
  const { lang } = useLang();
  const index = FORWARD_STAGES.indexOf(current);
  return (
    <ol aria-label={t("jobs", "stageStepsLabel", lang)} className="grid grid-cols-6 gap-1">
      {FORWARD_STAGES.map((stage, i) => (
        <li key={stage} aria-current={stage === current ? "step" : undefined}>
          <span
            aria-hidden="true"
            className={cn("block h-1.5 rounded-full", i <= index ? "bg-indigo" : "bg-muted")}
          />
          <span className="sr-only">{stageName(stage, lang)}</span>
        </li>
      ))}
    </ol>
  );
}

function ArchivedStage({
  application,
  onMoved,
}: {
  application: JobApplication;
  onMoved: () => void;
}) {
  const { lang } = useLang();
  const { move, pending, error } = useMove(application, onMoved);
  const target = reopenTarget(application);
  const date = new Date(application.updated_at).toLocaleDateString(lang, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <>
      <StageBadge status={application.status} />
      <p className="text-sm text-muted-foreground">
        {t("jobs", "movedOn", lang).replace("{date}", date)}
      </p>
      <Button
        variant="secondary"
        size="sm"
        loading={pending === target}
        onClick={() => void move(target)}
      >
        {moveLabel(application.status, target, lang)}
      </Button>
      {error && <Alert>{apiErrorMessage(error, lang)}</Alert>}
    </>
  );
}
