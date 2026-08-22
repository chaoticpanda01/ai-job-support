# AI Quota Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show users how many AI calls they have left before they hit the limit, in all three languages, instead of only telling them after a request has already failed.

**Architecture:** A read-only `GET /auth/me/ai-quota` endpoint exposes the existing
`usage_tracker.get_quota_status()` helper (already shipped in Plan 1, commit `ed7ad36`).
A React Query hook polls it on window focus and on a 60-second while-visible interval; a
small badge component in the dashboard header renders the binding cap with escalating
styling. All user-facing text is composed in the component from structured numbers plus
new `aiQuota` i18n fragments, so translation actually works.

**Tech Stack:** FastAPI + Pydantic v2 + pytest (backend); Next.js 15 App Router +
TanStack Query v5 + Tailwind (frontend).

**Source spec:** `docs/superpowers/specs/2026-08-22-admin-full-access-design.md`, Part D.
This plan is Plan 2 of 2. Plan 1 (Parts A, B, C, E) is already merged.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `backend/app/schemas/user.py` | Modify | Add `AIQuotaResponse` — the wire shape of the quota |
| `backend/app/api/v1/auth.py` | Modify | Add the `GET /me/ai-quota` route |
| `backend/tests/unit/test_auth_routes.py` | Modify | Endpoint tests |
| `frontend/types/api.ts` | Modify | Add the `AIQuota` TypeScript mirror |
| `frontend/hooks/useAiQuota.ts` | Create | The query + its freshness policy |
| `frontend/lib/i18n.ts` | Modify | Add the `aiQuota` namespace (en/id/ja) |
| `frontend/components/ai-quota-badge.tsx` | Create | The badge and its reset-duration formatting |
| `frontend/app/dashboard/layout.tsx` | Modify | Mount the badge in the header |

**No quota math is added anywhere.** `get_quota_status` already exists and is tested
(`backend/tests/unit/test_usage_tracker.py`, 4 binding-cap tests). If you find yourself
recomputing a cap, stop — you are in the wrong file.

### Important environment facts

- **Backend tests run with coverage gating.** `backend/pyproject.toml:57` sets
  `--cov-fail-under=70`, so running a *single* test file exits non-zero even when every
  test passes. Targeted runs in this plan therefore pass `--no-cov`; the final full-suite
  run does not.
- **The frontend has no test framework.** No jest, no vitest, no test script, no test
  files. Do not add one — that is a separate project. Frontend verification is
  `npm run type-check`, `npm run lint`, `npm run build`, and a browser pass.
- **All backend commands run from `backend/` with the venv active:**
  `source .venv/bin/activate`. All frontend commands run from `frontend/`.

---

## Task 1: Backend — quota endpoint

**Files:**
- Modify: `backend/app/schemas/user.py` (imports at line 13; insert after `MeResponse`)
- Modify: `backend/app/api/v1/auth.py` (insert after `record_consent`)
- Test: `backend/tests/unit/test_auth_routes.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/unit/test_auth_routes.py`:

```python
# ---------------------------------------------------------------------------
# GET /auth/me/ai-quota
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_ai_quota_returns_binding_cap() -> None:
    """
    remaining and exhausted are @property on QuotaStatus, not stored fields.
    Asserting the whole payload catches a mapping that silently drops them.
    """
    user = make_user(role=UserRole.user)
    quota = QuotaStatus(scope="user", used=5, limit=8, window_hours=24, resets_in_seconds=12000)

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.auth.usage_tracker.get_quota_status",
            new=AsyncMock(return_value=quota),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me/ai-quota", headers=_auth_headers())

    assert resp.status_code == 200
    assert resp.json() == {
        "scope": "user",
        "used": 5,
        "limit": 8,
        "remaining": 3,
        "window_hours": 24,
        "resets_in_seconds": 12000,
        "exhausted": False,
    }


@pytest.mark.asyncio
async def test_get_ai_quota_passes_admin_flag_through() -> None:
    """
    The route must forward is_admin rather than re-querying the role, so an
    admin resolves to the global scope (they have no per-user cap).
    """
    admin = make_user(role=UserRole.admin)
    quota = QuotaStatus(scope="global", used=11, limit=16, window_hours=24, resets_in_seconds=0)
    spy = AsyncMock(return_value=quota)

    with (
        _bypass_middleware(admin),
        patch("app.api.v1.auth.usage_tracker.get_quota_status", new=spy),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me/ai-quota", headers=_auth_headers())

    assert resp.status_code == 200
    assert resp.json()["scope"] == "global"
    assert resp.json()["remaining"] == 5
    # get_quota_status(user_id, is_admin, db) — positional, as check_budget calls it.
    assert spy.await_args.args[1] is True


@pytest.mark.asyncio
async def test_get_ai_quota_exhausted_reports_zero_remaining() -> None:
    """Usage can overshoot the cap under concurrency; remaining must clamp at 0."""
    user = make_user(role=UserRole.user)
    quota = QuotaStatus(scope="global", used=17, limit=16, window_hours=24, resets_in_seconds=600)

    with (
        _bypass_middleware(user),
        patch(
            "app.api.v1.auth.usage_tracker.get_quota_status",
            new=AsyncMock(return_value=quota),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me/ai-quota", headers=_auth_headers())

    assert resp.status_code == 200
    assert resp.json()["remaining"] == 0
    assert resp.json()["exhausted"] is True


@pytest.mark.asyncio
async def test_get_ai_quota_requires_authentication() -> None:
    """Not in ClerkJWTMiddleware._BYPASS_PATHS, so an anonymous call is rejected."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/auth/me/ai-quota")

    assert resp.status_code == 401
```

Add the `QuotaStatus` import to the existing import block at the top of that file
(after the `from app.models.enums import UserRole` line):

```python
from app.services.ai.usage_tracker import QuotaStatus
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd backend && source .venv/bin/activate && pytest tests/unit/test_auth_routes.py -k ai_quota -v --no-cov
```

Expected: 4 failures. The three authenticated cases return `404 Not Found` (no such
route yet) rather than 200; `test_get_ai_quota_requires_authentication` may already pass
incidentally, since an unknown path behind the middleware still 401s — that is fine, it
is guarding a real regression, not driving the implementation.

- [ ] **Step 3: Add the response schema**

In `backend/app/schemas/user.py`, widen the typing import on line 13:

```python
from typing import Any, Literal
```

Then insert after the `MeResponse` class and before the
`# Clerk webhook payloads` divider:

```python
# ---------------------------------------------------------------------------
# AI quota
# ---------------------------------------------------------------------------


class AIQuotaResponse(_Base):
    """
    The *binding* AI call quota — whichever of the per-user or global cap has
    the least headroom left. Counts requests, not tokens.

    `scope` names which cap this is: "user" is the per-user fair-use quota,
    "global" the shared circuit-breaker. Admins have no per-user cap, so theirs
    is always "global".
    """

    scope: Literal["user", "global"]
    used: int
    limit: int
    remaining: int
    window_hours: int
    resets_in_seconds: int
    exhausted: bool
```

- [ ] **Step 4: Add the route**

In `backend/app/api/v1/auth.py`, add to the imports — alongside the existing
`from app.schemas.user import (...)` block, add `AIQuotaResponse` as the first entry so
the list stays alphabetical:

```python
from app.schemas.user import (
    AIQuotaResponse,
    ClerkWebhookEvent,
    ClerkWebhookUserData,
    MeResponse,
    ProfileUpdateRequest,
    UserListResponse,
    UserResponse,
)
```

and add this import immediately *after* that `from app.schemas.user import (...)` block —
`app.services` sorts after `app.schemas`, so putting it earlier makes `ruff check` fail on
import order:

```python
from app.services.ai.usage_tracker import usage_tracker
```

Then insert this route immediately after `record_consent`, before the
`# Admin — user listing` divider:

```python
# ---------------------------------------------------------------------------
# AI quota
# ---------------------------------------------------------------------------


@router.get("/me/ai-quota", response_model=AIQuotaResponse)
async def get_my_ai_quota(current_user: AuthUser, db: DbSession) -> AIQuotaResponse:
    """
    Return the caller's binding AI call quota so the UI can warn *before* a
    request is refused, rather than only surfacing the 429 afterwards.

    Reads the same helper check_budget enforces with, so the number shown can
    never drift from the number enforced. current_user.is_admin is already
    resolved on the request, so this performs no role query of its own.
    """
    quota = await usage_tracker.get_quota_status(current_user.user_id, current_user.is_admin, db)
    return AIQuotaResponse(
        scope=quota.scope,  # type: ignore[arg-type]
        used=quota.used,
        limit=quota.limit,
        remaining=quota.remaining,
        window_hours=quota.window_hours,
        resets_in_seconds=quota.resets_in_seconds,
        exhausted=quota.exhausted,
    )
```

Field-by-field construction is deliberate rather than `model_validate(quota)`:
`remaining` and `exhausted` are `@property` on a frozen dataclass, and spelling out the
payload makes what the API returns obvious at the call site. `QuotaStatus.scope` is typed
`str` while the response narrows it to a `Literal`, hence the one `type: ignore`.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd backend && source .venv/bin/activate && pytest tests/unit/test_auth_routes.py -k ai_quota -v --no-cov
```

Expected: 4 passed.

- [ ] **Step 6: Run lint, format, and type checks**

```bash
cd backend && source .venv/bin/activate && ruff check app tests && ruff format --check app tests && mypy app
```

Expected: all three clean. If `ruff format --check` reports the new blocks, run
`ruff format app tests` and re-check.

- [ ] **Step 7: Run the full backend suite**

```bash
cd backend && source .venv/bin/activate && pytest
```

Expected: all tests pass and coverage stays at or above 70%.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/user.py backend/app/api/v1/auth.py backend/tests/unit/test_auth_routes.py
git commit -m "Add GET /auth/me/ai-quota"
```

---

## Task 2: Frontend — type and query hook

**Files:**
- Modify: `frontend/types/api.ts`
- Create: `frontend/hooks/useAiQuota.ts`

- [ ] **Step 1: Add the TypeScript mirror of the response**

Append to `frontend/types/api.ts`:

```ts
// ---------------------------------------------------------------------------
// AI quota
// ---------------------------------------------------------------------------

/** Mirrors backend AIQuotaResponse. Counts requests, not tokens. */
export interface AIQuota {
  /** "user" is the per-user fair-use cap; "global" the shared breaker. */
  scope: "user" | "global";
  used: number;
  limit: number;
  remaining: number;
  window_hours: number;
  resets_in_seconds: number;
  exhausted: boolean;
}
```

- [ ] **Step 2: Create the hook**

Create `frontend/hooks/useAiQuota.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { AIQuota } from "@/types/api";

/**
 * The caller's binding AI call quota.
 *
 * Freshness is interval-based rather than invalidation-based on purpose. Two
 * of the nine check_budget call sites spend quota inside background workers
 * (resume analysis, document generation), so no mutation ever resolves at the
 * moment those spends land — per-call-site invalidation is structurally blind
 * to them. A while-visible interval catches every spend and cannot be
 * forgotten by a future AI feature.
 *
 * staleTime overrides the 30s default in lib/providers.tsx so that the
 * refetch-on-window-focus this relies on actually fires.
 * refetchIntervalInBackground defaults to false, so a hidden tab polls nothing.
 */
export function useAiQuota() {
  return useQuery<AIQuota>({
    queryKey: ["aiQuota"],
    queryFn: () => apiClient.get<AIQuota>("/auth/me/ai-quota"),
    staleTime: 0,
    refetchInterval: 60_000,
  });
}
```

- [ ] **Step 3: Verify types**

```bash
cd frontend && npm run type-check
```

Expected: no errors. (The hook is not yet consumed; this confirms it compiles.)

- [ ] **Step 4: Commit**

```bash
git add frontend/types/api.ts frontend/hooks/useAiQuota.ts
git commit -m "Add the AI quota type and query hook"
```

---

## Task 3: i18n — the `aiQuota` namespace

**Files:**
- Modify: `frontend/lib/i18n.ts`

`t(section, key, lang)` takes **no interpolation arguments** (`frontend/lib/i18n.ts:1025`).
Every string below is therefore a fragment that the badge concatenates with numbers. Do
not add `{n}`-style placeholders — nothing would substitute them.

- [ ] **Step 1: Add the namespace**

In `frontend/lib/i18n.ts`, insert this block immediately before the
`// Legacy dashboard section (kept for backward compat)` divider comment near the end of
the `translations` object (around line 1008), so it sits alongside the other namespaces:

```ts
  // ---------------------------------------------------------------------------
  // AI quota badge — fragments, composed with numbers in ai-quota-badge.tsx
  // ---------------------------------------------------------------------------
  aiQuota: {
    left: { en: "AI calls left", id: "panggilan AI tersisa", ja: "回のAI利用が可能" },
    exhausted: {
      en: "AI limit reached.",
      id: "Batas AI tercapai.",
      ja: "AI利用上限に達しました。",
    },
    resetsIn: { en: "Resets in", id: "Tersedia lagi dalam", ja: "回復まで" },
    soon: { en: "under a minute", id: "kurang dari semenit", ja: "まもなく" },
    hourUnit: { en: "h", id: "j", ja: "時間" },
    minuteUnit: { en: "m", id: "m", ja: "分" },
    sharedPool: {
      en: "Shared demo limit",
      id: "Batas demo bersama",
      ja: "デモ全体の上限",
    },
    yourQuota: {
      en: "Your 24-hour limit",
      id: "Batas 24 jam kamu",
      ja: "あなたの24時間の上限",
    },
  },

```

- [ ] **Step 2: Verify types and formatting**

```bash
cd frontend && npm run type-check && npx prettier --check lib/i18n.ts
```

Expected: no type errors, and prettier reports the file formatted. If prettier
complains, run `npx prettier --write lib/i18n.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/i18n.ts
git commit -m "Add aiQuota translations for en, id, and ja"
```

---

## Task 4: The badge component

**Files:**
- Create: `frontend/components/ai-quota-badge.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/components/ai-quota-badge.tsx`:

```tsx
"use client";

import { useAiQuota } from "@/hooks/useAiQuota";
import { useLang } from "@/lib/language-context";
import { t, type Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Below this many remaining calls the badge turns amber. */
const LOW_REMAINING = 2;

/**
 * Render a reset countdown in the active language.
 *
 * Deliberately does not reuse the backend's _format_duration, which emits
 * English-only prose. Pure, single-consumer, so it stays in this file rather
 * than becoming a shared utility.
 */
function formatReset(seconds: number, lang: Language): string {
  const totalMinutes = Math.ceil(seconds / 60);
  if (totalMinutes < 1) return t("aiQuota", "soon", lang);

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const h = t("aiQuota", "hourUnit", lang);
  const m = t("aiQuota", "minuteUnit", lang);

  if (hours === 0) return `${minutes}${m}`;
  if (minutes === 0) return `${hours}${h}`;
  return `${hours}${h}${minutes}${m}`;
}

/**
 * Remaining AI calls, shown in the dashboard header.
 *
 * Advisory only. This sits in the header of every dashboard page, so a pending
 * or failed quota fetch renders nothing rather than risking the header. The
 * authoritative path is unaffected either way — an exhausted quota is still
 * enforced by check_budget and surfaced as a 429.
 */
export function AiQuotaBadge() {
  const { lang } = useLang();
  const { data } = useAiQuota();

  if (!data) return null;

  const { remaining, limit, exhausted, scope, resets_in_seconds } = data;
  const low = !exhausted && remaining <= LOW_REMAINING;
  const reset = formatReset(resets_in_seconds, lang);

  const scopeLabel = t("aiQuota", scope === "global" ? "sharedPool" : "yourQuota", lang);
  const description = exhausted
    ? `${scopeLabel}: ${t("aiQuota", "exhausted", lang)} ${t("aiQuota", "resetsIn", lang)} ${reset}`
    : `${scopeLabel}: ${remaining} ${t("aiQuota", "left", lang)}`;

  return (
    <span
      title={description}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium tabular-nums",
        exhausted
          ? "border-destructive/40 text-destructive"
          : low
            ? "border-amber-500/40 text-amber-700"
            : "border-transparent text-muted-foreground",
      )}
    >
      <span aria-hidden="true">⚡</span>
      <span aria-hidden="true">
        {remaining}/{limit}
        {exhausted ? ` · ${reset}` : ""}
      </span>
      <span className="sr-only">{description}</span>
    </span>
  );
}
```

The `⚡ 5/8` form is intentional: it reads as a quota in all three languages without
needing a word for it, and stays narrow enough for the mobile header. The full translated
sentence is carried by `title` (hover) and the `sr-only` span (screen readers), with the
visible glyphs marked `aria-hidden` so assistive tech reads the sentence once, not twice.

`text-amber-700` matches existing usage at
`frontend/app/dashboard/interview/[id]/page.tsx:253`.

- [ ] **Step 2: Verify types and lint**

```bash
cd frontend && npm run type-check && npm run lint
```

Expected: no errors and no warnings. The component is not yet mounted; this confirms it
compiles and satisfies the lint rules.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/ai-quota-badge.tsx
git commit -m "Add the AI quota badge component"
```

---

## Task 5: Mount the badge in the dashboard header

**Files:**
- Modify: `frontend/app/dashboard/layout.tsx:7` (imports) and `:60-62` (right-hand cluster)

- [ ] **Step 1: Add the import**

In `frontend/app/dashboard/layout.tsx`, add after the existing
`import { LanguageSwitcher } from "@/components/language-switcher";` line:

```tsx
import { AiQuotaBadge } from "@/components/ai-quota-badge";
```

- [ ] **Step 2: Render it in the right-hand cluster**

Replace:

```tsx
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <UserButton afterSignOutUrl="/sign-in" />
```

with:

```tsx
          <div className="flex items-center gap-3">
            <AiQuotaBadge />
            <LanguageSwitcher />
            <UserButton afterSignOutUrl="/sign-in" />
```

- [ ] **Step 3: Verify types, lint, and a production build**

```bash
cd frontend && npm run type-check && npm run lint && npm run build
```

Expected: all three succeed. The build is the meaningful gate here — it is the closest
thing this frontend has to a test suite.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/layout.tsx
git commit -m "Show the AI quota badge in the dashboard header"
```

---

## Task 6: Verify end to end in the browser

No frontend test framework exists, so this task is the real verification. Use the
`mcp__Claude_Browser__*` tools (they work correctly against this app's Clerk pages).

**You cannot sign in yourself — never type the user's password.** Start the preview,
navigate, and ask the user to sign in in that same tab; continue once they confirm.

- [ ] **Step 1: Start both servers**

Use `preview_start` with `{name: "backend"}` and `{name: "frontend"}` — both are already
defined in `.claude/launch.json`. Do not start servers with Bash.

- [ ] **Step 2: Confirm the endpoint responds**

With the dashboard open and the user signed in, check the network log for
`/api/v1/auth/me/ai-quota` via `read_network_requests`, or read the value directly:

```
javascript_tool: await (await fetch("/api/v1/auth/me/ai-quota")).json()
```

Expected: a JSON object with `scope`, `used`, `limit`, `remaining`, `window_hours`,
`resets_in_seconds`, `exhausted`. The signed-in account (`rivky.rachmadi@gmail.com`) is an
admin, so `scope` must be `"global"` and `limit` must be `16` — that is Part A's admin
exemption showing through, and it is the single most valuable assertion in this task.

- [ ] **Step 3: Confirm the badge renders**

`read_page` the dashboard and confirm the badge text appears in the header, then take a
`screenshot` for the record.

- [ ] **Step 4: Confirm all three languages**

Click each of EN / ID / JA in the language switcher, and after each one `read_page` to
confirm the badge's `sr-only` sentence changed language. Japanese should read like
`デモ全体の上限: 11 回のAI利用が可能`.

- [ ] **Step 5: Check the mobile header does not crowd**

```
resize_window: {preset: "mobile"}
```

Reload, then `screenshot`. The header holds the badge, the language switcher, the user
button, and the hamburger at 375px wide.

**If they collide or wrap**, add `hidden sm:inline-flex` to the badge's className in
`frontend/components/ai-quota-badge.tsx` (replacing the leading `inline-flex`), re-run
`npm run build`, re-check, and commit the fix as
`git commit -m "Hide the quota badge on very narrow screens"`. If it fits, change
nothing.

- [ ] **Step 6: Report findings**

Report what was verified with the actual observed values — the JSON payload, the three
rendered languages, and the mobile result. Do not claim the badge works without having
seen it in `read_page` output.

---

## Manual verification of the exhausted state (optional)

The exhausted styling cannot be reached without burning 16 real Gemini calls, which is
the entire point of the quota. To see it without spending quota, temporarily return a
fixed value from the route and reload the dashboard:

```python
    quota = await usage_tracker.get_quota_status(current_user.user_id, current_user.is_admin, db)
    from app.services.ai.usage_tracker import QuotaStatus  # TEMPORARY
    quota = QuotaStatus(scope="global", used=16, limit=16, window_hours=24, resets_in_seconds=9000)
```

Expected: a red `⚡ 0/16 · 2時間30分` (in JA) chip. **Revert this before committing** —
`git diff backend/app/api/v1/auth.py` must be empty afterwards.

---

## Out of scope

- Any change to `get_quota_status`, `check_budget`, or the two cap constants.
- Translating the persisted `error_message` on failed documents; it is written
  server-side at failure time, before any language preference is known.
- Introducing a frontend test framework.
- Surfacing the badge outside `/dashboard` — `/admin` and `/onboarding` are separate
  route trees and are deliberately left alone.
