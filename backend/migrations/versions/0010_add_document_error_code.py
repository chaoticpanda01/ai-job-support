"""add generated_documents.error_code

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-20

Document generation runs as a background task that recorded a failure only for
the one exception type it caught, and recorded it as an English sentence. This
column stores a stable code instead, so the client can show the failure in the
user's own language and tell an out-of-budget run apart from a broken file.
The CHECK only rules out a code on a document that did not fail: rows that
failed before this column existed keep a NULL code and are reported as an
unknown failure.
"""

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE generated_documents ADD COLUMN error_code VARCHAR(50);
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE generated_documents ADD CONSTRAINT gen_docs_error_code_failed_only
                CHECK (error_code IS NULL OR status = 'failed');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """)


def downgrade() -> None:
    op.execute(
        "ALTER TABLE generated_documents DROP CONSTRAINT IF EXISTS gen_docs_error_code_failed_only"
    )
    op.drop_column("generated_documents", "error_code")
