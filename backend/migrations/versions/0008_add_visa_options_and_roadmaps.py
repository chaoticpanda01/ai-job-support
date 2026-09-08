"""add visa_consultations.options/active_roadmap_id + visa_roadmaps table

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-08

Turns a visa consultation into an assessment that carries several scored visa
options (options JSONB), and adds visa_roadmaps to hold one generated roadmap
per chosen category, unique per (consultation_id, visa_type) so re-opening a
visa never re-bills an AI call. completed_steps persists checklist progress
that previously lived only in React state. See design spec at
docs/superpowers/specs/2026-09-08-visa-choice-design.md.
"""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE visa_consultations
                ADD COLUMN options JSONB NOT NULL DEFAULT '[]'::jsonb;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE visa_consultations ADD COLUMN active_roadmap_id UUID;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS visa_roadmaps (
          id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id          UUID         NOT NULL,
          consultation_id  UUID         NOT NULL,
          visa_type        VARCHAR(100) NOT NULL,
          ai_guidance      TEXT,
          checklist        JSONB        NOT NULL,
          completed_steps  TEXT[]       NOT NULL DEFAULT '{}',
          created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

          CONSTRAINT visa_roadmaps_user_fk FOREIGN KEY (user_id)
            REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT visa_roadmaps_consultation_fk FOREIGN KEY (consultation_id)
            REFERENCES visa_consultations(id) ON DELETE CASCADE,
          CONSTRAINT visa_roadmaps_consultation_visa_uk UNIQUE (consultation_id, visa_type)
        );
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_visa_roadmaps_consultation
          ON visa_roadmaps (consultation_id);
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TRIGGER visa_roadmaps_updated_at
              BEFORE UPDATE ON visa_roadmaps
              FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS visa_roadmaps")
    op.drop_column("visa_consultations", "active_roadmap_id")
    op.drop_column("visa_consultations", "options")
