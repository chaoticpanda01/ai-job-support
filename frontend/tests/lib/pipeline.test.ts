import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LANGUAGES, t } from "@/lib/i18n";
import {
  ARCHIVED_STATUSES,
  FORWARD_STAGES,
  MOVE_LABEL,
  STAGE_LABEL,
  TRANSITIONS,
  confirmKey,
  forwardCounts,
  hasApplied,
  movesFor,
  moveLabel,
  reopenTarget,
  splitMoves,
  stageAction,
  tailoredDocuments,
} from "@/lib/pipeline";
import type { Document, JobApplication, JobPosting } from "@/types/api";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "backend",
  "tests",
  "fixtures",
  "application_transitions.json",
);

const JOB = {
  id: "job-1",
  translated_title: "Backend Engineer",
  original_title: "バックエンドエンジニア",
  original_company: "株式会社テスト",
  structured_data: { company_name: "Test K.K." },
} as JobPosting;

function app(over: Partial<JobApplication>): JobApplication {
  return {
    id: "a1",
    user_id: "u1",
    job_posting_id: "job-1",
    status: "planning",
    applied_at: null,
    notes: null,
    closed_from: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    job_title: "Backend Engineer",
    job_company: "Test K.K.",
    ...over,
  };
}

describe("the transition table", () => {
  it("matches the backend's, through the shared fixture", () => {
    const expected = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, string[]>;
    const actual = Object.fromEntries(
      Object.entries(TRANSITIONS).map(([status, moves]) => [status, [...moves].sort()]),
    );
    expect(actual).toEqual(expected);
  });

  it("splits the stages into the board's columns and the archive", () => {
    expect([...FORWARD_STAGES, ...ARCHIVED_STATUSES].sort()).toEqual(
      Object.keys(TRANSITIONS).sort(),
    );
  });
});

describe("reopening", () => {
  it("returns a job to the stage it left", () => {
    expect(reopenTarget(app({ closed_from: "interviewing", applied_at: null }))).toBe(
      "interviewing",
    );
  });

  it.each([
    ["2026-09-01T00:00:00Z", "applied"],
    [null, "planning"],
  ] as const)("falls back when closed_from is missing (applied_at %s)", (applied_at, target) => {
    expect(reopenTarget(app({ closed_from: null, applied_at }))).toBe(target);
  });

  it("is the only move an archived job has", () => {
    expect(movesFor(app({ status: "rejected", closed_from: "applied" }))).toEqual(["applied"]);
  });
});

describe("splitting a stage's moves into buttons", () => {
  it("has no back move from Saved", () => {
    expect(splitMoves("planning")).toEqual({
      next: "preparing",
      back: null,
      others: ["applied", "skipped"],
    });
  });

  it("puts the next stage first and the previous one last", () => {
    expect(splitMoves("applied")).toEqual({
      next: "interviewing",
      back: "preparing",
      others: ["rejected", "withdrawn"],
    });
  });

  it("has no next stage after Accepted", () => {
    expect(splitMoves("accepted")).toEqual({ next: null, back: "offered", others: ["withdrawn"] });
  });
});

describe("move labels", () => {
  it("names a back move after its stage", () => {
    expect(moveLabel("applied", "preparing", "en")).toBe("Back to Preparing");
  });

  it("names a reopen after its target", () => {
    expect(moveLabel("rejected", "interviewing", "en")).toBe("Reopen at Interviewing");
  });

  it("calls withdrawing from an offer declining it", () => {
    expect(moveLabel("offered", "withdrawn", "en")).toBe("Decline offer");
    expect(moveLabel("applied", "withdrawn", "en")).toBe("Withdraw");
  });

  it("asks before skipping, withdrawing or declining, and only then", () => {
    expect(confirmKey("planning", "skipped")).toBe("confirmSkip");
    expect(confirmKey("applied", "withdrawn")).toBe("confirmWithdraw");
    expect(confirmKey("offered", "withdrawn")).toBe("confirmDecline");
    expect(confirmKey("applied", "rejected")).toBeNull();
    expect(confirmKey("planning", "preparing")).toBeNull();
  });
});

describe("each stage's next action", () => {
  it("links Preparing to both tailored documents and the gaps", () => {
    const { lineKey, links } = stageAction("preparing", JOB);
    expect(lineKey).toBe("nextPreparing");
    expect(links.map((l) => l.href)).toEqual([
      "/dashboard/documents/rirekisho/new?job=job-1",
      "/dashboard/documents/shokumu/new?job=job-1",
      "/dashboard/jobs/job-1#match",
    ]);
    expect(links.map((l) => l.documentType)).toEqual(["rirekisho", "shokumukeirekisho", undefined]);
  });

  it("pre-fills interview practice with the role and company, encoded", () => {
    const [link] = stageAction("interviewing", JOB).links;
    expect(link?.href).toBe("/dashboard/interview/new?role=Backend+Engineer&company=Test+K.K.");
  });

  it("leaves out what the job doesn't say", () => {
    const bare = {
      ...JOB,
      translated_title: null,
      original_title: null,
      original_company: null,
      structured_data: null,
    } as JobPosting;
    expect(stageAction("interviewing", bare).links[0]?.href).toBe("/dashboard/interview/new");
  });

  it("falls back to the original company when nothing was extracted", () => {
    const href = stageAction("interviewing", { ...JOB, structured_data: null }).links[0]?.href;
    expect(href).toContain(
      "company=%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BE%E3%83%86%E3%82%B9%E3%83%88",
    );
  });

  it("has no links while waiting to hear back", () => {
    expect(stageAction("applied", JOB).links).toEqual([]);
  });
});

describe("documents made for a job", () => {
  const doc = (over: Partial<Document>) =>
    ({
      document_type: "rirekisho",
      status: "completed",
      job_context: { job_posting_id: "job-1" },
      ...over,
    }) as Document;

  it("counts only finished documents made for this job", () => {
    const made = tailoredDocuments(
      [
        doc({}),
        doc({ document_type: "shokumukeirekisho", status: "pending" }),
        doc({ document_type: "shokumukeirekisho", job_context: { job_posting_id: "job-2" } }),
        doc({ document_type: "shokumukeirekisho", job_context: { job_posting_id: 7 } }),
        doc({ document_type: "shokumukeirekisho", job_context: null }),
      ],
      "job-1",
    );
    expect([...made]).toEqual(["rirekisho"]);
  });
});

describe("having applied", () => {
  it.each([
    [{ status: "planning", applied_at: null }, false],
    [{ status: "preparing", applied_at: null }, false],
    [{ status: "skipped", applied_at: null }, false],
    [{ status: "applied", applied_at: null }, true],
    [{ status: "accepted", applied_at: null }, true],
    [{ status: "rejected", applied_at: "2026-09-01T00:00:00Z" }, true],
    [{ status: "withdrawn", applied_at: null }, false],
  ] as const)("%o → %s", (over, expected) => {
    expect(hasApplied(app(over))).toBe(expected);
  });
});

describe("counting the pipeline", () => {
  it("counts each forward stage that has jobs, in stage order", () => {
    const counts = forwardCounts([
      app({ id: "1", status: "applied" }),
      app({ id: "2", status: "planning" }),
      app({ id: "3", status: "planning" }),
      app({ id: "4", status: "rejected" }),
    ]);
    expect(counts).toEqual([
      { status: "planning", count: 2 },
      { status: "applied", count: 1 },
    ]);
  });
});

describe("the strings it looks up", () => {
  // t() falls back to printing the key, so a typo would ship on screen.
  const keys = [
    ...Object.values(STAGE_LABEL),
    ...Object.values(MOVE_LABEL),
    ...FORWARD_STAGES.flatMap((stage) => {
      const action = stageAction(stage, JOB);
      return [action.lineKey, ...action.links.map((l) => l.labelKey)];
    }),
    "backTo",
    "reopenAt",
    "moveDecline",
    "confirmSkip",
    "confirmWithdraw",
    "confirmDecline",
  ];

  it.each(LANGUAGES.map((l) => l.code))("has every one of them in %s", (lang) => {
    expect(keys.filter((key) => t("jobs", key, lang) === key)).toEqual([]);
  });
});
