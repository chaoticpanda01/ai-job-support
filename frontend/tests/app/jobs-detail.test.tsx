import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, type RenderResult } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import type { JobMatch, JobPostingDetail, JobStructuredData } from "@/types/api";

const jobQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const resumesQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const applicationsQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const matchMutation = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  calls: [] as unknown[],
}));
const createApplication = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  calls: [] as unknown[],
}));
const cachedMatch = vi.hoisted(() => ({ current: null as JobMatch | null }));

vi.mock("@/hooks/useJobs", () => ({
  useJob: () => jobQuery.current,
  useMatchJob: () => matchMutation.current,
  useCachedJobMatch: () => cachedMatch.current,
}));
vi.mock("@/hooks/useResumes", () => ({ useResumes: () => resumesQuery.current }));
vi.mock("@/hooks/useApplications", () => ({
  useApplications: () => applicationsQuery.current,
  useCreateApplication: () => createApplication.current,
}));

const JobDetailPage = (await import("@/app/dashboard/jobs/[id]/page")).default;

const LANG = "ja";
const j = (key: Parameters<typeof t>[1]) => t("jobs", key, LANG);
const common = (key: Parameters<typeof t>[1]) => t("common", key, LANG);

const JOB_ID = "job-1";

const STRUCTURED: JobStructuredData = {
  company_name: "株式会社テスト",
  location: "東京都渋谷区",
  employment_type: "正社員",
  salary_range: "年収600万円〜900万円",
  required_japanese: "N2",
  required_experience_years: 3,
  key_requirements: ["Python または Go 3年以上"],
  benefits: ["社会保険完備"],
  visa_sponsorship: true,
};

const JOB: JobPostingDetail = {
  id: JOB_ID,
  source_url: null,
  source_platform: "manual",
  original_title: "バックエンドエンジニア",
  original_company: "株式会社テスト",
  original_language: "ja",
  translated_title: "Backend Engineer",
  translation_summary: "A backend role in Shibuya.",
  foreigner_friendliness_score: 85,
  structured_data: STRUCTURED,
  cached_until: null,
  submitted_by: null,
  created_at: "2026-09-22T00:00:00Z",
  original_description: "原文",
  translated_description: "The translated posting body.",
};

const MATCH: JobMatch = {
  id: "m1",
  user_id: "u1",
  resume_id: "r1",
  job_posting_id: JOB_ID,
  match_score: 42,
  match_breakdown: {
    skills_match: 20,
    experience_match: 40,
    language_match: 80,
    culture_fit: 50,
    summary: "Solid networking background, wrong stack.",
  },
  recommendations: {
    strengths: ["Computer Science degree"],
    gaps: ["No Python or Go experience"],
    actions: ["Build a portfolio project"],
  },
  created_at: "2026-09-22T00:00:00Z",
};

const RESUMES = {
  items: [
    { id: "r1", file_name: "cv.pdf", is_primary: true },
    { id: "r2", file_name: "old.pdf", is_primary: false },
  ],
  total: 2,
};

function job(over: Partial<JobPostingDetail> = {}): JobPostingDetail {
  return { ...JOB, ...over };
}

function structured(over: Partial<JobStructuredData> = {}): Partial<JobPostingDetail> {
  return { structured_data: { ...STRUCTURED, ...over } };
}

/**
 * Render and wait for the route params to resolve. `use(params)` suspends
 * even on a resolved promise, so the render has to happen inside an async
 * act() for the retry render to run.
 */
async function renderPage(
  jobOver: Record<string, unknown> = { data: JOB, isLoading: false, error: null },
): Promise<RenderResult> {
  jobQuery.current = jobOver;
  let view: RenderResult | null = null;
  await act(async () => {
    view = renderIn(
      LANG,
      <Suspense fallback={null}>
        <JobDetailPage params={Promise.resolve({ id: JOB_ID })} />
      </Suspense>,
    );
  });
  if (view === null) throw new Error("the page never rendered");
  return view as RenderResult;
}

const loadedJob = (over: Partial<JobPostingDetail> = {}) => ({
  data: job(over),
  isLoading: false,
  error: null,
});

beforeEach(() => {
  resumesQuery.current = { data: RESUMES, isLoading: false };
  applicationsQuery.current = { data: [], isLoading: false };
  matchMutation.calls = [];
  matchMutation.current = {
    mutate: (vars: unknown) => matchMutation.calls.push(vars),
    isPending: false,
    error: null,
  };
  createApplication.calls = [];
  createApplication.current = {
    mutate: (vars: unknown) => createApplication.calls.push(vars),
    isPending: false,
    error: null,
  };
  cachedMatch.current = null;
});

describe("job detail page, loading the posting", () => {
  it("shows a skeleton while it loads", async () => {
    const { container } = await renderPage({ data: undefined, isLoading: true, error: null });

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByText(j("jobNotFound"))).not.toBeInTheDocument();
  });

  it("says the posting is not there when it fails", async () => {
    await renderPage({ data: undefined, isLoading: false, error: new ApiClientError(404, "gone") });

    expect(screen.getByText(j("jobNotFound"))).toBeInTheDocument();
  });

  it("says the same when the request succeeded with nothing", async () => {
    await renderPage({ data: undefined, isLoading: false, error: null });

    expect(screen.getByText(j("jobNotFound"))).toBeInTheDocument();
  });
});

describe("job detail page, the title", () => {
  it("prefers the translation and does not tag its language", async () => {
    await renderPage(loadedJob());

    const heading = screen.getByRole("heading", { name: "Backend Engineer", level: 1 });
    expect(heading).not.toHaveAttribute("lang");
  });

  it("falls back to the original, tagged as the posting's language", async () => {
    // Untranslated text is in the posting's own language, so a screen reader
    // needs to be told; the translation is in the reader's language already.
    await renderPage(loadedJob({ translated_title: null }));

    const heading = screen.getByRole("heading", { name: "バックエンドエンジニア", level: 1 });
    expect(heading).toHaveAttribute("lang", "ja");
  });

  it("falls back again when the posting has no title at all", async () => {
    await renderPage(loadedJob({ translated_title: null, original_title: null }));

    expect(screen.getByRole("heading", { name: j("untitled"), level: 1 })).toBeInTheDocument();
  });
});

describe("job detail page, the details grid", () => {
  it("shows what the posting says", async () => {
    await renderPage(loadedJob());

    for (const value of [
      STRUCTURED.company_name,
      STRUCTURED.location,
      STRUCTURED.employment_type,
      STRUCTURED.salary_range,
    ]) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
  });

  it("leaves out a field the posting never gave", async () => {
    // An empty value renders nothing at all rather than a blank row.
    await renderPage(loadedJob(structured({ salary_range: "" })));

    expect(screen.queryByText(j("salary"))).not.toBeInTheDocument();
    expect(screen.getByText(j("location"))).toBeInTheDocument();
  });

  it.each([
    [true, "yes"],
    [false, "no"],
  ] as Array<[boolean, Parameters<typeof common>[0]]>)(
    "reports visa sponsorship %s",
    async (visa_sponsorship, key) => {
      await renderPage(loadedJob(structured({ visa_sponsorship })));

      expect(screen.getByText(common(key))).toBeInTheDocument();
    },
  );

  it("distinguishes an unmentioned visa from a refused one", async () => {
    await renderPage(loadedJob(structured({ visa_sponsorship: null })));

    expect(screen.getByText(common("notMentioned"))).toBeInTheDocument();
    expect(screen.queryByText(common("no"))).not.toBeInTheDocument();
  });

  it("says when no Japanese is required rather than printing a level", async () => {
    await renderPage(loadedJob(structured({ required_japanese: "none" })));

    expect(screen.getByText(j("notRequired"))).toBeInTheDocument();
  });

  it("says when a role is open to fresh graduates", async () => {
    await renderPage(loadedJob(structured({ required_experience_years: 0 })));

    expect(screen.getByText(j("freshGrads"))).toBeInTheDocument();
  });

  it("lists requirements and benefits", async () => {
    await renderPage(loadedJob());

    expect(screen.getByText(j("keyRequirements"))).toBeInTheDocument();
    expect(screen.getByText(STRUCTURED.key_requirements[0] as string)).toBeInTheDocument();
    expect(screen.getByText(j("benefits"))).toBeInTheDocument();
    expect(screen.getByText(STRUCTURED.benefits[0] as string)).toBeInTheDocument();
  });

  it("leaves out an empty list rather than an empty heading", async () => {
    await renderPage(loadedJob(structured({ key_requirements: [], benefits: [] })));

    expect(screen.queryByText(j("keyRequirements"))).not.toBeInTheDocument();
    expect(screen.queryByText(j("benefits"))).not.toBeInTheDocument();
  });

  it("shows nothing structured when the extraction produced nothing", async () => {
    await renderPage(loadedJob({ structured_data: null }));

    expect(screen.queryByText(j("jobDetails"))).not.toBeInTheDocument();
  });
});

describe("job detail page, the translated description", () => {
  it("shows the summary and the body", async () => {
    await renderPage(loadedJob());

    expect(screen.getByText(JOB.translation_summary as string)).toBeInTheDocument();
    expect(screen.getByText(JOB.translated_description as string)).toBeInTheDocument();
  });

  it("expands and collapses the body", async () => {
    await renderPage(loadedJob());

    const toggle = screen.getByRole("button", { name: j("showFull") });
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: j("showLess") })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: j("showLess") }));
    expect(screen.getByRole("button", { name: j("showFull") })).toBeInTheDocument();
  });

  it("keeps the summary with no body to expand", async () => {
    await renderPage(loadedJob({ translated_description: null }));

    expect(screen.getByText(JOB.translation_summary as string)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: j("showFull") })).not.toBeInTheDocument();
  });

  it("shows no section at all when there is no translation", async () => {
    await renderPage(loadedJob({ translated_description: null, translation_summary: null }));

    expect(screen.queryByText(j("translatedDesc"))).not.toBeInTheDocument();
  });
});

describe("job detail page, the friendliness score", () => {
  it.each([
    [85, "veryAccessible"],
    [80, "veryAccessible"],
    [79, "accessible"],
    [60, "accessible"],
    [59, "challenging"],
    [40, "challenging"],
    [39, "veryDifficult"],
  ] as Array<[number, Parameters<typeof j>[0]]>)("calls a score of %i %s", async (score, key) => {
    await renderPage(loadedJob({ foreigner_friendliness_score: score }));

    expect(screen.getByText(j(key))).toBeInTheDocument();
    expect(screen.getByText(String(score))).toBeInTheDocument();
  });

  it("shows no card when the posting was never scored", async () => {
    await renderPage(loadedJob({ foreigner_friendliness_score: null }));

    expect(screen.queryByText(j("foreignerFriendly"))).not.toBeInTheDocument();
  });
});

describe("job detail page, the job id card", () => {
  it("offers the id and both document links", async () => {
    await renderPage(loadedJob());

    expect(screen.getByText(JOB_ID)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: j("generateRirekishoForJob") })).toHaveAttribute(
      "href",
      `/dashboard/documents/rirekisho/new?job=${JOB_ID}`,
    );
    expect(screen.getByRole("link", { name: j("generateShokumuForJob") })).toHaveAttribute(
      "href",
      `/dashboard/documents/shokumu/new?job=${JOB_ID}`,
    );
  });

  it("confirms a copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    await renderPage(loadedJob());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: j("copy") }));
    });

    expect(writeText).toHaveBeenCalledWith(JOB_ID);
    expect(screen.getByRole("button", { name: j("copied") })).toBeInTheDocument();
  });
});

describe("job detail page, the tracker", () => {
  it("offers to add a posting that is not tracked", async () => {
    await renderPage(loadedJob());

    fireEvent.click(screen.getByRole("button", { name: j("addToTracker") }));

    expect(createApplication.calls).toEqual([{ job_posting_id: JOB_ID }]);
  });

  it("reports the status instead once the posting is tracked", async () => {
    applicationsQuery.current = {
      data: [{ id: "a1", job_posting_id: JOB_ID, status: "planning" }],
      isLoading: false,
    };
    await renderPage(loadedJob());

    expect(screen.getByText(new RegExp(j("colPlanning")))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: j("addToTracker") })).not.toBeInTheDocument();
  });

  it("ignores an application for a different posting", async () => {
    applicationsQuery.current = {
      data: [{ id: "a1", job_posting_id: "another-job", status: "applied" }],
      isLoading: false,
    };
    await renderPage(loadedJob());

    expect(screen.getByRole("button", { name: j("addToTracker") })).toBeInTheDocument();
  });

  it("offers nothing until it knows whether the posting is tracked", async () => {
    // Offering Add while the list is still loading invites a duplicate.
    applicationsQuery.current = { data: undefined, isLoading: true };
    await renderPage(loadedJob());

    expect(screen.queryByRole("button", { name: j("addToTracker") })).not.toBeInTheDocument();
  });

  it("explains a failure to add", async () => {
    createApplication.current = {
      ...createApplication.current,
      error: new ApiClientError(500, "boom"),
    };
    await renderPage(loadedJob());

    expect(screen.getByRole("alert")).toHaveTextContent(common("errorServer"));
  });
});

describe("job detail page, scoring a resume against the posting", () => {
  it("will not score until a resume is chosen", async () => {
    await renderPage(loadedJob());

    expect(screen.getByRole("button", { name: j("scoreBtn") })).toBeDisabled();
  });

  it("scores the chosen resume", async () => {
    await renderPage(loadedJob());

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "r2" } });
    fireEvent.click(screen.getByRole("button", { name: j("scoreBtn") }));

    expect(matchMutation.calls).toEqual([{ resume_id: "r2" }]);
  });

  it("marks the primary resume in the list", async () => {
    await renderPage(loadedJob());

    expect(
      screen.getByRole("option", { name: `cv.pdf (${common("primary")})` }),
    ).toBeInTheDocument();
  });

  it("points at uploading one when there are none", async () => {
    resumesQuery.current = { data: { items: [], total: 0 }, isLoading: false };
    await renderPage(loadedJob());

    expect(screen.getByRole("link", { name: j("uploadResumeTo") })).toHaveAttribute(
      "href",
      "/dashboard/resumes",
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("says a score is being worked out", async () => {
    matchMutation.current = { ...matchMutation.current, isPending: true };
    await renderPage(loadedJob());

    expect(screen.getByRole("button", { name: j("scoring") })).toBeDisabled();
  });

  it("explains a refusal by its status", async () => {
    matchMutation.current = {
      ...matchMutation.current,
      error: new ApiClientError(500, "boom"),
    };
    await renderPage(loadedJob());

    expect(screen.getByRole("alert")).toHaveTextContent(common("errorServer"));
  });

  it("treats a 422 as a precondition, not a bad request", async () => {
    // Either the posting has no translation yet or the resume cannot be
    // read -- neither is something the reader typed wrongly.
    matchMutation.current = {
      ...matchMutation.current,
      error: new ApiClientError(422, "no translation"),
    };
    await renderPage(loadedJob());

    expect(screen.getByRole("alert")).toHaveTextContent(j("matchNotPossible"));
    expect(screen.getByRole("alert")).not.toHaveTextContent(common("errorInvalidInput"));
  });
});

describe("job detail page, a match result", () => {
  it("shows the score, every sub-score and the summary", async () => {
    cachedMatch.current = MATCH;
    await renderPage(loadedJob());

    expect(screen.getByText("42")).toBeInTheDocument();
    for (const [label, value] of [
      [j("skills"), "20"],
      [j("expLabel"), "40"],
      [j("japanese"), "80"],
      [j("cultureFit"), "50"],
    ] as Array<[string, string]>) {
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(value)).toBeInTheDocument();
    }
    expect(screen.getByText(MATCH.match_breakdown.summary)).toBeInTheDocument();
  });

  it("lists strengths, gaps and actions", async () => {
    cachedMatch.current = MATCH;
    await renderPage(loadedJob());

    for (const key of ["strengths", "gaps", "actions"] as Array<Parameters<typeof j>[0]>) {
      expect(screen.getByText(j(key))).toBeInTheDocument();
    }
    expect(screen.getByText("Computer Science degree")).toBeInTheDocument();
  });

  it("leaves out a list the model returned empty", async () => {
    cachedMatch.current = {
      ...MATCH,
      recommendations: { strengths: [], gaps: ["Only a gap"], actions: [] },
    };
    await renderPage(loadedJob());

    expect(screen.queryByText(j("strengths"))).not.toBeInTheDocument();
    expect(screen.getByText(j("gaps"))).toBeInTheDocument();
  });

  it("shows the scores when there are no recommendations at all", async () => {
    cachedMatch.current = { ...MATCH, recommendations: null };
    await renderPage(loadedJob());

    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.queryByText(j("strengths"))).not.toBeInTheDocument();
  });

  it("shows nothing until a score has been worked out", async () => {
    await renderPage(loadedJob());

    expect(screen.queryByText(j("overallMatch"))).not.toBeInTheDocument();
  });
});
