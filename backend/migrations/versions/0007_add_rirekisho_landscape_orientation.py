"""add document_orientation enum + orientation column; add commute_time/dependents to profiles

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-30

Adds landscape rirekisho variant support: a new document_orientation enum
('portrait'/'landscape') + orientation column on generated_documents (NOT
NULL DEFAULT 'portrait', meaningful only for rirekisho), and two optional
free-text profile fields (commute_time, dependents) used only on the
landscape page 2 -- blank means the row is omitted from the rendered PDF
entirely. See design spec at
docs/superpowers/specs/2026-08-30-landscape-rirekisho-design.md.
"""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE document_orientation AS ENUM ('portrait', 'landscape');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE generated_documents
                ADD COLUMN orientation document_orientation NOT NULL DEFAULT 'portrait';
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN commute_time TEXT;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN dependents TEXT;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)


def downgrade() -> None:
    op.drop_column("profiles", "dependents")
    op.drop_column("profiles", "commute_time")
    op.drop_column("generated_documents", "orientation")
    op.execute("DROP TYPE document_orientation")
