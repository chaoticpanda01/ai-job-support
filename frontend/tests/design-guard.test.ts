// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { translations } from "@/lib/i18n";

/**
 * Keeps the pages on the design system. Every .tsx file under app/ and
 * components/ (components/ui/ excepted: it is the design system) is scanned
 * for the four things the page migration removed. A file still waiting to be
 * migrated is listed in NOT_YET_MIGRATED; a permanent, reasoned exception is
 * listed in ALLOWED. Read as data, not imported, like tests/invariants.test.ts.
 */

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), "..");

type Rule = "palette" | "glyph" | "rawControl" | "h1";

const RULES: Record<Rule, RegExp> = {
  // A Tailwind palette colour instead of a token: text-green-600, bg-blue-100…
  palette:
    /\b(?:text|bg|border|ring|from|to|via|fill|stroke|divide|outline|placeholder|accent|decoration)-(?:red|green|blue|yellow|amber|orange|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|lime|gray|slate|zinc|neutral|stone)-\d{2,3}\b/,
  // An arrow, dingbat or emoji used as an icon: ← → ✓ ✕ 🏠 🤖 💬…
  glyph: /[\u2190-\u21FF\u2600-\u27BF\u{1F300}-\u{1FAFF}]/u,
  // A control built by hand instead of the form primitives. react-dropzone's
  // hidden file input is the one raw <input> allowed.
  rawControl: /<(?:input|select|textarea)\b(?!\s*\{\.\.\.getInputProps\(\)\}\s*\/>)/,
  // A page title outside PageHeader.
  h1: /<h1\b/,
};

/** Permanent exceptions. Each names the rules it may break and why. */
const ALLOWED: Record<string, { rules: Rule[]; reason: string }> = {
  "components/landing/landing-page.tsx": {
    rules: ["h1"],
    reason: "The landing hero is its own h1, outside the app shell.",
  },
  "components/error-fallback.tsx": {
    rules: ["h1"],
    reason: "A full-screen error state with its own layout.",
  },
  "components/not-found-content.tsx": {
    rules: ["h1"],
    reason: "A full-screen not-found state with its own layout.",
  },
};

/** Files the migration hasn't reached. Each area task deletes its own. */
const NOT_YET_MIGRATED: Record<string, string> = {
  // Task 4: Apply
  "app/dashboard/interview/page.tsx": "Apply, task 4",
  "app/dashboard/interview/new/page.tsx": "Apply, task 4",
  "app/dashboard/interview/[id]/page.tsx": "Apply, task 4",
  "app/dashboard/jobs/translate/page.tsx": "Apply, task 4",
  // Task 5: Settle in
  "app/dashboard/visa/page.tsx": "Settle in, task 5",
  "app/dashboard/visa/[id]/page.tsx": "Settle in, task 5",
  "components/visa/visa-checklist.tsx": "Settle in, task 5",
  "components/visa/visa-option-card.tsx": "Settle in, task 5",
  "components/visa/visa-roadmap-switcher.tsx": "Settle in, task 5",
  "app/dashboard/culture/page.tsx": "Settle in, task 5",
  "app/dashboard/culture/[slug]/page.tsx": "Settle in, task 5",
  // Task 6: Onboarding
  "app/onboarding/page.tsx": "Onboarding, task 6",
  // Task 7: the rest
  "app/admin/page.tsx": "Admin, task 7",
  "components/chat-widget.tsx": "Chat widget, task 7",
  // Rebuilt by spec 3 (the job pipeline), not migrated here.
  "app/dashboard/jobs/page.tsx": "Rebuilt in spec 3",
  "app/dashboard/jobs/[id]/page.tsx": "Rebuilt in spec 3",
  "app/dashboard/jobs/applications/page.tsx": "Rebuilt in spec 3",
};

/**
 * Translated strings that still carry an arrow or emoji. A glyph inside the
 * copy dodges the file scan above, so the strings are checked too: the page
 * draws the arrow as a lucide icon instead. Each area task deletes its own.
 */
const STRINGS_NOT_YET_MIGRATED: Record<string, string> = {
  "interview.review": "Apply, task 4",
  "interview.backToList": "Apply, task 4",
  "jobs.backToJobs": "Apply, task 4",
  "culture.backToCulture": "Settle in, task 5",
  "onboarding.s1DangerZone": "Onboarding, task 6",
  "jobs.jobBoard": "Rebuilt in spec 3",
};

/** Every "section.key" whose text, in any language, has a glyph. */
function glyphStrings(): string[] {
  const found: string[] = [];
  for (const [section, entries] of Object.entries(translations)) {
    for (const [key, value] of Object.entries(entries as Record<string, Record<string, string>>)) {
      if (Object.values(value).some((text) => RULES.glyph.test(text))) {
        found.push(`${section}.${key}`);
      }
    }
  }
  return found.sort();
}

function sourceFiles(): string[] {
  const files: string[] = [];
  for (const dir of ["app", "components"]) {
    for (const entry of readdirSync(join(FRONTEND, dir), { recursive: true })) {
      const path = `${dir}/${String(entry).split("\\").join("/")}`;
      if (path.endsWith(".tsx") && !path.startsWith("components/ui/")) files.push(path);
    }
  }
  return files.sort();
}

/** Comments may say anything: "→" in a note is not an icon. URLs keep their //. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function violations(source: string): Rule[] {
  const code = stripComments(source);
  return (Object.keys(RULES) as Rule[]).filter((rule) => RULES[rule].test(code));
}

const read = (file: string) => readFileSync(join(FRONTEND, file), "utf8");
const FILES = sourceFiles();

describe("the design guard", () => {
  it("scans the app's source files", () => {
    // A guard that finds no files passes while checking nothing.
    expect(FILES.length).toBeGreaterThan(40);
    expect(FILES).toContain("app/dashboard/page.tsx");
  });

  it("catches each kind of violation, and ignores comments and the dropzone input", () => {
    expect(violations('<p className="text-green-600">x</p>')).toEqual(["palette"]);
    expect(violations("<span>🏠</span>")).toEqual(["glyph"]);
    expect(violations("<a>View →</a>")).toEqual(["glyph"]);
    expect(violations('<input type="text" />')).toEqual(["rawControl"]);
    expect(violations("<textarea rows={3} />")).toEqual(["rawControl"]);
    expect(violations("<h1>Title</h1>")).toEqual(["h1"]);
    expect(violations("<input {...getInputProps()} />")).toEqual([]);
    expect(violations("// a note → about text-red-500\n/* <h1> */")).toEqual([]);
    expect(violations('<a href="https://example.com">x</a>')).toEqual([]);
    // Tokens and CJK text are fine.
    expect(
      violations('<p lang="ja" className="bg-indigo-soft text-success">履歴書・職務経歴書</p>'),
    ).toEqual([]);
  });

  it.each(FILES.filter((file) => !(file in NOT_YET_MIGRATED)))(
    "%s is on the design system",
    (file) => {
      const allowed = ALLOWED[file]?.rules ?? [];
      expect(violations(read(file)).filter((rule) => !allowed.includes(rule))).toEqual([]);
    },
  );

  it.each(Object.keys(NOT_YET_MIGRATED))("%s still needs migrating", (file) => {
    // Once a file is clean its entry must go, so the list can't hide a
    // regression in a file everyone thinks is done.
    expect(violations(read(file)).length).toBeGreaterThan(0);
  });

  it("keeps arrows and emoji out of the translated strings", () => {
    expect(glyphStrings().filter((key) => !(key in STRINGS_NOT_YET_MIGRATED))).toEqual([]);
  });

  it.each(Object.keys(STRINGS_NOT_YET_MIGRATED))(
    "the string %s still needs its glyph removed",
    (key) => {
      expect(glyphStrings()).toContain(key);
    },
  );

  it.each(Object.entries(ALLOWED))("%s still needs its exception", (file, { rules }) => {
    const found = violations(read(file));
    for (const rule of rules) expect(found).toContain(rule);
  });
});
