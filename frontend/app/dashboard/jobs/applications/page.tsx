"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Briefcase, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { StageBadge } from "@/components/jobs/stage-badge";
import { RetryButton } from "@/components/retry-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useApplications,
  useDeleteApplication,
  useUpdateApplication,
} from "@/hooks/useApplications";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import {
  FORWARD_STAGES,
  isForward,
  moveLabel,
  reopenTarget,
  splitMoves,
  stageName,
  type ForwardStatus,
} from "@/lib/pipeline";
import { cn } from "@/lib/utils";
import type { ApplicationStatus, JobApplication } from "@/types/api";

type MoveFn = (app: JobApplication, to: ApplicationStatus) => void;

const titleId = (applicationId: string) => `application-${applicationId}`;

export default function PipelinePage() {
  const { lang } = useLang();
  const applications = useApplications();
  // Held here, not in the cards: a moved card unmounts from its old column
  // straight away, and a mutation's per-call callbacks don't fire after that.
  const update = useUpdateApplication();
  const { toast } = useToast();
  // The card to focus once it shows at the given status.
  const [focus, setFocus] = useState<{ id: string; status: ApplicationStatus } | null>(null);

  const all = applications.data;

  // A move re-renders the card in another column; focus follows it there, so
  // keyboard users keep their place.
  useEffect(() => {
    if (focus === null) return;
    const link = document.getElementById(titleId(focus.id));
    if (link?.dataset["status"] === focus.status) {
      link.focus();
      setFocus(null);
    }
  }, [focus, all]);

  const move: MoveFn = (app, to) => {
    setFocus({ id: app.id, status: to });
    update.mutateAsync({ id: app.id, data: { status: to } }).catch(() => {
      // The hook has put the card back; follow it there and say why.
      setFocus({ id: app.id, status: app.status });
      toast({ variant: "destructive", description: t("common", "updateFailed", lang) });
    });
  };

  let body: React.ReactNode;
  if (all === undefined && applications.error) {
    body = (
      <Alert
        action={
          <RetryButton
            retrying={applications.isFetching}
            onRetry={() => void applications.refetch()}
          />
        }
      >
        {t("jobs", "appLoadError", lang)}
      </Alert>
    );
  } else if (all === undefined) {
    body = <BoardSkeleton />;
  } else if (all.length === 0) {
    body = (
      <EmptyState
        icon={Briefcase}
        title={t("jobs", "pipelineEmpty", lang)}
        description={t("jobs", "pipelineEmptyHint", lang)}
        action={
          <Button asChild>
            <Link href="/dashboard/jobs">{t("jobs", "findJobs", lang)}</Link>
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        {/* Stacked on phones; all six side by side only where each gets ~180px. */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {FORWARD_STAGES.map((stage) => (
            <StageColumn
              key={stage}
              stage={stage}
              apps={all.filter((a) => a.status === stage)}
              onMove={move}
            />
          ))}
        </div>
        <Archived apps={all.filter((a) => !isForward(a.status))} onMove={move} />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title={t("jobs", "pipelineTitle", lang)}
        description={t("jobs", "pipelineSub", lang)}
        actions={
          <Button asChild variant="secondary">
            <Link href="/dashboard/jobs">{t("jobs", "findJobs", lang)}</Link>
          </Button>
        }
      />
      {body}
    </div>
  );
}

function StageColumn({
  stage,
  apps,
  onMove,
}: {
  stage: ForwardStatus;
  apps: JobApplication[];
  onMove: MoveFn;
}) {
  const { lang } = useLang();
  const headingId = `stage-${stage}`;
  return (
    <section aria-labelledby={headingId} className="rounded-lg border bg-secondary p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id={headingId} className="text-sm font-semibold">
          {stageName(stage, lang)}
        </h2>
        <Badge className="tabular-nums">{apps.length}</Badge>
      </div>
      {apps.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("jobs", "stageEmpty", lang)}</p>
      ) : (
        <ul className="space-y-2">
          {apps.map((app) => (
            <PipelineCard key={app.id} app={app} onMove={onMove} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TitleLink({ app }: { app: JobApplication }) {
  const { lang } = useLang();
  return (
    <Link
      id={titleId(app.id)}
      data-status={app.status}
      href={`/dashboard/jobs/${app.job_posting_id}` as Route}
      className="line-clamp-2 rounded font-medium leading-snug hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {app.job_title ?? t("jobs", "untitled", lang)}
    </Link>
  );
}

function PipelineCard({ app, onMove }: { app: JobApplication; onMove: MoveFn }) {
  const { lang } = useLang();
  const confirmDialog = useConfirm();
  const { toast } = useToast();
  const update = useUpdateApplication();
  const remove = useDeleteApplication();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(app.notes ?? "");
  const [saving, setSaving] = useState(false);
  const pencilRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const title = app.job_title ?? t("jobs", "untitled", lang);
  const next = isForward(app.status) ? splitMoves(app.status).next : null;

  // Closing the notes editor puts focus back on the button that opened it.
  useEffect(() => {
    if (wasEditing.current && !editing) pencilRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  function cancel() {
    setNotes(app.notes ?? "");
    setEditing(false);
  }

  async function saveNotes() {
    setSaving(true);
    try {
      await update.mutateAsync({ id: app.id, data: { notes } });
      setEditing(false);
    } catch {
      toast({ variant: "destructive", description: t("common", "updateFailed", lang) });
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    const ok = await confirmDialog({
      title: t("jobs", "confirmRemove", lang),
      variant: "destructive",
      confirmLabel: t("common", "delete", lang),
      cancelLabel: t("common", "cancel", lang),
    });
    if (!ok) return;
    remove.mutate(app.id, {
      onSuccess: () => toast({ variant: "success", description: t("common", "deleted", lang) }),
      onError: () =>
        toast({ variant: "destructive", description: t("common", "deleteFailed", lang) }),
    });
  }

  const appliedDate = app.applied_at
    ? new Date(app.applied_at).toLocaleDateString(lang, { day: "numeric", month: "short" })
    : null;
  const notesId = `notes-${app.id}`;

  return (
    <li className="space-y-2 rounded-md border bg-card p-3 text-sm">
      <div className="min-w-0">
        <TitleLink app={app} />
        {app.job_company && <p className="text-xs text-muted-foreground">{app.job_company}</p>}
      </div>

      {appliedDate && (
        <p className="text-xs text-muted-foreground">
          {t("jobs", "appliedOn", lang)} {appliedDate}
        </p>
      )}

      {editing ? (
        <div className="space-y-2">
          <label htmlFor={notesId} className="sr-only">
            {t("jobs", "notesLabel", lang)}
          </label>
          <Textarea
            id={notesId}
            value={notes}
            rows={3}
            autoFocus
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancel();
            }}
            className="text-xs"
          />
          <div className="flex gap-2">
            <Button size="sm" loading={saving} onClick={() => void saveNotes()}>
              {t("jobs", "saveNotes", lang)}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel}>
              {t("common", "cancel", lang)}
            </Button>
          </div>
        </div>
      ) : (
        app.notes && <p className="line-clamp-1 text-xs text-muted-foreground">{app.notes}</p>
      )}

      <div className="flex items-center gap-1">
        {next && (
          <Button size="sm" variant="secondary" onClick={() => onMove(app, next)}>
            {moveLabel(app.status, next, lang)}
          </Button>
        )}
        <div className="ml-auto flex gap-1">
          <Button
            ref={pencilRef}
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t("jobs", "editNotesFor", lang).replace("{title}", title)}
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t("jobs", "removeFor", lang).replace("{title}", title)}
            loading={remove.isPending}
            onClick={() => void handleRemove()}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
    </li>
  );
}

function Archived({ apps, onMove }: { apps: JobApplication[]; onMove: MoveFn }) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  if (apps.length === 0) return null;

  return (
    <section className="space-y-3">
      <Button variant="ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ChevronDown
          aria-hidden="true"
          className={cn("transition-transform motion-reduce:transition-none", open && "rotate-180")}
        />
        {t("jobs", "archived", lang).replace("{n}", String(apps.length))}
      </Button>
      {open && (
        <ul className="divide-y rounded-lg border bg-card">
          {apps.map((app) => {
            const target = reopenTarget(app);
            const date = new Date(app.updated_at).toLocaleDateString(lang, {
              day: "numeric",
              month: "short",
            });
            return (
              <li
                key={app.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <TitleLink app={app} />
                  <div className="flex flex-wrap items-center gap-2">
                    <StageBadge status={app.status} />
                    <span className="text-xs text-muted-foreground">{date}</span>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => onMove(app, target)}>
                  {moveLabel(app.status, target, lang)}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function BoardSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {FORWARD_STAGES.map((stage) => (
        <Skeleton key={stage} className="h-40 w-full" />
      ))}
    </div>
  );
}
