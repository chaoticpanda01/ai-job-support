"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useApplications,
  useUpdateApplication,
  useDeleteApplication,
} from "@/hooks/useApplications";
import type { ApplicationStatus, JobApplication } from "@/types/api";

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const COLUMNS: { status: ApplicationStatus; label: string; color: string }[] = [
  { status: "planning",     label: "Planning",     color: "bg-slate-100  border-slate-300" },
  { status: "applied",      label: "Applied",      color: "bg-blue-50    border-blue-200"  },
  { status: "interviewing", label: "Interviewing", color: "bg-amber-50   border-amber-200" },
  { status: "offered",      label: "Offered",      color: "bg-green-50   border-green-200" },
  { status: "rejected",     label: "Rejected",     color: "bg-red-50     border-red-200"   },
  { status: "withdrawn",    label: "Withdrawn",    color: "bg-muted      border-border"    },
];

const STATUS_NEXT: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = {
  planning:     ["applied", "withdrawn"],
  applied:      ["interviewing", "rejected", "withdrawn"],
  interviewing: ["offered", "rejected", "withdrawn"],
  offered:      ["withdrawn"],
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ApplicationsPage() {
  const { data: apps, isLoading, error } = useApplications();

  const grouped = groupByStatus(apps ?? []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Application Tracker</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track your job applications through the hiring pipeline.
          </p>
        </div>
        <Link
          href="/dashboard/jobs"
          className="shrink-0 rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          ← Job board
        </Link>
      </div>

      {error && (
        <p className="text-sm text-destructive">Failed to load applications. Please refresh.</p>
      )}

      {isLoading ? (
        <KanbanSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.status}
              column={col}
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
  column,
  apps,
}: {
  column: (typeof COLUMNS)[number];
  apps: JobApplication[];
}) {
  return (
    <div className={`rounded-lg border ${column.color} flex flex-col min-h-[200px]`}>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide">{column.label}</p>
        <span className="rounded-full bg-background px-1.5 py-0.5 text-xs font-medium tabular-nums">
          {apps.length}
        </span>
      </div>

      <ul className="flex flex-1 flex-col gap-2 p-2">
        {apps.map((app) => (
          <ApplicationCard key={app.id} app={app} />
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

function ApplicationCard({ app }: { app: JobApplication }) {
  const [showMenu, setShowMenu] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(app.notes ?? "");

  const update = useUpdateApplication();
  const remove = useDeleteApplication();

  const nextStatuses = STATUS_NEXT[app.status] ?? [];

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
    <li className="relative rounded-md border bg-background p-3 shadow-sm text-sm space-y-1.5">
      {/* Job info */}
      <div>
        <Link
          href={`/dashboard/jobs/${app.job_posting_id}`}
          className="font-medium leading-snug hover:underline line-clamp-2"
        >
          {app.job_title ?? "Untitled posting"}
        </Link>
        {app.job_company && (
          <p className="text-xs text-muted-foreground">{app.job_company}</p>
        )}
      </div>

      {appliedDate && (
        <p className="text-xs text-muted-foreground">Applied {appliedDate}</p>
      )}

      {/* Notes */}
      {!editingNotes && app.notes && (
        <p className="text-xs text-muted-foreground line-clamp-2 italic">{app.notes}</p>
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
              Save
            </button>
            <button
              onClick={() => { setEditingNotes(false); setNotes(app.notes ?? ""); }}
              className="rounded border px-2 py-0.5 text-xs hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Actions row */}
      <div className="flex items-center gap-1 pt-0.5">
        {/* Move to next status buttons */}
        {nextStatuses.map((s) => (
          <button
            key={s}
            onClick={() => moveToStatus(s)}
            disabled={update.isPending}
            className="rounded border px-1.5 py-0.5 text-xs hover:bg-accent disabled:opacity-50 capitalize"
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
              if (confirm("Remove this application from the tracker?")) {
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
  for (const col of COLUMNS) result[col.status] = [];
  for (const app of apps) {
    if (result[app.status]) result[app.status].push(app);
  }
  return result;
}

function KanbanSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {COLUMNS.map((col) => (
        <div key={col.status} className={`rounded-lg border ${col.color} min-h-[200px]`}>
          <div className="border-b px-3 py-2">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          </div>
          <div className="p-2 space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
