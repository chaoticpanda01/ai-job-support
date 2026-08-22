# Admin Full Access & AI Quota Visibility — Design

**Date:** 2026-08-22
**Status:** Approved for planning

## Problem

The stated goal was "full access to all features as admin without usage limitation."
Investigation showed the premise needed correcting in two ways, which reshaped the
whole design.

**Nothing is gated by role.** Every feature endpoint uses the `AuthUser` dependency,
not `AdminUser`. Admin grants no additional feature access. `subscription_tier` gates
nothing either — it appears only in the orphaned billing endpoints and as a display
column in the admin panel. The usage tracker's own docstring says so outright: *"a
fair-use ceiling, not a billing tier — every user gets the same limit regardless of
subscription."*

**"Unlimited" is not achievable, and shouldn't be faked.** Two caps exist in
`backend/app/services/ai/usage_tracker.py`:

| Limit | Value | Nature |
|---|---|---|
| Per-user | 8 calls / 24h | Self-imposed, arbitrary |
| Global breaker | 16 calls / 24h, all users | Deliberate proxy for Google's real Gemini free-tier ceiling (~20 req/day) |

The global cap is not ours to lift freely. It exists so users get a friendly "shared
limit reached" message instead of a raw Gemini 429. Removing it creates no additional
Gemini capacity — it only changes which error surfaces. The 4-call gap under 20 is
deliberate headroom absorbing check-then-act overshoot under concurrency.

**Decision:** admins bypass the per-user cap only. Effective admin ceiling becomes
16/day rather than 8/day. Genuine removal of the ceiling would require enabling
billing on the Google Cloud project — out of scope, and outside this codebase.

**Explicitly rejected:** exempting admin calls from the *global* tally. Those calls
still consume real Google quota, so the breaker would under-count and begin handing
raw Gemini 429s to actual demo visitors. Accounting must stay honest.

## Actual blockers found

The real barriers to using features are data gaps, not permissions. Verified against
the live local account (`rivky.rachmadi@gmail.com`, admin):

| Feature | Requires | Status |
|---|---|---|
| Visa roadmap | profile row exists | works now |
| Interview | nothing (profile optional) | works now |
| Chatbot | nothing | works now |
| Job translation | nothing | works now |
| Culture | nothing (no AI) | works now |
| Job match | a resume | upload unblocks |
| Resume analysis | a resume | upload unblocks |
| Shokumu | a resume | upload unblocks |
| Rirekisho | resume + `full_name` + 7 profile fields | blocked — see Parts B/C |

The account sits at `onboarding_step = 4` with all seven Phase-1 rirekisho fields
`NULL`, `full_name` unset, and `visa_status = held` (so visa sub-fields are required
too). `onboarding_completed` flipped to `false` when Phase 1 moved the generated
column from `= 4` to `= 5` — expected, since that account predates the new step.

Rirekisho is the only feature with a hard blocker, because its completeness check
requires `full_name`, which the app currently gives users no way to set (Part C).

---

## Part A — Admin AI-budget exemption

`check_budget(user_id, feature, db)` keeps its signature and resolves the user's role
internally, skipping only the per-user cap for admins.

Rationale for internal lookup over a caller-passed `is_admin` flag: seven of the nine
call sites are API routes that already hold `current_user.role`, but two are
background workers (`document_generator.py`, `analysis_tasks.py`) holding only a
`user_id`. An internal lookup keeps all nine call sites unchanged, puts the policy in
exactly one place, and makes it impossible for a future call site to forget the
exemption or wrongly grant it. The cost is one indexed primary-key read per AI call —
negligible beside a multi-second Gemini call capped at 16/day.

- **Fails closed.** If the user lookup returns `None`, the cap is enforced. Exemption
  is granted only on positive confirmation of admin role.
- **Global breaker unchanged.** Still applies to admins; they will still see the
  shared-limit message at 16/day.
- **`record()` unchanged.** Admin calls stay logged, keeping global accounting and
  observability honest.

## Part B — Onboarding resumes at the saved step

`frontend/app/onboarding/page.tsx:68` hard-starts at `useState(1)`, so reaching step 5
means clicking through 1→2→3→4 again.

- Start step derives from `me.profile.onboarding_step` as `min(saved + 1, 5)`
  (`saved = 4` → step 5; `saved = 0` → step 1).
- **Exception: if `user.full_name` is missing, start at step 2 regardless.** Step 2 is
  the only place `full_name` is captured (Part C). Without this exception the live
  account — `saved = 4`, `full_name = NULL` — would jump straight to step 5, complete it,
  flip `onboarding_completed` to true, and then be permanently redirected away from
  onboarding by the existing guard at `frontend/app/onboarding/page.tsx:72`, leaving
  rirekisho blocked forever with no way back. The rule is therefore: start at
  `min(saved + 1, 5)`, or step 2 if `full_name` is missing.
- `saved = 5` needs no special handling: `onboarding_completed` is a generated column
  (`onboarding_step = 5`), so the existing redirect fires first and sends the user to the
  dashboard. The clamp at 5 is defensive only.
- The sync runs **once**, guarded by a ref, so it does not yank the user forward when
  they deliberately navigate Back.
- Step 5 prefills from existing profile values. Without this, re-visiting a completed
  step 5 shows blank fields and overwrites saved data with nulls — a correctness bug,
  not polish.

`ProfileRepository.advance_onboarding_step` already prevents the step from regressing,
so re-walking earlier steps cannot undo progress.

## Part C — `full_name` is collected but silently discarded (bug fix)

Revised during planning after reading the code. This is **not** a missing feature — the
UI already collects the field and throws it away, in two independent layers:

1. `frontend/app/onboarding/page.tsx:19` — `step2Schema` requires
   `full_name: z.string().min(1)`, and Step 2 renders an input for it (i18n key `s2Name`,
   already labelled 氏名 in Japanese). The user fills it in and Zod validates it.
2. Step 2's `onNext` then sends only `preferred_language` and `onboarding_step: 1`.
   **`data.full_name` is never sent.**
3. Even if it were, `ProfileUpdateRequest` has no `full_name` field, so the backend would
   drop it as well.

This fully explains why the live account has `full_name = NULL` despite having completed
steps 1–4, and why the Clerk webhook (`backend/app/api/v1/auth.py:94`) is currently the
only writer — a path unreachable on localhost, since svix cannot reach `localhost:8000`.

**Fix, both layers:**

- Add `full_name: str | None = None` to `ProfileUpdateRequest`. `update_me` pops it and
  updates the `User` row; the endpoint already loads `user`, so this is small.
  `exclude_none=True` means it can be set but never cleared, which is desired.
- Pass `full_name: data.full_name` in Step 2's `onNext`.

**Explicitly not doing:** surfacing 氏名 again in step 5. An earlier draft of this spec
proposed that, but `RirekishoPersonal.name_kanji` is populated from `user.full_name` — the
very same column step 2 collects. Adding it to step 5 would render one DB field twice in
one wizard. Step 2 remains the single place it is captured. No new i18n is required, since
`s2Name` already exists in en/id/ja.

**Known conflict, accepted:** a later Clerk `user.updated` webhook overwrites an in-app
edit. Last-writer-wins. Documented rather than reconciled — appropriate for a demo.

## Part D — Proactive quota indicator + i18n

The exhaustion message already works end to end and is well-written. Synchronous
features surface it as a 429 whose `detail` becomes `ApiClientError.message`;
asynchronous ones persist it via `set_failed(error_message=...)` and render it at
`frontend/app/dashboard/documents/[id]/page.tsx:62`. Four gaps remain.

**Single source of truth.** Extract the quota math into
`usage_tracker.get_quota_status(user_id, is_admin, db)`. Both `check_budget` and the
new endpoint consume it, so enforcement and display cannot drift apart.

Division of responsibility, to avoid duplicating the role lookup: `get_quota_status` is
a pure-math helper that *takes* `is_admin` and never queries for it. `check_budget`
performs the role lookup described in Part A and passes the result down; the endpoint
already holds `current_user.role` and passes it directly. The DB read for role therefore
happens in exactly one place per path, and never twice in the same request.

**`GET /auth/me/ai-quota`** returns the *binding* constraint — it computes both caps and
returns whichever has fewer remaining:

```json
{ "scope": "user|global", "used": 5, "limit": 8, "remaining": 3,
  "window_hours": 24, "resets_in_seconds": 12000, "exhausted": false }
```

Role-awareness falls out naturally: admins have no per-user cap, so theirs always
resolves to `global`. A normal user at 2/8 personal but 15/16 global correctly sees the
global figure — the limit actually about to stop them.

**Badge** in the dashboard header's right-hand cluster
(`frontend/app/dashboard/layout.tsx:55`), beside the existing controls. Normal state
shows remaining calls; exhausted state becomes a warning carrying the reset time.
Refreshes on window focus and after any AI action — no aggressive polling.

**i18n:** new `aiQuota` namespace in `lib/i18n.ts` (en/id/ja), which currently has zero
quota strings. The frontend composes user-facing text from the endpoint's structured
numbers rather than displaying the backend's English string, so translation actually
works. The backend message stays as-is for the persisted `error_message` path and as an
API-level fallback.

**Terminology note:** the cap counts *requests*, not tokens. Token counts are logged for
cost estimation but never enforced. User-facing strings must say requests/calls.

## Part E — Admin panel navigation

`/admin` is a standalone top-level route outside `/dashboard`. It links out ("← Back to
app", "🏠 Home") but nothing anywhere links *in* — confirmed by grep: zero references to
`/admin` outside `app/admin/` itself. The only entry is typing the URL.

- Add an **Admin** item to the dashboard nav, rendered only when `role === "admin"`.
  `/auth/me` already returns `user.role`, so no backend change is needed. Add an `admin`
  key to the `nav` i18n namespace (en/id/ja).
- Add a clean **"Admin access required"** state on `/admin` for non-admins. Today they
  see the full panel chrome with three tabs each rendering `Failed to load users.` from
  403s. Not a security issue — the backend enforces `AdminUser` on every `/admin/*`
  endpoint, so nothing leaks — but a confusing dead end.

---

## Testing

- Admin bypasses the per-user cap; admin is **still** blocked by the global cap;
  non-admin is still capped; unknown `user_id` fails closed.
- `get_quota_status` binding-constraint selection returns the scarcer of the two caps,
  for both admin and non-admin.
- Onboarding start-step mapping, including the `min(saved + 1, 5)` clamp and the
  once-only sync not overriding manual Back navigation.
- `full_name` round-trips through `PUT /auth/me` and cannot be cleared by omission.
- Admin nav item renders for admins and is absent for regular users.

## Out of scope

- Editing `full_name` from the settings page (onboarding step 5 is the path).
- Backfilling other pre-Phase-1 accounts — this is the only user in the database.
- Translating the persisted `error_message`; it is written server-side at failure time,
  before any language preference is known.
- Raising or removing the global cap, and enabling Gemini billing.

## Known limitations after this ships

- A resume must still be uploaded before generating a rirekisho or shokumu.
- Google's ~20 requests/day free-tier ceiling still stands; admin's practical ceiling is
  the global 16/day.
- Job translation caches by `source_url` and cache hits skip Gemini entirely
  (`backend/app/api/v1/jobs.py:96`), which is useful for UI testing against a tight quota.
