# Project Handoff Document

**Project:** Japan Job Support Platform  
**Last Updated:** June 2026  
**Repo Root:** `/Users/rivky/Projects/ai-job-support/`  
**Status:** All features implemented. Running locally. Not yet deployed.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Goals and Requirements](#2-goals-and-requirements)
3. [Tech Stack](#3-tech-stack)
4. [Current Architecture](#4-current-architecture)
5. [Database Schema](#5-database-schema)
6. [File Structure](#6-file-structure)
7. [Completed Features](#7-completed-features)
8. [Features In Progress / Pending](#8-features-in-progress--pending)
9. [Known Bugs and Issues](#9-known-bugs-and-issues)
10. [Important Design Decisions](#10-important-design-decisions)
11. [Environment Setup](#11-environment-setup)
12. [Commands Reference](#12-commands-reference)
13. [Next Recommended Steps](#13-next-recommended-steps)
14. [Billing — Deferred Design](#14-billing--deferred-design)

---

## 1. Project Overview

An AI-powered career enablement platform for **Indonesian professionals seeking employment in Japan**. Bridges language, cultural, and bureaucratic gaps through:

- AI-generated Japanese resumes (履歴書, 職務経歴書) from uploaded source resumes
- Japanese job posting translation into Indonesian with match scoring
- Real-time mock interview practice with per-answer AI evaluation (streamed via SSE)
- Personalised visa guidance as an interactive checklist
- Workplace culture content library
- AI chatbot for Japan career Q&A (multilingual: EN/ID/JP, no login required)

**Target users:** Indonesian nationals with some Japanese language ability (N3–N5) who want to enter the Japanese job market without recruitment agency support.

**Business model:** Currently fully free. Billing infrastructure exists as a backup — see Section 14.

---

## 2. Goals and Requirements

### Functional Requirements

| Feature | Status |
|---------|--------|
| User auth + onboarding (4-step, consent-first) | ✅ Done |
| Resume upload (PDF/DOCX) + AI parsing | ✅ Done |
| Resume analysis (gaps, Japan market score) | ✅ Done |
| 履歴書 generation (async, downloadable PDF) | ✅ Done |
| 職務経歴書 generation (async, downloadable PDF) | ✅ Done |
| Job translation (URL paste + raw text) | ✅ Done |
| Job-resume match scoring | ✅ Done |
| Application status tracking (Kanban) | ✅ Done |
| Interview practice (SSE streaming) | ✅ Done |
| Visa guidance checklist | ✅ Done |
| Culture topics + glossary | ✅ Done |
| AI chatbot (no auth) | ✅ Done |
| Language switcher (EN/ID/JP) | ✅ Done |
| Admin panel (users, culture CMS) | ✅ Done |
| Account deletion (GDPR/PDPA) | ✅ Done |
| Stripe billing + usage enforcement | ⏸️ Built, disabled |

### Non-Functional Requirements

- **TypeScript strict mode** throughout frontend
- **Ownership enforced at query level** — `WHERE user_id = current_user.id` inside query, never check after fetch
- **No job scraping** — URL paste + raw text paste only (ToS compliance)
- **SSE not WebSocket** for interview streaming
- **Soft-delete on job_postings** — `deleted_at` column, never hard-delete
- **S3 private bucket only** — presigned URLs (15 min TTL) for all downloads
- **cover_letter deferred** — not in `document_type` ENUM

---

## 3. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js | 15.5.x |
| Language | TypeScript | 5.7+ strict |
| Styling | Tailwind CSS | 3.4+ |
| Components | Shadcn/ui + Radix UI | latest |
| Data fetching | TanStack React Query | 5.x |
| Forms | React Hook Form + Zod | latest |
| SSE client | @microsoft/fetch-event-source | 2.x |
| Backend | FastAPI | 0.115.x |
| Language | Python | 3.12 |
| ORM | SQLAlchemy (async) | 2.0.x |
| Migrations | Alembic | 1.14.x |
| DB driver | asyncpg (runtime) / psycopg2 (Alembic) | latest |
| Task queue | Celery + Redis | 5.4.x |
| Database | PostgreSQL | 16 |
| Cache | Redis | 7 |
| Auth | Clerk | latest |
| AI | Google Gemini API | gemini-2.0-flash-lite |
| Storage | AWS S3 / Cloudflare R2 | — |
| Email | Resend | 2.x |
| PDF generation | WeasyPrint + Noto Sans JP | 63.x |
| Observability | Sentry | 2.x |

---

## 4. Current Architecture

### System Diagram

```
Browser
  │
  ▼
Next.js 15 (localhost:3000 / Vercel)
  │  app/api/[...path]/route.ts  ← injects Clerk JWT into every request
  │  browsers never call FastAPI directly
  ▼
FastAPI (localhost:8000 / Render)
  TrustedHost → CORS → RateLimiter → ClerkJWT → Route handler
  Router → Dependencies → Service → Repository → DB
  │                          │
  ▼                          ▼
PostgreSQL 16             Redis 7
                          Celery workers (analysis + documents queues)
                          Gemini API
```

### Request Flow

```
Browser request → Next.js proxy (injects JWT) → FastAPI
→ ClerkJWTMiddleware (validates JWT, resolves/creates user row)
→ Route handler → Depends(get_current_user) + Depends(get_db)
→ Service → Repository (SQLAlchemy async, ownership in WHERE clause)
→ Pydantic response → JSON → proxy → browser
```

### Key Architectural Rules

1. **Ownership in query** — every user-owned resource includes `WHERE id = $1 AND user_id = $2`. Returns `None` → caller raises 404. Never 403.
2. **Repository layer is sole DB access point** — routes call services, services call repositories.
3. **AI client is sole Gemini access point** — never import `google.genai` outside `services/ai/client.py`.
4. **Session lifecycle in `get_db()`** — commit on success, rollback on exception. Repositories `flush()`, never `commit()`.
5. **SSE for interview** — `FastAPI StreamingResponse` with `media_type='text/event-stream'`.
6. **DocumentGenerator does NOT update document status** — Celery tasks own status transitions.
7. **JIT user creation** — `ClerkJWTMiddleware._resolve_user` calls `upsert_from_clerk` if user row missing. Works without Clerk webhook configured (local dev).
8. **Next.js proxy is the sole API gateway** — `next.config.ts` must NOT have `/api/*` rewrites; they bypass JWT injection.
9. **Billing disabled** — `check_budget()` is a no-op; billing router excluded from `router.py`.

---

## 5. Database Schema

> **Source of truth:** `database/schema.sql`

### Tables (19 total)

| Table | Purpose | Notes |
|-------|---------|-------|
| `users` | Auth identity + subscription tier + role | `clerk_id` links to Clerk; `role` = user\|admin |
| `profiles` | Job-seeking preferences | `onboarding_step` 0–4; `consent_given_at` required before AI features |
| `resumes` | Uploaded files (PDF/DOCX) | `is_primary` partial unique index per user |
| `resume_analyses` | AI analysis results | `job_posting_id` FK is `SET NULL` on delete |
| `generated_documents` | Async 履歴書 / 職務経歴書 | status: pending→processing→completed\|failed |
| `job_postings` | Translated Japanese job postings | **Soft-delete via `deleted_at`** |
| `job_matches` | AI match scores | Unique `(user_id, resume_id, job_posting_id)` |
| `saved_jobs` | Job bookmarks | — |
| `job_applications` | Application pipeline | status: planning→applied→interviewing→offered\|rejected |
| `interview_sessions` | Practice session metadata | status: active→completed\|abandoned |
| `interview_messages` | Per-turn conversation | `ai_evaluation` JSONB on user turns |
| `visa_consultations` | Personalised visa roadmap | `profile_snapshot` JSONB |
| `culture_topics` | Culture articles | `published_at` NULL = draft |
| `culture_glossary` | Japanese workplace terms | Indonesian definitions |
| `subscriptions` | Stripe subscription state | Dormant — billing disabled |
| `billing_events` | Append-only Stripe event log | Dormant |
| `notification_log` | Outbound email/push log | — |
| `subscription_limits` | Per-tier limits seed table | Seeded in migration 0004 |
| `ai_usage_logs` | AI call log | **Partitioned by month** through 2027-12 |

### Migrations (4 total)

| File | Description |
|------|-------------|
| `0001_baseline.py` | Executes `schema.sql` statement-by-statement |
| `0002_add_user_role.py` | Creates `user_role` ENUM; adds `role` column to `users` |
| `0003_add_consent_given_at.py` | Adds `consent_given_at` to `profiles` |
| `0004_seed_subscription_limits.py` | Seeds `subscription_limits` reference rows |

> ⚠️ **Known migration issue:** `0002` has been recorded as applied on some instances without actually executing. If `role` column is missing from `users`, run manually:
> ```sql
> CREATE TYPE user_role AS ENUM ('user', 'admin');
> ALTER TABLE users ADD COLUMN role user_role NOT NULL DEFAULT 'user';
> ```

### PostgreSQL ENUMs (18 total)

`subscription_tier`, `user_role`, `japanese_level`, `preferred_language`, `visa_status`, `document_type`, `document_status`, `job_source_platform`, `interview_type`, `interview_status`, `message_role`, `analysis_type`, `original_language`, `notification_channel`, `notification_status`, `subscription_status`, `billing_event_type`, `application_status`

---

## 6. File Structure

```
ai-job-support/
├── HANDOFF.md
├── README.md
├── docker-compose.yml
├── .github/workflows/ci.yml
├── database/schema.sql                            ← SOURCE OF TRUTH for all DDL
├── docs/japan-job-platform-techspec.md
│
├── frontend/                                      # Next.js 15
│   ├── middleware.ts                              ✅ Clerk auth — protects /dashboard/*, /onboarding
│   ├── next.config.ts                             ✅ No rewrites — proxy via app/api/[...path]
│   ├── tailwind.config.ts
│   ├── tsconfig.json                              # strict + noUncheckedIndexedAccess
│   ├── package.json
│   ├── .env.local                                 # local env (never commit)
│   ├── .env.example
│   │
│   ├── types/api.ts                               ✅ All shared TypeScript types
│   │
│   ├── lib/
│   │   ├── api-client.ts                          ✅ Typed fetch wrapper (relative /api/v1 paths)
│   │   ├── providers.tsx                          ✅ TanStack QueryClientProvider
│   │   ├── i18n.ts                                ✅ EN/ID/JP translation strings
│   │   └── language-context.tsx                   ✅ Language context + useLang hook
│   │
│   ├── hooks/
│   │   ├── useMe.ts                               ✅ useMe, useUpdateProfile, useRecordConsent
│   │   ├── useResumes.ts                          ✅ Resume CRUD + analysis
│   │   ├── useDocuments.ts                        ✅ Document generation + polling
│   │   ├── useJobs.ts                             ✅ Job translation + match scoring
│   │   ├── useApplications.ts                     ✅ Kanban application tracker
│   │   ├── useInterview.ts                        ✅ Interview sessions
│   │   ├── useVisa.ts                             ✅ Visa consultations
│   │   ├── useCulture.ts                          ✅ Culture topics + glossary
│   │   └── useBilling.ts                          ⏸️  Dormant; useDeleteAccount still active
│   │
│   ├── components/
│   │   ├── resume/ResumeUploader.tsx              ✅ Drag-and-drop, MIME, 10MB
│   │   ├── language-switcher.tsx                  ✅ EN/ID/JP toggle
│   │   ├── chat-widget.tsx                        ✅ Floating chatbot (root layout)
│   │   └── [billing|culture|documents|interview|jobs|layout|shared|ui|visa]/
│   │
│   └── app/
│       ├── layout.tsx                             ✅ ClerkProvider + QueryProvider + chat widget
│       ├── globals.css                            ✅ Tailwind + Shadcn/ui CSS vars
│       ├── page.tsx                               ✅ Landing page with i18n
│       ├── (auth)/
│       │   ├── sign-in/[[...sign-in]]/page.tsx    ✅ Clerk catch-all (required by Clerk)
│       │   └── sign-up/[[...sign-up]]/page.tsx    ✅ Clerk catch-all
│       ├── onboarding/page.tsx                    ✅ 4-step wizard (consent → profile)
│       ├── admin/page.tsx                         ✅ Admin panel
│       ├── dashboard/
│       │   ├── layout.tsx                         ✅ Sticky header + i18n nav + language switcher
│       │   ├── resumes/page.tsx                   ✅
│       │   ├── resumes/[id]/page.tsx              ✅ Detail + AI analysis card
│       │   ├── documents/page.tsx                 ✅
│       │   ├── documents/[id]/page.tsx            ✅ Status poller + download
│       │   ├── documents/rirekisho/new/page.tsx   ✅
│       │   ├── documents/shokumu/new/page.tsx     ✅
│       │   ├── jobs/page.tsx                      ✅
│       │   ├── jobs/translate/page.tsx            ✅
│       │   ├── jobs/[id]/page.tsx                 ✅ Detail + match scoring
│       │   ├── jobs/applications/page.tsx         ✅ Kanban board
│       │   ├── interview/page.tsx                 ✅ Session history
│       │   ├── interview/new/page.tsx             ✅ Setup
│       │   ├── interview/[id]/page.tsx            ✅ Live SSE streaming
│       │   ├── visa/page.tsx                      ✅
│       │   ├── visa/[id]/page.tsx                 ✅
│       │   ├── culture/page.tsx                   ✅
│       │   ├── culture/[slug]/page.tsx            ✅
│       │   ├── billing/page.tsx                   ⏸️  Built, not linked in nav
│       │   └── settings/page.tsx                  ✅ Account deletion
│       └── api/[...path]/route.ts                 ✅ Proxy — injects Clerk JWT, no rewrites in config
│
└── backend/                                       # FastAPI
    ├── .env                                       # local env (never commit)
    ├── .env.example
    ├── alembic.ini                                ✅ Uses %(DATABASE_SYNC_URL)s
    ├── pyproject.toml                             # ruff + mypy strict + pytest 70% floor
    │
    ├── app/
    │   ├── main.py                                ✅ FastAPI, middleware stack, Sentry
    │   ├── config.py                              ✅ Pydantic BaseSettings (all env vars)
    │   ├── database.py                            ✅ Async engine + AsyncSessionFactory
    │   ├── dependencies.py                        ✅ DbSession, AuthUser, AdminUser, PaginationDep
    │   │
    │   ├── middleware/
    │   │   ├── clerk_auth.py                      ✅ JWKS-cached JWT validation + JIT user creation
    │   │   └── rate_limiter.py                    ✅ Redis-backed rate limiter
    │   │
    │   ├── models/                                ✅ 19 tables (SQLAlchemy 2.0 Mapped[T])
    │   │   ├── base.py, enums.py
    │   │   ├── user.py, resume.py, document.py
    │   │   ├── job.py, interview.py, visa.py
    │   │   ├── culture.py, billing.py, ai_usage.py
    │   │
    │   ├── repositories/                          ✅ 17 repositories (ownership-in-query)
    │   │   ├── base.py, user.py, resume.py
    │   │   ├── document.py, job.py, interview.py
    │   │   ├── visa.py, billing.py, ai_usage.py
    │   │
    │   ├── schemas/                               ✅ Pydantic request/response schemas
    │   │   ├── user.py, resume.py, document.py
    │   │   ├── job.py, interview.py, visa.py
    │   │   ├── culture.py, billing.py
    │   │
    │   ├── api/v1/
    │   │   ├── router.py                          ✅ All active routers registered
    │   │   ├── auth.py                            ✅ Webhook, /me, /consent
    │   │   ├── resumes.py                         ✅ Upload, list, get, delete, analyze
    │   │   ├── documents.py                       ✅ Create, list, poll, download
    │   │   ├── jobs.py                            ✅ Translate, list, match, applications CRUD
    │   │   ├── interview.py                       ✅ Sessions + SSE streaming
    │   │   ├── visa.py                            ✅ Consultations CRUD
    │   │   ├── culture.py                         ✅ Topics + glossary (public read)
    │   │   ├── chat.py                            ✅ Stateless chatbot (no auth)
    │   │   ├── account.py                         ✅ DELETE /account
    │   │   ├── admin.py                           ✅ Stats, users, culture CMS
    │   │   └── billing.py                         ⏸️  Stripe endpoints — NOT in router
    │   │
    │   ├── services/
    │   │   ├── ai/
    │   │   │   ├── client.py                      ✅ Gemini, 3x retry, wraps user content in <user_content>
    │   │   │   ├── response_parser.py             ✅ JSON extraction + Pydantic validation
    │   │   │   ├── usage_tracker.py               ✅ check_budget() = no-op; record() logs usage
    │   │   │   └── prompts/
    │   │   │       ├── resume_analysis.py         ✅ max_tokens=1500
    │   │   │       ├── rirekisho.py               ✅ max_tokens=2500
    │   │   │       ├── shokumu.py                 ✅ max_tokens=3000
    │   │   │       ├── job_translation.py         ✅ max_tokens=2000
    │   │   │       ├── job_match.py               ✅ max_tokens=800
    │   │   │       ├── interview.py               ✅ max_tokens=800
    │   │   │       └── visa.py                    ✅ max_tokens=1500
    │   │   ├── document_generator.py              ✅ Full PDF pipeline
    │   │   ├── file_storage.py                    ✅ S3/R2 — set CLOUDFLARE_R2_ENDPOINT_URL for R2
    │   │   ├── resume_parser.py                   ✅ PDF + DOCX, 20k char limit
    │   │   ├── email_service.py                   ✅ Resend mailer
    │   │   └── stripe_client.py                   ⏸️  Dormant
    │   │
    │   ├── workers/
    │   │   ├── celery_app.py                      ✅ analysis + documents queues
    │   │   ├── analysis_tasks.py                  ✅ analyze_resume_task
    │   │   └── document_tasks.py                  ✅ generate_rirekisho_task, generate_shokumu_task
    │   │
    │   └── utils/
    │       ├── pdf_generator.py                   ✅ WeasyPrint + Noto Sans JP
    │       └── japanese_date.py                   ✅ Japanese era conversion
    │
    ├── migrations/versions/
    │   ├── 0001_baseline.py
    │   ├── 0002_add_user_role.py
    │   ├── 0003_add_consent_given_at.py
    │   └── 0004_seed_subscription_limits.py
    │
    ├── scripts/
    │   └── seed_culture.py                        ✅ Seeds culture_topics + culture_glossary
    │
    └── tests/
        ├── conftest.py
        └── unit/                                  ✅ 13 test files
```

---

## 7. Completed Features

### All backend routes active in `router.py`

| Router | Endpoints |
|--------|-----------|
| `auth` | POST /auth/webhook, GET /auth/me, PUT /auth/me, POST /auth/consent, GET /auth/users (admin), GET /auth/users/{id} (admin) |
| `resumes` | POST /resumes, GET /resumes, GET /resumes/{id}, DELETE /resumes/{id}, PUT /resumes/{id}/primary, POST /resumes/{id}/analyze, GET /resumes/{id}/analysis |
| `documents` | POST /documents/rirekisho, POST /documents/shokumu, GET /documents, GET /documents/{id}, GET /documents/{id}/download |
| `jobs` | POST /jobs/translate, GET /jobs, GET /jobs/{id}, DELETE /jobs/{id}, POST /jobs/{id}/match, POST /jobs/applications, GET /jobs/applications, PATCH /jobs/applications/{id}, DELETE /jobs/applications/{id} |
| `interview` | POST /interview/sessions, POST /interview/sessions/{id}/message, GET /interview/sessions/{id}, PUT /interview/sessions/{id}/end, GET /interview/sessions |
| `visa` | POST /visa/consultations, GET /visa/consultations, GET /visa/consultations/latest, GET /visa/consultations/{id} |
| `culture` | GET /culture/topics, GET /culture/topics/{slug}, GET /culture/glossary |
| `chat` | POST /chat/message |
| `account` | DELETE /account |
| `admin` | GET /admin/stats, GET /admin/users, PATCH /admin/users/{id}/role, full culture/glossary CRUD |

### All frontend dashboard pages built

resumes, documents (list + new + detail), jobs (list + translate + detail + applications), interview (list + new + live), visa (list + detail), culture (list + detail), settings

### Infrastructure
- Clerk JWT middleware with JIT user creation
- Redis-backed rate limiter wired in middleware stack
- Celery workers for async analysis + document generation
- S3/R2 file storage with presigned URLs
- WeasyPrint PDF generation with Noto Sans JP

---

## 8. Features In Progress / Pending

| Item | Status | Notes |
|------|--------|-------|
| Culture seed data | ⬜ Not seeded | Run `python -m scripts.seed_culture` |
| Integration tests | ⬜ Not written | Only unit tests exist (13 files) |
| Production deployment | ⬜ Not done | See Section 13 |
| Sentry DSN | ⬜ Not configured | Optional for local dev |
| Billing re-enablement | ⏸️ Deferred | See Section 14 |

---

## 9. Known Bugs and Issues

### Active issues (not yet fixed)

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| 1 | WeasyPrint fonts not verified at startup | 🟠 High | `verify_fonts()` exists in `utils/pdf_generator.py` but is not called at startup. PDF generation silently fails if Noto CJK fonts are missing on the server. |
| 2 | No integration tests | 🟡 Medium | All DB-touching paths are untested. Unit tests mock everything. |
| 3 | Rate limiter Redis dependency | 🟡 Medium | `rate_limiter.py` will throw if Redis is unreachable; no graceful fallback. |
| 4 | `alembic.ini` migration `0002` silent failure | 🟡 Medium | On some installs `0002_add_user_role` was recorded as run but didn't execute. If `role` column is missing, see Section 5 for manual fix. |
| 5 | Stripe URL defaults to localhost | 🟡 Low | `stripe_success_url` and `stripe_cancel_url` default to `localhost:3000` in `config.py`. Set `STRIPE_SUCCESS_URL` and `STRIPE_CANCEL_URL` env vars before enabling billing. |

### Fixed this session (do not reintroduce)

| Bug | Root Cause | Fix Applied |
|-----|-----------|-------------|
| All requests 401 | `next.config.ts` rewrites sent `/api/*` directly to backend, bypassing JWT injection | Rewrites block removed from `next.config.ts` |
| 401 after proxy fix | `CLERK_JWKS_URL` pointed to authenticated endpoint instead of public JWKS | Fixed to instance-specific `/.well-known/jwks.json` |
| User rows missing in local dev | Clerk webhook never fires without public URL | JIT user creation added to `ClerkJWTMiddleware._resolve_user` |
| Onboarding consent 500 | `record_consent` returned `None` silently when profile row didn't exist | Changed to `get_or_create` |
| Duplicate dashboard routes | Both `app/(dashboard)/` and `app/dashboard/` existed | Deleted `app/(dashboard)/` |
| Sign-in runtime error | Clerk `<SignIn/>` requires catch-all route | Moved to `sign-in/[[...sign-in]]/page.tsx` |
| Onboarding redirect React warning | `router.replace()` called during render | Moved to `useEffect` |
| `role` column missing from DB | Migration `0002` recorded but not executed | Manual `ALTER TABLE` applied |

---

## 10. Important Design Decisions

**Locked — do not change without updating techspec.**

| Decision | Rule |
|----------|------|
| Auth | Clerk JWTs only. Backend validates via JWKS. No passwords, no custom JWT. |
| User creation | JIT in middleware if webhook hasn't fired. `upsert_from_clerk` on every JWT. |
| API proxy | All requests go through `app/api/[...path]/route.ts`. No rewrites in `next.config.ts`. |
| Ownership | Every user-owned query includes `WHERE user_id = $1`. Returns `None` → 404. Never 403. |
| Streaming | SSE (`FastAPI StreamingResponse`) not WebSocket. Frontend uses `@microsoft/fetch-event-source`. |
| Job input | No scraper. URL paste + raw text only. `source_url` optional. |
| Document status | `DocumentGenerator.generate()` does NOT update status. Celery tasks own transitions. |
| Soft-delete | `job_postings` only. All other deletes are hard. |
| SQLAlchemy ENUMs | `create_type=False` on all SAEnum objects — types exist in DB from migrations. |
| Session lifecycle | `get_db()` owns commit/rollback. Repositories call `flush()` only. |
| Billing | `check_budget()` is a no-op. Billing router excluded from `router.py`. All free. |
| AI safety | User content wrapped in `<user_content>` tags in `AIClient.generate()`. |

---

## 11. Environment Setup

### Prerequisites

```
Node.js >= 20
Python >= 3.12
PostgreSQL 16 (brew install postgresql@16)
Redis 7 (brew install redis)
```

### Start infrastructure (macOS)

```bash
brew services start postgresql@16
brew services start redis
```

### Backend

```bash
cd /Users/rivky/Projects/ai-job-support/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd /Users/rivky/Projects/ai-job-support/frontend
npm install
npm run dev
# runs at http://localhost:3000
```

### Celery workers (required for document generation)

```bash
cd /Users/rivky/Projects/ai-job-support/backend
source .venv/bin/activate
celery -A app.workers.celery_app worker --loglevel=info --queues=documents,analysis --concurrency=2
```

### Finding your CLERK_JWKS_URL

Your instance-specific JWKS URL (not the generic `api.clerk.com` URL):
```
https://<your-instance>.clerk.accounts.dev/.well-known/jwks.json
```
Decode from your publishable key:
```python
import base64
pk = "pk_test_XXXX"
encoded = pk.replace("pk_test_","").replace("pk_live_","")
print(base64.b64decode(encoded + "==").decode())
# prints: your-instance.clerk.accounts.dev$
```

### Backend `.env` required keys

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/ai_job_support
DATABASE_SYNC_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/ai_job_support
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
CLERK_JWKS_URL=https://<instance>.clerk.accounts.dev/.well-known/jwks.json
GEMINI_API_KEY=AIza...
GEMINI_DEFAULT_MODEL=gemini-2.0-flash-lite
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-northeast-1
S3_BUCKET_NAME=...
RESEND_API_KEY=...           # optional locally
SENTRY_DSN=...               # optional
SECRET_KEY=any-long-random-string
APP_ENV=development
DEBUG=true
ALLOWED_ORIGINS=http://localhost:3000
```

For **Cloudflare R2** instead of AWS S3, also add:
```env
CLOUDFLARE_R2_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
AWS_REGION=auto
```

### Frontend `.env.local` required keys

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard/resumes
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding
```

### First-time admin setup

After signing up, promote your account directly in the DB:

```bash
cd backend && source .venv/bin/activate
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

---

## 12. Commands Reference

### Backend

```bash
# Run
uvicorn app.main:app --reload --port 8000

# Celery
celery -A app.workers.celery_app worker --loglevel=info --queues=documents,analysis --concurrency=2

# Migrations
alembic upgrade head
alembic downgrade -1
alembic current
alembic check
alembic revision --autogenerate -m "description"

# Seed culture content
python -m scripts.seed_culture

# Lint + format
ruff check . && ruff format .

# Type check
mypy app/

# Tests
pytest
pytest tests/unit/ -v
pytest -k "test_name" -v
```

### Frontend

```bash
npm run dev
npm run build
npm run type-check
npm run lint
npm run lint:fix
npm run format
```

---

## 13. Next Recommended Steps

### Immediate (before anything else)

1. **Seed culture content** — DB has no topics or glossary entries yet:
   ```bash
   cd backend && source .venv/bin/activate
   python -m scripts.seed_culture
   ```

2. **Verify PDF generation works locally** — upload a resume, trigger 履歴書 generation with Celery running, confirm PDF downloads. Requires WeasyPrint + Noto fonts installed.

### Deployment (free stack)

Deploy in this order:

| Step | Action | Service |
|------|--------|---------|
| 1 | Push code to GitHub | GitHub |
| 2 | Create PostgreSQL database | Neon (neon.tech) |
| 3 | Create Redis database | Upstash (upstash.com) |
| 4 | Create file storage bucket | Cloudflare R2 |
| 5 | Create email account | Resend (resend.com) |
| 6 | Create production Clerk instance | Clerk dashboard |
| 7 | Deploy backend API | Render (Web Service) |
| 8 | Deploy Celery worker | Render (Background Worker) |
| 9 | Run `alembic upgrade head` on Neon | Render shell or local |
| 10 | Run `python -m scripts.seed_culture` on Neon | local pointed at Neon |
| 11 | Deploy frontend | Vercel |
| 12 | Update `ALLOWED_ORIGINS` on Render | Render env vars |
| 13 | Add Vercel domain to Clerk | Clerk dashboard |
| 14 | Create Clerk webhook pointing to Render URL | Clerk dashboard |
| 15 | Promote yourself to admin on Neon DB | psycopg2 script |

**Render backend start command:**
```
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

**Render Celery start command:**
```
celery -A app.workers.celery_app worker --loglevel=info --queues=documents,analysis --concurrency=1
```

**Vercel settings:**
- Root directory: `frontend`
- Framework: Next.js (auto-detected)

### Production env vars to add (beyond local)

| Variable | Where | Value |
|----------|-------|-------|
| `APP_ENV` | Render | `production` |
| `ALLOWED_ORIGINS` | Render | `https://your-app.vercel.app` |
| `CLOUDFLARE_R2_ENDPOINT_URL` | Render | `https://<id>.r2.cloudflarestorage.com` |
| `NEXT_PUBLIC_API_URL` | Vercel | `https://your-app.onrender.com` |

### After deployment smoke test

- [ ] Sign up → onboarding completes → dashboard loads
- [ ] Upload resume → trigger analysis → result appears
- [ ] Generate 履歴書 → status shows processing → PDF downloads
- [ ] Translate a job posting → score appears
- [ ] Start interview session → SSE tokens stream
- [ ] Generate visa consultation
- [ ] Browse culture topics (seed data loaded)
- [ ] Open chatbot → multilingual reply
- [ ] `/admin` → stats load, create a topic
- [ ] Delete account → redirects to sign-in

### Hardening (before public launch)

- [ ] Add `verify_fonts()` call to `app/main.py` startup to catch missing fonts early
- [ ] Write integration tests for critical paths (auth, resume upload, document generation)
- [ ] Set up Sentry DSN for error tracking
- [ ] Configure Gemini API quotas/alerts in Google Cloud Console
- [ ] Run OWASP Top 10 security checklist

---

## 14. Billing — Deferred Design

All billing code is implemented but intentionally disabled. Platform is fully free.

### What's dormant

| File | Contents |
|------|----------|
| `backend/app/api/v1/billing.py` | Stripe Checkout, Portal, webhook handler, subscription/event endpoints |
| `backend/app/services/stripe_client.py` | Stripe API client |
| `backend/app/models/billing.py` | Subscription, BillingEvent, NotificationLog, SubscriptionLimit |
| `backend/app/repositories/billing.py` | Billing repositories |
| `backend/app/schemas/billing.py` | Pydantic billing schemas |
| `frontend/app/dashboard/billing/page.tsx` | Billing UI (not linked in nav) |
| `frontend/hooks/useBilling.ts` | Billing hooks (only `useDeleteAccount` used) |

### To re-enable billing

1. `backend/app/api/v1/router.py` — uncomment billing import and `router.include_router(billing.router)`
2. `backend/app/services/ai/usage_tracker.py` — restore tier enforcement logic in `check_budget()` (original logic in git history)
3. `frontend/app/dashboard/layout.tsx` — add `{ href: "/dashboard/billing", key: "billing" }` to `NAV_ITEMS`
4. Set env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_BASIC`, `STRIPE_PRICE_ID_PRO`

> ⚠️ **Env var naming bug:** `config.py` fields are `stripe_price_id_basic` / `stripe_price_id_pro`, which map to env vars `STRIPE_PRICE_ID_BASIC` / `STRIPE_PRICE_ID_PRO`. The old `.env` used `STRIPE_BASIC_PRICE_ID` — that does NOT map correctly. Use the new names.

### Planned tier limits

| Feature | Free | Basic (¥1,980/mo) | Pro (¥4,980/mo) |
|---------|------|-------------------|-----------------|
| Resume uploads/mo | 1 | 5 | Unlimited |
| Resume analyses/mo | 1 | 10 | Unlimited |
| 履歴書 generation/mo | 1 | 5 | Unlimited |
| 職務経歴書 generation/mo | 0 | 3 | Unlimited |
| Job translations/mo | 3 | 30 | Unlimited |
| Interview sessions/mo | 1 | 5 | Unlimited |
| Token budget/mo | 50,000 | 500,000 | Unlimited |
| PDF export | ✗ | ✓ | ✓ |
| Culture content | Limited | Full | Full |
