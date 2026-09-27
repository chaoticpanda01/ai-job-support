import type { Route } from "next";
import { t, type Language } from "@/lib/i18n";
import type { Tone } from "@/lib/tones";
import type {
  ApplicationStatus,
  Document,
  DocumentType,
  JobApplication,
  JobPosting,
} from "@/types/api";

/**
 * The job pipeline: where each tracked job is and where it can go next.
 * Plain logic, like lib/journey.ts. The backend enforces the same table
 * (APPLICATION_TRANSITIONS in backend/app/models/enums.py); both are pinned
 * to backend/tests/fixtures/application_transitions.json.
 */

/** The board's columns, in order. */
export const FORWARD_STAGES = [
  "planning",
  "preparing",
  "applied",
  "interviewing",
  "offered",
  "accepted",
] as const satisfies readonly ApplicationStatus[];
export type ForwardStatus = (typeof FORWARD_STAGES)[number];

/** Listed under the board, not in a column. */
export const ARCHIVED_STATUSES = [
  "rejected",
  "withdrawn",
  "skipped",
] as const satisfies readonly ApplicationStatus[];

export function isForward(status: ApplicationStatus): status is ForwardStatus {
  return (FORWARD_STAGES as readonly ApplicationStatus[]).includes(status);
}

/**
 * Every move a job can make. Each forward stage can also go back one step, to
 * undo a mis-click. An archived job only reopens (see movesFor).
 */
export const TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  planning: ["preparing", "applied", "skipped"],
  preparing: ["applied", "withdrawn", "planning"],
  applied: ["interviewing", "rejected", "withdrawn", "preparing"],
  interviewing: ["offered", "rejected", "withdrawn", "applied"],
  offered: ["accepted", "withdrawn", "interviewing"],
  accepted: ["withdrawn", "offered"],
  rejected: [],
  withdrawn: [],
  skipped: [],
};

/**
 * Where an archived job goes back to: the stage it left. Jobs archived before
 * closed_from existed have none, so they return to Applied if the user had
 * applied, and to Saved otherwise.
 */
export function reopenTarget(app: Pick<JobApplication, "closed_from" | "applied_at">) {
  return app.closed_from ?? (app.applied_at ? "applied" : "planning");
}

export function movesFor(
  app: Pick<JobApplication, "status" | "closed_from" | "applied_at">,
): ApplicationStatus[] {
  return isForward(app.status) ? [...TRANSITIONS[app.status]] : [reopenTarget(app)];
}

/** A forward stage's moves, sorted into the stage panel's three kinds of button. */
export function splitMoves(status: ForwardStatus): {
  next: ApplicationStatus | null;
  back: ApplicationStatus | null;
  others: ApplicationStatus[];
} {
  const index = FORWARD_STAGES.indexOf(status);
  const moves = TRANSITIONS[status];
  const nextStage = FORWARD_STAGES[index + 1];
  const backStage = index > 0 ? FORWARD_STAGES[index - 1] : undefined;
  const next = nextStage !== undefined && moves.includes(nextStage) ? nextStage : null;
  const back = backStage !== undefined && moves.includes(backStage) ? backStage : null;
  return { next, back, others: moves.filter((move) => move !== next && move !== back) };
}

/** i18n keys (jobs section). */
export const STAGE_LABEL: Record<ApplicationStatus, string> = {
  planning: "stagePlanning",
  preparing: "stagePreparing",
  applied: "stageApplied",
  interviewing: "stageInterviewing",
  offered: "stageOffered",
  accepted: "stageAccepted",
  rejected: "stageRejected",
  withdrawn: "stageWithdrawn",
  skipped: "stageSkipped",
};

export const STAGE_TONE: Record<ApplicationStatus, Tone> = {
  planning: "neutral",
  preparing: "neutral",
  applied: "info",
  interviewing: "info",
  offered: "warning",
  accepted: "success",
  rejected: "danger",
  withdrawn: "neutral",
  skipped: "neutral",
};

export function stageName(status: ApplicationStatus, lang: Language): string {
  return t("jobs", STAGE_LABEL[status], lang);
}

/** The label of a forward move, keyed by where it goes (i18n keys, jobs section). */
export const MOVE_LABEL: Record<ApplicationStatus, string> = {
  // Only ever a back move, which moveLabel names after its stage.
  planning: "stagePlanning",
  preparing: "moveStartPreparing",
  applied: "moveApplied",
  interviewing: "moveInterviewing",
  offered: "moveOffered",
  accepted: "moveAccepted",
  rejected: "moveRejected",
  withdrawn: "moveWithdraw",
  skipped: "moveSkip",
};

export function moveLabel(from: ApplicationStatus, to: ApplicationStatus, lang: Language) {
  if (!isForward(from)) {
    return t("jobs", "reopenAt", lang).replace("{stage}", stageName(to, lang));
  }
  if (isForward(to) && FORWARD_STAGES.indexOf(to) < FORWARD_STAGES.indexOf(from)) {
    return t("jobs", "backTo", lang).replace("{stage}", stageName(to, lang));
  }
  if (from === "offered" && to === "withdrawn") return t("jobs", "moveDecline", lang);
  return t("jobs", MOVE_LABEL[to], lang);
}

/** The confirmation title for a move that ends the job's run, or null for one that doesn't. */
export function confirmKey(from: ApplicationStatus, to: ApplicationStatus): string | null {
  if (to === "skipped") return "confirmSkip";
  if (to === "withdrawn") return from === "offered" ? "confirmDecline" : "confirmWithdraw";
  return null;
}

export interface StageLink {
  labelKey: string;
  href: Route;
  /** Set on a tailored-document link, so the panel can mark one already made. */
  documentType?: DocumentType;
}

export function jobTitle(job: Pick<JobPosting, "translated_title" | "original_title">) {
  return job.translated_title ?? job.original_title;
}

/** What to do at a stage, and where to do it, pre-filled from the job. */
export function stageAction(
  status: ForwardStatus,
  job: JobPosting,
): { lineKey: string; links: StageLink[] } {
  const match = `/dashboard/jobs/${job.id}#match` as Route;
  switch (status) {
    case "planning":
      return { lineKey: "nextPlanning", links: [{ labelKey: "actionSeeMatch", href: match }] };
    case "preparing":
      return {
        lineKey: "nextPreparing",
        links: [
          {
            labelKey: "generateRirekishoForJob",
            href: `/dashboard/documents/rirekisho/new?job=${job.id}` as Route,
            documentType: "rirekisho",
          },
          {
            labelKey: "generateShokumuForJob",
            href: `/dashboard/documents/shokumu/new?job=${job.id}` as Route,
            documentType: "shokumukeirekisho",
          },
          { labelKey: "actionSeeGaps", href: match },
        ],
      };
    case "applied":
      return { lineKey: "nextApplied", links: [] };
    case "interviewing": {
      const params = new URLSearchParams();
      const role = jobTitle(job);
      const company = job.structured_data?.company_name || job.original_company;
      if (role) params.set("role", role);
      if (company) params.set("company", company);
      const query = params.toString();
      return {
        lineKey: "nextInterviewing",
        links: [
          {
            labelKey: "actionPractise",
            href: `/dashboard/interview/new${query ? `?${query}` : ""}` as Route,
          },
        ],
      };
    }
    case "offered":
      return {
        lineKey: "nextOffered",
        links: [{ labelKey: "actionVisa", href: "/dashboard/visa" }],
      };
    case "accepted":
      return {
        lineKey: "nextAccepted",
        links: [
          { labelKey: "actionVisa", href: "/dashboard/visa" },
          { labelKey: "actionCulture", href: "/dashboard/culture" },
        ],
      };
  }
}

/** The document types already generated, successfully, for this job. */
export function tailoredDocuments(
  documents: readonly Document[],
  jobId: string,
): Set<DocumentType> {
  const made = new Set<DocumentType>();
  for (const doc of documents) {
    const target = doc.job_context?.["job_posting_id"];
    if (doc.status === "completed" && typeof target === "string" && target === jobId) {
      made.add(doc.document_type);
    }
  }
  return made;
}

const APPLIED_OR_LATER: readonly ApplicationStatus[] = [
  "applied",
  "interviewing",
  "offered",
  "accepted",
];

/** Whether the user applied for this job: saving or preparing is not applying. */
export function hasApplied(app: Pick<JobApplication, "status" | "applied_at">): boolean {
  return app.applied_at !== null || APPLIED_OR_LATER.includes(app.status);
}

/** How many jobs sit in each forward stage, leaving out empty ones, in stage order. */
export function forwardCounts(
  apps: readonly JobApplication[],
): { status: ForwardStatus; count: number }[] {
  return FORWARD_STAGES.map((status) => ({
    status,
    count: apps.filter((a) => a.status === status).length,
  })).filter(({ count }) => count > 0);
}
