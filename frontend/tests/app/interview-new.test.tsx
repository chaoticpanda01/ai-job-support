import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderIn } from "../helpers";
import { t } from "@/lib/i18n";
import type * as InterviewHooks from "@/hooks/useInterview";

const interview = vi.hoisted(() => ({ created: [] as unknown[] }));

const search = vi.hoisted(() => ({ current: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
  useSearchParams: () => new URLSearchParams(search.current),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
  useSearchParams: () => new URLSearchParams(search.current),
}));
// Only useInterview is replaced; streamErrorMessage stays the real one.
vi.mock("@/hooks/useInterview", async (importOriginal) => ({
  ...(await importOriginal<typeof InterviewHooks>()),
  useInterview: () => ({
    sessionId: null,
    state: { isStreaming: false, error: null },
    createSession: (request: unknown) => interview.created.push(request),
  }),
}));

const NewInterviewPage = (await import("@/app/dashboard/interview/new/page")).default;

const LANG = "ja";
const iv = (key: Parameters<typeof t>[1]) => t("interview", key, LANG);

async function renderPage() {
  await act(async () => {
    renderIn(LANG, <NewInterviewPage />);
  });
}

beforeEach(() => {
  interview.created = [];
  search.current = "";
});

describe("the new interview session page", () => {
  it("labels every field", async () => {
    await renderPage();
    expect(screen.getByRole("group", { name: iv("interviewType") })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: iv("interviewLang") })).toBeInTheDocument();
    // These had only placeholders before.
    expect(screen.getByRole("textbox", { name: new RegExp(iv("roleLabel")) })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: new RegExp(iv("companyLabel")) }),
    ).toBeInTheDocument();
  });

  it("fills in the role and company a job's stage panel sent", async () => {
    search.current = "role=Backend+Engineer&company=Test+K.K.";
    await renderPage();

    expect(screen.getByRole("textbox", { name: new RegExp(iv("roleLabel")) })).toHaveValue(
      "Backend Engineer",
    );
    expect(screen.getByRole("textbox", { name: new RegExp(iv("companyLabel")) })).toHaveValue(
      "Test K.K.",
    );
  });

  it("picks an interview type from its card", async () => {
    await renderPage();
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1] as HTMLElement);
    expect(radios[1]).toBeChecked();
  });

  it("starts the session with the role typed into its labelled box", async () => {
    await renderPage();
    fireEvent.change(screen.getByRole("textbox", { name: new RegExp(iv("roleLabel")) }), {
      target: { value: "Backend Engineer" },
    });
    fireEvent.click(screen.getByRole("button", { name: iv("startBtn") }));
    expect(interview.created).toEqual([
      expect.objectContaining({ session_type: "general", target_role: "Backend Engineer" }),
    ]);
  });
});
