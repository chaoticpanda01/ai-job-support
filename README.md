# Japan Job Support Platform

An AI-powered career enablement platform for Indonesian professionals seeking employment in Japan.  
Bridges language, cultural, and bureaucratic gaps through AI-generated documents, real-time translation, interview simulation, and visa guidance.

**Fully free — no paywalls, no subscription tiers.**

**Live:** https://ai-job-support.vercel.app

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, TypeScript (strict), Tailwind CSS |
| Backend | FastAPI, Python 3.12 |
| AI Engine | Google Gemini API (gemini-2.5-flash) |
| Database | PostgreSQL 16 (Neon) |
| Cache | Redis 7 (Upstash) — rate limiting only |
| Background tasks | FastAPI BackgroundTasks |
| Auth | Clerk |
| File Storage | Backblaze B2 (S3-compatible API) |
| Email | Resend |

---

## Project Structure

```
ai-job-support/
├── frontend/          # Next.js 15 application
├── backend/           # FastAPI application
├── database/          # schema.sql — single source of truth for DB schema
├── docs/              # Technical specification
└── .github/workflows/ # CI pipeline
```

---

## Prerequisites

- Node.js >= 20
- Python >= 3.12
- PostgreSQL 16 (local install or Docker)
- Redis 7 (optional — used for rate limiting only; all features work without it)

---

## Local Development Setup

### 1. Clone and configure environment variables

```bash
git clone <repo-url>
cd ai-job-support
```

Create `backend/.env`:
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/ai_job_support
DATABASE_SYNC_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/ai_job_support
REDIS_URL=redis://localhost:6379/0

# Clerk — get from clerk.com dashboard
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
# Derive from your publishable key: https://<your-instance>.clerk.accounts.dev/.well-known/jwks.json
CLERK_JWKS_URL=https://<your-clerk-instance>.clerk.accounts.dev/.well-known/jwks.json

# Google Gemini — get free key from aistudio.google.com
GEMINI_API_KEY=AIza...
GEMINI_DEFAULT_MODEL=gemini-2.5-flash

# Backblaze B2 (S3-compatible) — create bucket at backblaze.com
AWS_ACCESS_KEY_ID=<b2-key-id>
AWS_SECRET_ACCESS_KEY=<b2-app-key>
AWS_REGION=<b2-region>           # e.g. ca-east-006
S3_BUCKET_NAME=<bucket-name>
CLOUDFLARE_R2_ENDPOINT_URL=https://s3.<region>.backblazeb2.com   # REQUIRED — points boto3 to B2

# Optional — leave empty for local dev
RESEND_API_KEY=
SECRET_KEY=local-dev-secret
APP_ENV=development
DEBUG=true
ALLOWED_ORIGINS=http://localhost:3000
```

> **IMPORTANT:** Every `boto3.client("s3", ...)` call in the backend uses `CLOUDFLARE_R2_ENDPOINT_URL` to point to Backblaze B2. Without it, boto3 connects to AWS S3 (wrong endpoint) and all file operations fail.

> **Clerk session token:** In Clerk Dashboard → Configure → Sessions → Customize session token, add `{"email": "{{user.primary_email_address}}"}`. This is required because the database has an email format constraint on the users table.

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard/resumes
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding
```

### 2. Set up PostgreSQL

```bash
# macOS with Homebrew
brew install postgresql@16
brew services start postgresql@16

psql -c "CREATE ROLE postgres WITH LOGIN SUPERUSER PASSWORD 'postgres';"
psql -c "CREATE DATABASE ai_job_support OWNER postgres;"
```

### 3. Run database migrations

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt

alembic upgrade head
```

### 4. Start the backend

```bash
# From /backend with venv active
uvicorn app.main:app --reload --port 8000
```

### 5. Start the frontend

```bash
# From /frontend
npm install
npm run dev
```

Frontend: **http://localhost:3000**  
Backend API: **http://localhost:8000**  
Swagger docs: **http://localhost:8000/docs**

> **No Celery workers needed.** Resume analysis and document generation run as FastAPI BackgroundTasks — no separate worker process required.

---

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

---

## Running with Docker Compose

```bash
# Core services (postgres + redis)
docker compose up postgres redis -d

# Full stack
docker compose up
```

---

## Database

Schema source of truth: [`database/schema.sql`](database/schema.sql) — never write DDL anywhere else.

```bash
alembic upgrade head                              # apply all migrations
alembic revision --autogenerate -m "description"  # new migration from model changes
alembic check                                     # detect model/schema drift
alembic downgrade -1                              # rollback last migration
```

---

## Running Tests

```bash
cd backend

pytest                        # all tests with coverage
pytest tests/unit/ -v         # unit tests only
pytest -k "test_resume" -v    # filter by name
```

---

## Code Quality

```bash
# Backend
cd backend
ruff check .
ruff format .
mypy app/

# Frontend
cd frontend
npm run type-check
npm run lint
npm run format
```

---

## Features

| Feature | Description |
|---------|-------------|
| Landing Page | Marketing page at `/` with language switcher (EN / ID / JP) |
| Resume Analysis | AI-powered gap analysis for the Japanese market |
| 履歴書 Generation | JIS-standard Japanese resume (async, downloadable PDF) |
| 職務経歴書 Generation | Achievement-oriented career narrative document (async PDF) |
| Job Translation | Japanese job postings translated to Indonesian with match scoring |
| Application Tracker | Kanban pipeline: planning → applied → interviewing → offered/rejected |
| Interview Practice | Real-time mock interviews with SSE streaming + per-answer evaluation |
| Visa Guidance | Personalised visa checklist and roadmap |
| Culture Content | Browseable articles and glossary for Indonesian professionals |
| AI Chatbot | Floating widget (sign-in required) — Japan career Q&A in EN/ID/JP |
| Language Switcher | EN / ID / JP — wired across all pages including onboarding and dashboard |
| Admin Panel | `/admin` — manage users, culture topics, glossary (role=admin required) |
| Account Deletion | Full GDPR/PDPA-compliant account deletion from Settings |

---

## Architecture

Full documentation: [`docs/japan-job-platform-techspec.md`](docs/japan-job-platform-techspec.md)

Key decisions:
- **Next.js proxy** — all `/api/*` requests go through `app/api/[...path]/route.ts`, which injects the Clerk JWT; browsers never call FastAPI directly
- **JIT user creation** — if the Clerk webhook hasn't fired (local dev), the middleware creates the user row on first valid JWT
- **SSE** for interview streaming — plain HTTP, works on Vercel without WebSocket support
- **FastAPI BackgroundTasks** — resume analysis and document generation run in-process; no Celery or external queue needed
- **Soft-delete** on `job_postings` via `deleted_at`
- **Ownership in query** — `WHERE user_id = current_user.id` inside every DB query, never checked after fetch
- **Billing deferred** — payment code exists in `backend/app/api/v1/billing.py` and `frontend/app/dashboard/billing/` but is intentionally disabled; all features are free
- **i18n** — `useLang()` hook + `t(section, key, lang)` wired to every page; translations live in `frontend/lib/i18n.ts`

---

## Environment Variables

| Variable | Where | Required | Description |
|----------|-------|----------|-------------|
| `DATABASE_URL` | backend | Yes | PostgreSQL async URL (`postgresql+asyncpg://...`) |
| `DATABASE_SYNC_URL` | backend | Yes | PostgreSQL sync URL for Alembic (`postgresql+psycopg2://...`) |
| `GEMINI_API_KEY` | backend | Yes | Google Gemini API key |
| `GEMINI_DEFAULT_MODEL` | backend | Yes | Model name, e.g. `gemini-2.5-flash` |
| `CLERK_SECRET_KEY` | both | Yes | Clerk secret key |
| `CLERK_JWKS_URL` | backend | Yes | Instance-specific JWKS URL for JWT validation |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | frontend | Yes | Clerk publishable key |
| `NEXT_PUBLIC_API_URL` | frontend | Yes | Backend URL (`http://localhost:8000` locally) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | backend | Yes | Backblaze B2 credentials (S3-compatible) |
| `S3_BUCKET_NAME` | backend | Yes | B2 bucket for resumes and generated PDFs |
| `CLOUDFLARE_R2_ENDPOINT_URL` | backend | Yes | B2 S3-compatible endpoint, e.g. `https://s3.ca-east-006.backblazeb2.com` |
| `REDIS_URL` | backend | No | Used for rate limiting; app works without it |
| `RESEND_API_KEY` | backend | No | Transactional emails |
| `STRIPE_SECRET_KEY` | backend | No | Billing (disabled — backup only) |

Never commit `.env` or `.env.local` files.

---

## CI/CD

| Job | Checks |
|-----|--------|
| Frontend CI | Type check, lint, format, build |
| Backend CI | Ruff lint + format, mypy, alembic check, pytest |

See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

**Deployment:**
- Backend → Render (auto-deploys on `git push main`)
- Frontend → Vercel (auto-deploys on `git push main` — connected to GitHub)

---

## Known Issues

- Render free tier spins down after 15 min idle → ~50s cold start on first request. Mitigate with a cron ping to `/health` every 10 min.
- GitHub Actions CI is currently failing (missing env secrets in CI config) — non-blocking, Render deploys from git push regardless.

Current status: **Fully deployed and live. All AI features confirmed working.**
