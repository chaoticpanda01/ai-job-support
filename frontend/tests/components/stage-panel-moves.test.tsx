import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/lib/language-context";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import type { JobApplication, JobPostingDetail } from "@/types/api";

/**
 * StagePanel with the real query hooks. A move swaps the panel between its
 * forward and archived views before the server answers (the update is
 * optimistic), unmounting the view that made the request. React Query drops a
 * call's own callbacks once its component unmounts, so what has to survive the
 * swap (focus, the error message) can't live in that view. The mocked-hook
 * tests in stage-panel.test.tsx can't show this.
 */
vi.mock("@/components/confirm-dialog-provider", () => ({
  useConfirm: () => () => Promise.resolve(true),
}));

const { StagePanel } = await import("@/components/jobs/stage-panel");

const LANG = "en";
const JOB = {
  id: "job-1",
  translated_title: "Backend Engineer",
  original_title: null,
  original_company: null,
  structured_data: null,
} as JobPostingDetail;

const PREPARING = {
  id: "a1",
  job_posting_id: "job-1",
  status: "preparing",
  applied_at: null,
  closed_from: null,
  updated_at: "2026-09-20T00:00:00Z",
} as JobApplication;

let patch: {
  resolve: (app: JobApplication) => void;
  reject: (error: unknown) => void;
};

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(client);
}

function render(client: QueryClient) {
  return import("@testing-library/react").then(({ render: r }) =>
    r(
      <QueryClientProvider client={client}>
        <LanguageProvider initialLang={LANG}>
          <StagePanel job={JOB} />
        </LanguageProvider>
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => {
  vi.spyOn(apiClient, "get").mockImplementation((path: string) =>
    Promise.resolve(path.startsWith("/documents") ? { items: [], total: 0 } : [PREPARING]),
  );
  vi.spyOn(apiClient, "patch").mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        patch = { resolve: resolve as (app: JobApplication) => void, reject };
      }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("stage panel, a move that swaps its view", () => {
  it("puts focus on the heading once a withdrawal is saved", async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw" }));

    // Optimistic: already the archived view, before the server has answered.
    await screen.findByRole("button", { name: "Reopen at Preparing" });
    await act(async () =>
      patch.resolve({ ...PREPARING, status: "withdrawn", closed_from: "preparing" }),
    );

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: t("jobs", "stagePanelTitle", LANG) }),
      ),
    );
  });

  it("keeps the reason on screen when the server refuses and the panel goes back", async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw" }));
    await screen.findByRole("button", { name: "Reopen at Preparing" });

    await act(async () => patch.reject(new ApiClientError(422, "Can't move")));

    // Rolled back to the forward view, which is a fresh component.
    await screen.findByRole("button", { name: "Withdraw" });
    expect(screen.getByRole("alert")).toHaveTextContent(t("jobs", "moveStale", LANG));
    // The clicked button was unmounted by the swap, so focus goes to the heading
    // rather than being left on <body>.
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: t("jobs", "stagePanelTitle", LANG) }),
    );
  });
});
