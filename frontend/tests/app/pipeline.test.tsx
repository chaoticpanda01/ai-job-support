import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within, type RenderResult } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import { LanguageProvider } from "@/lib/language-context";
import type { JobApplication } from "@/types/api";

const apps = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const update = vi.hoisted(() => ({ calls: [] as unknown[], fail: false }));
const removed = vi.hoisted(() => ({ calls: [] as unknown[] }));
const toasts = vi.hoisted(() => ({
  calls: [] as Array<{ variant?: string; description?: string }>,
}));

vi.mock("@/hooks/useApplications", () => ({
  useApplications: () => apps.current,
  useUpdateApplication: () => ({
    mutateAsync: (vars: unknown) => {
      update.calls.push(vars);
      return update.fail ? Promise.reject(new Error("refused")) : Promise.resolve(vars);
    },
  }),
  useDeleteApplication: () => ({
    isPending: false,
    mutate: (id: string) => removed.calls.push(id),
  }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: (toast: { variant?: string; description?: string }) => toasts.calls.push(toast),
  }),
}));
vi.mock("@/components/confirm-dialog-provider", () => ({
  useConfirm: () => () => Promise.resolve(true),
}));

const PipelinePage = (await import("@/app/dashboard/jobs/applications/page")).default;

const LANG = "en";
const j = (key: string) => t("jobs", key, LANG);

function app(over: Partial<JobApplication> = {}): JobApplication {
  return {
    id: "a1",
    user_id: "u1",
    job_posting_id: "job-1",
    status: "planning",
    applied_at: null,
    notes: null,
    closed_from: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    job_title: "Backend Engineer",
    job_company: "Test K.K.",
    ...over,
  };
}

function setApps(list: JobApplication[] | undefined, extra: Record<string, unknown> = {}) {
  apps.current = { data: list, isLoading: list === undefined, error: null, ...extra };
}

let view: RenderResult;
function renderPage() {
  view = renderIn(LANG, <PipelinePage />);
  return view;
}
function rerender() {
  view.rerender(
    <LanguageProvider initialLang={LANG}>
      <PipelinePage />
    </LanguageProvider>,
  );
}

const region = (stage: string) => screen.getByRole("region", { name: j(stage) });

beforeEach(() => {
  setApps([app()]);
  update.calls = [];
  update.fail = false;
  removed.calls = [];
  toasts.calls = [];
});

describe("pipeline board, loading and empty", () => {
  it("shows a skeleton while it loads", () => {
    setApps(undefined);
    const { container } = renderPage();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("offers a retry when it fails to load", () => {
    const refetch = vi.fn(() => Promise.resolve());
    setApps(undefined, {
      isLoading: false,
      error: new ApiClientError(500, "x"),
      isFetching: false,
      refetch,
    });
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent(j("appLoadError"));
    fireEvent.click(screen.getByRole("button", { name: t("common", "tryAgain", LANG) }));
    expect(refetch).toHaveBeenCalled();
  });

  it("points at the job list when nothing is saved", () => {
    setApps([]);
    renderPage();
    expect(screen.getByText(j("pipelineEmpty"))).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: j("findJobs") })) {
      expect(link).toHaveAttribute("href", "/dashboard/jobs");
    }
  });
});

describe("pipeline board, the stages", () => {
  it("lays out every forward stage with its count", () => {
    setApps([
      app({ id: "a1" }),
      app({ id: "a2", job_title: "Data Engineer" }),
      app({ id: "a3", status: "applied", applied_at: "2026-09-10T00:00:00Z" }),
    ]);
    renderPage();
    expect(within(region("stagePlanning")).getByText("2")).toBeInTheDocument();
    expect(within(region("stageApplied")).getByText("1")).toBeInTheDocument();
    expect(within(region("stageOffered")).getByText(j("stageEmpty"))).toBeInTheDocument();
  });

  it("moves a card to the next stage", async () => {
    renderPage();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start preparing" })));
    expect(update.calls).toEqual([{ id: "a1", data: { status: "preparing" } }]);
  });

  it("puts focus on the moved card in its new place", async () => {
    renderPage();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start preparing" })));
    setApps([app({ status: "preparing" })]);
    act(() => rerender());
    expect(document.activeElement).toBe(
      within(region("stagePreparing")).getByRole("link", { name: "Backend Engineer" }),
    );
  });

  it("says when a move was refused", async () => {
    update.fail = true;
    renderPage();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start preparing" })));
    expect(toasts.calls).toContainEqual({
      variant: "destructive",
      description: t("common", "updateFailed", LANG),
    });
  });

  it("has no forward move once an offer is accepted", () => {
    setApps([app({ status: "accepted", applied_at: "2026-09-10T00:00:00Z" })]);
    renderPage();
    const card = within(region("stageAccepted"));
    expect(card.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Edit notes for Backend Engineer",
      "Remove Backend Engineer",
    ]);
  });
});

describe("pipeline board, a card's notes and removal", () => {
  it("edits notes in place and returns focus to the edit button", async () => {
    renderPage();
    const pencil = screen.getByRole("button", { name: "Edit notes for Backend Engineer" });
    fireEvent.click(pencil);
    fireEvent.change(screen.getByRole("textbox", { name: j("notesLabel") }), {
      target: { value: "Call on Friday" },
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: j("saveNotes") })));
    expect(update.calls).toEqual([{ id: "a1", data: { notes: "Call on Friday" } }]);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(pencil);
  });

  it("cancels notes with Escape", () => {
    renderPage();
    const pencil = screen.getByRole("button", { name: "Edit notes for Backend Engineer" });
    fireEvent.click(pencil);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(pencil);
  });

  it("removes a card after confirming", async () => {
    renderPage();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Remove Backend Engineer" })),
    );
    expect(removed.calls).toEqual(["a1"]);
  });
});

describe("pipeline board, archived jobs", () => {
  beforeEach(() => {
    setApps([
      app({ id: "a1", status: "rejected", closed_from: "interviewing" }),
      app({ id: "a2", status: "skipped", closed_from: "planning", job_title: "Data Engineer" }),
    ]);
  });

  it("keeps them folded away until asked", () => {
    renderPage();
    const toggle = screen.getByRole("button", { name: "Archived (2)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /^Reopen/ })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(j("stageRejected"))).toBeInTheDocument();
  });

  it("reopens one where it left", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Archived (2)" }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Reopen at Interviewing" })),
    );
    expect(update.calls).toEqual([{ id: "a1", data: { status: "interviewing" } }]);
  });
});
