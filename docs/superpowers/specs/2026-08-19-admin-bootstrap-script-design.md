# Admin bootstrap script — design

**Date:** 2026-08-19
**Status:** Approved, pending implementation plan

## Problem

The only way to get admin access — in either local dev or production — is a
raw `psycopg2` one-liner copy-pasted from the README, re-typed by hand each
time, with no clear feedback if the email doesn't match an existing user
(the current snippet just prints a row count). The user wants a repeatable,
low-friction way to get admin access in both environments, for testing.

## What already exists (no change needed)

Once *one* admin account exists in an environment, everything else is
already self-service: `PATCH /admin/users/{id}/role`
(`backend/app/api/v1/admin.py`) is admin-gated and already wired to a
promote/demote control in the admin panel's Users tab
(`frontend/app/admin/page.tsx`). The actual gap is narrower than "admin
access is hard" — it's specifically "bootstrapping the *first* admin in an
environment is manual and undocumented-as-a-real-tool."

Deliberately **not** reopening this via a network-callable endpoint: the
README already documents "no API endpoint to prevent privilege escalation"
as an intentional decision. A bootstrap script (requiring direct DB/shell
access, not a request any authenticated user could send) preserves that.

## Design

New `backend/scripts/promote_admin.py`, matching the conventions of the
only existing script in that directory (`seed_culture.py`): shebang,
module docstring with usage, `asyncio.run()` entry point, uses
`AsyncSessionFactory` + the existing repository layer
(`UserRepository.get_by_email`) rather than a raw connection string —
so it automatically picks up whatever `DATABASE_URL` the environment
already has configured, no new secrets or connection strings to manage.

```
python -m scripts.promote_admin --email you@example.com
```

Behavior:
- No user found with that email → clear error, exit 1. (Improves on the
  current snippet's silent "Rows updated: 0".) The user must sign up first
  so their row exists via the normal Clerk webhook/JIT flow.
- User found, already `role = admin` → print "already admin", exit 0.
  Idempotent — safe to re-run.
- User found, `role = user` → update to `admin`, commit, print confirmation,
  exit 0.

No interactive confirmation prompt — matches `seed_culture.py`'s style, and
the explicit `--email` argument on the command line already is the
confirmation.

**Local:** run directly against the local Postgres instance.

**Production:** the identical command, run via Render's Shell tab for the
`ai-job-support-api` service — it already runs in the same working
directory and virtualenv as the deployed app, with production
`DATABASE_URL` already loaded, so no credentials ever leave Render's
dashboard. (Assumption to confirm at implementation/verification time: that
Render's Shell drops into the expected working directory for
`python -m scripts.promote_admin` to resolve — the `uvicorn app.main:app`
start command implies it does, but this hasn't been directly observed.)

## Documentation changes

`README.md` and `README.ja.md`'s "First-time admin setup" section replaces
the inline `psycopg2` snippet with the script command, plus one line
covering the production path via Render Shell.

## Testing

No automated test coverage — matches the existing precedent
(`seed_culture.py` has none either; `scripts/` isn't part of the `pytest`
suite's coverage target). Verified manually: run locally against local
Postgres, confirm the role flips and a second run reports "already admin"
without erroring.
