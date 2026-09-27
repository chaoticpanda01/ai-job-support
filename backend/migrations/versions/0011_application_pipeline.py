"""add the job pipeline statuses and job_applications.closed_from

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-27

The tracker becomes a pipeline: Saved (planning) -> Preparing -> Applied ->
Interviewing -> Offer (offered) -> Accepted, with Closed (rejected, withdrawn)
and Skipped branches that can be reopened. This adds the three new statuses in
stage order, and closed_from, which records the stage an archived job left so
reopening can return it there.

Postgres cannot drop an enum value, so the downgrade moves rows off the new
values and drops the column, but the three values stay in the type.
"""

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'preparing' AFTER 'planning'")
    op.execute("ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'accepted' AFTER 'offered'")
    op.execute("ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'skipped' AFTER 'withdrawn'")
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE job_applications ADD COLUMN closed_from application_status;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)


def downgrade() -> None:
    op.execute("UPDATE job_applications SET status = 'planning' WHERE status = 'preparing'")
    op.execute("UPDATE job_applications SET status = 'offered' WHERE status = 'accepted'")
    op.execute("UPDATE job_applications SET status = 'withdrawn' WHERE status = 'skipped'")
    op.drop_column("job_applications", "closed_from")
