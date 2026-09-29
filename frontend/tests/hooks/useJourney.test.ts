import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Resume } from "@/types/api";

/**
 * The data hooks are mocked: what's under test is how their loading, error
 * and 404 states become journey inputs, and which queries a retry refreshes.
 * The journey rules themselves are tested in tests/lib/journey.test.ts.
 */

type Q = {
  data?: unknown;
  error?: unknown;
  isLoading?: boolean;
  isFetching?: boolean;
  errorUpdateCount?: number;
};
const q = vi.hoisted(() => ({
  me: {} as Q,
  resumes: {} as Q,
  analysis: {} as Q,
  analysisResumeIds: [] as string[],
  documents: {} as Q,
  documentArgs: [] as unknown[][],
  interviewArgs: [] as unknown[][],
  applications: {} as Q,
  interviews: {} as Q,
  visa: {} as Q,
  invalidated: [] as unknown[][],
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: ({ queryKey }: { queryKey: unknown[] }) => {
      q.invalidated.push(queryKey);
      return Promise.resolve();
    },
  }),
}));
vi.mock("@/hooks/useMe", () => ({ useMe: () => q.me }));
vi.mock("@/hooks/useResumes", () => ({
  useResumes: () => q.resumes,
  useResumeAnalysis: (id: string) => {
    q.analysisResumeIds.push(id);
    return q.analysis;
  },
}));
vi.mock("@/hooks/useDocuments", () => ({
  useDocuments: (...args: unknown[]) => {
    q.documentArgs.push(args);
    return q.documents;
  },
}));
vi.mock("@/hooks/useApplications", () => ({ useApplications: () => q.applications }));
vi.mock("@/hooks/useInterview", () => ({
  useInterviewSessions: (...args: unknown[]) => {
    q.interviewArgs.push(args);
    return q.interviews;
  },
}));
vi.mock("@/hooks/useVisa", () => ({ useVisaConsultations: () => q.visa }));

const { useJourney } = await import("@/hooks/useJourney");

const loaded = (data: unknown): Q => ({ data, error: null, isLoading: false });
const failed: Q = { data: undefined, error: new Error("down"), isLoading: false };
const loading: Q = { data: undefined, error: null, isLoading: true, errorUpdateCount: 0 };
/**
 * A source that failed, now being retried. React Query resets a query with no
 * data to pending and clears its error on every refetch; only errorUpdateCount
 * remembers that it failed.
 */
const retrying: Q = { data: undefined, error: null, isLoading: true, errorUpdateCount: 1 };

const RESUMES = [
  { id: "old", created_at: "2026-08-01T00:00:00+00:00", is_primary: true },
  { id: "new", created_at: "2026-09-01T00:00:00+00:00", is_primary: false },
] as Resume[];

beforeEach(() => {
  q.me = loaded({ rirekisho_ready: true });
  q.resumes = loaded({ items: RESUMES, total: 2 });
  q.analysis = loaded(null);
  q.analysisResumeIds = [];
  q.documents = loaded({ items: [], total: 0 });
  q.documentArgs = [];
  q.interviewArgs = [];
  q.applications = loaded([]);
  q.interviews = loaded([]);
  q.visa = loaded([]);
  q.invalidated = [];
});

function stepState(id: string) {
  const { result } = renderHook(() => useJourney());
  return result.current.journey.stages.flatMap((s) => s.steps).find((s) => s.id === id)?.state;
}

describe("useJourney", () => {
  it("asks for the analysis of the primary resume", () => {
    renderHook(() => useJourney());
    expect(q.analysisResumeIds.at(-1)).toBe("old");
  });

  it("reads a missing analysis (the hook's 404) as not analysed yet", () => {
    q.analysis = loaded(null);
    expect(stepState("resumeAnalysed")).toBe("todo");
  });

  it("reads a failed analysis request as unknown", () => {
    q.analysis = failed;
    expect(stepState("resumeAnalysed")).toBe("unknown");
  });

  it("reads a failed source as unknown", () => {
    q.documents = failed;
    expect(stepState("rirekisho")).toBe("unknown");
    expect(stepState("shokumu")).toBe("unknown");
  });

  it("unwraps the paged lists", () => {
    q.documents = loaded({
      items: [{ id: "d1", document_type: "rirekisho", status: "completed" }],
      total: 1,
    });
    expect(stepState("rirekisho")).toBe("done");
    expect(stepState("resumeUploaded")).toBe("done");
  });

  it.each([
    "me",
    "resumes",
    "analysis",
    "documents",
    "applications",
    "interviews",
    "visa",
  ] as const)("is loading while %s loads", (source) => {
    q[source] = loading;
    const { result } = renderHook(() => useJourney());
    expect(result.current.isLoading).toBe(true);
  });

  it("keeps a failed source unknown while it is retried, instead of loading again", () => {
    q.documents = retrying;
    const { result } = renderHook(() => useJourney());
    expect(result.current.isLoading).toBe(false);
    expect(stepState("rirekisho")).toBe("unknown");
  });

  it("keeps a failed analysis unknown while it is retried, never 'not analysed'", () => {
    q.analysis = retrying;
    const { result } = renderHook(() => useJourney());
    expect(result.current.isLoading).toBe(false);
    expect(stepState("resumeAnalysed")).toBe("unknown");
  });

  it("asks for the largest page of documents", () => {
    // One page is 20, newest first: a user with 20 newer documents (failed
    // attempts included) would lose their finished 履歴書 off the end and be
    // told to make it again. 100 is the backend's maximum.
    renderHook(() => useJourney());
    expect(q.documentArgs.at(-1)).toEqual([undefined, 100]);
  });

  it("asks for the largest page of interview sessions too", () => {
    renderHook(() => useJourney());
    expect(q.interviewArgs.at(-1)).toEqual([100]);
  });

  it("says which steps are being checked again", () => {
    q.documents = { ...retrying, isFetching: true };
    const { result } = renderHook(() => useJourney());
    expect(result.current.retrying("rirekisho")).toBe(true);
    expect(result.current.retrying("shokumu")).toBe(true);
    expect(result.current.retrying("visa")).toBe(false);
  });

  it("is not loading once everything has settled, failures included", () => {
    q.visa = failed;
    const { result } = renderHook(() => useJourney());
    expect(result.current.isLoading).toBe(false);
  });

  it.each([
    ["profile", ["me"]],
    ["resumeAnalysed", ["resumes"]],
    ["shokumu", ["documents"]],
    ["application", ["jobs", "applications"]],
    ["interview", ["interview", "sessions"]],
    ["visa", ["visa", "consultations"]],
  ] as const)("retrying %s refreshes the queries behind it", (step, key) => {
    const { result } = renderHook(() => useJourney());
    result.current.retry(step);
    expect(q.invalidated).toEqual([key]);
  });
});
