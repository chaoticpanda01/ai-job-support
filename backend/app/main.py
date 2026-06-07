"""
FastAPI application entry point.

Middleware order (outermost → innermost):
  TrustedHostMiddleware → CORSMiddleware → RateLimiterMiddleware → ClerkJWTMiddleware → route handler

Sentry is initialized before the app starts if SENTRY_DSN is configured.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from app.api.v1.router import router as v1_router
from app.config import settings
from app.database import close_db, ping_db
from app.middleware.clerk_auth import ClerkJWTMiddleware
from app.middleware.rate_limiter import RateLimiterMiddleware


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
    yield
    await close_db()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    openapi_url="/openapi.json" if not settings.is_production else None,
    lifespan=lifespan,
)

# Middleware — added in reverse order (last added = outermost)
# Final execution order: TrustedHost → CORS → RateLimiter → ClerkJWT → handler
app.add_middleware(ClerkJWTMiddleware)
app.add_middleware(RateLimiterMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", tags=["health"])
async def health() -> dict[str, object]:
    db_ok = await ping_db()
    return {
        "status": "ok" if db_ok else "degraded",
        "version": settings.app_version,
        "db": "ok" if db_ok else "unreachable",
    }


app.include_router(v1_router, prefix="/api/v1")
