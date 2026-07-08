"""Baseline schema — full schema from database/schema.sql

Revision ID: 0001
Revises:
Create Date: 2026-06-04

Executes database/schema.sql statement-by-statement so that errors in
optional blocks (pg_cron, pre-existing roles) don't abort the whole migration.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from pathlib import Path

from alembic import op
from sqlalchemy import text

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SCHEMA_PATH = Path(__file__).parent.parent.parent.parent / "database" / "schema.sql"

# Statements that are safe to skip if they fail (optional features / idempotency)
_IGNORABLE_ERRORS = (
    "already exists",
    "does not exist",
    "duplicate_object",
    "undefined_function",
    "undefined_object",
)


def _split_statements(sql: str) -> list[str]:
    """
    Split SQL into individual statements, respecting $$ dollar-quoted blocks.
    Strips single-line comments and blank lines before splitting on semicolons
    that appear outside dollar-quote pairs.
    """
    statements: list[str] = []
    current: list[str] = []
    in_dollar_quote = False
    dollar_tag = ""
    i = 0

    while i < len(sql):
        # Detect start/end of dollar-quoted string
        if sql[i] == "$":
            end = sql.find("$", i + 1)
            if end != -1:
                tag = sql[i : end + 1]
                if not in_dollar_quote:
                    in_dollar_quote = True
                    dollar_tag = tag
                    current.append(tag)
                    i = end + 1
                    continue
                elif tag == dollar_tag:
                    in_dollar_quote = False
                    dollar_tag = ""
                    current.append(tag)
                    i = end + 1
                    continue

        if not in_dollar_quote:
            # Skip single-line comments
            if sql[i : i + 2] == "--":
                newline = sql.find("\n", i)
                i = newline + 1 if newline != -1 else len(sql)
                continue
            # Statement boundary
            if sql[i] == ";":
                stmt = "".join(current).strip()
                if stmt:
                    statements.append(stmt)
                current = []
                i += 1
                continue

        current.append(sql[i])
        i += 1

    # Catch any trailing statement without a semicolon
    remaining = "".join(current).strip()
    if remaining:
        statements.append(remaining)

    return [s for s in statements if s]


def upgrade() -> None:
    schema_sql = _SCHEMA_PATH.read_text(encoding="utf-8")
    statements = _split_statements(schema_sql)

    conn = op.get_bind()

    for stmt in statements:
        # Skip pure comment blocks and empty statements
        clean = re.sub(r"--[^\n]*", "", stmt).strip()
        if not clean:
            continue

        try:
            conn.execute(text(stmt))
        except Exception as exc:
            msg = str(exc).lower()
            if any(pat in msg for pat in _IGNORABLE_ERRORS):
                # Optional feature or already-exists — safe to continue
                pass
            else:
                raise


def downgrade() -> None:
    op.execute(
        text("""
        DROP VIEW IF EXISTS v_active_subscriptions CASCADE;
        DROP VIEW IF EXISTS v_user_document_stats CASCADE;
        DROP VIEW IF EXISTS v_interview_session_summary CASCADE;
        DROP VIEW IF EXISTS v_user_monthly_usage CASCADE;

        DROP TABLE IF EXISTS ai_usage_logs CASCADE;
        DROP TABLE IF EXISTS notification_log CASCADE;
        DROP TABLE IF EXISTS billing_events CASCADE;
        DROP TABLE IF EXISTS subscriptions CASCADE;
        DROP TABLE IF EXISTS subscription_limits CASCADE;
        DROP TABLE IF EXISTS culture_glossary CASCADE;
        DROP TABLE IF EXISTS culture_topics CASCADE;
        DROP TABLE IF EXISTS visa_consultations CASCADE;
        DROP TABLE IF EXISTS interview_messages CASCADE;
        DROP TABLE IF EXISTS interview_sessions CASCADE;
        DROP TABLE IF EXISTS job_applications CASCADE;
        DROP TABLE IF EXISTS saved_jobs CASCADE;
        DROP TABLE IF EXISTS job_matches CASCADE;
        DROP TABLE IF EXISTS job_postings CASCADE;
        DROP TABLE IF EXISTS generated_documents CASCADE;
        DROP TABLE IF EXISTS resume_analyses CASCADE;
        DROP TABLE IF EXISTS resumes CASCADE;
        DROP TABLE IF EXISTS profiles CASCADE;
        DROP TABLE IF EXISTS users CASCADE;

        DROP FUNCTION IF EXISTS set_updated_at CASCADE;

        DROP TYPE IF EXISTS application_status CASCADE;
        DROP TYPE IF EXISTS billing_event_type CASCADE;
        DROP TYPE IF EXISTS subscription_status CASCADE;
        DROP TYPE IF EXISTS notification_status CASCADE;
        DROP TYPE IF EXISTS notification_channel CASCADE;
        DROP TYPE IF EXISTS original_language CASCADE;
        DROP TYPE IF EXISTS analysis_type CASCADE;
        DROP TYPE IF EXISTS message_role CASCADE;
        DROP TYPE IF EXISTS interview_status CASCADE;
        DROP TYPE IF EXISTS interview_type CASCADE;
        DROP TYPE IF EXISTS job_source_platform CASCADE;
        DROP TYPE IF EXISTS document_status CASCADE;
        DROP TYPE IF EXISTS document_type CASCADE;
        DROP TYPE IF EXISTS visa_status CASCADE;
        DROP TYPE IF EXISTS preferred_language CASCADE;
        DROP TYPE IF EXISTS japanese_level CASCADE;
        DROP TYPE IF EXISTS user_role CASCADE;
        DROP TYPE IF EXISTS subscription_tier CASCADE;

        DROP EXTENSION IF EXISTS btree_gin;
        DROP EXTENSION IF EXISTS pg_trgm;
    """)
    )
