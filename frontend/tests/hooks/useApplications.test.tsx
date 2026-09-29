import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { useCreateApplication, useUpdateApplication } from "@/hooks/useApplications";
import type { JobApplication } from "@/types/api";

const KEY = ["jobs", "applications", "all"];
const APP = { id: "a1", status: "planning", notes: null } as JobApplication;

function setup(app: JobApplication = APP) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(KEY, [app]);
  const { result } = renderHook(() => useUpdateApplication(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  const cached = () => client.getQueryData<JobApplication[]>(KEY)?.[0];
  const status = () => cached()?.status;
  return { result, status, cached };
}

/** Several applications in the cache and a PATCH the test settles by hand, in call order. */
function setupMany(apps: JobApplication[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(KEY, apps);
  const settle: Array<{ ok: (app: JobApplication) => void; fail: (e: unknown) => void }> = [];
  vi.spyOn(apiClient, "patch").mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        settle.push({ ok: resolve as (app: JobApplication) => void, fail: reject });
      }),
  );
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const { result } = renderHook(() => useUpdateApplication(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  const rowOf = (id: string) =>
    client.getQueryData<JobApplication[]>(KEY)?.find((a) => a.id === id);
  const statusOf = (id: string) => rowOf(id)?.status;
  return { result, settle, invalidate, statusOf, rowOf };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useUpdateApplication", () => {
  it("moves the job in the cached lists before the server answers", async () => {
    vi.spyOn(apiClient, "patch").mockReturnValue(new Promise(() => {}));
    const { result, status } = setup();

    act(() => result.current.mutate({ id: "a1", data: { status: "preparing" } }));

    await waitFor(() => expect(status()).toBe("preparing"));
  });

  it("puts it back when the server refuses the move", async () => {
    vi.spyOn(apiClient, "patch").mockRejectedValue(new ApiClientError(422, "no"));
    const { result, status } = setup();

    act(() => result.current.mutate({ id: "a1", data: { status: "offered" } }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(status()).toBe("planning");
  });

  it("records where a closed job came from, so it reopens there before the server answers", async () => {
    vi.spyOn(apiClient, "patch").mockReturnValue(new Promise(() => {}));
    const { result, cached } = setup({ ...APP, status: "preparing" });

    act(() => result.current.mutate({ id: "a1", data: { status: "withdrawn" } }));

    await waitFor(() => expect(cached()?.closed_from).toBe("preparing"));
  });

  it("clears it again on reopening", async () => {
    vi.spyOn(apiClient, "patch").mockReturnValue(new Promise(() => {}));
    const { result, cached } = setup({ ...APP, status: "rejected", closed_from: "interviewing" });

    act(() => result.current.mutate({ id: "a1", data: { status: "interviewing" } }));

    await waitFor(() => expect(cached()?.status).toBe("interviewing"));
    expect(cached()?.closed_from).toBeNull();
  });

  it("leaves closed_from alone for a note", async () => {
    vi.spyOn(apiClient, "patch").mockReturnValue(new Promise(() => {}));
    const { result, cached } = setup({ ...APP, status: "skipped", closed_from: "planning" });

    act(() => result.current.mutate({ id: "a1", data: { notes: "later" } }));

    await waitFor(() => expect(cached()?.notes).toBe("later"));
    expect(cached()?.closed_from).toBe("planning");
  });

  it("forgets the applied date when Applied is stepped back from", async () => {
    vi.spyOn(apiClient, "patch").mockReturnValue(new Promise(() => {}));
    const { result, cached } = setup({
      ...APP,
      status: "applied",
      applied_at: "2026-09-10T00:00:00Z",
    });

    act(() => result.current.mutate({ id: "a1", data: { status: "preparing" } }));

    await waitFor(() => expect(cached()?.status).toBe("preparing"));
    expect(cached()?.applied_at).toBeNull();
  });

  it("keeps the applied date on a move that isn't stepping back from Applied", async () => {
    vi.spyOn(apiClient, "patch").mockReturnValue(new Promise(() => {}));
    const { result, cached } = setup({
      ...APP,
      status: "applied",
      applied_at: "2026-09-10T00:00:00Z",
    });

    act(() => result.current.mutate({ id: "a1", data: { status: "interviewing" } }));

    await waitFor(() => expect(cached()?.status).toBe("interviewing"));
    expect(cached()?.applied_at).toBe("2026-09-10T00:00:00Z");
  });

  it("puts back only the job that was refused, not one moved since", async () => {
    const A = { id: "a", status: "planning", notes: null } as JobApplication;
    const B = { id: "b", status: "planning", notes: null } as JobApplication;
    const { result, settle, statusOf } = setupMany([A, B]);

    act(() => result.current.mutate({ id: "a", data: { status: "preparing" } }));
    await waitFor(() => expect(statusOf("a")).toBe("preparing"));
    act(() => result.current.mutate({ id: "b", data: { status: "preparing" } }));
    await waitFor(() => expect(statusOf("b")).toBe("preparing"));

    await act(async () => settle[0]?.fail(new ApiClientError(422, "no")));

    expect(statusOf("a")).toBe("planning");
    expect(statusOf("b")).toBe("preparing");
  });

  it("puts back only what the refused update changed, on a job changed since", async () => {
    const A = { id: "a", status: "planning", notes: null } as JobApplication;
    const { result, settle, rowOf } = setupMany([A]);

    // A notes save is in flight when the same job is moved; the save is then refused.
    act(() => result.current.mutate({ id: "a", data: { notes: "call Friday" } }));
    await waitFor(() => expect(rowOf("a")?.notes).toBe("call Friday"));
    act(() => result.current.mutate({ id: "a", data: { status: "preparing" } }));
    await waitFor(() => expect(rowOf("a")?.status).toBe("preparing"));

    await act(async () => settle[0]?.fail(new ApiClientError(500, "no")));

    expect(rowOf("a")?.notes).toBeNull();
    expect(rowOf("a")?.status).toBe("preparing");
  });

  it("does the same the other way round: a refused move leaves notes saved since", async () => {
    const A = { id: "a", status: "planning", notes: null } as JobApplication;
    const { result, settle, rowOf } = setupMany([A]);

    act(() => result.current.mutate({ id: "a", data: { status: "preparing" } }));
    await waitFor(() => expect(rowOf("a")?.status).toBe("preparing"));
    act(() => result.current.mutate({ id: "a", data: { notes: "call Friday" } }));
    await waitFor(() => expect(rowOf("a")?.notes).toBe("call Friday"));

    await act(async () => settle[0]?.fail(new ApiClientError(422, "no")));

    expect(rowOf("a")?.status).toBe("planning");
    expect(rowOf("a")?.closed_from ?? null).toBeNull();
    expect(rowOf("a")?.notes).toBe("call Friday");
  });

  it("refetches once, after the last of several quick moves has settled", async () => {
    const A = { id: "a", status: "planning", notes: null } as JobApplication;
    const B = { id: "b", status: "planning", notes: null } as JobApplication;
    const { result, settle, invalidate } = setupMany([A, B]);

    act(() => result.current.mutate({ id: "a", data: { status: "preparing" } }));
    act(() => result.current.mutate({ id: "b", data: { status: "preparing" } }));
    await waitFor(() => expect(settle).toHaveLength(2));

    await act(async () => settle[0]?.ok({ ...A, status: "preparing" }));
    // One is still in flight: refetching now would show the server's older view
    // of it and flicker the card back.
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => settle[1]?.ok({ ...B, status: "preparing" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
  });
});

describe("useCreateApplication", () => {
  it("adds the saved job to the cached list at once, before the refetch", async () => {
    const created = { id: "new", job_posting_id: "job-1", status: "planning" } as JobApplication;
    vi.spyOn(apiClient, "post").mockResolvedValue(created);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(KEY, []);
    const { result } = renderHook(() => useCreateApplication(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    await act(async () => result.current.mutate({ job_posting_id: "job-1" }));

    expect(client.getQueryData<JobApplication[]>(KEY)).toEqual([created]);
  });

  it("doesn't add a job that is already listed", async () => {
    const existing = { id: "new", job_posting_id: "job-1", status: "applied" } as JobApplication;
    vi.spyOn(apiClient, "post").mockResolvedValue(existing);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(KEY, [existing]);
    const { result } = renderHook(() => useCreateApplication(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    await act(async () => result.current.mutate({ job_posting_id: "job-1" }));

    expect(client.getQueryData<JobApplication[]>(KEY)).toEqual([existing]);
  });
});
