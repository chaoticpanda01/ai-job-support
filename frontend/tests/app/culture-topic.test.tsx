import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, screen, within } from "@testing-library/react";
import { renderIn } from "../helpers";

const topicQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("@/hooks/useCulture", () => ({
  useCultureTopic: () => topicQuery.current,
}));

const CultureTopicPage = (await import("@/app/dashboard/culture/[slug]/page")).default;

const BODY = `## 敬語とは？

大きく3種類に分かれます。

| 種類 | 説明 |
|------|------|
| 尊敬語 | 相手の行為を高める |
| 謙譲語 | 自分の行為を低める |

- 報告
- 連絡

\`\`\`
お疲れ様です。        — greeting colleagues
\`\`\`
`;

async function renderTopic(body: string) {
  topicQuery.current = {
    data: {
      id: "1",
      slug: "keigo-basics",
      title: "敬語の基本",
      body,
      tags: ["keigo"],
      published_at: "2026-06-06",
    },
    isLoading: false,
    error: null,
  };
  // use(params) suspends even on a resolved promise, so render inside an
  // async act for the retry render to run.
  await act(async () => {
    renderIn(
      "en",
      <Suspense fallback={null}>
        <CultureTopicPage params={Promise.resolve({ slug: "keigo-basics" })} />
      </Suspense>,
    );
  });
}

describe("culture topic page, the article body", () => {
  it("renders a Markdown table as a real table, not pipes", async () => {
    await renderTopic(BODY);

    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "種類" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "説明" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "謙譲語" })).toBeInTheDocument();
    expect(screen.queryByText(/\|/)).not.toBeInTheDocument();
  });

  it("scrolls a wide table or code block inside the card, never the page", async () => {
    await renderTopic(BODY);

    // A scrolling box has to be reachable from the keyboard to be scrolled.
    const tableBox = screen.getByRole("table").parentElement;
    expect(tableBox).toHaveClass("overflow-x-auto");
    expect(tableBox).toHaveAttribute("tabindex", "0");
    const pre = screen.getByText(/greeting colleagues/).closest("pre");
    expect(pre).toHaveClass("overflow-x-auto");
    expect(pre).toHaveAttribute("tabindex", "0");
  });

  it("styles headings and lists, which the page had left bare", async () => {
    await renderTopic(BODY);

    expect(screen.getByRole("heading", { level: 2, name: "敬語とは？" })).toHaveClass(
      "font-semibold",
    );
    expect(screen.getByRole("list")).toHaveClass("list-disc");
  });
});
