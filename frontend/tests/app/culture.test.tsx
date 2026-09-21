import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderIn } from "../helpers";
import { t } from "@/lib/i18n";

const topicsQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const glossaryQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("@/hooks/useCulture", () => ({
  useCultureTopics: () => topicsQuery.current,
  useGlossary: () => glossaryQuery.current,
}));

const CulturePage = (await import("@/app/dashboard/culture/page")).default;

const LOADING = {
  data: undefined,
  isLoading: true,
  error: null,
  isFetching: true,
  refetch: () => {},
};
// A retry in flight after a failure: react-query sets isLoading back to true
// while error still holds the previous failure, since there's still no data.
const RETRYING_AFTER_FAILURE = {
  data: undefined,
  isLoading: true,
  error: new Error("boom"),
  isFetching: true,
  refetch: () => {},
};
const FAILED = {
  data: undefined,
  isLoading: false,
  error: new Error("boom"),
  isFetching: false,
  refetch: () => {},
};
const EMPTY = { data: [], isLoading: false, error: null, isFetching: false, refetch: () => {} };
const LOADED = {
  data: [{ id: "1", slug: "keigo", title: "Keigo", tags: [], published_at: "2026-01-01" }],
  isLoading: false,
  error: null,
  isFetching: false,
  refetch: () => {},
};

function renderCulture(topics: Record<string, unknown>, glossary: Record<string, unknown>) {
  topicsQuery.current = topics;
  glossaryQuery.current = glossary;
  return renderIn("ja", <CulturePage />);
}

describe("culture page", () => {
  it("says so when topics fail to load", () => {
    renderCulture(FAILED, EMPTY);

    expect(screen.getByRole("alert")).toHaveTextContent(t("culture", "topicsLoadError", "ja"));
  });

  it("offers a retry rather than telling the reader to refresh", () => {
    renderCulture(FAILED, EMPTY);

    expect(screen.getByRole("button", { name: t("common", "tryAgain", "ja") })).toBeInTheDocument();
  });

  it("does not show a failed load as an empty shelf", () => {
    // The empty state is guarded on the list being present, so before this
    // the page rendered a heading, the tabs, and nothing else.
    renderCulture(FAILED, EMPTY);

    expect(screen.queryByText(t("culture", "noTopics", "ja"))).not.toBeInTheDocument();
  });

  it("shows no error while a load is still running", () => {
    renderCulture(LOADING, EMPTY);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the skeleton, not a stale error, while retrying after a failure", () => {
    // Distinct from the case above: here error is truthy too, so this only
    // passes because the page also checks !topicsLoading before rendering
    // LoadFailure, not just topicsError.
    renderCulture(RETRYING_AFTER_FAILURE, EMPTY);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the empty state for a genuinely empty result", () => {
    renderCulture(EMPTY, EMPTY);

    expect(screen.getByText(t("culture", "noTopics", "ja"))).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lists topics that loaded, with no error", () => {
    renderCulture(LOADED, EMPTY);

    expect(screen.getByText("Keigo")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
