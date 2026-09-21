import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, apiClient } from "@/lib/api-client";
import type { ResumeAnalysisStatus } from "@/types/api";

/**
 * `useResumeAnalysis` runs two queries and a small state machine on top of
 * them. react-query is mocked out entirely, so what is under test here is
 * this project's own policy -- when to keep polling, when a finished request
 * counts as still finishing -- and not react-query's scheduler, which is
 * react-query's to test.
 *
 * Unlike `useDocumentStatus`, this hook has real `useState`/`useEffect` of
 * its own, so it can only be called from inside a render: every test below
 * drives it through `renderHook` rather than calling it directly.
 */

interface QueryOptions {
  queryKey: unknown[];
  queryFn: () => Promise<unknown>;
  refetchInterval?: (query: {
    state: { status: string; data: ResumeAnalysisStatus | undefined };
  }) => number | false;
}

type QueryResult = Record<string, unknown>;

/** Which of the hook's two queries an options object belongs to. */
function roleOf(options: QueryOptions): "status" | "analysis" {
  return options.queryKey[2] === "analysis-status" ? "status" : "analysis";
}

const mock = vi.hoisted(() => ({
  results: { analysis: {} as QueryResult, status: {} as QueryResult },
  captured: {} as { analysis?: QueryOptions; status?: QueryOptions },
  /** Resolved when the hook's post-request invalidation settles. */
  invalidations: [] as unknown[][],
  cancellations: [] as unknown[][],
  writes: [] as Array<{ key: unknown[]; value: unknown }>,
  mutationOptions: null as {
    mutationFn: (vars: { resumeId: string; language: string }) => unknown;
    onSuccess: (data: unknown, vars: { resumeId: string }) => Promise<void>;
  } | null,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: QueryOptions) => {
    const role = roleOf(options);
    mock.captured[role] = options;
    return mock.results[role];
  },
  useMutation: (options: unknown) => {
    mock.mutationOptions = options as typeof mock.mutationOptions;
    return { mutate: () => {} };
  },
  useQueryClient: () => ({
    invalidateQueries: (args: { queryKey: unknown[] }) => {
      mock.invalidations.push(args.queryKey);
      return Promise.resolve();
    },
    cancelQueries: (args: { queryKey: unknown[] }) => {
      mock.cancellations.push(args.queryKey);
      return Promise.resolve();
    },
    setQueryData: (key: unknown[], value: unknown) => {
      mock.writes.push({ key, value });
    },
  }),
}));

const { useAnalyzeResume, useResumeAnalysis } = await import("@/hooks/useResumes");

/** A query that has loaded `data` and is otherwise quiet. */
function loaded(data: unknown): QueryResult {
  return { data, isLoading: false, error: null, errorUpdateCount: 0, isFetching: false };
}

const NO_ANALYSIS = loaded(null);

function statusOf(status: ResumeAnalysisStatus["status"]): QueryResult {
  return loaded({ status, error_code: null } satisfies ResumeAnalysisStatus);
}

beforeEach(() => {
  mock.results.analysis = NO_ANALYSIS;
  mock.results.status = statusOf("idle");
  mock.captured = {};
  mock.invalidations = [];
  mock.cancellations = [];
  mock.writes = [];
  mock.mutationOptions = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Render the hook and return the captured status-query options. */
function statusOptions(): QueryOptions {
  renderHook(() => useResumeAnalysis("r1"));
  const options = mock.captured.status;
  if (options === undefined) throw new Error("the status query was never registered");
  return options;
}

describe("useResumeAnalysis polling", () => {
  const interval = (
    options: QueryOptions,
    queryStatus: string,
    data: ResumeAnalysisStatus | undefined,
  ) => options.refetchInterval?.({ state: { status: queryStatus, data } });

  it("polls while a request is pending", () => {
    expect(interval(statusOptions(), "success", { status: "pending", error_code: null })).toBe(
      3000,
    );
  });

  it.each(["idle", "failed"] as const)("stops once the request is %s", (status) => {
    expect(interval(statusOptions(), "success", { status, error_code: null })).toBe(false);
  });

  it("stops polling an endpoint that is failing, pending or not", () => {
    // The page shows the failed check with a retry button instead. Without
    // this the hook would re-request every 3s for as long as the page is open.
    expect(interval(statusOptions(), "error", { status: "pending", error_code: null })).toBe(false);
  });
});

describe("useResumeAnalysis, when no analysis exists yet", () => {
  it("reads a missing analysis as no analysis, not as a failure", async () => {
    vi.spyOn(apiClient, "get").mockRejectedValue(new ApiClientError(404, "no analysis"));
    renderHook(() => useResumeAnalysis("r1"));
    const analysis = mock.captured.analysis;
    if (analysis === undefined) throw new Error("the analysis query was never registered");

    await expect(analysis.queryFn()).resolves.toBeNull();
  });

  it("still reports a real failure", async () => {
    const boom = new ApiClientError(500, "boom");
    vi.spyOn(apiClient, "get").mockRejectedValue(boom);
    renderHook(() => useResumeAnalysis("r1"));
    const analysis = mock.captured.analysis;
    if (analysis === undefined) throw new Error("the analysis query was never registered");

    await expect(analysis.queryFn()).rejects.toBe(boom);
  });
});

describe("useResumeAnalysis, a request that just ended", () => {
  it("is not finishing while the request is still pending", () => {
    mock.results.status = statusOf("pending");
    const { result } = renderHook(() => useResumeAnalysis("r1"));

    expect(result.current.finishing).toBe(false);
  });

  it("is finishing on the very render the request ends", () => {
    mock.results.status = statusOf("pending");
    const { result, rerender } = renderHook(() => useResumeAnalysis("r1"));

    // The page's empty state would flash between these two renders if the
    // transition were noticed in an effect instead of during the render.
    mock.results.status = statusOf("idle");
    rerender();

    expect(result.current.finishing).toBe(true);
  });

  it("re-fetches the analysis once, then stops finishing", async () => {
    mock.results.status = statusOf("pending");
    const { result, rerender } = renderHook(() => useResumeAnalysis("r1"));
    mock.results.status = statusOf("idle");

    await act(async () => {
      rerender();
    });

    expect(mock.invalidations).toEqual([["resumes", "r1", "analysis"]]);
    expect(result.current.finishing).toBe(false);
  });

  it("does not count a status that vanished as a request that ended", () => {
    // The status goes back to undefined when the query key changes -- moving
    // between two resume pages -- and the new resume's request has not
    // finished, so neither `finishing` nor the re-fetch belongs to it.
    mock.results.status = statusOf("pending");
    const { result, rerender } = renderHook(() => useResumeAnalysis("r1"));

    mock.results.status = loaded(undefined);
    rerender();

    expect(result.current.finishing).toBe(false);
    expect(mock.invalidations).toEqual([]);
  });

  it("does not treat a status that was never pending as one that just ended", () => {
    mock.results.status = statusOf("idle");
    const { result, rerender } = renderHook(() => useResumeAnalysis("r1"));

    mock.results.status = statusOf("failed");
    rerender();

    expect(result.current.finishing).toBe(false);
    expect(mock.invalidations).toEqual([]);
  });
});

describe("useAnalyzeResume", () => {
  it("marks the status pending so polling starts, and cancels any check in flight first", async () => {
    renderHook(() => useAnalyzeResume());
    const options = mock.mutationOptions;
    if (options === null) throw new Error("the mutation was never registered");

    await options.onSuccess({ task_id: "t1" }, { resumeId: "r1" });

    // A status fetch that read the row before this request would land after
    // it and overwrite pending, so it has to be cancelled before the write.
    expect(mock.cancellations).toEqual([["resumes", "r1", "analysis-status"]]);
    expect(mock.writes).toEqual([
      {
        key: ["resumes", "r1", "analysis-status"],
        value: { status: "pending", error_code: null },
      },
    ]);
  });
});
