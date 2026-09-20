import { ApiClientError } from "@/lib/api-client";
import { t, type Language } from "@/lib/i18n";

/**
 * A message for a failed request, in the reader's language.
 *
 * The backend's `detail` is written in English for logs and support, so
 * showing it directly leaves Indonesian and Japanese users reading English.
 * The HTTP status is the part of a failure that is stable enough to explain:
 * it says what kind of thing went wrong, which is what the reader needs to
 * know whether to fix their input, wait, or try again.
 *
 * An error that isn't an ApiClientError never reached the server (the request
 * was aborted, or the network is down) and gets the connection message.
 */
export function apiErrorMessage(error: unknown, lang: Language): string {
  if (!(error instanceof ApiClientError)) {
    return t("common", "errorConnection", lang);
  }
  return t("common", errorKeyForStatus(error.status), lang);
}

function errorKeyForStatus(status: number): string {
  switch (status) {
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
    case 422:
      return "errorInvalidInput";
    case 429:
      // Both the AI usage caps and the rate limiter answer with this.
      return "errorRateLimited";
    default:
      // 5xx, and any status without a message of its own. A 502 from a failed
      // AI call lands here, which is why this one suggests trying again.
      return "errorServer";
  }
}
