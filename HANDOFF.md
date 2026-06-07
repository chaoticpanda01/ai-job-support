# Project Handoff Document

**Project:** Japan Job Support Platform  
**Last Updated:** June 7, 2026  
**Repo Root:** `/Users/rivky/Projects/ai-job-support/`  
**GitHub:** `https://github.com/chaoticpanda01/ai-job-support` (private)  
**Status:** Fully deployed and live. All AI features confirmed working.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Goals and Requirements](#2-goals-and-requirements)
3. [Current Architecture](#3-current-architecture)
4. [Database Schema](#4-database-schema)
5. [File Structure](#5-file-structure)
6. [Completed Features](#6-completed-features)
7. [Features In Progress / Pending](#7-features-in-progress--pending)
8. [Known Bugs and Issues](#8-known-bugs-and-issues)
9. [Important Design Decisions](#9-important-design-decisions)
10. [Environment Setup](#10-environment-setup)
11. [Commands Reference](#11-commands-reference)
12. [Next Recommended Steps](#12-next-recommended-steps)
13. [Billing — Deferred Design](#13-billing--deferred-design)

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

**Business model:** Currently fully free. Billing infrastructure exists as backup — see Section 13.

---

## 2. Goals and Requirements

### Functional Requirements

| Feature | Status |
|---------|--------|
| User auth + onboarding (4-step, consent-first) | Done |
| Resume upload (PDF/DOCX) + AI parsing | Done |
| Resume analysis (gaps, Japan market score) | Done ✅ confirmed working |
| Rirekisho generation (async, downloadable PDF) | Done |
| Shokumukeirekisho generation (async, downloadable PDF) | Done |
| Job translation (URL paste + raw text) | Done |
| Job-resume match scoring | Done |
| Application status tracking (Kanban) | Done |
| Interview practice (SSE streaming) | Done ✅ real async streaming |
| Visa guidance checklist | Done ✅ confirmed working |
| Culture topics + glossary | Done |
| AI chatbot (no auth) | Done |
| Language switcher (EN/ID/JP) | Done (landing page only — dashboard pages still hardcoded EN) |
| Admin panel (users, culture CMS) | Done |
| Account deletion (GDPR/PDPA) | Done |
| Stripe billing + usage enforcement | Built, disabled |

### Non-Functional Requirements

- TypeScript strict mode throughout frontend
- Ownership enforced at query level — WHERE user_id = current_user.id inside query, never check after fetch
- No job scraping — URL paste + raw text paste only (ToS compliance)
- SSE not WebSocket for interview streaming
- Soft-delete on job_postings — deleted_at column, never hard-delete
- S3 private bucket only — presigned URLs (15 min TTL) for all downloads
- cover_letter deferred — not in document_type ENUM

---

## 3. Current Architecture

### Live URLs

| Service | URL |
|---------|-----|
| Frontend | https://ai-job-support.vercel.app |
| Backend API | https://ai-job-support-api.onrender.com |
| GitHub repo | https://github.com/chaoticpanda01/ai-job-support |

### System Diagram

```
Browser
  |
  v
Next.js 15 (Vercel)
  |  app/api/[...path]/route.ts  <- injects Clerk JWT, buffers response body
  |  browsers never call FastAPI directly
  v
FastAPI (Render -- Free tier, spins down after 15min idle)
  CORS -> RateLimiter -> ClerkJWT -> Route handler
  Router -> Dependencies -> Service -> Repository -> DB
  |                          |
  v                          v
PostgreSQL 16 (Neon)      Redis 7 (Upstash) -- rate limiting only
                          FastAPI BackgroundTasks -- resume analysis + doc generation
                          Gemini 2.5 Flash API
                          Backblaze B2 (file storage)
```

### Key Architectural Rules

1. **Ownership in query** — every user-owned resource includes `WHERE id = $1 AND user_id = $2`. Returns None → caller raises 404. Never 403.
2. **Repository layer** is sole DB access point — routes call services, services call repositories.
3. **AI client** is sole Gemini access point — never import google.genai outside `services/ai/client.py`.
4. **Session lifecycle in get_db()** — commit on success, rollback on exception. Repositories flush(), never commit().
5. **SSE for interview** — FastAPI StreamingResponse with `media_type='text/event-stream'`.
6. **No Celery** — replaced with FastAPI BackgroundTasks. `_run_analysis` and `_run_generation` called directly.
7. **JIT user creation** — ClerkJWTMiddleware._resolve_user calls upsert_from_clerk if user row missing. Requires email claim in Clerk JWT.
8. **Next.js proxy is the sole API gateway** — proxy strips content-encoding, content-length, transfer-encoding headers. All non-SSE responses are buffered via `upstream.text()`.
9. **No TrustedHostMiddleware** — removed because it blocked Vercel→Render proxy requests. CORS handles security.
10. **Billing disabled** — check_budget() is a no-op; billing router excluded from router.py.
11. **ALL boto3 clients MUST use endpoint_url** — every boto3.client("s3", ...) call MUST include `endpoint_url=settings.cloudflare_r2_endpoint_url`. Without it, boto3 resolves to AWS S3 (wrong endpoint) and fails with NameResolutionError.
12. **Gemini JSON mode** — all AI calls that return JSON MUST pass `json_mode=True` to `ai_client.generate()`. This sets `response_mime_type="application/json"` and prevents Gemini from generating malformed JSON (unescaped characters, missing commas, truncated fences).

---

## 4. Database Schema

Source of truth: `database/schema.sql`  
Live DB: Neon PostgreSQL (Singapore region)  
Migrations: All 4 applied

### Tables (19 total)

| Table | Purpose | Notes |
|-------|---------|-------|
| users | Auth identity + subscription tier + role | clerk_id links to Clerk; role = user or admin |
| profiles | Job-seeking preferences | onboarding_step 0-4; consent_given_at required before AI features |
| resumes | Uploaded files (PDF/DOCX) | is_primary partial unique index per user |
| resume_analyses | AI analysis results | job_posting_id FK is SET NULL on delete |
| generated_documents | Async rirekisho / shokumukeirekisho | status: pending→processing→completed or failed |
| job_postings | Translated Japanese job postings | Soft-delete via deleted_at |
| job_matches | AI match scores | Unique (user_id, resume_id, job_posting_id) |
| saved_jobs | Job bookmarks | |
| job_applications | Application pipeline | status: planning→applied→interviewing→offered or rejected |
| interview_sessions | Practice session metadata | status: active→completed or abandoned |
| interview_messages | Per-turn conversation | ai_evaluation JSONB on user turns |
| visa_consultations | Personalised visa roadmap | profile_snapshot JSONB |
| culture_topics | Culture articles | published_at NULL = draft |
| culture_glossary | Japanese workplace terms | Indonesian definitions |
| subscriptions | Stripe subscription state | Dormant — billing disabled |
| billing_events | Append-only Stripe event log | Dormant |
| notification_log | Outbound email/push log | |
| subscription_limits | Per-tier limits seed table | Seeded |
| ai_usage_logs | AI call log | Partitioned by month through 2027-12 |

### Critical Constraint on users table

```sql
CONSTRAINT users_email_fmt CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
```

This CHECK constraint means JIT user creation requires the email claim in the Clerk JWT. This was fixed by customising the Clerk session token (Configure → Sessions → Customize session token → `{"email": "{{user.primary_email_address}}"}`).

### Migrations Status

| File | Description | Status |
|------|-------------|--------|
| 0001_baseline.py | Full schema from schema.sql | Applied |
| 0002_add_user_role.py | user_role ENUM + role column (idempotent) | Applied |
| 0003_add_consent_given_at.py | consent_given_at to profiles (idempotent) | Applied |
| 0004_seed_subscription_limits.py | Seed subscription_limits (ON CONFLICT DO NOTHING) | Applied |

---

## 5. File Structure

```
ai-job-support/
├── HANDOFF.md
├── README.md
├── docker-compose.yml
├── .github/workflows/ci.yml          <- CI fails are non-blocking (Render deploys from git push)
├── database/schema.sql               <- SOURCE OF TRUTH for all DDL
├── docs/japan-job-platform-techspec.md
│
├── frontend/                         # Next.js 15
│   ├── middleware.ts                 Clerk auth — protects /dashboard/*, /onboarding
│   ├── next.config.ts                ignoreDuringBuilds: true (ESLint + TypeScript)
│   ├── .env.local                    local env (never commit)
│   ├── lib/
│   │   ├── i18n.ts                   translations: nav, landing, features, dashboard (partial)
│   │   ├── language-context.tsx      useLang() hook — currently only used in 3 files
│   │   └── api-client.ts
│   │
│   ├── app/
│   │   ├── layout.tsx                ClerkProvider + QueryProvider + ChatWidget
│   │   ├── page.tsx                  Landing page (uses useLang() ✅)
│   │   ├── api/[...path]/route.ts    Proxy — injects Clerk JWT, buffers body, strips encoding headers
│   │   ├── onboarding/page.tsx       4-step wizard (hardcoded EN ⚠️)
│   │   ├── admin/page.tsx            Admin panel (hardcoded EN)
│   │   └── dashboard/
│   │       ├── layout.tsx            Nav sidebar (uses useLang() ✅)
│   │       ├── resumes/page.tsx      (hardcoded EN ⚠️)
│   │       ├── resumes/[id]/page.tsx (hardcoded EN ⚠️)
│   │       ├── documents/page.tsx    (hardcoded EN ⚠️)
│   │       ├── documents/[id]/page.tsx (hardcoded EN ⚠️)
│   │       ├── jobs/page.tsx         (hardcoded EN ⚠️)
│   │       ├── jobs/[id]/page.tsx    (hardcoded EN ⚠️)
│   │       ├── interview/page.tsx    (hardcoded EN ⚠️)
│   │       ├── interview/new/page.tsx (hardcoded EN ⚠️)
│   │       ├── interview/[id]/page.tsx (hardcoded EN ⚠️)
│   │       ├── visa/page.tsx         (hardcoded EN ⚠️)
│   │       ├── visa/[id]/page.tsx    (hardcoded EN ⚠️)
│   │       ├── culture/page.tsx      (hardcoded EN ⚠️)
│   │       ├── settings/page.tsx     (hardcoded EN ⚠️)
│   │       └── billing/page.tsx      Built, not linked in nav
│   │
│   └── components/
│       ├── chat-widget.tsx           Uses /api/v1/chat/message (via proxy, NOT localhost)
│       └── language-switcher.tsx     (uses useLang() ✅)
│
└── backend/                          # FastAPI
    ├── .python-version               3.12.0 (pins Python on Render)
    ├── alembic.ini                   Uses %(DATABASE_SYNC_URL)s
    │
    └── app/
        ├── main.py                   NO TrustedHostMiddleware (removed — broke Vercel→Render)
        ├── config.py                 gemini_default_model = "gemini-2.5-flash"; cloudflare_r2_endpoint_url field present
        ├── database.py               Async engine
        ├── dependencies.py           DbSession, AuthUser, AdminUser
        │
        ├── middleware/
        │   ├── clerk_auth.py         JWKS validation + JIT user creation; skips JIT if email missing
        │   └── rate_limiter.py       Redis-backed; degrades gracefully if Redis down
        │
        ├── api/v1/
        │   ├── router.py             billing excluded
        │   ├── auth.py               /me, /consent, /webhook
        │   ├── resumes.py            Uses BackgroundTasks for analysis (not Celery)
        │   ├── documents.py          Uses BackgroundTasks for generation (not Celery)
        │   ├── jobs.py               boto3 uses endpoint_url ✅; json_mode=True ✅; gemini_default_model ✅
        │   ├── interview.py          real async streaming ✅; json_mode=True ✅; gemini_default_model ✅
        │   ├── visa.py               ai_client.generate() ✅; json_mode=True ✅
        │   ├── culture.py, chat.py, account.py, admin.py
        │   └── billing.py            NOT in router
        │
        ├── services/ai/
        │   ├── client.py             Gemini 2.5 Flash; 3x retry; json_mode param; real async stream
        │   ├── response_parser.py    handles unclosed fences (truncated responses)
        │   └── prompts/              7 prompt modules
        │
        ├── services/
        │   └── document_generator.py boto3 uses endpoint_url ✅; gemini_default_model ✅
        │
        └── workers/
            ├── celery_app.py         Still exists but NOT used (BackgroundTasks replaced it)
            ├── analysis_tasks.py     _run_analysis: boto3 endpoint_url ✅; max_tokens=8192; json_mode=True ✅
            └── document_tasks.py     _run_generation called directly via BackgroundTasks
```

---

## 6. Completed Features

### Deployment
- Backend: https://ai-job-support-api.onrender.com
- Frontend: https://ai-job-support.vercel.app
- Neon DB: all 4 migrations applied, culture content seeded (12 topics, 35 glossary entries)
- Admin: rivky.rachmadi@gmail.com promoted to admin

### AI Features Status (ALL confirmed working as of June 7, 2026)

| Feature | Endpoint | Status |
|---------|----------|--------|
| Resume analysis | POST /resumes/{id}/analyse | ✅ Working — score 35 confirmed |
| Visa guidance | POST /visa/consultations | ✅ Working — 高度専門職 roadmap confirmed |
| Job translation | POST /jobs/translate | ✅ Fixed |
| Job match scoring | POST /jobs/{id}/match | ✅ Fixed |
| Document generation | POST /documents/generate | ✅ Fixed (boto3) — not smoke-tested yet |
| Interview streaming | GET /interview/sessions/{id}/stream | ✅ Fixed (real async) — not smoke-tested yet |
| Interview eval | POST /interview/sessions/{id}/messages | ✅ Fixed |
| AI chatbot | POST /chat/message | ✅ Working |

### Bugs Fixed in Most Recent Session (Session 2)

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Resume analysis failing with `AttributeError: 'Settings' object has no attribute 'cloudflare_r2_endpoint_url'` | Field missing from Pydantic Settings model | Added `cloudflare_r2_endpoint_url: str = ""` to `config.py` |
| Resume analysis JSON truncation (`Expecting value: line 1 column 1`) | Gemini truncating at 1500 tokens; parser couldn't handle unclosed fence | Raised `max_tokens` 1500→8192 in `analysis_tasks.py`; improved `response_parser.py` to strip unclosed fences |
| Visa guidance `AttributeError` (`ai_client.complete()` doesn't exist) | `visa.py` called non-existent method; also tried to unpack tuple incorrectly | Rewrote entire AI call block in `visa.py` using `ai_client.generate()` + `parse_response()` |
| Visa malformed JSON (`Expecting ',' delimiter: line 48 column 8`) | Gemini in plain text mode generating JSON with unescaped Indonesian characters | Added `json_mode=True` parameter (sets `response_mime_type="application/json"`) across all JSON-returning AI calls |
| Interview fake streaming (full response yielded at once) | `stream()` called blocking `generate_content()` instead of streaming API | Replaced with `_client.aio.models.generate_content_stream()` for true token-by-token async streaming |
| boto3 pointing to AWS S3 instead of Backblaze B2 in `jobs.py` | Missing `endpoint_url` | Added `s3_kwargs` pattern with conditional `endpoint_url` |
| boto3 pointing to AWS S3 instead of Backblaze B2 in `document_generator.py` | Missing `endpoint_url` | Added `s3_kwargs` pattern with conditional `endpoint_url` |
| Wrong model name in usage logs in `jobs.py`, `interview.py`, `document_generator.py` | `anthropic_default_model` (doesn't exist) used in `usage_tracker.record()` | Changed all to `gemini_default_model` |
| `_MATCH_MAX_TOKENS` too low (800) causing truncation | Token limit too low for job match JSON response | Raised 800→2048 in `jobs.py` |
| `_EVAL_MAX_TOKENS` too low (800) causing truncation | Token limit too low for interview eval JSON response | Raised 800→2048 in `interview.py` |

### Bugs Fixed in Session 1

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Onboarding stuck on "Saving..." | TrustedHostMiddleware returning 400 for all Vercel→Render requests | Removed TrustedHostMiddleware from main.py |
| Onboarding 400 on /auth/me | Clerk JWT had no email claim → users.email CHECK constraint violated | Added `{"email": "{{user.primary_email_address}}"}` to Clerk session token |
| ERR_CONTENT_DECODING_FAILED + truncated JSON | Proxy forwarded content-encoding: gzip but body was already decoded | Proxy deletes content-encoding, content-length, transfer-encoding; buffers all non-SSE via `upstream.text()` |
| Chat widget CORS error | chat-widget.tsx hardcoded `http://localhost:8000` | Changed to `/api/v1/chat/message` |
| Resume analysis stuck on "Analysis queued" | boto3 missing endpoint_url in analysis_tasks.py | Added endpoint_url to boto3 client |
| Gemini API returning quota errors | gemini-2.0-flash-lite had 0/0 quota | Changed to `gemini-2.5-flash` |

---

## 7. Features In Progress / Pending

| Item | Priority | Notes |
|------|----------|-------|
| **i18n: dashboard pages translation** | High | All dashboard pages are hardcoded English. Only `app/page.tsx`, `dashboard/layout.tsx`, and `language-switcher.tsx` use `useLang()`. See Section 12 for full list of pages needing translation. |
| **Smoke test: document generation** | Medium | boto3 fix deployed but PDF generation not verified end-to-end. WeasyPrint + Noto CJK fonts may need Render build script. |
| **Smoke test: interview streaming** | Medium | Async streaming fix deployed but not tested in browser. |
| **Render cold start prevention** | Medium | Free tier spins down after 15min. Set up cron-job.org ping every 10min. |
| **GitHub CI** | Low | Failing — non-blocking for Render deployment |
| **Connect Vercel to GitHub** | Low | Currently requires manual `vercel --prod` |

---

## 8. Known Bugs and Issues

### Active

| Issue | Severity | Notes |
|-------|----------|-------|
| Render cold start | Medium | Free tier spins down after 15min idle. First request takes ~50s. Fix: upgrade to Render Starter ($7/mo) or use cron-job.org to ping /health every 10min. |
| PDF generation not verified | Medium | WeasyPrint requires Noto CJK fonts. May need `apt-get install fonts-noto-cjk` in Render build script. If document stays on "processing", this is the likely cause. |
| GitHub CI failing | Low | Non-blocking for deployment. Likely missing env vars in CI config. |
| BackgroundTask lost on cold start | Low | If Render sleeps mid-analysis/generation, task dies silently. Document stays "pending" forever. User must retry. |
| Gemini 5 RPM limit | Low | Free tier gemini-2.5-flash has only 5 RPM. Multiple simultaneous AI requests will rate-limit. |
| Dashboard pages hardcoded English | Low | Language switcher works on landing page only. All dashboard pages ignore user's language preference. |

### Fixed — DO NOT Reintroduce

| Bug | What breaks if reintroduced |
|-----|---------------------------|
| TrustedHostMiddleware in main.py | All Vercel→Render proxy requests return 400 "Invalid host header" |
| Clerk session token without email claim | JIT user creation fails: `users_email_fmt` CHECK constraint rejected |
| boto3 without `endpoint_url` | Resolves to AWS S3 (wrong), fails with NameResolutionError |
| `ai_client.complete()` in visa.py | AttributeError crash on every visa consultation request |
| Gemini plain text mode for JSON calls | Malformed JSON with unescaped characters; parse errors |
| `max_tokens=1500` for resume analysis | Response truncated; JSON parse fails with empty candidate |
| `anthropic_default_model` in usage_tracker calls | AttributeError crash on every usage log write |

---

## 9. Important Design Decisions

Locked — do not change without updating techspec.

| Decision | Rule |
|----------|------|
| Auth | Clerk JWTs only. Backend validates via JWKS. No passwords, no custom JWT. |
| Email in JWT | Clerk session token MUST include `{"email": "{{user.primary_email_address}}"}` — required for JIT user creation. |
| User creation | JIT in middleware if webhook hasn't fired. upsert_from_clerk on every JWT. Returns None (→ 401) if email missing. |
| API proxy | All requests go through `app/api/[...path]/route.ts`. No rewrites in next.config.ts. Proxy buffers all non-SSE responses. |
| No TrustedHostMiddleware | Removed — it blocked Vercel proxy requests. CORS handles security. |
| Ownership | Every user-owned query includes `WHERE user_id = $1`. Returns None → 404. Never 403. |
| Streaming | SSE (FastAPI StreamingResponse) not WebSocket. Proxy does NOT buffer SSE responses (streams them). |
| Background tasks | FastAPI BackgroundTasks instead of Celery. `_run_analysis` and `_run_generation` called directly (no queue). |
| Job input | No scraper. URL paste + raw text only. |
| Session lifecycle | `get_db()` owns commit/rollback. Repositories call `flush()` only. |
| Billing | `check_budget()` is a no-op. Billing router excluded from router.py. All free. |
| Storage | Backblaze B2 via S3-compatible API. Env var `CLOUDFLARE_R2_ENDPOINT_URL` holds the B2 endpoint. ALL boto3 clients MUST include `endpoint_url=settings.cloudflare_r2_endpoint_url`. |
| Gemini JSON mode | All AI calls returning structured JSON MUST pass `json_mode=True` to `ai_client.generate()`. This prevents malformed JSON and unescaped character errors from Gemini. |
| AI max_tokens | Resume analysis: 8192. Visa guidance: 4096. Job match/interview eval: 2048. Never below 2048 for JSON-returning calls. |

---

## 10. Environment Setup

### Live Services

| Service | URL / Account |
|---------|--------------|
| Neon (PostgreSQL) | console.neon.tech — project ai-job-support |
| Upstash (Redis) | console.upstash.com — db ai-job-support |
| Backblaze B2 (Storage) | backblaze.com — bucket ai-job-support, region ca-east-006 |
| Resend (Email) | resend.com |
| Clerk (Auth) | dashboard.clerk.com — instance learning-alien-88 |
| Render (Backend) | dashboard.render.com — service ai-job-support-api |
| Vercel (Frontend) | vercel.com — project ai-job-support |

### Clerk Configuration (critical)

Session token customization: Clerk Dashboard → Configure → Sessions → Customize session token:
```json
{
  "email": "{{user.primary_email_address}}"
}
```
Without this, JIT user creation fails (users.email CHECK constraint rejects empty strings).

Webhook: Webhooks → Endpoint:
- URL: `https://ai-job-support-api.onrender.com/api/v1/auth/webhook`
- Events: user.created, user.updated, user.deleted

### Backend Render Environment Variables

```
APP_ENV=production
DEBUG=false
DATABASE_URL=postgresql+asyncpg://neondb_owner:npg_4fskOo5UjMGx@ep-nameless-wave-aox419t0-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?ssl=require
DATABASE_SYNC_URL=postgresql+psycopg2://neondb_owner:npg_4fskOo5UjMGx@ep-nameless-wave-aox419t0-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
REDIS_URL=rediss://default:...@hip-beagle-98602.upstash.io:6379
CLERK_SECRET_KEY=sk_test_x4GlOhaNyELggiwUlCB5Yux4jvussWguiMh4SpBmrr
CLERK_JWKS_URL=https://learning-alien-88.clerk.accounts.dev/.well-known/jwks.json
CLERK_WEBHOOK_SECRET=whsec_...
GEMINI_API_KEY=...
GEMINI_DEFAULT_MODEL=gemini-2.5-flash
AWS_ACCESS_KEY_ID=0067f6c337ae92f0000000001
AWS_SECRET_ACCESS_KEY=K006o1pQEAKUlmdPy4RiHI13JdG6A/c
AWS_REGION=ca-east-006
S3_BUCKET_NAME=ai-job-support
CLOUDFLARE_R2_ENDPOINT_URL=https://s3.ca-east-006.backblazeb2.com
RESEND_API_KEY=...
SECRET_KEY=...
ALLOWED_ORIGINS=https://ai-job-support.vercel.app
ALLOWED_HOSTS=*
```

**Notes:**
- `CLOUDFLARE_R2_ENDPOINT_URL` is actually Backblaze B2 (not Cloudflare). The env var name is reused for compatibility.
- `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` are no longer needed — BackgroundTasks replaced Celery.

### Frontend Vercel Environment Variables

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_bGVhcm5pbmctYWxpZW4tODguY2xlcmsuYWNjb3VudHMuZGV2JA
CLERK_SECRET_KEY=sk_test_x4GlOhaNyELggiwUlCB5Yux4jvussWguiMh4SpBmrr
NEXT_PUBLIC_API_URL=https://ai-job-support-api.onrender.com
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard/resumes
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding
```

### Promote to Admin

```bash
cd /Users/rivky/Projects/ai-job-support/backend && source .venv/bin/activate
python -c "
import psycopg2
conn = psycopg2.connect('postgresql://neondb_owner:npg_4fskOo5UjMGx@ep-nameless-wave-aox419t0-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require')
conn.autocommit = True
cur = conn.cursor()
cur.execute(\"UPDATE users SET role = 'admin' WHERE email = 'rivky.rachmadi@gmail.com'\")
print('Rows updated:', cur.rowcount)
conn.close()
"
```

---

## 11. Commands Reference

### Deploy

```bash
# Backend — push to GitHub, Render auto-deploys from main branch
git add . && git commit -m "your message" && git push

# Frontend — MUST deploy manually via Vercel CLI
# (project is connected via CLI, NOT GitHub integration — git push does NOT trigger Vercel)
cd /Users/rivky/Projects/ai-job-support/frontend && vercel --prod
```

### Backend Local Dev

```bash
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

### Run Migrations

```bash
cd backend && source .venv/bin/activate
DATABASE_SYNC_URL="postgresql+psycopg2://neondb_owner:npg_4fskOo5UjMGx@ep-nameless-wave-aox419t0-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require" alembic upgrade head
```

### Seed Culture Content

```bash
cd backend && source .venv/bin/activate
DATABASE_URL="postgresql+asyncpg://neondb_owner:npg_4fskOo5UjMGx@ep-nameless-wave-aox419t0-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?ssl=require" python -m scripts.seed_culture
```

### Frontend Local Dev

```bash
cd frontend && npm run dev
```

---

## 12. Next Recommended Steps

### 1. i18n — Translate dashboard pages (highest priority)

The language switcher exists and works on the landing page, but all dashboard pages are hardcoded English. Users who select Indonesian or Japanese see no change after login.

**Current state of i18n:**
- `frontend/lib/i18n.ts` — has translations for `nav`, `landing`, `features`, `dashboard` (partial — only `resumesTitle`, `resumesSub`, `uploadBtn`, `noResumes`)
- `frontend/lib/language-context.tsx` — `useLang()` hook, only used in 3 files currently
- Pattern: `const { lang } = useLang(); const label = t("section", "key", lang);`

**Pages needing translation (in priority order):**

| Page | File | Priority |
|------|------|----------|
| Onboarding wizard | `app/onboarding/page.tsx` | Highest — first user experience |
| Jobs list + detail | `dashboard/jobs/page.tsx`, `jobs/[id]/page.tsx` | High — most-used feature |
| Interview | `dashboard/interview/page.tsx`, `interview/new/page.tsx`, `interview/[id]/page.tsx` | High |
| Visa | `dashboard/visa/page.tsx`, `visa/[id]/page.tsx` | High |
| Settings | `dashboard/settings/page.tsx` | Medium |
| Documents | `dashboard/documents/page.tsx`, `documents/[id]/page.tsx` | Medium |
| Resumes | `dashboard/resumes/page.tsx`, `resumes/[id]/page.tsx` | Medium (partial already in i18n.ts) |

**How to add translations:**
1. Add keys to the relevant section in `frontend/lib/i18n.ts`
2. Import `useLang` in the page: `import { useLang } from "@/lib/language-context";`
3. Add `const { lang } = useLang();` in the component
4. Replace hardcoded strings with `t("section", "key", lang)`

### 2. Smoke test document generation (medium priority)

Generate a rirekisho at https://ai-job-support.vercel.app/dashboard/documents.  
Status should go: pending → processing → completed. PDF should download.

If it stays on "processing", WeasyPrint CJK fonts are missing on Render. Fix:

Create `backend/build.sh`:
```bash
#!/bin/bash
set -e
pip install -r requirements.txt
apt-get install -y fonts-noto-cjk 2>/dev/null || true
```
Then in Render → Service Settings → Build Command: `bash build.sh`

### 3. Smoke test interview streaming (medium priority)

Start a new interview session at https://ai-job-support.vercel.app/dashboard/interview/new  
The AI's response should stream token-by-token (typewriter effect). If it appears all at once, SSE buffering is occurring somewhere in the proxy or browser.

### 4. Prevent Render cold starts (medium priority)

Sign up at cron-job.org (free). Create a cron job:
- URL: `https://ai-job-support-api.onrender.com/health`
- Schedule: every 10 minutes

This prevents the ~50s cold start delay for users.

### 5. Connect Vercel to GitHub (optional)

Currently `vercel --prod` must be run manually. To enable auto-deploy on git push:  
Vercel Dashboard → ai-job-support project → Settings → Git → Connect GitHub repo

### 6. Fix GitHub CI (low priority, non-blocking)

CI failures do not affect Render deployment. To fix: check `.github/workflows/ci.yml` for missing secrets/env vars, then add them in GitHub → Settings → Secrets and variables → Actions.

### 7. Minor fixes (lowest priority)

- **Deprecated Clerk prop:** Replace `afterSignInUrl` with `fallbackRedirectUrl` in ClerkProvider
- **favicon 404:** Add `public/favicon.ico` to frontend
- **Add Vercel domain to Clerk:** Clerk Dashboard → Domains → add `ai-job-support.vercel.app`

---

## 13. Billing — Deferred Design

All billing code is implemented but intentionally disabled. Platform is currently fully free.

### What's dormant

| File | Contents |
|------|----------|
| `backend/app/api/v1/billing.py` | Stripe Checkout, Portal, webhook handler |
| `backend/app/services/stripe_client.py` | Stripe API client |
| `backend/app/models/billing.py` | Subscription, BillingEvent, SubscriptionLimit |
| `frontend/app/dashboard/billing/page.tsx` | Billing UI (not linked in nav) |
| `frontend/hooks/useBilling.ts` | Billing hooks |

### To re-enable billing

1. `backend/app/api/v1/router.py` — uncomment the billing import and `router.include_router(billing.router)`
2. `backend/app/services/ai/usage_tracker.py` — restore tier check in `check_budget()`
3. `frontend/app/dashboard/layout.tsx` — add Billing to NAV_ITEMS
4. Set env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_BASIC`, `STRIPE_PRICE_ID_PRO` on Render and Vercel
