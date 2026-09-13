"""
Startup/health-check guard against migration/code deploy skew.

Render (this app's production host) auto-deploys backend code on every push
to main. Migrations used to be applied by hand, and in a real incident
(2026-08-30) new code referencing new columns went live before
`alembic upgrade head` was run against production, crashing every request
that touched the affected tables with a bare 500. The start command in
backend/render.yaml now runs migrations first, but only if the Render service
actually uses that command, and it can't catch a wrong database or code rolled
back behind the database. This module detects and surfaces a mismatch (not
blocked -- see main.py's lifespan) instead of a user finding a broken page.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text

from app.database import engine

logger = logging.getLogger(__name__)

_ALEMBIC_INI = Path(__file__).resolve().parent.parent.parent / "alembic.ini"


@lru_cache(maxsize=1)
def _code_head_revision() -> str | None:
    """The latest migration revision shipped in this deploy's migrations/ folder."""
    config = Config(str(_ALEMBIC_INI))
    config.set_main_option("script_location", str(_ALEMBIC_INI.parent / "migrations"))
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
            "if the database is behind, run `alembic upgrade head` against it; if it "
            "is at a revision this code doesn't have (e.g. after rolling back a "
            "deploy), deploy the newer code again or `alembic downgrade` from it.",
            db_version,
            code_head,
        )
        return False
    return True
