"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useApplications,
  useUpdateApplication,
  useDeleteApplication,
} from "@/hooks/useApplications";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { ApplicationStatus, JobApplication } from "@/types/api";

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const COLUMN_KEYS: ApplicationStatus[] = [
  "planning",
  "applied",
  "interviewing",
  "offered",
  "rejected",
  "withdrawn",
];

const COLUMN_COLORS: Record<ApplicationStatus, string> = {
  planning: "bg-muted border-border",
  applied: "bg-primary/5 border-primary/20",
  interviewing: "bg-warning/10 border-warning/30",
  offered: "bg-success/10 border-success/30",
  rejected: "bg-destructive/10 border-destructive/30",
  withdrawn: "bg-muted border-border",
};

const STATUS_NEXT: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = {
  planning: ["applied", "withdrawn"],
  applied: ["interviewing", "rejected", "withdrawn"],
  interviewing: ["offered", "rejected", "withdrawn"],
  offered: ["withdrawn"],
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ApplicationsPage() {
  const { data: apps, isLoading, error } = useApplications();
  const { lang } = useLang();

  const grouped = groupByStatus(apps ?? []);

  const columns = COLUMN_KEYS.map((status) => ({
    status,
    label: t("jobs", `col${status.charAt(0).toUpperCase() + status.slice(1)}` as never, lang),
    color: COLUMN_COLORS[status],
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("jobs", "appTitle", lang)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("jobs", "appSub", lang)}</p>
        </div>
        <Link
          href="/dashboard/jobs"
          className="shrink-0 rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          {t("jobs", "jobBoard", lang)}
        </Link>
      </div>

      {error && <p className="text-sm text-destructive">{t("jobs", "appLoadError", lang)}</p>}

      {isLoading ? (
        <KanbanSkeleton columns={columns} />
      ) : (
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0 xl:grid-cols-6">
          {columns.map((col) => (
            <KanbanColumn
              key={col.status}
              status={col.status}
              label={col.label}
              color={col.color}
              apps={grouped[col.status] ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

function KanbanColumn({
  status,
  label,
  color,
  apps,
}: {
  status: ApplicationStatus;
  label: string;
  color: string;
  apps: JobApplication[];
}) {
  return (
    <div
      className={`rounded-lg border ${color} flex min-h-[200px] w-64 shrink-0 snap-start flex-col lg:w-auto lg:shrink`}
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
        <span className="rounded-full bg-background px-1.5 py-0.5 text-xs font-medium tabular-nums">
          {apps.length}
        </span>
      </div>

      <ul className="flex flex-1 flex-col gap-2 p-2">
        {apps.map((app) => (
          <ApplicationCard key={app.id} app={app} nextStatuses={STATUS_NEXT[status] ?? []} />
        ))}
        {apps.length === 0 && (
          <li className="flex flex-1 items-center justify-center">
            <p className="text-xs text-muted-foreground">—</p>
          </li>
        )}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function ApplicationCard({
  app,
  nextStatuses,
}: {
  app: JobApplication;
  nextStatuses: ApplicationStatus[];
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(app.notes ?? "");
  const { lang } = useLang();

  const update = useUpdateApplication();
  const remove = useDeleteApplication();

  void showMenu; // suppress unused warning

  function moveToStatus(newStatus: ApplicationStatus) {
    update.mutate({ id: app.id, data: { status: newStatus } });
    setShowMenu(false);
  }

  async function saveNotes() {
    await update.mutateAsync({ id: app.id, data: { notes } });
    setEditingNotes(false);
  }

  const appliedDate = app.applied_at
    ? new Date(app.applied_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : null;

  return (
    <li className="relative space-y-1.5 rounded-md border bg-background p-3 text-sm shadow-sm">
      <div>
        <Link
          href={`/dashboard/jobs/${app.job_posting_id}`}
          className="line-clamp-2 font-medium leading-snug hover:underline"
        >
          {app.job_title ?? t("jobs", "untitled", lang)}
        </Link>
        {app.job_company && <p className="text-xs text-muted-foreground">{app.job_company}</p>}
      </div>

      {appliedDate && (
        <p className="text-xs text-muted-foreground">
          {t("jobs", "appliedOn", lang)} {appliedDate}
        </p>
      )}

      {!editingNotes && app.notes && (
        <p className="line-clamp-2 text-xs italic text-muted-foreground">{app.notes}</p>
      )}

      {editingNotes && (
        <div className="space-y-1">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            autoFocus
            className="w-full resize-none rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-1.5">
            <button
              onClick={saveNotes}
              disabled={update.isPending}
              className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground disabled:opacity-50"
            >
              {t("common", "saveChanges", lang).split(" ")[0]}
            </button>
            <button
              onClick={() => {
                setEditingNotes(false);
                setNotes(app.notes ?? "");
              }}
              className="rounded border px-2 py-0.5 text-xs hover:bg-accent"
            >
              {t("common", "cancel", lang)}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 pt-0.5">
        {nextStatuses.map((s) => (
          <button
            key={s}
            onClick={() => moveToStatus(s)}
            disabled={update.isPending}
            className="rounded border px-1.5 py-0.5 text-xs capitalize hover:bg-accent disabled:opacity-50"
          >
            → {s}
          </button>
        ))}

        <div className="ml-auto flex gap-1">
          <button
            onClick={() => setEditingNotes(true)}
            className="text-xs text-muted-foreground hover:text-foreground"
            title="Edit notes"
          >
            ✎
          </button>
          <button
            onClick={() => {
              if (confirm(t("jobs", "confirmRemove", lang))) {
                remove.mutate(app.id);
              }
            }}
            className="text-xs text-muted-foreground hover:text-destructive"
            title="Remove"
          >
            ✕
          </button>
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByStatus(apps: JobApplication[]): Record<ApplicationStatus, JobApplication[]> {
  const result = {} as Record<ApplicationStatus, JobApplication[]>;
  for (const status of COLUMN_KEYS) result[status] = [];
  for (const app of apps) {
    if (result[app.status]) result[app.status].push(app);
  }
  return result;
}

function KanbanSkeleton({ columns }: { columns: { status: ApplicationStatus; color: string }[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0 xl:grid-cols-6">
      {columns.map((col) => (
        <div
          key={col.status}
          className={`rounded-lg border ${col.color} min-h-[200px] w-64 shrink-0 lg:w-auto lg:shrink`}
        >
          <div className="border-b px-3 py-2">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-2 p-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
