import { describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import type { InterviewStreamErrorCode } from "@/types/api";
import { LANGS } from "../helpers";

/** The options the last useQuery call received. */
const query = vi.hoisted(() => ({
  options: null as null | { queryKey: unknown[]; queryFn: () => Promise<unknown> },
}));

// react-query is mocked out: what's under test is this module's own policy
// (messages, URLs, cache keys), not react-query's scheduler.
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: unknown[]; queryFn: () => Promise<unknown> }) => {
    query.options = options;
    return {};
  },
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}));

const { streamErrorMessage, useInterviewSessions } = await import("@/hooks/useInterview");

const STREAM_CODES: Record<InterviewStreamErrorCode, string> = {
  question_failed: "streamQuestionFailed",
  answer_not_saved: "streamAnswerNotSaved",
  summary_failed: "streamSummaryFailed",
  summary_not_saved: "streamSummaryNotSaved",
};

describe("streamErrorMessage", () => {
  it.each(Object.entries(STREAM_CODES))("explains the %s code", (code, key) => {
    for (const lang of LANGS) {
      const message = streamErrorMessage(
        { kind: "stream", code: code as InterviewStreamErrorCode },
        lang,
      );
      expect(message).toBe(t("interview", key, lang));
      expect(message).not.toBe(key);
    }
  });

  it("explains an HTTP failure by its status", () => {
    expect(streamErrorMessage({ kind: "http", status: 502, retryAfterSeconds: null }, "ja")).toBe(
      t("common", "errorServer", "ja"),
    );
  });

  it("states the wait when a stream is refused for the AI budget", () => {
    // The interview shares the app's AI cap, so a reader who hits it needs the
    // same countdown they get everywhere else.
    expect(streamErrorMessage({ kind: "http", status: 429, retryAfterSeconds: 7200 }, "ja")).toBe(
      t("common", "errorRateLimitedHours", "ja").replace("{n}", "2"),
    );
  });

  it.each([
    ["failed", "common", "error"],
    ["ended", "interview", "streamEnded"],
    ["connection", "interview", "connectionLost"],
  ] as const)("explains a %s stream", (kind, section, key) => {
    expect(streamErrorMessage({ kind }, "ja")).toBe(t(section, key, "ja"));
  });
});

describe("useInterviewSessions", () => {
  /** The URL the last call's query fetches. */
  async function fetchedUrl(): Promise<string> {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue([]);
    await query.options?.queryFn();
    const url = get.mock.calls[0]?.[0] as string;
    get.mockRestore();
    return url;
  }

  it("lists one page by default, as the interview page shows", async () => {
    useInterviewSessions();
    expect(query.options?.queryKey).toEqual(["interview", "sessions"]);
    expect(await fetchedUrl()).toBe("/interview/sessions");
  });

  it("asks for a larger page when told to, in its own cache entry", async () => {
    useInterviewSessions(100);
    expect(query.options?.queryKey).toEqual(["interview", "sessions", { limit: 100 }]);
    expect(await fetchedUrl()).toBe("/interview/sessions?limit=100");
  });
});
