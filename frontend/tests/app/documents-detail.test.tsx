import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import type { DocumentErrorCode } from "@/types/api";

const statusQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const detailQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("@/hooks/useDocuments", () => ({
  useDocumentStatus: () => statusQuery.current,
  useDocumentDetail: () => detailQuery.current,
}));

const DocumentDetailPage = (await import("@/app/dashboard/documents/[id]/page")).default;

// Typed loosely (matching statusQuery/detailQuery above) so the per-test
// overrides below — a download_url, an ApiClientError — aren't narrowed away
// by inference from this base object's literal `undefined`/`null` fields.
const NO_DETAIL: Record<string, unknown> = {
  data: undefined,
  error: null,
  errorCount: 0,
  isFetching: false,
  refetch: () => {},
};

/**
 * Render the page and wait for its route params to resolve.
 *
 * The page reads `params` with `use()`, which suspends even on an
 * already-resolved promise: React only re-renders the suspended tree once
 * the thrown promise settles. `renderIn` calls RTL's `render()`, which wraps
 * only the initial (suspending) render in a *synchronous* `act()` — that
 * flush can't wait on a promise, so the retry never happens and the page is
 * stuck on the Suspense fallback forever, no matter how long a later
 * `findBy*` polls. Wrapping the render itself in `act(async () => ...)`
 * makes `act` await the pending thenable and drive the retry render before
 * resolving, so the page's real content is in the DOM as soon as this
 * returns.
 */
async function renderPage(status: Record<string, unknown>, detail = NO_DETAIL) {
  statusQuery.current = status;
  detailQuery.current = detail;
  await act(async () => {
    renderIn(
      "ja",
      <Suspense fallback={null}>
        <DocumentDetailPage params={Promise.resolve({ id: "d1" })} />
      </Suspense>,
    );
  });
  // Anything rendered by the page proves the params resolved. Breadcrumbs
  // render a <nav aria-label="Breadcrumb"> on every branch these tests
  // exercise, so asserting on it here is a safe sanity check before the
  // per-test assertions run.
  expect(screen.getByRole("navigation")).toBeInTheDocument();
}

function statusState(over: Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: false,
    loadError: null,
    pollError: null,
    errorCount: 1,
    isChecking: false,
    recheck: () => {},
    ...over,
  };
}

function failedWith(code: string | null) {
  return statusState({ data: { status: "failed", error_code: code, completed_at: null } });
}

describe("document detail page, no document to show", () => {
  it("says not found for a 404, with nothing to retry", async () => {
    await renderPage(statusState({ loadError: new ApiClientError(404, "gone") }));

    expect(screen.getByText(t("documents", "notFound", "ja"))).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: t("common", "tryAgain", "ja") }),
    ).not.toBeInTheDocument();
  });

  it("offers a retry for a failure that might not repeat", async () => {
    await renderPage(statusState({ loadError: new ApiClientError(500, "boom") }));

    expect(screen.getByRole("alert")).toHaveTextContent(t("documents", "statusLoadError", "ja"));
    expect(screen.getByRole("button", { name: t("common", "tryAgain", "ja") })).toBeInTheDocument();
    expect(screen.queryByText(t("documents", "notFound", "ja"))).not.toBeInTheDocument();
  });

  it("keeps the retry button focusable while it re-checks", async () => {
    await renderPage(statusState({ loadError: new ApiClientError(500, "boom"), isChecking: true }));

    const button = screen.getByRole("button", { name: t("common", "retrying", "ja") });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
  });
});

describe("document detail page, a document that failed", () => {
  const CODES: Array<[DocumentErrorCode, string]> = [
    ["budget_exceeded", "genFailedBudget"],
    ["profile_incomplete", "genFailedProfile"],
    ["resume_missing", "genFailedResume"],
    ["file_unavailable", "genFailedFile"],
    ["unreadable_file", "genFailedUnreadable"],
    ["ai_failed", "genFailedAi"],
    ["pdf_failed", "genFailedPdf"],
    ["upload_failed", "genFailedUpload"],
    ["timed_out", "genFailedTimeout"],
    ["unknown", "genFailedUnknown"],
  ];

  it.each(CODES)("explains the %s failure", async (code, key) => {
    await renderPage(failedWith(code));

    expect(screen.getByRole("alert")).toHaveTextContent(t("documents", key, "ja"));
  });

  it("falls back for a code this version doesn't know", async () => {
    await renderPage(failedWith("a_code_from_a_newer_backend"));

    expect(screen.getByRole("alert")).toHaveTextContent(t("documents", "genFailedUnknown", "ja"));
  });

  it("falls back for a failure recorded before codes existed", async () => {
    await renderPage(failedWith(null));

    expect(screen.getByRole("alert")).toHaveTextContent(t("documents", "genFailedUnknown", "ja"));
  });

  it("links to settings for the one failure fixed elsewhere", async () => {
    await renderPage(failedWith("profile_incomplete"));

    expect(
      screen.getByRole("link", { name: t("documents", "goToSettings", "ja") }),
    ).toHaveAttribute("href", "/dashboard/settings");
  });

  it("does not link to settings for other failures", async () => {
    await renderPage(failedWith("ai_failed"));

    expect(
      screen.queryByRole("link", { name: t("documents", "goToSettings", "ja") }),
    ).not.toBeInTheDocument();
  });
});

describe("document detail page, a document still running", () => {
  const RUNNING = statusState({
    data: { status: "processing", error_code: null, completed_at: null },
  });

  it("shows progress", async () => {
    await renderPage(RUNNING);

    expect(screen.getByText(t("documents", "generating", "ja"))).toBeInTheDocument();
  });

  it("warns that a failed poll may have left it out of date, without hiding it", async () => {
    await renderPage(statusState({ ...RUNNING, pollError: new ApiClientError(500, "boom") }));

    expect(screen.getByRole("alert")).toHaveTextContent(t("documents", "statusPollError", "ja"));
    expect(screen.getByText(t("documents", "generating", "ja"))).toBeInTheDocument();
  });
});

describe("document detail page, a finished document", () => {
  const DONE = statusState({
    data: { status: "completed", error_code: null, completed_at: "2026-09-20T01:00:00Z" },
  });

  it("offers the download once the link arrives", async () => {
    await renderPage(DONE, { ...NO_DETAIL, data: { download_url: "https://example.test/d.pdf" } });

    expect(
      screen.getByRole("link", { name: t("documents", "downloadPdf", "ja") }),
    ).toBeInTheDocument();
  });

  it("says the link is being prepared while it is", async () => {
    await renderPage(DONE);

    expect(screen.getByText(t("documents", "preparingLink", "ja"))).toBeInTheDocument();
  });

  it("distinguishes a failed link from one still being prepared", async () => {
    // The generation succeeded; only signing the URL failed. Before this the
    // page showed the waiting spinner forever.
    await renderPage(DONE, { ...NO_DETAIL, error: new ApiClientError(502, "no url") });

    expect(screen.getByRole("alert")).toHaveTextContent(t("documents", "linkError", "ja"));
    expect(screen.queryByText(t("documents", "preparingLink", "ja"))).not.toBeInTheDocument();
  });
});
