import { ApiClientError } from "@/lib/api-client";
import { t, type Language, type translations } from "@/lib/i18n";

// Typed as real message keys: t() returns an unknown key as-is, so a typo here
// would show the raw key to users in three languages instead of failing to
// compile.
type CommonMessageKey = keyof (typeof translations)["common"];

/**
 * A message for a failed request, in the reader's language.
 *
 * The backend's `detail` is written in English for logs and support, so
 * showing it directly leaves Indonesian and Japanese users reading English.
 * The HTTP status is the part of a failure that is stable enough to explain:
 * it says what kind of thing went wrong, which is what the reader needs to
 * know whether to fix their input, wait, or try again.
 *
 * Callers that can act on more than the status -- a form that can point at the
 * field a 422 names, say -- should add to this message rather than rely on it
 * alone.
 */
export function apiErrorMessage(error: unknown, lang: Language): string {
  // Not an ApiClientError: the request never came back with a status. Usually
  // the network or an aborted request, though a bug thrown inside a query
  // function also lands here.
  if (!(error instanceof ApiClientError)) {
    return t("common", "errorConnection", lang);
  }
  if (error.status === 429) {
    return rateLimitMessage(error.retryAfterSeconds, lang);
  }
  return t("common", errorKeyForStatus(error.status), lang);
}

/**
 * "Try again later" is useless when the AI usage caps are measured in hours:
 * the reader can't tell a one-minute wait from a one-day one. Retry-After
 * carries the figure the backend's own English message quotes, so the wait can
 * be stated in the reader's language when the header is there, and left vague
 * only when it isn't.
 */
function rateLimitMessage(retryAfterSeconds: number | null, lang: Language): string {
  if (retryAfterSeconds === null || retryAfterSeconds <= 0) {
    return t("common", "errorRateLimited", lang);
  }
  // Rounded up: telling someone to wait less than the server will accept sends
  // them back into the same refusal.
  const minutes = Math.ceil(retryAfterSeconds / 60);
  if (minutes < 60) {
    return t("common", "errorRateLimitedMinutes", lang).replace("{n}", String(minutes));
  }
  return t("common", "errorRateLimitedHours", lang).replace("{n}", String(Math.ceil(minutes / 60)));
}

function errorKeyForStatus(status: number): CommonMessageKey {
  switch (status) {
    case 400:
    case 422:
      // Both mean the request itself was wrong, and retrying it unchanged
      // fails again -- so neither may suggest trying again.
      return "errorInvalidInput";
    case 401:
      return "errorSignedOut";
    case 403:
      return "errorNotAllowed";
    case 404:
      return "errorNotFound";
    case 409:
      return "errorConflict";
    case 413:
      return "errorTooLarge";
    case 415:
      // The uploads that send this state their accepted formats next to the
      // control, so this doesn't have to list them.
      return "errorUnsupportedType";
    default:
      // 5xx, and any status without a message of its own. A 502 from a failed
      // AI call lands here, which is why this one suggests trying again.
      return "errorServer";
  }
}
