"""
Alembic environment configuration — sync execution only.

We use DATABASE_SYNC_URL (psycopg2) for migrations even though the
application uses asyncpg at runtime. Alembic does not require async;
using a sync connection keeps migrations simpler and avoids nested
event loop issues.

autogenerate compares Base.metadata against the live DB schema. All
models must be imported (via app.models) before autogenerate runs.
"""

import os
from logging.config import fileConfig

# Import all models so their tables are registered with Base.metadata
import app.models  # noqa: F401
from alembic import context
from app.models.base import Base
from sqlalchemy import engine_from_config, pool

# ---------------------------------------------------------------------------
# Alembic config
# ---------------------------------------------------------------------------

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Allow overriding the URL at runtime (e.g. in CI):
#   alembic -x url=postgresql+psycopg2://... upgrade head
cmd_opts = context.get_x_argument(as_dictionary=True)
if "url" in cmd_opts:
    config.set_main_option("sqlalchemy.url", cmd_opts["url"])
elif os.getenv("DATABASE_SYNC_URL"):
    config.set_main_option("sqlalchemy.url", os.environ["DATABASE_SYNC_URL"])


# ---------------------------------------------------------------------------
# Autogenerate exclusions
# ---------------------------------------------------------------------------
# These object names are managed by the baseline migration (schema.sql)
# and should be ignored by autogenerate to prevent false-positive diffs.

EXCLUDED_TABLES = {"ai_usage_logs"}  # parent of partitioned set


# Partition tables follow the pattern ai_usage_logs_YYYY_MM
def include_object(
    object,  # noqa: A002
    name: str,
    type_: str,
    reflected: bool,
    compare_to,
) -> bool:
    if type_ == "table":
        # Exclude the parent partition table (SQLAlchemy sees it differently)
        if name in EXCLUDED_TABLES:
            return False
        # Exclude individual partition tables
        if name.startswith("ai_usage_logs_"):
            return False
    return True


# ---------------------------------------------------------------------------
# Migration runners
# ---------------------------------------------------------------------------


def run_migrations_offline() -> None:
    """
    Offline mode: emit SQL to stdout without a live DB connection.
    Useful for generating migration scripts for review before applying.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Online mode: connect to the DB and run migrations directly.
    This is the standard path used by `alembic upgrade head`.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,  # No pooling needed for one-shot migration runs
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            compare_type=True,
            compare_server_default=True,
            # Use transactional DDL where supported (PostgreSQL supports it)
            transaction_per_migration=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
