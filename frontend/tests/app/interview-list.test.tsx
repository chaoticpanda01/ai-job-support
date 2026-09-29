import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";

const sessions = vi.hoisted(() => ({ current: {} as Record<string, unknown>, refetches: 0 }));
vi.mock("@/hooks/useInterview", () => ({ useInterviewSessions: () => sessions.current }));

const InterviewPage = (await import("@/app/dashboard/interview/page")).default;

const LANG = "ja";
const iv = (key: Parameters<typeof t>[1]) => t("interview", key, LANG);

async function renderPage(over: Record<string, unknown>) {
  sessions.current = {
    data: undefined,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: () => {
      sessions.refetches += 1;
      return Promise.resolve();
    },
    ...over,
  };
  await act(async () => {
    renderIn(LANG, <InterviewPage />);
  });
}

const SESSION = {
  id: "s1",
  session_type: "general",
  language: "ja",
  status: "completed",
  target_role: null,
  target_company: null,
  overall_score: 82,
  feedback_summary: null,
  completed_at: "2026-09-01T00:00:00Z",
  created_at: "2026-09-01T00:00:00Z",
};

beforeEach(() => {
  sessions.refetches = 0;
});

describe("the interview list", () => {
  it("is titled under Apply, with a way to start a session", async () => {
    await renderPage({ data: [] });
    expect(screen.getByRole("heading", { level: 1, name: iv("title") })).toBeInTheDocument();
    expect(screen.getByText(t("nav", "groupApply", LANG))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: iv("newSession") })).toHaveAttribute(
      "href",
      "/dashboard/interview/new",
    );
  });

  it("offers a first session when there are none", async () => {
    await renderPage({ data: [] });
    expect(screen.getByText(iv("noSessions"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: iv("startFirst") })).toHaveAttribute(
      "href",
      "/dashboard/interview/new",
    );
  });

  it("explains a failed load, and retries it", async () => {
    await renderPage({ error: new ApiClientError(500, "boom") });
    expect(screen.getByRole("alert")).toHaveTextContent(iv("loadError"));
    fireEvent.click(screen.getByRole("button", { name: t("common", "tryAgain", LANG) }));
    expect(sessions.refetches).toBe(1);
  });

  it("colours a good score as good", async () => {
    await renderPage({ data: [SESSION] });
    expect(screen.getByText("82")).toHaveClass("text-success");
  });
});
