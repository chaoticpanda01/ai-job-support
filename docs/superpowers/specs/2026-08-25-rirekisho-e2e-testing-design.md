# Rirekisho Generation E2E Test — Design

## Context

This session fixed two real bugs in rirekisho (履歴書) PDF generation — the empty-photo placeholder overflow, and the photo-present layout overlap — plus applied a navy-accent visual polish pass. Both bugs were caught by rendering `_render_rirekisho()` directly and geometrically inspecting the output PDF; the resulting unit tests in `backend/tests/unit/test_document_generator.py` are thorough at that layer.

What those unit tests don't cover: whether the full pipeline actually wires together — a real HTTP request through Clerk auth, a real database write, FastAPI's `BackgroundTasks` actually running the generation, WeasyPrint producing a real PDF, that PDF being "uploaded" to storage, and the download endpoint serving it back. All of that is bypassed today by calling `_render_rirekisho()` (or `DocumentGenerator.generate()` with mocked DB/storage) directly.

`backend/tests/integration/` already exists in the repo but is empty (`__init__.py` only) — this is the first test to land there, and `backend/tests/conftest.py`'s docstring already describes the intended pattern ("a test-scoped PostgreSQL transaction that is rolled back after each test") without yet implementing it. This spec builds the first real-DB integration test and establishes the pattern other integration tests can follow later.

## Scope

**In scope:** an API-level E2E test covering this session's rirekisho photo-box/visual-polish work — generating a rirekisho with and without an uploaded photo, through the real HTTP → DB → background-task → WeasyPrint → storage pipeline, verifying the pipeline produces a valid, correctly-embedded PDF.

**Explicitly out of scope (future work, not built here):**
- Re-deriving the exact geometric layout assertions (photo box position, navy color values, border coordinates) at this layer — those are already thoroughly covered by the unit tests in `test_document_generator.py`. This test proves the pipeline wiring works, not the layout math a second time.
- Browser-level E2E (Playwright) driving the actual UI (Settings → wizard → generate → download click). No UI surface is involved in the bug this fix addressed.
- The rest of the rirekisho generation flow (Settings completeness gating, the wizard, document deletion) — this test seeds a complete profile directly via DB, it doesn't exercise the Settings UI or its own required-fields logic.
- A SAVEPOINT-based nested-transaction rollback pattern for test DB isolation (the more "textbook" SQLAlchemy testing pattern). This test uses simpler explicit seed-then-cleanup instead; the more robust pattern is worth adopting if `tests/integration/` grows to have many tests sharing setup.

## Architecture

### File

New file: `backend/tests/integration/test_rirekisho_generation_e2e.py`. Runs as part of the existing `pytest` invocation (no CI changes needed — `testpaths = ["tests"]` in `pyproject.toml` already picks up `tests/integration/`, and CI's backend job already provisions and migrates a real Postgres before running tests).

### Database

No DB mocking. The app's real `get_db()` dependency runs unmodified, connecting to the same Postgres `DATABASE_URL`/`DATABASE_SYNC_URL` that CI (via its `postgres` service container) and local dev (via `docker-compose.yml`) already provide. If Postgres isn't reachable, the test fails with a clear connection error — no silent skip. Locally, this means running `docker compose up postgres redis -d` before `pytest`.

A fixture seeds directly via the app's own `AsyncSessionFactory` (from `app.database`) before each test:
- A `User` row with all rirekisho-required top-level fields (`full_name`).
- A `Profile` row with every field `rirekisho_missing_fields()` requires (`name_kana`, `date_of_birth` in the 16–80 age range, `gender`, `phone_number`, `mailing_address`), `visa_status=none` (so visa fields aren't required), and — for the photo-present scenario only — a `photo_storage_key` set to an arbitrary key string (the actual bytes come from the mocked `file_storage.download`, not real storage).
- A `Resume` row with a `file_url`/`mime_type` (its content is never actually parsed for meaning, since `ai_client.generate` is mocked — but `DocumentGenerator` does call `file_storage.download` + `resume_parser.extract_text` on it before the AI call, so the mock needs to serve *some* valid bytes for that step to succeed).

Cleanup deletes these rows (and any `GeneratedDocument` row the test created) in a `finally` block after each test, using the same session factory.

### Auth

Reuses the existing pattern from `backend/tests/unit/test_document_routes.py`'s `_bypass_middleware`: the real `ClerkJWTMiddleware` executes, but its network-dependent internals (`_get_jwks`, `_validate_token`, `_resolve_user`) are patched so a bearer token resolves to the seeded test user — without needing a real Clerk account or network call.

### Mocked boundaries

- `app.services.ai.client.ai_client.generate` — returns a canned `RirekishoResult`-shaped JSON (education/work history/qualifications/self_pr/motivation). No real Gemini call, no cost, deterministic.
- `app.services.file_storage.file_storage.download` — serves canned bytes for both call sites that need it: resume-text extraction (a minimal valid PDF or plain text, whichever `resume_parser.extract_text` accepts most simply) and, in the photo-present scenario, the profile photo (a small valid JPEG, reusing the same test image bytes already used in the unit tests).
- `app.services.file_storage.file_storage.upload_document` — doesn't touch real S3/B2; captures the uploaded PDF bytes via the mock's call arguments so the test can inspect them directly, and returns a fake storage key so the rest of the pipeline (setting `file_url` on the `GeneratedDocument` row) proceeds normally.

Everything else in the pipeline is real: the DB writes/reads, the `BackgroundTasks`-driven `_run_generation` execution, `DocumentGenerator.generate()`'s orchestration, and the actual WeasyPrint HTML→PDF rendering.

### Waiting for generation

FastAPI's `BackgroundTasks` execute inline as part of the same ASGI call, before `await client.post(...)` returns, when driven through `httpx.AsyncClient(transport=ASGITransport(app=app))` — so the document should already be in a terminal state immediately after the POST. The test polls `GET /documents/{id}` a few times with a short bound anyway (matching how the real frontend polls), so the test stays correct if generation is ever moved to a real task queue (Celery) where this synchronous guarantee wouldn't hold.

## Test scenarios

Both scenarios follow: seed user/profile/resume → POST `/documents/rirekisho` → poll `GET /documents/{id}` until `completed` (bounded) → `GET /documents/{id}/download` → inspect the PDF bytes → assert the `GeneratedDocument` DB row is `completed` with a `file_url` set → cleanup.

1. **`test_generate_rirekisho_without_photo_end_to_end`** — profile has no `photo_storage_key`. Asserts: final status is `completed`; downloaded bytes start with `%PDF-`; no `/Subtype /Image` object is present in the PDF (no photo was uploaded, so none should be embedded).

2. **`test_generate_rirekisho_with_photo_end_to_end`** — profile has a `photo_storage_key`; `file_storage.download` mock serves a small valid JPEG for it. Asserts everything from (1) except the image check is inverted: `/Subtype /Image` IS present in the downloaded PDF — proving the full pipeline (not just the isolated render function) actually embeds an uploaded photo, which is the part of this session's fix a unit test calling `_render_rirekisho()` directly can't fully prove on its own (it never touches `file_storage.download`, the DB-stored `photo_storage_key`, or the base64-embedding step in `_build_rirekisho_personal`).

## Testing the test

Per this session's own experience (`865f964` originally shipped a false-negative regression test that was later corrected in `c3e33e0`), both new tests will be verified with a deliberate red-green check before being considered done — not just written and trusted. For each test, that means temporarily breaking the specific thing it claims to verify (e.g., for the with-photo test, mocking `file_storage.download` to return empty bytes, or checking the assertion against `/9j/4AAQ...`-less content) and confirming the test actually fails, then restoring the real behavior and confirming it passes. The exact mechanism is a plan/implementation detail per test, not fixed here.
