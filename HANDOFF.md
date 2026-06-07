# Project Handoff Document

**Project:** Japan Job Support Platform  
**Last Updated:** June 7, 2026  
**Repo Root:** `/Users/rivky/Projects/ai-job-support/`  
**GitHub:** `https://github.com/chaoticpanda01/ai-job-support` (private)  
**Status:** Fully deployed and live. All AI features working. Full i18n implemented.

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
| User auth + onboarding (4-step, consent-first) | ✅ Done + translated |
| Resume upload (PDF/DOCX) + AI parsing | ✅ Done |
| Resume analysis (gaps, Japan market score) | ✅ Done + confirmed working |
| Rirekisho generation (async, downloadable PDF) | ✅ Done |
| Shokumukeirekisho generation (async, downloadable PDF) | ✅ Done |
| Job translation (URL paste + raw text) | ✅ Done |
| Job-resume match scoring | ✅ Done |
| Application status tracking (Kanban) | ✅ Done |
| Interview practice (SSE streaming) | ✅ Done + real async streaming |
| Visa guidance checklist | ✅ Done + confirmed working |
| Culture topics + glossary | ✅ Done |
| AI chatbot (no auth) | ✅ Done |
| Language switcher (EN/ID/JP) | ✅ Done — works across ALL pages now |
| Admin panel (users, culture CMS) | ✅ Done |
| Account deletion (GDPR/PDPA) | ✅ Done |
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
11. **ALL boto3 clients MUST use endpoint_url** — every `boto3.client("s3", ...)` call MUST include `endpoint_url=settings.cloudflare_r2_endpoint_url`. Without it, boto3 resolves to AWS S3 (wrong endpoint) and fails.
12. **Gemini JSON mode** — all AI calls returning structured JSON MUST pass `json_mode=True` to `ai_client.generate()`. This sets `response_mime_type="application/json"` and prevents malformed JSON.
13. **i18n via useLang() + t()** — all user-visible strings MUST use `t("section", "key", lang)`. Never hardcode English in UI components. See Section 9 for the i18n pattern.

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

Requires email claim in Clerk JWT. Fixed via: Clerk Dashboard → Configure → Sessions → Customize session token → `{"email": "{{user.primary_email_address}}"}`.

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
├── database/schema.sql               <- SOURCE OF TRUTH for all DDL
├── .github/workflows/ci.yml          <- CI fails non-blocking (Render deploys from git push)
│
├── frontend/                         # Next.js 15
│   ├── middleware.ts                 Clerk auth — protects /dashboard/*, /onboarding
│   ├── next.config.ts                ignoreDuringBuilds: true (ESLint + TypeScript)
│   │
│   ├── lib/
│   │   ├── i18n.ts                   *** ALL TRANSLATIONS LIVE HERE ***
│   │   │                             Sections: nav, landing, features, common, onboarding,
│   │   │                             resumes, jobs, interview, visa, documents, settings, dashboard
│   │   ├── language-context.tsx      LanguageProvider + useLang() hook
│   │   └── providers.tsx             Wraps app with QueryClientProvider + LanguageProvider
│   │
│   ├── app/
│   │   ├── layout.tsx                ClerkProvider + Providers (includes LanguageProvider)
│   │   ├── page.tsx                  Landing page — uses useLang() ✅
│   │   ├── api/[...path]/route.ts    Proxy — injects Clerk JWT, buffers body, strips headers
│   │   ├── onboarding/page.tsx       4-step wizard — uses useLang() ✅
│   │   └── dashboard/
│   │       ├── layout.tsx            Nav sidebar + language switcher — uses useLang() ✅
│   │       ├── resumes/page.tsx      uses useLang() ✅
│   │       ├── resumes/[id]/page.tsx uses useLang() ✅
│   │       ├── documents/page.tsx    uses useLang() ✅
│   │       ├── documents/[id]/page.tsx
│   │       ├── documents/rirekisho/new/page.tsx
│   │       ├── documents/shokumu/new/page.tsx
│   │       ├── jobs/page.tsx         uses useLang() ✅
│   │       ├── jobs/[id]/page.tsx    uses useLang() ✅
│   │       ├── jobs/translate/page.tsx uses useLang() ✅
│   │       ├── jobs/applications/page.tsx uses useLang() ✅
│   │       ├── interview/page.tsx    uses useLang() ✅
│   │       ├── interview/new/page.tsx uses useLang() ✅
│   │       ├── interview/[id]/page.tsx uses useLang() ✅
│   │       ├── visa/page.tsx         uses useLang() ✅
│   │       ├── visa/[id]/page.tsx    uses useLang() ✅
│   │       ├── culture/page.tsx      (not yet translated)
│   │       ├── settings/page.tsx     uses useLang() ✅
│   │       └── billing/page.tsx      Built, not linked in nav
│   │
│   └── components/
│       ├── chat-widget.tsx           Uses /api/v1/chat/message (via proxy, NOT localhost)
│       └── language-switcher.tsx     uses useLang() ✅
│
└── backend/                          # FastAPI
    ├── .python-version               3.12.0
    ├── alembic.ini                   Uses %(DATABASE_SYNC_URL)s
    │
    └── app/
        ├── main.py                   NO TrustedHostMiddleware
        ├── config.py                 gemini_default_model, cloudflare_r2_endpoint_url declared
        ├── database.py               Async engine
        ├── dependencies.py           DbSession, AuthUser, AdminUser
        │
        ├── middleware/
        │   ├── clerk_auth.py         JWKS validation + JIT user creation
        │   └── rate_limiter.py       Redis-backed; degrades gracefully if Redis down
        │
        ├── api/v1/
        │   ├── router.py             billing excluded
        │   ├── resumes.py            BackgroundTasks for analysis
        │   ├── documents.py          BackgroundTasks for generation
        │   ├── jobs.py               boto3 endpoint_url ✅; json_mode=True ✅; gemini_default_model ✅
        │   ├── interview.py          real async streaming ✅; json_mode=True ✅
        │   ├── visa.py               ai_client.generate() ✅; json_mode=True ✅
        │   └── billing.py            NOT in router
        │
        ├── services/ai/
        │   ├── client.py             Gemini 2.5 Flash; 3x retry; json_mode param; real async stream
        │   ├── response_parser.py    handles unclosed fences (truncated responses)
        │   └── prompts/              7 prompt modules
        │
        ├── services/
        │   └── document_generator.py boto3 endpoint_url ✅; gemini_default_model ✅
        │
        └── workers/
            ├── celery_app.py         Exists but NOT used
            ├── analysis_tasks.py     boto3 endpoint_url ✅; max_tokens=8192; json_mode=True ✅
            └── document_tasks.py     Called directly via BackgroundTasks
```

---

## 6. Completed Features

### Deployment
- Backend: https://ai-job-support-api.onrender.com (Render free tier)
- Frontend: https://ai-job-support.vercel.app (Vercel)
- Neon DB: all 4 migrations applied, culture content seeded (12 topics, 35 glossary entries)
- Admin: rivky.rachmadi@gmail.com promoted to admin

### AI Features (ALL confirmed working)

| Feature | Endpoint | Status |
|---------|----------|--------|
| Resume analysis | POST /resumes/{id}/analyse | ✅ Working — score confirmed |
| Visa guidance | POST /visa/consultations | ✅ Working — roadmap confirmed |
| Job translation | POST /jobs/translate | ✅ Fixed |
| Job match scoring | POST /jobs/{id}/match | ✅ Fixed |
| Document generation | POST /documents/generate | ✅ Fixed (boto3) — not smoke-tested |
| Interview streaming | GET /interview/sessions/{id}/stream | ✅ Fixed (real async) — not smoke-tested |
| Interview eval | POST /interview/sessions/{id}/messages | ✅ Fixed |
| AI chatbot | POST /chat/message | ✅ Working |

### i18n — Full Implementation (Session 3)

All user-visible strings now respond to the language switcher (EN / ID / JP):

| File | Translated |
|------|-----------|
| `frontend/lib/i18n.ts` | 9 new sections added: common, onboarding, resumes, jobs, interview, visa, documents, settings |
| `app/onboarding/page.tsx` | ✅ All 4 steps translated |
| `dashboard/resumes/page.tsx` | ✅ |
| `dashboard/resumes/[id]/page.tsx` | ✅ Including AI analysis card |
| `dashboard/jobs/page.tsx` | ✅ |
| `dashboard/jobs/[id]/page.tsx` | ✅ Including match score panel |
| `dashboard/jobs/translate/page.tsx` | ✅ |
| `dashboard/jobs/applications/page.tsx` | ✅ Kanban columns + cards |
| `dashboard/interview/page.tsx` | ✅ |
| `dashboard/interview/new/page.tsx` | ✅ |
| `dashboard/interview/[id]/page.tsx` | ✅ Chat UI, eval cards, summary |
| `dashboard/visa/page.tsx` | ✅ Including checklist accordion |
| `dashboard/visa/[id]/page.tsx` | ✅ |
| `dashboard/documents/page.tsx` | ✅ Including status badges |
| `dashboard/settings/page.tsx` | ✅ Including translated delete-confirm phrase |

### Backend Bugs Fixed (Sessions 1 & 2) — DO NOT Reintroduce

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Resume analysis `AttributeError` on cloudflare_r2_endpoint_url | Field missing from Pydantic Settings | Added `cloudflare_r2_endpoint_url: str = ""` to `config.py` |
| Resume analysis JSON truncation | max_tokens=1500 too low; unclosed fence parser failure | Raised to 8192; improved response_parser.py |
| Visa guidance crash (`ai_client.complete()`) | Non-existent method called | Rewrote visa.py to use `ai_client.generate()` |
| Visa malformed JSON | Gemini plain text mode with unescaped Indonesian chars | Added `json_mode=True` (response_mime_type="application/json") |
| Interview fake streaming | Blocking `generate_content()` called instead of streaming | Replaced with `_client.aio.models.generate_content_stream()` |
| boto3 hitting AWS S3 instead of Backblaze B2 | Missing `endpoint_url` in jobs.py, document_generator.py | Added conditional `s3_kwargs["endpoint_url"]` everywhere |
| Wrong model name in usage logs | `anthropic_default_model` (doesn't exist) in record() calls | Changed all to `gemini_default_model` |
| `_MATCH_MAX_TOKENS` / `_EVAL_MAX_TOKENS` too low (800) | JSON response truncated | Raised to 2048 |
| TrustedHostMiddleware blocking all Vercel→Render requests | Host header mismatch | Removed entirely from main.py |
| Clerk JWT missing email claim | DB CHECK constraint on users.email failed | Added `{"email": "{{user.primary_email_address}}"}` to Clerk session token |
| Chat widget CORS error | Hardcoded localhost:8000 in chat-widget.tsx | Changed to /api/v1/chat/message |
| ERR_CONTENT_DECODING_FAILED | Proxy re-forwarding gzip headers after body decoded | Proxy now strips content-encoding, content-length, transfer-encoding |

---

## 7. Features In Progress / Pending

| Item | Priority | Notes |
|------|----------|-------|
| Smoke test document generation | High | boto3 fix deployed but PDF not verified end-to-end. If stuck on "processing", WeasyPrint Noto CJK fonts likely missing on Render — see Section 12. |
| Smoke test interview streaming | High | Async streaming fix deployed but not tested in browser. Should see typewriter effect. |
| Render cold start prevention | Medium | Free tier spins down after 15min. Set up cron-job.org ping every 10min to /health. |
| culture page translation | Low | `dashboard/culture/page.tsx` and `culture/[slug]/page.tsx` not yet translated. Follow i18n pattern. |
| documents/[id] page translation | Low | `dashboard/documents/[id]/page.tsx` not yet translated. |
| documents/rirekisho/new + shokumu/new translation | Low | Two wizard pages not yet translated. |
| GitHub CI | Low | Failing — non-blocking for Render deployment |
| Connect Vercel to GitHub | Low | Currently requires manual `vercel --prod` |

---

## 8. Known Bugs and Issues

### Active

| Issue | Severity | Notes |
|-------|----------|-------|
| Render cold start | Medium | Free tier sleeps after 15min idle. ~50s first request. Fix: cron-job.org ping /health every 10min. |
| PDF generation not smoke-tested | Medium | WeasyPrint may need Noto CJK fonts on Render. See Section 12. |
| GitHub CI failing | Low | Non-blocking. Likely missing env vars in CI config. |
| BackgroundTask lost on cold start | Low | If Render sleeps mid-analysis/generation, task is killed. Document stays "pending" forever. User must retry. |
| Gemini 5 RPM limit | Low | Free tier has only 5 RPM. Concurrent AI requests will rate-limit. |
| 3 remaining untranslated pages | Low | culture/page.tsx, culture/[slug]/page.tsx, documents/[id]/page.tsx, documents/rirekisho/new, documents/shokumu/new |

### Fixed — DO NOT Reintroduce

See Section 6 table above. Key ones to never undo:
- TrustedHostMiddleware removal from main.py
- `{"email": "{{user.primary_email_address}}"}` in Clerk session token
- `endpoint_url` in every boto3.client() call
- `json_mode=True` on all JSON-returning AI calls
- `gemini_default_model` (not `anthropic_default_model`) in all usage_tracker.record() calls

---

## 9. Important Design Decisions

| Decision | Rule |
|----------|------|
| Auth | Clerk JWTs only. Backend validates via JWKS. No passwords. |
| Email in JWT | Clerk session token MUST include `{"email": "{{user.primary_email_address}}"}` |
| User creation | JIT in middleware. Returns None → 401 if email missing. |
| API proxy | All requests via `app/api/[...path]/route.ts`. Proxy buffers all non-SSE responses. |
| No TrustedHostMiddleware | Removed — blocked Vercel proxy. CORS handles security. |
| Ownership | Every query: `WHERE user_id = $1`. Returns None → 404. Never 403. |
| Streaming | SSE (FastAPI StreamingResponse). Proxy does NOT buffer SSE. |
| Background tasks | FastAPI BackgroundTasks (not Celery). Direct function calls. |
| Job input | No scraper. URL paste + raw text only. |
| Session lifecycle | `get_db()` owns commit/rollback. Repositories call `flush()` only. |
| Billing | `check_budget()` is a no-op. Billing router excluded. All free. |
| Storage | Backblaze B2 via S3-compatible API. `CLOUDFLARE_R2_ENDPOINT_URL` env var holds B2 endpoint. ALL boto3 clients MUST include `endpoint_url`. |
| Gemini JSON mode | All structured JSON calls MUST use `json_mode=True`. |
| AI max_tokens | Resume analysis: 8192. Visa: 4096. Match/eval: 2048. Never below 2048 for JSON. |
| i18n pattern | `useLang()` hook from `lib/language-context.tsx`. `t("section", "key", lang)` from `lib/i18n.ts`. `LanguageProvider` wraps the entire app in `lib/providers.tsx` — so `useLang()` works everywhere including onboarding. |

### i18n Pattern for New Pages

```tsx
// 1. Import at top of file
import { useLang } from "@/lib/language-context";
import { t } from "@/lib/i18n";

// 2. In component
const { lang } = useLang();

// 3. Use translations
<h1>{t("section", "key", lang)}</h1>

// 4. Add keys to frontend/lib/i18n.ts under the appropriate section
```

### i18n Translation Sections in i18n.ts

| Section | Used for |
|---------|---------|
| `nav` | Sidebar nav labels |
| `landing` | Landing page |
| `features` | Feature descriptions on landing |
| `common` | Shared: Back, Save, Cancel, Delete, View, etc. |
| `onboarding` | 4-step wizard |
| `resumes` | Resumes list + detail + analysis |
| `jobs` | Jobs list, detail, translate, applications |
| `interview` | Sessions list, new session, live chat |
| `visa` | Visa roadmap + detail |
| `documents` | Documents list |
| `settings` | Profile form + danger zone |
| `dashboard` | Legacy (kept for backward compat) |

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

Session token: Clerk Dashboard → Configure → Sessions → Customize session token:
```json
{ "email": "{{user.primary_email_address}}" }
```

Webhook endpoint: `https://ai-job-support-api.onrender.com/api/v1/auth/webhook`  
Events: user.created, user.updated, user.deleted

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
- `CLOUDFLARE_R2_ENDPOINT_URL` = Backblaze B2 endpoint (var name reused for compat)
- `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` no longer needed

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
# (NOT connected to GitHub — git push does NOT trigger Vercel)
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

### 1. Smoke test document generation (high priority)

Go to https://ai-job-support.vercel.app/dashboard/documents, click "+ 履歴書", complete the wizard, and wait. Status should go: pending → processing → completed. PDF should download.

**If it stays on "processing"**, WeasyPrint CJK fonts are missing on Render. Fix:

Create `backend/build.sh`:
```bash
#!/bin/bash
set -e
pip install -r requirements.txt
apt-get install -y fonts-noto-cjk 2>/dev/null || true
```
In Render → Service Settings → Build Command: `bash build.sh`

### 2. Smoke test interview streaming (high priority)

Start a new interview at https://ai-job-support.vercel.app/dashboard/interview/new  
The AI's response should stream token-by-token (typewriter effect).  
If it appears all at once, SSE buffering is happening somewhere — check the Next.js proxy.

### 3. Translate remaining pages (medium priority)

5 pages still hardcoded English. Follow the i18n pattern in Section 9:

| Page | File |
|------|------|
| Culture list | `dashboard/culture/page.tsx` |
| Culture article | `dashboard/culture/[slug]/page.tsx` |
| Document detail | `dashboard/documents/[id]/page.tsx` |
| Rirekisho wizard | `dashboard/documents/rirekisho/new/page.tsx` |
| Shokumu wizard | `dashboard/documents/shokumu/new/page.tsx` |

Add translation keys to `frontend/lib/i18n.ts` under `documents` or a new `culture` section, then wire `useLang()` and `t()` in each file.

### 4. Prevent Render cold starts (medium priority)

Sign up at cron-job.org (free):
- URL: `https://ai-job-support-api.onrender.com/health`
- Schedule: every 10 minutes

### 5. Connect Vercel to GitHub (optional)

Vercel Dashboard → ai-job-support → Settings → Git → Connect GitHub repo  
Then `git push` will auto-deploy frontend (no more manual `vercel --prod`).

### 6. Fix GitHub CI (low priority, non-blocking)

Check `.github/workflows/ci.yml` for missing secrets. Add them in GitHub → Settings → Secrets → Actions.

### 7. Minor fixes (lowest priority)

- Replace deprecated `afterSignInUrl` with `fallbackRedirectUrl` in ClerkProvider
- Add `public/favicon.ico` (currently 404)
- Add `ai-job-support.vercel.app` to Clerk → Domains

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

1. `backend/app/api/v1/router.py` — uncomment billing import and `router.include_router(billing.router)`
2. `backend/app/services/ai/usage_tracker.py` — restore tier check in `check_budget()`
3. `frontend/app/dashboard/layout.tsx` — add Billing to NAV_ITEMS
4. Set env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_BASIC`, `STRIPE_PRICE_ID_PRO` on Render and Vercel
