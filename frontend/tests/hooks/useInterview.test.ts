import { describe, expect, it, vi } from "vitest";
import { t, type Language } from "@/lib/i18n";
import type { InterviewStreamErrorCode } from "@/types/api";

// The hook module pulls in react-query at import time; only the message
// function is under test here.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({}),
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}));

const { streamErrorMessage } = await import("@/hooks/useInterview");

const LANGS: Language[] = ["en", "id", "ja"];

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
