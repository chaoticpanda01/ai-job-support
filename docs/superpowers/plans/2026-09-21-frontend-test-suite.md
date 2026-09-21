# Frontend Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the frontend a vitest suite that permanently holds the behaviour four throwaway harnesses verified, and a CI step that runs it.

**Architecture:** A separate `frontend/tests/` tree mirroring the source layout, matching the backend's `backend/tests/unit/`. One vitest config, jsdom everywhere. Pure functions are tested directly; pages are rendered with `@testing-library/react` against mocked hooks; polling hooks are tested by capturing the options object they hand react-query. Repo-wide invariants live in one file that reads source as data.

**Tech Stack:** vitest 5, @vitejs/plugin-react 6, jsdom 30, @testing-library/react 16 (React 19 compatible), @testing-library/jest-dom 7. Next 15 App Router, React 19, TypeScript 5.7.

**Spec:** `docs/superpowers/specs/2026-09-21-frontend-test-suite-design.md`

## Global Constraints

- Work in `frontend/`. Every command below assumes that working directory.
- Exactly five new devDependencies: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`. Do not add `@testing-library/user-event`.
- Vitest globals are **not** enabled. Every test file imports `{ describe, it, expect, vi }` (and `beforeEach`/`afterEach` where needed) from `"vitest"` explicitly.
- `tsconfig.json` is not modified. Its existing `include` globs already cover `tests/` and `vitest.config.ts`, which means tests are type-checked by `npm run type-check` and must be as well-typed as source.
- Tests must pass `npm run lint` and `npm run format:check`. Run `npx prettier --write <file>` on every file you create before committing.
- No coverage threshold. Do not add one.
- Never mock `@/lib/i18n`, `@/lib/api-error`, or `@/lib/file-rejection`. They are the units under test.
- The app supports exactly three languages: `"en"`, `"id"`, `"ja"`.
- Commit after each task. Do not push; the branch is merged by the requester.

---

## File Structure

| File | Responsibility |
|---|---|
| `vitest.config.ts` | Runner config: React plugin, jsdom, setup file, `@/` alias |
| `tests/setup.ts` | Registers jest-dom matchers |
| `tests/helpers.tsx` | `renderIn(lang, ui)` — renders inside the real `LanguageProvider` |
| `tests/lib/file-rejection.test.ts` | Dropzone rejection codes → translated messages |
| `tests/lib/api-error.test.ts` | HTTP status → translated message, overrides, rate-limit countdown |
| `tests/lib/i18n.test.ts` | Every string has three languages; placeholders intact; no orphaned keys |
| `tests/hooks/useDocuments.test.ts` | Polling and retry policy; `loadError` vs `pollError` |
| `tests/hooks/useInterview.test.ts` | Stream error codes and HTTP stream failures → messages |
| `tests/app/culture.test.tsx` | Culture page load states |
| `tests/app/documents-detail.test.tsx` | Document detail page failure branches |
| `tests/components/chat-widget.test.tsx` | Chat widget rendering and error paths |
| `tests/invariants.test.ts` | Repo-wide guards, including the two frontend/backend enum contracts |
| `.github/workflows/ci.yml` | Gains one `npm test` step in the frontend job |

---

### Task 1: Runner, config, and the first test

Installs the tooling and proves it works with the smallest real test file. `file-rejection` is chosen first because it needs no DOM, no mocks and no helper — if it passes, the runner, the alias and TypeScript are all wired correctly.

**Files:**
- Create: `frontend/vitest.config.ts`
- Create: `frontend/tests/setup.ts`
- Create: `frontend/tests/lib/file-rejection.test.ts`
- Modify: `frontend/package.json` (devDependencies, scripts)

**Interfaces:**
- Consumes: `fileRejectionMessage(rejection: FileRejection | undefined, maxSizeBytes: number, lang: Language): string` from `@/lib/file-rejection`; `t(section, key, lang)` from `@/lib/i18n`.
- Produces: a working `npm test`; the `@/` alias; `tests/setup.ts` registered for every later task.

- [ ] **Step 1: Install the dependencies**

```bash
cd frontend
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Write the config**

Create `frontend/vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
  resolve: {
    // Mirrors tsconfig.json's paths, so tests import exactly as source does.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
```

Create `frontend/tests/setup.ts`:

```ts
// Registers toBeInTheDocument, toHaveAttribute and the rest of the jest-dom
// matchers with vitest's expect.
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Add the scripts**

In `frontend/package.json`, add to `"scripts"`, after `"format:check"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write the failing test**

Create `frontend/tests/lib/file-rejection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { FileRejection } from "react-dropzone";
import { fileRejectionMessage } from "@/lib/file-rejection";
import { t, type Language } from "@/lib/i18n";

const LANGS: Language[] = ["en", "id", "ja"];
const TEN_MB = 10 * 1024 * 1024;

/** A rejection shaped like react-dropzone's, carrying one error code. */
function rejection(code: string): FileRejection {
  return {
    file: new File(["x"], "cv.pdf"),
    errors: [{ code, message: "English text from the library" }],
  } as unknown as FileRejection;
}

describe("fileRejectionMessage", () => {
  it.each(LANGS)("states the limit in MB, not bytes (%s)", (lang) => {
    const message = fileRejectionMessage(rejection("file-too-large"), TEN_MB, lang);

    expect(message).toBe(t("common", "fileTooLarge", lang).replace("{n}", "10"));
    expect(message).toContain("10");
    expect(message).not.toContain("{n}");
    expect(message).not.toContain("10485760");
  });

  it.each(LANGS)("explains a wrong file type (%s)", (lang) => {
    expect(fileRejectionMessage(rejection("file-invalid-type"), TEN_MB, lang)).toBe(
      t("common", "errorUnsupportedType", lang),
    );
  });

  it.each(LANGS)("explains choosing several files at once (%s)", (lang) => {
    expect(fileRejectionMessage(rejection("too-many-files"), TEN_MB, lang)).toBe(
      t("common", "fileOneAtATime", lang),
    );
  });

  it("stays neutral for a code it does not know", () => {
    // Guessing "wrong file type" would be a false statement about the file.
    expect(fileRejectionMessage(rejection("a-code-from-a-newer-library"), TEN_MB, "ja")).toBe(
      t("common", "error", "ja"),
    );
  });

  it("stays neutral when there is no rejection at all", () => {
    expect(fileRejectionMessage(undefined, TEN_MB, "ja")).toBe(t("common", "error", "ja"));
  });

  it("never leaks the library's own English message", () => {
    for (const code of ["file-too-large", "file-invalid-type", "too-many-files", "unknown"]) {
      for (const lang of LANGS) {
        expect(fileRejectionMessage(rejection(code), TEN_MB, lang)).not.toContain("English text");
      }
    }
  });
});
```

- [ ] **Step 5: Run it and watch it pass**

```bash
npx vitest run tests/lib/file-rejection.test.ts
```

Expected: 12 passing tests. If the run fails with "Cannot find module '@/lib/file-rejection'", the alias in `vitest.config.ts` is wrong — it must resolve `@` to the `frontend/` directory itself, not to `frontend/src`.

- [ ] **Step 6: Check the file passes the other gates**

```bash
npx prettier --write vitest.config.ts tests/setup.ts tests/lib/file-rejection.test.ts
npm run type-check && npm run lint && npm run format:check
```

Expected: all three clean.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/
git commit -m "test(frontend): add vitest and the first test file

The frontend had no runner at all. This adds vitest with jsdom and
testing-library, and one test file that needs neither, so a green run
proves the runner, the @/ alias and type-checking are wired up before
anything harder depends on them."
```

---

### Task 2: The HTTP status table

The largest pure-function surface, and the one every converted call site depends on.

**Files:**
- Create: `frontend/tests/lib/api-error.test.ts`

**Interfaces:**
- Consumes: `apiErrorMessage(error: unknown, lang: Language, overrides?: Partial<Record<number, string>>): string` from `@/lib/api-error`; `ApiClientError` (constructor: `status: number`, `detail: string`, `retryAfterSeconds?: number | null`) from `@/lib/api-client`.
- Produces: nothing later tasks consume.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/lib/api-error.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/lib/api-client";
import { apiErrorMessage } from "@/lib/api-error";
import { t, type Language } from "@/lib/i18n";

const LANGS: Language[] = ["en", "id", "ja"];

// Every status the API actually returns, inventoried from
// backend/app/api and backend/app/middleware.
const BACKEND_STATUSES = [400, 401, 403, 404, 409, 413, 415, 422, 429, 500, 502, 503];

describe("apiErrorMessage", () => {
  it.each(BACKEND_STATUSES)("explains %i in every language", (status) => {
    const detail = `Backend prose for ${status}`;
    const messages = LANGS.map((lang) => apiErrorMessage(new ApiClientError(status, detail), lang));

    for (const message of messages) {
      expect(message).not.toBe("");
      // t() returns an unknown key unchanged, so a key-shaped result means a
      // message is missing.
      expect(message).not.toMatch(/^error[A-Z]/);
      expect(message).not.toContain(detail);
    }
    // Three languages, three distinct strings.
    expect(new Set(messages).size).toBe(3);
  });

  it("reports a failure that never reached the server as a connection problem", () => {
    expect(apiErrorMessage(new TypeError("Failed to fetch"), "ja")).toBe(
      t("common", "errorConnection", "ja"),
    );
  });

  it("does not blame the server for a request it rejected", () => {
    // 400 and 422 mean the request was wrong; retrying it unchanged fails again.
    for (const status of [400, 422]) {
      expect(apiErrorMessage(new ApiClientError(status, ""), "en")).not.toBe(
        t("common", "errorServer", "en"),
      );
    }
  });

  it("does not report an unsupported file type as a server problem", () => {
    expect(apiErrorMessage(new ApiClientError(415, ""), "en")).toBe(
      t("common", "errorUnsupportedType", "en"),
    );
  });

  it("suggests trying again for a server-side failure", () => {
    for (const status of [500, 502, 503]) {
      expect(apiErrorMessage(new ApiClientError(status, ""), "en")).toBe(
        t("common", "errorServer", "en"),
      );
    }
  });

  describe("overrides", () => {
    const withOverride = (status: number) =>
      apiErrorMessage(new ApiClientError(status, "backend prose"), "ja", {
        422: "OVERRIDDEN",
      });

    it("replaces only the status it names", () => {
      expect(withOverride(422)).toBe("OVERRIDDEN");
    });

    it("leaves every other status alone", () => {
      expect(withOverride(429)).toBe(t("common", "errorRateLimited", "ja"));
      expect(withOverride(500)).toBe(t("common", "errorServer", "ja"));
    });

    it("does not apply to a failure that never reached the server", () => {
      expect(apiErrorMessage(new TypeError("offline"), "ja", { 422: "OVERRIDDEN" })).toBe(
        t("common", "errorConnection", "ja"),
      );
    });
  });

  describe("rate limiting", () => {
    const wait = (seconds: number | null) =>
      apiErrorMessage(new ApiClientError(429, "capped", seconds), "ja");

    it.each([
      [30, "errorRateLimitedMinutes", "1"],
      [60, "errorRateLimitedMinutes", "1"],
      [90, "errorRateLimitedMinutes", "2"],
      [3540, "errorRateLimitedMinutes", "59"],
      [3600, "errorRateLimitedHours", "1"],
      [7800, "errorRateLimitedHours", "3"],
    ] as const)("turns %i seconds into %s of %s", (seconds, key, expected) => {
      expect(wait(seconds)).toBe(t("common", key, "ja").replace("{n}", expected));
    });

    it("always rounds the wait up", () => {
      // Telling someone to wait less than the server will accept sends them
      // straight back into the same refusal.
      expect(wait(61)).toBe(t("common", "errorRateLimitedMinutes", "ja").replace("{n}", "2"));
    });

    it("stays vague when the response carried no Retry-After", () => {
      expect(wait(null)).toBe(t("common", "errorRateLimited", "ja"));
    });
  });
});
```

- [ ] **Step 2: Run it**

```bash
npx vitest run tests/lib/api-error.test.ts
```

Expected: PASS. If a status fails the "three distinct strings" assertion, two languages share a message and the translation needs fixing — not the test.

- [ ] **Step 3: Check the gates**

```bash
npx prettier --write tests/lib/api-error.test.ts
npm run type-check && npm run lint && npm run format:check
```

- [ ] **Step 4: Commit**

```bash
git add tests/lib/api-error.test.ts
git commit -m "test(frontend): cover the HTTP status message table

Pins every status the API actually returns to a real message in all
three languages, the override mechanism to the one status it names, and
the rate-limit countdown to rounding up rather than down."
```

---

### Task 3: Translation completeness

Guards the failure mode every recent i18n change was about: `t()` falls back to English silently, so a missing language is invisible until a reader sees the wrong one.

**Files:**
- Create: `frontend/tests/lib/i18n.test.ts`

**Interfaces:**
- Consumes: `translations` and `t` from `@/lib/i18n`.
- Produces: nothing later tasks consume.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/lib/i18n.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { translations, type Language } from "@/lib/i18n";

const LANGS: Language[] = ["en", "id", "ja"];

type StringTable = Record<string, Record<string, Record<string, string>>>;
const table = translations as unknown as StringTable;

/** Every [section, key, value] triple in the table. */
function everyString(): Array<[string, string, Record<string, string>]> {
  const out: Array<[string, string, Record<string, string>]> = [];
  for (const [section, keys] of Object.entries(table)) {
    for (const [key, value] of Object.entries(keys)) out.push([section, key, value]);
  }
  return out;
}

describe("translations", () => {
  it("has every language for every string", () => {
    const missing: string[] = [];
    for (const [section, key, value] of everyString()) {
      for (const lang of LANGS) {
        // An empty string is allowed and deliberate: Japanese needs no
        // separator where English and Indonesian take a space.
        if (!(lang in value)) missing.push(`${section}.${key} (${lang})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("keeps every placeholder in every language of a string that has one", () => {
    const broken: string[] = [];
    for (const [section, key, value] of everyString()) {
      for (const placeholder of ["{n}", "{max}", "{m}", "{t}"]) {
        const langsWith = LANGS.filter((lang) => (value[lang] ?? "").includes(placeholder));
        if (langsWith.length > 0 && langsWith.length !== LANGS.length) {
          broken.push(`${section}.${key} has ${placeholder} in ${langsWith.join(", ")} only`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("has no string left orphaned by the error-message migration", () => {
    // These were replaced by the status table in lib/api-error.ts. Re-adding
    // one means a call site went back to a hand-written fallback.
    const removed = [
      "saveFail",
      "deleteFail",
      "assessFail",
      "buildFail",
      "addToTrackerFailed",
      "createFailed",
      "uploadFailed",
      "photoUploadFail",
      "invalidFile",
      "photoInvalid",
    ];
    const found: string[] = [];
    for (const [section, key] of everyString()) {
      if (removed.includes(key)) found.push(`${section}.${key}`);
    }
    expect(found).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

```bash
npx vitest run tests/lib/i18n.test.ts
```

Expected: PASS. A failure lists the exact section and key.

- [ ] **Step 3: Check the gates**

```bash
npx prettier --write tests/lib/i18n.test.ts
npm run type-check && npm run lint && npm run format:check
```

- [ ] **Step 4: Commit**

```bash
git add tests/lib/i18n.test.ts
git commit -m "test(frontend): guard translation completeness

t() falls back to English for a missing language, so a gap is invisible
until a reader hits it. This fails instead, and names the key."
```

---

### Task 4: Polling and retry policy

Introduces the react-query mock. What is under test is this project's policy, not react-query's scheduler — the test file says so, because a green tick here does not mean intervals fire correctly.

**Files:**
- Create: `frontend/tests/hooks/useDocuments.test.ts`

**Interfaces:**
- Consumes: `useDocumentStatus(id: string)` from `@/hooks/useDocuments`, returning `{data, isLoading, loadError, pollError, errorCount, isChecking, recheck}`.
- Produces: the `vi.mock("@tanstack/react-query")` pattern reused in Task 5.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/hooks/useDocuments.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api-client";

/**
 * The options object the hook hands useQuery, captured so its policy
 * functions can be called directly.
 *
 * This tests the policy — stop when the document is finished, stop when the
 * query has given up, never retry a document that isn't there — and not
 * react-query's scheduler, which is react-query's to test.
 */
interface CapturedOptions {
  refetchInterval: (query: { state: { status: string; data?: { status: string } } }) => number | false;
  retry: (failureCount: number, error: unknown) => boolean;
}

let captured: CapturedOptions | null = null;
let queryResult: Record<string, unknown> = {};

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: CapturedOptions) => {
    captured = options;
    return queryResult;
  },
  useMutation: () => ({}),
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}));

const { useDocumentStatus } = await import("@/hooks/useDocuments");

function optionsFor(): CapturedOptions {
  queryResult = {
    data: undefined,
    isLoading: false,
    error: null,
    errorUpdateCount: 0,
    isFetching: false,
    refetch: () => {},
  };
  useDocumentStatus("d1");
  if (captured === null) throw new Error("useQuery was never called");
  return captured;
}

describe("useDocumentStatus polling", () => {
  let options: CapturedOptions;

  beforeEach(() => {
    options = optionsFor();
  });

  const interval = (status: string, data?: { status: string }) =>
    options.refetchInterval({ state: { status, data } });

  it.each(["pending", "processing"])("keeps polling while a document is %s", (docStatus) => {
    expect(interval("success", { status: docStatus })).toBe(3000);
  });

  it.each(["completed", "failed"])("stops once a document is %s", (docStatus) => {
    expect(interval("success", { status: docStatus })).toBe(false);
  });

  it("stops when nothing ever loaded and the query gave up", () => {
    expect(interval("error", undefined)).toBe(false);
  });

  it("does not retry a document that isn't there", () => {
    expect(options.retry(0, new ApiClientError(404, "gone"))).toBe(false);
    expect(options.retry(0, new ApiClientError(422, "bad uuid"))).toBe(false);
  });

  it("retries a server error, but not forever", () => {
    expect(options.retry(0, new ApiClientError(500, "boom"))).toBe(true);
    expect(options.retry(2, new ApiClientError(500, "boom"))).toBe(false);
  });
});

describe("useDocumentStatus error reporting", () => {
  it("calls a first-load failure a load error", () => {
    queryResult = {
      data: undefined,
      isLoading: false,
      error: new ApiClientError(500, "boom"),
      errorUpdateCount: 1,
      isFetching: false,
      refetch: () => {},
    };
    const result = useDocumentStatus("d1");

    expect(result.loadError).not.toBeNull();
    expect(result.pollError).toBeNull();
  });

  it("calls a failure after the document loaded a poll error", () => {
    queryResult = {
      data: { status: "processing" },
      isLoading: false,
      error: new ApiClientError(500, "boom"),
      errorUpdateCount: 1,
      isFetching: false,
      refetch: () => {},
    };
    const result = useDocumentStatus("d1");

    expect(result.pollError).not.toBeNull();
    expect(result.loadError).toBeNull();
  });
});
```

- [ ] **Step 2: Run it**

```bash
npx vitest run tests/hooks/useDocuments.test.ts
```

Expected: PASS. If it fails with "useQuery was never called", the `vi.mock` factory is missing an export the hook file imports — add it to the factory.

- [ ] **Step 3: Check the gates**

```bash
npx prettier --write tests/hooks/useDocuments.test.ts
npm run type-check && npm run lint && npm run format:check
```

- [ ] **Step 4: Commit**

```bash
git add tests/hooks/useDocuments.test.ts
git commit -m "test(frontend): pin the document polling policy

Stops on a terminal status, stops once the query has given up, and never
retries a document that isn't there. Tests the policy, not react-query's
scheduler; the file says so."
```

---

### Task 5: Interview stream messages

**Files:**
- Create: `frontend/tests/hooks/useInterview.test.ts`

**Interfaces:**
- Consumes: `streamErrorMessage(error: StreamError, lang: Language): string` and the `StreamError` union from `@/hooks/useInterview`. Its variants are `{kind:"stream"; code}`, `{kind:"http"; status; retryAfterSeconds}`, `{kind:"failed"}`, `{kind:"ended"}`, `{kind:"connection"}`.
- Produces: nothing later tasks consume.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/hooks/useInterview.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { t, type Language } from "@/lib/i18n";
import type { InterviewStreamErrorCode } from "@/types/api";

// The hook module pulls in react-query at import time; only the message
// function is under test here.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({}),
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}));

const { streamErrorMessage } = await import("@/hooks/useInterview");

const LANGS: Language[] = ["en", "id", "ja"];

const STREAM_CODES: Record<InterviewStreamErrorCode, string> = {
  question_failed: "streamQuestionFailed",
  answer_not_saved: "streamAnswerNotSaved",
  summary_failed: "streamSummaryFailed",
  summary_not_saved: "streamSummaryNotSaved",
};

describe("streamErrorMessage", () => {
  it.each(Object.entries(STREAM_CODES))("explains the %s code", (code, key) => {
    for (const lang of LANGS) {
      const message = streamErrorMessage(
        { kind: "stream", code: code as InterviewStreamErrorCode },
        lang,
      );
      expect(message).toBe(t("interview", key, lang));
      expect(message).not.toBe(key);
    }
  });

  it("explains an HTTP failure by its status", () => {
    expect(streamErrorMessage({ kind: "http", status: 502, retryAfterSeconds: null }, "ja")).toBe(
      t("common", "errorServer", "ja"),
    );
  });

  it("states the wait when a stream is refused for the AI budget", () => {
    // The interview shares the app's AI cap, so a reader who hits it needs the
    // same countdown they get everywhere else.
    expect(streamErrorMessage({ kind: "http", status: 429, retryAfterSeconds: 7200 }, "ja")).toBe(
      t("common", "errorRateLimitedHours", "ja").replace("{n}", "2"),
    );
  });

  it.each([
    ["failed", "common", "error"],
    ["ended", "interview", "streamEnded"],
    ["connection", "interview", "connectionLost"],
  ] as const)("explains a %s stream", (kind, section, key) => {
    expect(streamErrorMessage({ kind }, "ja")).toBe(t(section, key, "ja"));
  });
});
```

- [ ] **Step 2: Run it**

```bash
npx vitest run tests/hooks/useInterview.test.ts
```

Expected: PASS. If the import fails on `@microsoft/fetch-event-source`, add it to the mocks with `vi.mock("@microsoft/fetch-event-source", () => ({ fetchEventSource: () => {} }))`.

- [ ] **Step 3: Check the gates**

```bash
npx prettier --write tests/hooks/useInterview.test.ts
npm run type-check && npm run lint && npm run format:check
```

- [ ] **Step 4: Commit**

```bash
git add tests/hooks/useInterview.test.ts
git commit -m "test(frontend): cover interview stream error messages

Each stream code maps to a real translated message, and an HTTP failure
is explained by status — including the AI cap, where the reader gets the
same countdown as everywhere else."
```

---

### Task 6: The render helper and the culture page

Introduces jsdom rendering. The culture page is the simplest real page — no route params, two mocked hooks — so it proves the helper before the harder page depends on it.

**Files:**
- Create: `frontend/tests/helpers.tsx`
- Create: `frontend/tests/app/culture.test.tsx`

**Interfaces:**
- Consumes: `CulturePage` (default export, no props) from `@/app/dashboard/culture/page`; `useCultureTopics`, `useGlossary` from `@/hooks/useCulture`.
- Produces: `renderIn(lang: Language, ui: React.ReactElement): RenderResult` from `tests/helpers`, used by Tasks 7 and 8.

- [ ] **Step 1: Write the helper**

Create `frontend/tests/helpers.tsx`:

```tsx
import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/lib/language-context";
import type { Language } from "@/lib/i18n";

/**
 * Render inside the real LanguageProvider.
 *
 * Deliberately not the app's Providers component: it builds a QueryClient
 * with retry: 1, so every error-path test would wait on a retry. Pages get
 * their data through hooks, and those are mocked per test.
 */
export function renderIn(lang: Language, ui: ReactElement): RenderResult {
  return render(<LanguageProvider initialLang={lang}>{ui}</LanguageProvider>);
}
```

- [ ] **Step 2: Write the failing test**

Create `frontend/tests/app/culture.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderIn } from "../helpers";
import { t } from "@/lib/i18n";

const topicsQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const glossaryQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("@/hooks/useCulture", () => ({
  useCultureTopics: () => topicsQuery.current,
  useGlossary: () => glossaryQuery.current,
}));

const CulturePage = (await import("@/app/dashboard/culture/page")).default;

const LOADING = { data: undefined, isLoading: true, error: null, isFetching: true, refetch: () => {} };
const FAILED = {
  data: undefined,
  isLoading: false,
  error: new Error("boom"),
  isFetching: false,
  refetch: () => {},
};
const EMPTY = { data: [], isLoading: false, error: null, isFetching: false, refetch: () => {} };
const LOADED = {
  data: [{ id: "1", slug: "keigo", title: "Keigo", tags: [], published_at: "2026-01-01" }],
  isLoading: false,
  error: null,
  isFetching: false,
  refetch: () => {},
};

function renderCulture(topics: Record<string, unknown>, glossary: Record<string, unknown>) {
  topicsQuery.current = topics;
  glossaryQuery.current = glossary;
  return renderIn("ja", <CulturePage />);
}

describe("culture page", () => {
  it("says so when topics fail to load", () => {
    renderCulture(FAILED, EMPTY);

    expect(screen.getByRole("alert")).toHaveTextContent(t("culture", "topicsLoadError", "ja"));
  });

  it("offers a retry rather than telling the reader to refresh", () => {
    renderCulture(FAILED, EMPTY);

    expect(screen.getByRole("button", { name: t("common", "tryAgain", "ja") })).toBeInTheDocument();
  });

  it("does not show a failed load as an empty shelf", () => {
    // The empty state is guarded on the list being present, so before this
    // the page rendered a heading, the tabs, and nothing else.
    renderCulture(FAILED, EMPTY);

    expect(screen.queryByText(t("culture", "noTopics", "ja"))).not.toBeInTheDocument();
  });

  it("shows no error while a load is still running", () => {
    renderCulture(LOADING, EMPTY);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the empty state for a genuinely empty result", () => {
    renderCulture(EMPTY, EMPTY);

    expect(screen.getByText(t("culture", "noTopics", "ja"))).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lists topics that loaded, with no error", () => {
    renderCulture(LOADED, EMPTY);

    expect(screen.getByText("Keigo")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it**

```bash
npx vitest run tests/app/culture.test.tsx
```

Expected: PASS. If `vi.mock` throws "Cannot access before initialization", the mocked values must be declared with `vi.hoisted` as above — `vi.mock` factories are hoisted above ordinary `const`s.

- [ ] **Step 4: Check the gates**

```bash
npx prettier --write tests/helpers.tsx tests/app/culture.test.tsx
npm run type-check && npm run lint && npm run format:check
```

- [ ] **Step 5: Commit**

```bash
git add tests/helpers.tsx tests/app/culture.test.tsx
git commit -m "test(frontend): render the culture page's load states

Adds the render helper and the first page test. Pins the bug this page
had: a failed load rendered nothing at all, because the empty state is
guarded on the list being present."
```

---

### Task 7: The document detail page

The largest page test: ten failure codes, two kinds of load failure, and a download link that can fail on its own.

**Files:**
- Create: `frontend/tests/app/documents-detail.test.tsx`

**Interfaces:**
- Consumes: `DocumentDetailPage` (default export, props `{ params: Promise<{ id: string }> }`) from `@/app/dashboard/documents/[id]/page`; `useDocumentStatus`, `useDocumentDetail` from `@/hooks/useDocuments`; `renderIn` from `tests/helpers`.
- Produces: nothing later tasks consume.

**Note on route params:** the page reads `params` with React's `use()`, which suspends even on an already-resolved promise. Every render must be wrapped in `<Suspense>` and awaited with `findBy*`, as the helper below does.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/app/documents-detail.test.tsx`:

```tsx
import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderIn } from "../helpers";
import { ApiClientError } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import type { DocumentErrorCode } from "@/types/api";

const statusQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const detailQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("@/hooks/useDocuments", () => ({
  useDocumentStatus: () => statusQuery.current,
  useDocumentDetail: () => detailQuery.current,
}));

const DocumentDetailPage = (await import("@/app/dashboard/documents/[id]/page")).default;

const NO_DETAIL = { data: undefined, error: null, errorCount: 0, isFetching: false, refetch: () => {} };

/** Render the page and wait for its route params to resolve. */
async function renderPage(status: Record<string, unknown>, detail = NO_DETAIL) {
  statusQuery.current = status;
  detailQuery.current = detail;
  renderIn(
    "ja",
    <Suspense fallback={null}>
      <DocumentDetailPage params={Promise.resolve({ id: "d1" })} />
    </Suspense>,
  );
  // Anything rendered by the page proves the params resolved.
  await screen.findByText((_, element) => element?.tagName === "NAV" || false, { exact: false });
}

function statusState(over: Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: false,
    loadError: null,
    pollError: null,
    errorCount: 1,
    isChecking: false,
    recheck: () => {},
    ...over,
  };
}

function failedWith(code: string | null) {
  return statusState({ data: { status: "failed", error_code: code, completed_at: null } });
}

describe("document detail page, no document to show", () => {
  it("says not found for a 404, with nothing to retry", async () => {
    await renderPage(statusState({ loadError: new ApiClientError(404, "gone") }));

    expect(screen.getByText(t("documents", "notFound", "ja"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("common", "tryAgain", "ja") })).not.toBeInTheDocument();
  });

  it("offers a retry for a failure that might not repeat", async () => {
    await renderPage(statusState({ loadError: new ApiClientError(500, "boom") }));

    expect(screen.getByRole("alert")).toHaveTextContent(t("documents", "statusLoadError", "ja"));
    expect(screen.getByRole("button", { name: t("common", "tryAgain", "ja") })).toBeInTheDocument();
    expect(screen.queryByText(t("documents", "notFound", "ja"))).not.toBeInTheDocument();
  });

  it("keeps the retry button focusable while it re-checks", async () => {
    await renderPage(
      statusState({ loadError: new ApiClientError(500, "boom"), isChecking: true }),
    );

    const button = screen.getByRole("button", { name: t("common", "retrying", "ja") });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
  });
});

describe("document detail page, a document that failed", () => {
  const CODES: Array<[DocumentErrorCode, string]> = [
    ["budget_exceeded", "genFailedBudget"],
    ["profile_incomplete", "genFailedProfile"],
    ["resume_missing", "genFailedResume"],
    ["file_unavailable", "genFailedFile"],
    ["unreadable_file", "genFailedUnreadable"],
    ["ai_failed", "genFailedAi"],
    ["pdf_failed", "genFailedPdf"],
    ["upload_failed", "genFailedUpload"],
    ["timed_out", "genFailedTimeout"],
    ["unknown", "genFailedUnknown"],
  ];

  it.each(CODES)("explains the %s failure", async (code, key) => {
    await renderPage(failedWith(code));

    expect(screen.getByRole("alert")).toHaveTextContent(t("documents", key, "ja"));
  });

  it("falls back for a code this version doesn't know", async () => {
    await renderPage(failedWith("a_code_from_a_newer_backend"));

    expect(screen.getByRole("alert")).toHaveTextContent(t("documents", "genFailedUnknown", "ja"));
  });

  it("falls back for a failure recorded before codes existed", async () => {
    await renderPage(failedWith(null));

    expect(screen.getByRole("alert")).toHaveTextContent(t("documents", "genFailedUnknown", "ja"));
  });

  it("links to settings for the one failure fixed elsewhere", async () => {
    await renderPage(failedWith("profile_incomplete"));

    expect(screen.getByRole("link", { name: t("documents", "goToSettings", "ja") })).toHaveAttribute(
      "href",
      "/dashboard/settings",
    );
  });

  it("does not link to settings for other failures", async () => {
    await renderPage(failedWith("ai_failed"));

    expect(
      screen.queryByRole("link", { name: t("documents", "goToSettings", "ja") }),
    ).not.toBeInTheDocument();
  });
});

describe("document detail page, a document still running", () => {
  const RUNNING = statusState({
    data: { status: "processing", error_code: null, completed_at: null },
  });

  it("shows progress", async () => {
    await renderPage(RUNNING);

    expect(screen.getByText(t("documents", "generating", "ja"))).toBeInTheDocument();
  });

  it("warns that a failed poll may have left it out of date, without hiding it", async () => {
    await renderPage(statusState({ ...RUNNING, pollError: new ApiClientError(500, "boom") }));

    expect(screen.getByRole("alert")).toHaveTextContent(t("documents", "statusPollError", "ja"));
    expect(screen.getByText(t("documents", "generating", "ja"))).toBeInTheDocument();
  });
});

describe("document detail page, a finished document", () => {
  const DONE = statusState({
    data: { status: "completed", error_code: null, completed_at: "2026-09-20T01:00:00Z" },
  });

  it("offers the download once the link arrives", async () => {
    await renderPage(DONE, { ...NO_DETAIL, data: { download_url: "https://example.test/d.pdf" } });

    expect(screen.getByRole("link", { name: t("documents", "downloadPdf", "ja") })).toBeInTheDocument();
  });

  it("says the link is being prepared while it is", async () => {
    await renderPage(DONE);

    expect(screen.getByText(t("documents", "preparingLink", "ja"))).toBeInTheDocument();
  });

  it("distinguishes a failed link from one still being prepared", async () => {
    // The generation succeeded; only signing the URL failed. Before this the
    // page showed the waiting spinner forever.
    await renderPage(DONE, { ...NO_DETAIL, error: new ApiClientError(502, "no url") });

    expect(screen.getByRole("alert")).toHaveTextContent(t("documents", "linkError", "ja"));
    expect(screen.queryByText(t("documents", "preparingLink", "ja"))).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it**

```bash
npx vitest run tests/app/documents-detail.test.tsx
```

Expected: PASS. If every test times out in `renderPage`, the `findByText` predicate is not matching — replace it with `await screen.findByRole("heading")` for the completed and running cases, or assert on the breadcrumb text directly.

- [ ] **Step 3: Check the gates**

```bash
npx prettier --write tests/app/documents-detail.test.tsx
npm run type-check && npm run lint && npm run format:check
```

- [ ] **Step 4: Commit**

```bash
git add tests/app/documents-detail.test.tsx
git commit -m "test(frontend): render every document failure branch

All ten error codes, an unknown code and a null one, a 404 told apart
from a retryable failure, and a download link that failed told apart
from one still being prepared."
```

---

### Task 8: The chat widget

The only test that interacts. Covers the paths the last review found defects in.

**Files:**
- Create: `frontend/tests/components/chat-widget.test.tsx`

**Interfaces:**
- Consumes: `ChatWidget` (named export, no props) from `@/components/chat-widget`; `renderIn` from `tests/helpers`.
- Produces: nothing later tasks consume.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/components/chat-widget.test.tsx`:

```tsx
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderIn } from "../helpers";
import { t, type Language } from "@/lib/i18n";
import { ChatWidget } from "@/components/chat-widget";

vi.mock("@clerk/nextjs", () => ({
  SignedIn: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignedOut: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const LANGS: Language[] = ["en", "id", "ja"];

/** Open the widget in the given language. */
function openWidget(lang: Language) {
  renderIn(lang, <ChatWidget />);
  fireEvent.click(screen.getByRole("button", { name: t("chat", "openChat", lang) }));
}

/** Answer the next fetch with this response, then send a message. */
function answerWith(response: { status: number; body?: unknown; retryAfter?: string | null }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      headers: { get: (name: string) => (name === "Retry-After" ? (response.retryAfter ?? null) : null) },
      json: async () => {
        if (response.body === undefined) throw new SyntaxError("not JSON");
        return response.body;
      },
    })),
  );
}

async function send(lang: Language) {
  fireEvent.change(screen.getByRole("textbox", { name: t("chat", "inputLabel", lang) }), {
    target: { value: "hello" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("chat", "send", lang) }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chat widget rendering", () => {
  it.each(LANGS)("shows its greeting and controls in %s", (lang) => {
    openWidget(lang);

    expect(screen.getByText(t("chat", "greeting", lang))).toBeInTheDocument();
    expect(screen.getByText(t("chat", "title", lang))).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: t("chat", "inputLabel", lang) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("chat", "send", lang) })).toBeInTheDocument();
    expect(screen.getByRole("log", { name: t("chat", "conversation", lang) })).toBeInTheDocument();
  });

  it("renders the greeting from the current language, not the one at mount", () => {
    // It used to live in useState's initial value, so it froze.
    openWidget("en");
    expect(screen.getByText(t("chat", "greeting", "en"))).toBeInTheDocument();
  });
});

describe("chat widget failures", () => {
  it("uses the chat wording for a rate limit that comes with a countdown", async () => {
    openWidget("ja");
    answerWith({ status: 429, body: {}, retryAfter: "7200" });
    await send("ja");

    await waitFor(() => {
      expect(screen.getByText(t("chat", "limitReached", "ja"))).toBeInTheDocument();
    });
  });

  it("falls back to the shared message when no countdown will render", async () => {
    // Retry-After can legitimately be absent or zero; claiming a countdown
    // then points at something that never appears.
    openWidget("ja");
    answerWith({ status: 429, body: {}, retryAfter: null });
    await send("ja");

    await waitFor(() => {
      expect(screen.getByText(t("common", "errorRateLimited", "ja"))).toBeInTheDocument();
    });
    expect(screen.queryByText(t("chat", "limitReached", "ja"))).not.toBeInTheDocument();
  });

  it("explains a failed AI call by status", async () => {
    openWidget("ja");
    answerWith({ status: 502, body: {} });
    await send("ja");

    await waitFor(() => {
      expect(screen.getByText(t("common", "errorServer", "ja"))).toBeInTheDocument();
    });
  });

  it("does not blame the connection for a reply it could not parse", async () => {
    openWidget("ja");
    answerWith({ status: 200 });
    await send("ja");

    await waitFor(() => {
      expect(screen.getByText(t("common", "error", "ja"))).toBeInTheDocument();
    });
    expect(screen.queryByText(t("common", "errorConnection", "ja"))).not.toBeInTheDocument();
  });

  it("leaves no blank bubble for an empty reply", async () => {
    openWidget("ja");
    answerWith({ status: 200, body: {} });
    await send("ja");

    await waitFor(() => {
      expect(screen.getByText(t("common", "error", "ja"))).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run it**

```bash
npx vitest run tests/components/chat-widget.test.tsx
```

Expected: PASS. If `getByRole("log")` finds nothing, the widget is closed — the toggle click in `openWidget` did not land, so check the button's accessible name against `t("chat", "openChat", lang)`.

- [ ] **Step 3: Check the gates**

```bash
npx prettier --write tests/components/chat-widget.test.tsx
npm run type-check && npm run lint && npm run format:check
```

- [ ] **Step 4: Commit**

```bash
git add tests/components/chat-widget.test.tsx
git commit -m "test(frontend): drive the chat widget's error paths

Sends a real message against a stubbed fetch and reads the assistant
bubble: a rate limit with and without a countdown, a failed AI call, a
reply that won't parse, and an empty one."
```

---

### Task 9: Repo-wide invariants

Lint-shaped tests that read source as data. They catch a class of regression no type or unit test can see, and the file says plainly what it is.

**Files:**
- Create: `frontend/tests/invariants.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks; reads files from `frontend/app`, `frontend/components`, `frontend/types/api.ts`, and `backend/app/models/enums.py`, `backend/app/api/v1/interview.py`.
- Produces: nothing later tasks consume.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/invariants.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Repo-wide guards.
 *
 * These read source files as data rather than importing them: they are
 * lint-shaped, not unit tests, and they exist because the things they check
 * fail silently. A mismatched enum degrades to "unknown" and nobody notices;
 * a page that renders the backend's English reads fine in English.
 *
 * They need updating when files move. That is the cost.
 */
const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const BACKEND = join(FRONTEND, "..", "backend");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** The members of a Python str-enum class body. */
function pythonEnumMembers(source: string, className: string): string[] {
  const body = source.split(`class ${className}(str, enum.Enum):`)[1] ?? "";
  const upToNextClass = body.split("\nclass ")[0];
  return [...upToNextClass.matchAll(/^ {4}(\w+) = "(\w+)"$/gm)].map((m) => m[2] as string);
}

/** The members of a TypeScript string-literal union. */
function tsUnionMembers(source: string, typeName: string): string[] {
  const body = source.split(`export type ${typeName} =`)[1] ?? "";
  const upToSemicolon = body.split(";")[0];
  return [...upToSemicolon.matchAll(/"(\w+)"/g)].map((m) => m[1] as string);
}

describe("no page renders the server's own error text", () => {
  it("finds no .detail or error.message in app/ or components/", () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles(join(FRONTEND, "app")), ...sourceFiles(join(FRONTEND, "components"))]) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        // step.detail is a visa roadmap field and body.detail is the chat
        // widget's own parse of a response — neither is an error on screen.
        const reads = /\.detail\b/.test(line) && !/step\.detail|body\.detail/.test(line);
        if (reads || /\berror\.message\b/.test(line)) {
          offenders.push(`${relative(FRONTEND, file)}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe("the error code contracts match the backend", () => {
  const enums = readFileSync(join(BACKEND, "app/models/enums.py"), "utf8");
  const apiTypes = readFileSync(join(FRONTEND, "types/api.ts"), "utf8");

  it("DocumentErrorCode matches", () => {
    expect(tsUnionMembers(apiTypes, "DocumentErrorCode").sort()).toEqual(
      pythonEnumMembers(enums, "DocumentErrorCode").sort(),
    );
  });

  it("InterviewStreamErrorCode matches", () => {
    expect(tsUnionMembers(apiTypes, "InterviewStreamErrorCode").sort()).toEqual(
      pythonEnumMembers(enums, "InterviewStreamErrorCode").sort(),
    );
  });

  it("every interview stream failure sends a code", () => {
    const route = readFileSync(join(BACKEND, "app/api/v1/interview.py"), "utf8");
    // _sse_error("...") with a bare string means a failure the client cannot
    // translate.
    expect(route).not.toMatch(/_sse_error\("/);
  });
});
```

- [ ] **Step 2: Run it**

```bash
npx vitest run tests/invariants.test.ts
```

Expected: PASS. If an enum comparison fails with an empty array on one side, the parser did not find the class or type — check the exact declaration text in the source it reads.

- [ ] **Step 3: Check the gates**

```bash
npx prettier --write tests/invariants.test.ts
npm run type-check && npm run lint && npm run format:check
```

- [ ] **Step 4: Commit**

```bash
git add tests/invariants.test.ts
git commit -m "test(frontend): guard the repo-wide invariants

No page renders the server's English, and the two error-code unions
match the backend enums they mirror. Both fail silently otherwise."
```

---

### Task 10: Run it in CI

**Files:**
- Modify: `.github/workflows/ci.yml` (frontend job, between *Format check* and *Build*)

**Interfaces:**
- Consumes: the `test` script from Task 1.
- Produces: the CI gate.

- [ ] **Step 1: Run the whole suite locally first**

```bash
cd frontend && npm test
```

Expected: every test file passes. Fix anything red before touching CI.

- [ ] **Step 2: Add the step**

In `.github/workflows/ci.yml`, in the `frontend` job, insert after the *Format check* step and before *Build*:

```yaml
      - name: Test
        run: npm test
```

- [ ] **Step 3: Verify the workflow still parses**

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('ci.yml parses')"
```

Expected: `ci.yml parses`.

- [ ] **Step 4: Confirm the gate is real**

Temporarily break one assertion — in `frontend/tests/lib/i18n.test.ts`, change `expect(missing).toEqual([])` to `expect(missing).toEqual(["nonsense"])` — then run `npm test` and confirm it fails. Revert the change and confirm it passes again.

- [ ] **Step 5: Commit**

```bash
git add ../.github/workflows/ci.yml
git commit -m "ci: run the frontend test suite

The frontend job proved the code compiled and was formatted. It now
proves it behaves, the way the backend job already did."
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: dependencies, config, scripts and layout to Task 1; the render helper and mocking boundaries to Tasks 4 and 6; the nine test files to Tasks 1–9 (`file-rejection` 1, `api-error` 2, `i18n` 3, `useDocuments` 4, `useInterview` 5, `culture` 6, `documents-detail` 7, `chat-widget` 8, `invariants` 9); CI to Task 10. The spec's out-of-scope list adds no tasks, correctly.

**Placeholders.** None. Every step names exact files and contains the code to write or the command to run.

**Type consistency.** `renderIn(lang, ui)` is defined in Task 6 and used with that argument order in Tasks 7 and 8. `statusState`/`failedWith` are local to Task 7. The captured-options pattern is defined in Task 4 and re-used in Task 5 with its own smaller mock, deliberately — Task 5 needs react-query stubbed only so the module imports, not captured.

**One gap found and closed:** the spec's `useInterview` line mentions HTTP stream failures carrying `Retry-After`, which the first draft of Task 5 asserted only for a 502. The 429 case is now covered, since that is the one where the header changes the message.
