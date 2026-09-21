import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, type RenderResult } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import type { AnalysisErrorCode, ResumeAnalysis, ResumeDetail } from "@/types/api";

const resumeQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const analysisState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const mutation = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  calls: [] as unknown[],
}));

vi.mock("@/hooks/useResumes", () => ({
  useResume: () => resumeQuery.current,
  useResumeAnalysis: () => analysisState.current,
  useAnalyzeResume: () => mutation.current,
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));

const ResumeDetailPage = (await import("@/app/dashboard/resumes/[id]/page")).default;

const LANG = "ja";
const r = (key: Parameters<typeof t>[1]) => t("resumes", key, LANG);
const common = (key: Parameters<typeof t>[1]) => t("common", key, LANG);

const RESUME: ResumeDetail = {
  id: "r1",
  user_id: "u1",
  file_name: "cv.pdf",
  file_size_bytes: 20480,
  mime_type: "application/pdf",
  language: "en",
  is_primary: false,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  download_url: "https://example.test/cv.pdf",
};

const ANALYSIS: ResumeAnalysis = {
  id: "a1",
  resume_id: "r1",
  analysis_type: "general",
  job_posting_id: null,
  ai_model: "claude-test",
  input_tokens: 10,
  output_tokens: 20,
  created_at: "2026-09-02T00:00:00Z",
  result: {
    japan_market_score: 72,
    strengths: ["Ten years of backend work"],
    gaps: ["No Japanese business experience"],
    recommendations: ["Add a self-PR section"],
    language_assessment: "Conversational Japanese",
    estimated_japanese_level_required: "N2",
    summary: "A solid engineering profile",
  },
};

/** The analysis hook with nothing analysed and nothing in flight. */
function analysis(over: Record<string, unknown> = {}) {
  return {
    data: null,
    isLoading: false,
    error: null,
    status: { status: "idle", error_code: null },
    statusError: null,
    statusErrorCount: 0,
    checkingStatus: false,
    refetchStatus: () => {},
    finishing: false,
    ...over,
  };
}

function failedWith(code: string | null) {
  return analysis({ status: { status: "failed", error_code: code } });
}

/**
 * Render the page and wait for its route params to resolve.
 *
 * The page reads `params` with `use()`, which suspends even on a resolved
 * promise, and RTL's `render()` wraps only the initial render in a
 * synchronous `act()` — which cannot await the thrown thenable, so the
 * retry render never happens and the page stays on the Suspense fallback.
 * Rendering inside `await act(async () => ...)` drives that retry, so the
 * page's own output is in the DOM by the time this returns.
 */
async function renderPage(
  analysisOver: Record<string, unknown> = analysis(),
  resumeOver: Record<string, unknown> = {},
  mutationOver: Record<string, unknown> = {},
) {
  resumeQuery.current = { data: RESUME, isLoading: false, error: null, ...resumeOver };
  analysisState.current = analysisOver;
  mutation.calls = [];
  mutation.current = {
    mutate: (vars: unknown) => mutation.calls.push(vars),
    isPending: false,
    isSuccess: false,
    ...mutationOver,
  };
  let view: RenderResult | null = null;
  await act(async () => {
    view = renderIn(
      LANG,
      <Suspense fallback={null}>
        <ResumeDetailPage params={Promise.resolve({ id: "r1" })} />
      </Suspense>,
    );
  });
  if (view === null) throw new Error("the page never rendered");
  return view as RenderResult;
}

/** The Analyse / Try again button in the section header, if the page offers one. */
function analyseButton() {
  return (
    screen.queryByRole("button", { name: r("analyseBtn") }) ??
    screen.queryByRole("button", { name: common("tryAgain") }) ??
    screen.queryByRole("button", { name: r("queueing") })
  );
}

describe("resume detail page, the resume itself", () => {
  it("shows a skeleton while the resume loads", async () => {
    const { container } = await renderPage(analysis(), { data: undefined, isLoading: true });

    // A positive check that the skeleton branch rendered: had the params
    // never resolved, the Suspense fallback (null) would leave an empty DOM
    // and every absence assertion below would pass for the wrong reason.
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("says not found when the resume cannot be loaded", async () => {
    await renderPage(analysis(), { data: undefined, error: new ApiClientError(404, "gone") });

    expect(screen.getByText(r("notFound"))).toBeInTheDocument();
  });

  it("says not found when the request succeeded with no resume", async () => {
    await renderPage(analysis(), { data: undefined });

    expect(screen.getByText(r("notFound"))).toBeInTheDocument();
  });

  it("shows the file and its download once it is there", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: RESUME.file_name })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: common("download") })).toHaveAttribute(
      "href",
      RESUME.download_url,
    );
  });
});

describe("resume detail page, nothing analysed yet", () => {
  it("offers the analysis once the status is known", async () => {
    await renderPage();

    expect(screen.getByRole("button", { name: r("analyseBtn") })).toBeInTheDocument();
  });

  it("waits for the status before offering it, in case one is already running", async () => {
    await renderPage(analysis({ status: undefined }));

    expect(analyseButton()).toBeNull();
  });

  it("requests the analysis in the language being read", async () => {
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: r("analyseBtn") }));

    expect(mutation.calls).toEqual([{ resumeId: "r1", language: LANG }]);
  });

  it("says so while the request is being queued", async () => {
    await renderPage(analysis(), {}, { isPending: true });

    expect(screen.getByRole("button", { name: r("queueing") })).toBeDisabled();
  });
});

describe("resume detail page, a request in flight", () => {
  it("shows progress and no button while one is pending", async () => {
    await renderPage(analysis({ status: { status: "pending", error_code: null } }));

    expect(screen.getByText(r("analysing"))).toBeInTheDocument();
    expect(analyseButton()).toBeNull();
  });

  it("keeps showing progress while the finished result is being fetched", async () => {
    // Without this the empty state and its Analyse button flash up between
    // the request ending and the analysis arriving.
    await renderPage(analysis({ finishing: true }));

    expect(screen.getByText(r("analysing"))).toBeInTheDocument();
    expect(analyseButton()).toBeNull();
  });

  it("shows progress while the analysis itself is loading", async () => {
    await renderPage(analysis({ data: undefined, isLoading: true }));

    expect(screen.getByText(r("analysing"))).toBeInTheDocument();
    expect(analyseButton()).toBeNull();
  });
});

describe("resume detail page, an analysis that failed", () => {
  const CODES: Array<[AnalysisErrorCode, Parameters<typeof r>[0]]> = [
    ["budget_exceeded", "analysisFailedBudget"],
    ["unreadable_file", "analysisFailedUnreadable"],
    ["file_unavailable", "analysisFailedFile"],
    ["ai_failed", "analysisFailedAi"],
    ["timed_out", "analysisFailedTimeout"],
    ["unknown", "analysisFailedUnknown"],
  ];

  it.each(CODES)("explains the %s failure", async (code, key) => {
    await renderPage(failedWith(code));

    expect(screen.getByRole("alert")).toHaveTextContent(r(key));
  });

  it("falls back for a code this version doesn't know", async () => {
    await renderPage(failedWith("a_code_from_a_newer_backend"));

    expect(screen.getByRole("alert")).toHaveTextContent(r("analysisFailedUnknown"));
  });

  it("falls back for a failure recorded before codes existed", async () => {
    await renderPage(failedWith(null));

    expect(screen.getByRole("alert")).toHaveTextContent(r("analysisFailedUnknown"));
  });

  it("offers another attempt rather than a first one", async () => {
    await renderPage(failedWith("ai_failed"));

    expect(screen.getByRole("button", { name: common("tryAgain") })).toBeInTheDocument();
  });

  it("waits for the result to be fetched before announcing the failure", async () => {
    // The request has ended and the analysis is being re-fetched. Announcing
    // the failure now would show an error beside a spinner that is still
    // running, and take it back if a result does arrive.
    // The same state without `finishing` renders the alert -- see the
    // it.each above, which covers ai_failed among the rest.
    await renderPage(analysis({ ...failedWith("ai_failed"), finishing: true }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(r("analysing"))).toBeInTheDocument();
  });

  it("falls back for a code that collides with a built-in property name", async () => {
    // Object.hasOwn rather than a plain lookup: FAILURE_MESSAGE_KEYS.constructor
    // exists on every object and is a function, which t() would render as one.
    await renderPage(failedWith("constructor"));

    expect(screen.getByRole("alert")).toHaveTextContent(r("analysisFailedUnknown"));
  });

  it("says nothing about an old failure once there is an analysis to show", async () => {
    await renderPage(analysis({ data: ANALYSIS, status: { status: "failed", error_code: null } }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("resume detail page, a status check that failed", () => {
  const STATUS_ERROR = analysis({ statusError: new ApiClientError(500, "boom") });

  it("announces the failure and offers a retry", async () => {
    await renderPage(STATUS_ERROR);

    expect(screen.getByRole("alert")).toHaveTextContent(r("analysisStatusError"));
    expect(screen.getByRole("button", { name: common("tryAgain") })).toBeInTheDocument();
  });

  it("keeps the retry focusable while it re-checks", async () => {
    await renderPage(analysis({ ...STATUS_ERROR, checkingStatus: true }));

    const button = screen.getByRole("button", { name: common("retrying") });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
  });

  it("does not offer a new analysis while it cannot tell whether one is running", async () => {
    await renderPage(STATUS_ERROR);

    expect(screen.queryByRole("button", { name: r("analyseBtn") })).not.toBeInTheDocument();
  });

  it("reports the failed check rather than progress it can no longer confirm", async () => {
    // The last status read said pending, then a check failed. Continuing to
    // spin would claim a request is still running on the strength of a
    // reading the page just failed to refresh.
    await renderPage(
      analysis({ ...STATUS_ERROR, status: { status: "pending", error_code: null } }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(r("analysisStatusError"));
    expect(screen.queryByText(r("analysing"))).not.toBeInTheDocument();
  });

  it("reports the failed check rather than a failure it cannot confirm either", async () => {
    await renderPage(
      analysis({ ...STATUS_ERROR, status: { status: "failed", error_code: "ai_failed" } }),
    );

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(r("analysisStatusError"));
  });

  it("stays quiet about the check once there is an analysis to show", async () => {
    await renderPage(analysis({ ...STATUS_ERROR, data: ANALYSIS }));

    expect(screen.queryByText(r("analysisStatusError"))).not.toBeInTheDocument();
  });
});

describe("resume detail page, an analysis that could not be fetched", () => {
  it("reports the failure in its own words", async () => {
    await renderPage(analysis({ data: undefined, error: new ApiClientError(500, "boom") }));

    expect(screen.getByRole("alert")).toHaveTextContent(r("analysisLoadError"));
  });

  it("does not offer an analysis it could not read", async () => {
    await renderPage(analysis({ data: undefined, error: new ApiClientError(500, "boom") }));

    expect(analyseButton()).toBeNull();
  });
});

describe("resume detail page, an analysis to show", () => {
  it("renders the score and every section of the result", async () => {
    await renderPage(analysis({ data: ANALYSIS }));

    expect(screen.getByText(String(ANALYSIS.result.japan_market_score))).toBeInTheDocument();
    expect(screen.getByText(ANALYSIS.result.summary)).toBeInTheDocument();
    for (const item of [
      ...ANALYSIS.result.strengths,
      ...ANALYSIS.result.gaps,
      ...ANALYSIS.result.recommendations,
    ]) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });

  it("does not stack a spinner on an analysis it is already showing", async () => {
    await renderPage(analysis({ data: ANALYSIS, status: { status: "pending", error_code: null } }));

    expect(screen.getByText(ANALYSIS.result.summary)).toBeInTheDocument();
    expect(screen.queryByText(r("analysing"))).not.toBeInTheDocument();
  });

  it("does not offer to analyse what is already analysed", async () => {
    await renderPage(analysis({ data: ANALYSIS }));

    expect(analyseButton()).toBeNull();
  });
});

describe("resume detail page, what gets read out", () => {
  it("says nothing about an analysis that was already there on arrival", async () => {
    await renderPage(analysis({ data: ANALYSIS }));

    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("says it is analysing after this visit's request", async () => {
    await renderPage(
      analysis({ status: { status: "pending", error_code: null } }),
      {},
      { isSuccess: true },
    );

    expect(screen.getByRole("status")).toHaveTextContent(r("analysing"));
  });

  it("says the result is ready when it lands", async () => {
    await renderPage(analysis({ data: ANALYSIS }), {}, { isSuccess: true });

    expect(screen.getByRole("status")).toHaveTextContent(r("analysisReady"));
  });
});
