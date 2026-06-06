# Japan Job Support Platform

An AI-powered career enablement platform for Indonesian professionals seeking employment in Japan.  
Bridges language, cultural, and bureaucratic gaps through AI-generated documents, real-time translation, interview simulation, and visa guidance.

**Fully free — no paywalls, no subscription tiers.**

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, TypeScript (strict), Tailwind CSS |
| Backend | FastAPI, Python 3.12 |
| AI Engine | Google Gemini API (gemini-2.0-flash-lite) |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 + Celery |
| Auth | Clerk |
| File Storage | AWS S3 / Cloudflare R2 |
| Email | Resend |
| Observability | Sentry |

---

## Project Structure

```
ai-job-support/
├── frontend/          # Next.js 15 application
├── backend/           # FastAPI application + Celery workers
├── database/          # schema.sql — single source of truth for DB schema
├── docs/              # Technical specification
└── .github/workflows/ # CI pipeline
```

---

## Prerequisites

- Node.js >= 20
- Python >= 3.12
- PostgreSQL 16 (local install or Docker)
- Redis 7 (required for Celery workers; core pages work without it)

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
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2

# Clerk — get from clerk.com dashboard
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
# Derive from your publishable key: https://<your-instance>.clerk.accounts.dev/.well-known/jwks.json
CLERK_JWKS_URL=https://<your-clerk-instance>.clerk.accounts.dev/.well-known/jwks.json

# Google Gemini — get free key from aistudio.google.com
GEMINI_API_KEY=AIza...
GEMINI_DEFAULT_MODEL=gemini-2.0-flash-lite

# AWS S3 / Cloudflare R2
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-northeast-1
S3_BUCKET_NAME=

# Optional — leave empty for local dev
RESEND_API_KEY=
SENTRY_DSN=
SECRET_KEY=local-dev-secret
APP_ENV=development
DEBUG=true
ALLOWED_ORIGINS=http://localhost:3000
```

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

> **Finding your CLERK_JWKS_URL:** In your Clerk dashboard, go to API Keys. Your JWKS URL is `https://<your-instance>.clerk.accounts.dev/.well-known/jwks.json`. The instance name is visible in your publishable key after `pk_test_`.

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

### 6. Start Celery workers (required for document generation)

```bash
# From /backend with venv active
celery -A app.workers.celery_app worker --loglevel=info --queues=documents,analysis --concurrency=2
```

> The app works without Celery for all features except async document generation (履歴書 / 職務経歴書). Resume analysis and all other features work without workers.

---

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

---

## Running with Docker Compose

```bash
# Core services (postgres + redis)
docker compose up postgres redis -d

# Full stack
docker compose up

# Include Flower task monitoring (http://localhost:5555)
docker compose --profile monitoring up
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
| Landing Page | Marketing page at `/` with i18n (EN / ID / JP) |
| Resume Analysis | AI-powered gap analysis for the Japanese market |
| 履歴書 Generation | JIS-standard Japanese resume (async, downloadable PDF) |
| 職務経歴書 Generation | Achievement-oriented career narrative document (async PDF) |
| Job Translation | Japanese job postings translated to Indonesian with match scoring |
| Application Tracker | Kanban pipeline: planning → applied → interviewing → offered/rejected |
| Interview Practice | Real-time mock interviews with SSE streaming + per-answer evaluation |
| Visa Guidance | Personalised visa checklist and roadmap |
| Culture Content | Browseable articles and glossary for Indonesian professionals |
| AI Chatbot | Floating widget (no login required) — Japan career Q&A in EN/ID/JP |
| Language Switcher | EN / ID / JP toggle on every page |
| Admin Panel | `/admin` — manage users, culture topics, glossary (role=admin required) |
| Account Deletion | Full GDPR/PDPA-compliant account deletion from Settings |

---

## Architecture

Full documentation: [`docs/japan-job-platform-techspec.md`](docs/japan-job-platform-techspec.md)

Key decisions:
- **Next.js proxy** — all `/api/*` requests go through `app/api/[...path]/route.ts`, which injects the Clerk JWT; browsers never call FastAPI directly
- **JIT user creation** — if the Clerk webhook hasn't fired (local dev), the middleware creates the user row on first valid JWT
- **SSE** for interview streaming — plain HTTP, works on Vercel + Railway without WebSocket support
- **Soft-delete** on `job_postings` via `deleted_at`
- **Ownership in query** — `WHERE user_id = current_user.id` inside every DB query, never checked after fetch
- **Billing deferred** — payment code exists in `backend/app/api/v1/billing.py` and `frontend/app/dashboard/billing/` but is intentionally disabled; all features are free

---

## Environment Variables

| Variable | Where | Required | Description |
|----------|-------|----------|-------------|
| `DATABASE_URL` | backend | Yes | PostgreSQL async URL (`postgresql+asyncpg://...`) |
| `DATABASE_SYNC_URL` | backend | Yes | PostgreSQL sync URL for Alembic (`postgresql+psycopg2://...`) |
| `GEMINI_API_KEY` | backend | Yes | Google Gemini API key |
| `CLERK_SECRET_KEY` | both | Yes | Clerk secret key |
| `CLERK_PUBLISHABLE_KEY` | backend | Yes | Clerk publishable key |
| `CLERK_JWKS_URL` | backend | Yes | Instance-specific JWKS URL for JWT validation |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | frontend | Yes | Clerk publishable key |
| `NEXT_PUBLIC_API_URL` | frontend | Yes | Backend URL (`http://localhost:8000` locally) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | backend | Yes* | S3 file storage (*required for resume upload/download) |
| `S3_BUCKET_NAME` | backend | Yes* | S3 bucket for resumes and generated PDFs |
| `REDIS_URL` | backend | No | Required only for Celery workers |
| `RESEND_API_KEY` | backend | No | Transactional emails |
| `SENTRY_DSN` | backend | No | Error monitoring |
| `STRIPE_SECRET_KEY` | backend | No | Billing (disabled — backup only) |

Never commit `.env` or `.env.local` files.

---

## CI/CD

GitHub Actions runs on every push to `main` and `develop`:

| Job | Checks |
|-----|--------|
| Frontend CI | Type check, lint, format, build |
| Backend CI | Ruff lint + format, mypy, alembic check, pytest |
| Docker Build | Build both images; verify Japanese fonts in backend image |

See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## Known Issues / Pre-production Checklist

- [ ] Re-enable Clerk auth middleware in `frontend/middleware.ts` (currently disabled for local dev)
- [ ] `alembic.ini` has a hardcoded local DB URL — restore `%(DATABASE_SYNC_URL)s` before production
- [ ] WeasyPrint + Noto CJK fonts must be installed for PDF generation
- [ ] No culture/glossary seed data — add via admin panel after first run
- [ ] No integration tests — only unit tests exist
- [ ] Rate limiter is wired but Redis must be reachable

Current status: **All features implemented and working locally.**
