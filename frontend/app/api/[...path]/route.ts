/**
 * Catch-all API proxy route.
 *
 * Every request to /api/* is forwarded to the FastAPI backend with a fresh
 * Clerk JWT injected into the Authorization header. Browsers never get the
 * Clerk secret key or call FastAPI directly.
 *
 * Preserves: method, headers (minus host), body, query string.
 */

import { auth } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:8000";

// Paths that must NOT have a JWT injected (Clerk webhook uses its own auth)
const NO_AUTH_PATHS = new Set(["/api/v1/auth/webhook", "/api/v1/billing/webhook"]);

async function handler(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  // Strip the /api prefix — FastAPI already has /api/v1 in its router
  const backendPath = pathname.replace(/^\/api/, "");
  const targetUrl = `${BACKEND_URL}/api${backendPath}${search}`;

  // Build forwarded headers
  const headers = new Headers(request.headers);
  headers.delete("host");

  const isWebhook = NO_AUTH_PATHS.has(pathname);

  if (!isWebhook) {
    try {
      const { getToken } = await auth();
      const token = await getToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    } catch {
      // auth() throws outside of Clerk context — let FastAPI handle 401
    }
  }

  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.arrayBuffer()
      : undefined;

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: body ? Buffer.from(body) : undefined,
    // @ts-expect-error — duplex required for streaming bodies in Node.js fetch
    duplex: "half",
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("transfer-encoding"); // avoid chunked encoding issues
  responseHeaders.delete("content-encoding");  // body already decoded by Node fetch; don't re-decode

  // SSE endpoints must stream; everything else should be buffered to avoid
  // issues with gzip-decoded streams being re-encoded or truncated.
  const isSSE = upstream.headers.get("content-type")?.includes("text/event-stream");

  if (isSSE) {
    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  }

  // Buffer non-streaming responses so the body is fully read before sending.
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
