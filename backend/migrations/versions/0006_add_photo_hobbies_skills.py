"""add photo, hobbies, special_skills, personal_requests to profiles

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-23

Adds the fields needed to close template/content gaps found comparing a
generated rirekisho against a real one: a photo box, a 特技・趣味 section,
and an editable 本人希望記入欄 with a boilerplate default. See design spec
at docs/superpowers/specs/2026-08-23-rirekisho-phase1-completeness-design.md.
"""

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN photo_storage_key VARCHAR(500);
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN hobbies TEXT;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN special_skills TEXT;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN personal_requests TEXT;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)


def downgrade() -> None:
    op.drop_column("profiles", "personal_requests")
    op.drop_column("profiles", "special_skills")
    op.drop_column("profiles", "hobbies")
    op.drop_column("profiles", "photo_storage_key")
