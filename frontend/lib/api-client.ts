/**
 * Typed API client for the FastAPI backend.
 *
 * All requests go through the Next.js proxy at /api/[...path], which
 * injects the Clerk JWT server-side. Browsers never call FastAPI directly.
 *
 * Usage (client component):
 *   const resumes = await apiClient.get<ResumeList>("/resumes");
 *
 * Usage (server component / route handler):
 *   const me = await apiClient.get<MeResponse>("/auth/me", { token });
 */

import type { ApiError } from "@/types/api";

const API_PREFIX = "/api/v1";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    /**
     * Seconds from the response's Retry-After header, when it sent one. The AI
     * usage caps and the rate limiter both do, and it is the only part of a 429
     * that says how long to wait -- the detail text carrying the same figure is
     * English prose, so this is what a translated message can use. Null when
     * the header was absent or wasn't a plain number.
     */
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(detail);
    this.name = "ApiClientError";
  }
}

/** Seconds from a Retry-After header, or null if absent or not a number. */
function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get("Retry-After");
  if (header === null) return null;
  const seconds = Number(header);
  // The header also allows an HTTP date; nothing here sends one, so a value
  // that isn't a plain number is treated as absent rather than guessed at.
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

/**
 * FastAPI's `detail` field is a plain string for HTTPException, but for a
 * 422 request-validation failure it's an array of Pydantic error objects
 * (each with a `msg` field) — not a string. Passing that array straight to
 * Error()'s constructor coerces it via toString(), which renders as the
 * literal text "[object Object]" instead of a readable message. Extract a
 * real message from either shape here instead.
 */
export function extractDetail(raw: unknown, fallback: string): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    const messages = raw
      .map((item) =>
        item && typeof item === "object" && "msg" in item
          ? String((item as { msg: unknown }).msg)
          : null,
      )
      .filter((m): m is string => m !== null);
    if (messages.length > 0) return messages.join("; ");
  }
  if (raw != null) {
    try {
      return JSON.stringify(raw);
    } catch {
      // fall through to fallback
    }
  }
  return fallback;
}

interface RequestOptions {
  token?: string;
  signal?: AbortSignal;
}

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions & { body?: unknown } = {},
): Promise<T> {
  const { token, body, signal } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  if (signal !== undefined) init.signal = signal;

  const response = await fetch(`${API_PREFIX}${path}`, init);

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const err = (await response.json()) as ApiError;
      detail = extractDetail(err.detail, detail);
    } catch {
      // ignore — use the status code message
    }
    throw new ApiClientError(response.status, detail, parseRetryAfter(response));
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function upload<T>(
  path: string,
  formData: FormData,
  options: RequestOptions = {},
): Promise<T> {
  const { token, signal } = options;

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  // Do NOT set Content-Type — browser sets it with the correct boundary

  const init: RequestInit = { method: "POST", headers, body: formData };
  if (signal !== undefined) init.signal = signal;

  const response = await fetch(`${API_PREFIX}${path}`, init);

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const err = (await response.json()) as ApiError;
      detail = extractDetail(err.detail, detail);
    } catch {
      // ignore
    }
    throw new ApiClientError(response.status, detail, parseRetryAfter(response));
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>("GET", path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("POST", path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("PUT", path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("PATCH", path, { ...opts, body }),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>("DELETE", path, opts),
  upload: <T>(path: string, formData: FormData, opts?: RequestOptions) =>
    upload<T>(path, formData, opts),
};
