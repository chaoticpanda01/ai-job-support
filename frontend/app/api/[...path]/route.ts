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

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF defense-in-depth for state-changing requests.
 *
 * This proxy authenticates via a Bearer JWT (not an ambient cookie sent to
 * FastAPI directly), which already mitigates classic CSRF against the
 * backend. This check adds a second, independent layer here at the proxy
 * in case that assumption ever changes (e.g. a future cookie-based auth
 * path) or Clerk's session cookie SameSite config is ever misconfigured.
 *
 * Sec-Fetch-Site is the more reliable signal (can't be forged, no known
 * bypass) but isn't sent by every client; Origin is the fallback. If
 * neither header is present — non-browser client, or an old browser —
 * this fails open, since the Bearer-JWT model is the primary defense and
 * blocking here would just break legitimate non-browser API callers.
 */
function isSameOriginRequest(request: NextRequest): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite) {
    return secFetchSite === "same-origin" || secFetchSite === "none";
  }
  const origin = request.headers.get("origin");
  if (origin) {
    return origin === request.nextUrl.origin;
  }
  return true;
}

async function handler(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  const isWebhook = NO_AUTH_PATHS.has(pathname);

  if (!isWebhook && STATE_CHANGING_METHODS.has(request.method) && !isSameOriginRequest(request)) {
    return NextResponse.json({ detail: "Cross-site request rejected" }, { status: 403 });
  }

  // Strip the /api prefix — FastAPI already has /api/v1 in its router
  const backendPath = pathname.replace(/^\/api/, "");
  const targetUrl = `${BACKEND_URL}/api${backendPath}${search}`;

  // Build forwarded headers
  const headers = new Headers(request.headers);
  headers.delete("host");

  if (!isWebhook) {
    try {
      const { userId, sessionId, getToken } = await auth();
      const token = await getToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      } else if (userId) {
        // A session exists (userId is set) but getToken() still came back
        // empty with no exception thrown — this is the case a plain null
        // check can't distinguish from a genuinely anonymous request. Log
        // it: whoever's calling this route has a session, so this is a
        // real failure to mint a token (e.g. Clerk dev-instance rate
        // limit swallowed internally by the SDK), not "not logged in".
        console.warn(
          `[api-proxy] getToken() returned empty for ${request.method} ${pathname} despite an active session ` +
            `(userId=${userId}, sessionId=${sessionId}) — request will be forwarded without a token`,
        );
      }
    } catch (err) {
      // auth()/getToken() can throw (e.g. Clerk dev-instance rate limits,
      // outages, or calls outside a Clerk context). Falling through lets
      // FastAPI reject with 401 as before, but log here — otherwise the
      // resulting "Missing or malformed Authorization header" error has no
      // trace of why the token was never attached.
      console.error(
        `[api-proxy] getToken() failed for ${request.method} ${pathname} — request will be forwarded without a token:`,
        err,
      );
    }
  }

  const body =
    request.method !== "GET" && request.method !== "HEAD" ? await request.arrayBuffer() : undefined;

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: body ? Buffer.from(body) : undefined,
    // @ts-expect-error — duplex required for streaming bodies in Node.js fetch
    duplex: "half",
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("transfer-encoding"); // avoid chunked encoding issues
  responseHeaders.delete("content-encoding"); // body already decoded by Node fetch; don't re-decode
  responseHeaders.delete("content-length"); // compressed length no longer valid after decoding

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
  const responseBody = await upstream.text();
  return new NextResponse(responseBody, {
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
