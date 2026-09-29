import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";

const docs = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  filters: [] as Array<string | undefined>,
  refetches: 0,
}));

vi.mock("@/hooks/useDocuments", () => ({
  useDocuments: (type?: string) => {
    docs.filters.push(type);
    return docs.current;
  },
  useDeleteDocument: () => ({ mutate: () => {}, isPending: false }),
}));
vi.mock("@/components/confirm-dialog-provider", () => ({
  useConfirm: () => () => Promise.resolve(false),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));

const DocumentsPage = (await import("@/app/dashboard/documents/page")).default;

const LANG = "ja";
const d = (key: Parameters<typeof t>[1]) => t("documents", key, LANG);

function query(over: Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: () => {
      docs.refetches += 1;
      return Promise.resolve();
    },
    ...over,
  };
}

async function renderPage(over: Record<string, unknown>) {
  docs.current = query(over);
  await act(async () => {
    renderIn(LANG, <DocumentsPage />);
  });
}

const DOC = {
  id: "d1",
  document_type: "rirekisho",
  status: "processing",
  created_at: "2026-09-01T00:00:00Z",
};

beforeEach(() => {
  docs.filters = [];
  docs.refetches = 0;
});

describe("the documents list", () => {
  it("is titled under Prepare", async () => {
    await renderPage({ data: { items: [], total: 0 } });
    expect(screen.getByRole("heading", { level: 1, name: d("title") })).toBeInTheDocument();
    expect(screen.getByText(t("nav", "groupPrepare", LANG))).toBeInTheDocument();
  });

  it("filters by type from a pressed-button group", async () => {
    await renderPage({ data: { items: [], total: 0 } });
    const group = screen.getByRole("group", { name: d("filterLabel") });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: d("all") })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "履歴書" }));
    expect(screen.getByRole("button", { name: "履歴書" })).toHaveAttribute("aria-pressed", "true");
    expect(docs.filters.at(-1)).toBe("rirekisho");
  });

  it("says so when there are no documents, with links to make one", async () => {
    await renderPage({ data: { items: [], total: 0 } });
    expect(screen.getByText(d("noDocuments"))).toBeInTheDocument();
    // The header's two buttons and the empty state's two links.
    expect(screen.getAllByRole("link", { name: /履歴書/ }).length).toBeGreaterThanOrEqual(2);
  });

  it("explains a failed load, and retries it", async () => {
    await renderPage({ error: new ApiClientError(500, "boom") });
    expect(screen.getByRole("alert")).toHaveTextContent(d("loadError"));
    fireEvent.click(screen.getByRole("button", { name: t("common", "tryAgain", LANG) }));
    expect(docs.refetches).toBe(1);
  });

  it("shows each document's status", async () => {
    await renderPage({ data: { items: [DOC], total: 1 } });
    expect(screen.getByText(d("statusProcessing"))).toBeInTheDocument();
  });
});
