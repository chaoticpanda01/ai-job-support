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
    const tsMembers = tsUnionMembers(apiTypes, "DocumentErrorCode");
    const pyMembers = pythonEnumMembers(enums, "DocumentErrorCode");
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
  });
});
