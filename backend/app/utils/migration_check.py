"""
Startup/health-check guard against migration/code deploy skew.

Render (this app's production host) auto-deploys backend code on every push
to main but does NOT run Alembic migrations automatically -- confirmed via a
real incident (2026-08-30) where new code referencing new columns went live
before `alembic upgrade head` was run against production, crashing every
request that touched the affected tables with a bare 500. This module lets
that mismatch be detected and surfaced (not blocked -- see main.py's
lifespan) instead of discovered by a user hitting a broken page.
"""

from __future__ import annotations

import logging
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text

from app.database import engine

logger = logging.getLogger(__name__)

_ALEMBIC_INI = Path(__file__).resolve().parent.parent.parent / "alembic.ini"


def _code_head_revision() -> str | None:
    """The latest migration revision shipped in this deploy's migrations/ folder."""
    config = Config(str(_ALEMBIC_INI))
    script = ScriptDirectory.from_config(config)
    return script.get_current_head()


async def verify_migrations() -> bool:
    """
    Return True if the database's applied migration matches what this
    deploy's code expects. False on any mismatch OR if the check itself
    fails (e.g. DB unreachable, alembic_version table missing) -- a failed
    check is treated the same as a detected mismatch, never as "ok".
    """
    try:
        code_head = _code_head_revision()
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT version_num FROM alembic_version"))
            db_version = result.scalar()
    except Exception:
        logger.warning("Could not verify migration version", exc_info=True)
        return False

    if db_version != code_head:
        logger.warning(
            "Migration version mismatch: database is at %r, code expects %r -- "
            "run `alembic upgrade head` against this environment's database.",
            db_version,
            code_head,
        )
        return False
    return True
