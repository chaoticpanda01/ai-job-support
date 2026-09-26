import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderIn } from "../helpers";
import { t, type Language } from "@/lib/i18n";
import { computeJourney, type JourneyInput } from "@/lib/journey";
import type {
  Document,
  MeResponse,
  Resume,
  ResumeAnalysis,
  VisaConsultationListItem,
} from "@/types/api";

const state = vi.hoisted(() => ({
  result: undefined as unknown,
  retries: [] as string[],
  retrying: [] as string[],
}));
vi.mock("@/hooks/useJourney", () => ({ useJourney: () => state.result }));

const HomePage = (await import("@/app/dashboard/page")).default;

const me = (full_name: string | null, rirekisho_ready = true) =>
  ({ rirekisho_ready, user: { full_name, email: "a@example.com" } }) as MeResponse;

const MID_JOURNEY: JourneyInput = {
  me: me("Budi Santoso"),
  resumes: [
    {
      id: "r1",
      file_name: "cv.pdf",
      created_at: "2026-09-20T00:00:00+00:00",
      is_primary: true,
    } as Resume,
  ],
  primaryAnalysis: { id: "a1", created_at: "2026-09-21T00:00:00+00:00" } as ResumeAnalysis,
  documents: [
    {
      id: "d1",
      document_type: "rirekisho",
      status: "completed",
      completed_at: "2026-09-22T00:00:00+00:00",
      created_at: "2026-09-22T00:00:00+00:00",
    },
  ] as Document[],
  applications: [],
  interviewSessions: [],
  visaConsultations: [],
};

const FINISHED: JourneyInput = {
  ...MID_JOURNEY,
  documents: [
    ...(MID_JOURNEY.documents as Document[]),
    {
      id: "d2",
      document_type: "shokumukeirekisho",
      status: "completed",
      completed_at: null,
      created_at: "2026-09-23T00:00:00+00:00",
    } as Document,
  ],
  applications: [
    { id: "app1", job_title: "SRE", created_at: "2026-09-24T00:00:00+00:00" },
  ] as never,
  interviewSessions: [
    {
      id: "s1",
      status: "completed",
      completed_at: "2026-09-25T00:00:00+00:00",
      created_at: "2026-09-25T00:00:00+00:00",
    },
  ] as never,
  visaConsultations: [
    { id: "v1", created_at: "2026-09-25T06:00:00+00:00" } as VisaConsultationListItem,
  ],
};

function setJourney(input: JourneyInput, isLoading = false) {
  state.result = {
    journey: computeJourney(input),
    input,
    isLoading,
    retry: (step: string) => state.retries.push(step),
    retrying: (step: string) => state.retrying.includes(step),
  };
}

beforeEach(() => {
  state.retries = [];
  state.retrying = [];
  setJourney(MID_JOURNEY);
});

const j = (key: string, lang: Language = "en") => t("journey", key, lang);
const h = (key: string, lang: Language = "en") => t("home", key, lang);

describe("Home", () => {
  it("greets the user by first name in the page's one h1", () => {
    renderIn("en", <HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      h("greetingNamed").replace("{name}", "Budi"),
    );
  });

  it("greets without a name when none is set", () => {
    setJourney({ ...MID_JOURNEY, me: me(null) });
    renderIn("en", <HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(h("greeting"));
  });

  it("shows overall progress", () => {
    renderIn("en", <HomePage />);
    expect(screen.getByRole("progressbar", { name: h("progressLabel") })).toHaveAttribute(
      "aria-valuenow",
      "4",
    );
    expect(
      screen.getByText(h("progress").replace("{done}", "4").replace("{total}", "8")),
    ).toBeInTheDocument();
  });

  it("suggests the next step with a link to it", () => {
    renderIn("en", <HomePage />);
    expect(screen.getByRole("heading", { name: j("shokumuTitle") })).toBeInTheDocument();
    expect(screen.getByText(j("shokumuWhy"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: j("shokumuCta") })).toHaveAttribute(
      "href",
      "/dashboard/documents/shokumu/new",
    );
  });

  it("lays the steps out by stage, each linking to its page", () => {
    renderIn("en", <HomePage />);
    const prepare = screen.getByRole("list", { name: new RegExp(t("nav", "groupPrepare", "en")) });
    expect(within(prepare).getAllByRole("link")).toHaveLength(5);
    expect(within(prepare).getByRole("link", { name: new RegExp(j("rirekisho")) })).toHaveAttribute(
      "href",
      "/dashboard/documents/rirekisho/new",
    );
  });

  it("tells a screen reader which steps are done", () => {
    renderIn("en", <HomePage />);
    expect(
      screen.getByRole("link", { name: `${j("rirekisho")} ${h("stepDone")}` }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: j("application") })).toBeInTheDocument();
  });

  it("says when a step couldn't be checked, and retries it", () => {
    setJourney({ ...MID_JOURNEY, visaConsultations: undefined });
    renderIn("en", <HomePage />);
    expect(screen.getByText(h("couldntCheck"))).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(t("common", "tryAgain", "en")) }),
    );

    expect(state.retries).toEqual(["visa"]);
  });

  it("shows the retry is under way", () => {
    state.retrying = ["visa"];
    setJourney({ ...MID_JOURNEY, visaConsultations: undefined });
    renderIn("en", <HomePage />);
    const retry = screen.getByRole("button", { name: new RegExp(t("common", "tryAgain", "en")) });
    expect(retry).toHaveAttribute("aria-busy", "true");
    expect(retry).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(retry);
    expect(state.retries).toEqual([]);
  });

  it("celebrates a finished journey instead of suggesting a step", () => {
    setJourney(FINISHED);
    renderIn("en", <HomePage />);
    expect(screen.getByRole("heading", { name: h("allDoneTitle") })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: h("allDoneCta") })).toHaveAttribute(
      "href",
      "/dashboard/culture",
    );
    expect(screen.queryByText(h("nextStep"))).not.toBeInTheDocument();
  });

  it("lists recent activity, newest first, capped at five", () => {
    setJourney(FINISHED);
    renderIn("en", <HomePage />);
    const activity = screen.getByRole("list", { name: h("activityTitle") });
    const rows = within(activity).getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent(h("activityVisa"));
    // The label and the relative time are separate words, not "checkedlast month".
    expect(rows[0]?.textContent).toMatch(new RegExp(`${h("activityVisa")} \\S`));
    expect(rows[1]).toHaveTextContent(h("activityInterview"));
  });

  it("shows no activity card for a brand-new user", () => {
    setJourney({
      me: me("Budi Santoso", false),
      resumes: [],
      primaryAnalysis: null,
      documents: [],
      applications: [],
      interviewSessions: [],
      visaConsultations: [],
    });
    renderIn("en", <HomePage />);
    expect(screen.queryByRole("heading", { name: h("activityTitle") })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: j("profileTitle") })).toBeInTheDocument();
  });

  it("shows skeletons, not a half-built board, while loading", () => {
    setJourney(MID_JOURNEY, true);
    const { container } = renderIn("en", <HomePage />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("renders in Japanese", () => {
    renderIn("ja", <HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("おかえりなさい、Budiさん");
    expect(screen.getByRole("heading", { name: j("shokumuTitle", "ja") })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: j("application", "ja") })).toBeInTheDocument();
  });
});
