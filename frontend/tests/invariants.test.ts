import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
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
 *
 * The `.detail` walk covers `app/` and `components/` only -- not `hooks/`
 * or `lib/`. That boundary is deliberate: widening it would flag the
 * legitimate plumbing in `lib/api-client.ts` and `lib/api-error.ts`, which
 * read `.detail` off the response to build the very messages this guard
 * exists to keep off the page. It is also a real gap: a hook that returned
 * `{ message: err.message }` for a component to render straight through
 * would slip past this check entirely, since neither the hook (in `hooks/`)
 * nor the component's own read of that field (`.message`, not `.detail` or
 * `error.message`) trips the pattern above.
 *
 * Path resolution note: this deliberately avoids the literal pattern
 * `new URL("..", import.meta.url)` — Vite's import-analysis plugin
 * statically recognizes that exact shape and rewrites it into a dev-server
 * asset URL (`http://localhost:.../@fs/...`) instead of leaving it as a
 * file:// URL, which breaks under vitest's jsdom environment. Resolving the
 * file path first and joining afterward sidesteps that rewrite.
 */
const THIS_FILE = fileURLToPath(import.meta.url);
const FRONTEND = join(dirname(THIS_FILE), "..");
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
  const upToNextClass = body.split("\nclass ")[0] ?? "";
  return [...upToNextClass.matchAll(/^ {4}(\w+) = "(\w+)"$/gm)].map((m) => m[2] as string);
}

/**
 * The string literals in a `const NAME = [...]` array. Flat arrays only: it
 * stops at the first `]`, so a nested array would truncate the result. Every
 * caller below asserts the result is non-empty, because a rename or an added
 * type annotation makes this return [] rather than fail.
 */
function tsConstArray(source: string, name: string): string[] {
  const body = source.split(`const ${name} = [`)[1] ?? "";
  const upToClose = body.split("]")[0] ?? "";
  return [...upToClose.matchAll(/"(\w+)"/g)].map((m) => m[1] as string);
}

/** The members of a TypeScript string-literal union. */
function tsUnionMembers(source: string, typeName: string): string[] {
  const body = source.split(`export type ${typeName} =`)[1] ?? "";
  const upToSemicolon = body.split(";")[0] ?? "";
  return [...upToSemicolon.matchAll(/"(\w+)"/g)].map((m) => m[1] as string);
}

describe("no page renders the server's own error text", () => {
  it("finds no .detail or error.message in app/ or components/", () => {
    const offenders: string[] = [];
    for (const file of [
      ...sourceFiles(join(FRONTEND, "app")),
      ...sourceFiles(join(FRONTEND, "components")),
    ]) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        // step.detail is a visa roadmap field, not an error on screen. (The
        // chat widget used to read body.detail from the response too, but it
        // no longer parses the body at all -- there is nothing left under
        // app/ or components/ for that exclusion to cover, so it is not
        // carried here. Confirmed by grep before removing it.)
        const reads = /\.detail\b/.test(line) && !/step\.detail/.test(line);
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
    const tsMembers = tsUnionMembers(apiTypes, "DocumentErrorCode");
    const pyMembers = pythonEnumMembers(enums, "DocumentErrorCode");
    expect(tsMembers.length).toBeGreaterThan(0);
    expect(pyMembers.length).toBeGreaterThan(0);
    expect(tsMembers.sort()).toEqual(pyMembers.sort());
  });

  it("AnalysisErrorCode matches", () => {
    const tsMembers = tsUnionMembers(apiTypes, "AnalysisErrorCode");
    const pyMembers = pythonEnumMembers(enums, "AnalysisErrorCode");
    expect(tsMembers.length).toBeGreaterThan(0);
    expect(pyMembers.length).toBeGreaterThan(0);
    expect(tsMembers.sort()).toEqual(pyMembers.sort());
  });

  it("InterviewStreamErrorCode matches", () => {
    const tsMembers = tsUnionMembers(apiTypes, "InterviewStreamErrorCode");
    const pyMembers = pythonEnumMembers(enums, "InterviewStreamErrorCode");
    expect(tsMembers.length).toBeGreaterThan(0);
    expect(pyMembers.length).toBeGreaterThan(0);
    expect(tsMembers.sort()).toEqual(pyMembers.sort());
  });

  it("every interview stream failure sends a code", () => {
    const route = readFileSync(join(BACKEND, "app/api/v1/interview.py"), "utf8");
    // _sse_error("...") with a bare string means a failure the client cannot
    // translate.
    expect(route).not.toMatch(/_sse_error\("/);

    // Positive anchor: the check above only asserts an absence, so renaming
    // _sse_error to anything else -- or deleting every call to it -- would
    // leave it green while verifying nothing. Pin that the coded form is
    // actually present, in at least as many places as exist today, so the
    // guard depends on _sse_error being called with a code rather than on
    // no bare-string call happening to exist.
    const codedCalls = route.match(/_sse_error\(\s*InterviewStreamErrorCode\./g) ?? [];
    expect(codedCalls.length).toBeGreaterThanOrEqual(8);
  });
});

describe("the rirekisho required fields match the backend", () => {
  // The Settings banner deliberately re-implements a subset of
  // rirekisho_missing_fields() so it can update as the reader types, instead
  // of a request per keystroke. The page says in so many words that the two
  // are kept in sync by hand, which is what this guards: a field added to
  // the backend's list and not here means the banner says "ready" for a
  // profile that generation will reject.
  const py = readFileSync(join(BACKEND, "app/services/rirekisho_completeness.py"), "utf8");
  const page = readFileSync(join(FRONTEND, "app/dashboard/settings/page.tsx"), "utf8");
  const requiredKeys = [
    ...tsConstArray(page, "BASE_REQUIRED_KEYS"),
    ...tsConstArray(page, "VISA_HELD_REQUIRED_KEYS"),
  ];

  it("reads the required keys at all", () => {
    // Every test below iterates requiredKeys, and a loop over [] passes while
    // checking nothing. Renaming either const, or giving it a type
    // annotation, empties it silently -- so assert it here, once, loudly.
    expect(requiredKeys.length).toBeGreaterThan(0);
  });

  it("requires the same set of fields", () => {
    const pyKeys = [...py.matchAll(/"key": "(\w+)"/g)].map((m) => m[1] as string);
    expect(requiredKeys.length).toBeGreaterThan(0);
    expect(pyKeys.length).toBeGreaterThan(0);
    expect([...new Set(requiredKeys)].sort()).toEqual([...new Set(pyKeys)].sort());
  });

  it("agrees on the age range a date of birth must fall in", () => {
    const pyRange = py.match(/(\d+) <= age <= (\d+)/);
    const tsRange = page.match(/age < (\d+) \|\| age > (\d+)/);
    expect(pyRange).not.toBeNull();
    expect(tsRange).not.toBeNull();
    expect([tsRange?.[1], tsRange?.[2]]).toEqual([pyRange?.[1], pyRange?.[2]]);
  });

  it("gives every required field a label of its own", () => {
    // A key with no entry falls back to t()'s unknown-key behaviour, which
    // prints the raw key -- "phone_number" in the middle of a sentence.
    const labelled = [...page.matchAll(/^  (\w+): "(\w+)",$/gm)].map((m) => m[1] as string);
    expect(requiredKeys.length).toBeGreaterThan(0);
    for (const key of requiredKeys) {
      expect(labelled).toContain(key);
    }
  });

  it("decides every required field in isFieldMissing", () => {
    // isFieldMissing's default arm returns false, so a required key with no
    // case of its own is silently never missing: the banner reports the
    // profile ready and generation then rejects it. That is the exact
    // failure this whole describe exists to prevent, and it is invisible to
    // a page test unless a fixture happens to leave that one field empty.
    const handled = [...page.matchAll(/^    case "(\w+)":$/gm)].map((m) => m[1] as string);
    expect(requiredKeys.length).toBeGreaterThan(0);
    for (const key of requiredKeys) {
      expect(handled).toContain(key);
    }
  });
});
