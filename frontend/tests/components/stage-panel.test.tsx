import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import type { Document, JobApplication, JobPostingDetail } from "@/types/api";

const apps = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const docs = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const create = vi.hoisted(() => ({ calls: [] as unknown[], error: null as unknown }));
const update = vi.hoisted(() => ({ calls: [] as unknown[], error: null as unknown, hold: false }));
const confirm = vi.hoisted(() => ({ answer: true, titles: [] as string[] }));

vi.mock("@/hooks/useApplications", () => ({
  useApplications: () => apps.current,
  useCreateApplication: () => ({
    isPending: false,
    error: create.error,
    mutate: (vars: unknown, opts?: { onSuccess?: () => void }) => {
      create.calls.push(vars);
      opts?.onSuccess?.();
    },
  }),
  useUpdateApplication: () => ({
    error: update.error,
    mutate: (vars: unknown, opts?: { onSuccess?: () => void; onSettled?: () => void }) => {
      update.calls.push(vars);
      if (update.hold) return;
      opts?.onSuccess?.();
      opts?.onSettled?.();
    },
  }),
}));
vi.mock("@/hooks/useDocuments", () => ({ useDocuments: () => docs.current }));
vi.mock("@/components/confirm-dialog-provider", () => ({
  useConfirm: () => (options: { title: string }) => {
    confirm.titles.push(options.title);
    return Promise.resolve(confirm.answer);
  },
}));

const { StagePanel } = await import("@/components/jobs/stage-panel");

const LANG = "en";
const j = (key: string) => t("jobs", key, LANG);

const JOB = {
  id: "job-1",
  translated_title: "Backend Engineer",
  original_title: null,
  original_company: null,
  original_language: "ja",
  structured_data: { company_name: "Test K.K." },
} as JobPostingDetail;

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

/** null: the applications haven't loaded (undefined would take the default). */
function renderPanel(applications: JobApplication[] | null = [], extra = {}) {
  apps.current = {
    data: applications ?? undefined,
    isLoading: applications === null,
    error: null,
    ...extra,
  };
  return renderIn(LANG, <StagePanel job={JOB} />);
}

/** A finished document; only the fields the panel reads. */
const doc = (over: Partial<Document>) => ({ status: "completed", ...over }) as Document;

const button = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  docs.current = { data: { items: [], total: 0 } };
  create.calls = [];
  create.error = null;
  update.calls = [];
  update.error = null;
  update.hold = false;
  confirm.answer = true;
  confirm.titles = [];
});

describe("stage panel, a job that isn't tracked", () => {
  it("offers to save it", () => {
    renderPanel([]);
    fireEvent.click(button(j("saveToPipeline")));
    expect(create.calls).toEqual([{ job_posting_id: "job-1" }]);
  });

  it("ignores an application for another job", () => {
    renderPanel([app({ job_posting_id: "job-2", status: "applied" })]);
    expect(button(j("saveToPipeline"))).toBeInTheDocument();
  });

  it("offers nothing until it knows whether the job is tracked", () => {
    // Offering Save while the list loads invites a duplicate.
    renderPanel(null);
    expect(screen.queryByRole("button", { name: j("saveToPipeline") })).not.toBeInTheDocument();
  });

  it("offers a retry when the applications failed to load", () => {
    const refetch = vi.fn(() => Promise.resolve());
    renderPanel(null, { isLoading: false, error: new ApiClientError(500, "boom"), refetch });
    expect(screen.getByRole("alert")).toHaveTextContent(j("stageLoadError"));
    fireEvent.click(button(t("common", "tryAgain", LANG)));
    expect(refetch).toHaveBeenCalled();
  });
});

describe("stage panel, a job in the pipeline", () => {
  it("shows Saved's moves, with no way back", () => {
    renderPanel([app()]);
    expect(button("Start preparing")).toBeInTheDocument();
    expect(button("Mark as applied")).toBeInTheDocument();
    expect(button("Skip")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Back to/ })).not.toBeInTheDocument();
  });

  it("shows Applied's moves and what to do there", () => {
    renderPanel([app({ status: "applied", applied_at: "2026-09-10T00:00:00Z" })]);
    expect(screen.getByText(j("nextApplied"))).toBeInTheDocument();
    for (const name of ["Got an interview", "Not selected", "Withdraw", "Back to Preparing"]) {
      expect(button(name)).toBeInTheDocument();
    }
  });

  it("marks the current stage in the stepper", () => {
    renderPanel([app({ status: "interviewing" })]);
    const steps = screen.getByRole("list", { name: j("stageStepsLabel") });
    const current = steps.querySelector('[aria-current="step"]');
    expect(current).toHaveTextContent(j("stageInterviewing"));
    expect(steps.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  });

  it("moves forward without asking, then puts focus on the panel heading", async () => {
    renderPanel([app()]);
    await act(async () => fireEvent.click(button("Start preparing")));
    expect(confirm.titles).toEqual([]);
    expect(update.calls).toEqual([{ id: "a1", data: { status: "preparing" } }]);
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: j("stagePanelTitle") }),
    );
  });

  it("asks before skipping, and does nothing when declined", async () => {
    confirm.answer = false;
    renderPanel([app()]);
    await act(async () => fireEvent.click(button("Skip")));
    expect(confirm.titles).toEqual([j("confirmSkip")]);
    expect(update.calls).toEqual([]);
  });

  it("calls withdrawing from an offer declining it, and asks first", async () => {
    renderPanel([app({ status: "offered", applied_at: "2026-09-10T00:00:00Z" })]);
    await act(async () => fireEvent.click(button("Decline offer")));
    expect(confirm.titles).toEqual([j("confirmDecline")]);
    expect(update.calls).toEqual([{ id: "a1", data: { status: "withdrawn" } }]);
  });

  it("shows a move in progress and holds the other moves", async () => {
    update.hold = true;
    renderPanel([app()]);
    await act(async () => fireEvent.click(button("Start preparing")));
    expect(button("Start preparing")).toHaveAttribute("aria-busy", "true");
    expect(button("Skip")).toBeDisabled();
  });

  it("explains a refused move", () => {
    update.error = new ApiClientError(422, "Can't move");
    renderPanel([app()]);
    expect(screen.getByRole("alert")).toHaveTextContent(t("common", "errorInvalidInput", LANG));
  });
});

describe("stage panel, each stage's help", () => {
  it("links Preparing to the documents for this job, marking one already made", () => {
    docs.current = {
      data: {
        items: [
          doc({ document_type: "rirekisho", job_context: { job_posting_id: "job-1" } }),
          doc({ document_type: "shokumukeirekisho", job_context: { job_posting_id: "job-2" } }),
        ],
        total: 2,
      },
    };
    renderPanel([app({ status: "preparing" })]);

    const rirekisho = screen.getByRole("link", { name: j("generateRirekishoForJob") });
    const shokumu = screen.getByRole("link", { name: j("generateShokumuForJob") });
    expect(rirekisho).toHaveAttribute("href", "/dashboard/documents/rirekisho/new?job=job-1");
    expect(within(rirekisho.closest("li") as HTMLElement).getByText(j("docMade"))).toBeVisible();
    expect(within(shokumu.closest("li") as HTMLElement).queryByText(j("docMade"))).toBeNull();
  });

  it("pre-fills interview practice with the role and company", () => {
    renderPanel([app({ status: "interviewing" })]);
    expect(screen.getByRole("link", { name: j("actionPractise") })).toHaveAttribute(
      "href",
      "/dashboard/interview/new?role=Backend+Engineer&company=Test+K.K.",
    );
  });
});

describe("stage panel, an archived job", () => {
  it("shows why it closed and reopens it where it left", async () => {
    renderPanel([app({ status: "rejected", closed_from: "interviewing" })]);
    expect(screen.getByText(j("stageRejected"))).toBeInTheDocument();
    await act(async () => fireEvent.click(button("Reopen at Interviewing")));
    expect(confirm.titles).toEqual([]);
    expect(update.calls).toEqual([{ id: "a1", data: { status: "interviewing" } }]);
  });
});
