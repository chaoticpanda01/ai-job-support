"""add user_role enum and role column to users

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-05
"""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE user_role AS ENUM ('user', 'admin');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.add_column(
        "users",
        sa.Column(
            "role",
            sa.Enum("user", "admin", name="user_role", create_type=False),
            nullable=False,
            server_default="user",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "role")
    op.execute("DROP TYPE user_role")
