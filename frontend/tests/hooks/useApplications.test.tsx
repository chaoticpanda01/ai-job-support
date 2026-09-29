import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { useUpdateApplication } from "@/hooks/useApplications";
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
});
