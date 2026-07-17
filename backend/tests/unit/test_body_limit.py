"""Unit tests for BodySizeLimitMiddleware."""

from __future__ import annotations

import pytest
from app.middleware.body_limit import BodySizeLimitMiddleware
from httpx import ASGITransport, AsyncClient
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import PlainTextResponse
from starlette.routing import Route


async def _ok(_request: Request) -> PlainTextResponse:
    return PlainTextResponse("ok")


def _app(max_bytes: int) -> Starlette:
    app = Starlette(routes=[Route("/x", _ok, methods=["POST"])])
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=max_bytes)
    return app


@pytest.mark.asyncio
async def test_body_over_limit_returns_413() -> None:
    app = _app(max_bytes=10)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/x", content=b"x" * 50)
    assert resp.status_code == 413
    assert resp.json()["detail"] == "Request body too large"


@pytest.mark.asyncio
async def test_body_under_limit_passes() -> None:
    app = _app(max_bytes=1000)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/x", content=b"small")
    assert resp.status_code == 200
