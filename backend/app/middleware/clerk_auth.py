"""
Clerk JWT authentication middleware.

Validates every request's Authorization: Bearer <token> header using Clerk's
JWKS endpoint. On success, populates request.state with the authenticated
user's identity so downstream dependencies can read it without re-validating.

Bypass paths (no token required):
  GET  /health
  POST /api/v1/auth/webhook
  POST /api/v1/billing/webhook

JWKS caching: public keys are fetched once and cached for JWKS_CACHE_TTL
seconds (default 3600). The cache is module-level so it survives request
boundaries without a Redis round-trip.
"""

import logging
import time
from typing import Any
from uuid import UUID

logger = logging.getLogger(__name__)

import httpx
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from app.config import settings
from app.database import AsyncSessionFactory
from app.models.enums import UserRole
from app.repositories.user import UserRepository

# ---------------------------------------------------------------------------
# JWKS cache — module-level, shared across all requests
# ---------------------------------------------------------------------------

JWKS_CACHE_TTL = 3600  # seconds

_jwks_cache: dict[str, Any] = {}
_jwks_fetched_at: float = 0.0

# Paths that skip authentication entirely
_BYPASS_PATHS: frozenset[tuple[str, str]] = frozenset(
    [
        ("GET", "/health"),
        ("POST", "/api/v1/auth/webhook"),
        ("POST", "/api/v1/billing/webhook"),
    ]
)


async def _get_jwks() -> dict[str, Any]:
    """Return cached JWKS, refreshing if stale."""
    global _jwks_cache, _jwks_fetched_at

    now = time.monotonic()
    if _jwks_cache and (now - _jwks_fetched_at) < JWKS_CACHE_TTL:
        return _jwks_cache

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(settings.clerk_jwks_url)
        response.raise_for_status()
        _jwks_cache = response.json()
        _jwks_fetched_at = now

    return _jwks_cache


def _unauthorized(detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content={"detail": detail},
        headers={"WWW-Authenticate": "Bearer"},
    )


class ClerkJWTMiddleware(BaseHTTPMiddleware):
    """
    Validates Clerk JWTs and resolves the user record from the database.

    Sets on request.state:
      user_id  (UUID)  — internal DB primary key
      clerk_id (str)   — Clerk subject claim
      email    (str)   — from JWT claims
      role     (UserRole) — from DB
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        method = request.method
        path = request.url.path

        if (method, path) in _BYPASS_PATHS:
            return await call_next(request)

        # Culture content is public read-only
        if method == "GET" and path.startswith("/api/v1/culture/"):
            return await call_next(request)

        # Extract token
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return _unauthorized("Missing or malformed Authorization header")

        token = auth_header.removeprefix("Bearer ").strip()

        # Validate JWT against Clerk JWKS
        try:
            jwks = await _get_jwks()
            claims: dict[str, Any] = jwt.decode(
                token,
                jwks,
                algorithms=["RS256"],
                options={"verify_aud": False},
            )
        except ExpiredSignatureError:
            logger.warning("JWT rejected: token expired")
            return _unauthorized("Token has expired")
        except JWTError as e:
            logger.warning("JWT rejected: JWTError: %s", e)
            return _unauthorized("Invalid token")
        except Exception as e:
            logger.warning("JWT rejected: %s: %s", type(e).__name__, e)
            return _unauthorized("Token validation failed")

        clerk_id: str | None = claims.get("sub")
        email: str | None = claims.get("email") or None  # treat "" as None

        if not clerk_id:
            return _unauthorized("Token missing subject claim")

        # Resolve DB user
        try:
            async with AsyncSessionFactory() as session:
                user = await _resolve_user(session, clerk_id, email or "")
        except Exception as exc:
            logger.error("Failed to resolve user clerk_id=%s: %s", clerk_id, exc)
            return JSONResponse(
                status_code=500,
                content={"detail": "User resolution failed — check server logs"},
            )

        if user is None:
            # User deleted from DB but token still valid — treat as unauthorized
            return _unauthorized("User not found")

        if not user.is_active:
            return _unauthorized("Account is deactivated")

        request.state.user_id = user.id
        request.state.clerk_id = user.clerk_id
        request.state.email = user.email
        request.state.role = user.role

        return await call_next(request)


async def _resolve_user(session: AsyncSession, clerk_id: str, email: str) -> Any:
    repo = UserRepository(session)
    user = await repo.get_by_clerk_id(clerk_id)
    if user is not None:
        return user

    # No DB row yet (webhook not configured or not fired in local dev).
    # Create the user just-in-time from the JWT claims so the app works
    # without requiring a Clerk webhook setup.
    # Skip JIT creation if email is missing — the DB has an email format CHECK
    # constraint that would reject an empty string. The Clerk JWT template must
    # include the email claim for JIT creation to work.
    if not email:
        logger.warning(
            "JIT user creation skipped: clerk_id=%s has no email in JWT. "
            "Add email to the Clerk JWT template in the Clerk dashboard.",
            clerk_id,
        )
        return None

    user, _ = await repo.upsert_from_clerk(
        clerk_id=clerk_id,
        email=email,
        full_name=None,
        email_verified=True,
    )
    await session.commit()
    return user
