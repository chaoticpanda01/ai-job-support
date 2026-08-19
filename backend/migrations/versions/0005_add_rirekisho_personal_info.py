"""add rirekisho personal-info fields to profiles, bump onboarding_step boundary to 5

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-19

Adds the fields needed to generate a 履歴書 (rirekisho) without asking
Gemini to invent them from resume text: name_kana, date_of_birth, gender,
phone_number, mailing_address, residence_card_expiration, visa_category.

Also moves the onboarding-completion boundary from onboarding_step = 4 to
onboarding_step = 5, since these fields are collected in a new final
onboarding step placed after the existing step 4. Any user who already
reached step 4 under the old rule will no longer read as "complete" until
they finish the new step — expected, not a bug (see design spec at
docs/superpowers/specs/2026-08-19-rirekisho-personal-info-design.md).
"""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- New gender enum type
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE gender AS ENUM ('male', 'female');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # -- New personal-info columns on profiles
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN name_kana VARCHAR(255);
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN date_of_birth DATE;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN gender gender;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN phone_number VARCHAR(50);
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN mailing_address TEXT;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN residence_card_expiration DATE;
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE profiles ADD COLUMN visa_category VARCHAR(255);
        EXCEPTION
            WHEN duplicate_column THEN NULL;
        END $$;
    """)

    # -- Bump onboarding_step boundary: CHECK constraint 0-4 -> 0-5.
    # profiles_onboarding_step_check is the real, Postgres-assigned name for
    # the inline CHECK in schema.sql (confirmed via pg_constraint) — the
    # SQLAlchemy model's __table_args__ declares a differently-named
    # CheckConstraint ("profiles_onboarding_step_range") that was never
    # actually applied to the DB; this migration targets the real name and
    # keeps it, rather than fixing that pre-existing, unrelated mismatch.
    op.execute("ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_onboarding_step_check")
    op.execute(
        "ALTER TABLE profiles ADD CONSTRAINT profiles_onboarding_step_check "
        "CHECK (onboarding_step BETWEEN 0 AND 5)"
    )

    # -- Bump onboarding_completed: STORED GENERATED expression 4 -> 5.
    # Postgres has no ALTER COLUMN ... SET EXPRESSION; drop and re-add
    # instead. Safe because this column is purely derived — dropping and
    # re-adding recomputes it for every existing row from its current
    # onboarding_step value.
    op.execute("ALTER TABLE profiles DROP COLUMN IF EXISTS onboarding_completed")
    op.execute(
        "ALTER TABLE profiles ADD COLUMN onboarding_completed BOOLEAN "
        "GENERATED ALWAYS AS (onboarding_step = 5) STORED"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE profiles DROP COLUMN IF EXISTS onboarding_completed")
    op.execute(
        "ALTER TABLE profiles ADD COLUMN onboarding_completed BOOLEAN "
        "GENERATED ALWAYS AS (onboarding_step = 4) STORED"
    )
    op.execute("ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_onboarding_step_check")
    op.execute(
        "ALTER TABLE profiles ADD CONSTRAINT profiles_onboarding_step_check "
        "CHECK (onboarding_step BETWEEN 0 AND 4)"
    )
    op.drop_column("profiles", "visa_category")
    op.drop_column("profiles", "residence_card_expiration")
    op.drop_column("profiles", "mailing_address")
    op.drop_column("profiles", "phone_number")
    op.drop_column("profiles", "gender")
    op.drop_column("profiles", "date_of_birth")
    op.drop_column("profiles", "name_kana")
    op.execute("DROP TYPE IF EXISTS gender")
