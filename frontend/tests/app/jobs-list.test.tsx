import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import type { JobApplication, JobPosting } from "@/types/api";

const jobs = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  params: [] as unknown[],
}));
const apps = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const created = vi.hoisted(() => ({ calls: [] as unknown[] }));
const deleted = vi.hoisted(() => ({ calls: [] as unknown[] }));
const confirm = vi.hoisted(() => ({ answer: true }));

vi.mock("@/hooks/useJobs", () => ({
  useJobs: (params: unknown) => {
    jobs.params.push(params);
    return jobs.current;
  },
  useDeleteJob: () => ({
    isPending: false,
    mutate: (id: string, opts?: { onSuccess?: () => void }) => {
      deleted.calls.push(id);
      opts?.onSuccess?.();
    },
  }),
}));
vi.mock("@/hooks/useApplications", () => ({
  useApplications: () => apps.current,
  useCreateApplication: () => ({
    isPending: false,
    mutate: (vars: unknown) => created.calls.push(vars),
  }),
}));
vi.mock("@/components/confirm-dialog-provider", () => ({
  useConfirm: () => () => Promise.resolve(confirm.answer),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));

const JobsPage = (await import("@/app/dashboard/jobs/page")).default;

const LANG = "en";
const j = (key: string) => t("jobs", key, LANG);

function job(over: Partial<JobPosting> = {}): JobPosting {
  return {
    id: "job-1",
    source_url: null,
    source_platform: "manual",
    original_title: "バックエンドエンジニア",
    original_company: "株式会社テスト",
    original_language: "ja",
    translated_title: "Backend Engineer",
    translation_summary: "A backend role in Shibuya.",
    foreigner_friendliness_score: 85,
    structured_data: {
      company_name: "Test K.K.",
      location: "Tokyo",
      employment_type: "Full-time",
      salary_range: "6-9M JPY",
      required_japanese: "N2",
      required_experience_years: 3,
      key_requirements: [],
      benefits: [],
      visa_sponsorship: true,
    },
    cached_until: null,
    is_mine: false,
    created_at: "2026-09-22T00:00:00Z",
    ...over,
  };
}

const loaded = (items: JobPosting[]) => ({
  data: { items, total: items.length },
  isLoading: false,
  error: null,
  isFetching: false,
  refetch: () => Promise.resolve(),
});

function renderPage() {
  return renderIn(LANG, <JobsPage />);
}

beforeEach(() => {
  jobs.current = loaded([job()]);
  jobs.params = [];
  apps.current = { data: [], isLoading: false };
  created.calls = [];
  deleted.calls = [];
  confirm.answer = true;
});

describe("jobs list, loading and failing", () => {
  it("shows a skeleton while jobs load", () => {
    jobs.current = { data: undefined, isLoading: true, error: null };
    const { container } = renderPage();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("offers a retry when the jobs fail to load", () => {
    const refetch = vi.fn(() => Promise.resolve());
    jobs.current = {
      data: undefined,
      isLoading: false,
      error: new ApiClientError(500, "boom"),
      isFetching: false,
      refetch,
    };
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent(j("loadError"));
    fireEvent.click(screen.getByRole("button", { name: t("common", "tryAgain", LANG) }));
    expect(refetch).toHaveBeenCalled();
  });

  it("points at translating a posting when there are none", () => {
    jobs.current = loaded([]);
    renderPage();
    expect(screen.getByText(j("noPostings"))).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: j("translateBtn") })) {
      expect(link).toHaveAttribute("href", "/dashboard/jobs/translate");
    }
  });
});

describe("jobs list, a search that finds nothing", () => {
  it("says so, rather than telling the reader to start a list, and offers to clear", () => {
    renderPage();
    fireEvent.change(screen.getByRole("searchbox", { name: j("searchLabel") }), {
      target: { value: "zzz" },
    });
    jobs.current = loaded([]);
    fireEvent.click(screen.getByRole("button", { name: t("common", "search", LANG) }));

    expect(screen.getByText(j("noMatchesHint"))).toBeInTheDocument();
    expect(screen.queryByText(j("noPostingsHint"))).not.toBeInTheDocument();
    // Clear is in the form and in the empty state.
    const clears = screen.getAllByRole("button", { name: t("common", "clear", LANG) });
    expect(clears).toHaveLength(2);
    fireEvent.click(clears[1] as HTMLElement);
    expect(jobs.params.at(-1)).toEqual({});
  });
});

describe("jobs list, a job", () => {
  it("links to it and shows its company and score", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Backend Engineer" })).toHaveAttribute(
      "href",
      "/dashboard/jobs/job-1",
    );
    expect(screen.getByText("Test K.K. · Tokyo · Full-time")).toBeInTheDocument();
    expect(screen.getByText("85")).toHaveClass("text-success");
  });

  it("saves a job that isn't in the pipeline", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Save Backend Engineer" }));
    expect(created.calls).toEqual([{ job_posting_id: "job-1" }]);
  });

  it("shows a tracked job's stage instead of Save", () => {
    apps.current = {
      data: [{ id: "a1", job_posting_id: "job-1", status: "applied" } as JobApplication],
      isLoading: false,
    };
    renderPage();
    expect(screen.getByText(j("stageApplied"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Save/ })).not.toBeInTheDocument();
  });

  it("offers neither while the pipeline is unknown, and still lists the jobs", () => {
    apps.current = { data: undefined, isLoading: false, error: new ApiClientError(500, "x") };
    renderPage();
    expect(screen.getByRole("link", { name: "Backend Engineer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Save/ })).not.toBeInTheDocument();
  });

  it("offers to delete only the user's own pastes, after confirming", async () => {
    jobs.current = loaded([
      job(),
      job({ id: "job-2", translated_title: "Data Engineer", is_mine: true }),
    ]);
    renderPage();
    expect(
      screen.queryByRole("button", { name: "Delete Backend Engineer" }),
    ).not.toBeInTheDocument();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Delete Data Engineer" })),
    );
    expect(deleted.calls).toEqual(["job-2"]);
  });
});

describe("jobs list, searching", () => {
  it("searches for the typed text", () => {
    renderPage();
    fireEvent.change(screen.getByRole("searchbox", { name: j("searchLabel") }), {
      target: { value: "python" },
    });
    fireEvent.click(screen.getByRole("button", { name: t("common", "search", LANG) }));
    expect(jobs.params.at(-1)).toEqual({ q: "python" });
  });
});
