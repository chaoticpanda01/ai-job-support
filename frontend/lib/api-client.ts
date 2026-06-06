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
  ) {
    super(detail);
    this.name = "ApiClientError";
  }
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

  const response = await fetch(`${API_PREFIX}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const err = (await response.json()) as ApiError;
      detail = err.detail ?? detail;
    } catch {
      // ignore — use the status code message
    }
    throw new ApiClientError(response.status, detail);
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

  const response = await fetch(`${API_PREFIX}${path}`, {
    method: "POST",
    headers,
    body: formData,
    signal,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const err = (await response.json()) as ApiError;
      detail = err.detail ?? detail;
    } catch {
      // ignore
    }
    throw new ApiClientError(response.status, detail);
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
