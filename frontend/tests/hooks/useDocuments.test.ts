import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, apiClient } from "@/lib/api-client";

/**
 * The options object the hook hands useQuery, captured so its policy
 * functions can be called directly.
 *
 * This tests the policy — stop when the document is finished, stop when the
 * query has given up, never retry a document that isn't there — and not
 * react-query's scheduler, which is react-query's to test.
 *
 * `useDocumentStatus` is called below from plain functions, outside any
 * React render. That only works because `@tanstack/react-query` is mocked
 * out entirely (see the `vi.mock` below) -- there is no real hook machinery
 * underneath to violate the rules of hooks. If `useDocumentStatus` ever grew
 * its own `useState`/`useRef`/etc., these calls would break for a real
 * reason, not a mock bug.
 */
interface CapturedOptions {
  refetchInterval: (query: {
    state: { status: string; data: { status: string } | undefined };
  }) => number | false;
  retry: (failureCount: number, error: unknown) => boolean;
}

let captured: CapturedOptions | null = null;
let queryResult: Record<string, unknown> = {};
const invalidated: unknown[][] = [];

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: CapturedOptions) => {
    captured = options;
    return queryResult;
  },
  useMutation: () => ({}),
  useQueryClient: () => ({
    invalidateQueries: ({ queryKey }: { queryKey: unknown[] }) => {
      invalidated.push(queryKey);
      return Promise.resolve();
    },
  }),
}));

const { useDocumentStatus, useDocuments } = await import("@/hooks/useDocuments");

function optionsFor(): CapturedOptions {
  queryResult = {
    data: undefined,
    isLoading: false,
    error: null,
    errorUpdateCount: 0,
    isFetching: false,
    refetch: () => {},
  };
  // Not a real hook call: react-query is fully mocked (see the vi.mock
  // above), so this only ever reaches the mock's own body, never React's
  // hook machinery. Safe to call from a helper the rule doesn't recognize
  // as a hook.
  // eslint-disable-next-line react-hooks/rules-of-hooks
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

describe("useDocumentStatus refreshing the lists", () => {
  // The lists were last fetched when the job was created, still pending.
  // Home and the sidebar count a document only once it's completed, so
  // they'd go on showing it as missing unless the finished poll refreshes them.
  async function poll(status: string): Promise<unknown[][]> {
    invalidated.length = 0;
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({ id: "d1", status });
    optionsFor();
    await (captured as unknown as { queryFn: () => Promise<unknown> }).queryFn();
    get.mockRestore();
    return [...invalidated];
  }

  it.each(["completed", "failed"])(
    "refreshes every documents list once it's %s",
    async (status) => {
      expect(await poll(status)).toEqual([
        ["documents", "all"],
        ["documents", "rirekisho"],
        ["documents", "shokumukeirekisho"],
      ]);
    },
  );

  it.each(["pending", "processing"])("leaves the lists alone while it's %s", async (status) => {
    expect(await poll(status)).toEqual([]);
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

describe("useDocuments", () => {
  /** The URL the last useDocuments call's query fetches. */
  async function fetchedUrl(): Promise<string> {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({ items: [], total: 0 });
    await (captured as unknown as { queryFn: () => Promise<unknown> }).queryFn();
    const url = get.mock.calls[0]?.[0] as string;
    get.mockRestore();
    return url;
  }

  it("lists one page by default, as the documents page shows", async () => {
    useDocuments();
    expect(await fetchedUrl()).toBe("/documents");
    useDocuments("rirekisho");
    expect(await fetchedUrl()).toBe("/documents?type=rirekisho");
  });

  it("keeps a larger page in its own cache entry, apart from the documents page's", () => {
    const keyOf = () => (captured as unknown as { queryKey: unknown[] }).queryKey;
    useDocuments();
    const pageKey = keyOf();
    useDocuments(undefined, 100);
    const journeyKey = keyOf();
    expect(pageKey).toEqual(["documents", "all"]);
    expect(journeyKey).toEqual(["documents", "all", { limit: 100 }]);
  });

  it("asks for a larger page when told to", async () => {
    useDocuments(undefined, 100);
    expect(await fetchedUrl()).toBe("/documents?limit=100");
    useDocuments("rirekisho", 100);
    expect(await fetchedUrl()).toBe("/documents?type=rirekisho&limit=100");
  });
});
