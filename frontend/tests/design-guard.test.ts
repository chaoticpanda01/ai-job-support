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
    /\b(?:text|bg|border(?:-[xytrblse])?|ring(?:-offset)?|shadow|caret|from|to|via|fill|stroke|divide|outline|placeholder|accent|decoration)-(?:red|green|blue|yellow|amber|orange|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|lime|gray|slate|zinc|neutral|stone)-\d{2,3}\b/,
  // An arrow, shape, symbol, dingbat, flag or emoji used as an icon or
  // decoration: × ← → ⏳ ▲ ▼ ✓ ✕ ⬅ ⭐ 🇯🇵 🏠 🤖 💬…
  glyph:
    /[\u00D7\u2190-\u21FF\u2300-\u23FF\u25A0-\u25FF\u2600-\u27BF\u2B00-\u2BFF\u{1F000}-\u{1FAFF}]/u,
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
  "app/dashboard/interview/[id]/page.tsx": {
    rules: ["h1"],
    reason: "A full-height chat screen: its compact header stands in for PageHeader.",
  },
};

/** Files the migration hasn't reached. Each area task deletes its own. */
const NOT_YET_MIGRATED: Record<string, string> = {};

/**
 * Translated strings that still carry an arrow or emoji. A glyph inside the
 * copy dodges the file scan above, so the strings are checked too: the page
 * draws the arrow as a lucide icon instead. Each area task deletes its own.
 */
const STRINGS_NOT_YET_MIGRATED: Record<string, string> = {};

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

/**
 * Comments may say anything: "→" in a note is not an icon. Walks the source
 * once, keeping every string and template literal (their text is what the
 * rules check, and a "//" or "/" + "*" inside one is not a comment) and
 * dropping line and block comments, including JSX's braced ones.
 */
function stripComments(source: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < source.length; i++) {
    const c = source[i] as string;
    const next = source[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i++;
      } else if (c === quote || (c === "\n" && quote !== "`")) {
        quote = null;
      }
    } else if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 1;
    } else {
      if (c === '"' || c === "'" || c === "`") quote = c;
      out += c;
    }
  }
  return out;
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
    expect(violations('<span>{open ? "▲" : "▼"}</span>')).toEqual(["glyph"]);
    expect(violations('<input type="text" />')).toEqual(["rawControl"]);
    expect(violations("<textarea rows={3} />")).toEqual(["rawControl"]);
    expect(violations("<h1>Title</h1>")).toEqual(["h1"]);
    expect(violations("<input {...getInputProps()} />")).toEqual([]);
    expect(violations("// a note → about text-red-500\n/* <h1> */")).toEqual([]);
    expect(violations('<a href="https://example.com">x</a>')).toEqual([]);
    // Flags, clock and arrow symbols, and the × sign are glyphs too.
    expect(violations("<p>Welcome! 🇯🇵</p>")).toEqual(["glyph"]);
    expect(violations("<span>⏳</span>")).toEqual(["glyph"]);
    expect(violations("<span>⬅ Back</span>")).toEqual(["glyph"]);
    expect(violations("<button>×</button>")).toEqual(["glyph"]);
    // Side borders, shadows and ring offsets carry palette colours too.
    expect(violations('<div className="border-t-blue-800" />')).toEqual(["palette"]);
    expect(violations('<div className="shadow-red-500/20" />')).toEqual(["palette"]);
    expect(violations('<div className="ring-offset-gray-100" />')).toEqual(["palette"]);
    // "/*" inside a string is not a comment: what follows is still scanned.
    expect(violations('<Dropzone accept="image/*" />\n<p className="text-red-600" />')).toEqual([
      "palette",
    ]);
    expect(violations("const url = 'https://x.test/a'; // note → here\n")).toEqual([]);
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

  it("has migrated everything except the pages spec 3 rebuilds", () => {
    // The end state of the page migration. Spec 3 (the job pipeline) rebuilds
    // these on the design system and removes the last entries.
    expect(Object.keys(NOT_YET_MIGRATED)).toEqual([]);
    expect(Object.keys(STRINGS_NOT_YET_MIGRATED)).toEqual([]);
  });

  it.each(Object.entries(ALLOWED))("%s still needs its exception", (file, { rules }) => {
    const found = violations(read(file));
    for (const rule of rules) expect(found).toContain(rule);
  });
});
