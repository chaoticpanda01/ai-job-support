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
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column(
            "consent_given_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("profiles", "consent_given_at")
