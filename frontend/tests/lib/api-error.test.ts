import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/lib/api-client";
import { apiErrorMessage, type CommonMessageKey } from "@/lib/api-error";
import { t } from "@/lib/i18n";
import { LANGS } from "../helpers";

// Every status the API actually returns, inventoried from backend/app/api
// and backend/app/middleware -- except 403, which originates in
// backend/app/dependencies.py (the admin-only dependency).
const BACKEND_STATUSES = [400, 401, 403, 404, 409, 413, 415, 422, 429, 500, 502, 503];

// The real mapping from lib/api-error.ts's errorKeyForStatus, plus 429's
// key when no Retry-After is present (see "rate limiting" below for the
// cases where a Retry-After header changes 429's message). Pinning each
// status to its specific key, rather than just checking the message looks
// plausible, is what catches errorKeyForStatus swapping two statuses' keys.
const STATUS_MESSAGE_KEY: Record<number, CommonMessageKey> = {
  400: "errorInvalidInput",
  401: "errorSignedOut",
  403: "errorNotAllowed",
  404: "errorNotFound",
  409: "errorConflict",
  413: "errorTooLarge",
  415: "errorUnsupportedType",
  422: "errorInvalidInput",
  429: "errorRateLimited",
  500: "errorServer",
  502: "errorServer",
  503: "errorServer",
};

describe("apiErrorMessage", () => {
  it.each(BACKEND_STATUSES)("maps %i to its specific message key in every language", (status) => {
    const expectedKey = STATUS_MESSAGE_KEY[status];
    if (expectedKey === undefined) {
      throw new Error(`no expected key configured for status ${status}`);
    }
    const detail = `Backend prose for ${status}`;
    const messages = LANGS.map((lang) => apiErrorMessage(new ApiClientError(status, detail), lang));

    LANGS.forEach((lang, index) => {
      expect(messages[index]).toBe(t("common", expectedKey, lang));
    });

    for (const message of messages) {
      expect(message).not.toContain(detail);
    }
    // Three languages, three distinct strings: catches a translation that
    // copied one language's text into another's slot for this key.
    expect(new Set(messages).size).toBe(3);
  });

  it("reports a failure that never reached the server as a connection problem", () => {
    expect(apiErrorMessage(new TypeError("Failed to fetch"), "ja")).toBe(
      t("common", "errorConnection", "ja"),
    );
  });

  it("does not blame the server for a request it rejected", () => {
    // 400 and 422 mean the request was wrong; retrying it unchanged fails again.
    for (const status of [400, 422]) {
      expect(apiErrorMessage(new ApiClientError(status, ""), "en")).not.toBe(
        t("common", "errorServer", "en"),
      );
    }
  });

  it("does not report an unsupported file type as a server problem", () => {
    expect(apiErrorMessage(new ApiClientError(415, ""), "en")).toBe(
      t("common", "errorUnsupportedType", "en"),
    );
  });

  it("suggests trying again for a server-side failure", () => {
    for (const status of [500, 502, 503]) {
      expect(apiErrorMessage(new ApiClientError(status, ""), "en")).toBe(
        t("common", "errorServer", "en"),
      );
    }
  });

  describe("overrides", () => {
    const withOverride = (status: number) =>
      apiErrorMessage(new ApiClientError(status, "backend prose"), "ja", {
        422: "OVERRIDDEN",
      });

    it("replaces only the status it names", () => {
      expect(withOverride(422)).toBe("OVERRIDDEN");
    });

    it("leaves every other status alone", () => {
      expect(withOverride(429)).toBe(t("common", "errorRateLimited", "ja"));
      expect(withOverride(500)).toBe(t("common", "errorServer", "ja"));
    });

    it("does not apply to a failure that never reached the server", () => {
      expect(apiErrorMessage(new TypeError("offline"), "ja", { 422: "OVERRIDDEN" })).toBe(
        t("common", "errorConnection", "ja"),
      );
    });
  });

  describe("rate limiting", () => {
    const wait = (seconds: number | null) =>
      apiErrorMessage(new ApiClientError(429, "capped", seconds), "ja");

    it.each([
      [30, "errorRateLimitedMinutes", "1"],
      [60, "errorRateLimitedMinutes", "1"],
      [90, "errorRateLimitedMinutes", "2"],
      [3540, "errorRateLimitedMinutes", "59"],
      [3600, "errorRateLimitedHours", "1"],
      [7800, "errorRateLimitedHours", "3"],
    ] as const)("turns %i seconds into %s of %s", (seconds, key, expected) => {
      expect(wait(seconds)).toBe(t("common", key, "ja").replace("{n}", expected));
    });

    it("always rounds the wait up", () => {
      // Telling someone to wait less than the server will accept sends them
      // straight back into the same refusal.
      expect(wait(61)).toBe(t("common", "errorRateLimitedMinutes", "ja").replace("{n}", "2"));
    });

    it("stays vague when the response carried no Retry-After", () => {
      expect(wait(null)).toBe(t("common", "errorRateLimited", "ja"));
    });
  });
});
