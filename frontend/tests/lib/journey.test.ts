import { describe, expect, it } from "vitest";
import { computeJourney, pickPrimaryResume, type JourneyInput, type StepId } from "@/lib/journey";
import type {
  Document,
  InterviewSession,
  JobApplication,
  MeResponse,
  Resume,
  ResumeAnalysis,
  VisaConsultationListItem,
} from "@/types/api";

// Only the fields the journey reads; the casts keep fixtures readable.
const resume = (id: string, created_at: string, is_primary = false) =>
  ({ id, created_at, is_primary }) as Resume;
const doc = (document_type: Document["document_type"], status: Document["status"]) =>
  ({ id: `${document_type}-${status}`, document_type, status }) as Document;
const session = (status: InterviewSession["status"]) =>
  ({ id: `s-${status}`, status }) as InterviewSession;
const ANALYSIS = { id: "a1", created_at: "2026-09-02T00:00:00+00:00" } as ResumeAnalysis;

/** A brand-new user: everything loaded, nothing done. */
const NEW_USER: JourneyInput = {
  me: { rirekisho_ready: false } as MeResponse,
  resumes: [],
  primaryAnalysis: null,
  documents: [],
  applications: [],
  interviewSessions: [],
  visaConsultations: [],
};

/** A user who has done every step. */
const FINISHED: JourneyInput = {
  me: { rirekisho_ready: true } as MeResponse,
  resumes: [resume("r1", "2026-09-01T00:00:00+00:00", true)],
  primaryAnalysis: ANALYSIS,
  documents: [doc("rirekisho", "completed"), doc("shokumukeirekisho", "completed")],
  applications: [{ id: "app1", status: "applied", applied_at: null } as JobApplication],
  interviewSessions: [session("completed")],
  visaConsultations: [{ id: "v1" } as VisaConsultationListItem],
};

function stepOf(input: JourneyInput, id: StepId) {
  const step = computeJourney(input)
    .stages.flatMap((s) => s.steps)
    .find((s) => s.id === id);
  if (!step) throw new Error(`no step ${id}`);
  return step;
}

function stateOf(input: JourneyInput, id: StepId) {
  return stepOf(input, id).state;
}

describe("computeJourney: what counts as done", () => {
  it.each<[StepId, Partial<JourneyInput>]>([
    ["profile", { me: { rirekisho_ready: true } as MeResponse }],
    ["resumeUploaded", { resumes: [resume("r1", "2026-09-01T00:00:00+00:00")] }],
    [
      "resumeAnalysed",
      { resumes: [resume("r1", "2026-09-01T00:00:00+00:00")], primaryAnalysis: ANALYSIS },
    ],
    ["rirekisho", { documents: [doc("rirekisho", "completed")] }],
    ["shokumu", { documents: [doc("shokumukeirekisho", "completed")] }],
    [
      "application",
      { applications: [{ id: "app1", status: "applied", applied_at: null } as JobApplication] },
    ],
    ["interview", { interviewSessions: [session("completed")] }],
    ["visa", { visaConsultations: [{ id: "v1" } as VisaConsultationListItem] }],
  ])("%s is done with its evidence and to do without it", (id, evidence) => {
    expect(stateOf(NEW_USER, id)).toBe("todo");
    expect(stateOf({ ...NEW_USER, ...evidence }, id)).toBe("done");
  });

  it("doesn't count saving or preparing a job as applying", () => {
    const saved = [
      { id: "a1", status: "planning", applied_at: null },
      { id: "a2", status: "preparing", applied_at: null },
      { id: "a3", status: "skipped", applied_at: null },
    ] as JobApplication[];
    expect(stateOf({ ...NEW_USER, applications: saved }, "application")).toBe("todo");
  });

  it("counts a job closed after applying", () => {
    const closed = [
      { id: "a1", status: "rejected", applied_at: "2026-09-10T00:00:00Z" },
    ] as JobApplication[];
    expect(stateOf({ ...NEW_USER, applications: closed }, "application")).toBe("done");
  });

  it("does not count a document that is still generating or failed", () => {
    const input = {
      ...NEW_USER,
      documents: [doc("rirekisho", "processing"), doc("rirekisho", "failed")],
    };
    expect(stateOf(input, "rirekisho")).toBe("todo");
  });

  it("does not count a rirekisho as a shokumu keirekisho", () => {
    expect(stateOf({ ...NEW_USER, documents: [doc("rirekisho", "completed")] }, "shokumu")).toBe(
      "todo",
    );
  });

  it("does not count an abandoned or unfinished interview", () => {
    const input = { ...NEW_USER, interviewSessions: [session("abandoned"), session("active")] };
    expect(stateOf(input, "interview")).toBe("todo");
  });

  it("treats a resume without an analysis as not analysed", () => {
    const input = {
      ...NEW_USER,
      resumes: [resume("r1", "2026-09-01T00:00:00+00:00")],
      primaryAnalysis: null,
    };
    expect(stateOf(input, "resumeAnalysed")).toBe("todo");
  });
});

describe("computeJourney: sources that failed to load", () => {
  it.each<[keyof JourneyInput, StepId[]]>([
    ["me", ["profile"]],
    ["resumes", ["resumeUploaded", "resumeAnalysed"]],
    ["documents", ["rirekisho", "shokumu"]],
    ["applications", ["application"]],
    ["interviewSessions", ["interview"]],
    ["visaConsultations", ["visa"]],
  ])("an unloaded %s makes %j unknown", (source, steps) => {
    const input = { ...FINISHED, [source]: undefined };
    for (const id of steps) expect(stateOf(input, id)).toBe("unknown");
  });

  it("makes the analysis step unknown when the analysis failed to load", () => {
    expect(stateOf({ ...FINISHED, primaryAnalysis: undefined }, "resumeAnalysed")).toBe("unknown");
  });

  it("never counts an unknown step as done", () => {
    const journey = computeJourney({ ...FINISHED, documents: undefined });
    expect(journey.doneCount).toBe(6);
    expect(journey.allDone).toBe(false);
  });

  it("never picks an unknown step as the next step", () => {
    const journey = computeJourney({ ...NEW_USER, me: undefined });
    expect(journey.next?.id).toBe("resumeUploaded");
  });

  it("flags a stage with an unknown step, so its count isn't shown wrong", () => {
    const stages = computeJourney({ ...FINISHED, documents: undefined }).stages;
    expect(stages.map((s) => [s.id, s.hasUnknown])).toEqual([
      ["prepare", true],
      ["apply", false],
      ["settleIn", false],
    ]);
  });
});

describe("computeJourney: next step and totals", () => {
  it("suggests the first unfinished step in journey order", () => {
    const input = {
      ...NEW_USER,
      me: { rirekisho_ready: true } as MeResponse,
      visaConsultations: [{ id: "v1" } as VisaConsultationListItem],
    };
    expect(computeJourney(input).next?.id).toBe("resumeUploaded");
  });

  it("counts done steps per stage and overall", () => {
    // Apply is half done: a stage is complete only when every step is.
    const journey = computeJourney({ ...FINISHED, interviewSessions: [], visaConsultations: [] });
    expect(journey.stages.map((s) => [s.id, s.done, s.total, s.complete])).toEqual([
      ["prepare", 5, 5, true],
      ["apply", 1, 2, false],
      ["settleIn", 0, 1, false],
    ]);
    expect([journey.doneCount, journey.total]).toEqual([6, 8]);
    expect(journey.next?.id).toBe("interview");
  });

  it("is all done only when all eight steps are done", () => {
    const journey = computeJourney(FINISHED);
    expect(journey.allDone).toBe(true);
    expect(journey.next).toBeNull();
    expect(computeJourney({ ...FINISHED, visaConsultations: [] }).allDone).toBe(false);
  });

  it("has no next step when everything left is unknown", () => {
    const journey = computeJourney({ ...FINISHED, visaConsultations: undefined });
    expect(journey.next).toBeNull();
    expect(journey.allDone).toBe(false);
  });
});

describe("primary resume", () => {
  const older = resume("old", "2026-08-01T00:00:00+00:00");
  const newer = resume("new", "2026-09-01T00:00:00+00:00");

  it("is the one marked primary", () => {
    const marked = resume("marked", "2026-07-01T00:00:00+00:00", true);
    expect(pickPrimaryResume([newer, marked, older])?.id).toBe("marked");
  });

  it("is the newest when none is marked", () => {
    expect(pickPrimaryResume([older, newer])?.id).toBe("new");
  });

  it("is where the analysis step links", () => {
    const step = stepOf({ ...NEW_USER, resumes: [older, newer] }, "resumeAnalysed");
    expect(step.href).toBe("/dashboard/resumes/new");
  });

  it("links the analysis step to the resume list when there is no resume", () => {
    expect(stepOf(NEW_USER, "resumeAnalysed").href).toBe("/dashboard/resumes");
  });
});
