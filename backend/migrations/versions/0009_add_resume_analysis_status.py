"""add resumes.analysis_status/analysis_error_code/analysis_requested_at

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-13

Resume analysis runs as a background task that only wrote a row on success, so
a failed analysis left no trace and the client polled until it gave up. These
columns record the latest request on the resume: 'pending' while it runs,
'failed' with an error code when it fails, NULL once it succeeds or if none
was requested. A second CHECK keeps them consistent: only 'failed' has an error
code, and any status has a request time.
"""

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for column in (
        "analysis_status VARCHAR(20)",
        "analysis_error_code VARCHAR(50)",
        "analysis_requested_at TIMESTAMPTZ",
    ):
        op.execute(f"""
            DO $$ BEGIN
                ALTER TABLE resumes ADD COLUMN {column};
            EXCEPTION
                WHEN duplicate_column THEN NULL;
            END $$;
        """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE resumes ADD CONSTRAINT resumes_analysis_status_allowed
                CHECK (analysis_status IN ('pending', 'failed'));
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """)
    # IS NOT DISTINCT FROM, not =, so a NULL status compares as false rather than
    # NULL (a CHECK passes on NULL).
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE resumes ADD CONSTRAINT resumes_analysis_state_consistent
                CHECK (
                    (analysis_status IS NOT DISTINCT FROM 'failed')
                        = (analysis_error_code IS NOT NULL)
                    AND (analysis_status IS NULL OR analysis_requested_at IS NOT NULL)
                );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE resumes DROP CONSTRAINT IF EXISTS resumes_analysis_state_consistent")
    op.execute("ALTER TABLE resumes DROP CONSTRAINT IF EXISTS resumes_analysis_status_allowed")
    op.drop_column("resumes", "analysis_requested_at")
    op.drop_column("resumes", "analysis_error_code")
    op.drop_column("resumes", "analysis_status")
