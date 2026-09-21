import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api-client";

/**
 * The options object the hook hands useQuery, captured so its policy
 * functions can be called directly.
 *
 * This tests the policy — stop when the document is finished, stop when the
 * query has given up, never retry a document that isn't there — and not
 * react-query's scheduler, which is react-query's to test.
 */
interface CapturedOptions {
  refetchInterval: (query: {
    state: { status: string; data: { status: string } | undefined };
  }) => number | false;
  retry: (failureCount: number, error: unknown) => boolean;
}

let captured: CapturedOptions | null = null;
let queryResult: Record<string, unknown> = {};

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: CapturedOptions) => {
    captured = options;
    return queryResult;
  },
  useMutation: () => ({}),
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}));

const { useDocumentStatus } = await import("@/hooks/useDocuments");

function optionsFor(): CapturedOptions {
  queryResult = {
    data: undefined,
    isLoading: false,
    error: null,
    errorUpdateCount: 0,
    isFetching: false,
    refetch: () => {},
  };
  useDocumentStatus("d1");
  if (captured === null) throw new Error("useQuery was never called");
  return captured;
}

describe("useDocumentStatus polling", () => {
  let options: CapturedOptions;

  beforeEach(() => {
    options = optionsFor();
  });

  const interval = (status: string, data?: { status: string }) =>
    options.refetchInterval({ state: { status, data } });

  it.each(["pending", "processing"])("keeps polling while a document is %s", (docStatus) => {
    expect(interval("success", { status: docStatus })).toBe(3000);
  });

  it.each(["completed", "failed"])("stops once a document is %s", (docStatus) => {
    expect(interval("success", { status: docStatus })).toBe(false);
  });

  it("stops when nothing ever loaded and the query gave up", () => {
    expect(interval("error", undefined)).toBe(false);
  });

  it("does not retry a document that isn't there", () => {
    expect(options.retry(0, new ApiClientError(404, "gone"))).toBe(false);
    expect(options.retry(0, new ApiClientError(422, "bad uuid"))).toBe(false);
  });

  it("retries a server error, but not forever", () => {
    expect(options.retry(0, new ApiClientError(500, "boom"))).toBe(true);
    expect(options.retry(2, new ApiClientError(500, "boom"))).toBe(false);
  });
});

describe("useDocumentStatus error reporting", () => {
  it("calls a first-load failure a load error", () => {
    const error = new ApiClientError(500, "boom");
    queryResult = {
      data: undefined,
      isLoading: false,
      error,
      errorUpdateCount: 1,
      isFetching: false,
      refetch: () => {},
    };
    const result = useDocumentStatus("d1");

    expect(result.loadError).toBe(error);
    expect(result.pollError).toBeNull();
  });

  it("calls a failure after the document loaded a poll error", () => {
    const error = new ApiClientError(500, "boom");
    queryResult = {
      data: { status: "processing" },
      isLoading: false,
      error,
      errorUpdateCount: 1,
      isFetching: false,
      refetch: () => {},
    };
    const result = useDocumentStatus("d1");

    expect(result.pollError).toBe(error);
    expect(result.loadError).toBeNull();
  });
});
