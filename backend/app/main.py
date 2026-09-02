"""
FastAPI application entry point.

Middleware order (outermost → innermost):
  TrustedHostMiddleware → CORSMiddleware → RateLimiterMiddleware →
  ClerkJWTMiddleware → route handler

Sentry is initialized before the app starts if SENTRY_DSN is configured.
"""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.v1.router import router as v1_router
from app.config import settings
from app.database import close_db, ping_db
from app.middleware.body_limit import BodySizeLimitMiddleware
from app.middleware.clerk_auth import ClerkJWTMiddleware
from app.middleware.rate_limiter import RateLimiterMiddleware
from app.utils.migration_check import verify_migrations
from app.utils.pdf_generator import verify_fonts

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Sentry — initialize before creating the app
# ---------------------------------------------------------------------------

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        integrations=[
            StarletteIntegration(transaction_style="url"),
            FastApiIntegration(transaction_style="url"),
        ],
        send_default_pii=False,
    )


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    if not verify_fonts():
        logger.error(
            "Bundled Noto Sans JP font file(s) missing from app/assets/fonts/ — "
            "resume/rirekisho PDF generation will silently produce documents with "
            "blank Japanese text. Check that the font files are present in this deploy."
        )
    if not await verify_migrations():
        logger.error(
            "Database migration version mismatch detected at startup -- "
            "run `alembic upgrade head` against this environment's database. "
            "The app will keep serving requests, but routes touching "
            "out-of-sync tables may fail."
        )
        if settings.sentry_dsn:
            sentry_sdk.capture_message(
                "Migration version mismatch detected at startup", level="error"
            )
    yield
    await close_db()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url="/redoc" if settings.enable_docs else None,
    openapi_url="/openapi.json" if settings.enable_docs else None,
    lifespan=lifespan,
)

# Middleware — added in reverse order (last added = outermost)
# Final execution order:
#   TrustedHost → BodySizeLimit → CORS → RateLimiter → ClerkJWT → handler
app.add_middleware(ClerkJWTMiddleware)
app.add_middleware(RateLimiterMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Reject oversized bodies early, before auth/rate-limit/routing do any work.
app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_request_body_bytes)
# Outermost: reject requests whose Host header isn't in ALLOWED_HOSTS.
# Enforced ONLY in production AND only once ALLOWED_HOSTS has been explicitly
# configured beyond the localhost default — otherwise allow any host. This is
# deliberate: an unset ALLOWED_HOSTS previously 400'd every request on a
# deployed host (Host = the platform domain), bricking the app. Opt in to host
# allowlisting by setting ALLOWED_HOSTS to your deployed domain(s); until then
# it fails open rather than taking the site down. dev/test always allow any host.
_DEFAULT_HOSTS = {"localhost", "127.0.0.1"}
_host_allowlist_configured = bool(set(settings.allowed_hosts_list) - _DEFAULT_HOSTS)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=(
        settings.allowed_hosts_list
        if settings.is_production and _host_allowlist_configured
        else ["*"]
    ),
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health", tags=["health"])
async def health() -> dict[str, object]:
    db_ok = await ping_db()
    fonts_ok = verify_fonts()
    migrations_ok = await verify_migrations()
    return {
        "status": "ok" if db_ok and fonts_ok and migrations_ok else "degraded",
        "version": settings.app_version,
        "db": "ok" if db_ok else "unreachable",
        "fonts": "ok" if fonts_ok else "missing_ja_font",
        "migrations": "ok" if migrations_ok else "pending",
    }


app.include_router(v1_router, prefix="/api/v1")
