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

import json
import logging
import time
from typing import Any

import httpx
import jwt
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from app.config import settings
from app.database import AsyncSessionFactory
from app.models.user import User
from app.repositories.user import UserRepository

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# JWKS cache — module-level, shared across all requests
# ---------------------------------------------------------------------------

JWKS_CACHE_TTL = 3600  # seconds
# Minimum gap between forced JWKS refetches. A kid-miss triggers force=True, and
# an unauthenticated caller can force that with a bogus kid on an unsigned token
# (the header is parsed before any signature check) — so throttle forced
# refetches to avoid an amplification vector against Clerk's JWKS endpoint.
_JWKS_FORCE_MIN_INTERVAL = 10  # seconds

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


async def _get_jwks(force: bool = False) -> dict[str, Any]:
    """Return cached JWKS, refreshing if stale (or if force=True)."""
    global _jwks_cache, _jwks_fetched_at

    now = time.monotonic()
    if not force and _jwks_cache and (now - _jwks_fetched_at) < JWKS_CACHE_TTL:
        return _jwks_cache
    # Throttle forced refetches (kid-miss) so a flood of bogus-kid tokens can't
    # trigger one Clerk fetch per request; a real key rotation is still picked
    # up within _JWKS_FORCE_MIN_INTERVAL.
    if force and _jwks_cache and (now - _jwks_fetched_at) < _JWKS_FORCE_MIN_INTERVAL:
        return _jwks_cache

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(settings.clerk_jwks_url)
        response.raise_for_status()
        _jwks_cache = response.json()
        _jwks_fetched_at = now

    return _jwks_cache


def _find_key(jwks: dict[str, Any], kid: str | None) -> dict[str, Any] | None:
    keys: list[dict[str, Any]] = jwks.get("keys", [])
    for key in keys:
        if key.get("kid") == kid:
            return key
    return None


async def _validate_token(token: str) -> dict[str, Any]:
    """
    Validate a Clerk-issued JWT against the cached JWKS and return its claims.

    Uses PyJWT (actively maintained) instead of the unmaintained python-jose.
    The signing key is selected from the JWKS by the token's `kid`; on a miss
    (e.g. Clerk rotated keys mid-cache) the JWKS is force-refreshed once before
    giving up. Raises a jwt.PyJWTError subclass on any validation failure.
    """
    kid = jwt.get_unverified_header(token).get("kid")

    jwks = await _get_jwks()
    jwk = _find_key(jwks, kid)
    if jwk is None:
        jwks = await _get_jwks(force=True)
        jwk = _find_key(jwks, kid)
    if jwk is None:
        raise jwt.InvalidTokenError(f"No JWKS key matching kid={kid!r}")

    # from_jwk returns RSAPublicKey for a public JWK; typed as a private|public
    # union upstream, so annotate as Any for jwt.decode's key parameter.
    signing_key: Any = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))
    claims: dict[str, Any] = jwt.decode(
        token,
        signing_key,
        algorithms=["RS256"],
        options={"verify_aud": False},
    )
    return claims


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

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
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

        # Validate JWT against Clerk JWKS (PyJWT)
        try:
            claims: dict[str, Any] = await _validate_token(token)
        except jwt.ExpiredSignatureError:
            logger.warning("JWT rejected: token expired")
            return _unauthorized("Token has expired")
        except jwt.InvalidTokenError as e:
            logger.warning("JWT rejected: %s", e)
            return _unauthorized("Invalid token")
        except Exception as e:
            logger.warning("JWT rejected: %s: %s", type(e).__name__, e)
            return _unauthorized("Token validation failed")

        # Optional authorized-party enforcement — skipped unless configured.
        allowed_parties = settings.clerk_authorized_parties_list
        if allowed_parties and claims.get("azp") not in allowed_parties:
            logger.warning("JWT rejected: azp=%r not in allowed parties", claims.get("azp"))
            return _unauthorized("Invalid token")

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


async def _resolve_user(session: AsyncSession, clerk_id: str, email: str) -> User | None:
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
