# Admin Bootstrap Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual `psycopg2` snippet in the README with a proper, idempotent CLI script for bootstrapping the first admin account in an environment.

**Architecture:** One new script, `backend/scripts/promote_admin.py`, following the exact conventions of the only existing script in that directory (`seed_culture.py`): async, uses the app's own `AsyncSessionFactory` and repository layer rather than a raw connection string, so it picks up whichever `DATABASE_URL` is already configured — identical invocation works locally and via Render's Shell in production. Two README sections updated to point at it.

**Tech Stack:** Python 3.12, asyncio, SQLAlchemy async session (existing `AsyncSessionFactory`), `argparse` (stdlib), existing `UserRepository`.

---

### Task 1: Create the promote_admin script

**Files:**
- Create: `backend/scripts/promote_admin.py`

- [ ] **Step 1: Write the script**

```python
#!/usr/bin/env python3
"""
Promote a user to admin by email.

Bootstraps the first admin account in an environment. Every subsequent
role change can go through the admin panel's Users tab instead — this
script is only needed once per environment.

Run from the backend directory:
    python -m scripts.promote_admin --email you@example.com

Idempotent — re-running for an already-admin user is a safe no-op.
"""

from __future__ import annotations

import argparse
import asyncio
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from app.database import AsyncSessionFactory
from app.models.enums import UserRole
from app.repositories.user import UserRepository


async def promote(email: str) -> int:
    """Promote the user with the given email to admin. Returns a process exit code."""
    async with AsyncSessionFactory() as session:
        repo = UserRepository(session)
        user = await repo.get_by_email(email)

        if user is None:
            print(f"✗ No user found with email {email!r} — sign up first, then re-run this script.")
            return 1

        if user.role == UserRole.admin:
            print(f"✓ {email} is already an admin — nothing to do.")
            return 0

        await repo.update(user, role=UserRole.admin)
        await session.commit()
        print(f"✓ Promoted {email} to admin.")
        return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True, help="Email of the user to promote to admin")
    args = parser.parse_args()
    exit_code = asyncio.run(promote(args.email))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run ruff check**

Run (from `backend/`, with the venv active): `ruff check scripts/promote_admin.py`
Expected: `All checks passed!`

- [ ] **Step 3: Run ruff format check**

Run: `ruff format --check scripts/promote_admin.py`
Expected: `1 file already formatted` (if not, run `ruff format scripts/promote_admin.py` and re-check)

- [ ] **Step 4: Run mypy**

Run: `mypy scripts/promote_admin.py`
Expected: `Success: no issues found in 1 source file`

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/promote_admin.py
git commit -m "Add admin bootstrap script

Replaces the manual psycopg2 snippet for promoting the first admin
account in an environment. Idempotent, uses the app's existing
AsyncSessionFactory and UserRepository so it works identically in
local dev and via Render's Shell in production."
```

---

### Task 2: Manually verify the script against local Postgres

This script has no automated test coverage — matches the existing precedent (`seed_culture.py` has none either, and `scripts/` isn't part of the `pytest` coverage target). Verify manually instead.

**Prerequisite:** local Postgres running with the schema applied (`alembic upgrade head` already run), and the backend venv active.

- [ ] **Step 1: Run the script for an email with no matching user**

Run: `python -m scripts.promote_admin --email nobody-test@example.com`
Expected output: `✗ No user found with email 'nobody-test@example.com' — sign up first, then re-run this script.`
Expected exit code: `1` (check with `echo $?` immediately after)

- [ ] **Step 2: Insert a throwaway regular-role test user directly**

Run (`psql` against the local DB, or via `python -c` using `psycopg2` — either works since this is a one-off setup step, not part of the script itself):

```bash
psql postgresql://postgres:postgres@localhost:5432/ai_job_support -c "
INSERT INTO users (clerk_id, email) VALUES ('test_clerk_id_promote_admin', 'promote-test@example.com');
"
```

Expected: `INSERT 0 1`

- [ ] **Step 3: Run the script for that test user**

Run: `python -m scripts.promote_admin --email promote-test@example.com`
Expected output: `✓ Promoted promote-test@example.com to admin.`
Expected exit code: `0`

- [ ] **Step 4: Run the script again for the same (now-admin) user**

Run: `python -m scripts.promote_admin --email promote-test@example.com`
Expected output: `✓ promote-test@example.com is already an admin — nothing to do.`
Expected exit code: `0`

- [ ] **Step 5: Confirm the role actually changed in the database**

```bash
psql postgresql://postgres:postgres@localhost:5432/ai_job_support -c "
SELECT email, role FROM users WHERE email = 'promote-test@example.com';
"
```

Expected: one row, `role` = `admin`

- [ ] **Step 6: Clean up the throwaway test user**

```bash
psql postgresql://postgres:postgres@localhost:5432/ai_job_support -c "
DELETE FROM users WHERE email = 'promote-test@example.com';
"
```

Expected: `DELETE 1`

No commit for this task — verification only, no files changed.

---

### Task 3: Update README.md

**Files:**
- Modify: `README.md:150-170`

- [ ] **Step 1: Replace the "First-time admin setup" section**

Replace this block (lines 150–170):

```markdown
## First-time admin setup

After signing up, promote your account to admin directly in the database:

```bash
cd backend
source .venv/bin/activate
python -c "
import psycopg2
conn = psycopg2.connect('postgresql://postgres:postgres@localhost:5432/ai_job_support')
conn.autocommit = True
cur = conn.cursor()
cur.execute(\"UPDATE users SET role = 'admin' WHERE email = 'your@email.com'\")
print('Rows updated:', cur.rowcount)
conn.close()
"
```

Then access the admin panel at **http://localhost:3000/admin**.

> **Note:** Admin promotion requires a direct DB update by design — there is no API endpoint to prevent privilege escalation.
```

With:

```markdown
## First-time admin setup

After signing up, promote your account to admin:

```bash
cd backend
source .venv/bin/activate
python -m scripts.promote_admin --email your@email.com
```

Then access the admin panel at **http://localhost:3000/admin**. Every
subsequent role change (promoting or demoting other accounts) can be done
from the admin panel's Users tab — this script is only needed once per
environment.

**In production:** run the identical command via Render's Shell tab for the
`ai-job-support-api` service — it already runs with the production
`DATABASE_URL` loaded, so no credentials need to leave Render's dashboard.

> **Note:** Admin promotion requires direct DB/shell access by design —
> there is no API endpoint to prevent privilege escalation.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Point README admin setup at the new promote_admin script"
```

---

### Task 4: Update README.ja.md

**Files:**
- Modify: `README.ja.md:165-183`

- [ ] **Step 1: Replace the "初回管理者設定" section**

Replace this block (lines 165–183):

```markdown
## 初回管理者設定

サインアップ後、データベースを直接更新してアカウントを管理者に昇格させます:

```bash
cd backend
source .venv/bin/activate
python -c "
import psycopg2
conn = psycopg2.connect('postgresql://postgres:postgres@localhost:5432/ai_job_support')
conn.autocommit = True
cur = conn.cursor()
cur.execute(\"UPDATE users SET role = 'admin' WHERE email = 'your@email.com'\")
print('Rows updated:', cur.rowcount)
conn.close()
"
```

その後、管理パネルには **http://localhost:3000/admin** からアクセスできます。
```

With:

```markdown
## 初回管理者設定

サインアップ後、以下のコマンドでアカウントを管理者に昇格させます:

```bash
cd backend
source .venv/bin/activate
python -m scripts.promote_admin --email your@email.com
```

その後、管理パネルには **http://localhost:3000/admin** からアクセスできます。
それ以降のロール変更（他アカウントの昇格・降格）は管理パネルの Users タブから行えます
— このスクリプトが必要なのは環境ごとに最初の一度だけです。

**本番環境の場合:** `ai-job-support-api` サービスの Render Shell タブから同じ
コマンドを実行してください。本番用の `DATABASE_URL` が既に読み込まれているため、
認証情報を Render のダッシュボード外に持ち出す必要はありません。

> **注意:** 権限昇格を防ぐ設計上、管理者昇格には直接的な DB/シェルアクセスが必要です
> — API エンドポイントは提供していません。
```

- [ ] **Step 2: Commit**

```bash
git add README.ja.md
git commit -m "Point README.ja admin setup at the new promote_admin script"
```
