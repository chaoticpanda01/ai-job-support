import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import { computeJourney, type JourneyInput } from "@/lib/journey";
import type { Document, MeResponse, Resume, ResumeAnalysis } from "@/types/api";

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));
const state = vi.hoisted(() => ({
  me: undefined as unknown,
  journey: undefined as unknown,
}));

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@clerk/nextjs", () => ({ UserButton: () => null }));
vi.mock("@/hooks/useMe", () => ({ useMe: () => ({ data: state.me }) }));
vi.mock("@/hooks/useJourney", () => ({ useJourney: () => state.journey }));
vi.mock("@/hooks/useAiQuota", () => ({ useAiQuota: () => ({ data: undefined }) }));

const DashboardLayout = (await import("@/app/dashboard/layout")).default;

const LANG = "en";
const n = (key: string) => t("nav", key, LANG);

/** Prepare finished, nothing in Apply or Settle in. */
const PREPARED: JourneyInput = {
  me: { rirekisho_ready: true } as MeResponse,
  resumes: [{ id: "r1", created_at: "2026-09-01T00:00:00+00:00", is_primary: true } as Resume],
  primaryAnalysis: { id: "a1" } as ResumeAnalysis,
  documents: [
    { id: "d1", document_type: "rirekisho", status: "completed" },
    { id: "d2", document_type: "shokumukeirekisho", status: "completed" },
  ] as Document[],
  applications: [],
  interviewSessions: [],
  visaConsultations: [],
};

function useJourneyResult(input: JourneyInput, isLoading = false) {
  return { journey: computeJourney(input), input, isLoading, retry: vi.fn() };
}

/** The list name a stage group should have: "Prepare, 5 of 5 steps done". */
function groupName(labelKey: string, done: number, total: number) {
  const count = n("stepsDone").replace("{done}", String(done)).replace("{total}", String(total));
  return `${n(labelKey)}${n("countSep")}${count}`;
}

function renderLayout() {
  const ui = () => (
    <LanguageProvider initialLang={LANG}>
      <DashboardLayout>
        <p>page body</p>
      </DashboardLayout>
    </LanguageProvider>
  );
  const view = render(ui());
  return { ...view, rerenderLayout: () => view.rerender(ui()) };
}

beforeEach(() => {
  nav.pathname = "/dashboard";
  state.me = { user: { role: "user", email: "a@example.com", full_name: "Budi Santoso" } };
  state.journey = useJourneyResult(PREPARED);
});

describe("dashboard shell", () => {
  it("renders the page inside the main landmark", () => {
    renderLayout();
    expect(screen.getByRole("main")).toHaveTextContent("page body");
  });

  it("labels the main navigation", () => {
    renderLayout();
    expect(screen.getByRole("navigation", { name: n("main") })).toBeInTheDocument();
  });

  it("names each stage's list with its progress", () => {
    renderLayout();
    expect(screen.getByRole("list", { name: groupName("groupPrepare", 5, 5) })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: groupName("groupApply", 0, 2) })).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: groupName("groupSettleIn", 0, 1) }),
    ).toBeInTheDocument();
  });

  it("hides the counts while the journey loads", () => {
    state.journey = useJourneyResult(PREPARED, true);
    renderLayout();
    expect(screen.getByRole("list", { name: n("groupPrepare") })).toBeInTheDocument();
  });

  it("hides a stage's count when one of its steps couldn't be checked", () => {
    state.journey = useJourneyResult({ ...PREPARED, documents: undefined });
    renderLayout();
    expect(screen.getByRole("list", { name: n("groupPrepare") })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: groupName("groupApply", 0, 2) })).toBeInTheDocument();
  });

  it("marks Home current only on the dashboard itself", () => {
    renderLayout();
    expect(screen.getByRole("link", { name: n("home") })).toHaveAttribute("aria-current", "page");
  });

  it("marks a section current on its sub-pages, and Home not", () => {
    nav.pathname = "/dashboard/resumes/r1";
    renderLayout();
    expect(screen.getByRole("link", { name: n("resumes") })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: n("home") })).not.toHaveAttribute("aria-current");
  });

  it("offers Admin only to admins", () => {
    renderLayout();
    expect(screen.queryByRole("link", { name: n("admin") })).not.toBeInTheDocument();

    state.me = { user: { role: "admin", email: "a@example.com", full_name: null } };
    renderLayout();
    expect(screen.getByRole("link", { name: n("admin") })).toHaveAttribute("href", "/admin");
  });
});

describe("phone drawer", () => {
  it("opens from the menu button as a named dialog", () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: n("openMenu") }));
    expect(screen.getByRole("dialog", { name: n("menu") })).toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the menu button", async () => {
    renderLayout();
    const menuButton = screen.getByRole("button", { name: n("openMenu") });
    // A real click focuses the button first; fireEvent.click doesn't, and
    // Radix returns focus to whatever had it when the dialog opened.
    menuButton.focus();
    fireEvent.click(menuButton);
    const dialog = screen.getByRole("dialog", { name: n("menu") });

    await act(async () => {
      fireEvent.keyDown(dialog, { key: "Escape" });
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Radix hands focus back in a setTimeout(0) after the dialog unmounts.
    await waitFor(() => expect(menuButton).toHaveFocus());
  });

  it("closes when the page changes", () => {
    const { rerenderLayout } = renderLayout();
    fireEvent.click(screen.getByRole("button", { name: n("openMenu") }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    nav.pathname = "/dashboard/visa";
    rerenderLayout();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
