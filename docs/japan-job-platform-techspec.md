# Japan Job Support Platform — Technical Specification
**Version:** 1.2  
**Date:** June 2026  
**Architect:** Senior Software Architect Review  
**Target Market:** Indonesian nationals seeking employment in Japan  
**Status:** All features implemented. Platform is fully free — billing infrastructure exists but is intentionally disabled.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Database Schema](#3-database-schema)
4. [REST API Endpoints](#4-rest-api-endpoints)
5. [AI Prompt Design](#5-ai-prompt-design)
6. [Project Folder Structure](#6-project-folder-structure)
7. [MVP Roadmap](#7-mvp-roadmap)
8. [Security Considerations](#8-security-considerations)
9. [Implementation Guide](#9-implementation-guide)

---

## 1. Executive Summary

This platform serves as an end-to-end career enablement tool for Indonesian job-seekers targeting the Japanese market. It bridges language, cultural, and bureaucratic gaps by combining AI-powered document generation, real-time translation, interview simulation, and visa guidance into a single product.

**Core Value Propositions:**
- Reduces time-to-apply from weeks to hours via AI-generated Japanese resumes
- Eliminates language barriers with contextual job posting translation
- Builds confidence through AI-powered mock interviews in Japanese context
- Reduces visa confusion with step-by-step, personalized guidance

**Monetisation:** Currently fully free. Stripe billing infrastructure is implemented but disabled. See Appendix for tier design and re-enablement instructions.

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                         │
│         Next.js 15 (Vercel) + TypeScript + Tailwind      │
│   [Web Browser]        [Mobile Browser]                  │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTPS / REST
┌────────────────────────▼─────────────────────────────────┐
│                    API GATEWAY LAYER                      │
│              FastAPI (Render)                    │
│         [Auth Middleware] [Rate Limiter] [CORS]           │
└──────┬──────────────────┬──────────────────┬─────────────┘
       │                  │                  │
┌──────▼──────┐  ┌────────▼──────┐  ┌───────▼─────────┐
│  Business   │  │  AI Service   │  │  File Service   │
│  Services   │  │ (Gemini API)  │  │  (S3/R2 + CDN)  │
└──────┬──────┘  └───────────────┘  └─────────────────┘
       │
┌──────▼──────────────────────────────────────────────┐
│                  DATA LAYER                          │
│   PostgreSQL (primary)   │   Redis (cache/sessions) │
└──────────────────────────────────────────────────────┘
```

### 2.2 Component Breakdown

| Component | Technology | Responsibility |
|-----------|-----------|---------------|
| Frontend | Next.js 15, TypeScript, Tailwind | UI, SSR, routing |
| API Server | FastAPI, Python 3.12 | Business logic, orchestration |
| AI Engine | Google Gemini API (gemini-2.5-flash) | All AI features |
| Database | PostgreSQL 16 (Neon) | Persistent storage |
| Cache | Redis 7 (Upstash) | Rate limiting |
| File Storage | Backblaze B2 (S3-compatible API) | Resume uploads, generated PDFs |
| Auth | Clerk | Authentication, session management |
| Background Tasks | FastAPI BackgroundTasks | Async resume analysis + document generation |
| Email | Resend | Transactional emails |

### 2.3 Architecture Decisions & Rationale

**Why Clerk over custom JWT?**  
Clerk handles MFA, social login, session management, and user metadata out-of-the-box. For an MVP targeting a non-English-speaking audience, reducing auth bugs is critical. Clerk's webhook system also simplifies user lifecycle events (onboarding emails, profile completion reminders).

**Why FastAPI BackgroundTasks for document generation?**  
Generating a full 職務経歴書 via Gemini can take 10–25 seconds. Blocking HTTP requests for this duration creates poor UX and risks timeouts. FastAPI BackgroundTasks handle these asynchronously in-process — no separate Celery worker or Redis broker needed. The client polls a status endpoint for completion and then downloads the PDF via a presigned URL.

**Why PostgreSQL over NoSQL?**  
Resume data, job matches, and user profiles have relational dependencies. PostgreSQL's JSONB columns give flexibility for unstructured AI outputs while maintaining relational integrity for core entities.

---

## 3. Database Schema

> **Source of truth:** [`database/schema.sql`](../database/schema.sql)  
> All DDL, indexes, triggers, ENUMs, views, RLS policies, seed data, and maintenance notes live there.  
> Do not duplicate table definitions in this document — the schema file is versioned alongside the codebase.

### 3.1 Entity Relationship Overview

```
users ──< profiles ──< resumes ──< resume_analyses
  │                         │
  │                         └── (job_posting_id → job_postings, SET NULL on delete)
  │
  ├──< generated_documents
  ├──< job_matches ──> job_postings
  ├──< saved_jobs ──> job_postings
  ├──< job_applications ──> job_postings
  ├──< interview_sessions ──< interview_messages
  ├──< visa_consultations
  ├──< subscriptions
  ├──< billing_events
  └──< notification_log

job_postings (shared, soft-deleted via deleted_at)

culture_topics          (static content, seeded)
culture_glossary        (static content, seeded)
subscription_limits     (seed reference table)
ai_usage_logs           (partitioned by month)
```

### 3.2 Key Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| ENUMs vs VARCHAR | ENUMs for all domain values | Enforce valid states at DB layer; easier to audit |
| `job_postings` deletes | Soft-delete (`deleted_at`) | `resume_analyses.job_posting_id` uses `SET NULL`; soft-delete lets UI show "job no longer available" |
| `cover_letter` document type | **Deferred post-MVP** | No prompt design or API endpoint yet. Re-add with `ALTER TYPE document_type ADD VALUE 'cover_letter'` when ready |
| `onboarding_completed` | Computed column from `onboarding_step = 4` | Single source of truth; step tracking enables funnel analytics and resume-where-you-left-off UX |
| `subscriptions` write path | Stripe webhooks only | Prevents divergence between Stripe and local state; subscribe endpoint creates Checkout Session only |
| Full-text search | `to_tsvector('simple', ...)` | No built-in Indonesian dictionary in PostgreSQL; `simple` correctly lowercases + strips accents |
| `ai_usage_logs` | Partitioned by month; pre-created through 2027-12 | pg_cron automation is optional (production-only); local dev uses pre-created partitions only |

### 3.3 Streaming Protocol Decision

**Interview practice uses SSE (Server-Sent Events).**

Rationale: SSE runs over plain HTTP/1.1, works on Vercel and Render without WebSocket configuration, and Gemini's API maps naturally to a unidirectional server→client stream. The user sends one message via `POST /interviews/sessions/{id}/message`; the response streams via SSE.

- **Backend:** FastAPI `StreamingResponse` with `media_type='text/event-stream'`
- **Frontend:** `@microsoft/fetch-event-source` library (supports POST requests and `Authorization` headers, unlike the native `EventSource` API)

---

## 4. REST API Endpoints

**Base URL:** `https://ai-job-support-api.onrender.com/api/v1`  
**Auth:** Bearer token (Clerk JWT) in `Authorization` header  
**Content-Type:** `application/json` (except file uploads: `multipart/form-data`)

### 4.1 Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/webhook` | Clerk webhook for user lifecycle events |
| GET | `/auth/me` | Get current user profile |
| PUT | `/auth/me` | Update user profile |

### 4.2 Resume Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/resumes/upload` | Upload resume file (PDF/DOCX) |
| GET | `/resumes` | List user's resumes |
| GET | `/resumes/{id}` | Get resume details + parsed content |
| DELETE | `/resumes/{id}` | Delete resume |
| POST | `/resumes/{id}/analyze` | Trigger AI analysis of resume |
| GET | `/resumes/{id}/analysis` | Get analysis results |

**POST /resumes/upload** — Request:
```json
// multipart/form-data
{ "file": <binary>, "language": "id", "set_primary": true }
```
Response:
```json
{
  "resume_id": "uuid",
  "status": "processing",
  "parsed_content": { "name": "...", "experience": [], "skills": [] }
}
```

### 4.3 Document Generation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/documents/rirekisho` | Generate 履歴書 from resume |
| POST | `/documents/shokumu` | Generate 職務経歴書 from resume |
| GET | `/documents` | List generated documents |
| GET | `/documents/{id}` | Get document + status |
| GET | `/documents/{id}/download` | Download PDF |

**POST /documents/rirekisho** — Request:
```json
{
  "resume_id": "uuid",
  "job_posting_id": "uuid",  // optional, for tailored generation
  "target_role": "ソフトウェアエンジニア",
  "preferences": {
    "formality_level": "high",
    "include_photo_placeholder": true
  }
}
```
Response:
```json
{
  "document_id": "uuid",
  "status": "processing",
  "estimated_seconds": 20
}
```

### 4.4 Job Posting Translation & Application Tracker

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/jobs/translate` | Submit job URL or raw text for translation. Cache hit on `source_url` returns the existing posting without calling Gemini. |
| GET | `/jobs` | List active (non-deleted) postings. Supports `?q=` full-text search and `?min_score=` friendliness filter. |
| GET | `/jobs/{id}` | Get full translated job posting detail |
| DELETE | `/jobs/{id}` | Soft-delete a posting (submitter only) |
| POST | `/jobs/{id}/match` | Score a resume against this posting via Gemini. Upserts — calling again refreshes the score. |
| POST | `/jobs/applications` | Add a job to the application tracker at `planning` status. Idempotent — returns the existing row if one is already tracked for this job. |
| GET | `/jobs/applications` | List the current user's tracked applications (Kanban board). Supports `?status=` filter. |
| PATCH | `/jobs/applications/{id}` | Update an application's `status` and/or `notes` |
| DELETE | `/jobs/applications/{id}` | Remove a job from the application tracker |

There is no "saved jobs" feature — every posting a user has translated is listed via `GET /jobs`; tracking interest/progress happens through the application tracker above.

⚠️ **Route order matters**: `/jobs/applications` and `/jobs/applications/{id}` must be registered *before* `/jobs/{job_id}` in `jobs.py`. FastAPI/Starlette matches routes by registration order, not specificity — `/{job_id}` is a single dynamic path segment that will otherwise swallow literal `/applications` requests first (`job_id="applications"` fails UUID parsing → 422). This was a real, previously-shipped bug; see `HANDOFF.md` Section 0/8.

**POST /jobs/translate** — Request:
```json
{
  "source_url": "https://job.example.co.jp/12345",  // optional
  "raw_text": "..."   // required, min 50 chars — the pasted posting text
}
```

**POST /jobs/{id}/match** — Request:
```json
{
  "resume_id": "uuid"
}
```
Response (`MatchScoreResponse`):
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "resume_id": "uuid",
  "job_posting_id": "uuid",
  "match_score": 82.5,
  "match_breakdown": { "skills_match": 80, "experience_match": 85, "language_match": 80, "culture_fit": 85, "summary": "..." },
  "recommendations": { "strengths": ["..."], "gaps": ["..."], "actions": ["..."] },
  "created_at": "2026-07-09T12:00:00Z"
}
```

**POST /jobs/applications** — Request:
```json
{
  "job_posting_id": "uuid",
  "notes": "Applied via referral"   // optional
}
```

**PATCH /jobs/applications/{id}** — Request (both fields optional):
```json
{
  "status": "applied",   // planning | applied | interviewing | offered | rejected | withdrawn
  "notes": "Phone screen scheduled for next week"
}
```

### 4.5 Interview Practice

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/interviews/sessions` | Start new interview session |
| GET | `/interviews/sessions` | List past sessions |
| GET | `/interviews/sessions/{id}` | Get session details |
| POST | `/interviews/sessions/{id}/message` | Send user answer, get AI response |
| POST | `/interviews/sessions/{id}/end` | End session, trigger feedback |
| GET | `/interviews/sessions/{id}/feedback` | Get session feedback report |

**POST /interviews/sessions** — Request:
```json
{
  "session_type": "behavioral",
  "target_role": "営業職",
  "target_company": "Toyota",
  "language": "ja",
  "difficulty": "intermediate",
  "focus_areas": ["自己PR", "志望動機", "teamwork"]
}
```

**POST /interviews/sessions/{id}/message** — Request:
```json
{
  "content": "はじめまして。私はインドネシア出身の...",
  "language": "ja"
}
```
Response:
```json
{
  "message_id": "uuid",
  "interviewer_response": "なるほど。では、あなたの強みを教えていただけますか？",
  "evaluation": {
    "keigo_score": 72,
    "content_score": 85,
    "grammar_notes": "「〜です」→「〜でございます」がより丁寧です",
    "encouragement": "Good use of specific examples!"
  }
}
```

### 4.6 Visa Guidance

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/visa/consult` | Generate personalized visa guidance |
| GET | `/visa/consult/{id}` | Get visa consultation |
| GET | `/visa/types` | List visa types with descriptions |
| PUT | `/visa/consult/{id}/checklist` | Update checklist item status |

### 4.7 Culture & Learning

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/culture/topics` | List workplace culture topics |
| GET | `/culture/topics/{slug}` | Get topic content |
| GET | `/culture/glossary` | Japanese workplace terms glossary |

### 4.8 Account & Billing

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/auth/me` | User | Current user profile |
| PUT | `/auth/me` | User | Update profile / advance onboarding step |
| POST | `/auth/consent` | User | Record AI processing consent (onboarding step 1) |
| DELETE | `/account` | User | Full account deletion (Stripe cancel → DB cascade → Clerk delete) |

**Billing endpoints** (implemented, currently disabled — router excluded):

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/billing/checkout` | Create Stripe Checkout session |
| POST | `/billing/portal` | Create Stripe Customer Portal session |
| POST | `/billing/webhook` | Stripe webhook handler (sole write path to subscriptions) |
| GET | `/billing/subscription` | Current subscription status |
| GET | `/billing/events` | Billing event history |

### 4.9 AI Chatbot (Public)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/chat/message` | None | Send message to Japan career AI chatbot |

Request:
```json
{
  "message": "How do I get a work visa?",
  "history": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}],
  "language": "id"
}
```
Response:
```json
{ "reply": "..." }
```

### 4.10 Admin (Admin role required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/stats` | Platform-wide counts (users, resumes, documents, topics) |
| GET | `/admin/users` | Paginated user list |
| PATCH | `/admin/users/{id}/role` | Promote or demote user role |
| GET | `/admin/culture/topics` | All topics including unpublished |
| POST | `/admin/culture/topics` | Create culture topic |
| PATCH | `/admin/culture/topics/{slug}` | Update topic |
| DELETE | `/admin/culture/topics/{slug}` | Delete topic |
| GET | `/admin/culture/glossary` | All glossary entries |
| POST | `/admin/culture/glossary` | Create glossary entry |
| DELETE | `/admin/culture/glossary/{id}` | Delete glossary entry |

---

## 5. AI Prompt Design

All prompts follow a shared structure:
1. **System prompt** — Establishes persona, constraints, output format
2. **Context injection** — User profile, resume data, job details
3. **Task instruction** — Specific feature request
4. **Output schema** — JSON structure or markdown format

### 5.1 Resume Analysis

**System Prompt:**
```
You are an expert Japanese HR consultant and career advisor specializing in 
helping Indonesian professionals enter the Japanese job market. 

Analyze the resume with these lenses:
- Japanese market compatibility (education format, work history presentation)
- Skills gap for Japanese employers
- Language proficiency alignment
- Cultural fit indicators

Always respond in JSON matching the provided schema. Do not include commentary 
outside the JSON structure.
```

**User Prompt Template:**
```
Analyze this resume for the Japanese job market.

User Profile:
- Japanese Level: {japanese_level}
- Target Industry: {target_industry}
- Years of Experience: {years_experience}

Resume Content:
{parsed_resume_text}

Return JSON with this structure:
{
  "overall_score": 0-100,
  "strengths": ["...", "..."],
  "gaps": ["...", "..."],
  "japan_market_readiness": {
    "score": 0-100,
    "notes": "..."
  },
  "priority_improvements": [
    {"area": "...", "suggestion": "...", "impact": "high|medium|low"}
  ],
  "recommended_visa_types": ["..."]
}
```

### 5.2 履歴書 (Rirekisho) Generation

**System Prompt:**
```
You are a Japanese resume specialist who creates precise, culturally appropriate 
履歴書 documents for foreign nationals. 

Rules:
- Follow standard 履歴書 format exactly (JIS standard)
- Use formal Japanese (です/ます調, keigo where appropriate)
- Convert foreign education and job titles to Japanese equivalents
- Calculate ages and dates in Japanese format (Western calendar is acceptable)
- 志望動機 should be 3-5 sentences, specific to the target role
- 自己PR should highlight collaboration and adaptability — values prized in Japan
- Flag any fields the user must fill manually (photo, personal seal)

Output structured JSON that maps to 履歴書 fields.
```

**User Prompt Template:**
```
Create a 履歴書 for this candidate.

Candidate Information (from parsed resume):
{structured_resume_json}

Target Job:
- Role: {target_role}
- Company: {target_company}
- Industry: {industry}
- Key Requirements: {job_requirements}

Generate the 履歴書 with all standard fields. For 志望動機 and 自己PR, 
tailor the content specifically to this role and company culture.

Return JSON:
{
  "personal_info": { "name_kanji": "", "name_kana": "", "dob": "", "age": "", "gender": "", "address": "", "phone": "", "email": "" },
  "education": [{"date": "", "institution": "", "degree": "", "notes": ""}],
  "work_history": [{"start_date": "", "end_date": "", "company": "", "role": "", "reason_for_leaving": ""}],
  "skills_licenses": [{"date": "", "item": ""}],
  "shibo_doki": "志望動機テキスト",
  "jiko_pr": "自己PRテキスト",
  "commute_time": "",
  "dependents": "",
  "spouse": "",
  "manual_fields_required": ["photo", "personal_seal", "...]
}
```

### 5.3 職務経歴書 (Shokumu Keirekisho) Generation

**System Prompt:**
```
You are a senior Japanese HR consultant specializing in 職務経歴書 for 
mid-career and foreign professionals. 

The 職務経歴書 is NOT a translation of a resume — it is a detailed, 
achievement-oriented career narrative written for Japanese hiring managers.

Key principles:
- Lead with a compelling career summary (職務要約) of 3-5 sentences
- Use the STAR method implicitly for achievements (Situation→Action→Result)
- Quantify achievements wherever possible (%, ¥, headcount, timeframes)
- Use bullet points (•) for responsibilities, numbered items for achievements
- End with a strong 自己PR that connects past experience to future contribution
- Professional tone: polite but confident
- Length: 1-2 A4 pages maximum
```

**User Prompt Template:**
```
Create a professional 職務経歴書 for this candidate.

Resume Data:
{structured_resume_json}

Target Role: {target_role}
Target Company Type: {company_type}
Job Description Key Points: {job_key_points}

The candidate's Japanese level is {japanese_level}. 
If N3 or below, the document will be reviewed by the candidate — keep 
language natural but accessible.

Return JSON:
{
  "document_date": "",
  "personal_name": "",
  "shokumu_yoyaku": "職務要約テキスト",
  "career_history": [
    {
      "company": "",
      "period": "",
      "industry": "",
      "employee_count": "",
      "role": "",
      "responsibilities": ["..."],
      "achievements": ["数値を含む実績..."]
    }
  ],
  "skills": {
    "technical": ["..."],
    "language": ["..."],
    "certifications": ["..."]
  },
  "jiko_pr": "自己PRテキスト",
  "word_count": 0
}
```

### 5.4 Job Posting Translation

**System Prompt:**
```
You are a bilingual Japanese-Indonesian career specialist. Your task is to 
translate Japanese job postings into clear, natural Indonesian — not literal 
translations.

Important:
- Preserve all salary figures, dates, and requirements accurately
- Translate Japanese-specific concepts with brief explanations 
  (e.g., "試用期間" = "masa percobaan (probation period)")
- Flag any requirements that may affect visa eligibility
- Rate the job's "foreigner-friendliness" based on language requirements, 
  company size, and stated visa support

Return structured JSON — not plain text.
```

**User Prompt Template:**
```
Translate and analyze this Japanese job posting.

Raw Posting:
{job_posting_raw_text}

Source URL: {source_url}

Return JSON:
{
  "title_translated": "",
  "company_name": "",
  "summary": "2-3 sentence summary in Indonesian",
  "full_translation": "",
  "structured_details": {
    "salary": {"amount": "", "type": "monthly|annual", "currency": "JPY"},
    "location": "",
    "work_type": "full_time|part_time|contract",
    "remote_policy": "",
    "required_japanese_level": "",
    "visa_sponsorship": true|false|"unknown",
    "application_deadline": ""
  },
  "requirements": {
    "must_have": ["..."],
    "nice_to_have": ["..."],
    "deal_breakers_for_foreigners": ["..."]
  },
  "foreigner_friendliness_score": 0-100,
  "foreigner_friendliness_notes": "",
  "key_japanese_terms": [
    {"term": "試用期間", "reading": "shiyokikan", "meaning": "masa percobaan"}
  ]
}
```

### 5.5 Interview Practice

**System Prompt:**
```
You are Tanaka-san, an experienced Japanese hiring manager at a mid-size 
Japanese company. You are conducting a job interview in Japanese.

Conduct the interview naturally, as a real Japanese interviewer would:
- Start with self-introduction request (自己紹介をお願いします)
- Ask behavioral questions using Japanese interview conventions
- Use polite Japanese (丁寧語), occasionally using keigo
- React naturally to answers — probe for details, ask follow-ups
- Ask culture-specific questions: overtime attitude, team vs individual preference

After each candidate response, provide a JSON block with evaluation metrics.
Never break character during the conversation portion.

Format each response as:
INTERVIEWER: [your question/response in Japanese]
---EVAL---
[JSON evaluation of the candidate's previous answer]
```

**User Prompt Template (session init):**
```
Begin an interview session with these parameters:
- Interview Type: {session_type}
- Target Role: {target_role}
- Candidate Background: {candidate_summary}
- Difficulty: {difficulty}
- Focus Areas: {focus_areas}

Start the interview now. Greet the candidate and ask for their 自己紹介.
```

**Evaluation JSON Schema (per answer):**
```json
{
  "keigo_score": 0-100,
  "content_relevance": 0-100,
  "specificity_score": 0-100,
  "grammar_issues": ["..."],
  "positive_feedback": "...",
  "improvement_tip": "..."
}
```

### 5.6 Visa Guidance

**System Prompt:**
```
You are a licensed Japanese immigration consultant (行政書士) providing 
general guidance to Indonesian nationals. 

Important disclaimer: Always note that you provide general information only 
and recommend consulting a licensed 行政書士 or immigration lawyer for 
official advice.

Be practical and specific:
- Recommend the most suitable visa category based on the user's profile
- Provide a realistic step-by-step checklist
- Flag common rejection reasons
- Explain the Certificate of Eligibility (COE) process
- Note processing times accurately

Respond in Indonesian for accessibility.
```

**User Prompt Template:**
```
Provide visa guidance for this Indonesian national seeking work in Japan.

Profile:
- Age: {age}
- Education: {education_level} in {field_of_study}
- Years of Experience: {years_experience}
- Japanese Level: {japanese_level}
- Target Industry: {target_industry}
- Current Visa Status: {visa_status}
- Has Job Offer: {has_job_offer}

Generate a personalized visa roadmap.

Return JSON:
{
  "recommended_visa": {
    "type": "",
    "name_indonesian": "",
    "eligibility_match": "strong|moderate|weak",
    "reason": ""
  },
  "alternative_visas": [...],
  "checklist": [
    {
      "step": 1,
      "title": "",
      "description": "",
      "documents_required": ["..."],
      "estimated_time": "",
      "tips": ""
    }
  ],
  "common_rejection_reasons": ["..."],
  "estimated_total_time": "",
  "cost_estimate_jpy": 0,
  "disclaimer": "Informasi ini bersifat umum..."
}
```

### 5.7 Workplace Culture Guidance

**System Prompt:**
```
You are a cultural integration specialist helping Indonesian professionals 
adapt to Japanese workplace culture. You understand both Indonesian and 
Japanese professional norms deeply.

Compare and contrast clearly. Be specific with examples. 
Avoid generalizations — note regional and company-size variations.
Use a warm, mentor-like tone in Indonesian.
```

**User Prompt Template:**
```
Explain this Japanese workplace culture topic for an Indonesian professional:

Topic: {culture_topic}
User's Background: {user_background}
Target Industry: {target_industry}

Cover:
1. How this works in Japan
2. How it differs from Indonesia
3. Common mistakes Indonesians make
4. Practical tips for adaptation

Respond in Indonesian with Japanese terms annotated.
```

---

## 6. Project Folder Structure

### 6.1 Frontend (Next.js 15)

```
frontend/
├── app/
│   ├── (auth)/
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   ├── dashboard/
│   │   ├── layout.tsx                 # Sticky header + i18n nav + language switcher
│   │   ├── resumes/page.tsx
│   │   ├── resumes/[id]/page.tsx      # Resume detail + analysis
│   │   ├── documents/page.tsx
│   │   ├── documents/[id]/page.tsx    # Status poller + download
│   │   ├── documents/rirekisho/new/page.tsx
│   │   ├── documents/shokumu/new/page.tsx
│   │   ├── jobs/page.tsx
│   │   ├── jobs/translate/page.tsx
│   │   ├── jobs/[id]/page.tsx
│   │   ├── jobs/applications/page.tsx # Kanban tracker
│   │   ├── interview/page.tsx
│   │   ├── interview/new/page.tsx
│   │   ├── interview/[id]/page.tsx    # Live SSE interview
│   │   ├── visa/page.tsx
│   │   ├── visa/[id]/page.tsx
│   │   ├── culture/page.tsx
│   │   ├── culture/[slug]/page.tsx
│   │   ├── billing/page.tsx           # Dormant — not linked in nav
│   │   └── settings/page.tsx
│   ├── api/                           # Next.js API routes (proxy layer)
│   │   └── [...path]/route.ts
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── ui/                            # Shadcn/ui base components
│   ├── resume/
│   │   ├── ResumeUploader.tsx
│   │   ├── ResumeCard.tsx
│   │   └── AnalysisReport.tsx
│   ├── documents/
│   │   ├── DocumentGenerator.tsx
│   │   ├── RirekishoPreview.tsx
│   │   └── ShokumuPreview.tsx
│   ├── interview/
│   │   ├── InterviewChat.tsx
│   │   ├── EvaluationCard.tsx
│   │   └── SessionSetup.tsx
│   ├── jobs/
│   │   ├── JobTranslator.tsx
│   │   └── MatchScoreCard.tsx
│   ├── language-switcher.tsx
│   ├── chat-widget.tsx                # Floating chatbot
│   └── shared/
├── hooks/
│   ├── useMe.ts
│   ├── useResumes.ts
│   ├── useDocuments.ts
│   ├── useJobs.ts
│   ├── useApplications.ts
│   ├── useInterview.ts
│   ├── useVisa.ts
│   ├── useCulture.ts
│   └── useBilling.ts                  # Dormant; exports useDeleteAccount
├── lib/
│   ├── api-client.ts                  # Typed fetch wrapper (all calls go via Next.js proxy)
│   ├── providers.tsx
│   ├── i18n.ts                        # EN/ID/JP strings
│   └── language-context.tsx
├── types/api.ts
└── middleware.ts                      # Clerk auth — protects /dashboard/* and /onboarding
```

### 6.2 Backend (FastAPI)

```
backend/
├── app/
│   ├── main.py                        # FastAPI app entry point
│   ├── config.py                      # Settings (Pydantic BaseSettings)
│   ├── database.py                    # SQLAlchemy async engine
│   ├── dependencies.py                # FastAPI dependencies (auth, db)
│   │
│   ├── api/
│   │   └── v1/
│   │       ├── router.py              # Aggregate all routers
│   │       ├── auth.py
│   │       ├── resumes.py
│   │       ├── documents.py
│   │       ├── jobs.py
│   │       ├── interviews.py
│   │       ├── visa.py
│   │       ├── culture.py
│   │       └── billing.py
│   │
│   ├── models/                        # SQLAlchemy ORM models
│   │   ├── user.py
│   │   ├── resume.py
│   │   ├── document.py
│   │   ├── job.py
│   │   ├── interview.py
│   │   └── visa.py
│   │
│   ├── schemas/                       # Pydantic request/response schemas
│   │   ├── resume.py
│   │   ├── document.py
│   │   ├── interview.py
│   │   └── job.py
│   │
│   ├── services/
│   │   ├── ai/
│   │   │   ├── client.py              # Gemini client wrapper
│   │   │   ├── prompts/
│   │   │   │   ├── resume_analysis.py
│   │   │   │   ├── rirekisho.py
│   │   │   │   ├── shokumu.py
│   │   │   │   ├── job_translation.py
│   │   │   │   ├── interview.py
│   │   │   │   └── visa.py
│   │   │   └── response_parser.py
│   │   ├── resume_parser.py           # PDF/DOCX text extraction
│   │   ├── document_generator.py      # PDF generation from AI output
│   │   ├── file_storage.py            # S3/R2 operations
│   │   └── usage_tracker.py           # Token counting, cost tracking
│   │
│   ├── workers/                       # BackgroundTask functions (Celery code exists but is not used)
│   │   ├── celery_app.py
│   │   ├── document_tasks.py
│   │   └── analysis_tasks.py
│   │
│   └── utils/
│       ├── japanese_date.py           # Date format conversion utils
│       ├── pdf_generator.py           # ReportLab / WeasyPrint
│       └── text_cleaner.py
│
├── migrations/                        # Alembic migrations
│   ├── env.py
│   └── versions/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── conftest.py
│
├── alembic.ini
├── requirements.txt
├── Dockerfile
└── docker-compose.yml
```

---

## 7. MVP Roadmap

> **Updated roadmap (v1.1) — 14 weeks.**  
> Phase 0 is complete. Phases 1–7 follow.

### Phase 0: Schema & Architecture Contracts (Week 1) ✅ COMPLETE
**Goal:** Single source of truth, all architectural decisions documented before any feature code is written.

| Task | Status |
|------|--------|
| Reconcile spec and schema — remove duplicate DDL, link to `schema.sql` | ✅ |
| Add `resumes.updated_at` column + trigger | ✅ |
| Add `job_postings.deleted_at` soft-delete + update indexes | ✅ |
| Extract `foreigner_friendliness_score` to dedicated column | ✅ |
| Fix full-text index to `to_tsvector('simple', ...)` | ✅ |
| Add `subscription_limits.monthly_token_budget` column | ✅ |
| Add `culture_topics` and `culture_glossary` tables | ✅ |
| Add `job_applications` table | ✅ |
| Add `subscriptions` and `billing_events` tables | ✅ |
| Add `notification_log` table | ✅ |
| Extend `ai_usage_logs` partitions to 2027-12 + pg_cron automation | ✅ |
| Remove `cover_letter` from `document_type` ENUM (deferred post-MVP) | ✅ |
| Replace `onboarding_completed BOOLEAN` with `onboarding_step SMALLINT` + computed column | ✅ |
| SSE selected for interview streaming — documented in spec and schema | ✅ |
| `resume_analyses.job_posting_id` FK added with `ON DELETE SET NULL` | ✅ |
| `v_active_subscriptions` view added | ✅ |

---

### Phase 1: Auth, Profile, Resume Upload (Weeks 2–3)
**Goal:** Working auth, file upload, and basic resume analysis

| Task | Owner | Effort |
|------|-------|--------|
| Project setup: Next.js + FastAPI + PostgreSQL | Both | 2d |
| Clerk auth integration (frontend + backend webhook) | Frontend | 2d |
| User profile + onboarding flow (step-tracked, resumable) | Frontend | 2d |
| Resume upload endpoint (S3 + MIME validation via python-magic) | Backend | 2d |
| PDF/DOCX text extraction service (pypdf2 + python-docx) | Backend | 2d |
| Resume analysis AI feature (Prompt 5.1, max_tokens=1500) | Backend | 2d |
| Analysis results UI | Frontend | 2d |
| Alembic baseline migration from schema.sql | Backend | 1d |

**Exit criterion:** User can sign up → complete onboarding → upload resume → receive analysis report. Resumable onboarding works if they drop off mid-flow.

---

### Phase 2: Core Documents (Weeks 4–6)
**Goal:** 履歴書 and 職務経歴書 generation working end-to-end

| Task | Owner | Effort |
|------|-------|--------|
| Japanese font spike — Noto Sans JP in Docker + CI PDF assertion | Backend | 1d |
| BackgroundTasks wiring (no Celery needed) | Backend | 0.5d |
| 履歴書 generation endpoint + prompt (max_tokens=2500) | Backend | 3d |
| 職務経歴書 generation endpoint + prompt (max_tokens=3000) | Backend | 3d |
| PDF generation (WeasyPrint + Noto Sans JP) | Backend | 2d |
| Document preview UI + `FeatureGate` component | Frontend | 3d |
| Document polling endpoint (`GET /documents/{id}`) | Both | 1d |
| Download + export flow | Frontend | 1d |

**Exit criterion:** Paid-tier user generates both document types and downloads a correctly rendered Japanese PDF. Free-tier user is gated after one generation.

---

### Phase 3: Job Tools (Weeks 7–8)
**Goal:** Job translation, match scoring, and application tracking

| Task | Owner | Effort |
|------|-------|--------|
| Job translation endpoint + prompt (URL paste + raw text; no scraper) | Backend | 2d |
| Translation results UI with foreigner-friendliness score | Frontend | 2d |
| Job-resume match scoring | Backend | 2d |
| `job_applications` CRUD (`PATCH /jobs/{id}/application`) | Both | 1d |
| Saved jobs feature | Both | 1d |
| Soft-delete wiring (`deleted_at` filter on all job_postings queries) | Backend | 1d |

**Exit criterion:** User can paste a Japanese job URL, get a translated breakdown with a match score, save it, and track application status through to offer/rejection.

---

### Phase 4: Interview Practice (Weeks 9–10)
**Goal:** Real-time interview simulation via SSE

| Task | Owner | Effort |
|------|-------|--------|
| SSE streaming interview endpoint (FastAPI StreamingResponse) | Backend | 3d |
| Interview chat UI with `@microsoft/fetch-event-source` | Frontend | 3d |
| Per-answer evaluation display (keigo score, grammar notes) | Frontend | 2d |
| Session end + feedback report + session history | Both | 2d |

**Exit criterion:** User can complete a full interview session with visible streaming responses and a feedback summary on completion.

---

### Phase 5: Visa, Culture, Content (Week 11)
**Goal:** Visa checklist tool and culture content browser live

| Task | Owner | Effort |
|------|-------|--------|
| Visa guidance endpoint (checklist-navigation framing, not AI 行政書士) | Backend | 2d |
| Visa checklist UI (interactive; step completion persists) | Frontend | 2d |
| Culture topics browser (reads from `culture_topics` table; 5 seeded topics) | Both | 2d |
| Culture glossary (reads from `culture_glossary`; 30+ seeded terms) | Both | 1d |

**Exit criterion:** All five culture topics and glossary render. Visa checklist step completion persists across sessions.

---

### Phase 6: Billing and Limits (Deferred — backup)
**Goal:** Stripe payments and usage enforcement

> ⏸️ **Deferred** — billing infrastructure is fully implemented but disabled. The platform is currently free. To re-enable, see HANDOFF.md Section 12.

| Task | Status |
|------|--------|
| Stripe Checkout + Customer Portal integration | ✅ Built, disabled |
| Stripe webhook handler → `subscriptions` + `billing_events` | ✅ Built, disabled |
| Pre-call usage enforcement via `v_user_monthly_usage` + `subscription_limits` | ✅ Built, no-op'd |
| Billing UI page | ✅ Built, not linked in nav |
| `DELETE /account` (Stripe cancel → DB cascade → Clerk delete) | ✅ Live |

**Exit criterion (when re-enabled):** Free-tier user is blocked at limits. Upgrading unblocks them. Account deletion removes all S3 files, DB records, and Clerk identity.

---

### Phase 7: Hardening and Beta Launch (Week 14)
**Goal:** Production-ready, zero critical errors under load

| Task | Owner | Effort | Status |
|------|-------|--------|--------|
| Re-enable Clerk auth middleware | Frontend | 0.5d | ✅ Done |
| Fix `alembic.ini` hardcoded DB URL | Backend | 0.5d | ✅ Done |
| Verify WeasyPrint + Noto fonts on server | Backend | 0.5d | ⬜ |
| Seed culture topics + glossary via admin panel | Both | 1d | ⬜ |
| Integration tests (DB-touching paths) | Backend | 2d | ⬜ |
| Load testing with Locust (100 concurrent users) | Backend | 1d | ⬜ |
| OWASP Top 10 checklist (prompt injection, IDOR, auth bypass) | Both | 1d | ⬜ |
| Sentry setup (frontend + backend) | Both | 1d | ⬜ |
| pg_cron partition job manual trigger + verification | Backend | 0.5d | ⬜ |
| End-to-end smoke test (all features) | Both | 1d | ⬜ |
| Deploy to Vercel + Render (production env vars, CORS) | Both | 1d | ✅ Done |

**Exit criterion:** Zero critical Sentry errors during 30-minute smoke test. p95 < 3s for non-AI endpoints, p95 < 30s for document generation at 50 concurrent users.

---

### Post-MVP (Month 4+)
- Mobile app (React Native — same API, no backend changes)
- Employer-side portal (anonymized talent profiles)
- Partner with Indonesian recruitment agencies
- JLPT prep integration
- Expand to Vietnamese/Filipino users (`preferred_language` ENUM extension)
- Replace pg_cron partition management with `pg_partman`
- `pgvector` semantic resume-to-job matching (embedding similarity)

---

## 8. Security Considerations

### 8.1 Authentication & Authorization

- **All API endpoints** require valid Clerk JWT — validated server-side on every request
- **Resource ownership** enforced at service layer: users can only access their own resumes, documents, and sessions
- **Webhook signature verification** for Clerk webhooks (SVIX signature)
- Never expose internal UUIDs in sequential patterns — use UUIDs exclusively

### 8.2 File Upload Security

- **File type validation:** Validate MIME type server-side (not just file extension); use `python-magic` for true type detection
- **File size limits:** 10MB per upload; enforce at both nginx and application level
- **Virus scanning:** Integrate ClamAV or use S3's built-in malware scanning before processing
- **Storage:** Files stored in private S3 buckets — generate time-limited presigned URLs (15-minute expiry) for downloads, never expose permanent public URLs
- **File naming:** Strip original filenames; store with UUID keys only

### 8.3 AI Prompt Security

- **Prompt injection defense:** Sanitize all user-provided content before inserting into prompts; wrap user content in explicit XML delimiters (`<user_content>...</user_content>`)
- **Output validation:** Parse and validate all AI JSON responses against Pydantic schemas before storing or returning to clients
- **PII in prompts:** Log prompts only in development; never log resume content in production
- **Token limits:** Set `max_tokens` per feature to prevent runaway costs

### 8.4 Data Privacy (GDPR/PDPA Considerations)

- **Data minimization:** Only extract and store resume fields necessary for features
- **Right to deletion:** Implement `/users/me/delete` that cascades deletes all personal data and S3 files
- **Data residency:** Consider AWS ap-northeast-1 (Tokyo) for data sovereignty
- **Consent:** Explicit consent checkbox for AI processing of personal data during onboarding
- **Encryption at rest:** Enable PostgreSQL and S3 encryption; use `pgcrypto` for sensitive fields if needed

### 8.5 API Security

- **Rate limiting:** Redis-backed rate limiting per user and per IP
  - Resume uploads: 5/hour per user
  - AI features: 20/hour on free tier
  - Job translations: 10/hour per user
- **Input validation:** All inputs validated via Pydantic schemas with strict field constraints
- **SQL injection:** Use SQLAlchemy ORM exclusively; no raw SQL string interpolation
- **CORS:** Restrict `allow_origins` to production frontend domain only
- **HTTPS only:** Enforce HTTPS via Vercel (frontend) and nginx (backend); HSTS headers

### 8.6 Secrets Management

- **Never commit secrets:** Use `.env` locally; Render/Vercel environment variables in production
- **API key rotation:** Gemini API key rotated quarterly; use Render's environment variable management
- **Database credentials:** Use IAM database authentication if on AWS RDS

### 8.7 Monitoring & Incident Response

- **Error tracking:** Sentry for both frontend and backend
- **API logging:** Structured logging (JSON) to Render logs — exclude PII fields
- **Cost monitoring:** Set Gemini API spend alerts at $50, $100, $200 thresholds in Google Cloud Console
- **Anomaly detection:** Alert on >10x normal AI usage per user (potential abuse)

---

## 9. Implementation Guide

### Step 1: Environment Setup (Day 1)

1. Create monorepo with two workspaces: `frontend/` and `backend/`
2. Initialize Next.js 15: `npx create-next-app@latest frontend --typescript --tailwind --app`
3. Initialize FastAPI: `pip install fastapi uvicorn sqlalchemy alembic google-genai psycopg2-binary python-multipart`
4. Set up PostgreSQL locally via Docker: `docker run -p 5432:5432 postgres:16`
5. Set up Redis locally: `docker run -p 6379:6379 redis:7`
6. Create Clerk application, configure JWT template
7. Create Google AI Studio account at aistudio.google.com, obtain GEMINI_API_KEY
8. Create S3 bucket with private ACL

### Step 2: Database & Auth Foundation (Days 2–4)

1. Write SQLAlchemy models for `users`, `profiles`, `resumes`
2. Run initial Alembic migration
3. Implement Clerk webhook endpoint (`/auth/webhook`)
4. Implement JWT validation middleware in FastAPI
5. Set up Clerk frontend provider in `app/layout.tsx`
6. Build onboarding profile form

### Step 3: Resume Pipeline (Days 5–8)

1. Build file upload endpoint with S3 integration
2. Implement PDF/DOCX text extraction (`pypdf2` + `python-docx`)
3. Write resume parsing prompt and service
4. Build `ResumeUploader` component with drag-and-drop
5. Build analysis results display page

### Step 4: Document Generation (Days 9–14)

1. Wire 履歴書 generation as FastAPI BackgroundTask (no Celery needed)
3. Implement 職務経歴書 generation task (async)
4. Set up PDF generation with WeasyPrint (Japanese font support: Noto Sans JP)
5. Implement polling endpoint for job status
6. Build document preview UI with loading states

### Step 5: Job Translation (Days 15–18)

1. Build URL paste + raw text paste input (no scraper — see Section 3.3 for rationale)
2. Implement translation prompt + endpoint
3. Build job translation UI with foreigner-friendliness score display
4. Wire `job_applications` status tracking (`PATCH /jobs/{id}/application`)

### Step 6: Interview Practice (Days 19–24)

1. Implement SSE streaming interview endpoint (FastAPI `StreamingResponse`, `media_type='text/event-stream'`)
2. Build chat UI with `@microsoft/fetch-event-source` (supports POST + Authorization header)
3. Implement per-message evaluation display
4. Build session summary + feedback report

### Step 7: Visa & Culture (Days 25–28)

1. Implement visa guidance endpoint
2. Build interactive visa checklist UI
3. Write and publish initial 5 culture content pieces
4. Build culture topic browser

### Step 8: Subscription & Limits (Deferred)

> Billing infrastructure is fully built and can be re-enabled. See HANDOFF.md Section 12 for re-enablement steps. Currently all usage is unlimited and free.

### Step 9: Pre-launch (Days 33–35)

1. Load testing with Locust (simulate 100 concurrent users)
2. Security audit: OWASP Top 10 checklist
3. Set up Sentry error tracking
4. Configure production environment variables
5. Deploy frontend to Vercel, backend to Render
6. Smoke test all 8 features end-to-end

---

## Appendix A: Subscription Tier Design (Deferred)

> Billing is currently disabled. All features are free. The tier structure below is the planned design for when billing is re-enabled.

| Feature | Free | Basic (¥1,980/mo) | Pro (¥4,980/mo) |
|---------|------|--------------------|-----------------|
| Resume uploads/mo | 1 | 5 | Unlimited |
| Resume analyses/mo | 1 | 10 | Unlimited |
| 履歴書 generation/mo | 1 | 5 | Unlimited |
| 職務経歴書 generation/mo | 0 | 3 | Unlimited |
| Job translations/mo | 3 | 30 | Unlimited |
| Interview sessions/mo | 1 | 5 | Unlimited |
| Token budget/mo | 50,000 | 500,000 | Unlimited |
| Visa guidance | Basic | Full | Full + Priority |
| PDF export | ✗ | ✓ | ✓ |
| Culture content | Limited | Full | Full |

To re-enable: see HANDOFF.md Section 12.

---

## Appendix B: Implementation Status (June 2026)

| Phase | Status |
|-------|--------|
| Phase 0 — Schema & Architecture | ✅ Complete |
| Phase 1 — Auth + Resume | ✅ Complete |
| Phase 2 — Document Generation | ✅ Complete |
| Phase 3 — Job Translation + Applications | ✅ Complete |
| Phase 4 — Interview Practice (SSE) | ✅ Complete |
| Phase 5 — Visa + Culture | ✅ Complete |
| Phase 6 — Billing | ⏸️ Built, disabled |
| Phase 7 — Hardening + Launch | ⬜ Not started |

---

*This specification is a living document. Version it in Git alongside the codebase.*  
*Last updated: June 2026 (v1.2)*
