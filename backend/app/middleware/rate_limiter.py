"""
Redis-backed sliding-window rate limiter middleware.

Enforces four independent limits (from Appendix C of HANDOFF.md):

  1. Global per-IP:       60 requests / minute   (all endpoints)
  2. Resume uploads:       5 requests / hour      (POST /api/v1/resumes/upload)
  3. Job translations:    10 requests / hour      (POST /api/v1/jobs/translate)
  4. AI features (free): 20 requests / hour      (all POST AI endpoints, free tier only)

Algorithm: fixed window counter using Redis INCR + EXPIRE.
  - Key format: rl:<scope>:<identifier>:<window_start>
  - window_start = floor(now / window_seconds)
  - First INCR sets the key; EXPIRE is set immediately after to auto-evict.
  - Atomic enough for our needs — occasional double-counts on race conditions
    are acceptable for a soft rate limit.

All Redis errors are caught and logged; the middleware degrades gracefully
(allows the request through) rather than hard-failing if Redis is down.

Bypass paths (same set as ClerkJWTMiddleware):
  GET  /health
  POST /api/v1/auth/webhook
  POST /api/v1/billing/webhook
"""

from __future__ import annotations

import logging
import time
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths that skip rate limiting entirely
# ---------------------------------------------------------------------------

_BYPASS_PATHS: frozenset[tuple[str, str]] = frozenset(
    [
        ("GET", "/health"),
        ("POST", "/api/v1/auth/webhook"),
        ("POST", "/api/v1/billing/webhook"),
    ]
)

# ---------------------------------------------------------------------------
# Per-route limits: (method, path_prefix) → (max_requests, window_seconds, scope_name)
# Checked in order; first match wins.
# ---------------------------------------------------------------------------

_ROUTE_LIMITS: list[tuple[str, str, int, int, str]] = [
    # method, path_prefix,             max_req, window_sec, scope
    ("POST", "/api/v1/resumes/upload", 5, 3600, "resume_upload"),
    ("POST", "/api/v1/jobs/translate", 10, 3600, "job_translate"),
]

# Global per-IP limit applied to every non-bypassed request
_GLOBAL_IP_LIMIT = 60
_GLOBAL_IP_WINDOW = 60  # seconds

# Free-tier AI feature limit — POST requests to known AI endpoints
_AI_PATHS: frozenset[str] = frozenset(
    [
        "/api/v1/resumes/",  # analysis triggers
        "/api/v1/documents/rirekisho",
        "/api/v1/documents/shokumu",
        "/api/v1/jobs/translate",
        "/api/v1/jobs/",  # match scoring
        "/api/v1/interview/sessions",
        "/api/v1/visa/consultations",
    ]
)
_AI_FREE_LIMIT = 20
_AI_FREE_WINDOW = 3600


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """
    Sliding-window (fixed-window approximation) rate limiter.

    Redis client is created lazily on first request so the app starts cleanly
    even if Redis is temporarily unavailable during deployment.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._redis: Any = None

    def _get_redis(self) -> Any:
        if self._redis is None:
            import redis.asyncio as aioredis

            self._redis = aioredis.from_url(  # type: ignore[no-untyped-call]
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=1,
                socket_timeout=1,
            )
        return self._redis

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        method = request.method
        path = request.url.path

        # --- Bypass ---
        if (method, path) in _BYPASS_PATHS:
            return await call_next(request)

        client_ip = _extract_ip(request)

        try:
            redis = self._get_redis()

            # 1. Global per-IP limit
            if not await _check(redis, f"ip:{client_ip}", _GLOBAL_IP_LIMIT, _GLOBAL_IP_WINDOW):
                return _too_many("Too many requests. Slow down.", retry_after=_GLOBAL_IP_WINDOW)

            # 2. Per-route limits (resume upload, job translate)
            for r_method, r_prefix, r_max, r_window, r_scope in _ROUTE_LIMITS:
                if method == r_method and path.startswith(r_prefix):
                    user_id = getattr(
                        getattr(request.state, "user_id", None), "__str__", lambda: None
                    )()
                    ident = f"{r_scope}:{user_id or client_ip}"
                    if not await _check(redis, ident, r_max, r_window):
                        return _too_many(
                            f"Rate limit exceeded for {r_scope.replace('_', ' ')}. "
                            f"Max {r_max} per hour.",
                            retry_after=r_window,
                        )

            # 3. Free-tier AI feature limit (POST to AI paths, user_id required)
            if method == "POST" and _is_ai_path(path):
                user_id_str: str | None = getattr(request.state, "user_id", None)
                tier: str = getattr(request.state, "subscription_tier", "free")
                if user_id_str and tier == "free":
                    ident = f"ai_free:{user_id_str}"
                    if not await _check(redis, ident, _AI_FREE_LIMIT, _AI_FREE_WINDOW):
                        return _too_many(
                            f"Free tier AI limit reached ({_AI_FREE_LIMIT} requests/hour). "
                            "Upgrade your plan for more.",
                            retry_after=_AI_FREE_WINDOW,
                        )

        except Exception as exc:
            # Redis unavailable — log and allow the request through
            logger.warning("Rate limiter Redis error (allowing request): %s", exc)

        return await call_next(request)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _check(redis: Any, key: str, limit: int, window_seconds: int) -> bool:
    """
    Increment the counter for this key within the current fixed window.
    Returns True if the request is within the limit, False if it exceeds it.
    """
    window_start = int(time.time()) // window_seconds
    full_key = f"rl:{key}:{window_start}"

    count = int(await redis.incr(full_key))
    if count == 1:
        # First request in this window — set TTL so the key self-evicts
        await redis.expire(full_key, window_seconds * 2)

    return count <= limit


def _extract_ip(request: Request) -> str:
    """
    Extract the real client IP, trusting only the hop(s) appended by our own
    reverse proxy (settings.trusted_proxy_hops, e.g. 1 for Render's edge LB).

    X-Forwarded-For is a client-appendable header: a direct request can set
    it to anything. A trusted proxy appends the connecting IP as the last
    entry in the chain rather than replacing it, so the only value that
    cannot be forged by the client is the Nth-from-the-right entry, where N
    is the number of trusted proxies between the client and this process.
    Taking the leftmost (client-supplied) entry — the previous behaviour —
    lets any direct caller spoof rate limiting entirely.
    """
    hops = settings.trusted_proxy_hops
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for and hops > 0:
        parts = [p.strip() for p in forwarded_for.split(",") if p.strip()]
        if len(parts) >= hops:
            return parts[-hops]
    if request.client:
        return request.client.host
    return "unknown"


def _is_ai_path(path: str) -> bool:
    return any(path.startswith(p) for p in _AI_PATHS)


def _too_many(detail: str, retry_after: int) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": detail},
        headers={"Retry-After": str(retry_after)},
    )
