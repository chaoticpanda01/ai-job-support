from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.config import settings

# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------
# NullPool is used for test environments where each test gets a fresh
# connection and connection pooling interferes with transaction isolation.
# Production uses the default AsyncAdaptedQueuePool via pool_size/max_overflow.


def _create_engine(url: str, *, testing: bool = False) -> AsyncEngine:
    kwargs: dict[str, Any] = {
        "echo": settings.debug,
        "future": True,
    }
    if testing:
        kwargs["poolclass"] = NullPool
    else:
        kwargs["pool_size"] = settings.database_pool_size
        kwargs["max_overflow"] = settings.database_max_overflow
        kwargs["pool_pre_ping"] = True  # Detect and discard stale connections
        kwargs["pool_recycle"] = 3600  # Recycle connections after 1 hour
        kwargs["connect_args"] = {
            "server_settings": {
                "application_name": settings.app_name,
                "jit": "off",  # Disable JIT for OLTP workloads
            }
        }
    return create_async_engine(url, **kwargs)


engine: AsyncEngine = _create_engine(settings.database_url, testing=settings.is_test)

# ---------------------------------------------------------------------------
# Session factory
# ---------------------------------------------------------------------------

AsyncSessionFactory: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,  # Objects stay usable after commit (avoids lazy-load on closed session)
    autoflush=False,  # Explicit flush control; services call session.flush() when needed
    autocommit=False,
)

# ---------------------------------------------------------------------------
# Session dependency (used with FastAPI Depends)
# ---------------------------------------------------------------------------


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Yields a database session per request.
    - Commits on clean exit.
    - Rolls back on any exception.
    - Always closes the session.
    """
    async with AsyncSessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


async def ping_db() -> bool:
    """Returns True if the database is reachable. Used by /health endpoint."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Lifecycle helpers
# ---------------------------------------------------------------------------


async def close_db() -> None:
    """Dispose all connections. Call on application shutdown."""
    await engine.dispose()


async def get_connection() -> AsyncGenerator[AsyncConnection, None]:
    """
    Yields a raw async connection (not a session).
    Useful for bulk operations or migrations within request context.
    """
    async with engine.connect() as conn:
        try:
            yield conn
            await conn.commit()
        except Exception:
            await conn.rollback()
            raise
