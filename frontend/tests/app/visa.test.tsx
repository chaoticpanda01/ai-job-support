import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";

const visa = vi.hoisted(() => ({ latest: {} as Record<string, unknown>, refetches: 0 }));

vi.mock("@/hooks/useVisa", () => ({
  useLatestVisaConsultation: () => visa.latest,
  useVisaConsultations: () => ({ data: [] }),
  useAssessVisa: () => ({ mutate: () => {}, isPending: false, error: null }),
  useSelectRoadmap: () => ({
    mutate: () => {},
    isPending: false,
    error: null,
    variables: undefined,
  }),
}));

const VisaPage = (await import("@/app/dashboard/visa/page")).default;

const LANG = "ja";
const v = (key: Parameters<typeof t>[1]) => t("visa", key, LANG);

async function renderPage(over: Record<string, unknown>) {
  visa.latest = {
    data: undefined,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: () => {
      visa.refetches += 1;
      return Promise.resolve();
    },
    ...over,
  };
  await act(async () => {
    renderIn(LANG, <VisaPage />);
  });
}

beforeEach(() => {
  visa.refetches = 0;
});

describe("the visa page", () => {
  it("is titled under Settle in", async () => {
    await renderPage({ error: new ApiClientError(404, "none") });
    expect(screen.getByRole("heading", { level: 1, name: v("title") })).toBeInTheDocument();
    expect(screen.getByText(t("nav", "groupSettleIn", LANG))).toBeInTheDocument();
  });

  it("explains there is no assessment yet", async () => {
    await renderPage({ error: new ApiClientError(404, "none") });
    expect(screen.getByText(v("noAssessment"))).toBeInTheDocument();
    expect(screen.getByText(v("noAssessmentSub"))).toBeInTheDocument();
  });

  it("explains a failed load, and retries it", async () => {
    await renderPage({ error: new ApiClientError(500, "boom") });
    expect(screen.getByRole("alert")).toHaveTextContent(v("loadFail"));
    fireEvent.click(screen.getByRole("button", { name: t("common", "tryAgain", LANG) }));
    expect(visa.refetches).toBe(1);
  });
});
