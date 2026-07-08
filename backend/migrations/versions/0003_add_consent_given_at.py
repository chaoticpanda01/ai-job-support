"""add consent_given_at to profiles

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-06

Section 8.4 of the techspec requires explicit, timestamped AI-processing
consent from users before any of their data is sent to the Claude API.
This column records when the user ticked the consent checkbox during
onboarding. NULL means consent has not yet been given.
"""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN consent_given_at TIMESTAMP WITH TIME ZONE;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)


def downgrade() -> None:
    op.drop_column("profiles", "consent_given_at")
