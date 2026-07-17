"""
Global request body-size limit middleware.

Rejects any request whose declared Content-Length exceeds a fixed ceiling,
before auth, rate limiting, or route handling run. This is a cheap, blanket
guard so no single endpoint has to defend against an oversized body on its own
(the resume upload also enforces its own tighter, streaming-safe cap).

Requests without a Content-Length (chunked/streaming) are passed through —
endpoints that accept large bodies must bound their own reads.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        super().__init__(app)
        self._max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdigit() and int(content_length) > self._max_bytes:
            return JSONResponse(
                status_code=413,
                content={"detail": "Request body too large"},
            )
        return await call_next(request)
