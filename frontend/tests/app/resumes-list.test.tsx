import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, type RenderResult } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import { LanguageProvider } from "@/lib/language-context";

const resumes = vi.hoisted(() => ({ current: {} as Record<string, unknown>, refetches: 0 }));

vi.mock("@/hooks/useResumes", () => ({
  useResumes: () => resumes.current,
  useDeleteResume: () => ({ mutate: () => {}, isPending: false }),
  useSetPrimaryResume: () => ({ mutate: () => {}, isPending: false }),
}));
// Pulls in react-dropzone and the upload hook; the list doesn't depend on it.
vi.mock("@/components/resume/ResumeUploader", () => ({ ResumeUploader: () => null }));
vi.mock("@/components/confirm-dialog-provider", () => ({
  useConfirm: () => () => Promise.resolve(false),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));

const ResumesPage = (await import("@/app/dashboard/resumes/page")).default;

const LANG = "ja";
const r = (key: Parameters<typeof t>[1]) => t("resumes", key, LANG);

function query(over: Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: () => {
      resumes.refetches += 1;
      return Promise.resolve();
    },
    ...over,
  };
}

async function renderPage(over: Record<string, unknown>): Promise<RenderResult> {
  resumes.current = query(over);
  let view: RenderResult | null = null;
  await act(async () => {
    view = renderIn(LANG, <ResumesPage />);
  });
  return view as unknown as RenderResult;
}

const RESUME = {
  id: "r1",
  file_name: "cv.pdf",
  file_size_bytes: 2048,
  mime_type: "application/pdf",
  is_primary: true,
  created_at: "2026-09-01T00:00:00Z",
};

beforeEach(() => {
  resumes.refetches = 0;
});

describe("the resumes list", () => {
  it("is titled under Prepare", async () => {
    await renderPage({ data: { items: [], total: 0 } });
    expect(screen.getByRole("heading", { level: 1, name: r("title") })).toBeInTheDocument();
    expect(screen.getByText(t("nav", "groupPrepare", LANG))).toBeInTheDocument();
  });

  it("shows a skeleton while loading", async () => {
    const { container } = await renderPage({ isLoading: true });
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("says so when there are no resumes", async () => {
    await renderPage({ data: { items: [], total: 0 } });
    expect(screen.getByText(r("noResumes"))).toBeInTheDocument();
  });

  it("explains a failed load, and retries it", async () => {
    await renderPage({ error: new ApiClientError(500, "boom") });
    expect(screen.getByRole("alert")).toHaveTextContent(r("loadError"));
    fireEvent.click(screen.getByRole("button", { name: t("common", "tryAgain", LANG) }));
    expect(resumes.refetches).toBe(1);
  });

  it("announces a repeated failure again, keeping focus on Try again", async () => {
    const view = await renderPage({ error: new ApiClientError(500, "boom"), errorUpdateCount: 1 });
    const message = screen.getByRole("alert");
    const retry = screen.getByRole("button", { name: t("common", "tryAgain", LANG) });
    retry.focus();
    resumes.current = query({ error: new ApiClientError(500, "boom"), errorUpdateCount: 2 });
    await act(async () => {
      view.rerender(
        <LanguageProvider initialLang={LANG}>
          <ResumesPage />
        </LanguageProvider>,
      );
    });
    expect(screen.getByRole("alert")).not.toBe(message);
    expect(document.activeElement).toBe(retry);
  });

  it("marks the primary resume", async () => {
    await renderPage({ data: { items: [RESUME], total: 1 } });
    expect(screen.getByText(t("common", "primary", LANG))).toBeInTheDocument();
  });
});
