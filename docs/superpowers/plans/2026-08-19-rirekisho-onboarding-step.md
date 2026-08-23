# Rirekisho Onboarding Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect the seven personal-info fields (name in kana, date of birth, gender, phone, mailing address, residence card expiration, visa category) that the rirekisho generator currently has no reliable source for, via a new final onboarding step.

**Architecture:** New nullable columns on `profiles` (DB migration + `schema.sql`), new `Gender` enum, exposed through `ProfileResponse`/`ProfileUpdateRequest`, collected by a new `Step5` in the onboarding wizard placed after the existing step 4 so it can read the already-saved `visa_status` and conditionally require `visa_category`. The onboarding-completion boundary moves from `onboarding_step = 4` to `= 5`. This plan is Phase 1 of the design spec (`docs/superpowers/specs/2026-08-19-rirekisho-personal-info-design.md`) — it only collects the data. Phase 2 (wiring it into rirekisho generation) is a separate, later plan, since it depends on this one's columns existing and involves substantial, independent test rework in the document-generation pipeline.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy async, Alembic, PostgreSQL 16, Next.js 15, TypeScript, react-hook-form + Zod.

---

### Task 1: Alembic migration — new columns, new enum, onboarding_step boundary

**Files:**
- Create: `backend/migrations/versions/0005_add_rirekisho_personal_info.py`

- [ ] **Step 1: Write the migration**

```python
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
```

- [ ] **Step 2: Apply the migration locally**

Run (from `backend/`, venv active, local Postgres running):
```bash
alembic upgrade head
```
Expected: no errors, final line mentions upgrading to `0005`.

- [ ] **Step 3: Verify the new columns and boundary exist**

```bash
psql postgresql://postgres:postgres@localhost:5432/ai_job_support -c "\d profiles"
```
Expected: `name_kana`, `date_of_birth`, `gender`, `phone_number`, `mailing_address`, `residence_card_expiration`, `visa_category` all present; `onboarding_completed` shows `generated always as (onboarding_step = 5) stored`; the `profiles_onboarding_step_check` constraint shows `(onboarding_step >= 0 AND onboarding_step <= 5)`.

- [ ] **Step 4: Verify downgrade works, then re-upgrade**

```bash
alembic downgrade -1
psql postgresql://postgres:postgres@localhost:5432/ai_job_support -c "\d profiles" | grep -c "name_kana\|date_of_birth\|phone_number\|mailing_address\|residence_card_expiration\|visa_category"
```
Expected: `0` (all 6 non-gender columns gone — `gender` the enum type check is separate, see next command).
```bash
psql postgresql://postgres:postgres@localhost:5432/ai_job_support -c "SELECT typname FROM pg_type WHERE typname = 'gender';"
```
Expected: `0 rows` (enum type dropped).
```bash
alembic upgrade head
```
Expected: re-applies cleanly, no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/versions/0005_add_rirekisho_personal_info.py
git commit -m "Add migration: rirekisho personal-info fields on profiles

New nullable columns (name_kana, date_of_birth, gender, phone_number,
mailing_address, residence_card_expiration, visa_category) plus a new
gender enum, and bumps the onboarding_step completion boundary from 4
to 5 to make room for the new final onboarding step that collects
them."
```

---

### Task 2: Sync `database/schema.sql`

**Files:**
- Modify: `database/schema.sql`

`schema.sql` is the source of truth for fresh installs (executed statement-by-statement by the baseline migration, and mounted directly into Docker's Postgres init in `docker-compose.yml`) — it must reflect the same end state as the migration in Task 1.

- [ ] **Step 1: Add the `gender` enum type**

Find this line (in the `CREATE TYPE` block near the top of the file):
```sql
CREATE TYPE visa_status         AS ENUM ('none', 'pending', 'held');
```

Add immediately after it:
```sql
CREATE TYPE visa_status         AS ENUM ('none', 'pending', 'held');
CREATE TYPE gender              AS ENUM ('male', 'female');
```

- [ ] **Step 2: Add the new columns and bump the onboarding_step boundary**

Find the `profiles` table definition:
```sql
CREATE TABLE profiles (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL,
  nationality           VARCHAR(100) NOT NULL DEFAULT 'Indonesian',
  japanese_level        japanese_level NOT NULL DEFAULT 'none',
  target_industry       TEXT[]      NOT NULL DEFAULT '{}',
  target_role           TEXT[]      NOT NULL DEFAULT '{}',
  years_experience      SMALLINT    CHECK (years_experience >= 0 AND years_experience <= 80),
  current_location      VARCHAR(255),
  target_location       VARCHAR(255),
  visa_status           visa_status NOT NULL DEFAULT 'none',
  preferred_language    preferred_language NOT NULL DEFAULT 'id',
  onboarding_step       SMALLINT    NOT NULL DEFAULT 0 CHECK (onboarding_step BETWEEN 0 AND 4),
  onboarding_completed  BOOLEAN     GENERATED ALWAYS AS (onboarding_step = 4) STORED,
  consent_given_at      TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT profiles_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_user_id_uk UNIQUE (user_id)
);
```

Replace with:
```sql
CREATE TABLE profiles (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL,
  nationality           VARCHAR(100) NOT NULL DEFAULT 'Indonesian',
  japanese_level        japanese_level NOT NULL DEFAULT 'none',
  target_industry       TEXT[]      NOT NULL DEFAULT '{}',
  target_role           TEXT[]      NOT NULL DEFAULT '{}',
  years_experience      SMALLINT    CHECK (years_experience >= 0 AND years_experience <= 80),
  current_location      VARCHAR(255),
  target_location       VARCHAR(255),
  visa_status           visa_status NOT NULL DEFAULT 'none',
  preferred_language    preferred_language NOT NULL DEFAULT 'id',
  onboarding_step       SMALLINT    NOT NULL DEFAULT 0 CHECK (onboarding_step BETWEEN 0 AND 5),
  onboarding_completed  BOOLEAN     GENERATED ALWAYS AS (onboarding_step = 5) STORED,
  consent_given_at      TIMESTAMPTZ,
  name_kana             VARCHAR(255),
  date_of_birth         DATE,
  gender                gender,
  phone_number          VARCHAR(50),
  mailing_address       TEXT,
  residence_card_expiration DATE,
  visa_category         VARCHAR(255),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT profiles_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_user_id_uk UNIQUE (user_id)
);
```

- [ ] **Step 3: Verify a fresh install still works**

This can't be fully tested without spinning up a fresh Docker Postgres, which is out of scope for this task — instead, sanity-check the SQL is valid by running just the two changed statements against a throwaway database:

```bash
createdb schema_sync_check
psql postgresql://postgres:postgres@localhost:5432/schema_sync_check -c "CREATE TYPE visa_status AS ENUM ('none', 'pending', 'held'); CREATE TYPE gender AS ENUM ('male', 'female');"
psql postgresql://postgres:postgres@localhost:5432/schema_sync_check -c "
CREATE TABLE profiles_check (
  onboarding_step SMALLINT NOT NULL DEFAULT 0 CHECK (onboarding_step BETWEEN 0 AND 5),
  onboarding_completed BOOLEAN GENERATED ALWAYS AS (onboarding_step = 5) STORED,
  name_kana VARCHAR(255),
  date_of_birth DATE,
  gender gender,
  phone_number VARCHAR(50),
  mailing_address TEXT,
  residence_card_expiration DATE,
  visa_category VARCHAR(255)
);"
dropdb schema_sync_check
```
Expected: both commands succeed with `CREATE TYPE` / `CREATE TABLE`, no errors. The final `dropdb` cleans up the throwaway database.

- [ ] **Step 4: Commit**

```bash
git add database/schema.sql
git commit -m "Sync schema.sql with the rirekisho personal-info migration

Keeps schema.sql (the source of truth for fresh installs) consistent
with migration 0005."
```

---

### Task 3: `Gender` enum in `app/models/enums.py`

**Files:**
- Modify: `backend/app/models/enums.py`

- [ ] **Step 1: Add the `Gender` Python enum**

Find:
```python
class VisaStatus(str, enum.Enum):
    none = "none"
    pending = "pending"
    held = "held"
```

Add immediately after it:
```python
class VisaStatus(str, enum.Enum):
    none = "none"
    pending = "pending"
    held = "held"


class Gender(str, enum.Enum):
    male = "male"
    female = "female"
```

- [ ] **Step 2: Add the `sa_gender` SQLAlchemy Enum object**

Find:
```python
sa_visa_status = SAEnum(VisaStatus, name="visa_status", **_kw)
```

Add immediately after it:
```python
sa_visa_status = SAEnum(VisaStatus, name="visa_status", **_kw)
sa_gender = SAEnum(Gender, name="gender", **_kw)
```

- [ ] **Step 3: Verify**

```bash
cd backend && source .venv/bin/activate
python -c "from app.models.enums import Gender, sa_gender; print(Gender.male.value, sa_gender.name)"
```
Expected: `male gender`

- [ ] **Step 4: Commit**

```bash
git add app/models/enums.py
git commit -m "Add Gender enum"
```

---

### Task 4: `Profile` model columns in `app/models/user.py`

**Files:**
- Modify: `backend/app/models/user.py`

- [ ] **Step 1: Update the enum imports**

Find:
```python
from app.models.enums import (
    JapaneseLevel,
    PreferredLanguage,
    SubscriptionTier,
    UserRole,
    VisaStatus,
    sa_japanese_level,
    sa_preferred_language,
    sa_subscription_tier,
    sa_user_role,
    sa_visa_status,
)
```

Replace with:
```python
from app.models.enums import (
    Gender,
    JapaneseLevel,
    PreferredLanguage,
    SubscriptionTier,
    UserRole,
    VisaStatus,
    sa_gender,
    sa_japanese_level,
    sa_preferred_language,
    sa_subscription_tier,
    sa_user_role,
    sa_visa_status,
)
```

- [ ] **Step 2: Add `date` to the datetime import**

Find:
```python
from datetime import datetime
```

Replace with:
```python
from datetime import date, datetime
```

- [ ] **Step 3: Update the `Profile` class docstring and `__table_args__`**

Find:
```python
class Profile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Extended job-seeking preferences. One-to-one with User (enforced by unique
    constraint on user_id).

    onboarding_step:
        0 = not started
        1 = basic info saved
        2 = resume uploaded
        3 = preferences set
        4 = completed

    onboarding_completed is a STORED GENERATED column — always derived from
    onboarding_step = 4. Never set it directly.
    """

    __tablename__ = "profiles"
    __table_args__ = (
        UniqueConstraint("user_id", name="profiles_user_id_uk"),
        CheckConstraint(
            "years_experience >= 0 AND years_experience <= 80",
            name="profiles_years_experience_range",
        ),
        CheckConstraint(
            "onboarding_step BETWEEN 0 AND 4",
            name="profiles_onboarding_step_range",
        ),
        Index("idx_profiles_user_id", "user_id"),
    )
```

Replace with:
```python
class Profile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Extended job-seeking preferences. One-to-one with User (enforced by unique
    constraint on user_id).

    onboarding_step:
        0 = not started
        1 = basic info saved
        2 = resume uploaded
        3 = preferences set
        4 = Japanese level / visa / preferences saved
        5 = completed (rirekisho personal-info step done)

    onboarding_completed is a STORED GENERATED column — always derived from
    onboarding_step = 5. Never set it directly.
    """

    __tablename__ = "profiles"
    __table_args__ = (
        UniqueConstraint("user_id", name="profiles_user_id_uk"),
        CheckConstraint(
            "years_experience >= 0 AND years_experience <= 80",
            name="profiles_years_experience_range",
        ),
        CheckConstraint(
            "onboarding_step BETWEEN 0 AND 5",
            name="profiles_onboarding_step_range",
        ),
        Index("idx_profiles_user_id", "user_id"),
    )
```

- [ ] **Step 4: Add `Date` to the sqlalchemy import**

Find:
```python
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
```

Replace with:
```python
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Computed,
    Date,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
```

- [ ] **Step 5: Add the new columns**

Find:
```python
    onboarding_step: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("0")
    )
    # STORED GENERATED: computed by PostgreSQL. Read-only in ORM.
    onboarding_completed: Mapped[bool] = mapped_column(
        Computed("onboarding_step = 4", persisted=True),
    )
    # Explicit AI-processing consent (Section 8.4). NULL = not yet given.
    consent_given_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # --- Relationships ---
    user: Mapped["User"] = relationship("User", back_populates="profile")
```

Replace with:
```python
    onboarding_step: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("0")
    )
    # STORED GENERATED: computed by PostgreSQL. Read-only in ORM.
    onboarding_completed: Mapped[bool] = mapped_column(
        Computed("onboarding_step = 5", persisted=True),
    )
    # Explicit AI-processing consent (Section 8.4). NULL = not yet given.
    consent_given_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # --- Rirekisho personal-info fields (collected in onboarding step 5) ---
    name_kana: Mapped[str | None] = mapped_column(String(255))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    gender: Mapped[Gender | None] = mapped_column(sa_gender)
    phone_number: Mapped[str | None] = mapped_column(String(50))
    mailing_address: Mapped[str | None] = mapped_column(Text)
    residence_card_expiration: Mapped[date | None] = mapped_column(Date)
    visa_category: Mapped[str | None] = mapped_column(String(255))

    # --- Relationships ---
    user: Mapped["User"] = relationship("User", back_populates="profile")
```

- [ ] **Step 6: Verify**

```bash
cd backend && source .venv/bin/activate
ruff check app/models/user.py
ruff format --check app/models/user.py
mypy app/models/user.py
```
Expected: all three pass clean (`All checks passed!`, `1 file already formatted`, `Success: no issues found in 1 source file`).

- [ ] **Step 7: Commit**

```bash
git add app/models/user.py
git commit -m "Add rirekisho personal-info columns to Profile model"
```

---

### Task 5: `ProfileResponse` / `ProfileUpdateRequest` schemas

**Files:**
- Modify: `backend/app/schemas/user.py`

- [ ] **Step 1: Update imports**

Find:
```python
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import (
    JapaneseLevel,
    PreferredLanguage,
    SubscriptionTier,
    UserRole,
    VisaStatus,
)
```

Replace with:
```python
from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import (
    Gender,
    JapaneseLevel,
    PreferredLanguage,
    SubscriptionTier,
    UserRole,
    VisaStatus,
)
```

- [ ] **Step 2: Update `ProfileResponse` and `ProfileUpdateRequest`**

Find:
```python
class ProfileResponse(_Base):
    id: UUID
    user_id: UUID
    nationality: str
    japanese_level: JapaneseLevel
    target_industry: list[str]
    target_role: list[str]
    years_experience: int | None
    current_location: str | None
    target_location: str | None
    visa_status: VisaStatus
    preferred_language: PreferredLanguage
    onboarding_step: int
    onboarding_completed: bool
    consent_given_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ProfileUpdateRequest(_Base):
    nationality: str | None = None
    japanese_level: JapaneseLevel | None = None
    target_industry: list[str] | None = None
    target_role: list[str] | None = None
    years_experience: int | None = Field(None, ge=0, le=80)
    current_location: str | None = None
    target_location: str | None = None
    visa_status: VisaStatus | None = None
    preferred_language: PreferredLanguage | None = None
    onboarding_step: int | None = Field(None, ge=0, le=4)
```

Replace with:
```python
class ProfileResponse(_Base):
    id: UUID
    user_id: UUID
    nationality: str
    japanese_level: JapaneseLevel
    target_industry: list[str]
    target_role: list[str]
    years_experience: int | None
    current_location: str | None
    target_location: str | None
    visa_status: VisaStatus
    preferred_language: PreferredLanguage
    onboarding_step: int
    onboarding_completed: bool
    consent_given_at: datetime | None
    name_kana: str | None
    date_of_birth: date | None
    gender: Gender | None
    phone_number: str | None
    mailing_address: str | None
    residence_card_expiration: date | None
    visa_category: str | None
    created_at: datetime
    updated_at: datetime


class ProfileUpdateRequest(_Base):
    nationality: str | None = None
    japanese_level: JapaneseLevel | None = None
    target_industry: list[str] | None = None
    target_role: list[str] | None = None
    years_experience: int | None = Field(None, ge=0, le=80)
    current_location: str | None = None
    target_location: str | None = None
    visa_status: VisaStatus | None = None
    preferred_language: PreferredLanguage | None = None
    onboarding_step: int | None = Field(None, ge=0, le=5)
    name_kana: str | None = None
    date_of_birth: date | None = None
    gender: Gender | None = None
    phone_number: str | None = None
    mailing_address: str | None = None
    residence_card_expiration: date | None = None
    visa_category: str | None = None
```

- [ ] **Step 3: Verify**

```bash
ruff check app/schemas/user.py
ruff format --check app/schemas/user.py
mypy app/schemas/user.py
```
Expected: all pass clean.

- [ ] **Step 4: Commit**

```bash
git add app/schemas/user.py
git commit -m "Add rirekisho personal-info fields to ProfileResponse/ProfileUpdateRequest, bump onboarding_step bound to 5"
```

---

### Task 6: Update shared test fixture `make_profile()`

**Files:**
- Modify: `backend/tests/conftest.py`

`make_profile()` uses `MagicMock(spec=Profile)`. Once Task 4 adds the new columns to the real `Profile` class, accessing an unset new attribute on this mock would return an auto-generated `MagicMock()` (not `None`) — which is truthy and would break any future code that checks `if profile.date_of_birth is None`. Set explicit `None` defaults now, matching the existing pattern for every other nullable field in this fixture, so it represents an "incomplete" profile by default (the realistic default for existing test users) and any test needing a complete one can override specific attributes.

- [ ] **Step 1: Add explicit defaults for the new fields**

Find:
```python
def make_profile(user_id: uuid.UUID | None = None) -> MagicMock:
    """Build a mock Profile ORM object."""
    profile = MagicMock(spec=Profile)
    profile.id = uuid.uuid4()
    profile.user_id = user_id or uuid.uuid4()
    profile.nationality = "Indonesian"
    profile.japanese_level = "none"
    profile.target_industry = []
    profile.target_role = []
    profile.years_experience = None
    profile.current_location = None
    profile.target_location = None
    profile.visa_status = "none"
    profile.preferred_language = "id"
    profile.onboarding_step = 0
    profile.onboarding_completed = False
    return profile
```

Replace with:
```python
def make_profile(user_id: uuid.UUID | None = None) -> MagicMock:
    """Build a mock Profile ORM object."""
    profile = MagicMock(spec=Profile)
    profile.id = uuid.uuid4()
    profile.user_id = user_id or uuid.uuid4()
    profile.nationality = "Indonesian"
    profile.japanese_level = "none"
    profile.target_industry = []
    profile.target_role = []
    profile.years_experience = None
    profile.current_location = None
    profile.target_location = None
    profile.visa_status = "none"
    profile.preferred_language = "id"
    profile.onboarding_step = 0
    profile.onboarding_completed = False
    profile.name_kana = None
    profile.date_of_birth = None
    profile.gender = None
    profile.phone_number = None
    profile.mailing_address = None
    profile.residence_card_expiration = None
    profile.visa_category = None
    return profile
```

- [ ] **Step 2: Run the full backend test suite**

```bash
pytest -q
```
Expected: same pass count as before this task (this change only adds explicit `None` defaults; it doesn't change any test's actual assertions). Confirm no new failures.

- [ ] **Step 3: Commit**

```bash
git add tests/conftest.py
git commit -m "Add explicit None defaults for new Profile fields in make_profile() fixture"
```

---

### Task 7: Full backend verification

**Files:** none (verification only)

- [ ] **Step 1: Run ruff, mypy, pytest across the whole backend**

```bash
cd backend && source .venv/bin/activate
ruff check .
ruff format --check .
mypy app/
pytest -q
```
Expected: all clean, same or higher pass count than the pre-task baseline (268 passed as of the last full run in this session).

- [ ] **Step 2: Run `alembic check`**

```bash
alembic check
```
Note: this repo has a known, pre-existing local-environment issue where `alembic check` fails with `InterpolationMissingOptionError` on `DATABASE_SYNC_URL` unrelated to any migration content — this is a config-interpolation quirk in `alembic.ini`, not a sign of migration drift. If this specific error occurs, it is NOT a regression from this plan's work — note it and move on. If a *different* error occurs (e.g. an actual model/migration mismatch unrelated to that interpolation issue), treat it as a real problem and investigate.

No commit for this task — verification only.

---

### Task 8: Frontend TypeScript types

**Files:**
- Modify: `frontend/types/api.ts`

- [ ] **Step 1: Add the `Gender` type and new `Profile` fields**

Find:
```typescript
export type SubscriptionTier = "free" | "basic" | "pro";
export type UserRole = "user" | "admin";
export type JapaneseLevel = "N1" | "N2" | "N3" | "N4" | "N5" | "none";
export type VisaStatus = "none" | "pending" | "held";
export type PreferredLanguage = "id" | "en" | "ja";
export type AnalysisType = "general" | "job_match" | "gap_analysis";

export interface Profile {
  id: string;
  user_id: string;
  nationality: string;
  japanese_level: JapaneseLevel;
  target_industry: string[];
  target_role: string[];
  years_experience: number | null;
  current_location: string | null;
  target_location: string | null;
  visa_status: VisaStatus;
  preferred_language: PreferredLanguage;
  onboarding_step: number;
  onboarding_completed: boolean;
  consent_given_at: string | null;
  created_at: string;
  updated_at: string;
}
```

Replace with:
```typescript
export type SubscriptionTier = "free" | "basic" | "pro";
export type UserRole = "user" | "admin";
export type JapaneseLevel = "N1" | "N2" | "N3" | "N4" | "N5" | "none";
export type VisaStatus = "none" | "pending" | "held";
export type PreferredLanguage = "id" | "en" | "ja";
export type AnalysisType = "general" | "job_match" | "gap_analysis";
export type Gender = "male" | "female";

export interface Profile {
  id: string;
  user_id: string;
  nationality: string;
  japanese_level: JapaneseLevel;
  target_industry: string[];
  target_role: string[];
  years_experience: number | null;
  current_location: string | null;
  target_location: string | null;
  visa_status: VisaStatus;
  preferred_language: PreferredLanguage;
  onboarding_step: number;
  onboarding_completed: boolean;
  consent_given_at: string | null;
  name_kana: string | null;
  date_of_birth: string | null;
  gender: Gender | null;
  phone_number: string | null;
  mailing_address: string | null;
  residence_card_expiration: string | null;
  visa_category: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Update `ProfileUpdateRequest`**

Find:
```typescript
export interface ProfileUpdateRequest {
  nationality?: string;
  japanese_level?: JapaneseLevel;
  target_industry?: string[];
  target_role?: string[];
  years_experience?: number | undefined;
  current_location?: string;
  target_location?: string;
  visa_status?: VisaStatus;
  preferred_language?: PreferredLanguage;
  onboarding_step?: number;
}
```

Replace with:
```typescript
export interface ProfileUpdateRequest {
  nationality?: string;
  japanese_level?: JapaneseLevel;
  target_industry?: string[];
  target_role?: string[];
  years_experience?: number | undefined;
  current_location?: string;
  target_location?: string;
  visa_status?: VisaStatus;
  preferred_language?: PreferredLanguage;
  onboarding_step?: number;
  name_kana?: string;
  date_of_birth?: string;
  gender?: Gender;
  phone_number?: string;
  mailing_address?: string;
  residence_card_expiration?: string;
  visa_category?: string;
}
```

- [ ] **Step 3: Verify**

```bash
cd frontend
npm run type-check
```
Expected: no errors (this file only adds types; nothing consumes the new fields yet in this task).

- [ ] **Step 4: Commit**

```bash
git add types/api.ts
git commit -m "Add rirekisho personal-info types to Profile/ProfileUpdateRequest"
```

---

### Task 9: i18n keys for the new onboarding step

**Files:**
- Modify: `frontend/lib/i18n.ts`

- [ ] **Step 1: Add step 5 keys and fix step 4's button label**

Find (the end of the `onboarding` section):
```typescript
    completeBtn: { en: "Complete setup", id: "Selesaikan pengaturan", ja: "設定を完了" },
    noJapanese: { en: "No Japanese", id: "Belum bisa Bahasa Jepang", ja: "日本語なし" },
    visaNone: { en: "No visa yet", id: "Belum ada visa", ja: "ビザなし" },
    visaPending: { en: "Application in progress", id: "Sedang diproses", ja: "申請中" },
    visaHeld: { en: "Already holding a visa", id: "Sudah memiliki visa", ja: "取得済み" },
  },
```

Replace with (note: `completeBtn` now moves to Step 5, since Step 4 is no longer the last step — Step 4's own button will switch to reusing the existing `common.continue` key, changed in Task 10, not here):
```typescript
    completeBtn: { en: "Complete setup", id: "Selesaikan pengaturan", ja: "設定を完了" },
    noJapanese: { en: "No Japanese", id: "Belum bisa Bahasa Jepang", ja: "日本語なし" },
    visaNone: { en: "No visa yet", id: "Belum ada visa", ja: "ビザなし" },
    visaPending: { en: "Application in progress", id: "Sedang diproses", ja: "申請中" },
    visaHeld: { en: "Already holding a visa", id: "Sudah memiliki visa", ja: "取得済み" },
    // Step 5 — Personal info for 履歴書
    s5Title: {
      en: "履歴書 personal info",
      id: "Info pribadi untuk 履歴書",
      ja: "履歴書用の個人情報",
    },
    s5Sub: {
      en: "This is used to fill in your 履歴書 accurately — never guessed or invented.",
      id: "Digunakan untuk mengisi 履歴書 kamu secara akurat — tidak pernah ditebak.",
      ja: "履歴書を正確に作成するために使用されます。推測で埋めることはありません。",
    },
    s5GroupIdentity: { en: "Identity", id: "Identitas", ja: "本人情報" },
    s5GroupContact: { en: "Contact", id: "Kontak", ja: "連絡先" },
    s5GroupVisa: { en: "Visa", id: "Visa", ja: "ビザ情報" },
    s5NameKana: {
      en: "Name in katakana (ふりがな)",
      id: "Nama dalam katakana (ふりがな)",
      ja: "ふりがな",
    },
    s5DateOfBirth: { en: "Date of birth", id: "Tanggal lahir", ja: "生年月日" },
    s5Gender: { en: "Gender", id: "Jenis kelamin", ja: "性別" },
    s5GenderMale: { en: "Male", id: "Laki-laki", ja: "男性" },
    s5GenderFemale: { en: "Female", id: "Perempuan", ja: "女性" },
    s5Phone: { en: "Phone number", id: "Nomor telepon", ja: "電話番号" },
    s5Address: { en: "Mailing address", id: "Alamat surat", ja: "住所" },
    s5VisaExpiration: {
      en: "Residence card expiration date",
      id: "Tanggal kedaluwarsa kartu izin tinggal",
      ja: "在留カード有効期限",
    },
    s5VisaCategory: {
      en: "Visa category (e.g. Engineer/Specialist in Humanities)",
      id: "Kategori visa (misalnya Insinyur/Spesialis Humaniora)",
      ja: "在留資格（例：技術・人文知識・国際業務）",
    },
  },
```

- [ ] **Step 2: Verify**

```bash
npm run type-check
npm run lint
```
Expected: both pass clean.

- [ ] **Step 3: Commit**

```bash
git add lib/i18n.ts
git commit -m "Add i18n keys for the new onboarding step 5 (personal info)"
```

---

### Task 10: `Step5` component and onboarding wizard wiring

**Files:**
- Modify: `frontend/app/onboarding/page.tsx`

- [ ] **Step 1: Add the `Gender` import and `step5Schema`**

Find:
```typescript
import { useMe, useUpdateProfile, useRecordConsent } from "@/hooks/useMe";
import { ApiClientError } from "@/lib/api-client";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { JapaneseLevel, VisaStatus } from "@/types/api";
```

Replace with:
```typescript
import { useMe, useUpdateProfile, useRecordConsent } from "@/hooks/useMe";
import { ApiClientError } from "@/lib/api-client";
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";
import type { Gender, JapaneseLevel, VisaStatus } from "@/types/api";
```

Find:
```typescript
const step4Schema = z.object({
  japanese_level: z.enum(["N1", "N2", "N3", "N4", "N5", "none"] as const),
  visa_status: z.enum(["none", "pending", "held"] as const),
  target_industry: z.string().min(1, "Enter at least one industry"),
  target_role: z.string().min(1, "Enter at least one role"),
});

type Step2Data = z.infer<typeof step2Schema>;
type Step3Data = z.infer<typeof step3Schema>;
type Step4Data = z.infer<typeof step4Schema>;

const TOTAL_STEPS = 4;
```

Replace with:
```typescript
const step4Schema = z.object({
  japanese_level: z.enum(["N1", "N2", "N3", "N4", "N5", "none"] as const),
  visa_status: z.enum(["none", "pending", "held"] as const),
  target_industry: z.string().min(1, "Enter at least one industry"),
  target_role: z.string().min(1, "Enter at least one role"),
});

const step5BaseSchema = z.object({
  name_kana: z.string().min(1, "Furigana is required"),
  date_of_birth: z.string().min(1, "Date of birth is required"),
  gender: z.enum(["male", "female"] as const),
  phone_number: z.string().min(1, "Phone number is required"),
  mailing_address: z.string().min(1, "Mailing address is required"),
  residence_card_expiration: z.string().min(1, "Residence card expiration date is required"),
  visa_category: z.string().optional(),
});

type Step2Data = z.infer<typeof step2Schema>;
type Step3Data = z.infer<typeof step3Schema>;
type Step4Data = z.infer<typeof step4Schema>;
type Step5Data = z.infer<typeof step5BaseSchema>;

const TOTAL_STEPS = 5;
```

- [ ] **Step 2: Wire `Step5` into the page's step switch, and change Step 4's completion behavior**

Find:
```typescript
        {/* Step 4 — Japanese level + preferences */}
        {step === 4 && (
          <Step4
            onNext={async (data) => {
              setError(null);
              try {
                await updateProfile.mutateAsync({
                  japanese_level: data.japanese_level as JapaneseLevel,
                  visa_status: data.visa_status as VisaStatus,
                  target_industry: data.target_industry
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  target_role: data.target_role
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  onboarding_step: 4,
                });
                router.push("/dashboard/resumes");
              } catch (err) {
                setError(errorMessage(err, lang));
              }
            }}
            onBack={() => setStep(3)}
            loading={updateProfile.isPending}
          />
        )}
      </div>
    </div>
  );
}
```

Replace with:
```typescript
        {/* Step 4 — Japanese level + preferences */}
        {step === 4 && (
          <Step4
            onNext={async (data) => {
              setError(null);
              try {
                await updateProfile.mutateAsync({
                  japanese_level: data.japanese_level as JapaneseLevel,
                  visa_status: data.visa_status as VisaStatus,
                  target_industry: data.target_industry
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  target_role: data.target_role
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  onboarding_step: 4,
                });
                setStep(5);
              } catch (err) {
                setError(errorMessage(err, lang));
              }
            }}
            onBack={() => setStep(3)}
            loading={updateProfile.isPending}
          />
        )}

        {/* Step 5 — Personal info for 履歴書 */}
        {step === 5 && (
          <Step5
            visaHeld={me?.profile?.visa_status === "held"}
            onNext={async (data) => {
              setError(null);
              try {
                await updateProfile.mutateAsync({
                  name_kana: data.name_kana,
                  date_of_birth: data.date_of_birth,
                  gender: data.gender as Gender,
                  phone_number: data.phone_number,
                  mailing_address: data.mailing_address,
                  residence_card_expiration: data.residence_card_expiration,
                  ...(data.visa_category ? { visa_category: data.visa_category } : {}),
                  onboarding_step: 5,
                });
                router.push("/dashboard/resumes");
              } catch (err) {
                setError(errorMessage(err, lang));
              }
            }}
            onBack={() => setStep(4)}
            loading={updateProfile.isPending}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Fix Step 4's submit button label and add the `Step5` component**

This is one combined edit. It targets the tail end of the `Step4` component — the same text is also, textually, the boundary right before the `// Shared UI` section, so doing this as two separate Find/Replace edits would have the second one fail to find its target (the first edit already consumes it). Do it as a single edit.

Since Step 4 is no longer the last step (Step 5 is), its button should say "Continue" like Step 2/3 already do, instead of "Complete setup" — that label now belongs to Step 5's button.

Find (this exact block appears exactly once in the file — it's the end of `Step4`'s JSX, immediately followed by the `// Shared UI` section header):
```typescript
      <div className="flex gap-3">
        <button type="button" onClick={onBack} className={secondaryBtnCls}>
          {t("common", "back", lang)}
        </button>
        <SubmitBtn loading={loading} label={t("onboarding", "completeBtn", lang)} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------

function Field({
```

Replace with:
```typescript
      <div className="flex gap-3">
        <button type="button" onClick={onBack} className={secondaryBtnCls}>
          {t("common", "back", lang)}
        </button>
        <SubmitBtn loading={loading} label={t("common", "continue", lang)} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Personal info for 履歴書
// ---------------------------------------------------------------------------

function Step5({
  visaHeld,
  onNext,
  onBack,
  loading,
}: {
  visaHeld: boolean;
  onNext: (data: Step5Data) => Promise<void>;
  onBack: () => void;
  loading: boolean;
}) {
  const { lang } = useLang();
  const step5Schema = visaHeld
    ? step5BaseSchema.extend({
        visa_category: z.string().min(1, "Visa category is required"),
      })
    : step5BaseSchema;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step5Data>({
    resolver: zodResolver(step5Schema),
    defaultValues: { gender: "male" },
  });

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <h1 className="text-2xl font-semibold">{t("onboarding", "s5Title", lang)}</h1>
      <p className="text-sm text-muted-foreground">{t("onboarding", "s5Sub", lang)}</p>

      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {t("onboarding", "s5GroupIdentity", lang)}
      </p>
      <Field label={t("onboarding", "s5NameKana", lang)} error={errors.name_kana?.message}>
        <input {...register("name_kana")} placeholder="ヤマダ タロウ" className={inputCls} />
      </Field>
      <Field
        label={t("onboarding", "s5DateOfBirth", lang)}
        error={errors.date_of_birth?.message}
      >
        <input {...register("date_of_birth")} type="date" className={inputCls} />
      </Field>
      <Field label={t("onboarding", "s5Gender", lang)} error={errors.gender?.message}>
        <select {...register("gender")} className={inputCls}>
          <option value="male">{t("onboarding", "s5GenderMale", lang)}</option>
          <option value="female">{t("onboarding", "s5GenderFemale", lang)}</option>
        </select>
      </Field>

      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {t("onboarding", "s5GroupContact", lang)}
      </p>
      <Field label={t("onboarding", "s5Phone", lang)} error={errors.phone_number?.message}>
        <input {...register("phone_number")} type="tel" className={inputCls} />
      </Field>
      <Field label={t("onboarding", "s5Address", lang)} error={errors.mailing_address?.message}>
        <input {...register("mailing_address")} className={inputCls} />
      </Field>

      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {t("onboarding", "s5GroupVisa", lang)}
      </p>
      <Field
        label={t("onboarding", "s5VisaExpiration", lang)}
        error={errors.residence_card_expiration?.message}
      >
        <input {...register("residence_card_expiration")} type="date" className={inputCls} />
      </Field>
      {visaHeld && (
        <Field
          label={t("onboarding", "s5VisaCategory", lang)}
          error={errors.visa_category?.message}
        >
          <input {...register("visa_category")} className={inputCls} />
        </Field>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className={secondaryBtnCls}>
          {t("common", "back", lang)}
        </button>
        <SubmitBtn loading={loading} label={t("onboarding", "completeBtn", lang)} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------

function Field({
```

- [ ] **Step 4: Verify**

```bash
cd frontend
rm -rf .next
npm run type-check
npm run lint
npm run format -- --check 2>/dev/null || npx prettier --check app/onboarding/page.tsx
```
Expected: type-check and lint pass clean. If prettier reports formatting issues, run `npx prettier --write app/onboarding/page.tsx` and re-check.

- [ ] **Step 5: Commit**

```bash
git add app/onboarding/page.tsx
git commit -m "Add Step5 to onboarding: collect rirekisho personal-info fields

Placed after the existing Japanese-level/visa step so it can read the
already-saved visa_status and conditionally require visa_category.
Step 4 no longer completes onboarding — it advances to Step 5, which
now owns the 'Complete setup' action and sets onboarding_step: 5."
```

---

## Self-Review Notes (from writing-plans process)

**Spec coverage:** Every field in the design spec's "Fields" table (name_kana, date_of_birth, gender, phone_number, mailing_address, residence_card_expiration, visa_category) has a DB column (Task 1/2/4), an API schema field (Task 5), a TS type (Task 8), and a form field (Task 10). The onboarding-position decision (placed last, after step 4, so `visa_status` is known) is implemented in Task 10 Step 2. The `gender` binary-enum decision is implemented in Task 3/4. Phase 2 (using this data in generation) is explicitly out of scope for this plan — it's a separate, later plan.

**Placeholder scan:** No TBD/TODO. Every step shows complete, exact code or exact commands with expected output.

**Overlap check (caught during this review, fixed inline):** Task 10 originally had two separate Find/Replace steps both targeting the boundary between `Step4`'s JSX and the `// Shared UI` section — the first edit (inserting `Step5`) would have already consumed the exact text the second edit (fixing `Step4`'s button label) needed to find. Merged into a single Task 10 Step 3 that does both in one edit.

**Type consistency:** `Gender` (Python enum: `male`/`female`) matches `Gender` (TS type: `"male" | "female"`) matches the Zod schema's `z.enum(["male", "female"])`. `ProfileUpdateRequest`'s new field names match `Profile`'s new column names match `Step5Data`'s form field names exactly throughout (no renaming drift between layers).
